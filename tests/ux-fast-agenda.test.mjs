import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const agenda = read('components/AgendaCalendar.tsx');
const admin = read('app/admin/page.tsx');
const barber = read('components/BarberClient.tsx');
const booking = read('components/BookingClient.tsx');
const endpoint = read('app/api/barber/route.ts');
const bookingApi = read('app/api/public/booking/route.ts');
const store = read('lib/booking-store.ts');

test('el formulario advierte errores de correo y API los rechaza también', () => {
  assert.match(booking,/bookingEmailSuggestion/);
  assert.match(booking,/aria-invalid=\{Boolean\(bookingEmailSuggestion\)\}/);
  assert.match(bookingApi,/suggestEmailCorrection\(cleanEmail\)/);
  assert.match(bookingApi,/status: 422/);
});
test('calendario y administración reducen la navegación vertical del celular', () => {
  assert.match(admin,/Secciones de administración/);
  assert.match(admin,/overflow-x-auto overscroll-x-contain/);
  assert.match(agenda,/min-h-\[66px\]/);
  assert.match(agenda,/space-y-3 border-b/);
  assert.match(booking,/Elegí horario/);
});
test('la consulta rápida siempre aplica sesión del servidor y limita perfil de barbero', () => {
  assert.match(endpoint,/requireAdminSession\(\), getBarberSession\(\)/);
  assert.match(endpoint,/\.eq\('barber_id', staff\.sub\)/);
  assert.match(endpoint,/private, no-store/);
  assert.match(endpoint,/commission_rate_snapshot/);
  assert.match(endpoint,/completed_cash_register_id/);
  assert.match(endpoint,/cashOpen/);
});
test('polling de agenda no solicita finanzas completas', () => {
  assert.match(store,/export async function getLiveAgendaSnapshot/);
  assert.match(store,/apiRequest\('\/api\/barber'/);
  for (const component of [admin,barber]) assert.match(component,/const live = await getLiveAgendaSnapshot\(\)/);
  assert.match(admin,/const fresh = await getAdminDashboardSnapshot\(\)/);
  assert.match(barber,/const fresh = await getBarberDashboardSnapshot\(\)/);
  assert.match(admin,/Turno guardado|operación quedó guardada/);
});
