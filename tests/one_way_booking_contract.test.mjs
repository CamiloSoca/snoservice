import test from 'node:test';
import assert from 'node:assert/strict';
import {bookingIntervalsConflict} from '../lib/appointment-rules.ts';

test('Corte 09:30 existente: 09:00 y 10:00 bloqueados', () => {
  assert.equal(bookingIntervalsConflict('09:00', 60, '09:30', 60), true);
  assert.equal(bookingIntervalsConflict('09:30', 60, '09:30', 60), true);
  assert.equal(bookingIntervalsConflict('10:00', 60, '09:30', 60), true);
  assert.equal(bookingIntervalsConflict('10:30', 60, '09:30', 60), false);
});

test('Color Global y Mechas nunca invaden un corte a las 09:30', () => {
  assert.equal(bookingIntervalsConflict('09:00', 120, '09:30', 60), true);
  assert.equal(bookingIntervalsConflict('09:00', 60, '09:30', 120), true);
  assert.equal(bookingIntervalsConflict('09:00', 120, '09:30', 120), true);
});

test('Ya no hay tolerancia hacia atrás para nuevas reservas', () => {
  assert.equal(bookingIntervalsConflict('09:30', 60, '09:00', 60), true);
  assert.equal(bookingIntervalsConflict('09:00', 60, '09:30', 60), false);
});

test('120 minutos requieren tiempo exclusivo; horarios contiguos son válidos', () => {
  assert.equal(bookingIntervalsConflict('09:00', 120, '10:30', 60), true);
  assert.equal(bookingIntervalsConflict('10:30', 120, '09:30', 60), false);
  assert.equal(bookingIntervalsConflict('11:30', 120, '09:30', 120), false);
});
