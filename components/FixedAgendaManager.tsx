'use client';
import {useCallback,useEffect,useState} from 'react';
import type {BarberItem,ServiceItem,ShopConfig} from '@/lib/booking-store';
import {resolvedHours} from '@/lib/weekly-hours';
import {fixedBookingStartSlots} from '@/lib/fixed-booking-time-slots';
import {upcomingFixedDates} from '@/lib/fixed-booking-occurrence';
import FixedMonthlyPanel, {type MonthlyPlan} from '@/components/FixedMonthlyPanel';
type Fixed={
  id:string;barber_id:string;service_id:string;client_name:string;client_phone:string;
  client_email:string;weekday:number;time_slot:string;duration_minutes:number;
  start_date:string;end_date:string|null;active:boolean;skipped_dates:string[];
};
const week=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const dayKeys=['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
const todayLocal=()=>{
 const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/Montevideo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const n=(k:string)=>p.find(x=>x.type===k)?.value||'';
 return n('year')+'-'+n('month')+'-'+n('day');
};
const empty=()=>({id:'',barberId:'',serviceId:'',clientName:'',clientPhone:'',
  clientEmail:'',weekday:6,timeSlot:'',startDate:todayLocal(),endDate:''});
const shortDate=(iso:string)=>iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4);

export default function FixedAgendaManager({barbers,services,shopSchedule}:{
  barbers:BarberItem[];services:ServiceItem[];shopSchedule:ShopConfig['schedule'];
}){
 const [items,setItems]=useState<Fixed[]>([]);
 const [draft,setDraft]=useState(empty);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [busySkip,setBusySkip]=useState('');
 const [dateByFixed,setDateByFixed]=useState<Record<string,string>>({});
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [monthlyPlans,setMonthlyPlans]=useState<MonthlyPlan[]>([]);
 const [monthlyMonth,setMonthlyMonth]=useState('');
 const refresh=useCallback(async()=>{
   try{
     const r=await fetch('/api/admin/fixed-bookings',{cache:'no-store',credentials:'same-origin'});
     const j=await r.json().catch(()=>({}));
     if(!r.ok)throw new Error(j.error||'No se pudo consultar agenda fija.');
     setItems(j.items||[]);setError('');
   }catch(e){setError(e instanceof Error?e.message:'Error de agenda fija.');}
   finally{setLoading(false);}
 },[]);
 const refreshMonthly=useCallback(async()=>{
   try{
     const response=await fetch('/api/admin/fixed-subscriptions',{cache:'no-store',credentials:'same-origin'});
     const data=await response.json().catch(()=>({}));
     if(!response.ok)throw new Error(data.error||'No se pudieron cargar las mensualidades.');
     setMonthlyPlans(Array.isArray(data.items)?data.items:[]);
     setMonthlyMonth(data.month||'');
   }catch(e){setError(e instanceof Error?e.message:'Error al cargar abonos.');}
 },[]);
 useEffect(()=>{void refresh();void refreshMonthly();},[refresh,refreshMonthly]);
 const selectedBarber=barbers.find(b=>b.id===draft.barberId&&b.active!==false);
 const selectedService=services.find(s=>s.id===draft.serviceId&&s.active!==false);
 const daySchedule=selectedBarber
   ? resolvedHours(shopSchedule,selectedBarber.workingSchedule)[dayKeys[draft.weekday]]
   : null;
 const startSlots=selectedService
   ? fixedBookingStartSlots(daySchedule,selectedService.durationMinutes):[];
 const upcomingDates=(item:Fixed)=>upcomingFixedDates(item,todayLocal());
 const set=(key:keyof ReturnType<typeof empty>,value:string|number)=>
   setDraft(current=>({...current,[key]:value,
     ...(['barberId','serviceId','weekday'].includes(key)?{timeSlot:''}:{})}));
 const submit=async(e:React.FormEvent)=>{
   e.preventDefault();if(saving)return;
   // No enviar una hora libre ni un bloque inválido, aunque el navegador
   // conserve un valor anterior tras cambiar el barbero, día o servicio.
   if(!startSlots.includes(draft.timeSlot)){
     setError('Elegí un bloque horario válido para ese barbero, día y servicio.');
     return;
   }
   setSaving(true);setError('');setNotice('');
   try{
     const r=await fetch('/api/admin/fixed-bookings',{
       method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',
       body:JSON.stringify({...draft,action:'save',id:draft.id||undefined,endDate:draft.endDate||null}),
     });
     const j=await r.json().catch(()=>({}));
     if(!r.ok)throw new Error(j.error||'No se pudo guardar.');
     setDraft(empty());setNotice('Agenda fija guardada. Este horario ya no se ofrece a otros clientes.');
     await refresh();
   }catch(e){setError(e instanceof Error?e.message:'No se pudieron guardar los datos.');}
   finally{setSaving(false);}
 };
 const skipOnce=async(item:Fixed,date:string,skip:boolean)=>{
   if(!date||busySkip)return;
   const message=skip
     ?'¿Liberar solo el '+shortDate(date)+'? Ese día se podrá reservar online; los demás '+week[item.weekday].toLowerCase()+' siguen fijos.'
     :'¿Restaurar el fijo del '+shortDate(date)+'? Solo se permitirá si no existe otra reserva.';
   if(!window.confirm(message))return;
   setBusySkip(item.id);setError('');setNotice('');
   try{
     const r=await fetch('/api/admin/fixed-bookings',{
       method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',
       body:JSON.stringify({action:'skip_date',id:item.id,date,skip}),
     });
     const j=await r.json().catch(()=>({}));
     if(!r.ok)throw new Error(j.error||'No se pudo cambiar esa fecha.');
     setNotice(skip
       ?'Se liberó únicamente el '+shortDate(date)+'. Las demás semanas siguen fijas.'
       :'Se restauró el fijo del '+shortDate(date)+'.');
     setDateByFixed(current=>({...current,[item.id]:''}));
     await refresh();
   }catch(e){setError(e instanceof Error?e.message:'No se pudo modificar la fecha.');}
   finally{setBusySkip('');}
 };
 const toggle=async(item:Fixed)=>{
   if(!window.confirm(item.active
     ?'¿Pausar este turno fijo? Sus horarios futuros volverán a estar disponibles.'
     :'¿Volver a habilitar este fijo? Se comprobarán posibles reservas superpuestas.'))return;
   setError('');setNotice('');
   try{
     const r=await fetch('/api/admin/fixed-bookings',{
       method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',
       body:JSON.stringify({action:'toggle',id:item.id,active:!item.active}),
     });
     const j=await r.json().catch(()=>({}));
     if(!r.ok)throw new Error(j.error||'No se pudo actualizar.');
     await refresh();
   }catch(e){setError(e instanceof Error?e.message:'No se pudo modificar el fijo.');}
 };
 return <div className="space-y-4">
   <header className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-6">
     <h2 className="text-xl font-extrabold">Agenda fija semanal</h2>
     <p className="mt-2 text-sm text-zinc-400">Reservá el mismo día y horario cada semana. Podés pausar todas las semanas o liberar únicamente una fecha si el cliente falta.</p>
     <p className="mt-2 text-xs text-amber-300">Estos horarios bloquean la reserva online. No se cobran automáticamente: para registrar un servicio atendido hay que completar su cobro por separado.</p>
   </header>
   {error&&<p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">{error}</p>}
   {notice&&<p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">{notice}</p>}
   <form onSubmit={e=>{void submit(e);}} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-6 space-y-4">
     <div className="flex items-center justify-between gap-2">
       <h3 className="text-base font-bold">{draft.id?'Editar cliente fijo':'Agregar cliente fijo'}</h3>
       {draft.id&&<button type="button" onClick={()=>setDraft(empty())} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs">Cancelar edición</button>}
     </div>
     <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
       <label className="text-xs text-zinc-400">Nombre y apellido *
         <input required minLength={3} maxLength={100} value={draft.clientName} onChange={e=>set('clientName',e.target.value)}
           className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-base text-white"/>
       </label>
       <label className="text-xs text-zinc-400">Celular (opcional)
         <input maxLength={30} type="tel" value={draft.clientPhone} onChange={e=>set('clientPhone',e.target.value)}
           className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-base text-white"/>
       </label>
       <label className="text-xs text-zinc-400">Correo (opcional)
         <input type="email" maxLength={180} value={draft.clientEmail} onChange={e=>set('clientEmail',e.target.value)}
           className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-base text-white"/>
       </label>
       <label className="text-xs text-zinc-400">Barbero *
         <select required value={draft.barberId} onChange={e=>set('barberId',e.target.value)}
           className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-white">
           <option value="">Seleccionar</option>{barbers.filter(b=>b.active!==false).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
         </select>
       </label>
       <label className="text-xs text-zinc-400">Servicio *
         <select required value={draft.serviceId} onChange={e=>set('serviceId',e.target.value)}
           className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-white">
           <option value="">Seleccionar</option>{services.filter(s=>s.active!==false).map(s=><option key={s.id} value={s.id}>{s.name} · {s.durationMinutes} min</option>)}
         </select>
       </label>
       <label className="text-xs text-zinc-400">Todos los *
         <select required value={draft.weekday} onChange={e=>set('weekday',Number(e.target.value))}
           className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-white">
           {week.map((label,i)=><option value={i} key={i}>{label}</option>)}
         </select>
       </label>
       <div className="space-y-2 sm:col-span-2">
         <p className="text-xs font-semibold text-zinc-300">Bloque de inicio * (cada 30 minutos)</p>
         <p className="text-[11px] text-zinc-400">Elegí primero barbero y servicio. Se muestran los bloques dentro de su horario según la duración del servicio.</p>
         {startSlots.length>0 ? <div role="group" aria-label="Elegir bloque horario fijo" className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
           {startSlots.map(slot=><button key={slot} type="button" disabled={saving}
             aria-pressed={draft.timeSlot===slot}
             onClick={()=>set('timeSlot',slot)}
             className={'min-h-11 rounded-xl border px-2 py-2 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-emerald-400 disabled:opacity-50 '+(
               draft.timeSlot===slot
               ?'border-emerald-300 bg-emerald-400 text-zinc-950'
               :'border-zinc-700 bg-zinc-950 text-zinc-100 hover:border-emerald-400')}>
             {slot}
           </button>)}
         </div> : <p className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-xs text-amber-300">
           {!selectedBarber||!selectedService?'Elegí un barbero y un servicio para ver los horarios.':'No hay bloques compatibles para este día y servicio.'}
         </p>}
         {draft.id&&draft.timeSlot&&!startSlots.includes(draft.timeSlot)&&
           <p role="status" className="text-xs text-amber-300">Este turno existente figura a las {draft.timeSlot} y se mantiene intacto. Para modificarlo, elegí un bloque compatible.</p>}
         <p className="text-[11px] text-zinc-500">El bloqueo definitivo de reservas fijas y comunes se valida al guardar.</p>
       </div>
       <label className="text-xs text-zinc-400">Válido desde *
         <input required type="date" value={draft.startDate} onChange={e=>set('startDate',e.target.value)}
           className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-white"/>
       </label>
       <label className="text-xs text-zinc-400">Hasta (opcional)
         <input type="date" min={draft.startDate} value={draft.endDate} onChange={e=>set('endDate',e.target.value)}
           className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-white"/>
         <span className="mt-1 block text-[11px] text-emerald-300">Dejalo vacío si el cliente viene todas las semanas sin fecha final.</span>
       </label>
     </div>
     <button type="submit" disabled={saving} className="w-full rounded-xl bg-emerald-400 p-3 font-extrabold text-zinc-950 disabled:opacity-50">
       {saving?'Guardando…':draft.id?'Guardar modificaciones':'Crear agenda fija'}
     </button>
   </form>
   <section className="space-y-2">
     <div className="flex items-center justify-between">
       <h3 className="font-bold">Clientes fijos ({items.filter(x=>x.active).length} activos)</h3>
       <button type="button" onClick={()=>{void refresh();}} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs">Actualizar</button>
     </div>
     {loading&&<p className="text-xs text-zinc-400">Cargando clientes fijos…</p>}
     {!loading&&items.length===0&&<p className="rounded-xl border border-zinc-800 p-4 text-sm text-zinc-400">Todavía no hay clientes fijos.</p>}
     {items.map(item=><div key={item.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-2">
       <div className="flex items-start justify-between gap-2">
         <div>
           <p className="font-bold">{item.client_name}</p>
           <p className="mt-1 text-xs text-zinc-400">{week[item.weekday]} · {item.time_slot} · {barbers.find(b=>b.id===item.barber_id)?.name||'Barbero'} · {services.find(s=>s.id===item.service_id)?.name||'Servicio'}</p>
           <p className="mt-1 text-[11px] text-zinc-500">{item.client_phone||'Sin celular'} · desde {item.start_date}{item.end_date?' hasta '+item.end_date:''}</p>
         </div>
         <span className={'rounded-lg px-2 py-1 text-[10px] font-bold '+(item.active?'bg-emerald-500/15 text-emerald-300':'bg-zinc-800 text-zinc-400')}>
           {item.active?'Activo':'Pausado'}
         </span>
       </div>
      {barbers.some(barber=>barber.id===item.barber_id&&barber.isOwner===true)&&monthlyMonth&&
        <FixedMonthlyPanel fixedBookingId={item.id} key={item.id}
          plan={monthlyPlans.find(plan=>plan.fixed_booking_id===item.id)}
          month={monthlyMonth} onUpdated={refreshMonthly}/>}
       <div className="flex flex-wrap gap-2">
         <button type="button" onClick={()=>{setDraft({id:item.id,barberId:item.barber_id,serviceId:item.service_id,
           clientName:item.client_name,clientPhone:item.client_phone,clientEmail:item.client_email,
           weekday:item.weekday,timeSlot:item.time_slot,startDate:item.start_date,endDate:item.end_date||''});
           window.scrollTo({top:0,behavior:'smooth'});}}
           className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold">Editar</button>
         <button type="button" onClick={()=>{void toggle(item);}}
           className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold">{item.active?'Pausar fijo (todas las semanas)':'Reactivar todas las semanas'}</button>
       </div>
       {item.active&&<div className="space-y-2 rounded-xl border border-zinc-700/70 bg-zinc-950/80 p-3">
         <p className="text-xs font-semibold text-emerald-300">¿No viene una semana?</p>
         <p className="text-[11px] text-zinc-400">Liberá solo esa fecha. El fijo continúa automáticamente en las demás semanas.</p>
         <div className="flex flex-col gap-2 sm:flex-row">
           <select aria-label={'Fecha de ausencia de '+item.client_name}
             value={upcomingDates(item).includes(dateByFixed[item.id])?dateByFixed[item.id]:upcomingDates(item)[0]||''}
             onChange={e=>setDateByFixed(current=>({...current,[item.id]:e.target.value}))}
             disabled={busySkip===item.id||upcomingDates(item).length===0}
             className="min-h-11 min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-sm text-white">
             {upcomingDates(item).map(date=><option key={date} value={date}>{week[item.weekday]} {shortDate(date)}</option>)}
             {upcomingDates(item).length===0&&<option value="">No hay fechas futuras disponibles</option>}
           </select>
           <button type="button" disabled={Boolean(busySkip)||upcomingDates(item).length===0}
             onClick={()=>{const dates=upcomingDates(item);
               void skipOnce(item,dates.includes(dateByFixed[item.id])?dateByFixed[item.id]:dates[0],true);
             }}
             className="min-h-11 rounded-xl border border-amber-500/50 bg-amber-500/10 px-3 text-xs font-semibold text-amber-200 disabled:opacity-50">
             {busySkip===item.id?'Actualizando…':'Liberar solo esta fecha'}
           </button>
         </div>
       </div>}
       {(item.skipped_dates||[]).filter(date=>date>=todayLocal()).length>0&&
         <div className="space-y-2">
           <p className="text-[11px] font-semibold text-amber-300">Fechas liberadas (el fijo NO viene esos días)</p>
           <div className="flex flex-wrap gap-2">
             {item.skipped_dates.filter(date=>date>=todayLocal()).map(date=>
               <button key={date} type="button" disabled={Boolean(busySkip)||!item.active}
                 onClick={()=>{void skipOnce(item,date,false);}}
                 className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 disabled:opacity-50">
                 {shortDate(date)} · Restaurar
               </button>)}
           </div>
         </div>}
     </div>)}
   </section>
 </div>;
}
