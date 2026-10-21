'use client';

import { CalendarDays, Scissors, ShieldCheck, UserRound, RefreshCw } from 'lucide-react';

type LoadVariant = 'home' | 'booking' | 'barber' | 'admin';

interface InitialShopStateProps {
  label?: string;
  variant?: LoadVariant;
}

const variantTitles: Record<LoadVariant, string> = {
  home: 'Preparando tu visita',
  booking: 'Buscando tu próximo turno',
  barber: 'Preparando tu espacio',
  admin: 'Organizando tu panel',
};

function LoadingMark({variant}: {variant: LoadVariant}) {
  const iconClass = 'w-5 h-5 text-emerald-300';
  if (variant === 'booking') return <CalendarDays className={iconClass} aria-hidden="true" />;
  if (variant === 'barber') return <UserRound className={iconClass} aria-hidden="true" />;
  if (variant === 'admin') return <ShieldCheck className={iconClass} aria-hidden="true" />;
  return <Scissors className={iconClass} aria-hidden="true" />;
}

function SkeletonBar({className = ''}: {className?: string}) {
  return <div className={`sno-skeleton rounded-lg ${className}`} />;
}

// Formas próximas a las de cada pantalla, sin mostrar datos de ejemplo ni
// un overlay que bloquee la navegación mientras se reciben los datos reales.
export function InitialShopSkeleton({
  label = 'Cargando información del local...',
  variant = 'home',
}: InitialShopStateProps) {
  const isDashboard = variant === 'admin' || variant === 'barber';

  return (
    <div className="relative min-h-[75vh] bg-[#09090b] text-zinc-100 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_50%_0%,rgba(16,185,129,0.07),transparent_56%)]" />
      <div className="relative max-w-5xl mx-auto px-4 py-5 sm:py-7">
        <div className="flex items-center gap-3 pb-5 border-b border-white/[0.06]" aria-hidden="true">
          <div className="size-10 rounded-xl flex items-center justify-center bg-zinc-900/90 ring-1 ring-zinc-800/80">
            <Scissors className="size-4 text-zinc-400" />
          </div>
          <div className="space-y-2">
            <SkeletonBar className="w-28 h-3" />
            <SkeletonBar className="w-40 h-2" />
          </div>
        </div>

        <div className="max-w-xl mx-auto mt-8 sm:mt-11 text-center space-y-3">
          <div className="mx-auto size-12 flex items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06]">
            <LoadingMark variant={variant} />
          </div>
          <p className="text-[10px] tracking-[0.26em] uppercase font-semibold text-emerald-400/75">
            Un momento
          </p>
          <h1 className="font-semibold text-xl sm:text-2xl tracking-tight text-zinc-100">
            {variantTitles[variant]}
          </h1>
          <p role="status" aria-live="polite" className="text-sm text-zinc-400">
            {label}
          </p>
          <div className="max-w-44 mx-auto pt-3" aria-hidden="true">
            <div className="h-[2px] rounded-full overflow-hidden bg-zinc-800/80">
              <div className="sno-progress h-full w-2/5 rounded-full bg-emerald-400/80" />
            </div>
          </div>
        </div>

        <div className="mt-9 sm:mt-12 max-w-4xl mx-auto space-y-4" aria-hidden="true">
          {variant === 'home' ? (
            <div className="relative h-32 sm:h-44 rounded-3xl border border-white/[0.06] bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 sm:p-8 flex flex-col justify-end gap-3 overflow-hidden">
              <div className="absolute -right-12 -top-20 size-56 rounded-full bg-emerald-900/[0.09]" />
              <SkeletonBar className="w-2/5 h-4" />
              <SkeletonBar className="w-1/3 h-3" />
            </div>
          ) : (
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-white/[0.06] bg-zinc-900/50">
              <div className="size-9 rounded-xl sno-skeleton" />
              <div className="space-y-2 flex-1">
                <SkeletonBar className="w-1/3 h-3" />
                <SkeletonBar className="w-1/2 h-2" />
              </div>
            </div>
          )}
          <div className={`grid gap-3 ${isDashboard ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-3'}`}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-2xl border border-white/[0.06] bg-zinc-900/40 p-4 space-y-4">
                <div className="flex items-center gap-3">
                  <SkeletonBar className="w-10 h-10 rounded-xl shrink-0" />
                  <div className="space-y-2 flex-1">
                    <SkeletonBar className="w-4/5 h-3" />
                    <SkeletonBar className="w-2/3 h-2" />
                  </div>
                </div>
                <SkeletonBar className="h-2.5 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PanelLoading({label = 'Actualizando el panel...'}: {label?: string}) {
  return (
    <div role="status" aria-live="polite" className="rounded-2xl border border-white/[0.08] bg-zinc-900/70 p-6 flex items-center gap-4">
      <div className="size-10 shrink-0 rounded-xl bg-emerald-400/[0.07] border border-emerald-400/15 flex items-center justify-center">
        <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      </div>
      <div className="flex-1 space-y-1.5">
        <p className="text-sm font-medium text-zinc-200">{label}</p>
        <p className="text-xs text-zinc-500">Tus datos se están sincronizando de forma segura.</p>
      </div>
    </div>
  );
}

export function InitialShopError({
  label = 'No se pudo cargar la información. Comprobá tu conexión e intentá de nuevo.',
}: InitialShopStateProps) {
  return (
    <div className="min-h-[75vh] flex items-center justify-center bg-zinc-950 text-zinc-100 px-5">
      <div role="alert" className="max-w-md w-full text-center border border-zinc-800 bg-zinc-900/80 rounded-3xl p-7 space-y-5">
        <div className="mx-auto size-12 rounded-2xl bg-zinc-800 flex items-center justify-center">
          <RefreshCw className="size-5 text-zinc-300" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <p className="text-lg font-semibold">No se pudo completar la carga</p>
          <p className="text-sm text-zinc-400">{label}</p>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-5 py-3 rounded-xl bg-zinc-100 text-zinc-950 text-sm font-semibold hover:bg-white cursor-pointer"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}
