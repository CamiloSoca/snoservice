import { NextResponse } from 'next/server';

// Credenciales del dueño (Más adelante podés ponerlas en un archivo .env.local)
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'barber2026';
const SESSION_TOKEN = 'barber_central_secret_token_2026';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (username === ADMIN_USER && password === ADMIN_PASS) {
      const response = NextResponse.json({ ok: true });

      // Cookie blindada httpOnly: inaccesible desde la consola F12 de JavaScript
      response.cookies.set('barber_admin_session', SESSION_TOKEN, {
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // Dura 7 días abierta en el celular/PC del jefe
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

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete('barber_admin_session');
  return response;
}