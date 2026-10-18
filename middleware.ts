// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Definimos la constante directamente aquí para evitar importar módulos de Node/crypto en el Edge Runtime
const ADMIN_COOKIE_NAME = 'barber_admin_session';

export function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const { pathname } = request.nextUrl;

  // Verificamos si existe la cookie de sesión del admin
  const isAuthenticated = Boolean(sessionCookie);

  // 1. Si intenta entrar a /admin sin iniciar sesión -> Lo patea a /login
  if (pathname.startsWith('/admin') && !isAuthenticated) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // 2. Si ya inició sesión y entra a /login -> Lo manda directo a /admin
  if (pathname.startsWith('/login') && isAuthenticated) {
    const adminUrl = new URL('/admin', request.url);
    return NextResponse.redirect(adminUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/login'],
};