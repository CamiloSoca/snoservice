'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Scissors, UserCheck, ShieldCheck } from 'lucide-react';
import { bottomNavigationItems, navigationArea } from '@/lib/site-navigation';

export default function BottomNav() {
  const pathname = usePathname();
  const items = bottomNavigationItems(pathname);
  const area = navigationArea(pathname);

  // Los clientes nunca ven enlaces internos. El portal del barbero,
  // el login y el asistente de reservas tienen sus propias pantallas.
  if (items.length === 0) return null;

  return (
    <nav
      aria-label={area === 'admin' ? 'Navegación de administración' : 'Navegación de clientes'}
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-800/80 bg-zinc-950/90 px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-xl sm:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-2 gap-2">
        {items.map((item) => {
          const isActive = pathname === item.href;
          const isBooking = item.href === '/agendar';
          const Icon = item.href === '/' ? Home :
            item.href === '/agendar' ? Scissors :
            item.href === '/admin' ? ShieldCheck : UserCheck;
          const styles = isBooking
            ? 'bg-zinc-100 text-zinc-950 font-extrabold shadow-sm active:scale-95'
            : isActive
              ? 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-300 font-bold'
              : 'border border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:text-zinc-100';

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={item.href !== '/admin'}
              aria-current={isActive ? 'page' : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 transition-colors touch-manipulation ${styles}`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className="text-[11px] tracking-tight">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
