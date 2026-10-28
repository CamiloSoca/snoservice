import {NextResponse} from 'next/server';
import {getSupabaseServer,SHOP_UUID} from '@/lib/supabase-server';
import {getBarberSession,requireAdminSession,verifyCsrfOrigin} from '@/lib/session';
import {isValidUUID} from '@/lib/booking-store';
import {requireOpenCash} from '@/lib/cash-guard';
import {isOnSitePaymentMethod} from '@/lib/payment-method';

const headers={'Cache-Control':'private, no-store'};
const isRealDate=(date:string):boolean=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
  const parsed=new Date(date+'T00:00:00Z');
  return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===date;
};

// Es una sola ocurrencia semanal, no toda la recurrencia.
// El RPC Postgres escribe un registro atómico vinculado a la fecha
// y aplica el UNIQUE para evitar doble facturación simultánea.
export async function POST(request:Request){
  if(!verifyCsrfOrigin(request))return NextResponse.json({error:'Origen inválido'},{status:403,headers});
  const [admin,staff]=await Promise.all([requireAdminSession(),getBarberSession()]);
  if(!admin&&!staff)return NextResponse.json({error:'Sesión requerida'},{status:401,headers});
  const body=await request.json().catch(()=>({}));
  const fixedBookingId=String(body.fixedBookingId||'');
  const occurrenceDate=String(body.occurrenceDate||'');
  const paymentMethod=body.paymentMethod;
  const mode=body.mode||'charge';
  if((mode!=='charge'&&mode!=='subscription'&&mode!=='courtesy')||!isValidUUID(fixedBookingId)||!isRealDate(occurrenceDate)||
     (mode==='charge'&&!isOnSitePaymentMethod(paymentMethod))){
    return NextResponse.json({error:'Turno, fecha o medio de pago inválidos.'},{status:400,headers});
  }
  const db=getSupabaseServer();
  if(!admin&&staff){
    const {data,error}=await db.from('fixed_bookings')
      .select('id').eq('id',fixedBookingId).eq('shop_id',SHOP_UUID)
      .eq('barber_id',staff.sub).maybeSingle();
    if(error)return NextResponse.json({error:'No se pudo verificar el turno.'},{status:503,headers});
    if(!data)return NextResponse.json({error:'Este fijo no pertenece a tu agenda.'},{status:403,headers});
  }
  // Igual que un turno normal: no completar si la caja no está abierta.
  if(mode!=='courtesy'){
    const denied=await requireOpenCash();
    if(denied)return denied;
  }
  const {data,error}=mode==='courtesy'
    ?await db.rpc('complete_fixed_courtesy_occurrence',{
      p_shop_id:SHOP_UUID,p_fixed_id:fixedBookingId,p_occurrence:occurrenceDate,
    })
    :mode==='subscription'
    ?await db.rpc('complete_fixed_monthly_occurrence',{
      p_shop_id:SHOP_UUID,p_fixed_id:fixedBookingId,p_occurrence:occurrenceDate,
    })
    :await db.rpc('complete_fixed_booking_occurrence',{
      p_shop_id:SHOP_UUID,p_fixed_id:fixedBookingId,
      p_occurrence:occurrenceDate,p_payment_method:paymentMethod,
    });
  if(error){
    if(error.code==='23505')return NextResponse.json({error:'Esta fecha ya fue completada.'},{status:409,headers});
    if(error.code==='23514')return NextResponse.json({
      error:'No se pudo completar: verificá que el turno ya haya empezado, esté activo y la caja esté abierta.',
    },{status:409,headers});
    console.error('Error completando fecha fija:',error.code);
    return NextResponse.json({error:'No se pudo confirmar el corte fijo. Revisá la caja antes de reintentar.'},
      {status:503,headers});
  }
  if(!isValidUUID(String(data||'')))return NextResponse.json({error:'No se confirmó el servicio.'},{status:503,headers});
  return NextResponse.json({ok:true,coveredBySubscription:mode==='subscription',
    coveredByCourtesy:mode==='courtesy',
    ...(mode==='charge'?{chargeId:data}:{usageId:data})},{headers});
}
