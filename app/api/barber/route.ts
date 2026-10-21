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
    // Consultas independientes: comprobar perfil y límites de PIN a la vez.
    // Conservamos el mismo bloqueo y la auditoría de intentos fallidos.
    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const [barberLookup, attemptsLookup] = await Promise.all([
      supabase.from('barbers')
        .select('id,name,pin,commission_rate,active')
        .eq('id', barberId)
        .eq('shop_id', SHOP_UUID)
        .maybeSingle(),
      supabase.from('audit_logs')
        .select('id', {count: 'exact', head: true})
        .eq('shop_id', SHOP_UUID)
        .eq('action', 'PIN_FAILED')
        .eq('details', barberId)
        .gte('created_at', cutoff),
    ]);
    const {data: barber, error} = barberLookup;
    if (error || !barber || !barber.active) {
      return NextResponse.json({error: 'Barbero no encontrado.'}, {status: 404});
    }
    if (attemptsLookup.error) {
      return NextResponse.json({error: 'No se pudo verificar el límite de intentos.'}, {status: 503});
    }
    if ((attemptsLookup.count ?? 0) >= 5) {
      return NextResponse.json({error: 'Demasiados intentos. Intentá nuevamente en 15 minutos.'}, {status: 429});
    }

    const expectedPin = String(barber.pin || '').trim();
    if (!expectedPin || expectedPin === '1234') {
      return NextResponse.json({error: 'El barbero debe configurar un PIN nuevo.'}, {status: 403});
    }
    if (pin.trim() !== expectedPin) {
      const {error: logError} = await supabase.from('audit_logs').insert({
        shop_id: SHOP_UUID,
        action: 'PIN_FAILED',
        details: barberId,
      });
      if (logError) {
        return NextResponse.json({error: 'No se pudo verificar el PIN de forma segura.'}, {status: 503});
      }
      return NextResponse.json({error: 'PIN incorrecto.'}, {status: 401});
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
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Error verificando el PIN.' },
      { status: 500 }
    );
  }
}

export async function GET() {
  const [admin, staff] = await Promise.all([requireAdminSession(), getBarberSession()]);
  if (!admin && !staff) return NextResponse.json({error: 'No autorizado'}, {status: 401});
  const supabase = getSupabaseServer();
  let query = supabase.from('appointments')
    .select('id,code,service_id,barber_id,date_string,time_slot,duration_minutes,client_name,client_phone,client_email,client_notes,price_snapshot,status,created_at,services(name,price,duration_minutes),barbers(name)')
    .eq('shop_id', SHOP_UUID).order('created_at', {ascending: false});
  if (!admin && staff) query = query.eq('barber_id', staff.sub);
  const {data, error} = await query;
  if (error) return NextResponse.json({error: 'No se pudo cargar la agenda'}, {status: 500});
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
  }));
  return NextResponse.json({appointments});
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

    const { id, status } = await request.json();
    if (!isValidUUID(id) || !['confirmado', 'completado', 'cancelado'].includes(status)) {
      return NextResponse.json({ error: 'Parámetros inválidos.' }, { status: 400 });
    }

    const supabase = getSupabaseServer();

    // Verificar también el estado anterior: revertir un turno completado
    // modifica la facturación, no solo marcarlo como completado.
    let lookup = supabase.from('appointments')
      .select('status').eq('id', id).eq('shop_id', SHOP_UUID);
    if (!adminSession && barberSession) {
      lookup = lookup.eq('barber_id', barberSession.sub);
    }
    const {data: current, error: lookupError} = await lookup.maybeSingle();
    if (lookupError) return NextResponse.json({error: 'No se pudo consultar el turno.'}, {status: 500});
    if (!current) return NextResponse.json({error: 'Turno inexistente o sin permiso.'}, {status: 404});

    if (status !== current.status && (status === 'completado' || current.status === 'completado')) {
      const cashDenied = await requireOpenCash();
      if (cashDenied) return cashDenied;
    }

    let query = supabase
      .from('appointments')
      .update({ status })
      .eq('id', id)
      .eq('shop_id', SHOP_UUID);

    if (!adminSession && barberSession) {
      query = query.eq('barber_id', barberSession.sub);
    }

    const { error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Error al actualizar turno.' },
      { status: 500 }
    );
  }
}