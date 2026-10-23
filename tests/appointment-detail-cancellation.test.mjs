import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildBookingCancellationEmail} from '../lib/booking-email.ts';
import {toUruguayanWhatsAppNumber, customerWhatsAppLink} from '../lib/customer-contact.ts';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf-8');

test('números móviles reales abren WhatsApp, sin teléfono inventado', () => {
  assert.equal(toUruguayanWhatsAppNumber('098 123 456'), '59898123456');
  assert.equal(toUruguayanWhatsAppNumber('+598 98 123 456'), '59898123456');
  assert.equal(toUruguayanWhatsAppNumber('98123456'), '59898123456');
  assert.equal(toUruguayanWhatsAppNumber(''), null);
  assert.equal(toUruguayanWhatsAppNumber('099'), null);
  assert.equal(toUruguayanWhatsAppNumber('24001234'), null);
  assert.equal(customerWhatsAppLink('', 'Ana', "13'Cut"), null);
  const url = customerWhatsAppLink('098123456', 'Ana', "13'Cut");
  assert.ok(url?.startsWith('https://wa.me/59898123456?text='));
});

test('correo de cancelación incluye cliente, detalles y nueva reserva', () => {
  const email = buildBookingCancellationEmail({
    clientName: 'Ana López', barberName: 'Ema', serviceName: 'Corte',
    dateString: 'Vie 23 Oct', timeSlot: '12:00', code: 'ABC123',
    cancelledBy: 'barber', shopName: "13'Cut",
  });
  assert.match(email.subject, /cancelada/i);
  assert.match(email.text, /tu barbero canceló/);
  assert.match(email.text, /Ana López/);
  assert.match(email.text, /12:00/);
  assert.match(email.text, /13-cut.snoservice.uy\/agendar/);
  assert.match(email.html, /ABC123/);
});

test('datos del cliente quedan escapados en el HTML de cancelación', () => {
  const email = buildBookingCancellationEmail({
    clientName: '<script>alert(1)</script>', barberName: '<img src=x>',
    serviceName: 'Corte', dateString: 'Vie 23 Oct', timeSlot: '12:00',
    code: '"test"', cancelledBy: 'admin',
  });
  assert.doesNotMatch(email.html, /<script>/);
  assert.doesNotMatch(email.html, /<img src=x>/);
  assert.match(email.html, /&lt;script&gt;/);
  assert.match(email.text, /la barbería canceló/);
});

test('cancelación solo notifica tras actualización autorizada y única', () => {
  const server = read('app/api/barber/route.ts');
  const committed = server.indexOf("if (!data) return NextResponse.json({error: 'El turno cambió");
  const mail = server.indexOf('await sendBookingCancellationNotice(');
  assert.ok(committed >= 0 && mail > committed);
  assert.match(server, /\.eq\('status', 'confirmado'\)/);
  assert.match(server, /if \(status === 'completado' && timeState !== 'started'\)/);
  assert.match(server, /if \(status === 'cancelado' && timeState !== 'future'\)/);
  assert.match(server, /requireOpenCash\(\)/);
  assert.match(server, /eq\('barber_id', barberSession\.sub\)/);
});

test('detalle usa portal fuera del panel y por encima de navegación inferior', () => {
  const modal = read('components/AppointmentDetailModal.tsx');
  const calendar = read('components/AgendaCalendar.tsx');
  assert.match(modal, /createPortal\(/);
  assert.match(modal, /z-\[120\]/);
  assert.match(modal, /max-h-\[calc\(100dvh-16px\)\]/);
  assert.match(modal, /Contactar por WhatsApp/);
  assert.match(modal, /Confirmás la cancelación/);
  assert.match(modal, /completeAllowed/);
  assert.match(calendar, /<AppointmentDetailModal/);
});
