import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBookingConfirmationEmail} from '../lib/booking-email.ts';

const sample = {
  clientName: 'Alex <script>alert(1)</script>',
  barberName: 'Nahuel',
  serviceName: 'Corte',
  dateString: 'Jue 22 Oct',
  timeSlot: '09:00',
  durationMinutes: 30,
  price: 400,
  code: '13C-ABC123',
  shopName: "13'Cut",
  shopAddress: 'Agraciada 3778, Montevideo',
};

test('confirmation email has a centered visual layout, emojis, full details and plain text', () => {
  const mail = buildBookingConfirmationEmail(sample);
  assert.match(mail.subject, /✂️/);
  assert.match(mail.html, /<table role="presentation"/);
  assert.match(mail.html, /align="center"/);
  assert.match(mail.html, /✅ RESERVA CONFIRMADA/);
  assert.match(mail.html, /Nahuel/);
  assert.match(mail.html, /09:30 hs/);
  assert.match(mail.html, /13C-ABC123/);
  assert.match(mail.html, /Gestionar mi turno/);
  assert.match(mail.html, /Agraciada 3778/);
  assert.match(mail.text, /Turno confirmado/);
  assert.match(mail.text, /09:00 a 09:30/);
  assert.match(mail.text, /Nahuel/);
});

test('booking email HTML escapes unsafe user-supplied names', () => {
  const mail = buildBookingConfirmationEmail(sample);
  assert.doesNotMatch(mail.html, /<script>/);
  assert.match(mail.html, /Alex &lt;script&gt;/);
  assert.match(mail.text, /Alex <script>alert/);
});
