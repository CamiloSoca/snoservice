import {NextResponse} from 'next/server';
import {getSupabaseServer,SHOP_UUID} from '@/lib/supabase-server';
import {getBarberSession,requireAdminSession,verifyCsrfOrigin} from '@/lib/session';
import {isValidUUID} from '@/lib/booking-store';

const headers={'Cache-Control':'private, no-store'};

async function seller(scope:string) {
  if(scope==='admin') {
    const admin=await requireAdminSession();
    return admin?{role:'admin' as const,barberId:null}:null;
  }
  if(scope==='barber') {
    const session=await getBarberSession();
    if(!session || !isValidUUID(session.sub))return null;
    const {data}=await getSupabaseServer().from('barbers')
      .select('id,active').eq('shop_id',SHOP_UUID)
      .eq('id',session.sub).maybeSingle();
    return data?.active?{role:'barber' as const,barberId:session.sub}:null;
  }
  return null;
}

export async function GET(request:Request) {
  const scope=new URL(request.url).searchParams.get('scope')||'public';
  if(!['public','barber','admin'].includes(scope))
    return NextResponse.json({error:'Consulta inválida.'},{status:400,headers});
  try {
    const db=getSupabaseServer();
    if(scope==='public') {
      const {data,error}=await db.from('retail_products')
        .select('id,slug,name,description,price,stock_quantity')
        .eq('shop_id',SHOP_UUID).eq('active',true).order('name');
      if(error)return NextResponse.json({error:'No se pudo consultar el catálogo.'},{status:503,headers});
      // Only general availability is public; no receipt/customer/stock history.
      return NextResponse.json({products:(data||[]).map(p=>({
        id:p.id,slug:p.slug,name:p.name,description:p.description,
        price:Number(p.price),available:Number(p.stock_quantity)>0,
      }))},{headers});
    }
    const identity=await seller(scope);
    if(!identity)return NextResponse.json({error:'Sesión no autorizada.'},{status:401,headers});
    let history=db.from('retail_sales')
      .select('id,product_id,barber_id,actor_role,quantity,unit_price,amount,payment_method,sold_at,retail_products(name),barbers(name)')
      .eq('shop_id',SHOP_UUID).order('sold_at',{ascending:false}).limit(scope==='admin'?100:40);
    if(identity.role==='barber')history=history.eq('barber_id',identity.barberId);
    const [products,sales,summary,adjustments]=await Promise.all([
      db.from('retail_products')
        .select('id,slug,name,description,price,stock_quantity,active')
        .eq('shop_id',SHOP_UUID).order('name'),
      history,
      db.rpc('retail_sales_summary',{p_shop_id:SHOP_UUID,p_barber_id:identity.barberId}),
      scope==='admin'
        ? db.from('retail_stock_adjustments')
            .select('id,product_id,previous_stock,new_stock,note,created_at')
            .eq('shop_id',SHOP_UUID).order('created_at',{ascending:false}).limit(50)
        : Promise.resolve({data:[],error:null}),
    ]);
    if(products.error||sales.error||summary.error||adjustments.error)
      return NextResponse.json({error:'No se pudo consultar el inventario y las ventas.'},{status:503,headers});
    return NextResponse.json({
      products:(products.data||[]).map(p=>({...p,price:Number(p.price)})),
      sales:sales.data||[],summary:summary.data,
      adjustments:scope==='admin'?adjustments.data||[]:[],
    },{headers});
  } catch {
    return NextResponse.json({error:'No se pudo cargar el inventario.'},{status:500,headers});
  }
}

export async function POST(request:Request) {
  if(!verifyCsrfOrigin(request))return NextResponse.json({error:'Origen no autorizado.'},{status:403,headers});
  let body:Record<string,unknown>;
  try {body=await request.json() as Record<string,unknown>;}
  catch {return NextResponse.json({error:'Datos inválidos.'},{status:400,headers});}
  const scope=body.scope;
  if(scope!=='barber'&&scope!=='admin')
    return NextResponse.json({error:'Origen de venta inválido.'},{status:400,headers});
  const identity=await seller(scope);
  if(!identity)return NextResponse.json({error:'Sesión vencida o no autorizada.'},{status:401,headers});
  if(!isValidUUID(String(body.productId||''))||!isValidUUID(String(body.requestId||'')))
    return NextResponse.json({error:'Producto o identificador inválido.'},{status:400,headers});

  const db=getSupabaseServer();
  if(body.action==='SALE') {
    const quantity=body.quantity;
    const method=body.method;
    if(typeof quantity!=='number'||!Number.isInteger(quantity)||quantity<1||quantity>20||
       (method!=='cash'&&method!=='transfer'))
      return NextResponse.json({error:'Indicá cantidad y efectivo o transferencia.'},{status:422,headers});
    const {data,error}=await db.rpc('record_retail_sale',{
      p_shop_id:SHOP_UUID,p_product_id:body.productId,p_barber_id:identity.barberId,
      p_actor_role:identity.role,p_quantity:quantity,p_payment_method:method,
      p_request_id:body.requestId,
    });
    if(error){
      return NextResponse.json({error:error.code==='23514'
        ?'No hay stock suficiente, el barbero está inactivo o la caja está cerrada.'
        :error.code==='23505'?'Este intento ya corresponde a otra venta.'
        :'No se pudo confirmar la venta. Revisá el historial antes de repetir.'},
      {status:['23514','23505','22023'].includes(error.code)?409:503,headers});
    }
    return NextResponse.json({ok:true,sale:data},{headers});
  }

  if(body.action==='SET_STOCK'&&identity.role==='admin') {
    const newStock=body.newStock;
    const note=typeof body.note==='string'?body.note.trim():'';
    if(typeof newStock!=='number'||!Number.isInteger(newStock)||
      newStock<0||newStock>100000||note.length<3||note.length>240)
      return NextResponse.json({error:'Ingresá stock válido y un motivo de 3 a 240 caracteres.'},{status:422,headers});
    const {data,error}=await db.rpc('set_retail_stock',{
      p_shop_id:SHOP_UUID,p_product_id:body.productId,
      p_new_stock:newStock,p_note:note,p_request_id:body.requestId,
    });
    if(error)return NextResponse.json({error:error.code==='23505'
      ?'Ese intento corresponde a otro ajuste de stock.'
      :'No se pudo confirmar el stock. Revisá el historial antes de repetir.'},
      {status:error.code==='23505'?409:503,headers});
    return NextResponse.json({ok:true,adjustment:data},{headers});
  }
  return NextResponse.json({error:'Operación no autorizada.'},{status:403,headers});
}
