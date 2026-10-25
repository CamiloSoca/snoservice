const TIME_ZONE = 'America/Montevideo';
const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const SCHEDULE_KEYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

export type BusinessSchedule = Record<string, {
  isOpen?: boolean;
  openTime?: string;
  closeTime?: string;
}>;

function businessParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value);
  return {year: value('year'), month: value('month'), day: value('day'),
    hour: value('hour'), minute: value('minute')};
}

function dayNumber(date: Date): number {
  const {year, month, day} = businessParts(date);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function labelForDay(day: number): string {
  const date = new Date(day * 86_400_000);
  return `${DAY_NAMES[date.getUTCDay()]} ${date.getUTCDate()} ${MONTH_NAMES[date.getUTCMonth()]}`;
}

function minutes(time: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
}

export function slotsOverlap(firstTime: string, firstDuration: number,
  secondTime: string, secondDuration: number): boolean {
  const first = minutes(firstTime);
  const second = minutes(secondTime);
  if (first === null || second === null || firstDuration <= 0 || secondDuration <= 0) return true;
  return first < second + secondDuration && second < first + firstDuration;
}

// Orden IMPORTA: el nuevo cliente puede ocupar los 30 minutos previos
// al comienzo de un turno YA reservado (si ambos servicios duran <90 min).
// Nunca se permite un nuevo inicio que invada un turno anterior, ni dos
// reservas a la misma hora. Tratamientos largos requieren tiempo exclusivo.
// first = candidato nuevo; second = turno previamente confirmado.
export function bookingIntervalsConflict(
  firstTime: string, firstDuration: number, secondTime: string, secondDuration: number,
): boolean {
  const candidate = minutes(firstTime);
  const booked = minutes(secondTime);
  if (candidate === null || booked === null ||
      !Number.isInteger(firstDuration) || !Number.isInteger(secondDuration) ||
      firstDuration <= 0 || secondDuration <= 0) return true;
  if (candidate === booked) return true;
  const overlap = Math.max(0, Math.min(candidate + firstDuration, booked + secondDuration)
    - Math.max(candidate, booked));
  if (overlap === 0) return false;
  // Si el turno existente empezó ANTES, no ofrecer un turno posterior
  // hasta que haya terminado: 09:30-10:30 bloquea las 10:00.
  if (candidate > booked) return true;
  return firstDuration >= 90 || secondDuration >= 90 || overlap > 30;
}

// Regla de reserva pública. La agenda fija es un bloqueo absoluto:
 // nunca comparte minutos con una reserva normal. Sin un fijo,
 // conservar exactamente la excepción histórica (unidireccional) de 13'Cut.
export function bookingAvailabilityConflict(
  candidateTime: string, candidateDuration: number,
  existingTime: string, existingDuration: number,
  existingIsFixed = false,
): boolean {
  return existingIsFixed
    ? slotsOverlap(candidateTime, candidateDuration, existingTime, existingDuration)
    : bookingIntervalsConflict(candidateTime, candidateDuration, existingTime, existingDuration);
}

export function businessDayOptions(now = new Date(), count = 30) {
  const firstDay = dayNumber(now);
  return Array.from({length: count}, (_, offset) => {
    const day = firstDay + offset;
    const date = new Date(day * 86_400_000);
    return {dateString: labelForDay(day), dayOfWeek: date.getUTCDay(),
      dayNumber: String(date.getUTCDate()), monthName: MONTH_NAMES[date.getUTCMonth()],
      dayName: DAY_NAMES[date.getUTCDay()]};
  });
}

export function validateBookingTime(input: {
  dateString: string;
  timeSlot: string;
  durationMinutes: number;
  schedule: BusinessSchedule;
  now?: Date;
}): string | null {
  const now = input.now ?? new Date();
  const option = businessDayOptions(now).find(day => day.dateString === input.dateString);
  if (!option) return 'Elegí una fecha disponible dentro de los próximos 30 días.';
  const rule = input.schedule[SCHEDULE_KEYS[option.dayOfWeek]];
  if (!rule || rule.isOpen !== true) return 'El local está cerrado ese día.';
  const start = minutes(input.timeSlot);
  const open = minutes(rule.openTime || '');
  const close = minutes(rule.closeTime || '');
  const duration = input.durationMinutes;
  if (start === null || open === null || close === null || (start - open) % 30 !== 0 ||
      !Number.isInteger(duration) || duration < 15 || duration > 720 ||
      start < open || start >= close ||
      // Un corte corto puede empezar hasta 30 min antes del cierre y
      // terminar 30 min después; mechas/color (>=90 min) terminan antes.
      start + duration > close + (duration < 90 ? 30 : 0)) {
    return 'El horario no está disponible dentro del horario del local.';
  }
  const today = businessParts(now);
  if (option.dateString === labelForDay(dayNumber(now)) &&
      start <= today.hour * 60 + today.minute) {
    return 'Ese horario ya comenzó o pasó.';
  }
  return null;
}

// date_string no guarda el año. Se resuelve desde created_at, cuando la
// reserva sólo podía hacerse dentro de los siguientes 30 días. Ante datos
// heredados ambiguos, se rechaza la transición para proteger el turno.
export function appointmentTimeState(input: {
  dateString: string;
  timeSlot: string;
  createdAt: string;
  now?: Date;
}): 'future' | 'started' | 'invalid' {
  const createdAt = new Date(input.createdAt);
  const now = input.now ?? new Date();
  const start = minutes(input.timeSlot);
  if (!Number.isFinite(createdAt.getTime()) || start === null) return 'invalid';
  const createdDay = dayNumber(createdAt);
  const scheduledOffset = Array.from({length: 31}, (_, index) => index)
    .find(offset => labelForDay(createdDay + offset) === input.dateString);
  if (scheduledOffset === undefined) return 'invalid';
  const scheduledDay = createdDay + scheduledOffset;
  const currentDay = dayNumber(now);
  if (scheduledDay !== currentDay) return scheduledDay > currentDay ? 'future' : 'started';
  const current = businessParts(now);
  return start > current.hour * 60 + current.minute ? 'future' : 'started';
}
