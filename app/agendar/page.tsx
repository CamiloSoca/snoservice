'use client';

import { PublicShopGate } from '@/components/PublicShopProvider';
import BookingClient from '@/components/BookingClient';

export default function AgendarPage() {
  return (
    <PublicShopGate variant="booking" label="Preparando servicios y barberos...">
      {(shop) => <BookingClient initialShop={shop} />}
    </PublicShopGate>
  );
}
