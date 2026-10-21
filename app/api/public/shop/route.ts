import { NextResponse, connection } from 'next/server';
import { getServerPublicShopData } from '@/lib/server-public-shop';

// Configuracion publica compartida con el primer renderizado de las paginas.
// Una respuesta cacheada evita repetir consultas a Supabase en navegaciones.
export async function GET() {
  const startedAt = performance.now();
  try {
    // Evitar que el handler quede prerenderizado con las credenciales
    // de prueba durante CI: leer siempre el cache desde runtime.
    await connection();
    const data = await getServerPublicShopData();
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=0, s-maxage=15, stale-while-revalidate=10',
        'Server-Timing': `public-shop;dur=${(performance.now()-startedAt).toFixed(1)}`,
      },
    });
  } catch (error) {
    console.error('Error en datos publicos del negocio', error);
    return NextResponse.json(
      {error:'No se pudo cargar la informacion del local.'},
      {status:503,headers:{'Cache-Control':'no-store'}}
    );
  }
}
