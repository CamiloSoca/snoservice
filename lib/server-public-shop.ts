import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import { getSupabaseServer, SHOP_UUID } from '@/lib/supabase-server';
import type { PublicShopData } from '@/lib/public-shop-data';

// Solo campos del catálogo público: jamás PIN, comisión, turnos,
// movimientos financieros o información privada de clientes.
type ShopRow = {
  id: string; name?: string | null; phone?: string | null;
  address?: string | null; city?: string | null;
  logo_url?: string | null; background_image_url?: string | null;
  cover_image_url?: string | null;
  schedule: PublicShopData['shopConfig']['schedule'];
};
type ServiceRow = {
  id: string; name: string; price: string | number; duration_minutes: number;
  description?: string | null; image_url?: string | null; active: boolean;
};
type BarberRow = {
  id: string; slug?: string | null; name: string; role?: string | null;
  bio?: string | null; specialties?: string[] | null;
  service_ids?: string[] | null; image_url?: string | null; active: boolean;
};

function toPublicShopData(
  shop: ShopRow, services: ServiceRow[], barbers: BarberRow[]
): PublicShopData {
  return {
    shopConfig: {
      id: shop.id,
      name: shop.name || '',
      phone: shop.phone || '',
      address: shop.address || '',
      city: shop.city || '',
      logoUrl: shop.logo_url || '',
      backgroundImageUrl: shop.background_image_url || '',
      coverImageUrl: shop.cover_image_url || '',
      schedule: shop.schedule,
    },
    services: services.map((service) => ({
      id: service.id,
      name: service.name,
      price: Number(service.price) || 0,
      durationMinutes: Number(service.duration_minutes) || 60,
      description: service.description || '',
      imageUrl: service.image_url || '',
      active: service.active,
    })),
    barbers: barbers.map((barber) => ({
      id: barber.id,
      slug: barber.slug || '',
      name: barber.name,
      role: barber.role || 'Barbero',
      bio: barber.bio || '',
      specialties: barber.specialties || [],
      serviceIds: barber.service_ids || [],
      imageUrl: barber.image_url || '',
      active: barber.active,
      isOwner: false,
      commissionRate: 0,
      pin: '',
    })),
  };
}

// Se cachea SOLO el catálogo. La disponibilidad se consulta siempre aparte.
export async function getServerPublicShopData(): Promise<PublicShopData> {
  'use cache';
  cacheLife({stale: 30, revalidate: 15, expire: 300});
  cacheTag('public-shop-' + SHOP_UUID);

  const db = getSupabaseServer();
  const {data: fastData, error: fastError} = await db.rpc(
    'public_shop_snapshot', {p_shop_id: SHOP_UUID}
  );

  if (!fastError && fastData && typeof fastData === 'object') {
    const snapshot = fastData as {
      shop?: ShopRow; services?: ServiceRow[]; barbers?: BarberRow[];
    };
    if (snapshot.shop?.id && snapshot.shop.schedule &&
      Array.isArray(snapshot.services) && Array.isArray(snapshot.barbers)) {
      return toPublicShopData(snapshot.shop, snapshot.services, snapshot.barbers);
    }
  }

  // Compatibilidad y recuperacion si falla el RPC/schema cache.
  console.warn('RPC del catálogo no disponible:', fastError?.code || 'invalid_response');
  const [shopResult, servicesResult, barbersResult] = await Promise.all([
    db.from('shops')
      .select('id,name,phone,address,city,logo_url,background_image_url,cover_image_url,schedule')
      .eq('id', SHOP_UUID).maybeSingle(),
    db.from('services')
      .select('id,name,price,duration_minutes,description,image_url,active')
      .eq('shop_id', SHOP_UUID).eq('active', true),
    db.from('barbers')
      .select('id,slug,name,role,bio,specialties,service_ids,active,image_url')
      .eq('shop_id', SHOP_UUID).eq('active', true),
  ]);
  if (shopResult.error || !shopResult.data || servicesResult.error || barbersResult.error) {
    console.error('No se pudo cargar la informacion publica', {
      shop: shopResult.error?.code,
      services: servicesResult.error?.code,
      barbers: barbersResult.error?.code,
    });
    throw new Error('No se pudo cargar la informacion publica del negocio.');
  }
  return toPublicShopData(
    shopResult.data as ShopRow,
    (servicesResult.data || []) as ServiceRow[],
    (barbersResult.data || []) as BarberRow[],
  );
}
