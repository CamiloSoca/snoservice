import { Suspense } from 'react';
import { connection } from 'next/server';
import { getServerPublicShopData } from '@/lib/server-public-shop';
import { InitialShopSkeleton, InitialShopError } from '@/components/InitialShopState';
import BarberClient from '@/components/BarberClient';

async function BarberContent() {
  await connection();
  try {
    const initialShop = await getServerPublicShopData();
    return <BarberClient initialShop={initialShop} />;
  } catch (error) {
    console.error('Error al preparar el portal de barberos:', error);
    return <InitialShopError label="No se pudieron cargar los barberos. Intentá nuevamente." />;
  }
}

export default function BarberPortalPage() {
  return (
    <Suspense fallback={<InitialShopSkeleton variant="barber" label="Preparando perfiles de barberos..." />}>
      <BarberContent />
    </Suspense>
  );
}
