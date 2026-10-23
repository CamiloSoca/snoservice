'use client';

import {useMemo, useState} from 'react';
import {CalendarDays, ChevronLeft, ChevronRight, CheckCircle2, XCircle, MessageCircle, Clock3} from 'lucide-react';
import type {AppointmentItem, BarberItem} from '@/lib/booking-store';
import {appointmentTimeState} from '@/lib/appointment-rules';
import {
  agendaDayAppointments, appointmentStartMinute, calendarWeekDays,
  moveCalendarDay, readableDay, readableWeek, todayInMontevideo,
} from '@/lib/agenda-calendar';

type CalendarMode = 'admin' | 'barber';
type CalendarView = 'dia' | 'semana';
type BarberRef = Pick<BarberItem, 'id' | 'name'>;

interface AgendaCalendarProps {
  mode: CalendarMode;
  appointments: AppointmentItem[];
  barbers: BarberRef[];
  canComplete: boolean;
  onComplete: (appointment: AppointmentItem) => void;
  onCancel: (appointment: AppointmentItem) => void;
  getWhatsAppLink?: (appointment: AppointmentItem) => string;
}

interface AppointmentPosition {
  appointment: AppointmentItem;
  start: number;
  end: number;
  lane: number;
  laneCount: number;
}

// La agenda permite servicios que se superponen hasta 30 minutos por la regla del
// negocio. Distribuirlos en carriles evita que una tarjeta tape a la otra.
function positionAppointments(appointments: AppointmentItem[]): AppointmentPosition[] {
  const sorted = appointments.map(appointment => {
    const start = appointmentStartMinute(appointment.timeSlot);
    return {appointment, start, end: start + Math.max(15, Number(appointment.durationMinutes) || 60)};
  }).filter(item => Number.isFinite(item.start))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const result: AppointmentPosition[] = [];
  let group: AppointmentPosition[] = [];
  let groupEnd = -1;
  let laneEnds: number[] = [];

  function finishGroup() {
    for (const item of group) item.laneCount = laneEnds.length;
    group = [];
    laneEnds = [];
  }

  for (const item of sorted) {
    if (group.length && item.start >= groupEnd) finishGroup();
    const freeLane = laneEnds.findIndex(end => end <= item.start);
    const lane = freeLane === -1 ? laneEnds.length : freeLane;
    laneEnds[lane] = item.end;
    const positioned = {...item, lane, laneCount: 1};
    group.push(positioned);
    result.push(positioned);
    groupEnd = Math.max(groupEnd, item.end);
  }
  finishGroup();
  return result;
}

const HOUR_PX = 74;
const formatMoney = (amount: number) => '$' + new Intl.NumberFormat('es-UY', {
  maximumFractionDigits: 0,
}).format(amount);

export default function AgendaCalendar({
  mode, appointments, barbers, canComplete, onComplete, onCancel, getWhatsAppLink,
}: AgendaCalendarProps) {
  const [view, setView] = useState<CalendarView>('dia');
  const [selectedDate, setSelectedDate] = useState<string>(() => todayInMontevideo());
  const [selectedBarber, setSelectedBarber] = useState('todos');
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);

  const today = todayInMontevideo();
  const filteredBarbers = useMemo(() => (
    mode === 'admin' && selectedBarber !== 'todos'
      ? barbers.filter(barber => barber.id === selectedBarber)
      : barbers
  ), [barbers, mode, selectedBarber]);

  // Sólo se reciben los turnos autorizados por la API de cada panel.
  // En modo barbero se vuelve a limitar por el único perfil autenticado.
  const ownAppointments = useMemo(() => (
    mode === 'barber'
      ? appointments.filter(appointment => barbers.some(barber => barber.id === appointment.barberId))
      : appointments
  ), [appointments, barbers, mode]);

  const displayedDates = useMemo(() => (
    view === 'semana' ? calendarWeekDays(selectedDate) : [selectedDate]
  ), [view, selectedDate]);

  const calendarAppointments = useMemo(() => (
    displayedDates.flatMap(date => agendaDayAppointments(ownAppointments, date))
      .filter(appointment => filteredBarbers.some(barber => barber.id === appointment.barberId))
  ), [displayedDates, ownAppointments, filteredBarbers]);

  const dayAppointments = useMemo(() => (
    agendaDayAppointments(ownAppointments, selectedDate)
      .filter(appointment => filteredBarbers.some(barber => barber.id === appointment.barberId))
  ), [ownAppointments, selectedDate, filteredBarbers]);

  const selectedAppointment = calendarAppointments.find(
    appointment => appointment.id === selectedAppointmentId
  ) || null;

  const serviceAmount = calendarAppointments.reduce(
    (sum, appointment) => sum + Number(appointment.priceSnapshot ?? appointment.servicePrice ?? 0), 0
  );

  const starts = dayAppointments.map(item => appointmentStartMinute(item.timeSlot))
    .filter(Number.isFinite);
  const ends = dayAppointments.map(item => appointmentStartMinute(item.timeSlot) +
    Math.max(15, Number(item.durationMinutes) || 60)).filter(Number.isFinite);
  const firstMinute = Math.max(0, Math.min(9 * 60,
    starts.length ? Math.floor(Math.min(...starts) / 60) * 60 : 9 * 60));
  const lastMinute = Math.min(24 * 60, Math.max(20 * 60,
    ends.length ? Math.ceil(Math.max(...ends) / 60) * 60 : 20 * 60));
  const timelineHeight = ((lastMinute - firstMinute) / 60) * HOUR_PX;
  const hourLines = Array.from({length: (lastMinute - firstMinute) / 60 + 1},
    (_, index) => firstMinute + index * 60);

  const columns = filteredBarbers.length;
  const gridStyle = {
    gridTemplateColumns: '66px repeat(' + Math.max(1, columns) + ', minmax(190px, 1fr))',
    minWidth: 66 + Math.max(1, columns) * 190,
  };

  function navigate(direction: -1 | 1) {
    setSelectedDate(current => moveCalendarDay(current, direction * (view === 'semana' ? 7 : 1)));
    setSelectedAppointmentId(null);
  }

  function selectView(next: CalendarView) {
    setView(next);
    setSelectedAppointmentId(null);
  }

  function handleComplete(appointment: AppointmentItem) {
    if (!canComplete) return;
    if (appointmentTimeState(appointment) !== 'started') {
      window.alert('Podés completar el turno cuando llegue su hora de inicio.');
      return;
    }
    onComplete(appointment);
    setSelectedAppointmentId(null);
  }

  function handleCancel(appointment: AppointmentItem) {
    if (appointmentTimeState(appointment) !== 'future') {
      window.alert('Este turno ya comenzó o pasó y no se puede cancelar.');
      return;
    }
    onCancel(appointment);
    setSelectedAppointmentId(null);
  }

  function bookingCard(appointment: AppointmentItem, compact = false) {
    return (
      <button
        type="button"
        key={appointment.id}
        aria-label={'Ver detalles del turno de ' + appointment.clientName + ' a las ' + appointment.timeSlot}
        onClick={() => setSelectedAppointmentId(current =>
          current === appointment.id ? null : appointment.id)}
        className={'w-full rounded-xl border-l-[3px] border px-3 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ' +
          (selectedAppointmentId === appointment.id
            ? 'border-l-blue-600 border-blue-300 bg-blue-50'
            : appointment.status === 'completado'
              ? 'border-l-emerald-600 border-zinc-200 bg-emerald-50/70 hover:bg-emerald-50'
              : 'border-l-amber-500 border-zinc-200 bg-white hover:bg-slate-50')}
      >
        <div className={'flex items-start gap-2 ' + (compact ? 'justify-between' : 'flex-col')}>
          <span className="text-xs font-extrabold tabular-nums text-slate-700">{appointment.timeSlot}</span>
          {compact && <span className={'text-[10px] font-semibold ' +
            (appointment.status === 'completado' ? 'text-emerald-700' : 'text-amber-700')}>
            {appointment.status === 'completado' ? 'Completado' : 'Sin marcar'}
          </span>}
        </div>
        <p className="truncate text-xs font-bold text-slate-900">{appointment.clientName}</p>
        <p className="truncate text-[11px] text-slate-500">
          {appointment.serviceName}{mode === 'admin' && compact ? ' · ' + appointment.barberName : ''}
        </p>
      </button>
    );
  }

  return (
    <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-slate-50 text-slate-950 shadow-sm">
      <div className="space-y-4 border-b border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
              <CalendarDays className="h-4 w-4" />
              {mode === 'admin' ? 'Agenda de la barbería' : 'Mi agenda'}
            </div>
            <h2 className="mt-1 text-xl font-extrabold tracking-tight sm:text-2xl">
              {view === 'dia' ? readableDay(selectedDate) : readableWeek(selectedDate)}
              {view === 'dia' && selectedDate === today && (
                <span className="ml-2 text-xs font-semibold text-rose-600">(hoy)</span>
              )}
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => navigate(-1)}
              aria-label={view === 'dia' ? 'Día anterior' : 'Semana anterior'}
              className="rounded-xl border border-slate-200 p-2.5 hover:bg-slate-100"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" onClick={() => {setSelectedDate(today); setSelectedAppointmentId(null);}}
              className="rounded-xl border border-slate-300 px-3 py-2.5 text-xs font-bold hover:bg-slate-100">Hoy</button>
            <button type="button" onClick={() => navigate(1)}
              aria-label={view === 'dia' ? 'Día siguiente' : 'Semana siguiente'}
              className="rounded-xl border border-slate-200 p-2.5 hover:bg-slate-100"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1" aria-label="Vista de la agenda">
            <button type="button" onClick={() => selectView('dia')} aria-pressed={view === 'dia'}
              className={'rounded-lg px-4 py-2 text-xs font-bold ' +
                (view === 'dia' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-600')}>Día</button>
            <button type="button" onClick={() => selectView('semana')} aria-pressed={view === 'semana'}
              className={'rounded-lg px-4 py-2 text-xs font-bold ' +
                (view === 'semana' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-600')}>Semana</button>
          </div>
          <div className="text-xs font-medium text-slate-500">
            <strong className="text-slate-800">{calendarAppointments.length}</strong> turnos
            <span className="mx-1">·</span>
            <strong className="text-slate-800">{formatMoney(serviceAmount)}</strong> en servicios
          </div>
        </div>

        {mode === 'admin' && (
          <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filtrar por barbero">
            <button type="button" onClick={() => {setSelectedBarber('todos');setSelectedAppointmentId(null);}}
              aria-pressed={selectedBarber === 'todos'}
              className={'shrink-0 rounded-full border px-3.5 py-2 text-xs font-bold ' +
                (selectedBarber === 'todos' ? 'border-slate-800 bg-slate-800 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400')}>
              Todos
            </button>
            {barbers.map(barber => (
              <button type="button" key={barber.id} aria-pressed={selectedBarber === barber.id}
                onClick={() => {setSelectedBarber(barber.id);setSelectedAppointmentId(null);}}
                className={'shrink-0 rounded-full border px-3.5 py-2 text-xs font-semibold ' +
                  (selectedBarber === barber.id ? 'border-slate-800 bg-slate-800 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400')}>
                {barber.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {columns === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">
          {mode === 'admin' ? 'Todavía no hay barberos configurados.' : 'No se encontró tu perfil de barbero.'}
        </div>
      ) : view === 'dia' ? (
        <div>
          <div className="max-h-[650px] overflow-auto overscroll-contain">
            <div style={{minWidth: gridStyle.minWidth}}>
              <div className="sticky top-0 z-20 grid border-b border-slate-200 bg-slate-100"
                style={gridStyle}>
                <div className="border-r border-slate-200 px-2 py-3 text-center text-[11px] font-bold text-slate-500">Hora</div>
                {filteredBarbers.map(barber => (
                  <div key={barber.id} className="border-r border-slate-200 px-3 py-3 text-center text-xs font-extrabold text-slate-800">
                    {barber.name}
                    <span className="ml-1 font-normal text-slate-400">
                      ({dayAppointments.filter(appointment => appointment.barberId === barber.id).length})
                    </span>
                  </div>
                ))}
              </div>
              <div className="grid" style={gridStyle}>
                <div className="relative border-r border-slate-200 bg-slate-50"
                  style={{height: timelineHeight}}>
                  {hourLines.map(minute => (
                    <div key={minute} className="absolute right-0 w-full border-t border-slate-200 text-right"
                      style={{top: ((minute - firstMinute) / 60) * HOUR_PX}}>
                      <span className="relative -top-2.5 pr-2 text-[10px] tabular-nums text-slate-400">
                        {String(Math.floor(minute / 60)).padStart(2, '0')}:00
                      </span>
                    </div>
                  ))}
                </div>
                {filteredBarbers.map(barber => {
                  const events = positionAppointments(dayAppointments.filter(a => a.barberId === barber.id));
                  return (
                    <div key={barber.id} className="relative border-r border-slate-200 bg-white"
                      style={{height: timelineHeight}}>
                      {hourLines.map(minute => (
                        <div key={minute} className="pointer-events-none absolute left-0 right-0 border-t border-slate-100"
                          style={{top: ((minute - firstMinute) / 60) * HOUR_PX}} />
                      ))}
                      {events.map(event => {
                        const left = event.lane * 100 / event.laneCount;
                        const width = 100 / event.laneCount;
                        const top = ((event.start - firstMinute) / 60) * HOUR_PX;
                        const height = Math.max(34, ((event.end - event.start) / 60) * HOUR_PX - 4);
                        return (
                          <div key={event.appointment.id} className="absolute z-10 px-0.5"
                            style={{top, height, left: left + '%', width: width + '%'}}>
                            <button type="button"
                              onClick={() => setSelectedAppointmentId(current =>
                                current === event.appointment.id ? null : event.appointment.id)}
                              aria-label={'Ver turno de ' + event.appointment.clientName +
                                ' a las ' + event.appointment.timeSlot}
                              className={'h-full w-full overflow-hidden rounded-lg border-l-[3px] border px-2 py-1 text-left shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ' +
                                (selectedAppointmentId === event.appointment.id
                                  ? 'border-l-blue-600 border-blue-300 bg-blue-50'
                                  : event.appointment.status === 'completado'
                                    ? 'border-l-emerald-500 border-emerald-200 bg-emerald-50'
                                    : 'border-l-amber-500 border-slate-200 bg-slate-50 hover:bg-slate-100')}>
                              <span className="block truncate text-[11px] font-bold tabular-nums text-slate-700">
                                {event.appointment.timeSlot} {event.appointment.clientName}
                              </span>
                              <span className="block truncate text-[10px] text-slate-500">{event.appointment.serviceName}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          {dayAppointments.length === 0 && (
            <p className="border-t border-slate-200 px-4 py-3 text-center text-xs text-slate-500">
              No hay turnos para este día. Deslizá para ver otros profesionales.
            </p>
          )}
          {columns > 1 && (
            <p className="border-t border-slate-100 px-4 py-2 text-center text-[11px] text-slate-400 sm:hidden">
              Deslizá horizontalmente para ver todos los barberos.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3 p-3 sm:p-4">
          {displayedDates.map(date => {
            const items = agendaDayAppointments(ownAppointments, date)
              .filter(appointment => filteredBarbers.some(barber => barber.id === appointment.barberId));
            return (
              <div key={date} className={'overflow-hidden rounded-2xl border ' +
                (date === today ? 'border-rose-300 bg-rose-50/30' : 'border-slate-200 bg-white')}>
                <button type="button"
                  onClick={() => {setSelectedDate(date);setView('dia');setSelectedAppointmentId(null);}}
                  className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50">
                  <span className="text-sm font-extrabold text-slate-800">
                    {readableDay(date)} {date === today && <span className="ml-1 text-xs font-bold text-rose-600">hoy</span>}
                  </span>
                  <span className="text-xs font-medium text-slate-500">
                    {items.length ? String(items.length) + ' turnos' : 'Sin turnos'} →
                  </span>
                </button>
                {items.length > 0 && (
                  <div className="space-y-2 border-t border-slate-100 p-2 sm:p-3">
                    {items.map(item => bookingCard(item, true))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedAppointment && (
        <div
          className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-50 max-h-[65vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:static sm:max-h-none sm:rounded-none sm:border-x-0 sm:border-b-0 sm:p-5 sm:shadow-none"
          role="region" aria-label="Detalle del turno seleccionado">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Detalle del turno</p>
              <h3 className="mt-1 text-base font-extrabold text-slate-900">{selectedAppointment.clientName}</h3>
              <p className="mt-1 text-xs text-slate-600">
                <Clock3 className="mr-1 inline h-3 w-3" />
                {selectedAppointment.dateString} · {selectedAppointment.timeSlot} hs · {selectedAppointment.durationMinutes} min
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {selectedAppointment.serviceName} · {selectedAppointment.barberName} ·
                {' ' + formatMoney(Number(selectedAppointment.priceSnapshot ?? selectedAppointment.servicePrice ?? 0))}
              </p>
              <p className="mt-1 text-[11px] font-semibold text-slate-500">
                Estado: {selectedAppointment.status === 'completado' ? 'Completado' : 'Sin marcar'}
              </p>
            </div>
            <button type="button" onClick={() => setSelectedAppointmentId(null)}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-50">
              Cerrar
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {getWhatsAppLink && selectedAppointment.clientPhone && (
              <a href={getWhatsAppLink(selectedAppointment)} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">
                <MessageCircle className="h-3.5 w-3.5 text-emerald-600" /> WhatsApp
              </a>
            )}
            {selectedAppointment.status === 'confirmado' && (
              <>
                <button type="button" onClick={() => handleComplete(selectedAppointment)}
                  disabled={!canComplete}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Completar
                </button>
                <button type="button" onClick={() => handleCancel(selectedAppointment)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50">
                  <XCircle className="h-3.5 w-3.5" /> Cancelar
                </button>
              </>
            )}
          </div>
          {!canComplete && selectedAppointment.status === 'confirmado' &&
            <p className="mt-2 text-[11px] text-amber-700">Abrí la caja para poder completar turnos.</p>}
        </div>
      )}
    </section>
  );
}
