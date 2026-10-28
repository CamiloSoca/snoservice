import { NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/session';
import { getSupabaseServer, SHOP_UUID } from '@/lib/supabase-server';
import type { FixedMonthlyUseItem } from '@/lib/booking-store';
import {resolveManualServiceAnnotations} from '@/lib/manual-service-annotations';

// Cachea sólo la ausencia del RPC, nunca datos financieros. Un despliegue de
// la función se detecta nuevamente a los 60 segundos sin reiniciar el servidor.
let rpcUnavailableUntil = 0;

// Una sola petición HTTP para iniciar el panel. Todas las consultas a Supabase
// se ejecutan en paralelo, pero siempre detrás de la sesión de administrador.
export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json(
      { error: 'No autorizado.' },
      { status: 401, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }

  try {
    const supabase = getSupabaseServer();
    const startedAt = performance.now();

    // Un único viaje HTTP a Supabase devuelve una foto consistente del
    // administrador. La función SQL usa SECURITY INVOKER y solo service_role
    // puede ejecutarla. Esta ruta verifica la sesión antes del RPC.
    const rpcStart = performance.now();
    const fastResult = Date.now() >= rpcUnavailableUntil
      ? await supabase.rpc('admin_bootstrap_snapshot', {p_shop_id: SHOP_UUID})
      : null;
    const fastData = fastResult?.data;
    const fastError = fastResult?.error;
    if (fastError?.code === 'PGRST202') rpcUnavailableUntil = Date.now() + 60_000;
    const rpcDuration = performance.now() - rpcStart;
    if (!fastError && fastData &&
      Array.isArray(fastData.appointments) &&
      Array.isArray(fastData.services) &&
      Array.isArray(fastData.barbers) &&
      // No usar un snapshot rápido incompleto: si falta el horario del
      // barbero, el cliente lo interpreta como "heredar del local" y un
      // guardado posterior puede sobrescribir cambios previamente guardados.
      fastData.barbers.every((barber: unknown) =>
        barber !== null && typeof barber === 'object' &&
        Object.prototype.hasOwnProperty.call(barber, 'working_schedule')) &&
      Array.isArray(fastData.expenses) &&
      Array.isArray(fastData.tips) &&
      Array.isArray(fastData.manualCharges) &&
      Array.isArray(fastData.cashRegisters) &&
      fastData.shop) {
      const [uses, fixedBookings] = await Promise.all([
        supabase.from('fixed_monthly_uses')
          .select('fixed_booking_id,period_id,occurrence_date,completed_at')
          .eq('shop_id', SHOP_UUID),
        supabase.from('fixed_bookings').select('id,barber_id').eq('shop_id', SHOP_UUID),
      ]);
      if (uses.error || fixedBookings.error) {
        return NextResponse.json({error:'No se pudieron cargar los cortes de abono.'},
          {status:503,headers:{'Cache-Control':'private, no-store'}});
      }
      const fixedBookingRows=(fixedBookings.data||[]) as {id:string;barber_id:string}[];
      const barberByFixed = new Map(fixedBookingRows.map((fixed)=>[fixed.id,fixed.barber_id]));
      const fixedMonthlyUses=((uses.data||[]) as Omit<FixedMonthlyUseItem,'barber_id'>[]).map((use)=>({
        ...use,barber_id:barberByFixed.get(use.fixed_booking_id)||null,
      }));
      return NextResponse.json({
        ...fastData,
        manualCharges: await resolveManualServiceAnnotations(fastData.manualCharges, supabase),
        fixedMonthlyUses,
      }, {
        headers: {
          'Cache-Control': 'private, no-store',
          'Server-Timing': `database;dur=${(performance.now() - startedAt).toFixed(1)},rpc;dur=${rpcDuration.toFixed(1)}`,
        },
      });
    }

    // Mantener el fallback anterior durante el despliegue y ante una falla
    // del RPC: evita que el panel quede inaccesible por un desajuste de schema.
    if (fastResult) console.warn('RPC admin no disponible; usando consultas paralelas:', fastError?.code || 'invalid_response');
    // Medir cada consulta por separado sin exponer datos privados.
    // Server-Timing permite detectar la tabla lenta en DevTools.
    const durations: Record<string, number> = {};
    async function timed<T>(name: string, query: PromiseLike<T>): Promise<T> {
      const start = performance.now();
      try {
        return await query;
      } finally {
        durations[name] = performance.now() - start;
      }
    }

    const [
      appointments, services, barbers, expenses, tips, manualCharges, shop, cashRegisters,
      fixedMonthlyUses, fixedBookings,
    ] = await Promise.all([
      timed('appointments', supabase.from('appointments')
        .select('id,code,service_id,barber_id,date_string,time_slot,duration_minutes,status,created_at,client_name,client_phone,client_email,client_notes,price_snapshot,completed_at,commission_rate_snapshot,barber_earnings_snapshot,business_earnings_snapshot,completed_cash_register_id,services(name,price,duration_minutes),barbers(name)')
        .eq('shop_id', SHOP_UUID)
        .order('created_at', {ascending: false})),
      timed('services', supabase.from('services')
        .select('id,name,price,duration_minutes,description,image_url,active')
        .eq('shop_id', SHOP_UUID)),
      timed('barbers', supabase.from('barbers')
        // El PIN almacenado nunca debe enviarse al navegador.
        .select('id,slug,name,role,bio,specialties,service_ids,active,commission_rate,is_owner,image_url,working_schedule')
        .eq('shop_id', SHOP_UUID)),
      timed('expenses', supabase.from('expenses')
        .select('id,description,amount,category,expense_date,created_at')
        .eq('shop_id', SHOP_UUID)
        .order('expense_date', {ascending: false})),
      timed('tips', supabase.from('tips')
        .select('id,barber_id,amount,note,date_string,created_at,cash_register_id,created_by_role,created_by_barber_id,barbers(name)')
        .eq('shop_id', SHOP_UUID)
        .order('created_at', {ascending: false})),
      timed('charges', supabase.from('manual_charges')
        .select('id,barber_id,amount,note,date_string,created_at,commission_rate_snapshot,barber_earnings_snapshot,business_earnings_snapshot,cash_register_id,created_by_role,created_by_barber_id,service_id,service_name_snapshot,barbers(name)')
        .eq('shop_id', SHOP_UUID)
        .order('created_at', {ascending: false})),
      timed('shop', supabase.from('shops')
        .select('id,name,phone,address,city,logo_url,background_image_url,cover_image_url,schedule')
        .eq('id', SHOP_UUID)
        .maybeSingle()),
      timed('cash', supabase.from('cash_registers')
        .select('id,status,closed_at,opened_at')
        .eq('shop_id', SHOP_UUID)
        .order('opened_at', {ascending: false})
        .limit(1)),
      timed('monthlyUses',supabase.from('fixed_monthly_uses')
        .select('fixed_booking_id,period_id,occurrence_date,completed_at')
        .eq('shop_id',SHOP_UUID)),
      timed('fixedBookings',supabase.from('fixed_bookings').select('id,barber_id').eq('shop_id',SHOP_UUID)),
    ]);

    const totalDuration = performance.now() - startedAt;
    if (totalDuration > 1500) {
      console.warn('Admin bootstrap lento (ms):',
        Object.fromEntries(Object.entries(durations).map(([key, value]) =>
          [key, Math.round(value)])));
    }

    const errors = [
      ['turnos', appointments.error],
      ['servicios', services.error],
      ['barberos', barbers.error],
      ['gastos', expenses.error],
      ['propinas', tips.error],
      ['cobros', manualCharges.error],
      ['configuración', shop.error],
      ['caja', cashRegisters.error],
      ['cortes de abono',fixedMonthlyUses.error],
      ['agenda fija',fixedBookings.error],
    ] as const;
    const failed = errors.find(([, error]) => error);
    if (failed) {
      console.error('Error cargando panel de admin:', failed[0], failed[1]?.code);
      return NextResponse.json(
        { error: 'No se pudieron cargar los datos del panel administrativo.' },
        { status: 500, headers: { 'Cache-Control': 'private, no-store' } }
      );
    }

    return NextResponse.json(
      {
        appointments: appointments.data || [],
        services: services.data || [],
        barbers: barbers.data || [],
        expenses: expenses.data || [],
        tips: tips.data || [],
        manualCharges: await resolveManualServiceAnnotations(manualCharges.data || [], supabase),
        fixedMonthlyUses: ((fixedMonthlyUses.data||[]) as Omit<FixedMonthlyUseItem,'barber_id'>[]).map((use)=>({
          ...use,barber_id:((fixedBookings.data||[]) as {id:string;barber_id:string}[])
            .find((fixed)=>fixed.id===use.fixed_booking_id)?.barber_id||null,
        })),
        shop: shop.data,
        cashRegisters: cashRegisters.data || [],
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
          'Server-Timing': [
            `database;dur=${totalDuration.toFixed(1)}`,
            ...Object.entries(durations).map(([name, duration]) =>
              `${name};dur=${duration.toFixed(1)}`),
          ].join(', '),
        },
      }
    );
  } catch (error) {
    console.error('Error de inicialización del administrador:', error);
    return NextResponse.json(
      { error: 'No se pudo cargar el panel.' },
      { status: 500, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }
}
