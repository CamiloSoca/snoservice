import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/session';
import { exchangeInstagramAuthorizationCode, saveInstagramConnection } from '@/lib/instagram-server';

export async function GET(request: NextRequest) {
  const redirect = (state: string) => {
    const response = NextResponse.redirect(new URL('/admin?instagram=' + state, request.url));
    response.cookies.set('snoservice_instagram_oauth_state', '', {
      path: '/api/admin/instagram', maxAge: 0, httpOnly: true,
      secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
    });
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('Cache-Control', 'no-store');
    return response;
  };
  if (!await requireAdminSession()) return redirect('unauthorized');

  const state = request.nextUrl.searchParams.get('state') || '';
  const expected = request.cookies.get('snoservice_instagram_oauth_state')?.value || '';
  const received = Buffer.from(state);
  const stored = Buffer.from(expected);
  if (!received.length || received.length !== stored.length ||
    !crypto.timingSafeEqual(received, stored)) return redirect('invalid_state');

  const code = request.nextUrl.searchParams.get('code');
  if (!code || code.length > 2048) return redirect('cancelled');

  try {
    const token = await exchangeInstagramAuthorizationCode(code);
    await saveInstagramConnection(token);
    return redirect('connected');
  } catch {
    return redirect('error');
  }
}
