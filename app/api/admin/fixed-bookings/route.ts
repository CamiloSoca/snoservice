import {NextResponse} from 'next/server';
import {getSupabaseServer,SHOP_UUID} from '@/lib/supabase-server';
import {requireAdminSession,verifyCsrfOrigin} from '@/lib/session';
import {isValidUUID,sanitizeInput} from '@/lib/booking-store';

const headers={'Cache-Control':'private, no-store'};
const days=new Set([0,1,2,3,4,5,6]);
const iso=/^\d{4}-\d{2}-\d{2}$/;
const time=/^([01]\d|2[0-3]):[0-5]\d$/;

export async function GET(){
  if(!await requireAdminSession())return NextResponse.json({error:'Sesión requerida.'},{status:401,headers});
  const {data,error}=await getSupabaseServer().from('fixed_bookings')
    .select('id,barber_id,service_id,client_name,client_phone,client_email,weekday,time_slot,duration_minutes,start_date,end_date,active')
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
    // La validación definitiva de horarios, servicio y solapamientos es atómica en PostgreSQL.
    const payload={
      barber_id:barberId,service_id:serviceId,client_name:clientName,
      client_phone:clientPhone,client_email:clientEmail,weekday,time_slot:timeSlot,
      start_date:startDate,end_date:endDate,active:true,
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
