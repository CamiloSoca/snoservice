'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Scissors,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  DollarSign,
  UserCheck,
  LogOut,
  Calendar as CalendarIcon,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import {
  BarberItem,
  AppointmentItem,
  ShopConfig,
  DayOption,
  DEFAULT_SHOP_CONFIG,
  DEFAULT_BARBERS,
  getBarbers,
  getShopConfig,
  updateAppointmentStatus,
  unlockBarberPanelWithPin,
  buildRealOpenDays,
  timeToMinutes,
  minutesToTime,
} from '@/lib/booking-store';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutos de bloqueo

function BarberPinPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const perfilParam = searchParams.get('perfil');

  const [shopConfig, setShopConfig] = useState<ShopConfig>(DEFAULT_SHOP_CONFIG);
  const [barbers, setBarbers] = useState<BarberItem[]>(DEFAULT_BARBERS);
  const [days, setDays] = useState<DayOption[]>([]);
  const [selectedBarber, setSelectedBarber] = useState<BarberItem | null>(null);

  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);
  const [lockoutRemainingMins, setLockoutRemainingMins] = useState<number>(0);

  const [unlockedBarberId, setUnlockedBarberId] = useState<string | null>(null);
  const [unlockedCommissionRate, setUnlockedCommissionRate] = useState<number>(50);
  const [privateAppointments, setPrivateAppointments] = useState<AppointmentItem[]>([]);
  const [calendarDateFilter, setCalendarDateFilter] = useState<string>('');

  useEffect(() => {
    const openDays = buildRealOpenDays();
    setDays(openDays);
    if (openDays.length > 0) {
      setCalendarDateFilter(openDays[0].dateString);
    }

    async function initData() {
      try {
        const [cfg, brbs] = await Promise.all([getShopConfig(), getBarbers()]);
        const activeBarbers = brbs.filter((b) => b.active);

        setShopConfig(cfg || DEFAULT_SHOP_CONFIG);
        setBarbers(activeBarbers);

        if (activeBarbers.length > 0) {
          const matched = perfilParam
            ? activeBarbers.find(
                (b) => (b.slug || b.name.toLowerCase()) === perfilParam.toLowerCase()
              )
            : null;
          setSelectedBarber(matched || activeBarbers[0]);
        }
      } catch (err) {
        console.error('Error cargando panel de barbero:', err);
      }
    }

    initData();
  }, [perfilParam]);

  const currentBarber = selectedBarber || barbers[0];

  // Verificar si el barbero actual está bloqueado temporalmente en este dispositivo
  useEffect(() => {
    if (!currentBarber) return;
    const lockKey = `pin_lock_${currentBarber.id}`;
    const lockUntil = Number(localStorage.getItem(lockKey) || '0');
    if (lockUntil > Date.now()) {
      setLockoutRemainingMins(Math.ceil((lockUntil - Date.now()) / 60000));
    } else {
      setLockoutRemainingMins(0);
    }
  }, [currentBarber]);

  const handleSelectBarber = (b: BarberItem) => {
    setSelectedBarber(b);
    setPinError('');
    setPinInput('');
    setUnlockedBarberId(null);
    setPrivateAppointments([]);

    const slug = b.slug || b.name.toLowerCase();
    router.replace(`/barbero?perfil=${slug}`, { scroll: false });
  };

  const getEndTimeString = (startTime: string | null, durationMinutes?: number): string => {
    if (!startTime) return '';
    return minutesToTime(timeToMinutes(startTime) + (durationMinutes || 60));
  };

  const handleUnlockPanel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBarber) return;

    const lockKey = `pin_lock_${currentBarber.id}`;
    const attemptsKey = `pin_attempts_${currentBarber.id}`;
    const lockUntil = Number(localStorage.getItem(lockKey) || '0');

    if (lockUntil > Date.now()) {
      const waitMins = Math.ceil((lockUntil - Date.now()) / 60000);
      setLockoutRemainingMins(waitMins);
      setPinError(
        `Demasiados intentos fallidos. Acceso bloqueado por ${waitMins} min.`
      );
      return;
    }

    try {
      setIsVerifyingPin(true);
      setPinError('');

      // 1. Si existe la RPC en Supabase, verifica primero el bloqueo de fuerza bruta en el servidor
      if (supabase) {
        const { error: rpcError } = await supabase.rpc('verify_barber_pin_secure', {
          p_barber_id: currentBarber.id,
          p_pin: pinInput.trim(),
        });
        if (rpcError) {
          throw new Error(rpcError.message);
        }
      }

      // 2. Desbloquea y trae las finanzas/agenda
      const result = await unlockBarberPanelWithPin(currentBarber.id, pinInput.trim());

      // Éxito: limpiar contadores de fallos
      localStorage.removeItem(attemptsKey);
      localStorage.removeItem(lockKey);
      setLockoutRemainingMins(0);

      setUnlockedBarberId(currentBarber.id);
      setUnlockedCommissionRate(result.commissionRate);
      setPrivateAppointments(result.appointments);
      setPinInput('');
    } catch (err: any) {
      const currentAttempts = Number(localStorage.getItem(attemptsKey) || '0') + 1;
      localStorage.setItem(attemptsKey, String(currentAttempts));

      if (currentAttempts >= MAX_PIN_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_DURATION_MS;
        localStorage.setItem(lockKey, String(until));
        localStorage.removeItem(attemptsKey);
        setLockoutRemainingMins(15);
        setPinError(
          'Superaste los 5 intentos permitidos. Acceso bloqueado por 15 minutos por seguridad.'
        );
      } else {
        const remaining = MAX_PIN_ATTEMPTS - currentAttempts;
        setPinError(
          err?.message || `PIN incorrecto. Te quedan ${remaining} intentos antes del bloqueo.`
        );
      }
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
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-30 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
              <Scissors className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h1 className="font-bold text-sm sm:text-base">Acceso Barberos (PIN)</h1>
              <p className="text-[11px] text-zinc-400">{shopConfig.name} • Agenda y Comisiones</p>
            </div>
          </div>

          <Link
            href="/"
            className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-200 text-xs font-semibold flex items-center space-x-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Inicio</span>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-5 pt-5">
        {/* SELECTOR DE BARBERO */}
        <div className="space-y-2">
          <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block">
            Seleccioná tu perfil para ingresar PIN
          </label>
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
        </div>

        {/* PANEL PRIVADO PROTEGIDO POR PIN */}
        {currentBarber && (
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-5 sm:p-6 backdrop-blur-sm">
            {!isPanelUnlocked ? (
              <form
                onSubmit={handleUnlockPanel}
                className="max-w-xs mx-auto py-8 space-y-4 text-center"
              >
                <div className="w-12 h-12 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-center mx-auto text-emerald-400">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-base">Agenda de {currentBarber.name}</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Ingresá tu PIN de 4 dígitos para ver tus turnos y ganancias
                  </p>
                </div>

                {lockoutRemainingMins > 0 ? (
                  <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs space-y-1">
                    <AlertTriangle className="w-5 h-5 mx-auto text-rose-400" />
                    <p className="font-bold">Acceso bloqueado temporalmente</p>
                    <p className="text-[11px] opacity-80">
                      Por seguridad contra intentos de fuerza bruta, esperá {lockoutRemainingMins} min para volver a intentar.
                    </p>
                  </div>
                ) : (
                  <>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="••••"
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="w-full text-center tracking-[0.5em] font-mono text-xl py-3 rounded-xl bg-zinc-950 border border-zinc-800 outline-none text-zinc-100"
                    />

                    {pinError && <p className="text-xs text-rose-400">{pinError}</p>}

                    <button
                      type="submit"
                      disabled={isVerifyingPin || pinInput.length < 4}
                      className="w-full py-3.5 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-extrabold text-xs cursor-pointer disabled:opacity-50"
                    >
                      {isVerifyingPin ? 'Verificando...' : 'Entrar a mi Agenda'}
                    </button>
                  </>
                )}
              </form>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-emerald-400" />
                    <span className="font-bold text-sm">
                      Panel de {currentBarber.name} ({unlockedCommissionRate}% comisión)
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
                    <span>Salir</span>
                  </button>
                </div>

                {/* RESUMEN FINANCIERO */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4">
                    <span className="text-xs text-zinc-400">Turnos Activos</span>
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

                {/* CALENDARIO DE TURNOS */}
                <div className="space-y-4 pt-2 border-t border-zinc-800">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <h4 className="font-bold text-sm flex items-center gap-2">
                      <CalendarIcon className="w-4 h-4 text-emerald-400" />
                      Mis Turnos del Día
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
                            className="bg-zinc-950 border border-zinc-800/90 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
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
                                Servicio:{' '}
                                <strong className="text-zinc-200">{apt.serviceName}</strong> ($
                                {apt.priceSnapshot ?? apt.servicePrice})
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
          Cargando panel...
        </div>
      }
    >
      <BarberPinPageContent />
    </Suspense>
  );
}