'use client';

import {useEffect,useState} from 'react';
import Link from 'next/link';
import {ArrowLeft,Package,ShoppingBag,Store,Wallet} from 'lucide-react';
import {PublicShopGate} from '@/components/PublicShopProvider';
import type {PublicShopData} from '@/lib/public-shop-data';

type PublicProduct={id:string;slug:string;name:string;description:string;price:number;available:boolean};
const money=(v:number)=>'$'+v.toLocaleString('es-UY');

function CerasCatalogue({shop}:{shop:PublicShopData}) {
  const [products,setProducts]=useState<PublicProduct[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    fetch('/api/retail?scope=public',{cache:'no-store'})
      .then(async r=>{const body=await r.json();if(!r.ok)throw new Error(body.error||'No se pudo cargar el catálogo.');return body;})
      .then(body=>{if(active)setProducts(body.products||[]);})
      .catch(err=>{if(active)setError(err.message||'No se pudo cargar el catálogo.');})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[]);
  return <main className="min-h-screen bg-zinc-950 px-4 pb-32 pt-6 text-zinc-100">
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 px-3 py-2 text-sm font-semibold">
          <ArrowLeft className="h-4 w-4"/>Inicio</Link>
        <span className="text-sm font-black">{shop.shopConfig.name}</span>
      </div>
      <header className="rounded-3xl border border-emerald-500/20 bg-zinc-900 p-6">
        <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">Productos para el pelo</p>
        <h1 className="mt-2 text-3xl font-black">Ceras disponibles</h1>
        <p className="mt-2 max-w-xl text-sm text-zinc-300">Conocé las ceras que podés conseguir en la barbería.
          El pago se realiza en el local, en efectivo o por transferencia. No hay compra online.</p>
      </header>
      {loading&&<p className="text-sm text-zinc-400">Consultando productos...</p>}
      {error&&<p role="alert" className="rounded-xl border border-rose-700 p-4 text-sm text-rose-200">{error}</p>}
      {products.length===0&&!loading&&!error&&<p className="text-sm text-zinc-400">Próximamente tendremos productos disponibles.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {products.map(product=><article key={product.id} className="space-y-4 rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex h-28 items-center justify-center rounded-2xl bg-zinc-950">
            <Package className="h-12 w-12 text-emerald-400" aria-hidden="true"/>
          </div>
          <div>
            <h2 className="text-lg font-extrabold">{product.name}</h2>
            <p className="mt-2 text-sm text-zinc-400">{product.description}</p>
          </div>
          <div className="flex items-center justify-between">
            <strong className="text-3xl text-emerald-400">{money(product.price)}</strong>
            <span className="text-xs text-zinc-400">{product.available?'Consultá en el local':'Consultar disponibilidad'}</span>
          </div>
        </article>)}
      </div>
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 p-4">
          <Store className="mb-2 h-5 w-5 text-emerald-400"/>
          <h3 className="font-bold">Compra en la barbería</h3>
          <p className="mt-1 text-sm text-zinc-400">{shop.shopConfig.address||'Consultá en el local'}.
            Preguntale a cualquiera de nuestros barberos.</p>
        </div>
        <div className="rounded-2xl border border-zinc-800 p-4">
          <Wallet className="mb-2 h-5 w-5 text-emerald-400"/>
          <h3 className="font-bold">Pago al retirar</h3>
          <p className="mt-1 text-sm text-zinc-400">Aceptamos efectivo o transferencia en el local.
            Esta web no cobra ni reserva productos.</p>
        </div>
      </section>
      <Link href="/agendar" className="inline-flex items-center gap-2 text-sm font-bold text-emerald-300">
        <ShoppingBag className="h-4 w-4"/>¿Querés reservar un corte? Ir a la agenda
      </Link>
    </div>
  </main>;
}

export default function CerasPage() {
  return <PublicShopGate variant="home" label="Cargando productos...">
    {shop=><CerasCatalogue shop={shop}/>}
  </PublicShopGate>;
}
