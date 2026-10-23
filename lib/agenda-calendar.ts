import type {AppointmentItem} from './booking-store';

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const ONE_DAY = 86_400_000;

function dateNumber(key: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return NaN;
  const milliseconds = Date.parse(key + 'T00:00:00Z');
  return Number.isFinite(milliseconds) ? Math.floor(milliseconds / ONE_DAY) : NaN;
}

function dateKey(day: number): string {
  return new Date(day * ONE_DAY).toISOString().slice(0, 10);
}

export function todayInMontevideo(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Montevideo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)?.value || '';
  return part('year') + '-' + part('month') + '-' + part('day');
}

export function moveCalendarDay(key: string, offset: number): string {
  const n = dateNumber(key);
  return Number.isFinite(n) ? dateKey(n + offset) : key;
}

export function calendarWeekDays(key: string): string[] {
  const n = dateNumber(key);
  if (!Number.isFinite(n)) return [];
  const weekday = new Date(n * ONE_DAY).getUTCDay();
  const monday = n - ((weekday + 6) % 7);
  return Array.from({length: 7}, (_, index) => dateKey(monday + index));
}

export function bookingDateLabel(key: string): string {
  const n = dateNumber(key);
  if (!Number.isFinite(n)) return '';
  const date = new Date(n * ONE_DAY);
  return DAYS[date.getUTCDay()] + ' ' + date.getUTCDate() + ' ' + MONTHS[date.getUTCMonth()];
}

export function readableDay(key: string): string {
  const n = dateNumber(key);
  if (!Number.isFinite(n)) return '';
  const label = new Intl.DateTimeFormat('es-UY', {
    timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date(n * ONE_DAY));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function readableWeek(key: string): string {
  const days = calendarWeekDays(key);
  if (days.length !== 7) return '';
  const start = new Date(days[0] + 'T00:00:00Z');
  const end = new Date(days[6] + 'T00:00:00Z');
  const format = (date: Date) => new Intl.DateTimeFormat('es-UY', {
    timeZone: 'UTC', day: 'numeric', month: 'long',
  }).format(date);
  if (start.getUTCMonth() === end.getUTCMonth()) {
    return String(start.getUTCDate()) + ' al ' + format(end);
  }
  return format(start) + ' al ' + format(end);
}

/** La base guarda fecha sin año: resolverla desde la creación (máximo 30 días de antelación).
 *  Evita confundir un turno de otro año que comparte etiqueta "Vie 23 Oct". */
export function appointmentCalendarKey(
  appointment: Pick<AppointmentItem, 'dateString' | 'createdAt'>,
): string | null {
  const created = new Date(appointment.createdAt);
  if (!Number.isFinite(created.getTime())) return null;
  const bookingDay = todayInMontevideo(created);
  if (appointment.dateString === 'Hoy') return bookingDay;
  for (let offset = 0; offset <= 30; offset += 1) {
    const candidate = moveCalendarDay(bookingDay, offset);
    if (bookingDateLabel(candidate) === appointment.dateString) return candidate;
  }
  return null;
}

export function appointmentStartMinute(time: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return NaN;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= 0 && minutes < 1440 && Number(match[2]) < 60 ? minutes : NaN;
}

export function agendaDayAppointments(appointments: AppointmentItem[], date: string): AppointmentItem[] {
  return appointments
    .filter(appointment => appointment.status !== 'cancelado' &&
      appointmentCalendarKey(appointment) === date)
    .sort((a, b) => appointmentStartMinute(a.timeSlot) - appointmentStartMinute(b.timeSlot));
}
