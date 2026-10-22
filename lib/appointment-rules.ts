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

// Reglas de agenda real: servicios cortos (hasta 90 min) pueden compartir
// como máximo 30 minutos. Servicios largos (>90 min) no se solapan nunca.
// Un mismo horario de inicio nunca puede asignarse dos veces al mismo barbero.
export function bookingIntervalsConflict(
  firstTime: string, firstDuration: number, secondTime: string, secondDuration: number,
): boolean {
  const first = minutes(firstTime);
  const second = minutes(secondTime);
  if (first === null || second === null ||
      !Number.isFinite(firstDuration) || !Number.isFinite(secondDuration) ||
      firstDuration <= 0 || secondDuration <= 0) return true;
  if (first === second) return true;
  const sharedMinutes = Math.max(0, Math.min(first + firstDuration, second + secondDuration)
    - Math.max(first, second));
  if (sharedMinutes === 0) return false;
  return firstDuration > 90 || secondDuration > 90 || sharedMinutes > 30;
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
      start < open || start + duration > close) {
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
