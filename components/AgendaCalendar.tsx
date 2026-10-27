'use client';

import {useEffect,useMemo,useState} from 'react';
import {CalendarDays, ChevronLeft, ChevronRight, RefreshCw, WifiOff} from 'lucide-react';
import type {AppointmentItem, BarberItem} from '@/lib/booking-store';
import AppointmentDetailModal, {type AppointmentActionResult} from '@/components/AppointmentDetailModal';
import type {OnSitePaymentMethod} from '@/lib/payment-method';
import {
  agendaDayAppointments, appointmentStartMinute, calendarWeekDays,
  moveCalendarDay, readableDay, readableWeek, todayInMontevideo, bookingDateLabel,
} from '@/lib/agenda-calendar';

type CalendarMode = 'admin' | 'barber';
type CalendarView = 'dia' | 'semana';
interface FixedRule {
 id:string;barberId:string;serviceId:string;clientName:string;clientPhone:string;clientEmail:string;
 weekday:number;timeSlot:string;durationMinutes:number;startDate:string;endDate:string|null;
 serviceName:string;servicePrice:number;barberName:string;skippedDates?:string[];
 monthlyPlan?:{fixed_booking_id:string;monthly_price:number;included_cuts:number;active:boolean}|null;
}
type FixedCompleted={fixedBookingId:string;occurrenceDate:string;chargeId:string;amount:number;coveredBySubscription?:boolean};
type FixedPeriod={fixedBookingId:string;month:string;includedCuts:number;used:number};
type BarberRef = Pick<BarberItem, 'id' | 'name'>;

interface AgendaCalendarProps {
  mode: CalendarMode;
  appointments: AppointmentItem[];
  barbers: BarberRef[];
  canComplete: boolean;
  onComplete: (appointment: AppointmentItem, method: OnSitePaymentMethod) => Promise<AppointmentActionResult>;
  onCancel: (appointment: AppointmentItem) => Promise<AppointmentActionResult>;
  getWhatsAppLink?: (appointment: AppointmentItem) => string | null;
  syncState: 'connecting' | 'updating' | 'connected' | 'error';
  lastUpdatedAt: number | null;
  onRefresh: () => void;
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
  syncState, lastUpdatedAt, onRefresh,
}: AgendaCalendarProps) {
  const [view, setView] = useState<CalendarView>('dia');
  const [selectedDate, setSelectedDate] = useState<string>(() => todayInMontevideo());
  const [selectedBarber, setSelectedBarber] = useState('todos');
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string>('');
  const [fixedRules,setFixedRules]=useState<FixedRule[]>([]);
  const [completedFixed,setCompletedFixed]=useState<FixedCompleted[]>([]);
  const [fixedPeriods,setFixedPeriods]=useState<FixedPeriod[]>([]);
  const [fixedError,setFixedError]=useState('');
  const [fixedReload,setFixedReload]=useState(0);
  useEffect(()=>{
    let alive=true;
    async function refreshFixed() {
      try {
        const dates=view==='semana'?calendarWeekDays(selectedDate):[selectedDate];
        const params=new URLSearchParams({from:dates[0],to:dates[dates.length-1]});
        const response=await fetch('/api/agenda/fixed?'+params.toString(),{cache:'no-store',credentials:'same-origin'});
        const json=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(json.error||'No se pudieron actualizar los fijos.');
        if(alive){
          setFixedRules(Array.isArray(json.items)?json.items:[]);
          setCompletedFixed(Array.isArray(json.completed)?json.completed:[]);
          setFixedPeriods(Array.isArray(json.periods)?json.periods:[]);
          setFixedError('');
        }
      } catch {
        if(alive)setFixedError('No se pudieron verificar los clientes fijos. Reintentá la actualización.');
      }
    }
    void refreshFixed();
    const onVisible=()=>{if(document.visibilityState==='visible')void refreshFixed();};
    document.addEventListener('visibilitychange',onVisible);
    const interval=window.setInterval(()=>{if(document.visibilityState==='visible')void refreshFixed();},12_000);
    return()=>{alive=false;window.clearInterval(interval);document.removeEventListener('visibilitychange',onVisible);};
  },[mode,fixedReload,view,selectedDate]);

  const today = todayInMontevideo();
  const syncLabel = syncState === 'error' ? 'Sin sincronizar'
    : syncState === 'updating' || syncState === 'connecting' ? 'Actualizando…'
    : lastUpdatedAt ? 'Actualizado ' + new Intl.DateTimeFormat('es-UY', {
      timeZone: 'America/Montevideo', hour: '2-digit', minute: '2-digit',
    }).format(new Date(lastUpdatedAt)) : 'Al día';
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

  const fixedEvents=useMemo<AppointmentItem[]>(()=>(
    displayedDates.flatMap(date=>{
      const day=new Date(date+'T00:00:00Z');
      if(Number.isNaN(day.getTime()))return [];
      const weekday=day.getUTCDay();
      return fixedRules.filter(f=>f.weekday===weekday&&date>=f.startDate
        &&(!f.endDate||date<=f.endDate)
        &&!f.skippedDates?.includes(date)
        &&barbers.some(b=>b.id===f.barberId))
        .map(f=>{
          const paid=completedFixed.find(c=>c.fixedBookingId===f.id&&c.occurrenceDate===date);
          const period=fixedPeriods.find(p=>p.fixedBookingId===f.id&&p.month===date.slice(0,7)+'-01');
          const remaining=Math.max(0,(period?.includedCuts||4)-(period?.used||0));
          const prepaid=Boolean(period&&remaining>0);
          const price=paid&&!paid.coveredBySubscription?paid.amount:f.servicePrice;
          return {
            id:'fixed-'+f.id+'-'+date,code:'FIJO',isFixed:true,
            fixedBookingId:f.id,fixedDate:date,
            fixedSubscription:{active:Boolean(f.monthlyPlan?.active),paid:Boolean(period),used:period?.used||0,remaining,eligible:!paid&&prepaid,covered:paid?.coveredBySubscription===true},
            serviceId:f.serviceId,serviceName:f.serviceName,servicePrice:price,priceSnapshot:price,
            durationMinutes:f.durationMinutes,barberId:f.barberId,barberName:f.barberName,
            dateString:bookingDateLabel(date),timeSlot:f.timeSlot,
            clientName:f.clientName,clientPhone:f.clientPhone,clientEmail:f.clientEmail,
            status:(paid?'completado':'confirmado') as 'completado'|'confirmado',
            // La fecha del fijo, no el instante de renderización.
            createdAt:date+'T12:00:00.000Z',
          };
        });
    })
  ),[displayedDates,fixedRules,barbers,completedFixed,fixedPeriods]);
  const agendaEntries=useMemo(()=>[...ownAppointments,...fixedEvents],[ownAppointments,fixedEvents]);
  const calendarAppointments = useMemo(() => (
    displayedDates.flatMap(date => agendaDayAppointments(agendaEntries, date))
      .filter(appointment => filteredBarbers.some(barber => barber.id === appointment.barberId))
  ), [displayedDates, agendaEntries, filteredBarbers]);

  const dayAppointments = useMemo(() => (
    agendaDayAppointments(agendaEntries, selectedDate)
      .filter(appointment => filteredBarbers.some(barber => barber.id === appointment.barberId))
  ), [agendaEntries, selectedDate, filteredBarbers]);

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
  const noAppointments = dayAppointments.length === 0;
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
            ? 'border-l-emerald-400 border-emerald-500/50 bg-emerald-500/10'
            : appointment.status === 'completado'
              ? 'border-l-emerald-600 border-zinc-800 bg-emerald-500/10 hover:bg-emerald-500/10'
              : 'border-l-amber-500 border-zinc-800 bg-zinc-900 hover:bg-zinc-900')}
      >
        <div className={'flex items-start gap-2 ' + (compact ? 'justify-between' : 'flex-col')}>
          <span className="text-xs font-extrabold tabular-nums text-zinc-200">{appointment.timeSlot}</span>
          {compact && <span className={'text-[10px] font-semibold ' +
            (appointment.status === 'completado' ? 'text-emerald-300' : 'text-amber-300')}>
            {appointment.isFixed ? appointment.status === 'completado' ? 'Fijo · Hecho' : 'Fijo' : appointment.status === 'completado' ? 'Completado' : 'Sin marcar'}
          </span>}
        </div>
        <p className="truncate text-xs font-bold text-zinc-100">{appointment.clientName}</p>
        <p className="truncate text-[11px] text-zinc-400">
          {appointment.serviceName}{mode === 'admin' && compact ? ' · ' + appointment.barberName : ''}
        </p>
      </button>
    );
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-sm">
      <div className="space-y-3 border-b border-zinc-800 bg-zinc-900/80 px-3 py-3 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-400">
              <CalendarDays className="h-4 w-4" />
              {mode === 'admin' ? 'Agenda de la barbería' : 'Mi agenda'}
            </div>
            <h2 className="mt-1 text-base font-extrabold tracking-tight sm:text-2xl">
              {view === 'dia' ? readableDay(selectedDate) : readableWeek(selectedDate)}
              {view === 'dia' && selectedDate === today && (
                <span className="ml-2 text-xs font-semibold text-emerald-400">(hoy)</span>
              )}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={() => navigate(-1)}
              aria-label={view === 'dia' ? 'Día anterior' : 'Semana anterior'}
              className="rounded-lg border border-zinc-800 p-2 hover:bg-zinc-800"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" onClick={() => {setSelectedDate(today); setSelectedAppointmentId(null);}}
              className="rounded-lg border border-zinc-700 px-2.5 py-2 text-xs font-bold hover:bg-zinc-800">Hoy</button>
            <button type="button" onClick={() => navigate(1)}
              aria-label={view === 'dia' ? 'Día siguiente' : 'Semana siguiente'}
              className="rounded-lg border border-zinc-800 p-2 hover:bg-zinc-800"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-800 p-1" aria-label="Vista de la agenda">
            <button type="button" onClick={() => selectView('dia')} aria-pressed={view === 'dia'}
              className={'rounded-lg px-4 py-2 text-xs font-bold ' +
                (view === 'dia' ? 'bg-emerald-400 text-zinc-950 shadow-sm' : 'text-zinc-400')}>Día</button>
            <button type="button" onClick={() => selectView('semana')} aria-pressed={view === 'semana'}
              className={'rounded-lg px-4 py-2 text-xs font-bold ' +
                (view === 'semana' ? 'bg-emerald-400 text-zinc-950 shadow-sm' : 'text-zinc-400')}>Semana</button>
          </div>
          <div className="text-[11px] font-medium text-zinc-400">
            <strong className="text-zinc-200">{calendarAppointments.length}</strong> turnos
            <span className="mx-1">·</span>
            <strong className="text-zinc-200">{formatMoney(serviceAmount)}</strong> en servicios
          </div>
        </div>

        {mode === 'admin' && (
          <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filtrar por barbero">
            <button type="button" onClick={() => {setSelectedBarber('todos');setSelectedAppointmentId(null);}}
              aria-pressed={selectedBarber === 'todos'}
              className={'shrink-0 rounded-full border px-3.5 py-2 text-xs font-bold ' +
                (selectedBarber === 'todos' ? 'border-emerald-400 bg-emerald-400 text-zinc-950'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-600')}>
              Todos
            </button>
            {barbers.map(barber => (
              <button type="button" key={barber.id} aria-pressed={selectedBarber === barber.id}
                onClick={() => {setSelectedBarber(barber.id);setSelectedAppointmentId(null);}}
                className={'shrink-0 rounded-full border px-3.5 py-2 text-xs font-semibold ' +
                  (selectedBarber === barber.id ? 'border-emerald-400 bg-emerald-400 text-zinc-950'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-600')}>
                {barber.name}
              </button>
            ))}
          </div>
        )}
      </div>


      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900/60 px-3 py-1.5 sm:px-4">
        <div role="status" aria-live="polite" className={'flex items-center gap-1.5 text-[11px] font-semibold ' +
          (syncState === 'error' ? 'text-amber-300' : 'text-zinc-400')}>
          {syncState === 'error' ? <WifiOff className="h-3.5 w-3.5" /> :
            <span className={'h-1.5 w-1.5 rounded-full ' +
              (syncState === 'connected' ? 'bg-emerald-400' : 'bg-amber-400')} />}
          {syncLabel}
        </div>
        <button type="button" onClick={()=>{setFixedReload(n=>n+1);onRefresh();}} disabled={syncState === 'updating'}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-[11px] font-semibold text-zinc-200 hover:border-emerald-500 hover:text-emerald-300 disabled:opacity-50"
          aria-label="Actualizar la agenda ahora">
          <RefreshCw className={'h-3.5 w-3.5 ' + (syncState === 'updating' ? 'animate-spin' : '')} />
          Actualizar
        </button>
      </div>

      {fixedError && <p role="alert" className="mx-3 mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">{fixedError}</p>}
      {actionFeedback && (
        <div role="status" className="mx-3 mt-3 flex items-start justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-200">
          <span>{actionFeedback}</span>
          <button type="button" onClick={() => setActionFeedback('')}
            aria-label="Ocultar aviso" className="shrink-0 text-xs font-bold underline">Cerrar</button>
        </div>
      )}

      {columns === 0 ? (
        <div className="p-8 text-center text-sm text-zinc-400">
          {mode === 'admin' ? 'Todavía no hay barberos configurados.' : 'No se encontró tu perfil de barbero.'}
        </div>
      ) : view === 'dia' ? (
        <div>
          <div className="space-y-2 p-3 lg:hidden">
            {noAppointments ? (
              <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900 px-4 py-10 text-center">
                <CalendarDays className="mx-auto h-7 w-7 text-zinc-500" />
                <p className="mt-2 text-sm font-bold text-zinc-200">Sin turnos para este día</p>
                <p className="mt-1 text-xs text-zinc-500">Cambiá la fecha con las flechas de arriba.</p>
              </div>
            ) : (
              dayAppointments.map((appointment) => (
                <button key={appointment.id} type="button"
                  onClick={() => setSelectedAppointmentId(appointment.id)}
                  className="flex min-h-[66px] w-full items-center gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-left active:scale-[0.99] hover:border-zinc-600">
                  <div className="w-[54px] shrink-0 border-r border-zinc-700 pr-2 text-center">
                    <span className="block text-sm font-black tabular-nums text-emerald-400">{appointment.timeSlot}</span>
                    <span className="text-[10px] text-zinc-500">{appointment.durationMinutes || 60} min</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-zinc-100">{appointment.clientName}</p>
                    <p className="mt-0.5 truncate text-xs text-zinc-400">{appointment.serviceName}</p>
                    {mode === 'admin' && <p className="mt-1 truncate text-[11px] font-semibold text-emerald-400">
                      {appointment.barberName}
                    </p>}
                  </div>
                  <span className={'shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ' +
                    (appointment.status === 'completado'
                      ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300')}>
                    {appointment.isFixed ? appointment.status === 'completado' ? 'Fijo · Hecho' : 'Fijo' : appointment.status === 'completado' ? 'Hecho' : 'Pendiente'}
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="hidden max-h-[650px] overflow-auto overscroll-contain lg:block">
            <div style={{minWidth: gridStyle.minWidth}}>
              <div className="sticky top-0 z-20 grid border-b border-zinc-800 bg-zinc-800"
                style={gridStyle}>
                <div className="border-r border-zinc-800 px-2 py-3 text-center text-[11px] font-bold text-zinc-400">Hora</div>
                {filteredBarbers.map(barber => (
                  <div key={barber.id} className="border-r border-zinc-800 px-3 py-3 text-center text-xs font-extrabold text-zinc-200">
                    {barber.name}
                    <span className="ml-1 font-normal text-zinc-500">
                      ({dayAppointments.filter(appointment => appointment.barberId === barber.id).length})
                    </span>
                  </div>
                ))}
              </div>
              <div className="grid" style={gridStyle}>
                <div className="relative border-r border-zinc-800 bg-zinc-900"
                  style={{height: timelineHeight}}>
                  {hourLines.map(minute => (
                    <div key={minute} className="absolute right-0 w-full border-t border-zinc-800 text-right"
                      style={{top: ((minute - firstMinute) / 60) * HOUR_PX}}>
                      <span className="relative -top-2.5 pr-2 text-[10px] tabular-nums text-zinc-500">
                        {String(Math.floor(minute / 60)).padStart(2, '0')}:00
                      </span>
                    </div>
                  ))}
                </div>
                {filteredBarbers.map(barber => {
                  const events = positionAppointments(dayAppointments.filter(a => a.barberId === barber.id));
                  return (
                    <div key={barber.id} className="relative border-r border-zinc-800 bg-zinc-900"
                      style={{height: timelineHeight}}>
                      {hourLines.map(minute => (
                        <div key={minute} className="pointer-events-none absolute left-0 right-0 border-t border-zinc-800"
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
                                  ? 'border-l-emerald-400 border-emerald-500/50 bg-emerald-500/10'
                                  : event.appointment.status === 'completado'
                                    ? 'border-l-emerald-500 border-emerald-600/40 bg-emerald-500/10'
                                    : 'border-l-amber-500 border-zinc-800 bg-zinc-900 hover:bg-zinc-800')}>
                              <span className="block truncate text-[11px] font-bold tabular-nums text-zinc-200">
                                {event.appointment.timeSlot} {event.appointment.clientName}{event.appointment.isFixed ? event.appointment.status==='completado'?' · Fijo hecho':' · Fijo' : ''}
                              </span>
                              <span className="block truncate text-[10px] text-zinc-400">{event.appointment.serviceName}</span>
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
        </div>
      ) : (
        <div className="space-y-3 p-3 sm:p-4">
          {displayedDates.map(date => {
            const items = agendaDayAppointments(agendaEntries, date)
              .filter(appointment => filteredBarbers.some(barber => barber.id === appointment.barberId));
            return (
              <div key={date} className={'overflow-hidden rounded-2xl border ' +
                (date === today ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-zinc-800 bg-zinc-900')}>
                <button type="button"
                  onClick={() => {setSelectedDate(date);setView('dia');setSelectedAppointmentId(null);}}
                  className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-zinc-900">
                  <span className="text-sm font-extrabold text-zinc-200">
                    {readableDay(date)} {date === today && <span className="ml-1 text-xs font-bold text-emerald-400">hoy</span>}
                  </span>
                  <span className="text-xs font-medium text-zinc-400">
                    {items.length ? String(items.length) + ' turnos' : 'Sin turnos'} →
                  </span>
                </button>
                {items.length > 0 && (
                  <div className="space-y-2 border-t border-zinc-800 p-2 sm:p-3">
                    {items.map(item => bookingCard(item, true))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedAppointment && (
        <AppointmentDetailModal
          key={selectedAppointment.id}
          appointment={selectedAppointment}
          canComplete={canComplete}
          getWhatsAppLink={getWhatsAppLink}
          onComplete={async(appointment,method)=>{
            if(!appointment.isFixed)return method?onComplete(appointment,method):{ok:false,error:'Missing payment method.'};
            if(!appointment.fixedBookingId||!appointment.fixedDate){
              return {ok:false,error:'Faltan datos de este turno fijo.'};
            }
            try{
              const response=await fetch('/api/agenda/fixed/complete',{
                method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
                body:JSON.stringify({
                  fixedBookingId:appointment.fixedBookingId,
                  occurrenceDate:appointment.fixedDate,
                  mode:appointment.fixedSubscription?.eligible?'subscription':'charge',
                  paymentMethod:method,
                }),
              });
              const result=await response.json().catch(()=>({}));
              if(!response.ok||!result.ok)return {ok:false,error:result.error||'No se confirmó el corte fijo.'};
              setFixedReload(value=>value+1);
              return {ok:true};
            }catch{
              return {ok:false,error:'No se pudo comprobar el cobro. Revisá la caja antes de repetirlo.'};
            }
          }}
          onCancel={onCancel}
          onSuccess={(message) => {setActionFeedback(message); onRefresh();}}
          onClose={() => setSelectedAppointmentId(null)}
        />
      )}
    </section>
  );
}
