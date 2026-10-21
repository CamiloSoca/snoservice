'use client';

import { PublicShopGate } from '@/components/PublicShopProvider';
import HomeClient from '@/components/HomeClient';

export default function HomePage() {
  return (
    <PublicShopGate variant="home" label="Preparando tu experiencia...">
      {(shop) => <HomeClient initialShop={shop} />}
    </PublicShopGate>
  );
}
