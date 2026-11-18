import {Suspense} from 'react';
import HomeClient from '@/components/HomeClient';
import {InitialShopSkeleton,InitialShopError} from '@/components/InitialShopState';
import {getServerPublicShopData} from '@/lib/server-public-shop';
import {getPublicRetailProducts} from '@/lib/server-public-retail';

// Mostrar el catálogo público desde el servidor, sin esperar a que
// el móvil descargue JavaScript y después consulte /api/public/shop.
async function HomeContent(){
  try {
    const [shop,products]=await Promise.all([
      getServerPublicShopData(),
      getPublicRetailProducts().catch(()=>[]),
    ]);
    return <HomeClient initialShop={shop} featuredRetail={products[0]||null}/>;
  } catch {
    return <InitialShopError label="No se pudo cargar la información del local. Intentá de nuevo."/>;
  }
}

export default function HomePage(){
  return <Suspense fallback={<InitialShopSkeleton variant="home" label="Preparando tu experiencia..."/>}>
    <HomeContent/>
  </Suspense>;
}
