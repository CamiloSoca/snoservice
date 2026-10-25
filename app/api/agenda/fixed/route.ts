import {NextResponse} from 'next/server';
import {getSupabaseServer,SHOP_UUID} from '@/lib/supabase-server';
import {requireAdminSession,getBarberSession} from '@/lib/session';

const headers={'Cache-Control':'private, no-store'};
const iso=/^\d{4}-\d{2}-\d{2}$/;
const dateValue=(s:string)=>{
 if(!iso.test(s))return null;
 const d=new Date(s+'T00:00:00Z');
 return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s?d:null;
};

// Sólo operadores autenticados pueden consultar datos privados de clientes
// fijos y el resultado contable de los días incluidos en la agenda visible.
export async function GET(request:Request){
 const [admin,staff]=await Promise.all([requireAdminSession(),getBarberSession()]);
 if(!admin&&!staff)return NextResponse.json({error:'Sesión requerida'},{status:401,headers});
 const url=new URL(request.url);
 const start=url.searchParams.get('from')||'';
 const end=url.searchParams.get('to')||'';
 const from=dateValue(start),to=dateValue(end);
 if(!from||!to||to<from||(to.getTime()-from.getTime())>8*86400000){
   return NextResponse.json({error:'Intervalo de agenda inválido.'},{status:400,headers});
 }
 const db=getSupabaseServer();
 let query=db.from('fixed_bookings')
   .select('id,barber_id,service_id,client_name,client_phone,client_email,weekday,time_slot,duration_minutes,start_date,end_date,skipped_dates,services(name,price),barbers(name)')
   .eq('shop_id',SHOP_UUID).eq('active',true);
 if(!admin&&staff)query=query.eq('barber_id',staff.sub);
 const {data,error}=await query;
 if(error)return NextResponse.json({error:'No se pudieron cargar los clientes fijos.'},{status:503,headers});
 const rows=data||[];
 // No cargar toda la historia financiera: sólo los días abiertos en el calendario.
 const {data:charges,error:chargesError}=rows.length>0
  ? await db.from('manual_charges')
      .select('id,fixed_booking_id,fixed_occurrence_date,amount,payment_method')
      .eq('shop_id',SHOP_UUID)
      .in('fixed_booking_id',rows.map(r=>r.id))
      .gte('fixed_occurrence_date',start).lte('fixed_occurrence_date',end)
  : {data:[],error:null};
 if(chargesError)return NextResponse.json({error:'No se pudo comprobar cuáles fijos están completados.'},
   {status:503,headers});
 const items=rows.map((r:any)=>({
   id:r.id,barberId:r.barber_id,serviceId:r.service_id,
   clientName:r.client_name,clientPhone:r.client_phone,clientEmail:r.client_email,
   weekday:r.weekday,timeSlot:r.time_slot,durationMinutes:r.duration_minutes,
   startDate:r.start_date,endDate:r.end_date,skippedDates:r.skipped_dates||[],
   serviceName:r.services?.name||'Servicio',servicePrice:Number(r.services?.price||0),
   barberName:r.barbers?.name||'Barbero',
 }));
 const completed=(charges||[]).map(c=>({
   fixedBookingId:c.fixed_booking_id,
   occurrenceDate:c.fixed_occurrence_date,
   chargeId:c.id,
   amount:Number(c.amount||0),
   paymentMethod:c.payment_method,
 }));
 return NextResponse.json({items,completed},{headers});
}
