// app/api/auth/route.ts
import { NextResponse } from 'next/server';
import { ADMIN_COOKIE_NAME, signSessionToken, verifyCsrfOrigin } from '@/lib/session';

export async function POST(request: Request) {
  if (!verifyCsrfOrigin(request)) {
    return NextResponse.json(
      { ok: false, error: 'Origen de solicitud no válido.' },
      { status: 403 }
    );
  }
try {
  const adminUser = process.env.ADMIN_USER;
  const adminPass = process.env.ADMIN_PASS;

  // Si no configuraste las variables en el servidor, bloqueamos el acceso por seguridad
  if (!adminUser || !adminPass) {
    return NextResponse.json(
      { error: 'Configuración de seguridad del servidor incompleta.' },
      { status: 500 }
    );
  }

  const body = await request.json();
  const { username, password } = body;

  if (
    typeof username === 'string' &&
    typeof password === 'string' &&
    username === adminUser &&
    password === adminPass
  ) {
    const maxAgeSeconds = 60 * 60 * 24 * 7; // 7 días
    const token = signSessionToken({
      role: 'admin',
      sub: adminUser,
      exp: Date.now() + maxAgeSeconds * 1000,
    });
    
    // ... resto de tu lógica para devolver la cookie o el token

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