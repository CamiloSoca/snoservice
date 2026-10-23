'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import type {OnSitePaymentMethod} from '@/lib/payment-method';

interface Balance {
  barber_id:string;
  barber_name:string;
  is_owner:boolean;
  earned:number|string;
  paid:number|string;
  outstanding:number|string;
}
interface Payout {
  id:string;barber_id:string;amount:number|string;method:OnSitePaymentMethod;
  note:string;created_at:string;
}
interface Payload {
  balances:Balance[];
  payouts:Payout[];
  cashOpen:boolean;
  physicalCashVerified:boolean;
}
const money=(value:number|string)=>'$'+Number(value).toLocaleString('es-UY',{minimumFractionDigits:0,maximumFractionDigits:2});

export default function FinanceLedgerCard({mode}:{mode:'admin'|'barber'}) {
  const [data,setData]=useState<Payload|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [feedback,setFeedback]=useState('');
  const [selected,setSelected]=useState('');
  const [amount,setAmount]=useState('');
  const [method,setMethod]=useState<OnSitePaymentMethod>('cash');
  const [note,setNote]=useState('');
  const [saving,setSaving]=useState(false);
  const attempt=useRef<{fingerprint:string;requestId:string}|null>(null);

  const load=useCallback(async()=>{
    try {
      const r=await fetch('/api/finance/payouts',{credentials:'same-origin',cache:'no-store'});
      const json=await r.json().catch(()=>({}));
      if (!r.ok) throw new Error(json.error||'No se pudieron consultar las liquidaciones.');
      setData(json);
      setError('');
    } catch (e) {
      setError(e instanceof Error?e.message:'Error de conexión.');
    } finally {
      setLoading(false);
    }
  },[]);

  useEffect(()=>{
    void load();
    const onFocus=()=>{void load();};
    const onVisible=()=>{if(document.visibilityState==='visible')void load();};
    window.addEventListener('focus',onFocus);
    document.addEventListener('visibilitychange',onVisible);
    return ()=>{
      window.removeEventListener('focus',onFocus);
      document.removeEventListener('visibilitychange',onVisible);
    };
  },[load]);

  const selectedBarber=data?.balances.find(item=>item.barber_id===selected);
  const payable=(data?.balances||[]).filter(x=>!x.is_owner);

  async function registerPayout(event:React.FormEvent) {
    event.preventDefault();
    if (saving||!selectedBarber||!data?.cashOpen)return;
    const amountValue=amount.trim();
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(amountValue)||Number(amountValue)<=0||
      Number(amountValue)>Number(selectedBarber.outstanding)) {
      setError('Elegí un barbero e ingresá un monto que no supere su saldo pendiente.');
      return;
    }
    if (!window.confirm('¿Confirmás que ya entregaste ' + money(amountValue) +
      ' por ' + (method==='cash'?'efectivo':'transferencia') + ' a ' + selectedBarber.barber_name +
      '? Esta operación queda registrada y no se borra.')) return;
    const fingerprint=JSON.stringify([selected,amountValue,method,note.trim()]);
    if (attempt.current?.fingerprint!==fingerprint){
      attempt.current={fingerprint,requestId:crypto.randomUUID()};
    }
    setSaving(true);
    setError('');
    setFeedback('');
    try {
      const response=await fetch('/api/finance/payouts',{
        method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({operation:'RECORD_BARBER_PAYOUT',
          barberId:selected,requestId:attempt.current.requestId,
          amount:amountValue,method,note:note.trim()}),
      });
      const json=await response.json().catch(()=>({}));
      if (!response.ok||!json.ok)throw new Error(json.error||'No se confirmó el pago.');
      attempt.current=null;
      setAmount('');
      setNote('');
      setFeedback(json.payout?.repeated?'Este pago ya estaba registrado; no se duplicó.':'Pago registrado correctamente.');
      await load();
    } catch(e){
      setError((e instanceof Error?e.message:'No se pudo registrar el pago.')+
        ' Si la conexión se cortó, consultá el historial antes de repetir.');
    } finally{setSaving(false);}
  }

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-4 sm:p-6 space-y-4" aria-label="Liquidaciones de barberos">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-extrabold text-zinc-100">
            {mode==='admin'?'Liquidaciones del equipo':'Mis comisiones y retiros'}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">
            Generado, efectivamente pagado y pendiente. Los retiros no modifican nuevamente la ganancia del negocio.
          </p>
        </div>
        <button type="button" onClick={()=>{void load();}}
          className="rounded-xl border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-200">
          Actualizar
        </button>
      </div>
      <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
        Saldo histórico calculado. Antes de operar con dinero real verificá las comisiones,
        propinas y cualquier adelanto entregado anteriormente.
      </p>
      {loading&&<p className="text-sm text-zinc-400">Consultando movimientos…</p>}
      {error&&<p role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">{error}</p>}
      {feedback&&<p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">{feedback}</p>}

      {data && !data.physicalCashVerified && (
        <p className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-[11px] text-zinc-400">
          El efectivo físico todavía no fue arqueado en este módulo. El saldo pendiente de comisiones
          no significa que haya ese importe disponible en el cajón.
        </p>
      )}

      {data?.balances.map(b=>(
        <div key={b.barber_id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-bold text-sm">{b.barber_name}</p>
            {b.is_owner&&<span className="text-[10px] text-zinc-500">Propietario: sin comisión</span>}
          </div>
          {!b.is_owner&&<div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[['Generado',b.earned],['Pagado',b.paid],['Pendiente',b.outstanding]].map(([label,value])=>
              <div key={label} className="min-w-0 rounded-lg bg-zinc-900 p-2">
                <p className="text-[10px] text-zinc-400">{label}</p>
                <p className={'mt-1 truncate text-xs font-black '+(label==='Pendiente'?'text-emerald-400':'text-zinc-100')}>
                  {money(value)}
                </p>
              </div>)}
          </div>}
        </div>
      ))}

      {mode==='admin'&&data&&(
        <form className="space-y-3 rounded-xl border border-zinc-700 bg-zinc-950 p-4"
          onSubmit={event=>{void registerPayout(event);}}>
          <h4 className="font-bold text-sm">Registrar retiro entregado en el local</h4>
          <p className="text-[11px] text-zinc-400">Solo administración confirma pagos. El barbero no puede descontarse dinero a sí mismo.</p>
          <label className="block text-xs text-zinc-400">Barbero
            <select value={selected} onChange={e=>{setSelected(e.target.value);setAmount('');attempt.current=null;}}
              required className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-sm text-white">
              <option value="">Seleccioná el barbero</option>
              {payable.map(b=><option key={b.barber_id} value={b.barber_id}>{b.barber_name} — pendiente {money(b.outstanding)}</option>)}
            </select>
          </label>
          <label className="block text-xs text-zinc-400">Importe entregado (UYU)
            <input type="number" min="0.01" step="0.01" inputMode="decimal" required value={amount}
              onChange={e=>{setAmount(e.target.value);attempt.current=null;}}
              className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-sm text-white" placeholder="0"/>
          </label>
          <fieldset className="space-y-2">
            <legend className="text-xs text-zinc-400">Medio de pago</legend>
            <div className="grid grid-cols-2 gap-2">
              {([{id:'cash',label:'Efectivo'},{id:'transfer',label:'Transferencia'}] as const).map(x=>
                <button type="button" key={x.id} aria-pressed={method===x.id} onClick={()=>{setMethod(x.id);attempt.current=null;}}
                  className={'rounded-xl border px-2 py-3 text-xs font-bold '+
                    (method===x.id?'border-emerald-400 bg-emerald-500/15 text-emerald-200':'border-zinc-700 text-zinc-400')}>
                  {x.label}
                </button>)}
            </div>
          </fieldset>
          <label className="block text-xs text-zinc-400">Nota (opcional)
            <input value={note} maxLength={180} onChange={e=>{setNote(e.target.value);attempt.current=null;}}
              className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-sm text-white"
              placeholder="Ej.: liquidación semanal"/>
          </label>
          {!data.cashOpen&&<p className="text-xs text-amber-300">Abrí la caja para registrar pagos.</p>}
          <button type="submit" disabled={saving||!data.cashOpen||!selectedBarber||Number(amount)<=0}
            className="w-full rounded-xl bg-emerald-400 p-3 text-sm font-black text-zinc-950 disabled:opacity-40">
            {saving?'Registrando…':'Confirmar dinero entregado'}
          </button>
        </form>
      )}
      {data&&<div className="space-y-2">
        <h4 className="font-bold text-sm">Últimos pagos</h4>
        {data.payouts.length===0
          ? <p className="text-xs text-zinc-500">Todavía no se registraron retiros.</p>
          : data.payouts.map(p=><div key={p.id} className="flex justify-between gap-2 border-b border-zinc-800 py-2 text-xs">
            <div>
              <p className="font-semibold text-zinc-100">{money(p.amount)} · {p.method==='cash'?'Efectivo':'Transferencia'}</p>
              <p className="text-zinc-500">{new Date(p.created_at).toLocaleString('es-UY',{timeZone:'America/Montevideo'})} {p.note?'· '+p.note:''}</p>
            </div>
            <span className="text-emerald-400">Registrado</span>
          </div>)}
      </div>}
    </section>
  );
}
