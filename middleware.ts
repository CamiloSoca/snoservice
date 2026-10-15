import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_TOKEN = 'barber_central_secret_token_2026';

export function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get('barber_admin_session')?.value;
  const isAuthenticated = sessionCookie === SESSION_TOKEN;
  const { pathname } = request.nextUrl;

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