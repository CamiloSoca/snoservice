import { NextResponse } from 'next/server';
import { getSupabaseServer, SHOP_UUID } from '@/lib/supabase-server';
import {appointmentTimeState} from '@/lib/appointment-rules';

export async function POST(request: Request) {
  const input = await request.json().catch(() => ({}));
  const code = String(input.code || '').trim().toUpperCase();
  const email = String(input.email || '').trim().toLowerCase();
  if (code.length < 5 || code.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({error: 'Código o correo inválido.'}, {status: 400});
  }
  const db = getSupabaseServer();
  const {data: appointment, error: lookupError} = await db.from('appointments')
    .select('id,status,date_string,time_slot,created_at')
    .eq('shop_id', SHOP_UUID).eq('code', code).eq('client_email', email)
    .maybeSingle();
  if (lookupError || !appointment || appointment.status === 'cancelado') {
    return NextResponse.json({error: 'No se encontró una reserva activa con esos datos.'}, {status: 404});
  }
  if (appointment.status === 'completado') {
    // No revertir facturación de turnos completados mediante cancelación pública.
    return NextResponse.json({error: 'Un turno ya completado no se puede cancelar desde la web.'}, {status: 409});
  }
  if (appointment.status !== 'confirmado' || appointmentTimeState({
    dateString: appointment.date_string,
    timeSlot: appointment.time_slot,
    createdAt: appointment.created_at,
  }) !== 'future') {
    return NextResponse.json({error: 'El horario del turno ya comenzó o pasó; no se puede cancelar.'}, {status: 409});
  }
  const {data, error} = await db.from('appointments')
    .update({status: 'cancelado'})
    .eq('id', appointment.id).eq('shop_id', SHOP_UUID).eq('status', 'confirmado')
    .select('id');
  if (error || !data?.length) return NextResponse.json({error: 'No se pudo cancelar el turno.'}, {status: 409});
  return NextResponse.json({ok: true});
}
