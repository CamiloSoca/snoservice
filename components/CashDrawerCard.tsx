'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {OnSitePaymentMethod} from '@/lib/payment-method';

type Drawer={
  registerId:string|null;cashOpen:boolean;openingVerified:boolean;
  openingCash:number|string;cashIn:number|string;cashOut:number|string;
  transferIn:number|string;transferOut:number|string;expectedCash:number|string;
  unclassified:number;reliable:boolean;closingCounted:number|string|null;
  cashVariance:number|string|null;
};
type Draw={id:string;amount:number|string;method:OnSitePaymentMethod;note:string;created_at:string;register_id:string};
type Report={drawer:Drawer;ownerDraws:Draw[]};
const fmt=(n:number|string|null|undefined)=>'$'+Number(n||0).toLocaleString('es-UY',{maximumFractionDigits:2});
export default function CashDrawerCard(){
  const [report,setReport]=useState<Report|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const [method,setMethod]=useState<OnSitePaymentMethod>('cash');
  const [amount,setAmount]=useState('');
  const [note,setNote]=useState('');
  const [saving,setSaving]=useState(false);
  const attempt=useRef<{key:string;fingerprint:string}|null>(null);
  const refresh=useCallback(async()=>{
    try{
      const res=await fetch('/api/finance/cash',{cache:'no-store',credentials:'same-origin'});
      const json=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(json.error||'No se pudo cargar el arqueo.');
      setReport(json);setError('');
    }catch(e){setError(e instanceof Error?e.message:'Error al consultar caja.');}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{
    void refresh(); const fn=()=>{if(document.visibilityState==='visible')void refresh();};
    document.addEventListener('visibilitychange',fn);
    return()=>document.removeEventListener('visibilitychange',fn);
  },[refresh]);
  const drawer=report?.drawer;
  async function submit(e:React.FormEvent){
    e.preventDefault();
    if(saving||!drawer?.cashOpen)return;
    if(!/^\d{1,8}(\.\d{1,2})?$/.test(amount.trim())||Number(amount)<=0){
      setError('Ingresá un monto válido mayor a cero.');return;
    }
    if(method==='cash'&&(!drawer.reliable||Number(drawer.expectedCash)<Number(amount))){
      setError('No hay efectivo verificado suficiente. Revisá el arqueo primero.');return;
    }
    if(!window.confirm('¿Confirmás que retiraste '+fmt(amount)+' de la barbería por '+(method==='cash'?'efectivo':'transferencia')+'? Quedará registrado como retiro del propietario, NO como gasto.'))return;
    const fingerprint=JSON.stringify([amount.trim(),method,note.trim()]);
    if(!attempt.current||attempt.current.fingerprint!==fingerprint)attempt.current={key:crypto.randomUUID(),fingerprint};
    setSaving(true);setError('');setSuccess('');
    try{
      const resp=await fetch('/api/finance/cash',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({operation:'OWNER_DRAW',requestId:attempt.current.key,amount:amount.trim(),method,note:note.trim()})});
      const json=await resp.json().catch(()=>({}));
      if(!resp.ok||!json.ok)throw new Error(json.error||'No se confirmó el retiro.');
      setSuccess(json.draw?.repeated?'Este retiro ya estaba registrado, no se duplicó.':'Retiro del dueño registrado.');
      setAmount('');setNote('');attempt.current=null;await refresh();
    }catch(e){
      setError((e instanceof Error?e.message:'Error al retirar.')+' Revisá el historial antes de intentar nuevamente.');
    }finally{setSaving(false);}
  }
  return <section aria-label="Arqueo de caja" className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-4 sm:p-6 space-y-4">
    <div className="flex items-center justify-between gap-3">
      <div>
        <h3 className="font-extrabold text-base text-white">Arqueo y retiros del dueño</h3>
        <p className="mt-1 text-xs text-zinc-400">El resultado del negocio y el efectivo en cajón son cuentas distintas.</p>
      </div>
      <button type="button" onClick={()=>{void refresh();}} className="shrink-0 rounded-lg border border-zinc-700 p-2 text-xs font-bold">Actualizar</button>
    </div>
    {loading&&<p className="text-xs text-zinc-400">Consultando caja…</p>}
    {error&&<p role="alert" className="rounded-xl border border-red-700/50 bg-red-950/30 p-3 text-xs text-red-200">{error}</p>}
    {success&&<p role="status" className="rounded-xl border border-emerald-700/50 bg-emerald-950/30 p-3 text-xs text-emerald-200">{success}</p>}
    {drawer?.registerId&&<>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([
          ['Inicial contado',fmt(drawer.openingCash)],
          ['Cobrado en efectivo',fmt(drawer.cashIn)],
          ['Salidas en efectivo',fmt(drawer.cashOut)],
          ['Efectivo esperado',drawer.reliable?fmt(drawer.expectedCash):'Sin conciliar'],
        ] as const).map(([name,value])=><div key={name} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-[10px] text-zinc-400">{name}</p>
          <p className="mt-1 text-sm font-black text-emerald-400">{value}</p>
        </div>)}
      </div>
      <p className="text-xs text-zinc-400">Transferencias recibidas: <strong className="text-zinc-200">{fmt(drawer.transferIn)}</strong>.
        Transferencias de salida: <strong className="text-zinc-200">{fmt(drawer.transferOut)}</strong>.
        No forman parte del efectivo del cajón.</p>
      {!drawer.reliable&&<p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
        Arqueo no conciliado: {Number(drawer.unclassified)||0} movimientos sin medio de pago comprobado
        {drawer.openingVerified?'':', y el efectivo inicial aún no fue contado'}. Los retiros en efectivo se bloquean hasta conciliar.</p>}
      {!drawer.cashOpen&&drawer.closingCounted!=null&&<p className="text-xs text-zinc-300">
        Último cierre: contado {fmt(drawer.closingCounted)}, diferencia {fmt(drawer.cashVariance)}.</p>}
    </>}
    {drawer?.cashOpen&&<form onSubmit={e=>{void submit(e);}} className="space-y-3 rounded-2xl border border-zinc-700 bg-zinc-950 p-3 sm:p-4">
      <h4 className="font-bold text-sm text-white">Registrar dinero retirado por el dueño</h4>
      <label className="block text-xs text-zinc-400">Monto en pesos
        <input type="number" min="0.01" step="0.01" required inputMode="decimal" value={amount}
          onChange={e=>{setAmount(e.target.value);attempt.current=null;}}
          className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-sm text-white" />
      </label>
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="mb-2 text-xs text-zinc-400">Cómo retiraste el dinero</legend>
        {([{id:'cash',name:'Efectivo'},{id:'transfer',name:'Transferencia'}] as const).map(m=>
          <button key={m.id} type="button" aria-pressed={method===m.id} onClick={()=>{setMethod(m.id);attempt.current=null;}}
            className={'rounded-xl border p-3 text-xs font-bold '+(method===m.id?'border-emerald-400 bg-emerald-500/15 text-emerald-200':'border-zinc-700 text-zinc-300')}>
            {m.name}
          </button>)}
      </fieldset>
      <label className="block text-xs text-zinc-400">Detalle opcional
        <input value={note} maxLength={180} onChange={e=>{setNote(e.target.value);attempt.current=null;}}
          placeholder="Ej.: retiro al cierre" className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-sm text-white" />
      </label>
      <button type="submit" disabled={saving||(method==='cash'&&!drawer.reliable)} className="w-full rounded-xl bg-emerald-400 p-3 text-sm font-black text-zinc-950 disabled:opacity-40">
        {saving?'Guardando…':'Confirmar retiro del dueño'}
      </button>
      <p className="text-[11px] text-zinc-500">Este retiro no se registra como gasto ni descuenta una segunda vez la ganancia.</p>
    </form>}
    <div className="space-y-2">
      <h4 className="text-sm font-bold">Historial de retiros del dueño</h4>
      {report?.ownerDraws.length===0&&<p className="text-xs text-zinc-500">Sin retiros todavía.</p>}
      {report?.ownerDraws.map(r=><div key={r.id} className="flex items-center justify-between gap-2 border-b border-zinc-800 py-2 text-xs">
        <div><p className="font-semibold">{fmt(r.amount)} · {r.method==='cash'?'Efectivo':'Transferencia'}</p>
          <p className="text-zinc-500">{new Date(r.created_at).toLocaleString('es-UY',{timeZone:'America/Montevideo'})} {r.note?' · '+r.note:''}</p></div>
        <span className="text-emerald-400">Registrado</span>
      </div>)}
    </div>
  </section>;
}