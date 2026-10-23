import test from 'node:test';
import assert from 'node:assert/strict';
import {
  todayInMontevideo,
  moveCalendarDay,
  calendarWeekDays,
  bookingDateLabel,
  readableWeek,
  appointmentCalendarKey,
  agendaDayAppointments,
} from '../lib/agenda-calendar.ts';

test('la zona horaria de Montevideo define el día, no la zona del servidor', () => {
  assert.equal(todayInMontevideo(new Date('2026-10-23T02:50:00Z')), '2026-10-22');
  assert.equal(todayInMontevideo(new Date('2026-10-23T03:10:00Z')), '2026-10-23');
});

test('la semana empieza el lunes y termina el domingo', () => {
  assert.deepEqual(calendarWeekDays('2026-10-23'), [
    '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22',
    '2026-10-23', '2026-10-24', '2026-10-25',
  ]);
  assert.equal(readableWeek('2026-10-23'), '19 al 25 de octubre');
});

test('la navegación semanal atraviesa el cambio de año sin confundir fechas', () => {
  assert.deepEqual(calendarWeekDays('2027-01-01'), [
    '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31',
    '2027-01-01', '2027-01-02', '2027-01-03',
  ]);
  assert.equal(moveCalendarDay('2026-12-31', 1), '2027-01-01');
});

test('una reserva se ubica según su creación y fecha de turno, no por un año arbitrario', () => {
  assert.equal(bookingDateLabel('2026-10-23'), 'Vie 23 Oct');
  assert.equal(appointmentCalendarKey({
    dateString: 'Vie 23 Oct',
    createdAt: '2026-10-22T23:30:00.000Z',
  }), '2026-10-23');
  assert.equal(appointmentCalendarKey({
    dateString: 'Vie 1 Ene',
    createdAt: '2026-12-31T23:30:00.000Z',
  }), '2027-01-01');
  assert.equal(appointmentCalendarKey({
    dateString: 'Hoy',
    createdAt: '2026-10-22T23:30:00.000Z',
  }), '2026-10-22');
});

test('la agenda excluye cancelaciones y no mezcla fechas', () => {
  const base = {createdAt: '2026-10-22T21:00:00Z', dateString: 'Vie 23 Oct'};
  const appointments = [
    {...base, id: 'a', status: 'confirmado', timeSlot: '11:00'},
    {...base, id: 'b', status: 'cancelado', timeSlot: '09:00'},
    {...base, id: 'c', status: 'completado', timeSlot: '10:00'},
  ];
  assert.deepEqual(
    agendaDayAppointments(appointments, '2026-10-23').map(item => item.id),
    ['c', 'a'],
  );
  assert.deepEqual(agendaDayAppointments(appointments, '2026-10-24'), []);
});
