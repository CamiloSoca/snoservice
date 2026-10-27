// app/api/barber/route.ts
import { NextResponse } from 'next/server';
import { getSupabaseServer, SHOP_UUID } from '@/lib/supabase-server';
import {
  BARBER_COOKIE_NAME,
  getBarberSession,
  requireAdminSession,
  signSessionToken,
  verifyCsrfOrigin,
} from '@/lib/session';
import { isValidUUID } from '@/lib/booking-store';
import { requireOpenCash } from '@/lib/cash-guard';
import {appointmentTimeState} from '@/lib/appointment-rules';
import {isOnSitePaymentMethod} from '@/lib/payment-method';
import {sendBookingCancellationNotice} from '@/lib/server-booking-cancellation';

export async function POST(request: Request) {
  if (!verifyCsrfOrigin(request)) {
    return NextResponse.json({ error: 'Solicitud inválida (CSRF).' }, { status: 403 });
  }

  try {
    const { barberId, pin } = await request.json();
    if (!isValidUUID(barberId) || typeof pin !== 'string' || !/^\d{4,6}$/.test(pin.trim())) {
      return NextResponse.json({ error: 'Datos de acceso inválidos.' }, { status: 400 });
    }

    const supabase = getSupabaseServer();
    // La comprobación y el bloqueo por intentos se ejecutan atómicamente
    // en PostgreSQL. Nunca traer PIN (ni su hash) al servidor Next.js.
    const [barberLookup, verification] = await Promise.all([
      supabase.from('barbers')
        .select('id,name,commission_rate,active')
        .eq('id', barberId)
        .eq('shop_id', SHOP_UUID)
        .maybeSingle(),
      supabase.rpc('verify_barber_pin_login', {
        p_shop_id: SHOP_UUID,
        p_barber_id: barberId,
        p_pin: pin.trim(),
      }),
    ]);
    const {data: barber, error} = barberLookup;
    if (error || !barber || !barber.active) {
      return NextResponse.json({error: 'Credenciales inválidas.'}, {status: 401});
    }
    if (verification.error) {
      return NextResponse.json({error: 'No se pudo validar el acceso.'}, {status: 503});
    }
    if (verification.data === 'blocked') {
      return NextResponse.json({error: 'Demasiados intentos. Intentá nuevamente en 15 minutos.'}, {status: 429});
    }
    if (verification.data !== 'ok') {
      return NextResponse.json({error: 'Credenciales inválidas.'}, {status: 401});
    }

    const token = signSessionToken({
      role: 'barber',
      sub: barber.id,
      exp: Date.now() + 1000 * 60 * 60 * 12,
    });

    // La autenticación termina acá. La agenda y las finanzas se cargan
    // mediante /api/barber/bootstrap luego de recibir la cookie segura.
    const response = NextResponse.json({
      ok: true,
      commissionRate: Number(barber.commission_rate ?? 50),
    });

    response.cookies.set(BARBER_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 12,
    });

    return response;
  } catch {
    // No exponer errores internos o detalles de credenciales al visitante.
    return NextResponse.json(
      { error: 'No se pudo verificar el acceso. Intentá nuevamente.' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const barberView = new URL(request.url).searchParams.get('scope') === 'barber';
  const [admin, staff] = await Promise.all([requireAdminSession(), getBarberSession()]);
  // La agenda personal no hereda privilegios de una cookie de admin simultánea.
  if (barberView && !staff) return NextResponse.json({error: 'Sesión de barbero requerida'}, {status: 403});
  if (!admin && !staff) return NextResponse.json({error: 'No autorizado'}, {status: 401});
  const supabase = getSupabaseServer();
  let query = supabase.from('appointments')
    .select('id,code,service_id,barber_id,date_string,time_slot,duration_minutes,client_name,client_phone,client_email,client_notes,price_snapshot,status,created_at,completed_at,commission_rate_snapshot,barber_earnings_snapshot,business_earnings_snapshot,completed_cash_register_id,services(name,price,duration_minutes),barbers(name)')
    .eq('shop_id', SHOP_UUID).order('created_at', {ascending: false});
  if (barberView || (!admin && staff)) query = query.eq('barber_id', staff!.sub);
  const [appointmentsResult, cashResult] = await Promise.all([
    query,
    supabase.from('cash_registers').select('id').eq('shop_id', SHOP_UUID)
      .eq('status', 'abierta').limit(1),
  ]);
  const {data, error} = appointmentsResult;
  if (error || cashResult.error) {
    return NextResponse.json({error: 'No se pudo cargar la agenda'}, {
      status: 503, headers: {'Cache-Control': 'private, no-store'},
    });
  }
  const appointments = (data || []).map((apt: any) => ({
    id: apt.id, code: apt.code || '',
    serviceId: apt.service_id, serviceName: apt.services?.name || 'Servicio',
    servicePrice: Number(apt.price_snapshot ?? apt.services?.price ?? 0),
    priceSnapshot: Number(apt.price_snapshot ?? 0),
    durationMinutes: Number(apt.duration_minutes ?? apt.services?.duration_minutes ?? 60),
    barberId: apt.barber_id, barberName: apt.barbers?.name || '',
    dateString: apt.date_string, timeSlot: apt.time_slot,
    clientName: apt.client_name, clientPhone: apt.client_phone,
    clientEmail: apt.client_email || '', clientNotes: apt.client_notes || '',
    status: apt.status, createdAt: apt.created_at,
    completedAt: apt.completed_at,
    commissionRateSnapshot: apt.commission_rate_snapshot == null ? null : Number(apt.commission_rate_snapshot),
    barberEarningsSnapshot: apt.barber_earnings_snapshot == null ? null : Number(apt.barber_earnings_snapshot),
    businessEarningsSnapshot: apt.business_earnings_snapshot == null ? null : Number(apt.business_earnings_snapshot),
    completedCashRegisterId: apt.completed_cash_register_id ?? null,
  }));
  return NextResponse.json({appointments, cashOpen: (cashResult.data?.length || 0) > 0}, {
    headers: {'Cache-Control': 'private, no-store'},
  });
}

export async function PATCH(request: Request) {
  if (!verifyCsrfOrigin(request)) {
    return NextResponse.json({ error: 'Solicitud inválida (CSRF).' }, { status: 403 });
  }

  try {
    const [adminSession, barberSession] = await Promise.all([
      requireAdminSession(),
      getBarberSession(),
    ]);

    if (!adminSession && !barberSession) {
      return NextResponse.json({ error: 'Sesión requerida.' }, { status: 401 });
    }

    const { id, status, paymentMethod } = await request.json();
    if (!isValidUUID(id) || !['completado', 'cancelado'].includes(status)) {
      return NextResponse.json({ error: 'Parámetros inválidos.' }, { status: 400 });
    }

    if (status === 'completado' && !isOnSitePaymentMethod(paymentMethod)) {
      return NextResponse.json({error: 'Seleccioná efectivo o transferencia para confirmar el cobro en el local.'}, {status: 422});
    }
    const supabase = getSupabaseServer();

    // Verificar también el estado anterior: revertir un turno completado
    // modifica la facturación, no solo marcarlo como completado.
    let lookup = supabase.from('appointments')
      .select('status,date_string,time_slot,created_at,client_name,client_email,code,services(name),barbers(name)')
      .eq('id', id).eq('shop_id', SHOP_UUID);
    if (!adminSession && barberSession) {
      lookup = lookup.eq('barber_id', barberSession.sub);
    }
    const {data: current, error: lookupError} = await lookup.maybeSingle();
    if (lookupError) return NextResponse.json({error: 'No se pudo consultar el turno.'}, {status: 500});
    if (!current) return NextResponse.json({error: 'Turno inexistente o sin permiso.'}, {status: 404});
    if (current.status !== 'confirmado') {
      return NextResponse.json({error: 'Solo se puede modificar un turno confirmado una vez.'}, {status: 409});
    }

    const timeState = appointmentTimeState({
      dateString: current.date_string, timeSlot: current.time_slot,
      createdAt: current.created_at,
    });
    if (status === 'cancelado' && timeState !== 'future') {
      return NextResponse.json({error: 'El horario ya comenzó o pasó; no se puede cancelar.'}, {status: 409});
    }
    if (status === 'completado' && timeState !== 'started') {
      return NextResponse.json({error: 'No se puede completar un turno futuro o con fecha inválida.'}, {status: 409});
    }

    if (status === 'completado') {
      const cashDenied = await requireOpenCash();
      if (cashDenied) return cashDenied;
    }

    let query = supabase
      .from('appointments')
      .update(status === 'completado' ? {status, payment_method: paymentMethod} : {status})
      .eq('id', id)
      .eq('shop_id', SHOP_UUID)
      .eq('status', 'confirmado');

    if (!adminSession && barberSession) {
      query = query.eq('barber_id', barberSession.sub);
    }

    const { data, error } = await query
      .select('id,status,payment_method,completed_at,commission_rate_snapshot,barber_earnings_snapshot,business_earnings_snapshot,completed_cash_register_id')
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!data) return NextResponse.json({error: 'El turno cambió de estado o ya no está disponible.'}, {status: 409});

    // Esta sección corre sólo luego de una transición confirmada por PostgreSQL.
    // El update condicional e inmutable evita notificar dos veces ante doble clic.
    // Una falla SMTP no revierte el turno ni vuelve a ocupar el horario.
    let cancellationEmailStatus: string | undefined;
    if (status === 'cancelado') {
      const booked = current as typeof current & {
        services?: {name?: string} | {name?: string}[] | null;
        barbers?: {name?: string} | {name?: string}[] | null;
      };
      const service = Array.isArray(booked.services) ? booked.services[0] : booked.services;
      const barber = Array.isArray(booked.barbers) ? booked.barbers[0] : booked.barbers;
      try {
        cancellationEmailStatus = await sendBookingCancellationNotice({
          appointmentId: data.id,
          clientEmail: current.client_email,
          clientName: current.client_name || 'Cliente',
          barberName: barber?.name || 'Tu barbero',
          serviceName: service?.name || 'Servicio',
          dateString: current.date_string,
          timeSlot: current.time_slot,
          code: current.code || '',
          cancelledBy: adminSession ? 'admin' : 'barber',
        });
      } catch {
        cancellationEmailStatus = 'failed';
        console.error('El turno se canceló, pero el aviso por correo no pudo procesarse.');
      }
    }

    return NextResponse.json({
      ...(cancellationEmailStatus ? {cancellationEmailStatus} : {}),
      ok: true,
      appointment: {
        id: data.id,
        status: data.status,
        paymentMethod: data.payment_method === 'transfer' ? 'transfer' : 'cash',
        completedAt: data.completed_at ?? null,
        commissionRateSnapshot: data.commission_rate_snapshot == null ? null : Number(data.commission_rate_snapshot),
        barberEarningsSnapshot: data.barber_earnings_snapshot == null ? null : Number(data.barber_earnings_snapshot),
        businessEarningsSnapshot: data.business_earnings_snapshot == null ? null : Number(data.business_earnings_snapshot),
        completedCashRegisterId: data.completed_cash_register_id ?? null,
      },
    });
  } catch {
    // Los errores internos no deben filtrarse por una ruta privada.
    return NextResponse.json(
      { error: 'No se pudo actualizar el turno. Intentá nuevamente.' },
      { status: 500 }
    );
  }
}
