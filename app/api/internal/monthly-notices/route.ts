import {NextResponse} from 'next/server';
import {dispatchFixedMonthlyNotice} from '@/lib/fixed-monthly-notice-mail';

// Reintento programado de correos pendientes, sin tocar abonos ni caja.
// Vercel invoca el cron con Authorization: Bearer CRON_SECRET.
export async function GET(request:Request){
  const secret=process.env.CRON_SECRET;
  if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`){
    return NextResponse.json({error:'No autorizado.'},{status:401});
  }
  let accepted=0,failed=0;
  for(let i=0;i<10;i++){
    const result=await dispatchFixedMonthlyNotice();
    if(result==='none')break;
    if(result==='accepted')accepted++;
    else failed++;
  }
  return NextResponse.json({processed:accepted+failed,accepted,failed},
    {headers:{'Cache-Control':'private, no-store'}});
}
