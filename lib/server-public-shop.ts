import 'server-only';
import { cacheLife } from 'next/cache';
import { getSupabaseServer, SHOP_UUID } from '@/lib/supabase-server';
import type { PublicShopData } from '@/lib/public-shop-data';

// Solo configuracion y perfiles publicos. No reutilizar este cache para
// reservas, cookies, datos de clientes, PIN, sesiones ni movimientos de caja.
export async function getServerPublicShopData(): Promise<PublicShopData> {
  'use cache';
  cacheLife({ stale: 30, revalidate: 15, expire: 300 });

  const db = getSupabaseServer();
  const [shopResult, servicesResult, barbersResult] = await Promise.all([
    db.from('shops')
      .select('id,name,phone,address,city,logo_url,background_image_url,cover_image_url,schedule')
      .eq('id', SHOP_UUID)
      .maybeSingle(),
    db.from('services')
      .select('id,name,price,duration_minutes,description,image_url,active')
      .eq('shop_id', SHOP_UUID)
      .eq('active', true),
    db.from('barbers')
      .select('id,slug,name,role,bio,specialties,service_ids,active')
      .eq('shop_id', SHOP_UUID)
      .eq('active', true),
  ]);

  if (shopResult.error || !shopResult.data || servicesResult.error || barbersResult.error) {
    console.error('No se pudo cargar la informacion publica', {
      shop: shopResult.error?.code,
      services: servicesResult.error?.code,
      barbers: barbersResult.error?.code,
    });
    throw new Error('No se pudo cargar la informacion publica del negocio.');
  }

  const shop = shopResult.data;
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
    services: (servicesResult.data || []).map((service) => ({
      id: service.id,
      name: service.name,
      price: Number(service.price) || 0,
      durationMinutes: Number(service.duration_minutes) || 60,
      description: service.description || '',
      imageUrl: service.image_url || '',
      active: service.active,
    })),
    barbers: (barbersResult.data || []).map((barber) => ({
      id: barber.id,
      slug: barber.slug || '',
      name: barber.name,
      role: barber.role || 'Barbero',
      bio: barber.bio || '',
      specialties: barber.specialties || [],
      serviceIds: barber.service_ids || [],
      active: barber.active,
      isOwner: false,
      commissionRate: 0,
      pin: '',
    })),
  };
}
