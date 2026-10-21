import { NextResponse } from 'next/server';
import { getSupabaseServer, SHOP_UUID } from '@/lib/supabase-server';
import { getBarberSession, requireAdminSession, verifyCsrfOrigin } from '@/lib/session';
import { isValidUUID, sanitizeInput } from '@/lib/booking-store';
import { requireOpenCash } from '@/lib/cash-guard';

type FinanceTable = 'tips' | 'manual_charges';
function tableOf(value: unknown): FinanceTable | null {
  return value === 'tips' || value === 'manual_charges' ? value : null;
}

async function authorize(barberId: string | null): Promise<{ admin: boolean; barberId: string | null } | null> {
  const [admin, barber] = await Promise.all([requireAdminSession(), getBarberSession()]);
  if (admin) return { admin: true, barberId };
  if (barber && (!barberId || barber.sub === barberId)) return { admin: false, barberId: barber.sub };
  return null;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const table = tableOf(params.get('resource'));
  if (!table) return NextResponse.json({error: 'Recurso inválido'}, {status: 400});
  const barberId = params.get('barberId');
  if (barberId && !isValidUUID(barberId)) return NextResponse.json({error: 'ID inválido'}, {status: 400});
  const session = await authorize(barberId);
  if (!session) return NextResponse.json({error: 'No autorizado'}, {status: 401});
  let query = getSupabaseServer().from(table).select(table === 'manual_charges'
    ? 'id,barber_id,amount,note,date_string,created_at,commission_rate_snapshot,barber_earnings_snapshot,business_earnings_snapshot,cash_register_id,barbers(name)'
    : 'id,barber_id,amount,note,date_string,created_at,barbers(name)').eq('shop_id', SHOP_UUID).order('created_at', {ascending: false});
  if (session.barberId) query = query.eq('barber_id', session.barberId);
  const {data, error} = await query;
  if (error) return NextResponse.json({error: 'No se pudo consultar el registro'}, {status: 500});
  return NextResponse.json({data: data || []});
}

export async function POST(request: Request) {
  if (!verifyCsrfOrigin(request)) return NextResponse.json({error: 'Origen inválido'}, {status: 403});
  const body = await request.json().catch(() => ({}));
  const table = tableOf(body.resource);
  if (!table) return NextResponse.json({error: 'Recurso inválido'}, {status: 400});
  const barberId = body.item?.barberId;
  if (!isValidUUID(barberId)) return NextResponse.json({error: 'Barbero inválido'}, {status: 400});
  const session = await authorize(barberId);
  if (!session) return NextResponse.json({error: 'No autorizado'}, {status: 401});
  const amount = Number(body.item?.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) return NextResponse.json({error: 'Monto inválido'}, {status: 400});
  const cashDenied = await requireOpenCash();
  if (cashDenied) return cashDenied;
  const supabase = getSupabaseServer();
  const {data: barber} = await supabase.from('barbers').select('id,active').eq('shop_id', SHOP_UUID).eq('id', barberId).maybeSingle();
  if (!barber || !barber.active) return NextResponse.json({error: 'Barbero no encontrado'}, {status: 404});
  const dateString = new Date().toLocaleDateString('es-UY', {day:'numeric', month:'short', timeZone:'America/Montevideo'});
  const {error} = await supabase.from(table).insert({
    shop_id: SHOP_UUID, barber_id: barberId,
    amount, note: sanitizeInput(String(body.item?.note || '')).slice(0,300),
    date_string: dateString,
  });
  if (error) return NextResponse.json({error: 'No se pudo registrar el movimiento'}, {status: 500});
  return NextResponse.json({ok: true});
}

export async function DELETE(request: Request) {
  if (!verifyCsrfOrigin(request)) return NextResponse.json({error: 'Origen inválido'}, {status: 403});
  const body = await request.json().catch(() => ({}));
  const table = tableOf(body.resource);
  if (!table || !isValidUUID(body.id)) return NextResponse.json({error: 'Solicitud inválida'}, {status: 400});
  const session = await authorize(null);
  if (!session) return NextResponse.json({error: 'No autorizado'}, {status: 401});
  const cashDenied = await requireOpenCash();
  if (cashDenied) return cashDenied;
  const supabase = getSupabaseServer();
  let query = supabase.from(table).delete().eq('shop_id', SHOP_UUID).eq('id', body.id);
  if (!session.admin) query = query.eq('barber_id', session.barberId!);
  const {data, error} = await query.select('id');
  if (error) return NextResponse.json({error: 'No se pudo eliminar el movimiento'}, {status: 500});
  if (!data?.length) return NextResponse.json({error:'Registro inexistente o sin permiso'}, {status: 404});
  return NextResponse.json({ok: true});
}
