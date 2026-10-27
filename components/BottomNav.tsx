'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Scissors, UserCheck, Lock } from 'lucide-react';

export default function BottomNav() {
  const pathname = usePathname();

  // El asistente de reservas tiene su propia barra inferior en móvil.
  if (pathname.startsWith('/agendar')) return null;

  const isHome = pathname === '/';
  const isBarbero = pathname.startsWith('/barbero');
  const isAdmin = pathname.startsWith('/admin');

  return (
    <nav
      aria-label="Navegación principal móvil"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-800/80 bg-zinc-950/90 px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-xl sm:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-4 gap-1.5">
        <Link
          href="/"
          prefetch={true}
          className={['flex flex-col items-center justify-center gap-1 rounded-2xl py-2 transition-colors touch-manipulation',
            isHome ? 'border border-zinc-800 bg-zinc-900 font-bold text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
          ].join(' ')}
        >
          <Home className="h-5 w-5" aria-hidden="true" />
          <span className="text-[10px] tracking-tight">Inicio</span>
        </Link>
        <Link
          href="/agendar"
          prefetch={true}
          className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-zinc-100 py-2 font-extrabold text-zinc-950 shadow-sm transition-transform touch-manipulation active:scale-95"
        >
          <Scissors className="h-5 w-5" aria-hidden="true" />
          <span className="text-[10px] tracking-tight">Reservar</span>
        </Link>
        <Link
          href="/barbero"
          prefetch={true}
          className={['flex flex-col items-center justify-center gap-1 rounded-2xl py-2 transition-colors touch-manipulation',
            isBarbero ? 'border border-emerald-500/30 bg-emerald-500/15 font-bold text-emerald-400' : 'text-zinc-400 hover:text-emerald-400'
          ].join(' ')}
        >
          <UserCheck className="h-5 w-5" aria-hidden="true" />
          <span className="text-[10px] tracking-tight">Barberos</span>
        </Link>
        <Link
          href="/admin"
          prefetch={false}
          className={['flex flex-col items-center justify-center gap-1 rounded-2xl py-2 transition-colors touch-manipulation',
            isAdmin ? 'border border-amber-500/30 bg-amber-500/15 font-bold text-amber-400' : 'text-zinc-400 hover:text-amber-400'
          ].join(' ')}
        >
          <Lock className="h-5 w-5" aria-hidden="true" />
          <span className="text-[10px] tracking-tight">Admin</span>
        </Link>
      </div>
    </nav>
  );
}
