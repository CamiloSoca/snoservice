import {NextResponse} from 'next/server';
import {getSupabaseServer, SHOP_UUID} from '@/lib/supabase-server';
import {requireAdminSession, getBarberSession, verifyCsrfOrigin} from '@/lib/session';
import {isValidUUID, sanitizeInput} from '@/lib/booking-store';
import {isOnSitePaymentMethod} from '@/lib/payment-method';

const noStore = {'Cache-Control':'private, no-store'};
export async function GET(request:Request) {
  const barberView=new URL(request.url).searchParams.get('scope')==='barber';
  const [admin,barber] = await Promise.all([requireAdminSession(),getBarberSession()]);
  // La vista de barbero exige su propia sesión aun si también existe una cookie de admin.
  if (barberView && !barber) return NextResponse.json({error:'Sesión de barbero requerida.'},{status:403,headers:noStore});
  if (!admin && !barber) return NextResponse.json({error:'Sesión requerida.'},{status:401,headers:noStore});
  try {
    const db=getSupabaseServer();
    const ownId=barberView?barber!.sub:(admin?null:barber!.sub);
    const [balances,history,cash]=await Promise.all([
      db.rpc('finance_barber_balances',{p_shop_id:SHOP_UUID,p_barber_id:ownId}),
      (ownId ? db.from('barber_payouts').select('id,barber_id,amount,method,note,created_at')
        .eq('shop_id',SHOP_UUID).eq('barber_id',ownId).order('created_at',{ascending:false}).limit(30)
        : db.from('barber_payouts').select('id,barber_id,amount,method,note,created_at')
          .eq('shop_id',SHOP_UUID).order('created_at',{ascending:false}).limit(50)),
      db.from('cash_registers').select('id').eq('shop_id',SHOP_UUID).eq('status','abierta').limit(1),
    ]);
    if (balances.error || history.error || cash.error) {
      console.warn('Consulta de liquidaciones falló:',balances.error?.code||history.error?.code||cash.error?.code);
      return NextResponse.json({error:'No se pudo obtener el balance.'},{status:503,headers:noStore});
    }
    return NextResponse.json({
      balances:balances.data||[],payouts:history.data||[],
      cashOpen:Boolean(cash.data?.length),physicalCashVerified:false,
    },{headers:noStore});
  } catch {
    return NextResponse.json({error:'No se pudieron consultar las liquidaciones.'},{status:500,headers:noStore});
  }
}
export async function POST(request:Request) {
  if (!verifyCsrfOrigin(request)) return NextResponse.json({error:'Origen no permitido.'},{status:403,headers:noStore});
  if (!await requireAdminSession()) return NextResponse.json({error:'Solo administración puede pagar comisiones.'},{status:403,headers:noStore});
  try {
    const body=await request.json();
    if (body?.operation!=='RECORD_BARBER_PAYOUT'||
      !isValidUUID(String(body.barberId||''))||!isValidUUID(String(body.requestId||''))||
      !isOnSitePaymentMethod(body.method)) {
      return NextResponse.json({error:'Datos inválidos.'},{status:400,headers:noStore});
    }
    const amount=String(body.amount??'').trim();
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(amount)||Number(amount)<=0) {
      return NextResponse.json({error:'Ingresá un monto válido.'},{status:400,headers:noStore});
    }
    const note=sanitizeInput(String(body.note||'')).slice(0,180);
    const {data,error}=await getSupabaseServer().rpc('record_barber_payout',{
      p_shop_id:SHOP_UUID,p_barber_id:body.barberId,p_amount:Number(amount),
      p_method:body.method,p_request_id:body.requestId,p_note:note,
    });
    if (error) {
      console.warn('Registro de pago rechazado:',error.code);
      return NextResponse.json({
        error:error.code==='23514'?'Saldo insuficiente o caja cerrada.'
          :error.code==='23505'?'Este identificador pertenece a otra operación.'
          :'No se pudo confirmar el pago. Consultá el historial antes de reintentar.',
      },{status:error.code==='23514'||error.code==='23505'?409:503,headers:noStore});
    }
    return NextResponse.json({ok:true,payout:data},{headers:noStore});
  } catch {
    return NextResponse.json({error:'Error al registrar el pago.'},{status:500,headers:noStore});
  }
}
