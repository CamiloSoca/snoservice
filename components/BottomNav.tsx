'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Scissors, UserCheck, Lock } from 'lucide-react';

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-950/90 backdrop-blur-lg border-t border-zinc-800/80 px-4 py-2 sm:hidden">
      <div className="max-w-md mx-auto flex items-center justify-around">
        {/* Home */}
        <Link
          href="/"
          className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors ${
            pathname === '/' ? 'text-zinc-100 font-bold' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px]">Inicio</span>
        </Link>

        {/* Agendar */}
        <Link
          href="/#wizard"
          className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors ${
            pathname === '/#wizard' ? 'text-zinc-100 font-bold' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Scissors className="w-5 h-5" />
          <span className="text-[10px]">Agendar</span>
        </Link>

        {/* Panel de Barberos / PIN */}
        <Link
          href="/barbero"
          className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors ${
            pathname.startsWith('/barbero') ? 'text-emerald-400 font-bold' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <UserCheck className="w-5 h-5" />
          <span className="text-[10px]">Barberos</span>
        </Link>

        {/* Admin */}
        <Link
          href="/admin"
          className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors ${
            pathname.startsWith('/admin') ? 'text-amber-400 font-bold' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Lock className="w-5 h-5" />
          <span className="text-[10px]">Admin</span>
        </Link>
      </div>
    </nav>
  );
}