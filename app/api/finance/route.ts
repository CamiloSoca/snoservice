import { NextResponse } from 'next/server';
import { getSupabaseServer, SHOP_UUID } from '@/lib/supabase-server';
import { getBarberSession, requireAdminSession, verifyCsrfOrigin } from '@/lib/session';
import { isValidUUID, sanitizeInput } from '@/lib/booking-store';
import { requireOpenCash } from '@/lib/cash-guard';
import {isOnSitePaymentMethod} from '@/lib/payment-method';
import {resolveManualServiceAnnotations} from '@/lib/manual-service-annotations';

type FinanceTable = 'tips' | 'manual_charges';
function tableOf(value: unknown): FinanceTable | null {
  return value === 'tips' || value === 'manual_charges' ? value : null;
}

// Forzar identidad de barbero para el panel individual aunque exista cookie de administrador.
async function authorize(barberId: string | null, barberScope: boolean = false):
  Promise<{admin: boolean; barberId: string | null} | null> {
  const [admin, barber] = await Promise.all([requireAdminSession(), getBarberSession()]);
  if (barberScope) {
    if (!barber || (barberId && barber.sub !== barberId)) return null;
    return {admin: false, barberId: barber.sub};
  }
  if (admin) return {admin: true, barberId};
  if (barber && (!barberId || barber.sub === barberId)) return {admin: false, barberId: barber.sub};
  return null;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const table = tableOf(params.get('resource'));
  if (!table) return NextResponse.json({error: 'Recurso inválido'}, {status: 400});
  const barberId = params.get('barberId');
  if (barberId && !isValidUUID(barberId)) return NextResponse.json({error: 'ID inválido'}, {status: 400});
  const session = await authorize(barberId, params.get('scope') === 'barber');
  if (!session) return NextResponse.json({error: 'No autorizado'}, {status: 401});
  let query = getSupabaseServer().from(table).select(table === 'manual_charges'
    ? 'id,barber_id,amount,note,date_string,payment_method,created_at,commission_rate_snapshot,barber_earnings_snapshot,business_earnings_snapshot,cash_register_id,created_by_role,created_by_barber_id,service_id,service_name_snapshot,barbers(name)'
    : 'id,barber_id,amount,note,date_string,payment_method,created_at,barbers(name)').eq('shop_id', SHOP_UUID).order('created_at', {ascending: false});
  if (session.barberId) query = query.eq('barber_id', session.barberId);
  const {data, error} = await query;
  if (error) return NextResponse.json({error: 'No se pudo consultar el registro'}, {status: 500});
  try {
    return NextResponse.json({data: table === 'manual_charges'
      ? await resolveManualServiceAnnotations(data || [], getSupabaseServer()) : data || []});
  } catch {
    return NextResponse.json({error:'No se pudo completar la clasificación de servicios manuales.'}, {status:503});
  }
}

export async function POST(request: Request) {
  if (!verifyCsrfOrigin(request)) return NextResponse.json({error: 'Origen inválido'}, {status: 403});
  const body = await request.json().catch(() => ({}));
  const table = tableOf(body.resource);
  if (!table) return NextResponse.json({error: 'Recurso inválido'}, {status: 400});
  const barberId = body.item?.barberId;
  if (!isValidUUID(barberId)) return NextResponse.json({error: 'Barbero inválido'}, {status: 400});
  const requestId = body.item?.requestId;
  if (!isValidUUID(requestId)) return NextResponse.json({error: 'Identificador de operación inválido'}, {status: 400});
  const session = await authorize(barberId, body.scope === 'barber');
  if (!session) return NextResponse.json({error: 'No autorizado'}, {status: 401});
  const paymentMethod=body.item?.paymentMethod;
  if(!isOnSitePaymentMethod(paymentMethod)) {
    return NextResponse.json({error:'Indicá efectivo o transferencia.'},{status:422});
  }
  const amount = Number(body.item?.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) return NextResponse.json({error: 'Monto inválido'}, {status: 400});
  const cashDenied = await requireOpenCash();
  if (cashDenied) return cashDenied;
  const supabase = getSupabaseServer();
  const {data: barber} = await supabase.from('barbers').select('id,active,commission_rate,is_owner').eq('shop_id', SHOP_UUID).eq('id', barberId).maybeSingle();
  if (!barber || !barber.active) return NextResponse.json({error: 'Barbero no encontrado'}, {status: 404});
  const {data:register,error:cashError}=await supabase.from('cash_registers').select('id')
    .eq('shop_id',SHOP_UUID).eq('status','abierta').limit(1);
  if(cashError||!register?.length)return NextResponse.json({error:'La caja no está abierta.'},{status:409});
  const dateString = new Date().toLocaleDateString('es-UY', {day:'numeric', month:'short', timeZone:'America/Montevideo'});
  const note = sanitizeInput(String(body.item?.note || '')).slice(0,300);
  // Barba sola nunca aparece en el catálogo de reservas y cuesta $200.
  let serviceId: string | null = null;
  let serviceNameSnapshot: string | null = null;
  if (table === 'manual_charges') {
    if (body.item?.manualServiceType === 'barba_local') {
      if (amount !== 200 || body.item?.serviceId) {
        return NextResponse.json({error:'La barba sin reserva tiene precio fijo de $200.'},{status:422});
      }
      serviceNameSnapshot = 'Barba';
    } else if (body.item?.serviceId != null) {
      if (!isValidUUID(body.item.serviceId)) {
        return NextResponse.json({error:'Servicio inválido.'},{status:422});
      }
      const {data: service, error: serviceError} = await supabase.from('services')
        .select('id,name,active').eq('shop_id',SHOP_UUID).eq('id',body.item.serviceId).maybeSingle();
      if (serviceError || !service || !service.active) {
        return NextResponse.json({error:'El servicio no está disponible.'},{status:422});
      }
      serviceId = service.id;
      serviceNameSnapshot = service.name;
    } else if (body.item?.manualServiceType != null) {
      return NextResponse.json({error:'Tipo de servicio inválido.'},{status:422});
    }
  }
  // Snapshot de la comisión también para los cortes manuales; no recalcularla con futuras tarifas.
  const rate=barber.is_owner?0:Math.min(100,Math.max(0,Number(barber.commission_rate)||0));
  const barberShare=Math.round(amount*rate)/100;
  const common={id:requestId,shop_id:SHOP_UUID,barber_id:barberId,amount,note,
    date_string:dateString,cash_register_id:register[0].id,payment_method:paymentMethod};
  const {error}=table==='manual_charges'
    ? await supabase.from('manual_charges').insert({
      ...common,commission_rate_snapshot:rate,barber_earnings_snapshot:barberShare,
      business_earnings_snapshot:Math.round((amount-barberShare)*100)/100,
      // Autoria derivada de cookie firmada, no de datos del cliente.
      created_by_role:session.admin?'admin':'barber',
      created_by_barber_id:session.admin?null:session.barberId,
      service_id:serviceId,service_name_snapshot:serviceNameSnapshot,
    })
    : await supabase.from('tips').insert(common);
  if (error?.code === '23505') {
    const {data: prior, error: lookupError} = await supabase.from(table)
      .select('id,barber_id,amount,note,payment_method,service_id,service_name_snapshot')
      .eq('shop_id', SHOP_UUID).eq('id', requestId).maybeSingle();
    if (!lookupError && prior && prior.barber_id === barberId &&
        Number(prior.amount) === amount && (prior.note || '') === note &&
        prior.payment_method===paymentMethod &&
        (table !== 'manual_charges' || (prior.service_id ?? null) === serviceId) &&
        (table !== 'manual_charges' || (prior.service_name_snapshot ?? null) === serviceNameSnapshot)) {
      return NextResponse.json({ok: true, id: requestId, repeated: true});
    }
    return NextResponse.json({error: 'El identificador ya pertenece a otro movimiento.'}, {status: 409});
  }
  if (error) return NextResponse.json({error: 'No se pudo registrar el movimiento'}, {status: 500});
  return NextResponse.json({ok: true, id: requestId});
}

export async function DELETE(request: Request) {
  if (!verifyCsrfOrigin(request)) return NextResponse.json({error: 'Origen inválido'}, {status: 403});
  const body = await request.json().catch(() => ({}));
  const table = tableOf(body.resource);
  if (!table || !isValidUUID(body.id)) return NextResponse.json({error: 'Solicitud inválida'}, {status: 400});
  const session = await authorize(null, body.scope === 'barber');
  if (!session) return NextResponse.json({error: 'No autorizado'}, {status: 401});
  const cashDenied = await requireOpenCash();
  if (cashDenied) return cashDenied;
  const supabase = getSupabaseServer();
  // Una liquidación ya abonada nunca puede quedar sin respaldo por eliminar ventas o propinas.
  const {data:item,error:itemError}=await supabase.from(table).select('barber_id')
    .eq('shop_id',SHOP_UUID).eq('id',body.id).maybeSingle();
  if(itemError||!item)return NextResponse.json({error:'Movimiento inexistente.'},{status:404});
  if(!session.admin && item.barber_id !== session.barberId) return NextResponse.json({error:'Registro inexistente o sin permiso'},{status:404});
  const {count:payoutCount,error:payoutError}=await supabase.from('barber_payouts')
    .select('id',{count:'exact',head:true}).eq('shop_id',SHOP_UUID).eq('barber_id',item.barber_id);
  if(payoutError)return NextResponse.json({error:'No se pudo verificar las liquidaciones.'},{status:503});
  if((payoutCount||0)>0)return NextResponse.json({error:'Este barbero ya tiene pagos. Corregí el movimiento desde una conciliación supervisada.'},{status:409});
  let query = supabase.from(table).delete().eq('shop_id', SHOP_UUID).eq('id', body.id);
  if (!session.admin) query = query.eq('barber_id', session.barberId!);
  const {data, error} = await query.select('id');
  if (error) return NextResponse.json({error: 'No se pudo eliminar el movimiento'}, {status: 500});
  if (!data?.length) return NextResponse.json({error:'Registro inexistente o sin permiso'}, {status: 404});
  return NextResponse.json({ok: true});
}
