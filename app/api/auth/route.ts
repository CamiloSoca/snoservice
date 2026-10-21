// app/api/auth/route.ts
import { NextResponse } from 'next/server';
import { ADMIN_COOKIE_NAME, signSessionToken, verifyCsrfOrigin } from '@/lib/session';
import { SHOP_UUID } from '@/lib/supabase-server';

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

    // La tabla shops no contiene credenciales de administrador. El intento de
    // leer columnas inexistentes añadía un viaje a Supabase a cada acceso.
    const validUser = process.env.ADMIN_USER || '';
    const validPass = process.env.ADMIN_PASS || process.env.ADMIN_PASSWORD;

    if (!validPass || !validUser) {
      return NextResponse.json(
        { ok: false, error: 'Configuración de seguridad del servidor incompleta.' },
        { status: 500 }
      );
    }

    const inputUser = typeof username === 'string' ? username.trim() : '';
    const inputPass = typeof password === 'string' ? password : '';

    // Exigir usuario y contraseña configurados en el servidor.
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
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Error procesando la solicitud.' },
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
