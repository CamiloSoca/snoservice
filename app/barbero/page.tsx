'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Scissors,
  ArrowLeft,
  Clock,
  CheckCircle2,
  XCircle,
  Lock,
  User,
  Phone,
  Check,
  DollarSign,
  AlertCircle,
  Sparkles,
  UserCheck,
  LogOut,
  Calendar as CalendarIcon,
  ShieldCheck,
} from 'lucide-react';
import {
  BarberItem,
  ServiceItem,
  AppointmentItem,
  ShopConfig,
  DayOption,
  DEFAULT_SHOP_CONFIG,
  DEFAULT_SERVICES,
  DEFAULT_BARBERS,
  getBarbers,
  getServices,
  getPublicBookedSlots,
  getShopConfig,
  createAppointment,
  updateAppointmentStatus,
  unlockBarberPanelWithPin,
  buildRealOpenDays,
  getSlotsForDayOfWeek,
  isSlotAvailable,
  timeToMinutes,
  minutesToTime,
} from '@/lib/booking-store';

const MONTH_MAP: Record<string, number> = {
  ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
  jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11
};

function getUruguayNow() {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Montevideo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  
  const parts = formatter.formatToParts(new Date());
  let year = 2026, month = 9, day = 16, hour = 0, minute = 0;

  for (const p of parts) {
    if (p.type === 'year') year = parseInt(p.value, 10) || 2026;
    if (p.type === 'month') month = parseInt(p.value, 10) - 1;
    if (p.type === 'day') day = parseInt(p.value, 10);
    if (p.type === 'hour') hour = parseInt(p.value, 10) || 0;
    if (p.type === 'minute') minute = parseInt(p.value, 10) || 0;
  }

  if (hour === 24) hour = 0;

  return {
    year,
    month,
    day,
    currentMinutes: hour * 60 + minute,
  };
}

function formatUruguayanPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 9);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`;
}

function isStrictUruguayanMobile(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  if (!/^09[1-9]\d{6}$/.test(digits)) return false;
  const subscriber = digits.slice(3);
  if (/^(\d)\1{5}$/.test(subscriber)) return false;
  if (['123456', '654321', '012345'].includes(subscriber)) return false;
  return true;
}

function BarberPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const perfilParam = searchParams.get('perfil');

  const [shopConfig, setShopConfig] = useState<ShopConfig>(DEFAULT_SHOP_CONFIG);
  const [barbers, setBarbers] = useState<BarberItem[]>(DEFAULT_BARBERS);
  const [services, setServices] = useState<ServiceItem[]>(DEFAULT_SERVICES);
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [days, setDays] = useState<DayOption[]>([]);

  const [selectedBarber, setSelectedBarber] = useState<BarberItem | null>(null);
  const [activeMode, setActiveMode] = useState<'reservar' | 'privado'>('reservar');

  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);
  const [unlockedBarberId, setUnlockedBarberId] = useState<string | null>(null);
  const [unlockedCommissionRate, setUnlockedCommissionRate] = useState<number>(50);
  const [privateAppointments, setPrivateAppointments] = useState<AppointmentItem[]>([]);

  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [bookingError, setBookingError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedApt, setConfirmedApt] = useState<AppointmentItem | null>(null);

  const [calendarDateFilter, setCalendarDateFilter] = useState<string>('');

  const getInitialSlugFromUrl = () => {
    if (perfilParam) return perfilParam.toLowerCase();
    const cleanPath = pathname.replace(/^\//, '').toLowerCase();
    if (cleanPath && cleanPath !== 'barbero' && cleanPath !== 'admin' && cleanPath !== 'login') {
      return cleanPath;
    }
    return null;
  };

  useEffect(() => {
    let isMounted = true;

    const openDays = buildRealOpenDays();
    setDays(openDays);
    if (openDays.length > 0) {
      setSelectedDate(openDays[0].dateString);
      setCalendarDateFilter(openDays[0].dateString);
    }

    async function initData() {
      try {
        const [cfg, brbs, srvs, publicBookedSlots] = await Promise.all([
          getShopConfig(),
          getBarbers(),
          getServices(),
          getPublicBookedSlots(),
        ]);

        if (!isMounted) return;

        const activeBarbers = brbs.filter((b) => b.active);
        const activeServices = srvs.filter((s) => s.active);

        setShopConfig(cfg || DEFAULT_SHOP_CONFIG);
        setBarbers(activeBarbers);
        setServices(activeServices);
        setAppointments(publicBookedSlots);

        if (activeBarbers.length > 0) {
          const initialSlug = getInitialSlugFromUrl();
          const matched = initialSlug
            ? activeBarbers.find(
                (b) => (b.slug || b.name.toLowerCase()) === initialSlug
              )
            : null;
          setSelectedBarber(matched || activeBarbers[0]);
        }
      } catch (err) {
        console.error('Error cargando perfil:', err);
      }
    }

    initData();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectBarber = (b: BarberItem) => {
    setSelectedBarber(b);
    setSelectedService(null);
    setSelectedTime(null);
    setConfirmedApt(null);
    setPinError('');
    setUnlockedBarberId(null);
    setPrivateAppointments([]);

    const slug = b.slug || b.name.toLowerCase();
    router.replace(`/barbero?perfil=${slug}`, { scroll: false });
  };

  const currentBarber = selectedBarber || barbers[0];

  const barberServices = services.filter((srv) => {
    if (!currentBarber?.serviceIds || currentBarber.serviceIds.length === 0) {
      return true;
    }
    return currentBarber.serviceIds.includes(srv.id);
  });

  const activeDayObj =
    days.find((d) => d.dateString === selectedDate) ||
    days[0] || { dateString: 'Hoy', dayName: 'Hoy', dayNumber: '1', monthName: '', dayOfWeek: 2 };

  const { morning: morningSlots, afternoon: afternoonSlots } = getSlotsForDayOfWeek(
    activeDayObj.dayOfWeek,
    30
  );

  const isSlotPastForSelectedDay = (dayObj: DayOption, timeSlot: string): boolean => {
    const uyNow = getUruguayNow();
    const parts = dayObj.dateString.split(' ');
    const dayNumStr = parts.find(p => !isNaN(Number(p))) || parts[1];
    const monthStr = parts.find(p => MONTH_MAP[(p || '').toLowerCase()] !== undefined) || parts[2];

    const targetDay = parseInt(dayNumStr, 10);
    const targetMonth = MONTH_MAP[(monthStr || '').toLowerCase()];

    if (isNaN(targetDay) || targetMonth === undefined) return false;

    const isToday = targetDay === uyNow.day && targetMonth === uyNow.month;
    if (!isToday) return false;

    const slotMinutes = timeToMinutes(timeSlot);
    return slotMinutes <= uyNow.currentMinutes + 10;
  };

  const checkSlotBooked = (timeSlot: string): boolean => {
    if (!currentBarber) return false;
    const duration = selectedService?.durationMinutes || 60;
    const available = isSlotAvailable({
      candidateTime: timeSlot,
      serviceDurationMinutes: duration,
      barberId: currentBarber.id,
      dateString: selectedDate,
      dayOfWeek: activeDayObj.dayOfWeek,
      existingAppointments: appointments,
      allServices: services,
    });
    return !available;
  };

  const getEndTimeString = (startTime: string | null, durationMinutes?: number): string => {
    if (!startTime) return '';
    const dur = durationMinutes || selectedService?.durationMinutes || 60;
    return minutesToTime(timeToMinutes(startTime) + dur);
  };

  const handleBookDirectWithBarber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBarber || !selectedService || !selectedDate || !selectedTime) {
      setBookingError('Seleccioná un servicio, fecha y horario.');
      return;
    }
    if (clientName.trim().length < 3 || !isStrictUruguayanMobile(clientPhone)) {
      setBookingError('Ingresá tu nombre y un celular uruguayo válido de 9 dígitos (09X XXX XXX).');
      return;
    }

    try {
      setIsSubmitting(true);
      setBookingError('');

      if (isSlotPastForSelectedDay(activeDayObj, selectedTime)) {
        setBookingError('Este horario ya pasó. Por favor elegí una hora posterior.');
        setIsSubmitting(false);
        return;
      }

      if (checkSlotBooked(selectedTime)) {
        setBookingError(
          'Ese horario no cuenta con tiempo suficiente o acaba de ocuparse. Elegí otro.'
        );
        setIsSubmitting(false);
        return;
      }

      const formattedPhone = formatUruguayanPhoneInput(clientPhone);

      const created = await createAppointment({
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        servicePrice: selectedService.price,
        priceSnapshot: selectedService.price,
        durationMinutes: selectedService.durationMinutes,
        barberId: currentBarber.id,
        barberName: currentBarber.name,
        dateString: selectedDate,
        timeSlot: selectedTime,
        clientName: clientName.trim(),
        clientPhone: formattedPhone,
        clientNotes: '',
      });

      const updatedApts = await getPublicBookedSlots();
      setAppointments(updatedApts);
      setConfirmedApt(created);
    } catch (err: any) {
      setBookingError(err?.message || 'Error al guardar el turno. Intentá nuevamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnlockPanel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBarber) return;
    try {
      setIsVerifyingPin(true);
      setPinError('');
      const result = await unlockBarberPanelWithPin(currentBarber.id, pinInput.trim());
      setUnlockedBarberId(currentBarber.id);
      setUnlockedCommissionRate(result.commissionRate);
      setPrivateAppointments(result.appointments);
      setPinInput('');
    } catch (err: any) {
      setPinError(err?.message || 'PIN incorrecto para ' + currentBarber.name);
    } finally {
      setIsVerifyingPin(false);
    }
  };

  const handleStatusChange = async (id: string, status: AppointmentItem['status']) => {
    try {
      await updateAppointmentStatus(id, status);
      setPrivateAppointments((prev) =>
        prev.map((apt) => (apt.id === id ? { ...apt, status } : apt))
      );
      const updatedPublicSlots = await getPublicBookedSlots();
      setAppointments(updatedPublicSlots);
    } catch (err: any) {
      alert(err?.message || 'No se pudo actualizar el estado del turno.');
    }
  };

  const isPanelUnlocked = currentBarber && unlockedBarberId === currentBarber.id;

  const myAppointments = privateAppointments.filter(
    (apt) => apt.barberId === currentBarber?.id && apt.status !== 'cancelado'
  );

  const calendarAppointments = myAppointments.filter(
    (apt) => !calendarDateFilter || apt.dateString === calendarDateFilter
  );

  const myCompletedAppointments = myAppointments.filter((apt) => apt.status === 'completado');
  const totalGross = myAppointments.reduce(
    (sum, apt) => sum + Number(apt.priceSnapshot ?? apt.servicePrice),
    0
  );
  const myCommissionTakeHome = Math.round(
    (totalGross * (unlockedCommissionRate || 50)) / 100
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-16">
      <header className="sticky top-0 z-30 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
              <Scissors className="w-4 h-4 text-zinc-100" />
            </div>
            <div>
              <h1 className="font-bold text-sm sm:text-base">{shopConfig.name}</h1>
              <p className="text-[11px] text-zinc-400">Perfil & Agenda de Barberos</p>
            </div>
          </div>

          <Link
            href="/"
            className="px-3 py-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-bold flex items-center space-x-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Volver al Inicio</span>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-6 pt-5">
        {/* SELECTOR DE BARBERO */}
        <div className="flex flex-wrap gap-2">
          {barbers.map((b) => {
            const isSelected = currentBarber?.id === b.id;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => handleSelectBarber(b)}
                className={`px-4 py-2.5 rounded-2xl text-xs font-bold border transition-all flex items-center space-x-2 cursor-pointer ${
                  isSelected
                    ? 'bg-zinc-100 text-zinc-950 border-zinc-100 shadow-sm'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-zinc-800 text-white flex items-center justify-center text-[10px]">
                  {b.name.charAt(0)}
                </span>
                <span>{b.name}</span>
              </button>
            );
          })}
        </div>

        {/* TARJETA DEL BARBERO */}
        {currentBarber && (
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 backdrop-blur-sm">
            <div className="flex items-center space-x-3.5">
              <div className="w-14 h-14 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-center font-extrabold text-xl text-white">
                {currentBarber.name.charAt(0)}
              </div>
              <div>
                <h2 className="text-xl font-extrabold">{currentBarber.name}</h2>
                <p className="text-xs text-zinc-400">
                  {currentBarber.role || 'Barbero'} • {shopConfig.name}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800">
              <button
                type="button"
                onClick={() => setActiveMode('reservar')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeMode === 'reservar'
                    ? 'bg-zinc-100 text-zinc-950'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Agendar Turno</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveMode('privado')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeMode === 'privado'
                    ? 'bg-zinc-100 text-zinc-950'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>Modo Privado (PIN)</span>
              </button>
            </div>
          </div>
        )}

        {/* MODO 1: RESERVAR DIRECTO (PÚBLICO) */}
        {activeMode === 'reservar' && currentBarber && (
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-5 sm:p-7 backdrop-blur-sm space-y-6">
            {confirmedApt ? (
              <div className="py-6 text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400">
                  Código #{confirmedApt.code}
                </span>
                <h3 className="text-xl font-bold">
                  ¡Turno confirmado con {confirmedApt.barberName}!
                </h3>
                <p className="text-xs text-zinc-400">
                  {confirmedApt.serviceName} ({confirmedApt.durationMinutes} min) •{' '}
                  {confirmedApt.dateString} de {confirmedApt.timeSlot} a{' '}
                  {getEndTimeString(confirmedApt.timeSlot, confirmedApt.durationMinutes)} hs
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmedApt(null);
                    setSelectedTime(null);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-zinc-100 text-zinc-950 font-bold text-xs cursor-pointer"
                >
                  Agendar otro turno
                </button>
              </div>
            ) : (
              <form onSubmit={handleBookDirectWithBarber} className="space-y-6">
                {/* 1. SERVICIOS */}
                <div className="space-y-3">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
                      Elegí el servicio
                    </h2>
                    <p className="text-xs mt-1 text-zinc-400">
                      Con {currentBarber.name}
                    </p>
                  </div>

                  <div className="space-y-3">
                    {barberServices.map((srv) => {
                      const isSelected = selectedService?.id === srv.id;
                      return (
                        <button
                          key={srv.id}
                          type="button"
                          onClick={() => {
                            setSelectedService(srv);
                            setSelectedTime(null);
                          }}
                          className={`w-full p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between gap-3 cursor-pointer ${
                            isSelected
                              ? 'border-zinc-200 bg-zinc-800/80 ring-1 ring-zinc-200/30'
                              : 'bg-zinc-950/60 border-zinc-800/90 hover:border-zinc-700'
                          }`}
                        >
                          <div className="flex items-center space-x-3.5 min-w-0">
                            <div className="p-3 rounded-xl bg-zinc-900 text-white shrink-0">
                              <Scissors className="w-4 h-4" />
                            </div>
                            <div className="truncate">
                              <h3 className="font-bold text-sm sm:text-base truncate">{srv.name}</h3>
                              <span className="inline-flex items-center text-xs mt-0.5 text-zinc-400">
                                <Clock className="w-3 h-3 mr-1" /> Duración: {srv.durationMinutes} min
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center space-x-3 shrink-0">
                            <span className="font-extrabold text-sm sm:text-base">${srv.price}</span>
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                              isSelected ? 'bg-zinc-100 border-zinc-100 text-zinc-950' : 'border-zinc-700 bg-zinc-900 text-transparent'
                            }`}>
                              <Check className="w-3 h-3 stroke-[3]" />
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. FECHA Y HORA */}
                {selectedService && (
                  <div className="space-y-5 pt-4 border-t border-zinc-800">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
                          Fecha y hora
                        </h2>
                        <p className="text-xs mt-0.5 text-zinc-400">
                          Reserva de {selectedService.durationMinutes} min continuos
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-wider opacity-60 block mb-2">
                        Día de atención
                      </label>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                        {days.map((d) => {
                          const isSelected = selectedDate === d.dateString;
                          return (
                            <button
                              key={d.dateString}
                              type="button"
                              onClick={() => {
                                setSelectedDate(d.dateString);
                                setSelectedTime(null);
                              }}
                              className={`py-2.5 px-1.5 rounded-2xl border text-center transition-all flex flex-col items-center cursor-pointer ${
                                isSelected
                                  ? 'bg-zinc-100 hover:bg-white text-zinc-950 font-bold border-transparent shadow-md'
                                  : 'bg-zinc-950/60 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                              }`}
                            >
                              <span className="text-[10px] opacity-75 uppercase tracking-wider">{d.dayName}</span>
                              <span className="text-lg font-extrabold my-0.5">{d.dayNumber}</span>
                              <span className="text-[10px] opacity-75">{d.monthName}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* HORARIOS */}
                    <div className="space-y-3 pt-2 border-t border-zinc-800/40">
                      <label className="text-[11px] font-semibold uppercase tracking-wider opacity-60 block">
                        Horarios disponibles ({selectedDate})
                      </label>

                      <div className="space-y-3">
                        {morningSlots.length > 0 && (
                          <div>
                            <span className="text-[11px] font-medium text-emerald-400 block mb-1.5">☀️ Turno Mañana</span>
                            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                              {morningSlots.map((time) => {
                                const isPast = isSlotPastForSelectedDay(activeDayObj, time);
                                const booked = checkSlotBooked(time);
                                const unavailable = isPast || booked;
                                const isSelected = selectedTime === time && !unavailable;

                                return (
                                  <button
                                    key={time}
                                    type="button"
                                    disabled={unavailable}
                                    onClick={() => setSelectedTime(time)}
                                    className={`py-2 px-1 rounded-xl border text-xs font-semibold transition-all flex flex-col items-center justify-center ${
                                      unavailable
                                        ? 'bg-zinc-950/20 border-zinc-800/40 text-zinc-600 line-through cursor-not-allowed opacity-50'
                                        : isSelected
                                        ? 'bg-zinc-100 text-zinc-950 font-bold border-transparent scale-[1.02]'
                                        : 'bg-zinc-950/70 border-zinc-800 text-zinc-200 hover:border-zinc-700 cursor-pointer'
                                    }`}
                                  >
                                    <span>{time}</span>
                                    {unavailable && (
                                      <span className="text-[8px] no-underline text-rose-400 scale-90">
                                        {isPast ? 'Pasó' : 'Ocupado'}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {afternoonSlots.length > 0 && (
                          <div className="pt-1">
                            <span className="text-[11px] font-medium text-indigo-400 block mb-1.5">🌙 Turno Tarde / Noche</span>
                            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                              {afternoonSlots.map((time) => {
                                const isPast = isSlotPastForSelectedDay(activeDayObj, time);
                                const booked = checkSlotBooked(time);
                                const unavailable = isPast || booked;
                                const isSelected = selectedTime === time && !unavailable;

                                return (
                                  <button
                                    key={time}
                                    type="button"
                                    disabled={unavailable}
                                    onClick={() => setSelectedTime(time)}
                                    className={`py-2 px-1 rounded-xl border text-xs font-semibold transition-all flex flex-col items-center justify-center ${
                                      unavailable
                                        ? 'bg-zinc-950/20 border-zinc-800/40 text-zinc-600 line-through cursor-not-allowed opacity-50'
                                        : isSelected
                                        ? 'bg-zinc-100 text-zinc-950 font-bold border-transparent scale-[1.02]'
                                        : 'bg-zinc-950/70 border-zinc-800 text-zinc-200 hover:border-zinc-700 cursor-pointer'
                                    }`}
                                  >
                                    <span>{time}</span>
                                    {unavailable && (
                                      <span className="text-[8px] no-underline text-rose-400 scale-90">
                                        {isPast ? 'Pasó' : 'Ocupado'}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. DATOS */}
                {selectedService && selectedTime && (
                  <div className="space-y-4 pt-4 border-t border-zinc-800">
                    <div>
                      <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
                        Tus datos
                      </h2>
                      <p className="text-xs mt-1 text-zinc-400">
                        Para enviarte el comprobante de tu turno con {currentBarber.name}
                      </p>
                    </div>

                    <div className="space-y-3.5">
                      <div>
                        <label className="block text-xs font-semibold mb-1.5 opacity-80">
                          Nombre y apellido *
                        </label>
                        <div className="relative">
                          <User className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            maxLength={50}
                            placeholder="Tu nombre"
                            value={clientName}
                            onChange={(e) => setClientName(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-base outline-none text-zinc-100"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold mb-1.5 opacity-80">
                          Celular uruguayo (09X XXX XXX) *
                        </label>
                        <div className="relative">
                          <Phone className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="tel"
                            inputMode="numeric"
                            maxLength={11}
                            placeholder="098 509 376"
                            value={clientPhone}
                            onChange={(e) => setClientPhone(formatUruguayanPhoneInput(e.target.value))}
                            className="w-full pl-10 pr-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-base outline-none font-mono text-zinc-100"
                          />
                        </div>
                        <p className="text-[11px] opacity-60 mt-1">
                          Número celular de Uruguay (9 dígitos exactos).
                        </p>
                      </div>

                      {bookingError && (
                        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>{bookingError}</span>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full py-3.5 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-extrabold text-xs sm:text-sm cursor-pointer transition-all"
                      >
                        {isSubmitting ? 'Confirmando...' : `Confirmar Turno ($${selectedService.price})`}
                      </button>
                    </div>
                  </div>
                )}
              </form>
            )}
          </div>
        )}

        {/* MODO 2: MODO PRIVADO */}
        {activeMode === 'privado' && currentBarber && (
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-5 sm:p-6 backdrop-blur-sm">
            {!isPanelUnlocked ? (
              <form onSubmit={handleUnlockPanel} className="max-w-xs mx-auto py-8 space-y-4 text-center">
                <div className="w-12 h-12 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-center mx-auto text-amber-400">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-base">Área Privada de {currentBarber.name}</h3>
                  <p className="text-xs text-zinc-400">
                    Ingresá tu PIN de 4 dígitos para acceder al calendario y tus finanzas
                  </p>
                </div>

                <input
                  type="password"
                  maxLength={4}
                  placeholder="••••"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  className="w-full text-center tracking-[0.5em] font-mono text-xl py-3 rounded-xl bg-zinc-950 border border-zinc-800 outline-none text-zinc-100"
                />

                {pinError && <p className="text-xs text-rose-400">{pinError}</p>}

                <button
                  type="submit"
                  disabled={isVerifyingPin}
                  className="w-full py-3 rounded-xl bg-zinc-100 text-zinc-950 font-bold text-xs cursor-pointer disabled:opacity-50"
                >
                  {isVerifyingPin ? 'Verificando...' : 'Desbloquear Acceso'}
                </button>
              </form>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-emerald-400" />
                    <span className="font-bold text-sm">
                      Panel Privado de {currentBarber.name} ({unlockedCommissionRate}% comisión)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setUnlockedBarberId(null);
                      setPrivateAppointments([]);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-400 hover:text-rose-400 flex items-center gap-1 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Bloquear de nuevo</span>
                  </button>
                </div>

                {/* RESUMEN FINANCIERO */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4">
                    <span className="text-xs text-zinc-400">Turnos Totales</span>
                    <p className="text-2xl font-extrabold mt-1">{myAppointments.length}</p>
                    <span className="text-[11px] text-zinc-500">
                      {myCompletedAppointments.length} completados
                    </span>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4">
                    <span className="text-xs text-zinc-400">Total Generado</span>
                    <p className="text-2xl font-extrabold mt-1">${totalGross}</p>
                  </div>
                  <div className="bg-emerald-950/30 border border-emerald-500/40 rounded-2xl p-4">
                    <span className="text-xs text-emerald-300 font-bold flex items-center gap-1">
                      <DollarSign className="w-3.5 h-3.5" /> Mi Comisión ({unlockedCommissionRate}%)
                    </span>
                    <p className="text-2xl font-extrabold text-emerald-400 mt-1">
                      ${myCommissionTakeHome}
                    </p>
                  </div>
                </div>

                {/* CALENDARIO */}
                <div className="space-y-4 pt-2 border-t border-zinc-800">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <h4 className="font-bold text-sm flex items-center gap-2">
                      <CalendarIcon className="w-4 h-4 text-emerald-400" />
                      Calendario de Turnos
                    </h4>

                    <select
                      value={calendarDateFilter}
                      onChange={(e) => setCalendarDateFilter(e.target.value)}
                      className="px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 outline-none font-semibold cursor-pointer"
                    >
                      {days.map((d) => (
                        <option key={d.dateString} value={d.dateString}>
                          {d.dateString}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2.5">
                    {calendarAppointments.length === 0 ? (
                      <div className="p-10 text-center bg-zinc-950 border border-zinc-800 rounded-2xl space-y-1">
                        <CalendarIcon className="w-7 h-7 text-zinc-600 mx-auto" />
                        <p className="text-xs text-zinc-400">
                          No tenés turnos agendados para el día {calendarDateFilter}.
                        </p>
                      </div>
                    ) : (
                      calendarAppointments.map((apt) => {
                        const endTime = getEndTimeString(apt.timeSlot, apt.durationMinutes);
                        return (
                          <div
                            key={apt.id}
                            className="bg-zinc-950 border border-zinc-800/90 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-zinc-700 transition-colors"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-extrabold text-emerald-400">
                                  {apt.timeSlot} — {endTime} hs ({apt.durationMinutes || 60}m)
                                </span>
                                <span
                                  className={`text-[11px] font-bold px-2 py-0.5 rounded capitalize ${
                                    apt.status === 'completado'
                                      ? 'bg-emerald-500/15 text-emerald-400'
                                      : 'bg-amber-500/15 text-amber-400'
                                  }`}
                                >
                                  {apt.status}
                                </span>
                              </div>
                              <h5 className="font-bold text-sm sm:text-base pt-0.5">
                                {apt.clientName}{' '}
                                <span className="font-normal text-xs text-zinc-400">
                                  ({apt.clientPhone})
                                </span>
                              </h5>
                              <p className="text-xs text-zinc-400">
                                Servicio: <strong className="text-zinc-200">{apt.serviceName}</strong> (${apt.priceSnapshot ?? apt.servicePrice})
                              </p>
                            </div>

                            <div className="flex items-center gap-2">
                              {apt.status !== 'completado' && (
                                <button
                                  type="button"
                                  onClick={() => handleStatusChange(apt.id, 'completado')}
                                  className="px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-1 cursor-pointer"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Completar</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleStatusChange(apt.id, 'cancelado')}
                                className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-rose-400 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>Cancelar</span>
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function BarberPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 text-zinc-400 flex items-center justify-center text-sm">
          Cargando agenda...
        </div>
      }
    >
      <BarberPageContent />
    </Suspense>
  );
}