import {NextResponse} from 'next/server';
import {getSupabaseServer, SHOP_UUID} from '@/lib/supabase-server';
import {requireAdminSession, verifyCsrfOrigin} from '@/lib/session';
import {isValidUUID} from '@/lib/booking-store';
import {requireOpenCash} from '@/lib/cash-guard';
import {isOnSitePaymentMethod} from '@/lib/payment-method';

const headers = {'Cache-Control':'private, no-store'};
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])-01$/;
const thisMonth = () => {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Montevideo',year:'numeric',month:'2-digit'})
    .formatToParts(new Date());
  const year=parts.find(p=>p.type==='year')?.value;
  const month=parts.find(p=>p.type==='month')?.value;
  return `${year}-${month}-01`;
};
const errorReply = (error:string,status:number) => NextResponse.json({error},{status,headers});

export async function GET(request:Request){
  if(!await requireAdminSession())return errorReply('Sesión requerida.',401);
  const db=getSupabaseServer();
  const url=new URL(request.url);
  const fixedId=url.searchParams.get('fixedId');
  if(fixedId&&!isValidUUID(fixedId))return errorReply('Identificador inválido.',400);
  const month=thisMonth();
  let planQuery=db.from('fixed_monthly_plans')
    .select('fixed_booking_id,monthly_price,included_cuts,active')
    .eq('shop_id',SHOP_UUID);
  if(fixedId)planQuery=planQuery.eq('fixed_booking_id',fixedId);
  const {data:plans,error:planError}=await planQuery;
  if(planError)return errorReply('No se pudieron cargar los abonos.',503);
  const ids=(plans||[]).map(p=>p.fixed_booking_id);
  if(!ids.length)return NextResponse.json({items:[],month},{headers});

  // La lista sólo necesita el estado del mes actual. Un detalle solicita su historial.
  let periodQuery=db.from('fixed_monthly_periods')
    .select('id,fixed_booking_id,period_month,price_snapshot,included_cuts,paid_at,payment_method')
    .eq('shop_id',SHOP_UUID).in('fixed_booking_id',ids)
    .order('period_month',{ascending:false});
  if(!fixedId)periodQuery=periodQuery.eq('period_month',month);
  else periodQuery=periodQuery.limit(24);
  const {data:periods,error:periodError}=await periodQuery;
  if(periodError)return errorReply('No se pudieron consultar las mensualidades.',503);
  const periodIds=(periods||[]).map(p=>p.id);
  const usage=periodIds.length ? await db.from('fixed_monthly_uses')
    .select('period_id,occurrence_date').eq('shop_id',SHOP_UUID).in('period_id',periodIds)
    : {data:[],error:null};
  if(usage.error)return errorReply('No se pudieron consultar los cortes.',503);
  const items=(plans||[]).map(plan=>({
    ...plan,
    periods:(periods||[]).filter(p=>p.fixed_booking_id===plan.fixed_booking_id).map(p=>({
      ...p,uses:(usage.data||[]).filter(u=>u.period_id===p.id)
        .map(u=>u.occurrence_date).sort(),
    })),
  }));
  return NextResponse.json({month,items},{headers});
}

export async function POST(request:Request){
  if(!verifyCsrfOrigin(request))return errorReply('Origen no permitido.',403);
  if(!await requireAdminSession())return errorReply('Solo administración puede gestionar abonos.',401);
  const body=await request.json().catch(()=>null);
  const fixedId=String(body?.fixedBookingId||'');
  if(!isValidUUID(fixedId))return errorReply('Cliente fijo inválido.',400);
  const db=getSupabaseServer();
  if(body?.action==='configure'){
    const price=Number(body?.monthlyPrice);
    if(typeof body?.monthlyPrice!=='number'||!Number.isFinite(price)||price<=0||
       price>100000000||Math.abs(price*100-Math.round(price*100))>1e-7||typeof body?.active!=='boolean'){
      return errorReply('Ingresá un importe mensual válido y un estado de activación.',400);
    }
    // El trigger en PostgreSQL vuelve a comprobarlo dentro de la misma transacción.
    const {data:fixed,error:fixedError}=await db.from('fixed_bookings')
      .select('id,barber_id').eq('shop_id',SHOP_UUID).eq('id',fixedId).maybeSingle();
    if(fixedError)return errorReply('No se pudo comprobar el cliente fijo.',503);
    if(!fixed)return errorReply('No se encontró este cliente fijo.',404);
    const {data:barber,error:barberError}=await db.from('barbers')
      .select('is_owner').eq('shop_id',SHOP_UUID)
      .eq('id',fixed.barber_id).maybeSingle();
    if(barberError)return errorReply('No se pudo comprobar al barbero.',503);
    if(barber?.is_owner!==true){
      return errorReply('Esta función solamente aplica a clientes fijos del dueño.',403);
    }
    const {error}=await db.from('fixed_monthly_plans').upsert({
      fixed_booking_id:fixedId,shop_id:SHOP_UUID,monthly_price:price,active:body.active,
    },{onConflict:'fixed_booking_id'});
    if(error)return errorReply('No se pudo guardar el abono. Revisá su configuración.',409);
    return NextResponse.json({ok:true},{headers});
  }
  if(body?.action==='pay'){
    const method=body?.paymentMethod;
    const month=String(body?.month||'');
    if(!isOnSitePaymentMethod(method)||!monthPattern.test(month)||month!==thisMonth()){
      return errorReply('Mes o método de pago inválido.',400);
    }
    const cashDenied=await requireOpenCash();
    if(cashDenied)return cashDenied;
    const {data,error}=await db.rpc('pay_fixed_monthly_period',{
      p_shop_id:SHOP_UUID,p_fixed_id:fixedId,p_month:month,p_method:method,
    });
    if(error){
      if(error.code==='23505')return errorReply('Este abono ya fue cobrado este mes.',409);
      if(error.code==='23514')return errorReply('No se registró el pago. Verificá que el abono esté activo, la caja abierta y que no existan cortes ya cobrados este mes.',409);
      return errorReply('No se pudo confirmar el pago. Revisá la caja antes de repetir.',503);
    }
    return NextResponse.json({ok:true,periodId:data},{headers});
  }
  return errorReply('Acción inválida.',400);
}
