import {NextResponse} from 'next/server';
import {requireAdminSession,verifyCsrfOrigin} from '@/lib/session';
import {getSupabaseServer,SHOP_UUID} from '@/lib/supabase-server';
import {isOnSitePaymentMethod} from '@/lib/payment-method';
import {isValidUUID,sanitizeInput} from '@/lib/booking-store';

const headers={'Cache-Control':'private, no-store'};
export async function GET() {
  if (!await requireAdminSession()) return NextResponse.json({error:'Solo administración.'},{status:403,headers});
  try {
    const db=getSupabaseServer();
    const [snapshot,draws]=await Promise.all([
      db.rpc('cash_drawer_snapshot',{p_shop_id:SHOP_UUID}),
      db.from('owner_draws').select('id,amount,method,note,created_at,register_id')
        .eq('shop_id',SHOP_UUID).order('created_at',{ascending:false}).limit(50),
    ]);
    if (snapshot.error || draws.error) {
      console.warn('Cash report error:',snapshot.error?.code||draws.error?.code);
      return NextResponse.json({error:'No se pudo consultar el arqueo de caja.'},{status:503,headers});
    }
    return NextResponse.json({drawer:snapshot.data,ownerDraws:draws.data||[]},{headers});
  } catch {
    return NextResponse.json({error:'Error al cargar el arqueo.'},{status:500,headers});
  }
}
export async function POST(request:Request) {
  if (!verifyCsrfOrigin(request)) return NextResponse.json({error:'Origen no autorizado.'},{status:403,headers});
  if (!await requireAdminSession()) return NextResponse.json({error:'Solo administración puede retirar dinero.'},{status:403,headers});
  try {
    const body=await request.json();
    const amountText=String(body?.amount??'').trim();
    if (body?.operation!=='OWNER_DRAW' || !isValidUUID(String(body?.requestId||'')) ||
      !isOnSitePaymentMethod(body?.method) || !/^\d{1,8}(\.\d{1,2})?$/.test(amountText) ||
      Number(amountText)<=0 || String(body?.note||'').length>180) {
      return NextResponse.json({error:'Importe, método o identificador inválido.'},{status:400,headers});
    }
    const {data,error}=await getSupabaseServer().rpc('record_owner_draw',{
      p_shop_id:SHOP_UUID,p_amount:Number(amountText),p_method:body.method,
      p_request_id:body.requestId,p_note:sanitizeInput(String(body.note||'')).slice(0,180),
    });
    if(error) {
      console.warn('Owner draw rejected:',error.code);
      return NextResponse.json({error:error.code==='23514'
        ?'No hay suficiente efectivo o quedan movimientos sin conciliar.'
        :error.code==='23505'?'Ya existe otro retiro con ese identificador.'
        :'No se pudo registrar el retiro. Consultá el historial antes de repetir.'},
        {status:['23514','23505'].includes(error.code)?409:503,headers});
    }
    return NextResponse.json({ok:true,draw:data},{headers});
  } catch {
    return NextResponse.json({error:'No se pudo confirmar el retiro.'},{status:500,headers});
  }
}