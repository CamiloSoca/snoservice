'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Scissors,
  Clock,
  Check,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  RotateCcw,
  Phone,
  MessageSquare,
  AlertCircle,
  XCircle,
  Hash,
  UserCheck,
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import {
  ServiceItem,
  BarberItem,
  AppointmentItem,
  ShopConfig,
  DayOption,
  DEFAULT_SERVICES,
  DEFAULT_BARBERS,
  DEFAULT_SHOP_CONFIG,
  getServices,
  getBarbers,
  getPublicBookedSlots,
  getShopConfig,
  createAppointment,
  buildRealOpenDays,
  isSlotAvailable,
  timeToMinutes,
  minutesToTime,
} from '@/lib/booking-store';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const MONTH_MAP: Record<string, number> = {
  ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
  jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11,
};

const BOOKING_COOLDOWN_MS = 5 * 60 * 1000;
const BOOKING_STORAGE_KEY = '13cut_last_booking_ts';
const CACHE_KEY = '13cut_fast_cache_v1';

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

  return { year, month, day, currentMinutes: hour * 60 + minute };
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

function getDynamicSlotsForDay(dayConfig: { isOpen: boolean; openTime: string; closeTime: string }, stepMinutes: number = 30) {
  if (!dayConfig || !dayConfig.isOpen) return { morning: [], afternoon: [] };

  const openMins = timeToMinutes(dayConfig.openTime);
  const closeMins = timeToMinutes(dayConfig.closeTime);
  const morning: string[] = [];
  const afternoon: string[] = [];

  let current = openMins;
  while (current < closeMins) {
    const timeStr = minutesToTime(current);
    if (current < 780) {
      morning.push(timeStr);
    } else {
      afternoon.push(timeStr);
    }
    current += stepMinutes;
  }

  return { morning, afternoon };
}

function AgendarContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const barberoParam = searchParams.get('barbero');

  const [activeTab, setActiveTab] = useState<'reservar' | 'cancelar'>('reservar');
  const [step, setStep] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState<boolean>(true);
  const [preselectedFromUrl, setPreselectedFromUrl] = useState<boolean>(false);

  const [shopConfig, setShopConfig] = useState<ShopConfig>(DEFAULT_SHOP_CONFIG);
  const [services, setServices] = useState<ServiceItem[]>(DEFAULT_SERVICES);
  const [barbers, setBarbers] = useState<BarberItem[]>(DEFAULT_BARBERS);
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [days, setDays] = useState<DayOption[]>([]);

  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null);
  const [selectedBarber, setSelectedBarber] = useState<BarberItem | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const [clientName, setClientName] = useState<string>('');
  const [clientPhone, setClientPhone] = useState<string>('');
  const [formError, setFormError] = useState<string>('');
  const [confirmedAppointment, setConfirmedAppointment] = useState<AppointmentItem | null>(null);

  const [cancelCode, setCancelCode] = useState<string>('');
  const [cancelPhone, setCancelPhone] = useState<string>('');
  const [cancelError, setCancelError] = useState<string>('');
  const [cancelSuccess, setCancelSuccess] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);

  const bookingSectionRef = useRef<HTMLDivElement>(null);

  // 1. Carga ultra rápida con Caché en Memoria + Sincronización con Supabase
  useEffect(() => {
    const realDays = buildRealOpenDays(30);
    setDays(realDays);
    if (realDays.length > 0) setSelectedDate(realDays[0].dateString);

    // Intentamos hidratar al instante desde sessionStorage para velocidad 0ms
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.config) setShopConfig(parsed.config);
        if (Array.isArray(parsed.services) && parsed.services.length > 0) setServices(parsed.services);
        if (Array.isArray(parsed.barbers) && parsed.barbers.length > 0) setBarbers(parsed.barbers);
        setIsLoadingInitial(false);
      }
    } catch {
      // Ignorar errores de caché
    }

    async function loadData() {
      try {
        const [config, srvs, brbs, publicSlots] = await Promise.all([
          getShopConfig(),
          getServices(),
          getBarbers(),
          getPublicBookedSlots(),
        ]);
sessionStorage.setItem('13cut_fast_cache_v1', JSON.stringify({ config, barbers: brbs }))
        const activeServices = (Array.isArray(srvs) && srvs.length > 0 ? srvs : DEFAULT_SERVICES).filter(
          (s) => s.active !== false
        );
        const activeBarbers = (Array.isArray(brbs) && brbs.length > 0 ? brbs : DEFAULT_BARBERS).filter(
          (b) => b.active !== false
        );

        setShopConfig(config || DEFAULT_SHOP_CONFIG);
        setServices(activeServices);
        setBarbers(activeBarbers);
        setAppointments(Array.isArray(publicSlots) ? publicSlots : []);

        // Guardamos en caché para que la navegación entre páginas sea instantánea
        try {
          sessionStorage.setItem(
            CACHE_KEY,
            JSON.stringify({
              config: config || DEFAULT_SHOP_CONFIG,
              services: activeServices,
              barbers: activeBarbers,
              ts: Date.now(),
            })
          );
        } catch {}

        // Si el usuario tocó un servicio rápido antes de que terminara de cargar Supabase,
        // sincronizamos su ID con el servicio real de la base de datos para que coincida con los barberos
        setSelectedService((prev) => {
          if (!prev) return null;
          return (
            activeServices.find(
              (s) => s.id === prev.id || s.name.trim().toLowerCase() === prev.name.trim().toLowerCase()
            ) || prev
          );
        });
      } catch (err) {
        console.error('Error cargando agenda:', err);
      } finally {
        setIsLoadingInitial(false);
      }
    }

    loadData();
  }, []);

  // 2. Efecto separado y limpio para detectar el parámetro ?barbero= de la URL
  useEffect(() => {
    if (barberoParam && barbers.length > 0) {
      const cleanParam = barberoParam.trim().toLowerCase();
      const foundBarber = barbers.find(
        (b) =>
          (b.slug || '').toLowerCase() === cleanParam ||
          b.name.trim().toLowerCase() === cleanParam
      );
      if (foundBarber) {
        setSelectedBarber(foundBarber);
        setPreselectedFromUrl(true);
      }
    }
  }, [barberoParam, barbers]);

  const activeDayObj = days.find((d) => d.dateString === selectedDate) || days[0];

  const dayKeyMap = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const currentDayKey = activeDayObj ? dayKeyMap[activeDayObj.dayOfWeek] : 'lunes';
  const rawSchedule = (shopConfig as any).schedule || {};
  const currentDayRule = rawSchedule[currentDayKey] || { isOpen: true, openTime: '09:00', closeTime: '19:00' };

  const { morning: morningSlots, afternoon: afternoonSlots } = getDynamicSlotsForDay(currentDayRule, 30);

  const scrollToTop = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      bookingSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const isSlotPastForSelectedDay = (dayObj: DayOption, timeSlot: string): boolean => {
    if (!dayObj) return false;
    const uyNow = getUruguayNow();
    const parts = dayObj.dateString.split(' ');
    const dayNumStr = parts.find((p) => !isNaN(Number(p))) || parts[1];
    const monthStr = parts.find((p) => MONTH_MAP[(p || '').toLowerCase()] !== undefined) || parts[2];

    const targetDay = parseInt(dayNumStr, 10);
    const targetMonth = MONTH_MAP[(monthStr || '').toLowerCase()];

    if (isNaN(targetDay) || targetMonth === undefined) return false;
    if (targetDay !== uyNow.day || targetMonth !== uyNow.month) return false;

    const slotMinutes = timeToMinutes(timeSlot);
    return slotMinutes <= uyNow.currentMinutes + 10;
  };

  const checkSlotBooked = (barberId: string, dateStr: string, timeSlot: string): boolean => {
    const duration = selectedService?.durationMinutes || 60;
    return !isSlotAvailable({
      candidateTime: timeSlot,
      serviceDurationMinutes: duration,
      barberId,
      dateString: dateStr,
      dayOfWeek: activeDayObj?.dayOfWeek || 2,
      existingAppointments: appointments,
      allServices: services,
    });
  };

  const getEndTimeString = (startTime: string | null, durationMinutes?: number): string => {
    if (!startTime) return '';
    const dur = durationMinutes || selectedService?.durationMinutes || 60;
    return minutesToTime(timeToMinutes(startTime) + dur);
  };

  // FIX DEFINITIVO DE FILTRADO DE SERVICIOS Y BARBEROS (Con Fallback Inteligente)
  const displayedServices = (() => {
    if (preselectedFromUrl && selectedBarber) {
      const filtered = services.filter(
        (s) =>
          !selectedBarber.serviceIds ||
          selectedBarber.serviceIds.length === 0 ||
          selectedBarber.serviceIds.includes(s.id)
      );
      return filtered.length > 0 ? filtered : services;
    }
    return services;
  })();

  const availableBarbersForService = (() => {
    if (!selectedService) return barbers;
    const matched = barbers.filter((b) => {
      if (!b.serviceIds || !Array.isArray(b.serviceIds) || b.serviceIds.length === 0) return true;
      return b.serviceIds.includes(selectedService.id);
    });
    // Si por desincronización de IDs o servicio nuevo la lista queda vacía, mostramos todos los barberos activos
    return matched.length > 0 ? matched : barbers;
  })();

  const canProceed = () => {
    if (step === 1) return selectedService !== null;
    if (step === 2) return selectedBarber !== null;
    if (step === 3) {
      if (!selectedDate || !selectedTime || !currentDayRule.isOpen) return false;
      return !isSlotPastForSelectedDay(activeDayObj, selectedTime);
    }
    if (step === 4) {
      return !isSubmitting && clientName.trim().length >= 3 && isStrictUruguayanMobile(clientPhone);
    }
    return false;
  };

  // Selección rápida pensada para móvil: avanza automáticamente al tocar una opción
  const handleSelectService = (service: ServiceItem) => {
    setSelectedService(service);
    setSelectedTime(null);
    setFormError('');
    setTimeout(() => {
      if (preselectedFromUrl && selectedBarber) {
        setStep(3);
      } else {
        setStep(2);
      }
      scrollToTop();
    }, 120);
  };

  const handleSelectBarber = (barber: BarberItem) => {
    setSelectedBarber(barber);
    setSelectedTime(null);
    setFormError('');
    setTimeout(() => {
      setStep(3);
      scrollToTop();
    }, 120);
  };

  const handleNext = async () => {
    if (!canProceed()) {
      if (step === 3 && !currentDayRule.isOpen) {
        setFormError('El local se encuentra cerrado este día.');
      } else if (step === 4 && !isSubmitting) {
        setFormError('Ingresá tu nombre y un celular uruguayo válido de 9 dígitos (09X XXX XXX).');
      }
      return;
    }

    setFormError('');

    if (step === 1 && preselectedFromUrl && selectedBarber) {
      setStep(3);
      scrollToTop();
      return;
    }

    if (step < 4) {
      setStep(step + 1);
      scrollToTop();
    } else if (selectedService && selectedBarber && selectedTime) {
      try {
        setIsSubmitting(true);

        const lastBookingTs = Number(localStorage.getItem(BOOKING_STORAGE_KEY) || '0');
        if (lastBookingTs && Date.now() - lastBookingTs < BOOKING_COOLDOWN_MS) {
          const waitMins = Math.ceil((BOOKING_COOLDOWN_MS - (Date.now() - lastBookingTs)) / 60000);
          setFormError(`Por seguridad, esperá ${waitMins} min antes de crear otro turno.`);
          setIsSubmitting(false);
          return;
        }

        if (isSlotPastForSelectedDay(activeDayObj, selectedTime)) {
          setFormError('Este horario ya pasó. Elegí una hora posterior.');
          setIsSubmitting(false);
          return;
        }

        const freshSlots = await getPublicBookedSlots();
        setAppointments(freshSlots);

        const cleanInputPhone = clientPhone.replace(/\D/g, '');
        const alreadyHasTurnToday = freshSlots.some(
          (apt: any) =>
            apt.dateString === selectedDate &&
            apt.status !== 'cancelled' &&
            apt.status !== 'cancelado' &&
            typeof apt.clientPhone === 'string' &&
            apt.clientPhone.replace(/\D/g, '') === cleanInputPhone
        );

        if (alreadyHasTurnToday) {
          setFormError(`Ya tenés un turno registrado para el ${selectedDate} con este número.`);
          setIsSubmitting(false);
          return;
        }

        if (checkSlotBooked(selectedBarber.id, selectedDate, selectedTime)) {
          setFormError('Este horario acaba de ser ocupado. Elegí otro.');
          setIsSubmitting(false);
          return;
        }

        const formattedPhone = formatUruguayanPhoneInput(cleanInputPhone);

        const created = await createAppointment({
          serviceId: selectedService.id,
          serviceName: selectedService.name,
          servicePrice: selectedService.price,
          priceSnapshot: selectedService.price,
          durationMinutes: selectedService.durationMinutes,
          barberId: selectedBarber.id,
          barberName: selectedBarber.name,
          dateString: selectedDate,
          timeSlot: selectedTime,
          clientName: clientName.trim(),
          clientPhone: formattedPhone,
          clientNotes: '',
        });

        localStorage.setItem(BOOKING_STORAGE_KEY, String(Date.now()));
        const updatedSlots = await getPublicBookedSlots();
        setAppointments(updatedSlots);
        setConfirmedAppointment(created);
        scrollToTop();
      } catch (err: any) {
        setFormError(err?.message || 'Error al confirmar el turno.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleBack = () => {
    setFormError('');
    if (step === 3 && preselectedFromUrl && selectedBarber) {
      setStep(1);
      scrollToTop();
      return;
    }
    if (step > 1) {
      setStep(step - 1);
      scrollToTop();
    }
  };

  const handleReset = () => {
    setConfirmedAppointment(null);
    setStep(1);
    setSelectedService(null);
    if (!preselectedFromUrl) setSelectedBarber(null);
    if (days.length > 0) setSelectedDate(days[0].dateString);
    setSelectedTime(null);
    setClientName('');
    setClientPhone('');
    setFormError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelAppointmentByClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setCancelError('');
    setCancelSuccess(false);

    const cleanCode = cancelCode.replace(/#/g, '').trim().toUpperCase();
    if (cleanCode.length < 3 || !isStrictUruguayanMobile(cancelPhone)) {
      setCancelError('Ingresá el código de tu turno y tu celular de 9 dígitos.');
      return;
    }

    try {
      setIsCancelling(true);
      if (!supabase) throw new Error('Sin conexión con la base de datos.');

      const { error } = await supabase.rpc('cancel_appointment_by_client', {
        p_code: cleanCode,
        p_phone: cancelPhone,
      });

      if (error) throw new Error(error.message);

      const updatedSlots = await getPublicBookedSlots();
      setAppointments(updatedSlots);
      setCancelSuccess(true);
      setCancelCode('');
      setCancelPhone('');
    } catch (err: any) {
      setCancelError(err?.message || 'No se encontró un turno activo con esos datos.');
    } finally {
      setIsCancelling(false);
    }
  };

  const getWhatsAppReceiptUrl = () => {
    if (!confirmedAppointment) return '#';
    const rawShopDigits = shopConfig.phone.replace(/\D/g, '');
    const formattedShopPhone = rawShopDigits.startsWith('0')
      ? '598' + rawShopDigits.slice(1)
      : rawShopDigits.startsWith('598')
      ? rawShopDigits
      : '598' + rawShopDigits;

    const endTime = getEndTimeString(
      confirmedAppointment.timeSlot,
      confirmedAppointment.durationMinutes
    );

    const text =
      `Hola ${shopConfig.name}, agendé mi turno online:%0A%0A` +
      `• Código: ${confirmedAppointment.code}%0A` +
      `• Servicio: ${confirmedAppointment.serviceName} (${confirmedAppointment.durationMinutes} min - $${confirmedAppointment.servicePrice})%0A` +
      `• Barbero: ${confirmedAppointment.barberName}%0A` +
      `• Fecha y hora: ${confirmedAppointment.dateString} de ${confirmedAppointment.timeSlot} a ${endTime} hs%0A` +
      `• Cliente: ${confirmedAppointment.clientName} (${confirmedAppointment.clientPhone})`;
    return `https://wa.me/${formattedShopPhone}?text=${text}`;
  };

  const logoImage = shopConfig.logoUrl || DEFAULT_SHOP_CONFIG.logoUrl;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-28 lg:pb-12">
      <header className="sticky top-0 z-30 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2.5">
            {logoImage ? (
              <div className="w-9 h-9 rounded-xl overflow-hidden border border-zinc-700/60 bg-zinc-900 shrink-0">
                <img src={logoImage} alt={shopConfig.name} className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                <Scissors className="w-4 h-4 text-zinc-100" />
              </div>
            )}
            <div>
              <h1 className="font-bold text-sm sm:text-base leading-tight">{shopConfig.name}</h1>
              <p className="text-[11px] text-zinc-400">Reserva rápida online</p>
            </div>
          </div>

          <Link
            href="/"
            className="px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 active:scale-95 transition-transform text-zinc-200 text-xs font-semibold flex items-center space-x-1.5 touch-manipulation"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Inicio</span>
          </Link>
        </div>
      </header>

      <main ref={bookingSectionRef} className="max-w-5xl mx-auto px-4 py-4 sm:py-6 space-y-4 sm:space-y-5">
        <div className="max-w-md mx-auto grid grid-cols-2 gap-1.5 bg-zinc-900 p-1.5 rounded-2xl border border-zinc-800">
          <button
            type="button"
            onClick={() => {
              setActiveTab('reservar');
              setCancelError('');
              setCancelSuccess(false);
            }}
            className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 touch-manipulation ${
              activeTab === 'reservar'
                ? 'bg-zinc-100 text-zinc-950 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Reservar Turno</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('cancelar')}
            className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 touch-manipulation ${
              activeTab === 'cancelar'
                ? 'bg-rose-500 text-white shadow-sm'
                : 'text-zinc-400 hover:text-rose-400'
            }`}
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>Cancelar Turno</span>
          </button>
        </div>

        {activeTab === 'cancelar' ? (
          <div className="max-w-lg mx-auto border rounded-3xl p-5 sm:p-8 bg-zinc-900/90 border-zinc-800 space-y-5">
            <div className="space-y-1">
              <h2 className="text-xl font-extrabold tracking-tight">Cancelar un turno</h2>
              <p className="text-xs text-zinc-400">
                Ingresá el código de tu turno y tu celular para liberar el horario al instante.
              </p>
            </div>

            {cancelSuccess ? (
              <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-3">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <h3 className="font-bold text-base text-emerald-300">
                  Tu turno fue cancelado correctamente
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setCancelSuccess(false);
                    setActiveTab('reservar');
                  }}
                  className="px-5 py-3 rounded-xl bg-zinc-100 text-zinc-950 font-bold text-xs cursor-pointer touch-manipulation"
                >
                  Agendar nuevo turno
                </button>
              </div>
            ) : (
              <form onSubmit={handleCancelAppointmentByClient} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5 text-zinc-300">
                    Código del turno *
                  </label>
                  <div className="relative">
                    <Hash className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      maxLength={10}
                      placeholder="Ej: A4F2"
                      value={cancelCode}
                      onChange={(e) => setCancelCode(e.target.value.toUpperCase())}
                      className="w-full pl-10 pr-4 py-3.5 rounded-xl border text-base outline-none font-mono uppercase bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-zinc-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1.5 text-zinc-300">
                    Celular (09X XXX XXX) *
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      inputMode="numeric"
                      maxLength={11}
                      placeholder="098 509 376"
                      value={cancelPhone}
                      onChange={(e) => setCancelPhone(formatUruguayanPhoneInput(e.target.value))}
                      className="w-full pl-10 pr-4 py-3.5 rounded-xl border text-base outline-none font-mono bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-zinc-500"
                    />
                  </div>
                </div>

                {cancelError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{cancelError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isCancelling}
                  className="w-full py-4 rounded-xl bg-rose-500 hover:bg-rose-600 active:scale-[0.99] text-white font-bold text-sm cursor-pointer disabled:opacity-50 touch-manipulation"
                >
                  {isCancelling ? 'Cancelando...' : 'Confirmar Cancelación'}
                </button>
              </form>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 border rounded-3xl p-4 sm:p-7 bg-zinc-900/90 border-zinc-800 backdrop-blur-sm">
              {/* Indicador visual de pasos para orientar al cliente en móvil */}
              {!confirmedAppointment && (
                <div className="mb-5">
                  <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
                    <span>Paso {step} de 4</span>
                    <span className="text-emerald-400">
                      {step === 1 && '1. Servicio'}
                      {step === 2 && '2. Barbero'}
                      {step === 3 && '3. Día y Hora'}
                      {step === 4 && '4. Confirmación'}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800/80">
                    <div
                      className="h-full bg-emerald-400 transition-all duration-300 rounded-full"
                      style={{ width: `${(step / 4) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {preselectedFromUrl && selectedBarber && !confirmedAppointment && (
                <div className="mb-4 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-2">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-300 font-bold text-xs flex items-center justify-center shrink-0">
                      <UserCheck className="w-4 h-4" />
                    </div>
                    <p className="text-xs font-bold text-emerald-300">
                      Atiende: {selectedBarber.name}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPreselectedFromUrl(false);
                      setSelectedBarber(null);
                      setStep(1);
                      router.replace('/agendar', { scroll: false });
                    }}
                    className="text-xs font-semibold text-zinc-300 hover:text-white underline cursor-pointer shrink-0 px-2 py-1 touch-manipulation"
                  >
                    Cambiar barbero
                  </button>
                </div>
              )}

              {confirmedAppointment ? (
                <div className="py-4 space-y-5">
                  <div className="text-center space-y-2">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
                      <CheckCircle2 className="w-7 h-7" />
                    </div>
                    <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400">
                      Código #{confirmedAppointment.code}
                    </span>
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight">¡Turno Confirmado!</h2>
                  </div>

                  <div className="border rounded-2xl p-4 space-y-2.5 text-xs sm:text-sm bg-zinc-950/70 border-zinc-800">
                    <div className="flex justify-between">
                      <span className="opacity-60">Cliente</span>
                      <span className="font-semibold">{confirmedAppointment.clientName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="opacity-60">Servicio</span>
                      <span className="font-semibold">
                        {confirmedAppointment.serviceName} (${confirmedAppointment.servicePrice})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="opacity-60">Barbero</span>
                      <span className="font-semibold">{confirmedAppointment.barberName}</span>
                    </div>
                    <div className="flex justify-between pt-2.5 border-t border-zinc-800">
                      <span className="opacity-60">Fecha y hora</span>
                      <span className="font-bold text-emerald-400">
                        {confirmedAppointment.dateString} • {confirmedAppointment.timeSlot} hs
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                    <a
                      href={getWhatsAppReceiptUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-4 px-4 rounded-xl text-sm flex items-center justify-center space-x-2 bg-zinc-100 hover:bg-white text-zinc-950 font-extrabold active:scale-[0.99] touch-manipulation"
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>Enviar comprobante por WhatsApp</span>
                    </a>

                    <button
                      type="button"
                      onClick={handleReset}
                      className="py-3.5 px-4 rounded-xl border border-zinc-800 text-zinc-300 hover:bg-zinc-800 font-semibold text-xs flex items-center justify-center space-x-1.5 cursor-pointer touch-manipulation"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Nuevo turno</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  {/* PASO 1: ELEGIR SERVICIO */}
                  {step === 1 && (
                    <div className="space-y-4">
                      <div>
                        <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
                          Elegí el servicio
                        </h2>
                        <p className="text-xs mt-0.5 text-zinc-400">
                          Tocá un servicio para continuar automáticamente
                        </p>
                      </div>

                      {isLoadingInitial && displayedServices.length === 0 ? (
                        <div className="space-y-2.5">
                          {[1, 2, 3].map((n) => (
                            <div key={n} className="h-16 rounded-2xl bg-zinc-950/60 border border-zinc-800/60 animate-pulse" />
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {displayedServices.map((service) => {
                            const isSelected = selectedService?.id === service.id;
                            return (
                              <button
                                key={service.id}
                                type="button"
                                onClick={() => handleSelectService(service)}
                                className={`w-full p-4 rounded-2xl border text-left transition-all flex items-center justify-between gap-3 cursor-pointer active:scale-[0.99] touch-manipulation ${
                                  isSelected
                                    ? 'border-emerald-400 bg-zinc-800/90 ring-1 ring-emerald-400/30'
                                    : 'bg-zinc-950/70 border-zinc-800/90 hover:border-zinc-700'
                                }`}
                              >
                                <div className="flex items-center space-x-3.5 min-w-0">
                                  <div className={`p-3 rounded-xl shrink-0 ${isSelected ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-800 text-zinc-100'}`}>
                                    <Scissors className="w-4 h-4" />
                                  </div>
                                  <div className="truncate">
                                    <h3 className="font-bold text-sm sm:text-base truncate">
                                      {service.name}
                                    </h3>
                                    <span className="inline-flex items-center text-xs mt-0.5 text-zinc-400">
                                      <Clock className="w-3 h-3 mr-1" />
                                      {service.durationMinutes} min
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="font-extrabold text-sm sm:text-base text-emerald-400">
                                    ${service.price}
                                  </span>
                                  <ArrowRight className="w-4 h-4 text-zinc-500" />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* PASO 2: ELEGIR BARBERO */}
                  {step === 2 && (
                    <div className="space-y-4">
                      <div>
                        <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
                          Elegí con quién atenderte
                        </h2>
                        <p className="text-xs mt-0.5 text-zinc-400">
                          Seleccioná a tu barbero para ver sus horarios disponibles
                        </p>
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        {availableBarbersForService.map((barber) => {
                          const isSelected = selectedBarber?.id === barber.id;
                          return (
                            <button
                              key={barber.id}
                              type="button"
                              onClick={() => handleSelectBarber(barber)}
                              className={`w-full p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 text-left cursor-pointer active:scale-[0.99] touch-manipulation ${
                                isSelected
                                  ? 'border-emerald-400 bg-zinc-800/90 ring-1 ring-emerald-400/30'
                                  : 'bg-zinc-950/70 border-zinc-800 hover:border-zinc-700'
                              }`}
                            >
                              <div className="flex items-center space-x-3.5">
                                <div className="w-12 h-12 rounded-xl flex items-center justify-center font-extrabold text-base bg-zinc-800 border border-zinc-700 text-zinc-100 shrink-0">
                                  {barber.name.charAt(0)}
                                </div>
                                <div>
                                  <h3 className="font-bold text-base">{barber.name}</h3>
                                  <p className="text-xs text-zinc-400">{barber.role || 'Barbero Profesional'}</p>
                                </div>
                              </div>
                              <ArrowRight className="w-4 h-4 text-zinc-400 shrink-0" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* PASO 3: FECHA Y HORA */}
                  {step === 3 && (
                    <div className="space-y-5">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
                            Fecha y hora
                          </h2>
                          <p className="text-xs mt-0.5 text-zinc-400">
                            Barbero: <strong className="text-white">{selectedBarber?.name}</strong> • {selectedService?.name}
                          </p>
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold uppercase tracking-wider opacity-60 block mb-2">
                          Deslizá para elegir el día
                        </label>
                        <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-none snap-x [-webkit-overflow-scrolling:touch]">
                          {days.map((day) => {
                            const isSelected = selectedDate === day.dateString;
                            return (
                              <button
                                key={day.dateString}
                                type="button"
                                onClick={() => {
                                  setSelectedDate(day.dateString);
                                  setSelectedTime(null);
                                }}
                                className={`flex-shrink-0 w-[4.5rem] py-3 px-2 rounded-2xl border text-center transition-all flex flex-col items-center cursor-pointer snap-start active:scale-95 touch-manipulation ${
                                  isSelected
                                    ? 'bg-zinc-100 text-zinc-950 font-bold border-transparent shadow-md'
                                    : 'bg-zinc-950/70 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                                }`}
                              >
                                <span className="text-[10px] opacity-75 uppercase tracking-wider">
                                  {day.dayName}
                                </span>
                                <span className="text-lg font-extrabold my-0.5">{day.dayNumber}</span>
                                <span className="text-[10px] opacity-75">{day.monthName}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-3 pt-2 border-t border-zinc-800/40">
                        <label className="text-[11px] font-semibold uppercase tracking-wider opacity-60 block">
                          Horarios disponibles ({selectedDate})
                        </label>

                        {!currentDayRule.isOpen ? (
                          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold text-center">
                            El local se encuentra cerrado este día. Tocá otra fecha arriba.
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {morningSlots.length > 0 && (
                              <div>
                                <span className="text-[11px] font-medium text-emerald-400 block mb-2">
                                  ☀️ Mañana
                                </span>
                                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                                  {morningSlots.map((time) => {
                                    const isPast = isSlotPastForSelectedDay(activeDayObj, time);
                                    const booked = selectedBarber
                                      ? checkSlotBooked(selectedBarber.id, selectedDate, time)
                                      : false;
                                    const unavailable = isPast || booked;
                                    const isSelected = selectedTime === time && !unavailable;

                                    return (
                                      <button
                                        key={time}
                                        type="button"
                                        disabled={unavailable}
                                        onClick={() => setSelectedTime(time)}
                                        className={`py-3 px-2 rounded-xl border text-xs font-bold transition-all flex items-center justify-center touch-manipulation active:scale-95 ${
                                          unavailable
                                            ? 'bg-zinc-950/20 border-zinc-800/40 text-zinc-600 line-through cursor-not-allowed opacity-45'
                                            : isSelected
                                            ? 'bg-emerald-400 text-zinc-950 font-extrabold border-transparent shadow-md'
                                            : 'bg-zinc-950/80 border-zinc-800 text-zinc-200 cursor-pointer hover:border-zinc-600'
                                        }`}
                                      >
                                        <span>{time}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {afternoonSlots.length > 0 && (
                              <div>
                                <span className="text-[11px] font-medium text-indigo-400 block mb-2">
                                  🌙 Tarde / Noche
                                </span>
                                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                                  {afternoonSlots.map((time) => {
                                    const isPast = isSlotPastForSelectedDay(activeDayObj, time);
                                    const booked = selectedBarber
                                      ? checkSlotBooked(selectedBarber.id, selectedDate, time)
                                      : false;
                                    const unavailable = isPast || booked;
                                    const isSelected = selectedTime === time && !unavailable;

                                    return (
                                      <button
                                        key={time}
                                        type="button"
                                        disabled={unavailable}
                                        onClick={() => setSelectedTime(time)}
                                        className={`py-3 px-2 rounded-xl border text-xs font-bold transition-all flex items-center justify-center touch-manipulation active:scale-95 ${
                                          unavailable
                                            ? 'bg-zinc-950/20 border-zinc-800/40 text-zinc-600 line-through cursor-not-allowed opacity-45'
                                            : isSelected
                                            ? 'bg-emerald-400 text-zinc-950 font-extrabold border-transparent shadow-md'
                                            : 'bg-zinc-950/80 border-zinc-800 text-zinc-200 cursor-pointer hover:border-zinc-600'
                                        }`}
                                      >
                                        <span>{time}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* PASO 4: DATOS DEL CLIENTE */}
                  {step === 4 && (
                    <div className="space-y-4">
                      <div>
                        <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">Tus datos</h2>
                        <p className="text-xs mt-0.5 text-zinc-400">
                          Completá tu nombre y celular para confirmar el turno
                        </p>
                      </div>
                      <div className="space-y-3.5">
                        <div>
                          <label className="block text-xs font-semibold mb-1.5 opacity-80">
                            Nombre y apellido *
                          </label>
                          <input
                            type="text"
                            maxLength={50}
                            autoComplete="name"
                            placeholder="Ej: Martín Rodríguez"
                            value={clientName}
                            onChange={(e) => setClientName(e.target.value)}
                            className="w-full px-4 py-3.5 rounded-xl border text-base outline-none bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-zinc-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold mb-1.5 opacity-80">
                            Celular uruguayo (09X XXX XXX) *
                          </label>
                          <input
                            type="tel"
                            inputMode="numeric"
                            autoComplete="tel"
                            maxLength={11}
                            placeholder="098 509 376"
                            value={clientPhone}
                            onChange={(e) =>
                              setClientPhone(formatUruguayanPhoneInput(e.target.value))
                            }
                            className="w-full px-4 py-3.5 rounded-xl border text-base outline-none font-mono bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-zinc-500"
                          />
                        </div>

                        {formError && (
                          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center space-x-2">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{formError}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Botonera Desktop (oculta en móvil porque usamos barra fija inferior) */}
                  <div className="hidden lg:flex mt-6 pt-4 border-t border-zinc-800 items-center justify-between gap-3">
                    {step > 1 ? (
                      <button
                        type="button"
                        onClick={handleBack}
                        className="px-4 py-3 rounded-xl border border-zinc-800 text-zinc-300 bg-zinc-950 hover:bg-zinc-800 font-semibold text-xs cursor-pointer"
                      >
                        Atrás
                      </button>
                    ) : (
                      <div />
                    )}

                    <button
                      type="button"
                      disabled={!canProceed()}
                      onClick={handleNext}
                      className={`px-6 py-3.5 rounded-xl font-semibold text-xs flex items-center justify-center space-x-2 transition-all ${
                        canProceed()
                          ? 'bg-zinc-100 hover:bg-white text-zinc-950 font-bold cursor-pointer'
                          : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                      }`}
                    >
                      <span>
                        {step === 4
                          ? isSubmitting
                            ? 'Confirmando...'
                            : 'Confirmar Turno'
                          : 'Continuar'}
                      </span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <aside className="lg:col-span-5 space-y-4 lg:sticky lg:top-20">
              <div className="border rounded-3xl p-5 space-y-3.5 bg-zinc-900/90 border-zinc-800">
                <div className="flex items-center justify-between border-b pb-3 border-zinc-800/60">
                  <h3 className="font-bold text-sm">Resumen de tu turno</h3>
                </div>
                <div className="space-y-2.5 text-xs sm:text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Servicio</span>
                    <span className="font-semibold">{selectedService?.name || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Barbero</span>
                    <span className="font-semibold">{selectedBarber?.name || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Fecha y hora</span>
                    <span className="font-semibold">
                      {selectedTime ? `${selectedDate} • ${selectedTime} hs` : selectedDate || '—'}
                    </span>
                  </div>
                  <div className="pt-3 border-t border-zinc-800 flex justify-between items-center">
                    <span className="font-semibold">Total a abonar</span>
                    <span className="text-lg font-extrabold text-emerald-400">
                      ${selectedService?.price || 0}
                    </span>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}
      </main>

      {/* BARRA INFERIOR FIJA PARA CELULARES (Óptima navegación móvil a una mano) */}
      {activeTab === 'reservar' && !confirmedAppointment && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-zinc-950/95 backdrop-blur-lg border-t border-zinc-800 p-3 px-4">
          <div className="max-w-md mx-auto flex items-center justify-between gap-3">
            {step > 1 ? (
              <button
                type="button"
                onClick={handleBack}
                className="px-4 py-3.5 rounded-xl border border-zinc-800 text-zinc-200 bg-zinc-900 active:scale-95 font-bold text-xs cursor-pointer touch-manipulation shrink-0"
              >
                Atrás
              </button>
            ) : (
              <div className="text-xs">
                <span className="text-zinc-400 block">Total</span>
                <span className="font-extrabold text-base text-emerald-400">
                  ${selectedService?.price || 0}
                </span>
              </div>
            )}

            <button
              type="button"
              disabled={!canProceed()}
              onClick={handleNext}
              className={`flex-1 py-3.5 px-5 rounded-xl text-xs font-extrabold flex items-center justify-center space-x-2 transition-all touch-manipulation active:scale-[0.98] ${
                canProceed()
                  ? 'bg-zinc-100 text-zinc-950 shadow-lg'
                  : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
              }`}
            >
              <span>
                {step === 4
                  ? isSubmitting
                    ? 'Confirmando...'
                    : `Confirmar Turno ($${selectedService?.price || 0})`
                  : 'Continuar'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AgendarPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 text-zinc-400 flex items-center justify-center text-sm">
          Cargando agenda...
        </div>
      }
    >
      <AgendarContent />
    </Suspense>
  );
}