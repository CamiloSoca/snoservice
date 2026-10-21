// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ADMIN_COOKIE_NAME = 'barber_admin_session';

export function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const { pathname } = request.nextUrl;

  // Sin cookie: derivar al formulario de acceso.
  // Con cookie: el layout valida criptográficamente la sesión.
  if (pathname.startsWith('/admin') && !sessionCookie) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // No redirigir /login en función de una cookie que podría ser inválida o vencida.
  // De lo contrario, se puede formar un bucle entre /login y /admin.
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
