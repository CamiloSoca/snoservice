// Ejecutar con localhost apuntando exclusivamente a Supabase staging.
// Todas las solicitudes de mutación se invalidan antes de escribir.
import assert from 'node:assert/strict';
import {businessDayOptions} from '../lib/appointment-rules.ts';

const base = process.env.LOCAL_BASE_URL || 'http://localhost:3015';
const shopResponse = await fetch(base + '/api/public/shop');
assert.equal(shopResponse.status, 200, 'catálogo público disponible');
const shop = await shopResponse.json();
const service = shop.services.find(item => item.active);
const barber = shop.barbers.find(item => item.active &&
  (!item.serviceIds?.length || item.serviceIds.includes(service?.id)));
assert.ok(service && barber, 'servicio y barbero públicos de staging');

const days = businessDayOptions();
const key = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
const openDay = days.find(day => shop.shopConfig.schedule[key[day.dayOfWeek]]?.isOpen);
const closedDay = days.find(day => shop.shopConfig.schedule[key[day.dayOfWeek]]?.isOpen === false);
assert.ok(openDay, 'día abierto de staging');

const validShape = {
  serviceId: service.id, barberId: barber.id, dateString: openDay.dateString,
  timeSlot: '10:00', clientName: 'Prueba sin escritura',
  clientPhone: '098521350', clientEmail: 'audit@example.invalid',
};
async function post(path, body, expected, label) {
  const response = await fetch(base + path, {method: 'POST',
    headers: {origin: base, 'content-type': 'application/json'},
    body: JSON.stringify(body)});
  await response.arrayBuffer();
  assert.equal(response.status, expected, label);
  console.log(`${label}: ${response.status}`);
}

await post('/api/public/booking', {}, 400, 'formulario incompleto');
await post('/api/public/booking', {...validShape, clientPhone: '123'}, 400, 'teléfono inválido');
await post('/api/public/booking', {...validShape, dateString: 'Lun 1 Ene'}, 400, 'fecha manipulada');
if (closedDay) {
  await post('/api/public/booking', {...validShape, dateString: closedDay.dateString},
    400, 'día cerrado');
}
await post('/api/public/booking', {...validShape, timeSlot: '03:00'}, 400, 'fuera de horario');
await post('/api/public/booking', {...validShape, timeSlot: '10:17'}, 400, 'franja no ofrecida');
await post('/api/public/cancel', {code: 'AUDIT-NOT-FOUND', email: 'audit@example.invalid'},
  404, 'cancelación sin código válido');
await post('/api/admin', {operation: 'OPEN_CASH', initialAmount: 0}, 401,
  'administrador sin sesión');

const barberPatch = await fetch(base + '/api/barber', {method: 'PATCH',
  headers: {origin: base, 'content-type': 'application/json'},
  body: JSON.stringify({id: barber.id, status: 'cancelado'})});
assert.equal(barberPatch.status, 401, 'barbero sin sesión');
console.log(`barbero sin sesión: ${barberPatch.status}`);
