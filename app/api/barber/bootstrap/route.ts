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
    const [barber, appointments, tips, charges, cash] = await Promise.all([
      db.from('barbers')
        .select('id,name,active,commission_rate')
        .eq('shop_id', SHOP_UUID)
        .eq('id', session.sub)
        .maybeSingle(),
      db.from('appointments')
        .select('id,code,service_id,barber_id,date_string,time_slot,duration_minutes,client_name,client_phone,client_email,client_notes,price_snapshot,status,created_at,services(name,price,duration_minutes),barbers(name)')
        .eq('shop_id', SHOP_UUID)
        .eq('barber_id', session.sub)
        .order('created_at', {ascending: false}),
      db.from('tips')
        .select('id,barber_id,amount,note,date_string,created_at')
        .eq('shop_id', SHOP_UUID)
        .eq('barber_id', session.sub)
        .order('created_at', {ascending: false}),
      db.from('manual_charges')
        .select('id,barber_id,amount,note,date_string,created_at')
        .eq('shop_id', SHOP_UUID)
        .eq('barber_id', session.sub)
        .order('created_at', {ascending: false}),
      db.from('cash_registers')
        .select('id')
        .eq('shop_id', SHOP_UUID)
        .eq('status', 'abierta')
        .limit(2),
    ]);

    if (barber.error || !barber.data || !barber.data.active) {
      return NextResponse.json({error: 'Acceso del barbero no disponible.'}, {status: 403, headers});
    }
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
      barberName: (Array.isArray(apt.barbers) ? apt.barbers[0] : apt.barbers)?.name || barber.data.name,
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
      barberName: barber.data.name,
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
        commissionRate: Number(barber.data.commission_rate ?? 50),
      },
      {
        headers: {
          ...headers,
          'Server-Timing': `db;dur=${(performance.now() - startedAt).toFixed(1)}`,
        },
      }
    );
  } catch {
    return NextResponse.json({error: 'Error cargando los datos del barbero.'}, {status: 500, headers});
  }
}
