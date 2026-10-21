'use client';

import { PublicShopGate } from '@/components/PublicShopProvider';
import BarberClient from '@/components/BarberClient';

export default function BarberPortalPage() {
  return (
    <PublicShopGate variant="barber" label="Cargando perfiles de barberos...">
      {(shop) => <BarberClient initialShop={shop} />}
    </PublicShopGate>
  );
}
