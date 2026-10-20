'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Scissors,
  Calendar as CalendarIcon,
  Clock,
  Phone,
  CheckCircle2,
  XCircle,
  LogOut,
  Lock,
  ArrowLeft,
  KeyRound,
  UserCheck,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import {
  BarberItem,
  ShopConfig,
  AppointmentItem,
  DEFAULT_SHOP_CONFIG,
  DEFAULT_BARBERS,
  getBarbers,
  getShopConfig,
  unlockBarberPanelWithPin,
  updateAppointmentStatus,
} from '@/lib/booking-store';

function BarberPortalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const profileSlug = searchParams.get('perfil');

  const [mounted, setMounted] = useState(false);
  const [shopConfig, setShopConfig] = useState<ShopConfig>(DEFAULT_SHOP_CONFIG);
  const [barbers, setBarbers] = useState<BarberItem[]>(DEFAULT_BARBERS);
  
  const [selectedBarberId, setSelectedBarberId] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [barberAppointments, setBarberAppointments] = useState<AppointmentItem[]>([]);
  const [commissionRate, setCommissionRate] = useState<number>(50);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    setMounted(true);
    async function init() {
      try {
        const [cfg, brbs] = await Promise.all([getShopConfig(true), getBarbers(true)]);
        setShopConfig(cfg);
        const activeBrbs = brbs.filter((b) => b.active !== false);
        setBarbers(activeBrbs);

        if (profileSlug && activeBrbs.length > 0) {
          const found = activeBrbs.find(
            (b) => (b.slug || b.name.toLowerCase()) === profileSlug.toLowerCase()
          );
          if (found) {
            setSelectedBarberId(found.id);
          }
        }
      } catch (err) {
        console.error('Error inicializando portal de barberos:', err);
      }
    }
    init();
  }, [profileSlug]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBarberId || !pin.trim()) {
      setErrorMsg('Seleccioná tu tarjeta e ingresá tu PIN.');
      return;
    }

    try {
      setLoading(true);
      setErrorMsg('');
      const res = await unlockBarberPanelWithPin(selectedBarberId, pin.trim());
      setCommissionRate(res.commissionRate);
      setBarberAppointments(res.appointments);
      setIsUnlocked(true);
    } catch (err: any) {
      setErrorMsg(err?.message || 'PIN incorrecto.');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (appointmentId: string, status: AppointmentItem['status']) => {
    try {
      setErrorMsg('');
      const updated = await updateAppointmentStatus(appointmentId, status);
      setBarberAppointments(Array.isArray(updated) ? updated : []);
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudo actualizar el estado del turno.');
    }
  };

  if (!mounted) {
    return <div className="min-h-screen bg-zinc-950 text-zinc-100" />;
  }

  const selectedBarberObj = barbers.find((b) => b.id === selectedBarberId);
  const filteredAppointments = barberAppointments.filter((a) => a.status !== 'cancelado');
  const totalEarned = filteredAppointments.reduce(
    (sum, a) => sum + Math.round((Number(a.priceSnapshot ?? a.servicePrice) * commissionRate) / 100),
    0
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-28 sm:pb-16 relative">
      <header className="sticky top-0 z-30 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/80 px-4 pt-[max(0.75rem,calc(env(safe-area-inset-top)+0.5rem))] pb-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-100 shrink-0">
              <Scissors className="w-4 h-4" />
            </div>
            <div>
              <h1 className="font-bold text-sm sm:text-base tracking-tight">
                {shopConfig.name} • Portal de Barberos
              </h1>
            </div>
          </div>

          <Link
            href="/"
            prefetch={true}
            className="px-3 py-2 rounded-xl bg-zinc-100 hover:bg-white active:scale-95 transition-transform text-zinc-950 text-xs font-bold flex items-center space-x-1 touch-manipulation"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Inicio</span>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-6 pt-6">
        {!isUnlocked ? (
          <div className="max-w-xl mx-auto bg-zinc-900/90 border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl backdrop-blur-sm">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-center mx-auto text-emerald-400">
                <KeyRound className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-extrabold tracking-tight">Acceso Barbero</h2>
              <p className="text-xs text-zinc-400">
                Seleccioná tu tarjeta e ingresá tu PIN de 4 dígitos para ver tus turnos y comisiones.
              </p>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleUnlock} className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-2">Elegí tu perfil</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {barbers.map((b) => {
                    const isSelected = selectedBarberId === b.id;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setSelectedBarberId(b.id)}
                        className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center space-x-3 ${
                          isSelected
                            ? 'bg-zinc-100 text-zinc-950 border-white font-bold shadow-md'
                            : 'bg-zinc-950/80 border-zinc-800 text-zinc-200 hover:border-zinc-700'
                        }`}
                      >
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                            isSelected ? 'bg-zinc-950 text-white' : 'bg-zinc-800 text-zinc-100'
                          }`}
                        >
                          {b.name.charAt(0)}
                        </div>
                        <div className="truncate">
                          <p className="text-sm font-bold truncate">{b.name}</p>
                          <p
                            className={`text-[11px] truncate ${
                              isSelected ? 'text-zinc-700' : 'text-zinc-400'
                            }`}
                          >
                            Barbero
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">PIN de Acceso</label>
                <input
                  type="password"
                  maxLength={4}
                  placeholder="••••"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="w-full px-3.5 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-center font-mono text-lg tracking-widest outline-none text-zinc-100"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-extrabold text-xs tracking-wide uppercase transition-transform active:scale-[0.98] cursor-pointer"
              >
                {loading ? 'Verificando...' : 'Ingresar a mi Panel'}
              </button>
            </form>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center space-x-3.5">
                <div className="w-12 h-12 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-center font-extrabold text-lg text-emerald-400">
                  {selectedBarberObj?.name.charAt(0) || 'B'}
                </div>
                <div>
                  <h2 className="text-lg font-extrabold">{selectedBarberObj?.name}</h2>
                  <p className="text-xs text-zinc-400">Comisión configurada: {commissionRate}%</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsUnlocked(false)}
                className="px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-rose-400 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Salir</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 space-y-1">
                <span className="text-xs text-zinc-400">Turnos atendidos</span>
                <p className="text-3xl font-extrabold text-white">{filteredAppointments.length}</p>
              </div>

              <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 space-y-1">
                <span className="text-xs text-emerald-400 font-bold">Mis Comisiones Estimadas</span>
                <p className="text-3xl font-extrabold text-emerald-400">${totalEarned}</p>
              </div>
            </div>

            <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-5 sm:p-6 space-y-4">
              <h3 className="font-bold text-base flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-emerald-400" />
                Mis Turnos Asignados
              </h3>

              {filteredAppointments.length === 0 ? (
                <div className="p-12 text-center bg-zinc-950 border border-zinc-800 rounded-2xl space-y-2">
                  <CalendarIcon className="w-8 h-8 text-zinc-600 mx-auto" />
                  <p className="text-xs text-zinc-400">No tenés turnos activos en este momento.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredAppointments.map((apt) => (
                    <div
                      key={apt.id}
                      className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-bold text-emerald-400">
                            {apt.dateString} • {apt.timeSlot} hs
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
                        <h4 className="font-bold text-sm sm:text-base">
                          {apt.clientName}{' '}
                          <span className="font-normal text-xs text-zinc-400">
                            ({apt.clientPhone})
                          </span>
                        </h4>
                        <p className="text-xs text-zinc-400">
                          {apt.serviceName} (${apt.priceSnapshot ?? apt.servicePrice})
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {apt.status !== 'completado' && (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(apt.id, 'completado')}
                            className="px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Completar</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleStatusChange(apt.id, 'cancelado')}
                          className="px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-rose-400 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Cancelar</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function BarberPortalPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">Cargando...</div>}>
      <BarberPortalContent />
    </Suspense>
  );
}