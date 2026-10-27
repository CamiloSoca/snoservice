import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const agenda = read('components/AgendaCalendar.tsx');
const admin = read('app/admin/page.tsx');
const barber = read('components/BarberClient.tsx');
const booking = read('components/BookingClient.tsx');
const endpoint = read('app/api/barber/route.ts');
const payoutsEndpoint = read('app/api/finance/payouts/route.ts');
const ledger = read('components/FinanceLedgerCard.tsx');
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
  assert.match(admin,/grid grid-cols-3 gap-1.5/);
  assert.match(admin,/sm:grid-cols-6/);
  assert.match(agenda,/min-h-\[66px\]/);
  assert.match(agenda,/space-y-3 border-b/);
  assert.match(booking,/Elegí horario/);
});
test('la consulta rápida siempre aplica sesión del servidor y limita perfil de barbero', () => {
  assert.match(endpoint,/requireAdminSession\(\), getBarberSession\(\)/);
  assert.match(endpoint,/\.eq\('barber_id', staff!\.sub\)/);
  assert.match(endpoint,/private, no-store/);
  assert.match(endpoint,/commission_rate_snapshot/);
  assert.match(endpoint,/completed_cash_register_id/);
  assert.match(endpoint,/cashOpen/);
});
test('polling de agenda no solicita finanzas completas', () => {
  assert.match(store,/export async function getLiveAgendaSnapshot/);
  assert.match(store,/scope === 'barber' \? '\/api\/barber\?scope=barber'/);
  assert.match(admin,/const live = await getLiveAgendaSnapshot\(\)/);
  assert.match(barber,/const live = await getLiveAgendaSnapshot\('barber'\)/);
  assert.match(admin,/const fresh = await getAdminDashboardSnapshot\(\)/);
  assert.match(barber,/const fresh = await getBarberDashboardSnapshot\(\)/);
  assert.match(admin,/Turno guardado|operación quedó guardada/);
});

test('con cookies simultáneas el portal mantiene balances y agenda por barbero', () => {
  assert.match(barber,/getLiveAgendaSnapshot\('barber'\)/);
  assert.match(ledger,/mode==='barber'\?'\/api\/finance\/payouts\?scope=barber'/);
  assert.match(endpoint,/barberView && !staff/);
  assert.match(endpoint,/barberView \|\| \(!admin && staff\)/);
  assert.match(payoutsEndpoint,/barberView && !barber/);
  assert.match(payoutsEndpoint,/barberView\?barber!\.sub/);
});
