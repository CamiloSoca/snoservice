import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBookingConfirmationEmail, buildBookingCancellationEmail} from '../lib/booking-email.ts';

const base = {
  clientName: 'Camila', barberName: 'Ema', serviceName: 'Corte',
  dateString: 'Sáb 24 Oct', timeSlot: '09:30',
  code: '13C-ABCDE123', shopName: "13'Cut",
};
const confirmation = () => buildBookingConfirmationEmail({
  ...base, durationMinutes: 60, price: 450,
});
const cancellation = () => buildBookingCancellationEmail({
  ...base, cancelledBy: 'barber',
});

test('confirmación y cancelación comparten exactamente el mismo marco visual', () => {
  const emails = [confirmation(), cancellation()];
  for (const email of emails) {
    assert.match(email.html, /<table role="presentation"/);
    assert.match(email.html, /max-width:540px/);
    assert.match(email.html, /background-color:#f2f5f2/);
    assert.match(email.html, /border-bottom:3px solid #19a96b/);
    assert.match(email.html, /RESERVAS ONLINE/);
    assert.match(email.html, /DETALLES DE LA RESERVA/);
    assert.match(email.html, /CÓDIGO DE RESERVA/);
    assert.match(email.html, /13C-ABCDE123/);
    assert.match(email.html, /https:\/\/13-cut\.snoservice\.uy\/agendar/);
    assert.match(email.html, /word-break:break-all/);
    assert.doesNotMatch(email.html, /<img\b/i);
    assert.doesNotMatch(email.html, /<script\b/i);
    assert.ok(email.text.includes('Sáb 24 Oct'));
    assert.ok(email.text.includes('09:30'));
  }
});

test('estados claramente diferentes pero con la misma identidad visual', () => {
  const yes = confirmation();
  const no = cancellation();
  assert.match(yes.html, /✅ RESERVA CONFIRMADA/);
  assert.match(yes.html, /#eaf8f0/);
  assert.match(yes.html, /Gestionar mi turno/);
  assert.match(no.html, /RESERVA CANCELADA/);
  assert.match(no.html, /#fff2ee/);
  assert.match(no.html, /Reservar otro turno/);
  assert.match(no.text, /tu barbero canceló/);
});

test('monto, duración y dirección se muestran sólo en confirmación', () => {
  const email = buildBookingConfirmationEmail({
    ...base, durationMinutes: 60, price: 450, shopAddress: 'Montevideo',
  });
  assert.match(email.html, /10:30 hs/);
  assert.match(email.html, /450/);
  assert.match(email.html, /Dirección: Montevideo/);
  assert.match(email.text, /Hora: 09:30 a 10:30/);
});

test('nombre y variables escapados y asunto protegido contra saltos de línea', () => {
  const injected = {
    ...base, clientName: '<script>alert(1)</script>',
    barberName: '<img src=x>', serviceName: 'Corte & Barba',
    shopName: 'Barbería\nInyectada',
  };
  const mails = [
    buildBookingConfirmationEmail({...injected, durationMinutes: 30, price: 400}),
    buildBookingCancellationEmail({...injected, cancelledBy: 'admin'}),
  ];
  for (const mail of mails) {
    assert.doesNotMatch(mail.html, /<script>|<img src=x>/);
    assert.match(mail.html, /&lt;script&gt;/);
    assert.match(mail.html, /&lt;img src=x&gt;/);
    assert.match(mail.html, /Corte &amp; Barba/);
    assert.doesNotMatch(mail.subject, /[\r\n]/);
  }
});
