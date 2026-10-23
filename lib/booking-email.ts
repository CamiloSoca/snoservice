export interface BookingConfirmationEmail {
  clientName: string;
  barberName: string;
  serviceName: string;
  dateString: string;
  timeSlot: string;
  durationMinutes: number;
  price: number;
  code: string;
  shopName?: string;
  shopAddress?: string;
}

function escapeHtml(value: string): string {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char] || char));
}

function minuteOfDay(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function formatTime(minutes: number): string {
  return String(Math.floor(minutes / 60)).padStart(2, '0') + ':' +
    String(minutes % 60).padStart(2, '0');
}

export function buildBookingConfirmationEmail(input: BookingConfirmationEmail) {
  const shop = escapeHtml(input.shopName || "13'Cut");
  const name = escapeHtml(input.clientName);
  const service = escapeHtml(input.serviceName);
  const barber = escapeHtml(input.barberName);
  const day = escapeHtml(input.dateString);
  const start = escapeHtml(input.timeSlot);
  const endsAt = escapeHtml(formatTime(minuteOfDay(input.timeSlot) + input.durationMinutes));
  const price = escapeHtml(new Intl.NumberFormat('es-UY', {
    style: 'currency', currency: 'UYU', maximumFractionDigits: 0,
  }).format(input.price));
  const code = escapeHtml(input.code);
  const address = input.shopAddress ? escapeHtml(input.shopAddress) : '';
  const subject = "✂️ ¡Tu turno está confirmado! | 13'Cut";

  // Tablas e inline CSS: funcionan en Gmail, Outlook y clientes móviles.
  // El texto dinámico se escapa para evitar inyección de HTML por parte del cliente.
  const html = [
    '<!doctype html><html lang="es"><head><meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1"></head>',
    '<body style="margin:0;padding:0;background:#0a0a0b;font-family:Arial,Helvetica,sans-serif;color:#ffffff">',
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Tu turno en ',
    shop, ' está confirmado. Acá tenés todos los detalles.</div>',
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#0a0a0b">',
    '<tr><td align="center" style="padding:32px 12px 40px">',
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;border:1px solid #292929;border-radius:22px;overflow:hidden;background:#151517">',
    '<tr><td align="center" style="padding:36px 24px 28px;background:#101113">',
    '<div style="font-size:36px;line-height:1.1;margin-bottom:12px">💈 ✂️</div>',
    '<div style="font-size:26px;letter-spacing:2px;font-weight:900;color:#ffffff;">',shop,'</div>',
    '<div style="font-size:11px;letter-spacing:3px;color:#aaaeb2;margin-top:7px">BARBERÍA · MONTEVIDEO</div>',
    '</td></tr>',
    '<tr><td align="center" style="padding:30px 26px 12px">',
    '<div style="display:inline-block;border-radius:99px;background:#17392e;color:#8ff2c5;padding:9px 18px;font-size:13px;font-weight:bold">✅ RESERVA CONFIRMADA</div>',
    '<h1 style="font-size:28px;line-height:1.25;margin:22px 0 8px;color:#ffffff">¡Nos vemos pronto, ',name,'! 😎</h1>',
    '<p style="font-size:15px;line-height:1.7;color:#b7b9be;max-width:390px;margin:8px auto 18px">Ya tenés tu lugar reservado. Guardá este correo con los detalles de tu visita.</p>',
    '</td></tr>',
    '<tr><td align="center" style="padding:4px 26px 14px">',
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #315245;background:#183428;border-radius:16px">',
    '<tr><td align="center" style="padding:23px 14px">',
    '<div style="color:#9bdcc0;font-size:12px;font-weight:bold;letter-spacing:2px">📅 TU PRÓXIMA VISITA</div>',
    '<div style="font-size:24px;color:#ffffff;font-weight:800;line-height:1.4;margin-top:7px">',day,'</div>',
    '<div style="font-size:29px;color:#93ffce;font-weight:900;line-height:1.35;margin-top:3px">🕒 ',start,' hs</div>',
    '<div style="color:#c8d9d0;font-size:13px;margin-top:6px">Hasta las ',endsAt,' hs · ',String(input.durationMinutes),' min</div>',
    '</td></tr></table></td></tr>',
    '<tr><td align="center" style="padding:11px 27px 0">',
    '<div style="color:#7e8287;font-size:11px;letter-spacing:2px;font-weight:bold;margin:8px 0 16px">LOS DETALLES DE TU TURNO</div>',
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #333438;border-radius:14px">',
    '<tr><td align="center" style="padding:16px 12px;border-bottom:1px solid #333438">',
    '<div style="font-size:12px;color:#a6a8ab;margin-bottom:4px">✂️ SERVICIO</div><div style="font-size:17px;font-weight:bold;color:#ffffff">',service,'</div></td></tr>',
    '<tr><td align="center" style="padding:16px 12px;border-bottom:1px solid #333438">',
    '<div style="font-size:12px;color:#a6a8ab;margin-bottom:4px">💈 TE ATIENDE</div><div style="font-size:17px;font-weight:bold;color:#ffffff">',barber,'</div></td></tr>',
    '<tr><td align="center" style="padding:16px 12px">',
    '<div style="font-size:12px;color:#a6a8ab;margin-bottom:4px">💵 IMPORTE DEL SERVICIO</div><div style="font-size:20px;font-weight:bold;color:#9affd1">',price,'</div></td></tr>',
    '</table></td></tr>',
    '<tr><td align="center" style="padding:24px 26px 12px">',
    '<div style="font-size:12px;color:#a6a8ab;margin-bottom:8px">🔐 CÓDIGO DE RESERVA</div>',
    '<div style="font-family:monospace;font-size:15px;letter-spacing:1px;font-weight:bold;color:#ffffff;overflow-wrap:anywhere">',code,'</div>',
    '<p style="font-size:13px;line-height:1.6;color:#b1b3b7;margin:18px auto 12px;max-width:420px">',
    '¿Necesitás cancelar? Entrá a la agenda, elegí <strong style="color:#ffffff">Cancelar turno</strong> y usá este código junto con tu correo electrónico. Solo se puede cancelar antes de que comience el turno.</p>',
    '<a href="https://13-cut.snoservice.uy/agendar" style="display:inline-block;border-radius:12px;background:#b0ffd6;color:#102117;text-decoration:none;font-size:14px;font-weight:bold;padding:15px 26px;margin:5px auto 7px">Gestionar mi turno ↗</a>',
    '</td></tr>',
    address ? '<tr><td align="center" style="padding:12px 26px 4px;font-size:13px;color:#c2c3c6">📍 '+address+'</td></tr>' : '',
    '<tr><td align="center" style="padding:20px 25px 28px">',
    '<div style="color:#fff;font-size:17px;font-weight:bold;margin-bottom:6px">¡Te esperamos! 🔥</div>',
    '<div style="color:#777a80;font-size:11px;line-height:1.6">Este mensaje fue enviado automáticamente por ',shop,'.<br>Si no hiciste esta reserva, comunicate con la barbería.</div>',
    '</td></tr>',
    '</table>',
    '<p style="font-size:11px;color:#777a80;text-align:center;margin:18px auto 0">✂️ ',shop,' · Tu estilo, tu momento.</p>',
    '</td></tr></table></body></html>',
  ].join('');

  const text = [
    "✂️ ¡Turno confirmado en " + (input.shopName || "13'Cut") + "!",
    "Hola " + input.clientName + ", ¡nos vemos pronto!",
    "📅 Día: " + input.dateString,
    "🕒 Hora: " + input.timeSlot + " a " + formatTime(minuteOfDay(input.timeSlot) + input.durationMinutes),
    "💈 Barbero: " + input.barberName,
    "✂️ Servicio: " + input.serviceName,
    "💵 Precio: " + price,
    "🔐 Código: " + input.code,
    input.shopAddress ? "📍 " + input.shopAddress : "",
    "Para cancelar antes de que comience tu turno, ingresá a https://13-cut.snoservice.uy/agendar",
    "Usá el código y el correo con el que hiciste la reserva.",
    "¡Te esperamos! 🔥",
  ].filter(Boolean).join('\n');

  return {subject, html, text};
}


// Notificación cuando administración o el barbero cancelan una reserva.
// Se escapan TODOS los campos recibidos de usuarios para evitar HTML inyectado.
export interface BookingCancellationEmail {
  clientName: string;
  barberName: string;
  serviceName: string;
  dateString: string;
  timeSlot: string;
  code: string;
  shopName?: string;
  cancelledBy: 'barber' | 'admin';
}

export function buildBookingCancellationEmail(input: BookingCancellationEmail) {
  const shopName = input.shopName || "13'Cut";
  const actor = input.cancelledBy === 'barber' ? 'tu barbero' : 'la barbería';
  const subject = 'Tu reserva fue cancelada | ' + shopName;
  const text = [
    'Hola ' + input.clientName + ',',
    '',
    'Te avisamos que ' + actor + ' canceló tu reserva en ' + shopName + '.',
    '',
    'Día: ' + input.dateString,
    'Hora: ' + input.timeSlot + ' hs',
    'Servicio: ' + input.serviceName,
    'Barbero: ' + input.barberName,
    'Código: ' + input.code,
    '',
    'El horario quedó disponible nuevamente. Si querés otro turno,',
    'podés reservar en https://13-cut.snoservice.uy/agendar',
    '',
    'Disculpá las molestias.',
    shopName,
  ].join('\n');
  const html = [
    '<!doctype html><html lang="es"><head><meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1"></head>',
    '<body style="margin:0;padding:30px 12px;background:#09090b;color:#f4f4f5;font-family:Arial,sans-serif">',
    '<table role="presentation" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;margin:0 auto;background:#18181b;border:1px solid #3f3f46;border-radius:18px">',
    '<tr><td style="padding:30px 25px">',
    '<p style="color:#86efac;font-size:12px;letter-spacing:2px;font-weight:bold">', escapeHtml(shopName), '</p>',
    '<h1 style="font-size:26px;margin:14px 0">Tu turno fue cancelado</h1>',
    '<p style="color:#d4d4d8;line-height:1.6">Hola ', escapeHtml(input.clientName),
    ', te avisamos que ', escapeHtml(actor), ' canceló tu reserva.</p>',
    '<div style="padding:18px;border-radius:12px;background:#27272a;line-height:1.9">',
    '<strong>Día:</strong> ', escapeHtml(input.dateString), '<br>',
    '<strong>Hora:</strong> ', escapeHtml(input.timeSlot), ' hs<br>',
    '<strong>Servicio:</strong> ', escapeHtml(input.serviceName), '<br>',
    '<strong>Barbero:</strong> ', escapeHtml(input.barberName), '<br>',
    '<strong>Código:</strong> ', escapeHtml(input.code),
    '</div>',
    '<p style="color:#d4d4d8;line-height:1.6">El horario quedó libre nuevamente. Si querés, podés elegir otro turno.</p>',
    '<a href="https://13-cut.snoservice.uy/agendar" style="display:inline-block;background:#86efac;color:#052e16;padding:13px 19px;border-radius:10px;text-decoration:none;font-weight:bold">Reservar otro turno</a>',
    '<p style="color:#a1a1aa;font-size:13px;margin-top:24px">Disculpá las molestias. ', escapeHtml(shopName), '</p>',
    '</td></tr></table></body></html>',
  ].join('');
  return {subject, text, html};
}
