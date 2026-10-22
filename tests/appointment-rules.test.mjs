import test from 'node:test';
import assert from 'node:assert/strict';
import {appointmentTimeState, businessDayOptions, slotsOverlap, bookingIntervalsConflict, validateBookingTime} from '../lib/appointment-rules.ts';

const schedule = Object.fromEntries(
  ['domingo','lunes','martes','miercoles','jueves','viernes','sabado']
    .map(day => [day, {isOpen: true, openTime: '09:00', closeTime: '19:00'}]),
);

test('Montevideo decides the date even when the device is in another zone', () => {
  assert.equal(businessDayOptions(new Date('2026-10-22T01:30:00Z'), 1)[0].dateString, 'Mié 21 Oct');
});

test('a booking must be in the future, on an open day, and fit completely in business hours', () => {
  const now = new Date('2026-10-21T17:01:00Z'); // 14:01 en Montevideo
  const base = {dateString: 'Mié 21 Oct', timeSlot: '15:00', durationMinutes: 30, schedule, now};
  assert.equal(validateBookingTime(base), null);
  assert.match(validateBookingTime({...base, timeSlot: '14:00'}), /pasó/);
  assert.match(validateBookingTime({...base, timeSlot: '18:30', durationMinutes: 45}), /horario/);
  assert.match(validateBookingTime({...base, timeSlot: '15:17'}), /horario/);
  assert.equal(validateBookingTime({...base, timeSlot: '15:15',
    schedule: {...schedule, miercoles: {...schedule.miercoles, openTime: '09:15'}}}), null);
  assert.match(validateBookingTime({...base, dateString: 'Mar 20 Oct'}), /30 días/);
  assert.match(validateBookingTime({...base, schedule: {...schedule, miercoles: {...schedule.miercoles, isOpen: false}}}), /cerrado/);
});

test('cancellation is rejected as soon as the scheduled minute starts', () => {
  const appointment = {dateString: 'Mié 21 Oct', timeSlot: '15:00', createdAt: '2026-10-20T12:00:00Z'};
  assert.equal(appointmentTimeState({...appointment, now: new Date('2026-10-21T17:59:00Z')}), 'future');
  assert.equal(appointmentTimeState({...appointment, now: new Date('2026-10-21T18:00:00Z')}), 'started');
  assert.equal(appointmentTimeState({...appointment, now: new Date('2026-10-21T18:01:00Z')}), 'started');
});

test('a year crossing resolves from creation time; ambiguous legacy dates fail closed', () => {
  const appointment = {dateString: 'Vie 1 Ene', timeSlot: '10:00', createdAt: '2026-12-31T16:00:00Z'};
  assert.equal(appointmentTimeState({...appointment, now: new Date('2026-12-31T18:00:00Z')}), 'future');
  assert.equal(appointmentTimeState({...appointment, now: new Date('2027-01-01T13:01:00Z')}), 'started');
  assert.equal(appointmentTimeState({...appointment, dateString: 'Lun 1 Ene'}), 'invalid');
});

test('all overlapping intervals are rejected regardless of insertion order', () => {
  assert.equal(slotsOverlap('10:00', 45, '10:30', 30), true);
  assert.equal(slotsOverlap('10:30', 30, '10:00', 45), true);
  assert.equal(slotsOverlap('10:00', 30, '10:30', 30), false);
  assert.equal(slotsOverlap('10:00', 60, '10:00', 30), true);
});

test('a short cut uses the free 09:00–09:30 gap before a 09:30–10:30 booking', () => {
  // Adjacent appointments are valid; the first must end before the next starts.
  assert.equal(slotsOverlap('09:00', 30, '09:30', 60), false);
  assert.equal(slotsOverlap('09:00', 45, '09:30', 60), true);
  assert.equal(slotsOverlap('09:00', 120, '09:30', 60), true);
  assert.equal(slotsOverlap('10:30', 30, '09:30', 60), false);
  assert.equal(slotsOverlap('10:00', 30, '09:30', 60), true);
});

test('near closing, only services that finish before the closing minute can be booked', () => {
  const tomorrow = businessDayOptions(new Date('2026-10-21T17:01:00Z'), 2)[1].dateString;
  const now = new Date('2026-10-21T17:01:00Z');
  assert.equal(validateBookingTime({dateString: tomorrow, timeSlot:'18:30',
    durationMinutes:30, schedule, now}), null);
  assert.match(validateBookingTime({dateString: tomorrow, timeSlot:'18:30',
    durationMinutes:120, schedule, now}) || '', /horario/);
});

test('barbershop booking: 60min cuts at 09:00 and 09:30 are both available', () => {
  assert.equal(bookingIntervalsConflict('09:00',60,'09:30',60),false);
  assert.equal(bookingIntervalsConflict('09:30',60,'09:00',60),false);
  assert.equal(bookingIntervalsConflict('09:00',60,'09:00',60),true);
  assert.equal(bookingIntervalsConflict('09:00',60,'09:15',60),true);
  assert.equal(bookingIntervalsConflict('09:00',90,'09:30',60),true);
  assert.equal(bookingIntervalsConflict('09:00',90,'10:00',60),false);
});

test('long services (120min mechas or color) do not overlap existing appointments', () => {
  assert.equal(bookingIntervalsConflict('09:00',120,'09:30',60),true);
  assert.equal(bookingIntervalsConflict('09:30',60,'09:00',120),true);
  assert.equal(bookingIntervalsConflict('09:00',60,'09:30',120),true);
  assert.equal(bookingIntervalsConflict('09:30',120,'11:30',60),false);
  assert.equal(bookingIntervalsConflict('09:00',60,'10:00',120),false);
});
