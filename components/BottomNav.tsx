'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Scissors, UserCheck, Lock } from 'lucide-react';

export default function BottomNav() {
  const pathname = usePathname();

  const isHome = pathname === '/';
  const isAgendar = pathname.startsWith('/agendar');
  const isBarbero = pathname.startsWith('/barbero');
  const isAdmin = pathname.startsWith('/admin');

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-950/95 backdrop-blur-lg border-t border-zinc-800/80 px-3 py-2 sm:hidden shadow-2xl">
      <div className="max-w-md mx-auto grid grid-cols-4 gap-1">
        <Link
          href="/"
          className={`flex flex-col items-center justify-center gap-1 py-1.5 rounded-2xl transition-all ${
            isHome
              ? 'bg-zinc-900 text-zinc-100 font-bold'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px]">Inicio</span>
        </Link>

        <Link
          href="/agendar"
          className={`flex flex-col items-center justify-center gap-1 py-1.5 rounded-2xl transition-all ${
            isAgendar
              ? 'bg-zinc-900 text-zinc-100 font-bold'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Scissors className="w-5 h-5" />
          <span className="text-[10px]">Agendar</span>
        </Link>

        <Link
          href="/barbero"
          className={`flex flex-col items-center justify-center gap-1 py-1.5 rounded-2xl transition-all ${
            isBarbero
              ? 'bg-emerald-500/15 text-emerald-400 font-bold'
              : 'text-zinc-500 hover:text-emerald-400'
          }`}
        >
          <UserCheck className="w-5 h-5" />
          <span className="text-[10px]">Barberos</span>
        </Link>

        <Link
          href="/admin"
          className={`flex flex-col items-center justify-center gap-1 py-1.5 rounded-2xl transition-all ${
            isAdmin
              ? 'bg-amber-500/15 text-amber-400 font-bold'
              : 'text-zinc-500 hover:text-amber-400'
          }`}
        >
          <Lock className="w-5 h-5" />
          <span className="text-[10px]">Admin</span>
        </Link>
      </div>
    </nav>
  );
}