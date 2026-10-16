'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  MapPin,
  Scissors,
  Sun,
  Moon,
  Clock,
  Check,
  ArrowRight,
  User,
  CheckCircle2,
  RotateCcw,
  Phone,
  MessageSquare,
  Lock,
  AlertCircle,
  Star,
  ExternalLink,
  UserCheck,
} from 'lucide-react';
import {
  ServiceItem,
  BarberItem,
  AppointmentItem,
  ShopConfig,
  BrandAccent,
  DayOption,
  DEFAULT_SERVICES,
  DEFAULT_BARBERS,
  DEFAULT_SHOP_CONFIG,
  DEFAULT_SCHEDULE,
  getServices,
  getBarbers,
  getPublicBookedSlots,
  getShopConfig,
  createAppointment,
  buildRealOpenDays,
  getSlotsForDayOfWeek,
  isSlotAvailable,
  timeToMinutes,
  minutesToTime,
} from '@/lib/booking-store';

const FALLBACK_DAYS: DayOption[] = [
  { dateString: 'Mar 15 Oct', dayName: 'Mar', dayNumber: '15', monthName: 'Oct', dayOfWeek: 2 },
  { dateString: 'Mié 16 Oct', dayName: 'Mié', dayNumber: '16', monthName: 'Oct', dayOfWeek: 3 },
  { dateString: 'Jue 17 Oct', dayName: 'Jue', dayNumber: '17', monthName: 'Oct', dayOfWeek: 4 },
  { dateString: 'Vie 18 Oct', dayName: 'Vie', dayNumber: '18', monthName: 'Oct', dayOfWeek: 5 },
  { dateString: 'Sáb 19 Oct', dayName: 'Sáb', dayNumber: '19', monthName: 'Oct', dayOfWeek: 6 },
  { dateString: 'Mar 22 Oct', dayName: 'Mar', dayNumber: '22', monthName: 'Oct', dayOfWeek: 2 },
];

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const BOOKING_COOLDOWN_MS = 5 * 60 * 1000;
const BOOKING_STORAGE_KEY = '13cut_last_booking_ts';

function getUruguayNow() {
  const nowUy = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Montevideo' })
  );
  return {
    dayNumber: String(nowUy.getDate()),
    monthName: MONTHS_ES[nowUy.getMonth()],
    currentMinutes: nowUy.getHours() * 60 + nowUy.getMinutes(),
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

const INSTAGRAM_POSTS = [
  {
    id: 'ig-1',
    image:
      'https://zdhuymfapknpogdrbksn.supabase.co/storage/v1/object/public/media/0f5ab934-db55-46d2-a829-ecd59150d61a/service/5aac5325-e7d8-4d2c-a6e8-2262c48ef195.jpg?v=1791944149645',
    tag: 'Corte',
  },
  {
    id: 'ig-2',
    image:
      'https://zdhuymfapknpogdrbksn.supabase.co/storage/v1/object/public/media/0f5ab934-db55-46d2-a829-ecd59150d61a/service/d1272363-e728-46e0-8b74-1ef16cd029f7.jpg?v=1792010387277',
    tag: 'Mechas',
  },
  {
    id: 'ig-3',
    image:
      'https://zdhuymfapknpogdrbksn.supabase.co/storage/v1/object/public/media/0f5ab934-db55-46d2-a829-ecd59150d61a/service/2dcba77d-0406-4b85-bb26-cd291eb34c5f.jpg?v=1791944389044',
    tag: 'Color Global',
  },
  {
    id: 'ig-4',
    image:
      'https://zdhuymfapknpogdrbksn.supabase.co/storage/v1/object/public/media/0f5ab934-db55-46d2-a829-ecd59150d61a/branch/f9079cf5-877b-4054-aa9b-8345d7679b0e.jpg?v=1792010015139',
    tag: '13´Cut',
  },
];

const GOOGLE_REVIEWS = [
  {
    id: 'rev-1',
    author: 'Matías Cabrera',
    timeAgo: 'Hace 5 días',
    rating: 5,
    service: 'Corte & Barba',
    comment:
      'Excelente atención en 13´Cut. Reservé turno con Nahuel por la web y me atendieron en hora.',
  },
  {
    id: 'rev-2',
    author: 'Facundo Silvera',
    timeAgo: 'Hace 2 semanas',
    rating: 5,
    service: 'Mechas',
    comment: 'Me hice mechas con Alexander, impecable el trabajo y muy práctico para agendar.',
  },
  {
    id: 'rev-3',
    author: 'Rodrigo Techera',
    timeAgo: 'Hace 3 semanas',
    rating: 5,
    service: 'Corte',
    comment: 'Emanuel un crack. Que abran los martes hasta las 22 hs salva después del trabajo.',
  },
];

function InstagramSvg({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

function GoogleLogoSvg({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
      />
    </svg>
  );
}

function getThemeStyles(accent: BrandAccent, isDark: boolean) {
  return {
    primaryBtn: isDark
      ? 'bg-zinc-100 hover:bg-white text-zinc-950 font-bold'
      : 'bg-zinc-950 hover:bg-zinc-800 text-white font-bold',
    activeBorder: isDark
      ? 'border-zinc-200 bg-zinc-800/80 ring-1 ring-zinc-200/30'
      : 'border-zinc-950 bg-zinc-100 ring-1 ring-zinc-950/20',
    iconBox: isDark ? 'bg-zinc-800 text-zinc-100' : 'bg-zinc-900 text-white',
    badge: isDark
      ? 'bg-zinc-800 text-zinc-200 border-zinc-700'
      : 'bg-zinc-200 text-zinc-900 border-zinc-300',
    accentText: isDark ? 'text-zinc-100' : 'text-zinc-950',
    checkCircle: isDark
      ? 'bg-zinc-100 border-zinc-100 text-zinc-950'
      : 'bg-zinc-950 border-zinc-950 text-white',
  };
}

export default function Home() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [step, setStep] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const [shopConfig, setShopConfig] = useState<ShopConfig>(DEFAULT_SHOP_CONFIG);
  const [services, setServices] = useState<ServiceItem[]>(DEFAULT_SERVICES);
  const [barbers, setBarbers] = useState<BarberItem[]>(DEFAULT_BARBERS);
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [days, setDays] = useState<DayOption[]>(FALLBACK_DAYS);

  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null);
  const [selectedBarber, setSelectedBarber] = useState<BarberItem | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(FALLBACK_DAYS[0].dateString);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const [clientName, setClientName] = useState<string>('');
  const [clientPhone, setClientPhone] = useState<string>('');
  const [clientNotes, setClientNotes] = useState<string>('');
  const [formError, setFormError] = useState<string>('');

  const [confirmedAppointment, setConfirmedAppointment] = useState<AppointmentItem | null>(null);

  const bookingSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem('barber_theme') as 'dark' | 'light' | null;
    if (savedTheme === 'light' || savedTheme === 'dark') {
      setTheme(savedTheme);
    }

    const realDays = buildRealOpenDays();
    setDays(realDays);
    if (realDays.length > 0) setSelectedDate(realDays[0].dateString);

    async function loadData() {
      try {
        const [config, srvs, brbs, publicSlots] = await Promise.all([
          getShopConfig(),
          getServices(),
          getBarbers(),
          getPublicBookedSlots(),
        ]);

        setShopConfig(config);
        setServices(srvs.filter((s) => s.active));
        setBarbers(brbs.filter((b) => b.active));
        setAppointments(publicSlots);
      } catch (err) {
        console.error('Error cargando datos:', err);
      }
    }

    loadData();
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('barber_theme', next);
  };

  const isDark = theme === 'dark';
  const styles = getThemeStyles(shopConfig.accent, isDark);

  const activeDayObj = days.find((d) => d.dateString === selectedDate) || days[0];

  const { morning: morningSlots, afternoon: afternoonSlots } = getSlotsForDayOfWeek(
    activeDayObj.dayOfWeek,
    30
  );
  const currentDayRule = DEFAULT_SCHEDULE[activeDayObj.dayOfWeek];

  const scrollToTopOfWizard = () => {
    bookingSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const isSlotPastForSelectedDay = (dayObj: DayOption, timeSlot: string): boolean => {
    const { dayNumber, monthName, currentMinutes } = getUruguayNow();
    const isToday =
      String(Number(dayObj.dayNumber)) === String(Number(dayNumber)) &&
      dayObj.monthName.toLowerCase() === monthName.toLowerCase();

    if (!isToday) return false;

    const slotMinutes = timeToMinutes(timeSlot);
    return slotMinutes <= currentMinutes + 10;
  };

  const checkSlotBooked = (barberId: string, dateStr: string, timeSlot: string): boolean => {
    const duration = selectedService?.durationMinutes || 60;
    const available = isSlotAvailable({
      candidateTime: timeSlot,
      serviceDurationMinutes: duration,
      barberId,
      dateString: dateStr,
      dayOfWeek: activeDayObj.dayOfWeek,
      existingAppointments: appointments,
      allServices: services,
    });
    return !available;
  };

  const getEndTimeString = (startTime: string | null, durationMinutes?: number): string => {
    if (!startTime) return '';
    const dur = durationMinutes || selectedService?.durationMinutes || 60;
    const endMins = timeToMinutes(startTime) + dur;
    return minutesToTime(endMins);
  };

  const canProceed = () => {
    if (step === 1) return selectedService !== null;
    if (step === 2) return selectedBarber !== null;
    if (step === 3) {
      if (!selectedDate || !selectedTime) return false;
      return !isSlotPastForSelectedDay(activeDayObj, selectedTime);
    }
    if (step === 4) {
      return (
        !isSubmitting &&
        clientName.trim().length >= 3 &&
        isStrictUruguayanMobile(clientPhone)
      );
    }
    return false;
  };

  const handleNext = async () => {
    if (!canProceed()) {
      if (step === 4 && !isSubmitting) {
        setFormError(
          'Ingresá tu nombre y un celular uruguayo válido de 9 dígitos (09X XXX XXX).'
        );
      }
      return;
    }

    setFormError('');

    if (step < 4) {
      setStep(step + 1);
      scrollToTopOfWizard();
    } else if (selectedService && selectedBarber && selectedTime) {
      try {
        setIsSubmitting(true);

        const lastBookingTs = Number(localStorage.getItem(BOOKING_STORAGE_KEY) || '0');
        if (lastBookingTs && Date.now() - lastBookingTs < BOOKING_COOLDOWN_MS) {
          const waitMins = Math.ceil(
            (BOOKING_COOLDOWN_MS - (Date.now() - lastBookingTs)) / 60000
          );
          setFormError(
            `Ya registraste una reserva hace instantes. Por seguridad, esperá ${waitMins} min antes de crear otra.`
          );
          setIsSubmitting(false);
          return;
        }

        if (isSlotPastForSelectedDay(activeDayObj, selectedTime)) {
          setFormError('Este horario ya pasó. Por favor volvé atrás y elegí una hora posterior.');
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
          setFormError(
            `Ya tenés un turno registrado para el ${selectedDate} con este número de celular.`
          );
          setIsSubmitting(false);
          return;
        }

        if (checkSlotBooked(selectedBarber.id, selectedDate, selectedTime)) {
          setFormError(
            'Este horario no cuenta con tiempo suficiente o acaba de ser ocupado. Por favor elegí otro.'
          );
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
          clientNotes: clientNotes.trim(),
        });

        localStorage.setItem(BOOKING_STORAGE_KEY, String(Date.now()));

        const updatedSlots = await getPublicBookedSlots();
        setAppointments(updatedSlots);
        setConfirmedAppointment(created);
        scrollToTopOfWizard();
      } catch (err: any) {
        setFormError(
          err?.message || 'Hubo un problema al confirmar el turno. Probá con otro horario.'
        );
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleBack = () => {
    setFormError('');
    if (step > 1) {
      setStep(step - 1);
      scrollToTopOfWizard();
    }
  };

  const handleReset = () => {
    setConfirmedAppointment(null);
    setStep(1);
    setSelectedService(null);
    setSelectedBarber(null);
    setSelectedDate(days[0].dateString);
    setSelectedTime(null);
    setClientName('');
    setClientPhone('');
    setClientNotes('');
    setFormError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  const bgImage = shopConfig.backgroundImageUrl || DEFAULT_SHOP_CONFIG.backgroundImageUrl;
  const coverImage = shopConfig.coverImageUrl || DEFAULT_SHOP_CONFIG.coverImageUrl;
  const logoImage = shopConfig.logoUrl || DEFAULT_SHOP_CONFIG.logoUrl;

  const availableBarbersForService = selectedService
    ? barbers.filter(
        (b) =>
          !b.serviceIds ||
          b.serviceIds.length === 0 ||
          b.serviceIds.includes(selectedService.id)
      )
    : barbers;

  return (
    <div
      className={`min-h-screen w-full flex flex-col justify-between relative transition-colors duration-200 ${
        isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-50 text-zinc-900'
      }`}
    >
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <img
          src={bgImage}
          alt="Fondo"
          className={`w-full h-full object-cover object-center grayscale transition-opacity duration-700 ${
            isDark ? 'opacity-[0.14] contrast-125' : 'opacity-[0.07] contrast-100'
          }`}
        />
        <div
          className={`absolute inset-0 bg-gradient-to-b transition-colors duration-500 ${
            isDark
              ? 'from-zinc-950/80 via-zinc-950/65 to-zinc-950/95'
              : 'from-zinc-50/85 via-zinc-50/70 to-zinc-50/95'
          }`}
        />
      </div>

      <div className="relative z-10 w-full">
        {/* HEADER */}
        <header
          className={`sticky top-0 z-30 w-full backdrop-blur-md border-b transition-colors ${
            isDark ? 'bg-zinc-950/90 border-zinc-800/80' : 'bg-white/90 border-zinc-200'
          }`}
        >
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center space-x-2.5 min-w-0">
              {logoImage ? (
                <div className="w-9 h-9 rounded-xl overflow-hidden border border-zinc-700/60 bg-zinc-900 shrink-0">
                  <img src={logoImage} alt={shopConfig.name} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${styles.iconBox}`}>
                  <Scissors className="w-4 h-4" />
                </div>
              )}
              <div className="truncate">
                <h1 className="font-bold text-sm sm:text-base tracking-tight truncate">
                  {shopConfig.name}
                </h1>
                <p className={`text-[11px] truncate ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                  {shopConfig.address}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <Link
                href="/barbero"
                className={`px-3 py-2 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-colors ${
                  isDark
                    ? 'bg-zinc-900 border-zinc-800 text-zinc-200 hover:bg-zinc-800'
                    : 'bg-zinc-100 border-zinc-200 text-zinc-800 hover:bg-zinc-200'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Barberos</span>
              </Link>

              <button
                type="button"
                onClick={toggleTheme}
                className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                  isDark
                    ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                    : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                }`}
                aria-label="Cambiar tema"
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </header>

        {/* BANNER */}
        <section className="max-w-5xl mx-auto px-4 pt-5">
          <div
            className={`relative rounded-3xl overflow-hidden border ${
              isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-950 border-zinc-800 text-white'
            }`}
          >
            <div className="absolute inset-0">
              <img
                src={coverImage}
                alt={shopConfig.name}
                className="w-full h-full object-cover object-center opacity-40"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/80 to-zinc-950/30" />
            </div>

            <div className="relative p-5 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
              {logoImage && (
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl bg-zinc-950 shrink-0">
                  <img src={logoImage} alt={shopConfig.name} className="w-full h-full object-cover" />
                </div>
              )}

              <div className="space-y-1.5">
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                  {shopConfig.name}
                </h2>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-300">
                  <span className="flex items-center">
                    <MapPin className="w-3.5 h-3.5 mr-1 text-zinc-100 shrink-0" />
                    {shopConfig.address}, {shopConfig.city}
                  </span>
                  <span className="flex items-center">
                    <Phone className="w-3.5 h-3.5 mr-1 text-emerald-400 shrink-0" />
                    {shopConfig.phone}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* WIZARD DE RESERVA */}
        <main
          ref={bookingSectionRef}
          className="max-w-5xl mx-auto px-4 py-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
        >
          <div
            className={`lg:col-span-7 border rounded-3xl p-5 sm:p-7 backdrop-blur-sm transition-colors ${
              isDark ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white/95 border-zinc-200 shadow-sm'
            }`}
          >
            {confirmedAppointment ? (
              <div className="py-4 space-y-5">
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400">
                    Turno #{confirmedAppointment.code}
                  </span>
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
                    Turno Confirmado
                  </h2>
                </div>

                <div
                  className={`border rounded-2xl p-4 space-y-2.5 text-xs sm:text-sm ${
                    isDark ? 'bg-zinc-950/70 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                  }`}
                >
                  <div className="flex justify-between">
                    <span className="opacity-60">Cliente</span>
                    <span className="font-semibold">{confirmedAppointment.clientName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-60">Servicio</span>
                    <span className="font-semibold">
                      {confirmedAppointment.serviceName} ({confirmedAppointment.durationMinutes} min • $
                      {confirmedAppointment.servicePrice})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-60">Barbero</span>
                    <span className="font-semibold">{confirmedAppointment.barberName}</span>
                  </div>
                  <div
                    className={`flex justify-between pt-2.5 border-t ${
                      isDark ? 'border-zinc-800' : 'border-zinc-200'
                    }`}
                  >
                    <span className="opacity-60">Fecha y horario</span>
                    <span className="font-bold">
                      {confirmedAppointment.dateString} • {confirmedAppointment.timeSlot} a{' '}
                      {getEndTimeString(
                        confirmedAppointment.timeSlot,
                        confirmedAppointment.durationMinutes
                      )}{' '}
                      hs
                    </span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                  <a
                    href={getWhatsAppReceiptUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex-1 py-3.5 px-4 rounded-xl text-xs sm:text-sm flex items-center justify-center space-x-2 transition-all ${styles.primaryBtn}`}
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>Enviar por WhatsApp</span>
                  </a>

                  <button
                    type="button"
                    onClick={handleReset}
                    className={`py-3.5 px-4 rounded-xl border font-semibold text-xs sm:text-sm flex items-center justify-center space-x-1.5 cursor-pointer ${
                      isDark
                        ? 'border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                        : 'border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Nuevo turno</span>
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {/* PASO 1 */}
                {step === 1 && (
                  <div className="space-y-4">
                    <div>
                      <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
                        Elegí el servicio
                      </h2>
                      <p className={`text-xs mt-1 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        Seleccioná qué querés hacerte hoy
                      </p>
                    </div>

                    <div className="space-y-3">
                      {services.map((service) => {
                        const isSelected = selectedService?.id === service.id;
                        return (
                          <button
                            key={service.id}
                            type="button"
                            onClick={() => {
                              setSelectedService(service);
                              setSelectedBarber(null);
                              setSelectedTime(null);
                            }}
                            className={`w-full p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between gap-3 cursor-pointer ${
                              isSelected
                                ? styles.activeBorder
                                : isDark
                                ? 'bg-zinc-950/60 border-zinc-800/90 hover:border-zinc-700'
                                : 'bg-zinc-50/70 border-zinc-200 hover:border-zinc-300'
                            }`}
                          >
                            <div className="flex items-center space-x-3.5 min-w-0">
                              {service.imageUrl ? (
                                <div className="w-14 h-14 rounded-xl overflow-hidden border border-zinc-800 shrink-0 bg-zinc-900">
                                  <img
                                    src={service.imageUrl}
                                    alt={service.name}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              ) : (
                                <div className={`p-3 rounded-xl shrink-0 ${styles.iconBox}`}>
                                  <Scissors className="w-4 h-4" />
                                </div>
                              )}

                              <div className="truncate">
                                <h3 className="font-bold text-sm sm:text-base truncate">
                                  {service.name}
                                </h3>
                                <span
                                  className={`inline-flex items-center text-xs mt-0.5 ${
                                    isDark ? 'text-zinc-400' : 'text-zinc-500'
                                  }`}
                                >
                                  <Clock className="w-3 h-3 mr-1" />
                                  Duración: {service.durationMinutes} min
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center space-x-3 shrink-0">
                              <span className="font-extrabold text-sm sm:text-base">
                                ${service.price}
                              </span>
                              <div
                                className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                                  isSelected
                                    ? styles.checkCircle
                                    : isDark
                                    ? 'border-zinc-700 bg-zinc-900 text-transparent'
                                    : 'border-zinc-300 bg-white text-transparent'
                                }`}
                              >
                                <Check className="w-3 h-3 stroke-[3]" />
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* PASO 2 */}
                {step === 2 && (
                  <div className="space-y-4">
                    <div>
                      <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
                        Elegí el barbero
                      </h2>
                      <p className={`text-xs mt-1 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        Con quién preferís atenderte
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      {availableBarbersForService.map((barber) => {
                        const isSelected = selectedBarber?.id === barber.id;
                        const slug = barber.slug || barber.name.toLowerCase();
                        return (
                          <div
                            key={barber.id}
                            className={`w-full p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-2 ${
                              isSelected
                                ? styles.activeBorder
                                : isDark
                                ? 'bg-zinc-950/60 border-zinc-800/90 hover:border-zinc-700'
                                : 'bg-zinc-50/70 border-zinc-200 hover:border-zinc-300'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedBarber(barber);
                                setSelectedTime(null);
                              }}
                              className="flex-1 flex items-center justify-between text-left cursor-pointer min-w-0"
                            >
                              <div className="flex items-center space-x-3.5 min-w-0">
                                <div
                                  className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${styles.iconBox}`}
                                >
                                  {barber.name.charAt(0)}
                                </div>
                                <div className="truncate">
                                  <h3 className="font-bold text-sm sm:text-base truncate">
                                    {barber.name}
                                  </h3>
                                  <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                                    Barbero profesional
                                  </p>
                                </div>
                              </div>

                              <div
                                className={`w-5 h-5 rounded-full flex items-center justify-center border shrink-0 mx-2 ${
                                  isSelected
                                    ? styles.checkCircle
                                    : isDark
                                    ? 'border-zinc-700 bg-zinc-900 text-transparent'
                                    : 'border-zinc-300 bg-white text-transparent'
                                }`}
                              >
                                <Check className="w-3 h-3 stroke-[3]" />
                              </div>
                            </button>

                            <Link
                              href={`/barbero?perfil=${slug}`}
                              className={`px-3 py-2 rounded-xl border text-[11px] font-semibold flex items-center gap-1.5 shrink-0 ${
                                isDark
                                  ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-600'
                                  : 'bg-zinc-100 border-zinc-200 text-zinc-700 hover:bg-zinc-200'
                              }`}
                            >
                              <span>Perfil</span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Link>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* PASO 3 (FECHA Y HORA - DISEÑO PULIDO Y COMPACTO) */}
                {step === 3 && (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
                          Fecha y hora
                        </h2>
                        <p className={`text-xs mt-0.5 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                          Atiende: <span className="font-semibold text-white">{selectedBarber?.name}</span> • {selectedService?.durationMinutes || 60} min
                        </p>
                      </div>
                      {currentDayRule?.open && (
                        <span className={`text-[11px] font-medium px-3 py-1 rounded-xl border ${styles.badge}`}>
                          Local: {currentDayRule.open} a {currentDayRule.close} hs
                        </span>
                      )}
                    </div>

                    {/* Selector de días horizontal limpio */}
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-wider opacity-60 block mb-2">
                        Día de atención
                      </label>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
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
                              className={`py-2.5 px-1.5 rounded-2xl border text-center transition-all flex flex-col items-center cursor-pointer ${
                                isSelected
                                  ? styles.primaryBtn + ' border-transparent shadow-md'
                                  : isDark
                                  ? 'bg-zinc-950/60 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                                  : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:border-zinc-300'
                              }`}
                            >
                              <span className="text-[10px] opacity-75 uppercase tracking-wider">{day.dayName}</span>
                              <span className="text-lg font-extrabold my-0.5">{day.dayNumber}</span>
                              <span className="text-[10px] opacity-75">{day.monthName}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Selector de Horarios Simplificado en grilla fluida y elegante */}
                    <div className="space-y-3 pt-2 border-t border-zinc-800/40">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-semibold uppercase tracking-wider opacity-60">
                          Horarios disponibles
                        </label>
                        <span className="text-[11px] opacity-50">
                          Seleccioná una franja
                        </span>
                      </div>

                      {/* Mañana y Tarde unificados en un diseño visualmente más limpio */}
                      <div className="space-y-3">
                        {morningSlots.length > 0 && (
                          <div>
                            <span className="text-[11px] font-medium text-emerald-400 block mb-1.5">☀️ Turno Mañana</span>
                            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
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
                                    className={`py-2 px-1 rounded-xl border text-xs font-semibold transition-all flex flex-col items-center justify-center ${
                                      unavailable
                                        ? isDark
                                          ? 'bg-zinc-950/20 border-zinc-800/40 text-zinc-600 line-through cursor-not-allowed opacity-50'
                                          : 'bg-zinc-100 border-zinc-200 text-zinc-400 line-through cursor-not-allowed opacity-50'
                                        : isSelected
                                        ? styles.primaryBtn + ' border-transparent scale-[1.02]'
                                        : isDark
                                        ? 'bg-zinc-950/70 border-zinc-800 text-zinc-200 hover:border-zinc-700 cursor-pointer'
                                        : 'bg-zinc-50 border-zinc-200 text-zinc-800 hover:border-zinc-300 cursor-pointer'
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
                                    className={`py-2 px-1 rounded-xl border text-xs font-semibold transition-all flex flex-col items-center justify-center ${
                                      unavailable
                                        ? isDark
                                          ? 'bg-zinc-950/20 border-zinc-800/40 text-zinc-600 line-through cursor-not-allowed opacity-50'
                                          : 'bg-zinc-100 border-zinc-200 text-zinc-400 line-through cursor-not-allowed opacity-50'
                                        : isSelected
                                        ? styles.primaryBtn + ' border-transparent scale-[1.02]'
                                        : isDark
                                        ? 'bg-zinc-950/70 border-zinc-800 text-zinc-200 hover:border-zinc-700 cursor-pointer'
                                        : 'bg-zinc-50 border-zinc-200 text-zinc-800 hover:border-zinc-300 cursor-pointer'
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

                {/* PASO 4 */}
                {step === 4 && (
                  <div className="space-y-4">
                    <div>
                      <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
                        Tus datos
                      </h2>
                      <p className={`text-xs mt-1 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        Para enviarte el comprobante y avisarte
                      </p>
                    </div>

                    <div className="space-y-3.5">
                      <div>
                        <label className="block text-xs font-semibold mb-1.5 opacity-80">
                          Nombre y apellido *
                        </label>
                        <div className="relative">
                          <User className="w-4 h-4 opacity-50 absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            maxLength={50}
                            placeholder="Tu nombre"
                            value={clientName}
                            onChange={(e) => setClientName(e.target.value)}
                            className={`w-full pl-10 pr-4 py-3 rounded-xl border text-base outline-none ${
                              isDark
                                ? 'bg-zinc-950 border-zinc-800 focus:border-zinc-400 text-zinc-100'
                                : 'bg-zinc-50 border-zinc-300 focus:border-zinc-900 text-zinc-900'
                            }`}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold mb-1.5 opacity-80">
                          Celular uruguayo (09X XXX XXX) *
                        </label>
                        <div className="relative">
                          <Phone className="w-4 h-4 opacity-50 absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="tel"
                            inputMode="numeric"
                            maxLength={11}
                            placeholder="098 509 376"
                            value={clientPhone}
                            onChange={(e) =>
                              setClientPhone(formatUruguayanPhoneInput(e.target.value))
                            }
                            className={`w-full pl-10 pr-4 py-3 rounded-xl border text-base outline-none font-mono ${
                              isDark
                                ? 'bg-zinc-950 border-zinc-800 focus:border-zinc-400 text-zinc-100'
                                : 'bg-zinc-50 border-zinc-300 focus:border-zinc-900 text-zinc-900'
                            }`}
                          />
                        </div>
                        <p className="text-[11px] opacity-60 mt-1">
                          Número celular de Uruguay (9 dígitos exactos).
                        </p>
                      </div>

                      {formError && (
                        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium flex items-center space-x-2">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>{formError}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* BOTONES DE NAVEGACIÓN */}
                <div
                  className={`mt-6 pt-4 border-t flex items-center justify-between gap-3 ${
                    isDark ? 'border-zinc-800' : 'border-zinc-200'
                  }`}
                >
                  {step > 1 ? (
                    <button
                      type="button"
                      onClick={handleBack}
                      className={`px-4 py-3 rounded-xl border font-semibold text-xs sm:text-sm cursor-pointer ${
                        isDark
                          ? 'border-zinc-800 text-zinc-300 bg-zinc-950 hover:bg-zinc-800'
                          : 'border-zinc-200 text-zinc-700 bg-zinc-100 hover:bg-zinc-200'
                      }`}
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
                    className={`flex-1 sm:flex-initial px-6 py-3.5 rounded-xl font-semibold text-xs sm:text-sm flex items-center justify-center space-x-2 transition-all ${
                      canProceed()
                        ? styles.primaryBtn + ' cursor-pointer active:scale-[0.99]'
                        : isDark
                        ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                        : 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
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

          {/* COLUMNA DERECHA (RESUMEN) */}
          <aside className="lg:col-span-5 space-y-4 lg:sticky lg:top-20">
            <div
              className={`border rounded-3xl p-5 space-y-3.5 backdrop-blur-sm ${
                isDark ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white/95 border-zinc-200 shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between border-b pb-3 border-zinc-800/60">
                <h3 className="font-bold text-sm">Resumen de reserva</h3>
                <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${styles.badge}`}>
                  {confirmedAppointment ? 'Listo' : `Selección`}
                </span>
              </div>

              <div className="space-y-2.5 text-xs sm:text-sm">
                <div className="flex justify-between items-center">
                  <span className={isDark ? 'text-zinc-400' : 'text-zinc-500'}>Servicio</span>
                  <span className="font-semibold">
                    {selectedService
                      ? `${selectedService.name} (${selectedService.durationMinutes}m)`
                      : '—'}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className={isDark ? 'text-zinc-400' : 'text-zinc-500'}>Barbero</span>
                  <span className="font-semibold">
                    {selectedBarber ? selectedBarber.name : '—'}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className={isDark ? 'text-zinc-400' : 'text-zinc-500'}>Fecha y hora</span>
                  <span className="font-semibold">
                    {selectedTime
                      ? `${selectedDate} • ${selectedTime} a ${getEndTimeString(selectedTime)} hs`
                      : selectedDate}
                  </span>
                </div>

                <div
                  className={`pt-3 border-t flex justify-between items-center ${
                    isDark ? 'border-zinc-800' : 'border-zinc-200'
                  }`}
                >
                  <span className="font-semibold">Total a abonar</span>
                  <span className="text-lg font-extrabold text-emerald-400">
                    ${selectedService ? selectedService.price : 0}
                  </span>
                </div>
              </div>
            </div>

            <div
              className={`border rounded-3xl p-5 space-y-3 backdrop-blur-sm ${
                isDark ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white/95 border-zinc-200 shadow-sm'
              }`}
            >
              <h3 className="font-bold text-sm">Horarios de {shopConfig.name}</h3>

              <div className={`grid grid-cols-2 gap-y-1.5 text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                <span>Lunes:</span>
                <span className="text-rose-400 font-semibold text-right">Cerrado</span>
                <span>Martes:</span>
                <span className="font-medium text-right">09:00 - 22:00</span>
                <span>Mié a Vie:</span>
                <span className="font-medium text-right">10:00 - 19:00</span>
                <span>Sábados:</span>
                <span className="font-medium text-right">09:00 - 18:00</span>
                <span>Domingos:</span>
                <span className="text-rose-400 font-semibold text-right">Cerrado</span>
              </div>
            </div>
          </aside>
        </main>

        {/* EQUIPO */}
        <section className="max-w-5xl mx-auto px-4 py-4">
          <div
            className={`border rounded-3xl p-5 sm:p-7 space-y-4 backdrop-blur-sm ${
              isDark ? 'bg-zinc-900/75 border-zinc-800/90' : 'bg-white/90 border-zinc-200 shadow-sm'
            }`}
          >
            <h2 className="text-lg font-extrabold tracking-tight">
              Equipo de {shopConfig.name}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {barbers.map((b) => {
                const slug = b.slug || b.name.toLowerCase();
                return (
                  <div
                    key={b.id}
                    className={`rounded-2xl border p-4 flex flex-col justify-between space-y-4 ${
                      isDark ? 'bg-zinc-950/70 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-11 h-11 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center font-extrabold text-base text-white shrink-0">
                        {b.name.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-bold text-base">{b.name}</h3>
                        <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                          Barbero
                        </p>
                      </div>
                    </div>

                    <Link
                      href={`/barbero?perfil=${slug}`}
                      className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${styles.primaryBtn}`}
                    >
                      <span>Ver agenda de {b.name}</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* INSTAGRAM */}
        <section className="max-w-5xl mx-auto px-4 py-4">
          <div
            className={`border rounded-3xl p-5 sm:p-7 space-y-5 backdrop-blur-sm ${
              isDark ? 'bg-zinc-900/75 border-zinc-800/90' : 'bg-white/90 border-zinc-200 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-zinc-800 text-white flex items-center justify-center shrink-0">
                  <InstagramSvg className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-extrabold tracking-tight">
                    Instagram
                  </h2>
                  <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    {shopConfig.instagramHandle}
                  </p>
                </div>
              </div>

              <a
                href={shopConfig.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl border text-xs font-semibold shrink-0 ${
                  isDark ? 'bg-zinc-950 border-zinc-800 text-zinc-200' : 'bg-zinc-50 border-zinc-200 text-zinc-800'
                }`}
              >
                <span>Ver perfil</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-60" />
              </a>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {INSTAGRAM_POSTS.map((post) => (
                <div
                  key={post.id}
                  className="relative aspect-square rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-900"
                >
                  <img src={post.image} alt={post.tag} className="w-full h-full object-cover" />
                  <div className="absolute bottom-2.5 left-2.5">
                    <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-zinc-950/80 text-white backdrop-blur-sm border border-white/10">
                      {post.tag}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* RESEÑAS */}
        <section id="resenas-google" className="max-w-5xl mx-auto px-4 py-4 pb-10">
          <div
            className={`border rounded-3xl p-5 sm:p-7 space-y-5 backdrop-blur-sm ${
              isDark ? 'bg-zinc-900/75 border-zinc-800/90' : 'bg-white/90 border-zinc-200 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div
                  className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                    isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                  }`}
                >
                  <GoogleLogoSvg className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-extrabold tracking-tight">
                    Opiniones en Google
                  </h2>
                  <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    {shopConfig.address}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-1">
                <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                <span className="text-xs font-bold">4.9</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {GOOGLE_REVIEWS.map((review) => (
                <div
                  key={review.id}
                  className={`rounded-2xl border p-4 space-y-2.5 ${
                    isDark ? 'bg-zinc-950/70 border-zinc-800/90' : 'bg-zinc-50/70 border-zinc-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs">{review.author}</span>
                    <div className="flex items-center space-x-0.5">
                      {Array.from({ length: review.rating }).map((_, i) => (
                        <Star key={i} className="w-3 h-3 text-amber-400 fill-amber-400" />
                      ))}
                    </div>
                  </div>
                  <p className={`text-xs leading-relaxed ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>
                    &ldquo;{review.comment}&rdquo;
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <footer
        className={`relative z-10 border-t py-6 text-xs ${
          isDark ? 'border-zinc-900 text-zinc-500' : 'border-zinc-200 text-zinc-500'
        }`}
      >
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <span className="font-semibold">{shopConfig.name}</span> • {shopConfig.address}
          </div>
          <div className="flex items-center space-x-4">
            <Link href="/barbero" className="inline-flex items-center gap-1 hover:underline">
              Barberos
            </Link>
            <Link href="/admin" className="inline-flex items-center gap-1 hover:underline">
              <Lock className="w-3 h-3" /> Admin
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}