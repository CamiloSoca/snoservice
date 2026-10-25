import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixedBookingStartSlots} from '../lib/fixed-booking-time-slots.ts';
import {resolvedHours} from '../lib/weekly-hours.ts';
import {bookingIntervalsConflict} from '../lib/appointment-rules.ts';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const rule=(openTime,closeTime,isOpen=true)=>({isOpen,openTime,closeTime});
const all=Object.fromEntries(
  ['domingo','lunes','martes','miercoles','jueves','viernes','sabado']
    .map(day=>[day,rule('09:00','19:00')]),
);

test('turno fijo de corte: los bloques comienzan cada 30 minutos',()=>{
  const slots=fixedBookingStartSlots(rule('09:00','11:00'),60);
  assert.deepEqual(slots,['09:00','09:30','10:00','10:30']);
  assert.equal(slots.includes('09:10'),false);
  assert.equal(slots.includes('09:45'),false);
  assert.equal(slots.includes('11:00'),false);
});
test('mechas/color global: no usar el margen de cierre de los cortes',()=>{
  assert.deepEqual(fixedBookingStartSlots(rule('09:00','11:00'),120),['09:00']);
  assert.deepEqual(fixedBookingStartSlots(rule('09:00','11:00'),90),
    ['09:00','09:30']);
});
test('bloques consideran cierre, jornada del barbero y día cerrado',()=>{
  const barber={...all,sabado:rule('10:00','12:00'),martes:rule('09:00','19:00',false)};
  const hours=resolvedHours(all,barber);
  assert.deepEqual(fixedBookingStartSlots(hours.sabado,60),
    ['10:00','10:30','11:00','11:30']);
  assert.deepEqual(fixedBookingStartSlots(hours.martes,60),[]);
  assert.deepEqual(fixedBookingStartSlots(rule('09:00','19:00',false),60),[]);
});
test('el intervalo es relativo a la apertura efectiva, igual que la reserva online',()=>{
  assert.deepEqual(fixedBookingStartSlots(rule('09:15','10:45'),60),
    ['09:15','09:45','10:15']);
  assert.deepEqual(fixedBookingStartSlots(rule('23:00','23:59'),60),[]);
});
test('ante horarios o duraciones inválidas, ningún bloque se ofrece',()=>{
  assert.deepEqual(fixedBookingStartSlots(rule('15:00','14:00'),60),[]);
  assert.deepEqual(fixedBookingStartSlots(rule('fake','19:00'),60),[]);
  assert.deepEqual(fixedBookingStartSlots(rule('09:00','19:00'),0),[]);
  assert.deepEqual(fixedBookingStartSlots(rule('09:00','19:00'),720),[]);
});
test('la excepción de los cortes hacia atrás y el bloqueo hacia adelante no cambia',()=>{
  assert.equal(bookingIntervalsConflict('09:00',60,'09:30',60),false);
  assert.equal(bookingIntervalsConflict('10:00',60,'09:30',60),true);
  assert.equal(bookingIntervalsConflict('10:30',60,'09:30',60),false);
  assert.equal(bookingIntervalsConflict('09:00',120,'09:30',60),true);
});
test('el selector de fijos no acepta escritura de minutos y mantiene el historial',()=>{
  const manager=read('components/FixedAgendaManager.tsx');
  const admin=read('app/admin/page.tsx');
  assert.doesNotMatch(manager,/type="time"/);
  assert.match(manager,/startSlots\.map\(slot/);
  assert.match(manager,/aria-pressed=\{draft\.timeSlot===slot\}/);
  assert.match(manager,/startSlots\.includes\(draft\.timeSlot\)/);
  assert.match(manager,/se mantiene intacto/);
  assert.match(admin,/shopSchedule=\{shopConfig\.schedule\}/);
  assert.doesNotMatch(manager,/\.delete\(/);
});
test('el servidor verifica el mismo bloque antes de tocar fijos; el motor original sigue',()=>{
  const api=read('app/api/admin/fixed-bookings/route.ts');
  assert.match(api,/verifyCsrfOrigin\(request\)/);
  assert.match(api,/requireAdminSession\(\)/);
  assert.match(api,/fixedBookingStartSlots\(/);
  assert.match(api,/validSlots\.includes\(timeSlot\)/);
  assert.match(api,/No se pudieron verificar los horarios/);
  assert.match(api,/from\('fixed_bookings'\)\.update/);
  const sql=read('supabase/migrations/20261025_barber_hours_fixed_bookings.sql');
  assert.match(sql,/CREATE TRIGGER trg_validate_fixed_booking/);
});
