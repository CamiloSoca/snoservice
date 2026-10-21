// lib/session.ts
import crypto from 'crypto';
import { cookies } from 'next/headers';

export const ADMIN_COOKIE_NAME = 'barber_admin_session';
export const BARBER_COOKIE_NAME = 'barber_staff_session';

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      'Configuración incompleta: Definí SESSION_SECRET (mínimo 16 caracteres) en las variables de entorno del servidor.'
    );
  }
  return secret;
}

export interface SessionPayload {
  role: 'admin' | 'barber';
  sub: string;
  exp: number;
}

export function signSessionToken(payload: SessionPayload): string {
  const secret = getSessionSecret();
  const data = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

export function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token || !token.includes('.')) return null;
  try {
    const secret = getSessionSecret();
    const [data, signature] = token.split('.');
    if (!data || !signature) return null;

    const expectedSig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
    const sigBuf = Buffer.from(signature, 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');

    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as SessionPayload;
    
    // Usamos performance API recomendada por Next.js 16 para evitar el error de prerendering de Date.now()
    const currentTime = performance.timeOrigin + performance.now();
    if (!payload.exp || currentTime > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function requireAdminSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  const payload = verifySessionToken(token);
  if (!payload || payload.role !== 'admin') return null;
  return payload;
}

export async function getBarberSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(BARBER_COOKIE_NAME)?.value;
  const payload = verifySessionToken(token);
  if (!payload || payload.role !== 'barber') return null;
  return payload;
}

export function verifyCsrfOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return false;
  try {
    const originHost = new URL(origin).host;
    return originHost === host;
  } catch {
    return false;
  }
}