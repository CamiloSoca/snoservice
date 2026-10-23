/**
 * Sólo números de WhatsApp uruguayos válidos: jamás usar un teléfono
 * ficticio cuando al cliente le falta el suyo.
 */
export function toUruguayanWhatsAppNumber(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  // 09X XXX XXX, 9X XXX XXX o +598 9X XXX XXX.
  const local = digits.startsWith('598') ? digits.slice(3)
    : digits.startsWith('0') ? digits.slice(1) : digits;
  return /^9\d{7}$/.test(local) ? '598' + local : null;
}

export function customerWhatsAppLink(phone: string | undefined | null, name: string, shop: string): string | null {
  const number = toUruguayanWhatsAppNumber(phone);
  if (!number) return null;
  const message = `Hola ${name}, te escribimos de ${shop} por tu reserva.`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
