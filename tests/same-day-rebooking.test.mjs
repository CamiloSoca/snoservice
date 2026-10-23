import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20261023_allow_rebooking_after_completed.sql');
const route = read('app/api/public/booking/route.ts');
const client = read('components/BookingClient.tsx');

test('la validación en SQL solo bloquea turnos pendientes del mismo celular y día', () => {
  assert.match(migration, /validate_appointment_booking/);
  assert.match(migration, /old_rule constant text := 'AND a\.status IS DISTINCT FROM ''cancelado'''/);
  assert.match(migration, /new_rule constant text := 'AND a\.status = ''confirmado'''/);
  assert.match(migration, /EXECUTE replace\(definition, old_rule, new_rule\)/);
  assert.match(migration, /El esquema de validación cambió/);
});

test('la API no trata un turno completado como una reserva pendiente', () => {
  assert.match(route, /Este celular ya tiene un turno activo ese día/);
  assert.match(route, /Ya tenés una reserva pendiente para ese día/);
  assert.match(route, /status: 422/);
  // 422 mantiene el formulario en paso de datos para corregir sin perder hora.
  assert.match(client, /if \(err\?\.status === 409\)/);
  assert.doesNotMatch(client, /err\?\.status === 422/);
});

test('la protección contra doble reserva del mismo horario permanece', () => {
  assert.match(route, /isSlotAvailable\(/);
  assert.match(route, /insertErr\?\.code === '23505'/);
  assert.match(route, /insertErr\?\.code === '23P01'/);
});

test('el cambio no elimina historial ni facturación de citas completadas', () => {
  assert.doesNotMatch(migration, /\bDELETE\s+FROM\s+public\.appointments\b/i);
  assert.doesNotMatch(migration, /\bTRUNCATE\b/i);
  assert.doesNotMatch(migration, /cash_registers|completed_at|price_snapshot/i);
});
