'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Scissors,
  Calendar as CalendarIcon,
  CheckCircle2,
  XCircle,
  LogOut,
  ArrowLeft,
  KeyRound,
  AlertCircle,
  Coins,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  BarberItem,
  ShopConfig,
  AppointmentItem,
  TipItem,
  DEFAULT_SHOP_CONFIG,
  DEFAULT_BARBERS,
  getBarbers,
  getShopConfig,
  unlockBarberPanelWithPin,
  updateAppointmentStatus,
  getTips,
  createTip,
  deleteTip,
  sortAppointmentsChronologically,
} from '@/lib/booking-store';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function getRecentMonths(count = 12): { value: string; label: string }[] {
  const result: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    result.push({
      value: `${yyyy}-${mm}`,
      label: `${MONTH_NAMES[d.getMonth()]} ${yyyy}`,
    });
  }
  return result;
}

function isWithinSelectedMonth(isoOrDateStr: string, selectedMonthYear: string): boolean {
  if (!isoOrDateStr) return true;
  const target = new Date(isoOrDateStr);
  if (isNaN(target.getTime())) return true;
  const [selYear, selMonth] = selectedMonthYear.split('-').map(Number);
  if (!selYear || !selMonth) return true;
  return target.getFullYear() === selYear && target.getMonth() + 1 === selMonth;
}

function BarberPortalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const profileSlug = searchParams.get('perfil');

  const availableMonths = getRecentMonths(12);
  const [selectedMonth, setSelectedMonth] = useState<string>(availableMonths[0].value);

  const [mounted, setMounted] = useState(false);
  const [shopConfig, setShopConfig] = useState<ShopConfig>(DEFAULT_SHOP_CONFIG);
  const [barbers, setBarbers] = useState<BarberItem[]>(DEFAULT_BARBERS);

  const [selectedBarberId, setSelectedBarberId] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [barberAppointments, setBarberAppointments] = useState<AppointmentItem[]>([]);
  const [barberTips, setBarberTips] = useState<TipItem[]>([]);
  const [commissionRate, setCommissionRate] = useState<number>(50);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const [newTipAmount, setNewTipAmount] = useState<string>('');
  const [newTipNote, setNewTipNote] = useState<string>('');
  const [savingTip, setSavingTip] = useState<boolean>(false);

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
      const [res, myTips] = await Promise.all([
        unlockBarberPanelWithPin(selectedBarberId, pin.trim()),
        getTips(selectedBarberId),
      ]);
      setCommissionRate(res.commissionRate);
      setBarberAppointments(sortAppointmentsChronologically(res.appointments));
      setBarberTips(Array.isArray(myTips) ? myTips : []);
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
      const updatedAll = await updateAppointmentStatus(appointmentId, status);
      const myUpdated = (Array.isArray(updatedAll) ? updatedAll : []).filter(
        (a) => a.barberId === selectedBarberId
      );
      setBarberAppointments(sortAppointmentsChronologically(myUpdated));
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudo actualizar el estado del turno.');
    }
  };

  const handleAddMyTip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBarberId || !newTipAmount || Number(newTipAmount) <= 0) return;
    try {
      setSavingTip(true);
      setErrorMsg('');
      await createTip({
        barberId: selectedBarberId,
        amount: Number(newTipAmount),
        note: newTipNote.trim(),
      });
      const updatedTips = await getTips(selectedBarberId);
      setBarberTips(Array.isArray(updatedTips) ? updatedTips : []);
      setNewTipAmount('');
      setNewTipNote('');
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudo guardar la propina.');
    } finally {
      setSavingTip(false);
    }
  };

  const handleDeleteMyTip = async (tipId: string) => {
    try {
      setErrorMsg('');
      await deleteTip(tipId);
      const updatedTips = await getTips(selectedBarberId);
      setBarberTips(Array.isArray(updatedTips) ? updatedTips : []);
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudo borrar la propina.');
    }
  };

  if (!mounted) {
    return <div className="min-h-screen bg-zinc-950 text-zinc-100" />;
  }

  const selectedBarberObj = barbers.find((b) => b.id === selectedBarberId);

  // Filtramos turnos y propinas según el mes seleccionado en el historial
  const activeAppointments = sortAppointmentsChronologically(
    barberAppointments.filter((a) => a.status !== 'cancelado')
  );
  const monthlyAppointments = activeAppointments.filter((a) =>
    isWithinSelectedMonth(a.createdAt, selectedMonth)
  );
  const monthlyTips = barberTips.filter((t) =>
    isWithinSelectedMonth(t.createdAt, selectedMonth)
  );

  const totalEarned = monthlyAppointments.reduce(
    (sum, a) => sum + Math.round((Number(a.priceSnapshot ?? a.servicePrice) * commissionRate) / 100),
    0
  );
  const totalTipsAmount = monthlyTips.reduce((sum, t) => sum + Number(t.amount), 0);

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
                Seleccioná tu tarjeta e ingresá tu PIN de 4 dígitos para ver tus turnos, comisiones y propinas.
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
            {errorMsg && (
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMsg('')}
                  className="text-rose-300 hover:text-white text-xs underline cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            )}

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

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-700 text-xs font-bold text-emerald-400 outline-none cursor-pointer"
                >
                  {availableMonths.map((m) => (
                    <option key={m.value} value={m.value}>
                      📅 {m.label}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setIsUnlocked(false)}
                  className="px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-rose-400 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Salir</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 space-y-1">
                <span className="text-xs text-zinc-400">Turnos del mes</span>
                <p className="text-3xl font-extrabold text-white">{monthlyAppointments.length}</p>
              </div>

              <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 space-y-1">
                <span className="text-xs text-emerald-400 font-bold">Mis Comisiones del Mes</span>
                <p className="text-3xl font-extrabold text-emerald-400">${totalEarned}</p>
              </div>

              <div className="bg-zinc-900/90 border border-emerald-500/30 rounded-2xl p-5 space-y-1">
                <span className="text-xs text-amber-400 font-bold flex items-center gap-1.5">
                  <Coins className="w-3.5 h-3.5" />
                  Mis Propinas del Mes
                </span>
                <p className="text-3xl font-extrabold text-amber-400">+${totalTipsAmount}</p>
              </div>
            </div>

            {/* SECCIÓN DE PROPINAS DEL BARBERO */}
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-5 sm:p-6 space-y-4">
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  <Coins className="w-4 h-4 text-amber-400" />
                  Cuenta de Propinas ({selectedBarberObj?.name})
                </h3>
                <p className="text-xs text-zinc-400">
                  Anotá tus propinas del día para llevar tu control mensual.
                </p>
              </div>

              <form onSubmit={handleAddMyTip} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <input
                  type="number"
                  placeholder="Monto propina $"
                  value={newTipAmount}
                  onChange={(e) => setNewTipAmount(e.target.value)}
                  className="sm:col-span-4 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-base sm:text-sm outline-none"
                />
                <input
                  type="text"
                  placeholder="Nota opcional (ej: Efectivo / Transferencia)..."
                  value={newTipNote}
                  onChange={(e) => setNewTipNote(e.target.value)}
                  className="sm:col-span-6 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-base sm:text-sm outline-none"
                />
                <button
                  type="submit"
                  disabled={savingTip}
                  className="sm:col-span-2 py-2.5 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-extrabold text-xs cursor-pointer flex items-center justify-center gap-1 touch-manipulation"
                >
                  <Plus className="w-4 h-4" />
                  <span>{savingTip ? '...' : 'Sumar'}</span>
                </button>
              </form>

              {monthlyTips.length > 0 && (
                <div className="space-y-2 pt-2">
                  {monthlyTips.map((tp) => (
                    <div
                      key={tp.id}
                      className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-zinc-400 font-medium">{tp.dateString}</span>
                        {tp.note && <span className="text-zinc-200">• {tp.note}</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-sm text-amber-400">+${tp.amount}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteMyTip(tp.id)}
                          className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-rose-400 cursor-pointer"
                          title="Eliminar propina"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* MIS TURNOS ASIGNADOS ORDENADOS CRONOLÓGICAMENTE */}
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-emerald-400" />
                  Mis Turnos Asignados
                </h3>
                <span className="text-[11px] text-zinc-400">Ordenados por fecha y hora</span>
              </div>

              {monthlyAppointments.length === 0 ? (
                <div className="p-12 text-center bg-zinc-950 border border-zinc-800 rounded-2xl space-y-2">
                  <CalendarIcon className="w-8 h-8 text-zinc-600 mx-auto" />
                  <p className="text-xs text-zinc-400">No hay turnos registrados en este mes.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {monthlyAppointments.map((apt) => (
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
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
          Cargando...
        </div>
      }
    >
      <BarberPortalContent />
    </Suspense>
  );
}