'use client';
import {useCallback,useEffect,useState} from 'react';
import type {BarberItem,ServiceItem} from '@/lib/booking-store';
type Fixed={
  id:string;barber_id:string;service_id:string;client_name:string;client_phone:string;
  client_email:string;weekday:number;time_slot:string;duration_minutes:number;
  start_date:string;end_date:string|null;active:boolean;
};
const week=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const todayLocal=()=>{
 const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/Montevideo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const n=(k:string)=>p.find(x=>x.type===k)?.value||'';
 return n('year')+'-'+n('month')+'-'+n('day');
};
const empty=()=>({id:'',barberId:'',serviceId:'',clientName:'',clientPhone:'',
  clientEmail:'',weekday:6,timeSlot:'09:00',startDate:todayLocal(),endDate:''});
export default function FixedAgendaManager({barbers,services}:{
  barbers:BarberItem[];services:ServiceItem[];
}){
 const [items,setItems]=useState<Fixed[]>([]);
 const [draft,setDraft]=useState(empty);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const refresh=useCallback(async()=>{
   try{
     const r=await fetch('/api/admin/fixed-bookings',{cache:'no-store',credentials:'same-origin'});
     const j=await r.json().catch(()=>({}));
     if(!r.ok)throw new Error(j.error||'No se pudo consultar agenda fija.');
     setItems(j.items||[]);setError('');
   }catch(e){setError(e instanceof Error?e.message:'Error de agenda fija.');}
   finally{setLoading(false);}
 },[]);
 useEffect(()=>{void refresh();},[refresh]);
 const set=(key:keyof ReturnType<typeof empty>,value:string|number)=>
   setDraft(current=>({...current,[key]:value}));
 const submit=async(e:React.FormEvent)=>{
   e.preventDefault();if(saving)return;
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
     <p className="mt-2 text-sm text-zinc-400">Reservá el mismo día y horario cada semana para un cliente. Podés modificarlo o pausarlo cuando quieras.</p>
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
       <label className="text-xs text-zinc-400">A las *
         <input required type="time" step={1800} value={draft.timeSlot} onChange={e=>set('timeSlot',e.target.value)}
           className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-white"/>
       </label>
       <label className="text-xs text-zinc-400">Válido desde *
         <input required type="date" value={draft.startDate} onChange={e=>set('startDate',e.target.value)}
           className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-white"/>
       </label>
       <label className="text-xs text-zinc-400">Hasta (opcional)
         <input type="date" min={draft.startDate} value={draft.endDate} onChange={e=>set('endDate',e.target.value)}
           className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-white"/>
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
       <div className="flex flex-wrap gap-2">
         <button type="button" onClick={()=>{setDraft({id:item.id,barberId:item.barber_id,serviceId:item.service_id,
           clientName:item.client_name,clientPhone:item.client_phone,clientEmail:item.client_email,
           weekday:item.weekday,timeSlot:item.time_slot,startDate:item.start_date,endDate:item.end_date||''});
           window.scrollTo({top:0,behavior:'smooth'});}}
           className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold">Editar</button>
         <button type="button" onClick={()=>{void toggle(item);}}
           className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold">{item.active?'Pausar fijo':'Reactivar'}</button>
       </div>
     </div>)}
   </section>
 </div>;
}
