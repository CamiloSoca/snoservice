import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bookingIntervalsConflict, validateBookingTime, businessDayOptions} from '../lib/appointment-rules.ts';
import {fixedBookingStartSlots} from '../lib/fixed-booking-time-slots.ts';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20261029_hourly_new_bookings_strict_overlap.sql');

test('all new bookings reject overlap with old 09:30 reservations, in both directions', () => {
  assert.equal(bookingIntervalsConflict('09:00', 60, '09:30', 60), true);
  assert.equal(bookingIntervalsConflict('10:00', 60, '09:30', 60), true);
  assert.equal(bookingIntervalsConflict('11:00', 60, '09:30', 60), false);
  assert.equal(bookingIntervalsConflict('10:00', 120, '11:00', 60), true);
  assert.equal(bookingIntervalsConflict('11:00', 120, '09:30', 60), false);
  assert.equal(bookingIntervalsConflict('12:00', 60, '13:00', 60), false);
});

test('new bookings use whole hours and service must fit before closing', () => {
  const now = new Date('2026-10-21T17:01:00Z');
  const dateString = businessDayOptions(now,2)[1].dateString;
  const schedule=Object.fromEntries(
    ['domingo','lunes','martes','miercoles','jueves','viernes','sabado']
      .map(day=>[day,{isOpen:true,openTime:'09:30',closeTime:'19:00'}])
  );
  const check=(timeSlot,durationMinutes)=>validateBookingTime({dateString,timeSlot,durationMinutes,schedule,now});
  assert.equal(check('10:00',60),null);
  assert.match(check('09:30',60),/horario/);
  assert.match(check('10:30',60),/horario/);
  assert.match(check('18:00',120),/horario/);
  assert.equal(check('17:00',120),null);
});

test('new fixed bookings start on complete hours even when the barber opens at HH:30', () => {
  assert.deepEqual(fixedBookingStartSlots({isOpen:true,openTime:'09:30',closeTime:'13:00'},60),['10:00','11:00','12:00']);
  assert.deepEqual(fixedBookingStartSlots({isOpen:true,openTime:'09:00',closeTime:'13:00'},120),['09:00','10:00','11:00']);
});

test('public grid, fixed grid, server API and PostgreSQL enforce the same new policy', () => {
  const store=read('lib/booking-store.ts');
  const bookingUI=read('components/BookingClient.tsx');
  const fixedApi=read('app/api/admin/fixed-bookings/route.ts');
  const fixedUI=read('components/FixedAgendaManager.tsx');
  assert.match(store,/intervalMinutes = 60/);
  assert.match(store,/Math\.ceil\(openMins \/ 60\) \* 60/);
  assert.match(bookingUI,/getSlotsForDayOfWeek\([\s\S]*?\n    60,\n    effectiveSchedule/);
  assert.match(fixedApi,/legacyUnchanged/);
  assert.match(fixedUI,/legacySlotUnchanged/);
  assert.match(migration,/BEFORE INSERT ON public\.appointments/);
  assert.match(migration,/BEFORE INSERT OR UPDATE OF shop_id,barber_id,service_id,weekday,time_slot/);
  assert.match(migration,/^\s*IF TG_OP='UPDATE'/m);
  assert.match(migration,/NEW\.time_slot::time < a\.time_slot::time \+ a\.duration_minutes/);
  assert.match(migration,/NEW\.time_slot::time < f\.time_slot::time \+ f\.duration_minutes/);
  assert.match(migration,/trg_zzzz_hourly_new_fixed_booking/);
  assert.doesNotMatch(migration,/\bDELETE FROM public\.(appointments|fixed_bookings)\b|\bUPDATE public\.(appointments|fixed_bookings)\b|\bTRUNCATE\b/i);
});
