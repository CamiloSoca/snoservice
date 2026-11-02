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
  } catch (error) {
    // Solo un código técnico: jamás registrar tokens ni el código de OAuth.
    const reason = error instanceof Error &&
      /^IG_META_HTTP_[1-5][0-9]{2}(?:_CODE_[0-9]+)?(?:_SUB_[0-9]+)?$/.test(error.message)
      ? error.message : 'IG_OAUTH_FAILURE';
    console.warn('INSTAGRAM_OAUTH_CALLBACK_FAILED', reason);
    return redirect('error');
  }
}
