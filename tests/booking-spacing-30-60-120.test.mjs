import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bookingIntervalsConflict} from '../lib/appointment-rules.ts';
import ts from 'typescript';

const storeSource = readFileSync(new URL('../lib/booking-store.ts', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');
const availabilityStart = storeSource.indexOf('export function isSlotAvailable(');
const availabilityEnd = storeSource.indexOf('\n}\n\nasync function apiRequest', availabilityStart);
assert.notEqual(availabilityStart, -1, 'availability function exists in booking-store');
assert.notEqual(availabilityEnd, -1, 'availability function boundary exists');
const availabilitySource = storeSource.slice(availabilityStart, availabilityEnd + 2);
const compiledAvailability = ts.transpileModule(availabilitySource, {
  compilerOptions: {module: ts.ModuleKind.CommonJS},
}).outputText;
const availabilityExports = {};
const isSlotAvailable = new Function('exports', 'bookingIntervalsConflict',
  `${compiledAvailability}; return exports.isSlotAvailable;`)(
    availabilityExports,
    bookingIntervalsConflict,
  );

test('scenario A: two 60-minute cuts never overlap, even backwards', () => {
  const existing = ['12:30', 60];
  assert.equal(bookingIntervalsConflict('12:00', 60, ...existing), true);
  assert.equal(bookingIntervalsConflict('12:30', 60, ...existing), true);
  assert.equal(bookingIntervalsConflict('13:00', 60, ...existing), true);
  assert.equal(bookingIntervalsConflict('13:30', 60, ...existing), false);
});

test('scenario B: two 30-minute cuts are adjacent at 12:00 and 13:00', () => {
  const existing = ['12:30', 30];
  assert.equal(bookingIntervalsConflict('12:00', 30, ...existing), false);
  assert.equal(bookingIntervalsConflict('12:30', 30, ...existing), true);
  assert.equal(bookingIntervalsConflict('13:00', 30, ...existing), false);
});

test('scenario C: 120-minute color/mechas cannot overlap a 60-minute cut', () => {
  const existing = ['12:30', 60];
  assert.equal(bookingIntervalsConflict('12:00', 120, ...existing), true);
  assert.equal(bookingIntervalsConflict('12:30', 120, ...existing), true);
  assert.equal(bookingIntervalsConflict('13:00', 120, ...existing), true);
  assert.equal(bookingIntervalsConflict('13:30', 120, ...existing), false);
});

test('scenario D: a 120-minute service may start at 13:00 after a 12:30-13:00 cut', () => {
  const existing = ['12:30', 30];
  assert.equal(bookingIntervalsConflict('12:00', 120, ...existing), true);
  assert.equal(bookingIntervalsConflict('12:30', 120, ...existing), true);
  assert.equal(bookingIntervalsConflict('13:00', 120, ...existing), false);
});

test('90 minutes is the exclusive boundary: neither side may share time', () => {
  assert.equal(bookingIntervalsConflict('12:00', 60, '12:30', 90), true);
  assert.equal(bookingIntervalsConflict('12:00', 90, '12:30', 60), true);
  assert.equal(bookingIntervalsConflict('12:00', 90, '13:30', 60), false);
});

test('availability uses strict overlap and real service durations', () => {
  const available = (candidateTime, serviceDurationMinutes, bookedTime, bookedDuration) =>
    isSlotAvailable({
      candidateTime,
      serviceDurationMinutes,
      barberId: 'QA_CODEX_barber',
      dateString: 'QA_CODEX_date',
      existingAppointments: [{
        barberId: 'QA_CODEX_barber',
        dateString: 'QA_CODEX_date',
        timeSlot: bookedTime,
        durationMinutes: bookedDuration,
        status: 'confirmado',
      }],
    });

  assert.equal(available('12:00', 60, '12:30', 60), false);
  assert.equal(available('12:30', 60, '12:30', 60), false);
  assert.equal(available('13:00', 60, '12:30', 60), false);
  assert.equal(available('13:30', 60, '12:30', 60), true);
  assert.equal(available('12:00', 30, '12:30', 30), true);
  assert.equal(available('13:00', 30, '12:30', 30), true);
  assert.equal(available('12:00', 120, '12:30', 30), false);
  assert.equal(available('13:00', 120, '12:30', 30), true);
});
