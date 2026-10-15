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
  isValidUruguayanPhone,
} from '@/lib/booking-store';

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

  // Estado para PIN del barbero validado en el servidor (Protege la agenda y las finanzas)
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);
  const [unlockedBarberId, setUnlockedBarberId] = useState<string | null>(null);
  const [unlockedCommissionRate, setUnlockedCommissionRate] = useState<number>(50);
  const [privateAppointments, setPrivateAppointments] = useState<AppointmentItem[]>([]);

  // Estado para reserva directa (Público)
  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [bookingError, setBookingError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedApt, setConfirmedApt] = useState<AppointmentItem | null>(null);

  // Filtro de fecha para el calendario privado del barbero
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
    setUnlockedBarberId(null); // Bloquea al cambiar de barbero por seguridad
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
    if (clientName.trim().length < 3 || !isValidUruguayanPhone(clientPhone)) {
      setBookingError('Ingresá tu nombre y un celular uruguayo válido (ej: 098 509 376).');
      return;
    }

    try {
      setIsSubmitting(true);
      setBookingError('');

      if (checkSlotBooked(selectedTime)) {
        setBookingError(
          'Ese horario no cuenta con tiempo suficiente o acaba de ocuparse. Elegí otro.'
        );
        setIsSubmitting(false);
        return;
      }

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
        clientPhone: clientPhone.trim(),
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

        {/* TARJETA DEL BARBERO ACTUAL (SELECTOR PÚBLICO / PRIVADO) */}
        {currentBarber && (
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-5 sm:p-6 space-y-6">
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
              <form onSubmit={handleBookDirectWithBarber} className="space-y-5">
                <div className="space-y-2.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    1. Elegí el servicio con {currentBarber.name}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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
                          className={`p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                            isSelected
                              ? 'border-zinc-200 bg-zinc-800/90'
                              : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'
                          }`}
                        >
                          <div>
                            <p className="font-bold text-sm">{srv.name}</p>
                            <span className="text-[11px] text-zinc-400 flex items-center mt-0.5">
                              <Clock className="w-3 h-3 mr-1" /> {srv.durationMinutes} min
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="font-extrabold text-sm">${srv.price}</span>
                            {isSelected && <Check className="w-4 h-4 text-emerald-400" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {selectedService && (
                  <div className="space-y-3 pt-2 border-t border-zinc-800">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                      2. Elegí día y hora ({selectedService.durationMinutes} min)
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
                            className={`py-2 px-1.5 rounded-xl border text-center transition-all flex flex-col items-center cursor-pointer ${
                              isSelected
                                ? 'bg-zinc-100 text-zinc-950 border-transparent font-bold'
                                : 'bg-zinc-950 border-zinc-800 text-zinc-300'
                            }`}
                          >
                            <span className="text-[10px] opacity-80">{d.dayName}</span>
                            <span className="text-base font-bold">{d.dayNumber}</span>
                            <span className="text-[10px] opacity-75">{d.monthName}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 pt-2">
                      {[...morningSlots, ...afternoonSlots].map((time) => {
                        const booked = checkSlotBooked(time);
                        const isSelected = selectedTime === time;
                        return (
                          <button
                            key={time}
                            type="button"
                            disabled={booked}
                            onClick={() => setSelectedTime(time)}
                            className={`py-2.5 px-2 rounded-xl border text-xs font-semibold transition-all flex flex-col items-center justify-center ${
                              booked
                                ? 'bg-zinc-950/30 border-zinc-800/50 text-zinc-600 line-through cursor-not-allowed'
                                : isSelected
                                ? 'bg-zinc-100 text-zinc-950 border-transparent font-bold'
                                : 'bg-zinc-950 border-zinc-800 text-zinc-200 hover:border-zinc-700 cursor-pointer'
                            }`}
                          >
                            <span>{time}</span>
                            {booked && (
                              <span className="text-[9px] no-underline text-rose-400">
                                Ocupado
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {selectedService && selectedTime && (
                  <div className="space-y-3 pt-3 border-t border-zinc-800">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 block">
                      3. Tus datos ({selectedTime} a {getEndTimeString(selectedTime)} hs)
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="relative">
                        <User className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Tu nombre y apellido"
                          value={clientName}
                          onChange={(e) => setClientName(e.target.value)}
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm outline-none"
                        />
                      </div>
                      <div className="relative">
                        <Phone className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="tel"
                          placeholder="Celular (09X XXX XXX)"
                          value={clientPhone}
                          onChange={(e) => setClientPhone(e.target.value)}
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm outline-none"
                        />
                      </div>
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
                      className="w-full py-3.5 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-xs sm:text-sm cursor-pointer transition-all"
                    >
                      {isSubmitting ? 'Confirmando...' : `Confirmar Turno ($${selectedService.price})`}
                    </button>
                  </div>
                )}
              </form>
            )}
          </div>
        )}

        {/* MODO 2: MODO PRIVADO (BLOQUEADO POR PIN EN SERVIDOR) */}
        {activeMode === 'privado' && currentBarber && (
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-5 sm:p-6">
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
                  className="w-full text-center tracking-[0.5em] font-mono text-xl py-3 rounded-xl bg-zinc-950 border border-zinc-800 outline-none"
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

                {/* CALENDARIO ESTILO GOOGLE (GRILLA POR DÍA) */}
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