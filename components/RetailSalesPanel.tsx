'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {Package,ShoppingBag,RefreshCw,CheckCircle2,AlertTriangle} from 'lucide-react';

type Product={id:string;slug:string;name:string;description:string;price:number;stock_quantity:number;active:boolean};
type Sale={id:string;barber_id:string|null;actor_role:'barber'|'admin';quantity:number;unit_price:number|string;amount:number|string;payment_method:'cash'|'transfer';sold_at:string;retail_products?:{name:string}|null;barbers?:{name:string}|null};
type Adjustment={id:string;product_id:string;previous_stock:number;new_stock:number;note:string;created_at:string};
type Summary={unitsTotal:number|string;amountTotal:number|string;cashTotal:number|string;transferTotal:number|string;unitsThisMonth:number|string;amountThisMonth:number|string;cashThisMonth:number|string;transferThisMonth:number|string};
type Snapshot={products:Product[];sales:Sale[];summary:Summary;adjustments:Adjustment[]};
type Attempt={fingerprint:string;id:string};
const money=(v:number|string)=>'$'+Number(v||0).toLocaleString('es-UY',{maximumFractionDigits:2});

export default function RetailSalesPanel({scope}:{scope:'barber'|'admin'}) {
  const [data,setData]=useState<Snapshot|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [feedback,setFeedback]=useState('');
  const [busy,setBusy]=useState(false);
  const [productId,setProductId]=useState('');
  const [quantity,setQuantity]=useState(1);
  const [method,setMethod]=useState<'cash'|'transfer'>('cash');
  const [newStock,setNewStock]=useState('');
  const [reason,setReason]=useState('');
  const saleAttempt=useRef<Attempt|null>(null);
  const stockAttempt=useRef<Attempt|null>(null);

  const refresh=useCallback(async()=>{
    const r=await fetch('/api/retail?scope='+scope,{cache:'no-store',credentials:'same-origin'});
    const body=await r.json();
    if(!r.ok)throw new Error(body.error||'No se pudo consultar las ceras.');
    setData(body as Snapshot);
    setProductId(old=>body.products.some((p:Product)=>p.id===old)?old:body.products[0]?.id||'');
  },[scope]);

  useEffect(()=>{
    let mounted=true;
    setLoading(true);
    refresh().then(()=>{if(mounted)setError('');})
      .catch(err=>{if(mounted)setError(err instanceof Error?err.message:'No se pudieron cargar las ceras.');})
      .finally(()=>{if(mounted)setLoading(false);});
    return()=>{mounted=false;};
  },[refresh]);

  const product=data?.products.find(p=>p.id===productId);
  const saleFingerprint=JSON.stringify([productId,quantity,method]);
  const stockFingerprint=JSON.stringify([productId,newStock,reason.trim()]);

  const post=async(body:Record<string,unknown>)=>{
    const r=await fetch('/api/retail',{
      method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({...body,scope}),
    });
    const json=await r.json();
    if(!r.ok||!json.ok)throw new Error(json.error||'No se pudo confirmar el movimiento.');
    return json;
  };

  const registerSale=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(!product||busy||!Number.isInteger(quantity)||quantity<1||quantity>20||
      quantity>product.stock_quantity)return;
    if(!window.confirm('¿Confirmás que cobraste '+money(product.price*quantity)+
      ' en '+(method==='cash'?'efectivo':'transferencia')+' por '+quantity+' cera(s)?'))return;
    if(saleAttempt.current?.fingerprint!==saleFingerprint)
      saleAttempt.current={fingerprint:saleFingerprint,id:crypto.randomUUID()};
    setBusy(true);setError('');setFeedback('');
    try {
      const result=await post({
        action:'SALE',productId,quantity,method,requestId:saleAttempt.current.id,
      });
      saleAttempt.current=null;
      setFeedback(result.sale?.repeated?'La venta ya estaba guardada. No se duplicó.':
        'Venta registrada. El stock se descontó y el ingreso quedó para Nahuel, sin comisión.');
      setQuantity(1);
      try {await refresh();}
      catch {setFeedback('Venta guardada correctamente, pero el historial no pudo actualizarse. Usá Actualizar antes de registrar otra.');}
    } catch(err) {
      setError((err instanceof Error?err.message:'No se confirmó la venta.')+
        ' Si se cortó la conexión, revisá el historial antes de intentar otra venta.');
    } finally {setBusy(false);}
  };

  const updateStock=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(scope!=='admin'||!product||busy)return;
    const next=Number(newStock);
    if(!Number.isInteger(next)||next<0||next>100000||reason.trim().length<3)return;
    if(!window.confirm('¿Confirmás stock físico de '+next+' unidades? '+
      'Se registrará el cambio en el historial.'))return;
    if(stockAttempt.current?.fingerprint!==stockFingerprint)
      stockAttempt.current={fingerprint:stockFingerprint,id:crypto.randomUUID()};
    setBusy(true);setError('');setFeedback('');
    try {
      const result=await post({
        action:'SET_STOCK',productId,newStock:next,note:reason.trim(),
        requestId:stockAttempt.current.id,
      });
      stockAttempt.current=null;
      setFeedback(result.adjustment?.repeated?'El ajuste ya estaba registrado.':
        'Stock actualizado y movimiento auditado.');
      setNewStock('');setReason('');
      try {await refresh();}
      catch {setFeedback('Ajuste guardado correctamente, pero no se pudo refrescar la pantalla. Usá Actualizar.');}
    } catch(err) {
      setError((err instanceof Error?err.message:'No se pudo ajustar el stock.')+
        ' Revisá el historial antes de repetir.');
    } finally {setBusy(false);}
  };

  const summary=data?.summary;
  return (
    <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/90 p-4 sm:p-6"
      aria-label={scope==='admin'?'Productos y ventas':'Venta de ceras'}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black">
            <ShoppingBag className="h-5 w-5 text-emerald-400"/>Ceras · Ventas
          </h2>
          <p className="text-xs text-zinc-400">La venta es 100% de Nahuel. No genera comisión para los barberos.</p>
        </div>
        <button type="button" onClick={()=>{setError('');void refresh().catch(err=>setError(err.message));}}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-200">
          <RefreshCw className="h-4 w-4"/> Actualizar
        </button>
      </div>
      {loading&&<p className="text-sm text-zinc-400">Cargando inventario...</p>}
      {error&&<p role="alert" className="rounded-xl border border-rose-800 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</p>}
      {feedback&&<p role="status" className="flex items-center gap-2 rounded-xl border border-emerald-800 bg-emerald-950/30 p-3 text-sm text-emerald-200">
        <CheckCircle2 className="h-4 w-4 shrink-0"/>{feedback}</p>}
      {data&&<>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([
            ['Ventas este mes',String(summary?.unitsThisMonth??0)+' un.'],
            ['Ingresos este mes',money(summary?.amountThisMonth??0)],
            ['En efectivo',money(summary?.cashThisMonth??0)],
            ['Por transferencia',money(summary?.transferThisMonth??0)],
          ] as const).map(([label,value])=>(
            <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
              <p className="text-[11px] text-zinc-400">{label}</p>
              <p className="mt-1 text-lg font-extrabold text-emerald-300">{value}</p>
            </div>
          ))}
        </div>
        {data.products.length===0?<p className="text-sm text-zinc-400">Todavía no hay ceras configuradas.</p>:<>
          <label className="block text-xs font-semibold text-zinc-300">Producto
            <select value={productId} onChange={e=>setProductId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm">
              {data.products.map(p=><option key={p.id} value={p.id}>{p.name} · {money(p.price)}</option>)}
            </select>
          </label>
          {product&&<div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-700 bg-zinc-950 p-3">
            <span className="flex items-center gap-2 text-sm"><Package className="h-5 w-5 text-emerald-400"/>
              Stock disponible</span>
            <strong className="text-lg text-emerald-300">{product.stock_quantity} unidades</strong>
          </div>}
          <form onSubmit={registerSale} className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
            <h3 className="text-sm font-bold">Registrar venta cobrada</h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-zinc-400">Cantidad
                <input type="number" min="1" max={Math.min(20,product?.stock_quantity||0)}
                  value={quantity} onChange={e=>setQuantity(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-base text-white"/>
              </label>
              <label className="text-xs text-zinc-400">Medio de pago
                <select value={method} onChange={e=>setMethod(e.target.value as 'cash'|'transfer')}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-sm text-white">
                  <option value="cash">Efectivo</option><option value="transfer">Transferencia</option>
                </select>
              </label>
            </div>
            <p className="text-sm">Total a registrar: <strong className="text-emerald-300">{money((product?.price||0)*quantity)}</strong></p>
            <button type="submit" disabled={busy||!product||!product.active||quantity<1||quantity>20||quantity>product.stock_quantity}
              className="w-full rounded-xl bg-emerald-400 p-3 font-black text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40">
              {busy?'Registrando...':'Confirmar venta y descontar stock'}
            </button>
            {product?.stock_quantity===0&&<p className="flex items-center gap-2 text-xs text-amber-300">
              <AlertTriangle className="h-4 w-4"/>Sin unidades cargadas. Administración debe ingresar el stock real.
            </p>}
          </form>
          {scope==='admin'&&<form onSubmit={updateStock} className="space-y-3 rounded-xl border border-zinc-700 bg-zinc-950/60 p-3">
            <h3 className="text-sm font-bold">Actualizar stock físico</h3>
            <p className="text-xs text-zinc-400">Ingresá cuántas unidades hay actualmente en el local, no cuántas se agregan.</p>
            <input type="number" min="0" max="100000" placeholder="Unidades reales"
              value={newStock} onChange={e=>setNewStock(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-base"/>
            <input type="text" maxLength={240} placeholder="Motivo: conteo inicial, reposición, corrección..."
              value={reason} onChange={e=>setReason(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-base"/>
            <button type="submit" disabled={busy||!product||!newStock.trim()||reason.trim().length<3}
              className="w-full rounded-xl border border-emerald-500/50 p-3 text-sm font-bold text-emerald-300 disabled:opacity-40">
              Guardar stock con historial
            </button>
          </form>}
        </>}
        <div>
          <h3 className="mb-2 text-sm font-bold">Últimas ventas registradas</h3>
          {data.sales.length===0?<p className="text-xs text-zinc-400">Todavía no hay ventas de ceras.</p>:
            <div className="space-y-2">
              {data.sales.map(s=><div key={s.id} className="flex justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs">
                <div className="space-y-1">
                  <p className="font-semibold">{s.quantity} × {s.retail_products?.name||'Cera'}</p>
                  <p className="text-zinc-400">{new Date(s.sold_at).toLocaleString('es-UY',{timeZone:'America/Montevideo'})} ·
                    {' '}{s.actor_role==='admin'?'Administración':s.barbers?.name||'Barbero'} ·
                    {' '}{s.payment_method==='cash'?'Efectivo':'Transferencia'}
                  </p>
                </div>
                <strong className="whitespace-nowrap text-emerald-300">{money(s.amount)}</strong>
              </div>)}
            </div>}
        </div>
        {scope==='admin'&&data.adjustments.length>0&&<details className="border-t border-zinc-800 pt-3">
          <summary className="cursor-pointer text-xs font-bold text-zinc-300">Historial de ajustes de stock</summary>
          <div className="mt-2 space-y-1 text-xs text-zinc-400">
            {data.adjustments.map(a=><p key={a.id}>
              {new Date(a.created_at).toLocaleString('es-UY',{timeZone:'America/Montevideo'})}
              {' · '}{a.previous_stock} → {a.new_stock} · {a.note}
            </p>)}
          </div>
        </details>}
      </>}
    </section>
  );
}
