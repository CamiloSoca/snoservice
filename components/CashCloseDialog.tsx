'use client';

import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Banknote,CheckCircle2,CircleAlert,Coins,RefreshCcw,Wallet,X} from 'lucide-react';

type Drawer={
  registerId:string|null;
  cashOpen:boolean;
  openingVerified:boolean;
  reliable:boolean;
  unclassified:number;
  openingCash:number|string;
  cashIn:number|string;
  cashOut:number|string;
  expectedCash:number|string;
};
type Sales={
  registerId:string;
  cash:number;
  transfer:number;
  total:number;
  cashPercent:number;
  transferPercent:number;
  tipCash:number;
  tipTransfer:number;
  tipTotal:number;
};
type Preview={drawer:Drawer;sales:Sales};
type CloseResult={
  physicalCashVerified?:boolean;
  expectedCash?:number|string;
  countedCash?:number|string;
  difference?:number|string;
  fundNet?:number|string;
};

const money=(value:number|string|undefined)=>'$'+Number(value||0).toLocaleString('es-UY',{maximumFractionDigits:2});
const decimal=(value:number|string|undefined)=>Number(value||0);
const round=(n:number)=>Math.round(n*100)/100;

export default function CashCloseDialog({
  onCancel,onClosed,
}:{onCancel:()=>void;onClosed:(result:CloseResult)=>void}){
  const [preview,setPreview]=useState<Preview|null>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [counted,setCounted]=useState('');
  const [confirmed,setConfirmed]=useState(false);
  const [error,setError]=useState('');
  const [warning,setWarning]=useState('');
  const ref=useRef<HTMLInputElement>(null);
  const onCancelRef=useRef(onCancel);
  onCancelRef.current=onCancel;

  useEffect(()=>{
    const prior=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape')onCancelRef.current();
    };
    document.addEventListener('keydown',onKey);
    return()=>{
      document.body.style.overflow=prior;
      document.removeEventListener('keydown',onKey);
    };
  },[]);

  async function readPreview():Promise<Preview>{
    const res=await fetch('/api/admin/cash-close-preview',{cache:'no-store',credentials:'same-origin'});
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(data.error||'No se pudo consultar el arqueo.');
    if(!data.drawer?.cashOpen || !data.sales?.registerId)throw new Error('La caja ya no está abierta.');
    return data as Preview;
  }

  async function refresh(){
    setLoading(true);
    setError('');
    try{
      const current=await readPreview();
      setPreview(current);
      setWarning('');
    }catch(e){
      setPreview(null);
      setError(e instanceof Error?e.message:'No se pudo cargar el arqueo.');
    }finally{setLoading(false);}
  }

  useEffect(()=>{
    void refresh();
    // Se deja el campo vacío: la app nunca puede contar billetes por el barbero.
    ref.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const legacy=Boolean(preview && !preview.drawer.openingVerified);
  const blocked=Boolean(preview && !legacy && !preview.drawer.reliable);
  const normalized=counted.trim().replace(',','.');
  const valid=/^\d{1,8}(\.\d{1,2})?$/.test(normalized);
  const difference=valid && preview ? round(Number(normalized)-decimal(preview.drawer.expectedCash)):null;
  const canClose=Boolean(preview && !loading && !saving && !blocked && valid && confirmed);

  async function submit(e:React.FormEvent){
    e.preventDefault();
    if(!canClose || !preview)return;
    setSaving(true);
    setError('');
    try{
      // Volver a consultar antes de cerrar: una venta o propina puede entrar
      // mientras el diálogo está abierto.
      const fresh=await readPreview();
      const stale=fresh.drawer.registerId!==preview.drawer.registerId
        || round(decimal(fresh.drawer.expectedCash))!==round(decimal(preview.drawer.expectedCash))
        || fresh.sales.total!==preview.sales.total
        || fresh.sales.tipTotal!==preview.sales.tipTotal
        || fresh.drawer.reliable!==preview.drawer.reliable;
      if(stale){
        setPreview(fresh);
        setConfirmed(false);
        setWarning('Entraron movimientos nuevos o cambió el arqueo. Revisá los importes y confirmá nuevamente el efectivo contado.');
        return;
      }
      if(!fresh.drawer.openingVerified!==legacy){
        setError('El estado del arqueo cambió. Volvé a revisar la caja.');
        return;
      }
      if(!legacy && !fresh.drawer.reliable){
        setError('La caja tiene movimientos sin conciliar. Revisalos antes de cerrar.');
        return;
      }
      const response=await fetch('/api/admin',{
        method:'POST',
        credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          operation:'CLOSE_CASH',
          countedCash:normalized,
          acknowledgeLegacy:legacy,
        }),
      });
      const json=await response.json().catch(()=>({}));
      if(!response.ok || !json.ok)throw new Error(json.error||'No se pudo confirmar el cierre.');
      onClosed(json.summary||{});
    }catch(e){
      setError((e instanceof Error?e.message:'No se pudo cerrar la caja.')+' Revisá el estado antes de repetir.');
      setConfirmed(false);
    }finally{setSaving(false);}
  }

  return <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/85 px-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+1rem)] sm:px-5"
    role="presentation">
    <div role="dialog" aria-modal="true" aria-labelledby="cash-close-title"
      className="mx-auto w-full max-w-xl overflow-hidden rounded-3xl border border-zinc-700 bg-zinc-900 text-zinc-100 shadow-2xl">
      <header className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-4 sm:px-6">
        <div>
          <p className="mb-1 text-xs font-semibold text-emerald-400">13 Cut · Cierre de caja</p>
          <h2 id="cash-close-title" className="flex items-center gap-2 text-xl font-extrabold">
            <Wallet className="h-5 w-5" aria-hidden="true"/> Resumen de la jornada
          </h2>
          <p className="mt-1 text-xs text-zinc-400">
            {new Date().toLocaleDateString('es-UY',{timeZone:'America/Montevideo',day:'numeric',month:'long',year:'numeric'})}
          </p>
        </div>
        <button type="button" aria-label="Cancelar cierre" onClick={onCancel}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-950">
          <X className="h-5 w-5" aria-hidden="true"/>
        </button>
      </header>

      <div className="space-y-4 p-4 sm:p-6">
        {loading&&<p role="status" className="py-6 text-center text-sm text-zinc-400">Consultando los movimientos de la caja…</p>}
        {error&&<div role="alert" className="rounded-xl border border-rose-700/40 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</div>}
        {warning&&<div role="status" className="rounded-xl border border-amber-600/40 bg-amber-950/30 p-3 text-sm text-amber-200">{warning}</div>}
        {preview&&<form onSubmit={e=>{void submit(e)}} className="space-y-4">
          <div className="rounded-2xl border border-zinc-700 bg-zinc-950/80 p-4">
            <p className="text-xs text-zinc-400">Facturación por servicios</p>
            <p className="mt-1 text-3xl font-black tabular-nums">{money(preview.sales.total)}</p>
            <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-zinc-700" aria-hidden="true">
              <div className="bg-emerald-500" style={{width:preview.sales.cashPercent+'%'}}/>
              <div className="bg-slate-500" style={{width:preview.sales.transferPercent+'%'}}/>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-400">
              <span>Efectivo {preview.sales.cashPercent.toLocaleString('es-UY')} %</span>
              <span>Transferencia {preview.sales.transferPercent.toLocaleString('es-UY')} %</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
              <p className="flex items-center gap-1.5 text-xs text-zinc-400"><Banknote className="h-4 w-4 text-emerald-400"/> Efectivo</p>
              <p className="mt-1 text-xl font-extrabold tabular-nums">{money(preview.sales.cash)}</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
              <p className="flex items-center gap-1.5 text-xs text-zinc-400"><ArrowRight className="h-4 w-4"/> Transferencia</p>
              <p className="mt-1 text-xl font-extrabold tabular-nums">{money(preview.sales.transfer)}</p>
            </div>
          </div>

          <section className="space-y-2 rounded-2xl border border-zinc-800 p-4" aria-label="Control de efectivo físico">
            <h3 className="flex items-center gap-2 text-sm font-extrabold"><Coins className="h-4 w-4 text-emerald-400"/> Control del efectivo físico</h3>
            <div className="flex justify-between gap-2 text-sm"><span className="text-zinc-400">Efectivo al abrir</span><strong>{money(preview.drawer.openingCash)}</strong></div>
            <div className="flex justify-between gap-2 text-sm"><span className="text-zinc-400">Servicios en efectivo</span><strong>+{money(preview.sales.cash)}</strong></div>
            <div className="flex justify-between gap-2 text-sm"><span className="text-zinc-400">Propinas en efectivo</span><strong>+{money(preview.sales.tipCash)}</strong></div>
            <div className="flex justify-between gap-2 text-sm"><span className="text-zinc-400">Salidas en efectivo registradas</span><strong>−{money(preview.drawer.cashOut)}</strong></div>
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-zinc-800 px-3 py-3">
              <span className="text-xs font-bold">Efectivo esperado en caja</span>
              <strong className="text-xl font-black tabular-nums">{preview.drawer.reliable?money(preview.drawer.expectedCash):'Sin conciliar'}</strong>
            </div>
            {preview.sales.tipTransfer>0&&<p className="text-xs text-zinc-400">
              Otras propinas por transferencia: {money(preview.sales.tipTransfer)} (fuera del efectivo y de la facturación).
            </p>}
            <p className="text-[11px] leading-relaxed text-zinc-500">
              Las propinas no son facturación del local. Si quedaron en efectivo en el cajón, sí se cuentan en el arqueo.
            </p>
          </section>

          {legacy&&<div role="alert" className="rounded-xl border border-amber-600/40 bg-amber-950/30 p-3 text-xs text-amber-200">
            Esta es una caja histórica sin apertura verificada. El cierre se registrará como financiero y no podrá conciliar el efectivo físico.
          </div>}
          {blocked&&<div role="alert" className="rounded-xl border border-amber-600/40 bg-amber-950/30 p-3 text-xs text-amber-200">
            Caja con movimientos no clasificados. No se puede cerrar hasta revisar la conciliación.
          </div>}

          <label className="block space-y-2 text-sm font-semibold">
            ¿Cuánto efectivo contaste realmente?
            <input ref={ref} type="text" inputMode="decimal" autoComplete="off" required
              value={counted} onChange={e=>{setCounted(e.target.value);setConfirmed(false);setWarning('');}}
              placeholder="Ingresar monto contado..." aria-label="Efectivo físico contado (UYU)"
              className="block min-h-12 w-full rounded-xl border border-zinc-600 bg-zinc-950 px-4 py-3 text-base text-white outline-none focus:border-emerald-400"/>
            <span className="block text-[11px] font-normal text-zinc-400">
              Lo ingresás vos: el sistema nunca coloca automáticamente el monto esperado.
            </span>
          </label>
          {counted.trim()!=='' && !valid && <p role="alert" className="text-xs text-rose-300">Ingresá un monto válido, por ejemplo 3450 o 3450,50.</p>}
          {difference!==null && preview.drawer.reliable && <p role="status" className={['rounded-xl border p-3 text-xs font-semibold',
            difference===0?'border-emerald-700/40 bg-emerald-950/25 text-emerald-300':'border-amber-700/40 bg-amber-950/30 text-amber-200'
          ].join(' ')}>
            {difference===0
              ? 'El efectivo contado coincide con el arqueo.'
              : 'Diferencia de caja: '+money(Math.abs(difference))+
                (difference<0?' menos de lo esperado.':' más de lo esperado.')+
                ' Se registrará la diferencia real si confirmás.'}
          </p>}

          <div className="rounded-xl border border-zinc-700 bg-zinc-950/70 p-3 text-xs leading-relaxed text-zinc-300">
            <p className="font-bold text-zinc-100">Comisiones y sueldos semanales</p>
            <p className="mt-1">Las comisiones generadas se liquidan por separado cada semana. Solo se descuentan del efectivo cuando se registra el pago o retiro correspondiente.</p>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-zinc-700 p-3 text-xs leading-relaxed text-zinc-200">
            <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-emerald-500"/>
            <span>{legacy
              ? 'Confirmo que conté el dinero y entiendo que esta caja histórica se cerrará sin conciliación física.'
              : 'Confirmo que conté el efectivo físicamente y quiero registrar este monto, incluso si existe una diferencia.'}</span>
          </label>

          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button type="button" onClick={onCancel} disabled={saving}
              className="min-h-12 flex-1 rounded-xl border border-zinc-700 px-4 py-3 text-sm font-bold disabled:opacity-50">
              <ArrowLeft className="mr-2 inline h-4 w-4"/> Cancelar
            </button>
            <button type="submit" disabled={!canClose}
              className="min-h-12 flex-[1.5] rounded-xl bg-emerald-500 px-4 py-3 text-sm font-extrabold text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40">
              <CheckCircle2 className="mr-2 inline h-4 w-4"/>
              {saving?'Cerrando caja…':'Confirmar cierre de caja'}
            </button>
          </div>
        </form>}
        {!preview&&!loading&&<button onClick={()=>{void refresh()}} type="button"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-zinc-600 px-4 py-2 text-sm">
          <RefreshCcw className="h-4 w-4"/> Reintentar consulta
        </button>}
      </div>
    </div>
  </div>;
}
