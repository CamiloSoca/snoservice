'use client';
import {useState} from 'react';

export type MonthlyPeriod = {
  id:string;period_month:string;price_snapshot:number;included_cuts:number;
  paid_at:string;payment_method:'cash'|'transfer';uses:string[];
};
export type MonthlyPlan = {
  fixed_booking_id:string;monthly_price:number;included_cuts:number;
  active:boolean;periods:MonthlyPeriod[];
};

export default function FixedMonthlyPanel({fixedBookingId,plan,month,onUpdated}:{
  fixedBookingId:string;plan?:MonthlyPlan;month:string;onUpdated:()=>Promise<void>;
}){
  const [expanded,setExpanded]=useState(false);
  const [price,setPrice]=useState<string|null>(null);
  const [payMethod,setPayMethod]=useState<'cash'|'transfer'>('cash');
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const [history,setHistory]=useState<MonthlyPeriod[]>([]);
  const [showHistory,setShowHistory]=useState(false);
  const period=plan?.periods.find(p=>p.period_month===month);
  const used=period?.uses.length||0;
  const remaining=Math.max(0,(period?.included_cuts||4)-used);
  const displayPrice=price!==null?price:String(plan?.monthly_price??'');
  const money=(n:number)=>'$U '+Number(n).toLocaleString('es-UY',{maximumFractionDigits:2});
  const send=async(body:Record<string,unknown>)=>{
    setBusy(true);setError('');setNotice('');
    try{
      const response=await fetch('/api/admin/fixed-subscriptions',{
        method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({fixedBookingId,...body}),
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||'No se pudo completar la operación.');
      await onUpdated();
      setNotice(body.action==='pay'?'Mensualidad registrada en caja.':'Configuración guardada.');
      setPrice(null);
    }catch(e){setError(e instanceof Error?e.message:'Error inesperado.');}
    finally{setBusy(false);}
  };
  const configure=(active:boolean)=>{
    const amount=Number(displayPrice);
    if(!Number.isFinite(amount)||amount<=0||amount>100000000||Math.abs(amount*100-Math.round(amount*100))>1e-7){
      setError('Ingresá un importe mensual válido.');return;
    }
    void send({action:'configure',monthlyPrice:amount,active});
  };
  const pay=()=>{
    if(!plan?.active||period||busy)return;
    if(!window.confirm(`¿Confirmás que recibiste ${money(plan.monthly_price)} por el abono de ${month.slice(0,7)} mediante ${payMethod==='cash'?'efectivo':'transferencia'}? Se registrará una sola vez en la caja.`))return;
    void send({action:'pay',month,paymentMethod:payMethod});
  };
  const loadHistory=async()=>{
    setShowHistory(v=>!v);if(showHistory)return;
    try{
      const r=await fetch('/api/admin/fixed-subscriptions?fixedId='+fixedBookingId,{cache:'no-store',credentials:'same-origin'});
      const j=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(j.error||'No se pudo consultar el historial.');
      setHistory(j.items?.[0]?.periods||[]);
    }catch(e){setError(e instanceof Error?e.message:'No se pudo cargar el historial.');}
  };
  return <div className="rounded-xl border border-zinc-700/70 bg-zinc-950/80 p-3 space-y-3">
    <button type="button" onClick={()=>setExpanded(x=>!x)} aria-expanded={expanded}
      className="flex w-full min-h-11 items-center justify-between gap-3 text-left">
      <span className="text-sm font-semibold text-zinc-100">Abono mensual</span>
      <span className={'text-xs font-bold '+(period?'text-emerald-300':plan?.active?'text-amber-300':'text-zinc-400')}>
        {period?`Pagado · ${used}/4 cortes`:plan?.active?'Pendiente':'Configurar'} {expanded?'−':'+'}
      </span>
    </button>
    {expanded&&<div className="space-y-3 border-t border-zinc-800 pt-3">
      <label className="block text-xs text-zinc-400">Precio mensual ($U)
        <input inputMode="decimal" type="number" min="1" step="0.01" disabled={busy}
          value={displayPrice} onChange={e=>setPrice(e.target.value)}
          className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-base text-white"/>
      </label>
      <p className="text-xs text-zinc-400">4 cortes por mes · 1 por semana · Exclusivo del dueño.</p>
      <button type="button" disabled={busy} onClick={()=>configure(true)}
        className="w-full min-h-11 rounded-xl border border-emerald-500/50 p-3 text-sm font-bold text-emerald-300 disabled:opacity-50">
        {plan?.active?'Guardar importe / mantener activo':'Activar abono mensual'}
      </button>
      {plan?.active&&<button type="button" disabled={busy}
        onClick={()=>{if(window.confirm('¿Desactivar futuras mensualidades? Los meses ya pagados y su historial se conservarán.'))configure(false);}}
        className="w-full min-h-11 rounded-xl border border-zinc-700 p-3 text-xs text-zinc-300 disabled:opacity-50">
        Desactivar abono
      </button>}
      {period?<div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-1">
        <p className="text-sm font-semibold text-emerald-200">Mensualidad pagada · {money(period.price_snapshot)}</p>
        <p className="text-xs text-zinc-200">Cortes realizados: {used} de {period.included_cuts} · Restantes: {remaining}</p>
        <p className="text-xs text-zinc-400">{period.payment_method==='cash'?'Efectivo':'Transferencia'} · {period.paid_at.slice(0,10)}</p>
      </div>:plan?.active?<div className="space-y-2 rounded-lg border border-amber-500/30 p-3">
        <p className="text-sm font-semibold text-amber-200">Pago del mes pendiente</p>
        <p className="text-xs text-zinc-400">Registrar solamente cuando el cliente ya haya pagado. Requiere caja abierta.</p>
        <select aria-label="Método de pago del abono" value={payMethod} disabled={busy}
          onChange={e=>setPayMethod(e.target.value as 'cash'|'transfer')}
          className="w-full min-h-11 rounded-xl border border-zinc-700 bg-zinc-900 p-2 text-sm text-white">
          <option value="cash">Efectivo</option><option value="transfer">Transferencia</option>
        </select>
        <button type="button" disabled={busy} onClick={pay}
          className="w-full min-h-11 rounded-xl bg-emerald-400 p-3 text-sm font-extrabold text-zinc-950 disabled:opacity-50">
          {busy?'Guardando…':`Registrar pago · ${money(plan.monthly_price)}`}
        </button>
      </div>:null}
      {plan&&<button type="button" onClick={()=>{void loadHistory();}} className="text-xs font-semibold text-emerald-300 underline">
        {showHistory?'Ocultar historial':'Ver historial de mensualidades'}
      </button>}
      {showHistory&&<div className="space-y-2">
        {history.length===0?<p className="text-xs text-zinc-400">Todavía no hay pagos registrados.</p>:history.map(p=><div key={p.id} className="rounded-lg border border-zinc-800 p-2 text-xs text-zinc-300">
          {p.period_month.slice(0,7)} · {money(p.price_snapshot)} · {p.uses.length}/{p.included_cuts} cortes
        </div>)}
      </div>}
      {notice&&<p role="status" className="text-xs text-emerald-300">{notice}</p>}
      {error&&<p role="alert" className="text-xs text-red-300">{error}</p>}
    </div>}
  </div>;
}
