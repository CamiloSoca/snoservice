import {Suspense} from 'react';
import {connection} from 'next/server';
import Link from 'next/link';
import {ArrowLeft,ShoppingBag,Store,Wallet,ArrowRight} from 'lucide-react';
import {InitialShopSkeleton} from '@/components/InitialShopState';
import RetailProductPhoto from '@/components/RetailProductPhoto';
import {getServerPublicShopData} from '@/lib/server-public-shop';
import {getPublicRetailProducts} from '@/lib/server-public-retail';

const money=(n:number)=>'$'+n.toLocaleString('es-UY');

async function CerasContent(){
  await connection();
  const [shop,products]=await Promise.all([
    getServerPublicShopData(),
    getPublicRetailProducts().catch(()=>[]),
  ]);

  return <main className="min-h-screen bg-[#090b0a] px-4 pb-28 pt-[max(1.5rem,env(safe-area-inset-top))] text-zinc-100">
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-zinc-800 px-3 py-2 text-sm font-semibold hover:bg-zinc-900">
          <ArrowLeft className="h-4 w-4"/>Inicio</Link>
        <span className="truncate text-sm font-black">{shop.shopConfig.name}</span>
      </div>
      <header className="relative overflow-hidden rounded-[26px] border border-emerald-500/20 bg-[#141a17] px-5 py-6 sm:px-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-20 h-52 w-52 rounded-full bg-emerald-400/[0.06] blur-3xl"/>
        <p className="relative text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-400">13Cut · Productos para el pelo</p>
        <h1 className="relative mt-2 text-2xl font-black tracking-tight sm:text-3xl">Ceras y productos</h1>
        <p className="relative mt-2 max-w-xl text-sm leading-relaxed text-zinc-400">
          Productos seleccionados para cuidar tu estilo. Consultalos en la barbería y pagá en efectivo o por transferencia.
        </p>
      </header>
      {products.length===0&&<p className="rounded-2xl border border-zinc-800 p-5 text-sm text-zinc-400">
        Por el momento no hay productos para mostrar. Consultá en el local.
      </p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {products.map(product=><article key={product.id}
          className="flex min-w-0 flex-col gap-4 rounded-[26px] border border-zinc-800 bg-[#161a19] p-4 shadow-[0_14px_38px_rgba(0,0,0,0.15)] sm:p-5">
          <div className="flex items-center gap-4 sm:gap-5">
            <RetailProductPhoto src={product.imageUrl} slug={product.slug} name={product.name} size="catalog" priority={false}/>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-emerald-400">Cuidado del cabello</span>
              <h2 className="mt-1 text-base font-extrabold leading-snug sm:text-lg">{product.name}</h2>
              <p className="mt-3 text-2xl font-black text-emerald-400">{money(product.price)}</p>
              <span className="mt-1 block text-[11px] text-zinc-500">Consultá disponibilidad</span>
            </div>
          </div>
          {product.description&&<p className="border-t border-white/[0.06] pt-3 text-xs leading-relaxed text-zinc-400 sm:text-sm">
            {product.description}
          </p>}
        </article>)}
      </div>
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="flex gap-3 rounded-2xl border border-zinc-800 bg-[#121615] p-4">
          <Store className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400"/>
          <div><h3 className="text-sm font-bold">Retirá en la barbería</h3>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">{shop.shopConfig.address||'Consultá en el local'}.
            Preguntale a nuestros barberos.</p></div>
        </div>
        <div className="flex gap-3 rounded-2xl border border-zinc-800 bg-[#121615] p-4">
          <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400"/>
          <div><h3 className="text-sm font-bold">Pagá en el local</h3>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">Aceptamos efectivo o transferencia. No hay compra online.</p></div>
        </div>
      </section>
      <Link href="/agendar" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-500/25 px-4 py-2 text-sm font-bold text-emerald-300">
        <ShoppingBag className="h-4 w-4"/>Reservar un corte <ArrowRight className="h-4 w-4"/>
      </Link>
    </div>
  </main>;
}

export default function CerasPage(){
  return <Suspense fallback={<InitialShopSkeleton variant="home" label="Cargando productos..."/>}>
    <CerasContent/>
  </Suspense>;
}
