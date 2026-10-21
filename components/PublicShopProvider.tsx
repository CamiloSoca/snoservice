'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { InitialShopError, InitialShopSkeleton } from '@/components/InitialShopState';
import type { PublicShopData } from '@/lib/public-shop-data';
import {
  getPublicShopData,
  getPublicShopSnapshot,
  getServerPublicShopSnapshot,
  publicShopNeedsRefresh,
  subscribePublicShop,
} from '@/lib/public-shop-data';

type LoadingVariant = 'home' | 'booking' | 'barber';

// Kept inside app/layout.tsx. Unlike a page component, this effect and the
// shared store survive client-side navigation. Only public data is persisted.
export function PublicShopProvider({children}: {children: React.ReactNode}) {
  useEffect(() => {
    let stopped = false;
    const refreshIfNeeded = () => {
      if (stopped || document.visibilityState === 'hidden' || !publicShopNeedsRefresh()) return;
      void getPublicShopData().catch(() => {});
    };

    refreshIfNeeded();
    const interval = window.setInterval(refreshIfNeeded, 30_000);
    window.addEventListener('focus', refreshIfNeeded);
    document.addEventListener('visibilitychange', refreshIfNeeded);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshIfNeeded);
      document.removeEventListener('visibilitychange', refreshIfNeeded);
    };
  }, []);

  return <>{children}</>;
}

// A subsequent route uses the previous public snapshot immediately, not a
// full-page loading screen followed by another network request.
export function PublicShopGate({
  variant,
  label,
  children,
}: {
  variant: LoadingVariant;
  label: string;
  children: (shop: PublicShopData) => React.ReactNode;
}) {
  const snapshot = useSyncExternalStore(
    subscribePublicShop,
    getPublicShopSnapshot,
    getServerPublicShopSnapshot,
  );

  if (snapshot.data) return <>{children(snapshot.data)}</>;
  if (snapshot.state === 'error') {
    return <InitialShopError label="No se pudo cargar la información del local. Comprobá tu conexión e intentá de nuevo." />;
  }
  return <InitialShopSkeleton variant={variant} label={label} />;
}
