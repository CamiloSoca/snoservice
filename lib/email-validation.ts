// Detectamos errores frecuentes sin asumir que todo correo debe ser Gmail o Hotmail.
// Nunca cambiamos el destinatario automáticamente: el cliente decide la corrección.
const COMMON_EMAIL_DOMAIN_TYPOS: Readonly<Record<string, string>> = {
  'gmail.con': 'gmail.com',
  'gmail.cmo': 'gmail.com',
  'gmail.comm': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'hotmail.con': 'hotmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'outlook.con': 'outlook.com',
  'outlok.com': 'outlook.com',
  'outllok.com': 'outlook.com',
  'yahoo.con': 'yahoo.com',
  'yaho.com': 'yahoo.com',
  'icloud.con': 'icloud.com',
  'iclod.com': 'icloud.com',
};

/** Devuelve una sugerencia solo para erratas conocidas; no altera el dato enviado. */
export function suggestEmailCorrection(value: string): string | null {
  const email = value.trim();
  const at = email.indexOf('@');
  if (at <= 0 || at !== email.lastIndexOf('@') || at === email.length - 1) return null;

  const domain = email.slice(at + 1).toLowerCase();
  const correction = COMMON_EMAIL_DOMAIN_TYPOS[domain];
  return correction ? `${email.slice(0, at)}@${correction}` : null;
}
