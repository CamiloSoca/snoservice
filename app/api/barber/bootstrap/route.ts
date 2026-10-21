import { NextResponse } from 'next/server';
import { getBarberSession } from '@/lib/session';
import { getSupabaseServer, SHOP_UUID } from '@/lib/supabase-server';

// La sesión ya fue validada por el POST del PIN. Un solo viaje HTTP trae
// turnos, movimientos y estado de caja, con consultas SQL paralelas.
export async function GET() {
  const session = await getBarberSession();
  const headers = {'Cache-Control': 'private, no-store'};
  if (!session) {
    return NextResponse.json({error: 'No autorizado'}, {status: 401, headers});
  }

  try {
    const db = getSupabaseServer();
    const startedAt = performance.now();
    const durations: Record<string, number> = {};
    async function timed<T>(name: string, query: PromiseLike<T>): Promise<T> {
      const start = performance.now();
      try {
        return await query;
      } finally {
        durations[name] = performance.now() - start;
      }
    }

    // La cookie firmada se verificó arriba. El RPC recibe SIEMPRE el ID
    // de barbero de la sesión, no del cliente.
    const rpcStart = performance.now();
    const {data: fastData, error: fastError} = await db.rpc(
      'barber_bootstrap_snapshot',
      {p_shop_id: SHOP_UUID, p_barber_id: session.sub}
    );
    durations.rpc = performance.now() - rpcStart;

    type RowResult = {data: any; error: {code?: string} | null};
    let results: RowResult[];
    if (!fastError && fastData &&
      Array.isArray(fastData.appointments) &&
      Array.isArray(fastData.tips) &&
      Array.isArray(fastData.charges) &&
      Array.isArray(fastData.cash)) {
      results = [
        {data: fastData.barber, error: null},
        {data: fastData.appointments, error: null},
        {data: fastData.tips, error: null},
        {data: fastData.charges, error: null},
        {data: fastData.cash, error: null},
      ];
    } else {
      // Fall back to previous implementation if schema cache or RPC fails.
      console.warn('RPC de barbero no disponible:', fastError?.code || 'invalid_response');
      results = await Promise.all([
        timed('barber', db.from('barbers')
          .select('id,name,active,commission_rate')
          .eq('shop_id', SHOP_UUID).eq('id', session.sub).maybeSingle()),
        timed('appointments', db.from('appointments')
          .select('id,code,service_id,barber_id,date_string,time_slot,duration_minutes,client_name,client_phone,client_email,client_notes,price_snapshot,status,created_at,services(name,price,duration_minutes),barbers(name)')
          .eq('shop_id', SHOP_UUID).eq('barber_id', session.sub)
          .order('created_at', {ascending: false})),
        timed('tips', db.from('tips')
          .select('id,barber_id,amount,note,date_string,created_at')
          .eq('shop_id', SHOP_UUID).eq('barber_id', session.sub)
          .order('created_at', {ascending: false})),
        timed('charges', db.from('manual_charges')
          .select('id,barber_id,amount,note,date_string,created_at')
          .eq('shop_id', SHOP_UUID).eq('barber_id', session.sub)
          .order('created_at', {ascending: false})),
        timed('cash', db.from('cash_registers')
          .select('id').eq('shop_id', SHOP_UUID).eq('status', 'abierta')
          .limit(2)),
      ]);
    }

    const [barber, appointments, tips, charges, cash] = results;
    const totalDuration = performance.now() - startedAt;
    if (totalDuration > 1500) {
      console.warn('Barber bootstrap lento (ms):',
        Object.fromEntries(Object.entries(durations).map(([key, value]) =>
          [key, Math.round(value)])));
    }

    if (barber.error || !barber.data || !barber.data.active) {
      return NextResponse.json({error: 'Acceso del barbero no disponible.'}, {status: 403, headers});
    }
    // Conservar un perfil validado que TypeScript pueda usar también
    // dentro de los callbacks de mapeo.
    const activeBarber = barber.data;
    if (appointments.error || tips.error || charges.error || cash.error) {
      console.error('Error cargando portal de barbero:', {
        appointments: appointments.error?.code,
        tips: tips.error?.code,
        charges: charges.error?.code,
        cash: cash.error?.code,
      });
      return NextResponse.json({error: 'No se pudieron cargar los datos del barbero.'}, {status: 503, headers});
    }
    if ((cash.data?.length || 0) > 1) {
      return NextResponse.json({error: 'Hay más de una caja abierta. Consultá al administrador.'}, {status: 409, headers});
    }

    const appointmentsMapped = (appointments.data || []).map((apt) => ({
      id: apt.id,
      code: apt.code || '',
      serviceId: apt.service_id,
      serviceName: (Array.isArray(apt.services) ? apt.services[0] : apt.services)?.name || 'Servicio',
      servicePrice: Number(apt.price_snapshot ?? (Array.isArray(apt.services) ? apt.services[0] : apt.services)?.price ?? 0),
      priceSnapshot: Number(apt.price_snapshot ?? 0),
      durationMinutes: Number(apt.duration_minutes ?? (Array.isArray(apt.services) ? apt.services[0] : apt.services)?.duration_minutes ?? 60),
      barberId: apt.barber_id,
      barberName: (Array.isArray(apt.barbers) ? apt.barbers[0] : apt.barbers)?.name || activeBarber.name,
      dateString: apt.date_string,
      timeSlot: apt.time_slot,
      clientName: apt.client_name,
      clientPhone: apt.client_phone || '',
      clientEmail: apt.client_email || '',
      clientNotes: apt.client_notes || '',
      status: apt.status || 'confirmado',
      createdAt: apt.created_at,
    }));

    const mapEntry = (item: {
      id: string;
      barber_id: string;
      amount: number;
      note: string | null;
      date_string: string;
      created_at: string;
    }) => ({
      id: item.id,
      barberId: item.barber_id,
      barberName: activeBarber.name,
      amount: Number(item.amount) || 0,
      note: item.note || '',
      dateString: item.date_string || '',
      createdAt: item.created_at,
    });

    return NextResponse.json(
      {
        appointments: appointmentsMapped,
        tips: (tips.data || []).map(mapEntry),
        manualCharges: (charges.data || []).map(mapEntry),
        cashOpen: cash.data?.length === 1,
        commissionRate: Number(activeBarber.commission_rate ?? 50),
      },
      {
        headers: {
          ...headers,
          'Server-Timing': [
            `db;dur=${totalDuration.toFixed(1)}`,
            ...Object.entries(durations).map(([name, duration]) =>
              `${name};dur=${duration.toFixed(1)}`),
          ].join(', '),
        },
      }
    );
  } catch {
    return NextResponse.json({error: 'Error cargando los datos del barbero.'}, {status: 500, headers});
  }
}
