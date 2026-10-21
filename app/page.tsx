import { Suspense } from 'react';
import { connection } from 'next/server';
import { getServerPublicShopData } from '@/lib/server-public-shop';
import { InitialShopSkeleton, InitialShopError } from '@/components/InitialShopState';
import HomeClient from '@/components/HomeClient';

async function HomeContent() {
  // Ejecutar el acceso a datos en runtime, nunca con credenciales ficticias
  // durante el build. La configuracion publica queda cacheada brevemente.
  await connection();
  try {
    const initialShop = await getServerPublicShopData();
    return <HomeClient initialShop={initialShop} />;
  } catch (error) {
    console.error('Error al cargar el inicio:', error);
    return <InitialShopError />;
  }
}

export default function HomePage() {
  return (
    <Suspense fallback={<InitialShopSkeleton variant="home" label="Preparando tu experiencia..." />}>
      <HomeContent />
    </Suspense>
  );
}
