// lib/crypto-server.ts
import crypto from 'crypto';

export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'Configuración incompleta: Definí SESSION_SECRET (mínimo 32 caracteres) en las variables de entorno del servidor.'
    );
  }
  return secret;
}

export function hmacSign(data: string): string {
  const secret = getSessionSecret();
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

export function hmacVerify(data: string, signature: string): boolean {
  try {
    const secret = getSessionSecret();
    const expectedSig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
    const sigBuf = Buffer.from(signature, 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');

    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
