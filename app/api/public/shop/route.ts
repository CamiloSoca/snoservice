import { NextResponse } from 'next/server';
import { getSupabaseServer, SHOP_UUID } from '@/lib/supabase-server';

// Solo información pública, nunca PIN, comisiones, correos ni datos de clientes.
// La disponibilidad se consulta aparte y no se almacena en caché.
export async function GET() {
  const startedAt = performance.now();
  try {
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
      console.error('Error consultando datos públicos del negocio', {
        shop: shopResult.error?.code,
        services: servicesResult.error?.code,
        barbers: barbersResult.error?.code,
      });
      return NextResponse.json(
        {error: 'No se pudo consultar la información del negocio.'},
        {status: 503, headers: {'Cache-Control': 'no-store'}}
      );
    }

    const shop = shopResult.data;
    return NextResponse.json({
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
        // Campos requeridos por el modelo de UI, sin exponer secretos reales.
        isOwner: false,
        commissionRate: 0,
        pin: '',
      })),
    }, {
      headers: {
        'Cache-Control': 'public, max-age=0, s-maxage=15, stale-while-revalidate=10',
        'Server-Timing': `database;dur=${(performance.now() - startedAt).toFixed(1)}`,
      },
    });
  } catch (error) {
    console.error('Error cargando información pública', error);
    return NextResponse.json(
      {error: 'No se pudo consultar la información del negocio.'},
      {status: 503, headers: {'Cache-Control': 'no-store'}}
    );
  }
}
