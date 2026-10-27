import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/session';
import { instagramOAuthConfig } from '@/lib/instagram-server';

export async function GET(request: Request) {
  if (!await requireAdminSession()) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  const config = instagramOAuthConfig();
  if (!config) {
    return NextResponse.redirect(new URL('/admin?instagram=not_configured', request.url));
  }
  const state = crypto.randomBytes(32).toString('base64url');
  const auth = new URL('https://www.instagram.com/oauth/authorize');
  auth.searchParams.set('client_id', config.appId);
  auth.searchParams.set('redirect_uri', config.redirectUri);
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('scope', 'instagram_business_basic');
  auth.searchParams.set('state', state);
  const response = NextResponse.redirect(auth);
  response.cookies.set('snoservice_instagram_oauth_state', state, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', path: '/api/admin/instagram', maxAge: 600,
  });
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
