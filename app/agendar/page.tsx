import { Suspense } from 'react';
import { connection } from 'next/server';
import { getServerPublicShopData } from '@/lib/server-public-shop';
import { InitialShopSkeleton, InitialShopError } from '@/components/InitialShopState';
import BookingClient from '@/components/BookingClient';

async function BookingContent() {
  await connection();
  try {
    const initialShop = await getServerPublicShopData();
    return <BookingClient initialShop={initialShop} />;
  } catch (error) {
    console.error('Error al preparar la agenda:', error);
    return <InitialShopError label="No se pudo cargar la agenda. Intentá de nuevo." />;
  }
}

export default function AgendarPage() {
  return (
    <Suspense fallback={<InitialShopSkeleton variant="booking" label="Preparando los servicios..." />}>
      <BookingContent />
    </Suspense>
  );
}
