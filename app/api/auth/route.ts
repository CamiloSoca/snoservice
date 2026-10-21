// app/api/auth/route.ts
import { NextResponse } from 'next/server';
import { ADMIN_COOKIE_NAME, signSessionToken, verifyCsrfOrigin } from '@/lib/session';
import { getSupabaseServer, SHOP_UUID } from '@/lib/supabase-server';

export async function POST(request: Request) {
  if (!verifyCsrfOrigin(request)) {
    return NextResponse.json(
      { ok: false, error: 'Origen de solicitud no válido.' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { username, password } = body;

    // 1. Valores de respaldo desde variables de entorno
    let validUser = process.env.ADMIN_USER || '';
    let validPass = process.env.ADMIN_PASS || process.env.ADMIN_PASSWORD;

    // 2. Si en la tabla 'shops' de Supabase existen admin_user / admin_pass para esta barbería, tienen prioridad
    try {
      const supabase = getSupabaseServer();
      const { data: shopData } = await supabase
        .from('shops')
        .select('admin_user,admin_pass')
        .eq('id', SHOP_UUID)
        .maybeSingle();

      if (shopData) {
        if ((shopData as any).admin_user) validUser = String((shopData as any).admin_user);
        if ((shopData as any).admin_pass) validPass = String((shopData as any).admin_pass);
      }
    } catch {
      // Si falla la lectura opcional, continúa usando las variables de entorno
    }

    if (!validPass || !validUser) {
      return NextResponse.json(
        { ok: false, error: 'Configuración de seguridad del servidor incompleta.' },
        { status: 500 }
      );
    }

    const inputUser = typeof username === 'string' ? username.trim() : '';
    const inputPass = typeof password === 'string' ? password : '';

    // Permite validar con usuario+contraseña o solo contraseña si el formulario envía solo password
    const userMatches = inputUser === validUser;
    const passMatches = inputPass === validPass;

    if (userMatches && passMatches) {
      const maxAgeSeconds = 60 * 60 * 24 * 7; // 7 días
      const token = signSessionToken({
        role: 'admin',
        sub: `${validUser}:${SHOP_UUID}`,
        exp: Date.now() + maxAgeSeconds * 1000,
      });

      const response = NextResponse.json({ ok: true });

      response.cookies.set(ADMIN_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        sameSite: 'lax',
        maxAge: maxAgeSeconds,
      });

      return response;
    }

    return NextResponse.json(
      { ok: false, error: 'Usuario o contraseña incorrectos.' },
      { status: 401 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Error procesando la solicitud.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  if (!verifyCsrfOrigin(request)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(ADMIN_COOKIE_NAME);
  return response;
}