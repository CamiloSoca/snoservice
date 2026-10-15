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

export async function POST(request: Request) {
  if (!verifyCsrfOrigin(request)) {
    return NextResponse.json({ error: 'Solicitud inválida (CSRF).' }, { status: 403 });
  }

  try {
    const { barberId, pin } = await request.json();
    if (!isValidUUID(barberId) || typeof pin !== 'string' || pin.trim().length === 0) {
      return NextResponse.json({ error: 'Datos de acceso inválidos.' }, { status: 400 });
    }

    const supabase = getSupabaseServer();
    const { data: barber, error } = await supabase
      .from('barbers')
      .select('id, name, pin, commission_rate, active')
      .eq('id', barberId)
      .eq('shop_id', SHOP_UUID)
      .maybeSingle();

    if (error || !barber || !barber.active) {
      return NextResponse.json({ error: 'Barbero no encontrado.' }, { status: 404 });
    }

    const expectedPin = String(barber.pin || '1234').trim();
    if (pin.trim() !== expectedPin) {
      return NextResponse.json(
        { error: `PIN incorrecto para ${barber.name}` },
        { status: 401 }
      );
    }

    // Emitir cookie firmada para este barbero por 12 horas
    const token = signSessionToken({
      role: 'barber',
      sub: barber.id,
      exp: Date.now() + 1000 * 60 * 60 * 12,
    });

    const { data: apts } = await supabase
      .from('appointments')
      .select('*, services(name, price, duration_minutes), barbers(name)')
      .eq('shop_id', SHOP_UUID)
      .eq('barber_id', barber.id)
      .order('created_at', { ascending: false });

    const mappedAppointments = (apts || []).map((apt) => ({
      id: apt.id,
      code: apt.code || '13C-0000',
      serviceId: apt.service_id,
      serviceName: apt.services?.name || 'Servicio',
      servicePrice: Number(apt.price_snapshot ?? apt.services?.price ?? 0),
      priceSnapshot: Number(apt.price_snapshot ?? 0),
      durationMinutes: Number(apt.duration_minutes ?? apt.services?.duration_minutes ?? 60),
      barberId: apt.barber_id,
      barberName: apt.barbers?.name || barber.name,
      dateString: apt.date_string,
      timeSlot: apt.time_slot,
      clientName: apt.client_name,
      clientPhone: apt.client_phone,
      clientNotes: apt.client_notes,
      status: apt.status || 'confirmado',
      createdAt: apt.created_at,
    }));

    const response = NextResponse.json({
      ok: true,
      commissionRate: Number(barber.commission_rate ?? 50),
      appointments: mappedAppointments,
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

    let query = supabase
      .from('appointments')
      .update({ status })
      .eq('id', id)
      .eq('shop_id', SHOP_UUID);

    // Si es un barbero (y no admin), solo puede cambiar estados de sus propios turnos
    if (!adminSession && barberSession) {
      query = query.eq('barber_id', barberSession.sub);
    }

    const { error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Error al actualizar turno.' }, { status: 500 });
  }
}