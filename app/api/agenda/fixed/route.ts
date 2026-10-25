import {NextResponse} from 'next/server';
import {getSupabaseServer,SHOP_UUID} from '@/lib/supabase-server';
import {requireAdminSession,getBarberSession} from '@/lib/session';

// Only authenticated operators can see names or phones of standing clients.
export async function GET(){
 const [admin,staff]=await Promise.all([requireAdminSession(),getBarberSession()]);
 if(!admin&&!staff)return NextResponse.json({error:'Sesión requerida'},{status:401});
 const db=getSupabaseServer();
 let query=db.from('fixed_bookings')
   .select('id,barber_id,service_id,client_name,client_phone,client_email,weekday,time_slot,duration_minutes,start_date,end_date,skipped_dates,services(name,price),barbers(name)')
   .eq('shop_id',SHOP_UUID).eq('active',true);
 if(!admin&&staff)query=query.eq('barber_id',staff.sub);
 const {data,error}=await query;
 if(error)return NextResponse.json({error:'No se pudieron cargar los clientes fijos.'},{status:503,
   headers:{'Cache-Control':'private, no-store'}});
 const items=(data||[]).map((r:any)=>({
   id:r.id,barberId:r.barber_id,serviceId:r.service_id,
   clientName:r.client_name,clientPhone:r.client_phone,clientEmail:r.client_email,
   weekday:r.weekday,timeSlot:r.time_slot,durationMinutes:r.duration_minutes,
   startDate:r.start_date,endDate:r.end_date,skippedDates:r.skipped_dates||[],
   serviceName:r.services?.name||'Servicio',barberName:r.barbers?.name||'Barbero',
 }));
 return NextResponse.json({items},{headers:{'Cache-Control':'private, no-store'}});
}
