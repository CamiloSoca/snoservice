'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, CalendarCheck, UserCheck, ShieldCheck } from 'lucide-react';
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
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[#0a0d0b]/95 px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-12px_38px_rgba(0,0,0,0.18)] backdrop-blur-md sm:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-2 gap-2">
        {items.map((item) => {
          const isActive = pathname === item.href;
          const isBooking = item.href === '/agendar';
          const Icon = item.href === '/' ? Home :
            item.href === '/agendar' ? CalendarCheck :
            item.href === '/admin' ? ShieldCheck : UserCheck;
          const styles = isBooking
            ? 'bg-white text-zinc-950 font-extrabold shadow-[0_4px_18px_rgba(255,255,255,0.08)] active:scale-[0.98]'
            : isActive
              ? 'border border-emerald-400/25 bg-emerald-500/[0.13] text-emerald-300 font-bold'
              : 'border border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:text-zinc-100';

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={item.href !== '/admin'}
              aria-current={isActive ? 'page' : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-1.5 rounded-[18px] px-2 py-2 transition-[transform,background-color,border-color] touch-manipulation focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${styles}`}
            >
              <Icon className="h-[21px] w-[21px] stroke-[1.8]" aria-hidden="true" />
              <span className="text-[11px] tracking-tight">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
