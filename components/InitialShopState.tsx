'use client';

interface InitialShopStateProps {
  label?: string;
}

// No mostrar datos inventados (barberos, nombre o precios) mientras se
// recupera la configuración real del negocio.
export function InitialShopSkeleton({
  label = 'Cargando información del local...',
}: InitialShopStateProps) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-5">
      <div className="max-w-5xl mx-auto space-y-5" aria-hidden="true">
        <div className="flex items-center gap-3 border-b border-zinc-800 pb-5">
          <div className="w-10 h-10 rounded-xl bg-zinc-800 animate-pulse motion-reduce:animate-none" />
          <div className="space-y-2 flex-1">
            <div className="w-40 h-4 rounded bg-zinc-800 animate-pulse motion-reduce:animate-none" />
            <div className="w-56 max-w-full h-3 rounded bg-zinc-900 animate-pulse motion-reduce:animate-none" />
          </div>
        </div>
        <div className="h-40 sm:h-56 rounded-3xl bg-zinc-900 border border-zinc-800 animate-pulse motion-reduce:animate-none" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 rounded-2xl bg-zinc-900 border border-zinc-800 p-5 space-y-4">
              <div className="w-12 h-10 rounded-lg bg-zinc-800 animate-pulse motion-reduce:animate-none" />
              <div className="w-3/4 h-3 rounded bg-zinc-800 animate-pulse motion-reduce:animate-none" />
            </div>
          ))}
        </div>
      </div>
      <p role="status" aria-live="polite" className="text-center text-sm text-zinc-400 mt-6">{label}</p>
    </div>
  );
}

export function InitialShopError({
  label = 'No se pudo cargar la información. Comprobá tu conexión e intentá de nuevo.',
}: InitialShopStateProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100 px-5">
      <div role="alert" className="max-w-md w-full text-center border border-zinc-800 bg-zinc-900 rounded-2xl p-7 space-y-4">
        <p className="text-sm text-zinc-300">{label}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-5 py-3 rounded-xl bg-zinc-100 text-zinc-950 text-sm font-semibold hover:bg-white cursor-pointer"
        >
          Volver a intentar
        </button>
      </div>
    </div>
  );
}
