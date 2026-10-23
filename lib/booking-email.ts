// Plantillas HTML compatibles con Gmail/Outlook y pensadas primero para móvil.
// La misma identidad visual se utiliza para confirmaciones y cancelaciones.
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

const BOOKING_URL = 'https://13-cut.snoservice.uy/agendar';

function escapeHtml(value: string | number): string {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character] || character));
}

function safeSubject(value: string): string {
  // Un nombre de barbería configurado nunca debe insertar otro encabezado SMTP.
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function minuteOfDay(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function formatTime(minutes: number): string {
  return String(Math.floor(minutes / 60)).padStart(2, '0') + ':' +
    String(minutes % 60).padStart(2, '0');
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('es-UY', {
    style: 'currency', currency: 'UY', maximumFractionDigits: 0,
  }).format(value);
}

interface EmailLine {
  label: string;
  value: string;
}

interface EmailFrame {
  shopName: string;
  subjectStatus: 'confirmation' | 'cancellation';
  preheader: string;
  status: string;
  title: string;
  subtitle: string;
  dateString: string;
  timeSlot: string;
  timeNote?: string;
  lines: EmailLine[];
  code: string;
  message: string;
  action: string;
  address?: string;
}

function renderEmailFrame(data: EmailFrame): string {
  const confirmed = data.subjectStatus === 'confirmation';
  const accent = confirmed ? '#087c4d' : '#a43b32';
  const soft = confirmed ? '#eaf8f0' : '#fff2ee';
  const panelBorder = confirmed ? '#b9e1c9' : '#f0d4cd';
  const statusInk = confirmed ? '#075f3a' : '#8b3129';
  const shop = escapeHtml(data.shopName);
  const rows = data.lines.map(({label, value}) => [
    '<tr><td style="padding:12px 16px;border-bottom:1px solid #ecf0ed;">',
    '<span style="display:block;font-size:11px;font-weight:700;letter-spacing:1.1px;color:#68746c;">',
    escapeHtml(label), '</span>',
    '<span style="display:block;padding-top:4px;font-size:15px;font-weight:700;line-height:21px;color:#18251e;word-break:break-word;">',
    escapeHtml(value), '</span>',
    '</td></tr>',
  ].join('')).join('');

  // Sólo tablas y estilos inline para que el diseño funcione incluso si el
  // cliente de correo ignora CSS externo. Evitamos imágenes, iconos remotos
  // y fondos transparentes que Gmail puede invertir de forma extraña.
  return [
    '<!doctype html><html lang="es"><head><meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">',
    '<title>', escapeHtml(data.title), '</title></head>',
    '<body style="margin:0;padding:0;background-color:#f2f5f2;font-family:Arial,Helvetica,sans-serif;color:#18251e;">',
    '<div style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;overflow:hidden;mso-hide:all;">',
    escapeHtml(data.preheader), '</div>',
    '<table role="presentation" align="center" border="0" cellpadding="0" cellspacing="0" width="100%"',
    ' style="width:100%;border-collapse:collapse;background-color:#f2f5f2;">',
    '<tr><td align="center" style="padding:18px 10px 30px;">',
    '<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"',
    ' style="width:100%;max-width:540px;border-collapse:separate;border-spacing:0;background-color:#ffffff;border:1px solid #dce5de;border-radius:18px;overflow:hidden;">',

    // Encabezado de marca pequeño: no desperdiciar media pantalla en un logo.
    '<tr><td style="padding:21px 23px;background-color:#122019;border-bottom:3px solid #19a96b;">',
    '<p style="margin:0;font-size:21px;line-height:25px;font-weight:800;letter-spacing:1px;color:#ffffff;">',
    shop, '</p>',
    '<p style="margin:5px 0 0;font-size:10px;letter-spacing:2px;font-weight:700;color:#b5ddc4;">',
    'BARBERÍA · RESERVAS ONLINE</p></td></tr>',

    '<tr><td style="padding:24px 23px 0;">',
    '<span style="display:inline-block;padding:8px 12px;border-radius:18px;background-color:',
    soft, ';color:', statusInk, ';font-size:11px;font-weight:800;letter-spacing:0.5px;">',
    escapeHtml(data.status), '</span>',
    '<h1 style="margin:15px 0 7px;font-size:25px;line-height:31px;letter-spacing:-0.5px;font-weight:800;color:#18251e;">',
    escapeHtml(data.title), '</h1>',
    '<p style="margin:0 0 21px;font-size:14px;line-height:22px;color:#4e5c53;">',
    escapeHtml(data.subtitle), '</p>',
    '</td></tr>',

    // Resumen visible de inmediato en móvil: fecha y hora en la misma tarjeta.
    '<tr><td style="padding:0 23px;">',
    '<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"',
    ' style="border-collapse:separate;border-spacing:0;width:100%;background-color:',soft,
    ';border:1px solid ',panelBorder,';border-radius:13px;">',
    '<tr>',
    '<td width="56%" valign="top" style="padding:17px 12px 15px 16px;">',
    '<p style="margin:0 0 7px;font-size:10px;font-weight:800;letter-spacing:1px;color:',statusInk,';">DÍA</p>',
    '<p style="margin:0;font-size:19px;line-height:24px;font-weight:800;color:#18251e;">',
    escapeHtml(data.dateString), '</p>',
    '</td>',
    '<td width="44%" valign="top" style="padding:17px 10px 15px;border-left:1px solid ',panelBorder,';">',
    '<p style="margin:0 0 7px;font-size:10px;font-weight:800;letter-spacing:1px;color:',statusInk,';">HORA</p>',
    '<p style="margin:0;font-size:22px;line-height:24px;font-weight:800;color:#18251e;">',
    escapeHtml(data.timeSlot), ' hs</p>',
    '</td></tr>',
    data.timeNote ? [
      '<tr><td colspan="2" style="padding:0 16px 14px;font-size:12px;line-height:17px;color:#516658;">',
      escapeHtml(data.timeNote), '</td></tr>',
    ].join('') : '',
    '</table></td></tr>',

    '<tr><td style="padding:24px 23px 0;">',
    '<p style="margin:0 0 10px;font-size:11px;letter-spacing:1.6px;font-weight:800;color:#526358;">DETALLES DE LA RESERVA</p>',
    '<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"',
    ' style="width:100%;border-collapse:separate;border-spacing:0;border:1px solid #e6ede8;border-radius:12px;overflow:hidden;">',
    rows,
    '<tr><td style="padding:12px 16px;background-color:#f8faf8;">',
    '<span style="display:block;font-size:11px;font-weight:700;letter-spacing:1px;color:#68746c;">CÓDIGO DE RESERVA</span>',
    '<span style="display:block;margin-top:4px;font-family:Consolas,Monaco,monospace;font-size:12px;line-height:18px;font-weight:700;color:#26382c;word-break:break-all;overflow-wrap:anywhere;">',
    escapeHtml(data.code), '</span></td></tr>',
    '</table>',
    '</td></tr>',

    '<tr><td style="padding:20px 23px 0;">',
    '<p style="margin:0;font-size:13px;line-height:21px;color:#4e5c53;">',
    escapeHtml(data.message), '</p>',
    '</td></tr>',
    '<tr><td align="center" style="padding:19px 23px 0;">',
    '<table role="presentation" align="center" border="0" cellpadding="0" cellspacing="0">',
    '<tr><td align="center" bgcolor="#087c4d" style="background-color:#087c4d;border-radius:11px;">',
    '<a href="',BOOKING_URL,'" target="_blank" style="display:inline-block;padding:13px 22px;font-size:14px;line-height:20px;font-weight:800;color:#ffffff;text-decoration:none;">',
    escapeHtml(data.action), '</a>',
    '</td></tr></table></td></tr>',
    '<tr><td align="center" style="padding:12px 16px 0;">',
    '<a href="',BOOKING_URL,'" style="font-size:11px;line-height:17px;color:#557a65;text-decoration:underline;word-break:break-word;">',
    BOOKING_URL, '</a></td></tr>',

    '<tr><td style="padding:22px 23px 23px;">',
    data.address ? [
      '<p style="margin:0 0 10px;font-size:12px;line-height:19px;color:#4e5c53;">',
      'Dirección: ',escapeHtml(data.address),'</p>',
    ].join('') : '',
    '<p style="margin:0;padding-top:14px;border-top:1px solid #e6ede8;font-size:11px;line-height:18px;color:#7a867d;">',
    'Este mensaje fue enviado automáticamente por ',shop,'. ',
    'Si no reconocés esta reserva, comunicate con la barbería.',
    '</p></td></tr>',
    '</table>',
    '<p style="margin:15px 0 0;font-size:11px;color:#718078;">',
    shop, ' · Tu estilo, tu momento.</p>',
    '</td></tr></table></body></html>',
  ].join('');
}

export function buildBookingConfirmationEmail(input: BookingConfirmationEmail) {
  const shop = input.shopName || "13'Cut";
  const endsAt = formatTime(minuteOfDay(input.timeSlot) + input.durationMinutes);
  const price = formatMoney(input.price);
  const subject = safeSubject('✂️ Tu reserva está confirmada | ' + shop);
  const html = renderEmailFrame({
    shopName: shop,
    subjectStatus: 'confirmation',
    preheader: 'Tu turno en ' + shop + ' está confirmado: ' + input.dateString + ', ' + input.timeSlot + ' hs.',
    status: '✅ RESERVA CONFIRMADA',
    title: '¡Nos vemos pronto, ' + input.clientName + '!',
    subtitle: 'Tu lugar ya está reservado. Guardá este correo con los datos de tu visita.',
    dateString: input.dateString,
    timeSlot: input.timeSlot,
    timeNote: 'Hasta las ' + endsAt + ' hs · ' + input.durationMinutes + ' min',
    lines: [
      {label: 'SERVICIO', value: input.serviceName},
      {label: 'TE ATIENDE', value: input.barberName},
      {label: 'PRECIO DEL SERVICIO', value: price},
    ],
    code: input.code,
    message: '¿Necesitás cambiar de planes? Podés gestionar tu turno antes de que comience con el código de reserva y el correo que usaste al agendar.',
    action: 'Gestionar mi turno',
    address: input.shopAddress,
  });
  const text = [
    '✂️ Turno confirmado en ' + shop,
    '¡Hola ' + input.clientName + '! Nos vemos pronto.',
    '',
    'Día: ' + input.dateString,
    'Hora: ' + input.timeSlot + ' a ' + endsAt,
    'Barbero: ' + input.barberName,
    'Servicio: ' + input.serviceName,
    'Precio: ' + price,
    'Código de reserva: ' + input.code,
    input.shopAddress ? 'Dirección: ' + input.shopAddress : '',
    '',
    'Para gestionar tu turno antes de que comience: ' + BOOKING_URL,
    'Usá tu código de reserva y el correo con el que agendaste.',
    '¡Te esperamos!',
  ].filter(Boolean).join('\n');
  return {subject, html, text};
}

export function buildBookingCancellationEmail(input: BookingCancellationEmail) {
  const shop = input.shopName || "13'Cut";
  const actor = input.cancelledBy === 'barber' ? 'tu barbero' : 'la barbería';
  const subject = safeSubject('Tu reserva fue cancelada | ' + shop);
  const html = renderEmailFrame({
    shopName: shop,
    subjectStatus: 'cancellation',
    preheader: 'Tu reserva del ' + input.dateString + ' a las ' + input.timeSlot + ' hs fue cancelada.',
    status: 'RESERVA CANCELADA',
    title: 'Tu turno fue cancelado',
    subtitle: 'Hola ' + input.clientName + ', te avisamos que ' + actor +
      ' canceló tu reserva. Disculpá las molestias.',
    dateString: input.dateString,
    timeSlot: input.timeSlot,
    lines: [
      {label: 'SERVICIO', value: input.serviceName},
      {label: 'BARBERO', value: input.barberName},
    ],
    code: input.code,
    message: 'El horario ya quedó disponible nuevamente. Si querés, podés reservar otra fecha y hora desde nuestra agenda.',
    action: 'Reservar otro turno',
  });
  const text = [
    'Tu turno fue cancelado | ' + shop,
    'Hola ' + input.clientName + ',',
    'Te avisamos que ' + actor + ' canceló tu reserva en ' + shop + '.',
    '',
    'Día: ' + input.dateString,
    'Hora: ' + input.timeSlot + ' hs',
    'Servicio: ' + input.serviceName,
    'Barbero: ' + input.barberName,
    'Código: ' + input.code,
    '',
    'El horario quedó disponible nuevamente.',
    'Si querés otro turno, podés reservar en ' + BOOKING_URL,
    '',
    'Disculpá las molestias.',
    shop,
  ].join('\n');
  return {subject, html, text};
}
