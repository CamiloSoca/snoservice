import {NextResponse} from 'next/server';
import {requireAdminSession} from '@/lib/session';
import {getSupabaseServer,SHOP_UUID} from '@/lib/supabase-server';

// El arqueo usa EXACTAMENTE la misma fuente que "¿Cuánto hay en caja?".
// Su cashIn y transferIn contienen servicios + propinas. Solo separamos
// las propinas para que no aparezcan como facturación por servicios.
const headers={'Cache-Control':'private, no-store'};

export async function GET(){
  if(!await requireAdminSession()){
    return NextResponse.json({error:'Solo administración.'},{status:403,headers});
  }
  try {
    const db=getSupabaseServer();
    const {data:drawer,error}=await db.rpc('cash_drawer_snapshot',{p_shop_id:SHOP_UUID});
    if(error || !drawer?.registerId || !drawer.cashOpen){
      return NextResponse.json({error:'No hay una caja abierta para cerrar.'},{status:409,headers});
    }

    let tipCash=0;
    let tipTransfer=0;
    // Paginado para que el resumen no omita propinas al crecer la cantidad
    // de registros de una jornada (límite por consulta de PostgREST).
    let from=0;
    const pageSize=500;
    while(true){
      const {data:tips,error:tipsError}=await db.from('tips')
        .select('amount,payment_method')
        .eq('shop_id',SHOP_UUID).eq('cash_register_id',drawer.registerId)
        .range(from,from+pageSize-1);
      if(tipsError)throw new Error('tip_read_failed');
      for(const tip of tips||[]){
        if(tip.payment_method==='cash')tipCash+=Number(tip.amount);
        else if(tip.payment_method==='transfer')tipTransfer+=Number(tip.amount);
      }
      if(!tips || tips.length<pageSize)break;
      from+=pageSize;
    }

    const money=(n:number)=>Math.round(n*100)/100;
    const cash=money(Number(drawer.cashIn)-tipCash);
    const transfer=money(Number(drawer.transferIn)-tipTransfer);
    if(cash<0 || transfer<0)throw new Error('inconsistent_ledger');
    const total=money(cash+transfer);
    return NextResponse.json({
      drawer,
      sales:{
        registerId:drawer.registerId,
        cash,transfer,total,
        cashPercent:total>0?money(cash/total*100):0,
        transferPercent:total>0?money(transfer/total*100):0,
        tipCash:money(tipCash),tipTransfer:money(tipTransfer),
        tipTotal:money(tipCash+tipTransfer),
      },
    },{headers});
  }catch(err){
    console.warn('Cash close preview unavailable',err instanceof Error?err.message:'unknown');
    return NextResponse.json({error:'No se pudo preparar un arqueo confiable. No cierres la caja sin revisar los movimientos.'},
      {status:503,headers});
  }
}
