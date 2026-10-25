import {NextResponse} from 'next/server';
import {getSupabaseServer,SHOP_UUID} from '@/lib/supabase-server';
import {requireAdminSession,verifyCsrfOrigin} from '@/lib/session';
import {isValidUUID,sanitizeInput} from '@/lib/booking-store';
import {resolvedHours,type WeeklyHours} from '@/lib/weekly-hours';
import type {BusinessSchedule} from '@/lib/appointment-rules';
import {fixedBookingStartSlots} from '@/lib/fixed-booking-time-slots';

const headers={'Cache-Control':'private, no-store'};
const days=new Set([0,1,2,3,4,5,6]);
const dayKeys=['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
const iso=/^\d{4}-\d{2}-\d{2}$/;
const time=/^([01]\d|2[0-3]):[0-5]\d$/;

export async function GET(){
  if(!await requireAdminSession())return NextResponse.json({error:'Sesión requerida.'},{status:401,headers});
  const {data,error}=await getSupabaseServer().from('fixed_bookings')
    .select('id,barber_id,service_id,client_name,client_phone,client_email,weekday,time_slot,duration_minutes,start_date,end_date,active,skipped_dates')
    .eq('shop_id',SHOP_UUID).order('weekday',{ascending:true}).order('time_slot',{ascending:true});
  if(error)return NextResponse.json({error:'No se pudo cargar agenda fija.'},{status:503,headers});
  return NextResponse.json({items:data||[]},{headers});
}
export async function POST(request:Request){
  if(!verifyCsrfOrigin(request))return NextResponse.json({error:'Origen no permitido.'},{status:403,headers});
  if(!await requireAdminSession())return NextResponse.json({error:'Solo administración puede gestionar agenda fija.'},{status:401,headers});
  try{
    const body=await request.json();
    const db=getSupabaseServer();
    if(body?.action==='toggle'){
      if(!isValidUUID(String(body.id||''))||typeof body.active!=='boolean'){
        return NextResponse.json({error:'Datos de activación inválidos.'},{status:400,headers});
      }
      const {data,error}=await db.from('fixed_bookings').update({active:body.active})
        .eq('shop_id',SHOP_UUID).eq('id',body.id).select('id').maybeSingle();
      if(error)return NextResponse.json({error:error.code==='23505'||error.code==='23514'
        ?'Ese turno fijo se superpone con una reserva existente o está fuera del horario.'
        :'No se pudo cambiar la agenda fija.'},{status:409,headers});
      if(!data)return NextResponse.json({error:'No se encontró ese turno fijo.'},{status:404,headers});
      return NextResponse.json({ok:true},{headers});
    }

    if(body?.action==='skip_date'){
      const id=String(body.id||'');
      const occurrence=String(body.date||'');
      const validDate=iso.test(occurrence)&&
        !Number.isNaN(Date.parse(occurrence+'T00:00:00Z')) &&
        new Date(occurrence+'T00:00:00Z').toISOString().slice(0,10)===occurrence;
      if(!isValidUUID(id)||!validDate||typeof body.skip!=='boolean'){
        return NextResponse.json({error:'Elegí una fecha válida de este turno fijo.'},{status:400,headers});
      }
      // RPC atómica: guarda una excepción semanal, nunca altera una reserva normal.
      const {error}=await db.rpc('set_fixed_booking_week_skip',{
        p_shop_id:SHOP_UUID,p_fixed_id:id,p_occurrence:occurrence,p_skip:body.skip,
      });
      if(error){
        const message=error.code==='23505'
          ?'No se puede restaurar esa fecha: otro cliente ya reservó el horario.'
          :error.code==='23514'
          ?'La fecha no corresponde a ese turno fijo o ya pasó.'
          :error.code==='23503'
          ?'No se encontró el turno fijo.'
          :'No se pudo actualizar esta fecha del turno fijo.';
        return NextResponse.json({error:message},{status:
          error.code==='23514'?400:error.code==='23503'?404:409,headers});
      }
      return NextResponse.json({ok:true},{headers});
    }
    if(body?.action!=='save')return NextResponse.json({error:'Acción inválida.'},{status:400,headers});
    const id=body.id?String(body.id):null;
    const barberId=String(body.barberId||'');
    const serviceId=String(body.serviceId||'');
    const clientName=sanitizeInput(String(body.clientName||'')).slice(0,100);
    const clientPhone=sanitizeInput(String(body.clientPhone||'')).slice(0,30);
    const clientEmail=sanitizeInput(String(body.clientEmail||'')).toLowerCase().slice(0,180);
    const weekday=Number(body.weekday);
    const timeSlot=String(body.timeSlot||'');
    const startDate=String(body.startDate||'');
    const endDate=body.endDate?String(body.endDate):null;
    if((id&&!isValidUUID(id))||!isValidUUID(barberId)||!isValidUUID(serviceId)
      ||clientName.length<3||!days.has(weekday)||!time.test(timeSlot)
      ||!iso.test(startDate)||(endDate&&!iso.test(endDate))
      ||(endDate&&endDate<startDate)
      ||(clientEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail))){
      return NextResponse.json({error:'Revisá cliente, barbero, servicio, día, hora y fechas.'},{status:400,headers});
    }
    // Validar también del lado del servidor: no aceptar una hora enviada
    // manualmente a la API fuera de los bloques de 30 min del barbero.
    // Consultas SELECT únicamente; no se altera ninguna reserva existente.
    const [shopResult,barberResult,serviceResult]=await Promise.all([
      db.from('shops').select('schedule').eq('id',SHOP_UUID).maybeSingle(),
      db.from('barbers').select('working_schedule').eq('shop_id',SHOP_UUID)
        .eq('id',barberId).eq('active',true).maybeSingle(),
      db.from('services').select('duration_minutes').eq('shop_id',SHOP_UUID)
        .eq('id',serviceId).eq('active',true).maybeSingle(),
    ]);
    if(shopResult.error||barberResult.error||serviceResult.error){
      return NextResponse.json({error:'No se pudieron verificar los horarios. Intentá nuevamente.'},
        {status:503,headers});
    }
    if(!shopResult.data?.schedule||!barberResult.data||!serviceResult.data){
      return NextResponse.json({error:'Local, barbero o servicio no disponible.'},
        {status:409,headers});
    }
    const schedule=resolvedHours(
      shopResult.data.schedule as BusinessSchedule,
      barberResult.data.working_schedule as WeeklyHours|null,
    );
    const validSlots=fixedBookingStartSlots(
      schedule[dayKeys[weekday]],Number(serviceResult.data.duration_minutes),
    );
    if(!validSlots.includes(timeSlot)){
      return NextResponse.json({error:'Elegí un bloque horario válido cada 30 minutos para ese barbero y servicio.'},
        {status:400,headers});
    }
    // Los conflictos con reservas y turnos fijos se siguen validando
    // atómicamente en PostgreSQL. Nunca resolverlos cambiando otros turnos.
    const payload={
      barber_id:barberId,service_id:serviceId,client_name:clientName,
      client_phone:clientPhone,client_email:clientEmail,weekday,time_slot:timeSlot,
      start_date:startDate,end_date:endDate,
    };
    const result=id
      ? await db.from('fixed_bookings').update(payload).eq('id',id).eq('shop_id',SHOP_UUID).select('id').maybeSingle()
      : await db.from('fixed_bookings').insert({...payload,shop_id:SHOP_UUID}).select('id').maybeSingle();
    if(result.error){
      const conflict=['23505','23514','23503'].includes(result.error.code);
      return NextResponse.json({error:conflict
        ?'No se puede fijar ese horario: el barbero no atiende o coincide con otra reserva.'
        :'No se pudo guardar el turno fijo.'},{status:conflict?409:503,headers});
    }
    if(!result.data)return NextResponse.json({error:'El fijo no existe.'},{status:404,headers});
    return NextResponse.json({ok:true,id:result.data.id},{headers});
  }catch{
    return NextResponse.json({error:'No se pudieron guardar los cambios.'},{status:500,headers});
  }
}
