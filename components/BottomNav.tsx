'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Home, Scissors, UserCheck, Lock, Menu, MapPin } from 'lucide-react';

export default function BottomNav() {
  const pathname = usePathname();
  const [moreOpen,setMoreOpen] = useState(false);

  // En /agendar usamos la barra inferior propia del asistente de pasos para no superponer controles en móvil
  if (pathname.startsWith('/agendar')) {
    return null;
  }

  const isHome = pathname === '/';
  const isBarbero = pathname.startsWith('/barbero');
  const isAdmin = pathname.startsWith('/admin');
  const isPublic = isHome || pathname.startsWith('/equipo');

  return (
    <nav
      aria-label="Navegación principal móvil"
      className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-950/90 backdrop-blur-xl border-t border-zinc-800/80 px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:hidden shadow-2xl"
    >
      {isPublic && moreOpen && (
        <div id="public-nav-more" className="mx-auto mb-2 grid max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-2 shadow-xl">
          <Link href="/#info" onClick={() => setMoreOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-3 text-sm text-white hover:bg-zinc-800"><MapPin className="h-4 w-4"/> Horarios y ubicación</Link>
          <Link href="/barbero" prefetch={false} onClick={() => setMoreOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-3 text-sm text-white hover:bg-zinc-800"><UserCheck className="h-4 w-4"/> Acceso barberos</Link>
          <Link href="/admin" prefetch={false} onClick={() => setMoreOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-3 text-sm text-white hover:bg-zinc-800"><Lock className="h-4 w-4"/> Administración</Link>
        </div>
      )}
      <div className="max-w-md mx-auto grid grid-cols-4 gap-1.5">
        <Link
          href="/"
          prefetch={true}
          className={`flex flex-col items-center justify-center gap-1 py-2 rounded-2xl transition-all touch-manipulation active:scale-95 ${
            isHome
              ? 'bg-zinc-900 text-zinc-100 font-bold border border-zinc-800'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Inicio</span>
        </Link>

        <Link
          href="/agendar"
          prefetch={true}
          className="flex flex-col items-center justify-center gap-1 py-2 rounded-2xl transition-all touch-manipulation active:scale-95 bg-zinc-100 text-zinc-950 font-extrabold shadow-sm"
        >
          <Scissors className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Reservar</span>
        </Link>

        {isPublic ? (
          <>
            <Link href="/#equipo" className="flex flex-col items-center justify-center gap-1 rounded-2xl py-2 text-zinc-400 hover:text-white">
              <UserCheck className="h-5 w-5" /><span className="text-[10px]">Equipo</span>
            </Link>
            <button type="button" aria-expanded={moreOpen} aria-controls="public-nav-more"
              onClick={() => setMoreOpen(open => !open)} className="flex flex-col items-center justify-center gap-1 rounded-2xl py-2 text-zinc-400 hover:text-white">
              <Menu className="h-5 w-5" /><span className="text-[10px]">Más</span>
            </button>
          </>
        ) : (
          <>
        <Link
          href="/barbero"
          prefetch={true}
          className={`flex flex-col items-center justify-center gap-1 py-2 rounded-2xl transition-all touch-manipulation active:scale-95 ${
            isBarbero
              ? 'bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/30'
              : 'text-zinc-400 hover:text-emerald-400'
          }`}
        >
          <UserCheck className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Barberos</span>
        </Link>

        <Link
          href="/admin"
          // No precargar rutas protegidas: el estado de la cookie puede
          // cambiar despues del prefetch (login o expiracion).
          prefetch={false}
          className={`flex flex-col items-center justify-center gap-1 py-2 rounded-2xl transition-all touch-manipulation active:scale-95 ${
            isAdmin
              ? 'bg-amber-500/15 text-amber-400 font-bold border border-amber-500/30'
              : 'text-zinc-400 hover:text-amber-400'
          }`}
        >
          <Lock className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Admin</span>
        </Link>
          </>
        )}

      </div>
    </nav>
  );
}