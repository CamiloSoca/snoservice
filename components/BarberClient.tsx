// app/barbero/barbero.tsx
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
  BarChart3,
} from 'lucide-react';
import {
  BarberItem,
  ShopConfig,
  AppointmentItem,
  TipItem,
  ManualChargeItem,
  unlockBarberPanelWithPin,
  getBarberDashboardSnapshot,
  updateAppointmentStatus,
  getTips,
  createTip,
  deleteTip,
  getManualCharges,
  createManualCharge,
  deleteManualCharge,
  sortAppointmentsChronologically,
  canCompleteAppointment,
} from '@/lib/booking-store';
import { InitialShopSkeleton, PanelLoading } from '@/components/InitialShopState';
import type { PublicShopData } from '@/lib/public-shop-data';

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

function BarberPortalContent({initialShop}: {initialShop: PublicShopData}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const profileSlug = searchParams.get('perfil');

  const availableMonths = getRecentMonths(12);
  const [selectedMonth, setSelectedMonth] = useState<string>(availableMonths[0].value);
  const [auditDate, setAuditDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const [shopConfig] = useState<ShopConfig>(initialShop.shopConfig);
  const [barbers] = useState<BarberItem[]>(() => initialShop.barbers.filter(b => b.active !== false));

  const [selectedBarberId, setSelectedBarberId] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [cashOpen, setCashOpen] = useState<boolean>(false);
  const [barberAppointments, setBarberAppointments] = useState<AppointmentItem[]>([]);
  const [barberTips, setBarberTips] = useState<TipItem[]>([]);
  const [barberCharges, setBarberCharges] = useState<ManualChargeItem[]>([]);
  const [commissionRate, setCommissionRate] = useState<number>(50);
  const [loading, setLoading] = useState<boolean>(false);
  const [panelLoading, setPanelLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const [newTipAmount, setNewTipAmount] = useState<string>('');
  const [newTipNote, setNewTipNote] = useState<string>('');
  const [savingTip, setSavingTip] = useState<boolean>(false);

  const [newChargeAmount, setNewChargeAmount] = useState<string>('');
  const [newChargeNote, setNewChargeNote] = useState<string>('');
  const [savingCharge, setSavingCharge] = useState<boolean>(false);

  useEffect(() => {
    if (!profileSlug || barbers.length === 0) return;
    const found = barbers.find(
      b => (b.slug || b.name.toLowerCase()) === profileSlug.toLowerCase()
    );
    if (found) setSelectedBarberId(found.id);
  }, [profileSlug, barbers]);

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
      // Autenticación terminada: abrir el panel sin esperar todas las finanzas.
      setCommissionRate(res.commissionRate);
      setIsUnlocked(true);
      setPin('');
      setLoading(false);
      setPanelLoading(true);

      // Una única API privada trae los turnos, movimientos y caja en paralelo.
      const snapshot = await getBarberDashboardSnapshot();
      setCashOpen(snapshot.cashOpen);
      setCommissionRate(snapshot.commissionRate);
      setBarberAppointments(sortAppointmentsChronologically(snapshot.appointments));
      setBarberTips(snapshot.tips);
      setBarberCharges(snapshot.manualCharges);
    } catch (err: any) {
      // Ante una lectura incompleta no mostrar cifras vacías como reales.
      setIsUnlocked(false);
      setErrorMsg(err?.message || 'No se pudo ingresar al panel.');
    } finally {
      setLoading(false);
      setPanelLoading(false);
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

  const handleAddMyCharge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBarberId || !newChargeAmount || Number(newChargeAmount) <= 0) return;
    try {
      setSavingCharge(true);
      setErrorMsg('');
      await createManualCharge({
        barberId: selectedBarberId,
        amount: Number(newChargeAmount),
        note: newChargeNote.trim() || 'Corte extra sin turno',
      });
      const updatedCharges = await getManualCharges(selectedBarberId);
      setBarberCharges(Array.isArray(updatedCharges) ? updatedCharges : []);
      setNewChargeAmount('');
      setNewChargeNote('');
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudo registrar el cobro.');
    } finally {
      setSavingCharge(false);
    }
  };

  const handleDeleteMyCharge = async (chargeId: string) => {
    try {
      setErrorMsg('');
      await deleteManualCharge(chargeId);
      const updatedCharges = await getManualCharges(selectedBarberId);
      setBarberCharges(Array.isArray(updatedCharges) ? updatedCharges : []);
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudo borrar el cobro.');
    }
  };

  const selectedBarberObj = barbers.find((b) => b.id === selectedBarberId);

  const completedAppointments = barberAppointments.filter(
    (a) => a.status === 'completado' && isWithinSelectedMonth(a.createdAt, selectedMonth)
  );

  const monthlyTips = barberTips.filter((t) =>
    isWithinSelectedMonth(t.createdAt, selectedMonth)
  );

  const monthlyCharges = barberCharges.filter((c) =>
    isWithinSelectedMonth(c.createdAt, selectedMonth)
  );

  const grossFromAppointments = completedAppointments.reduce(
    (sum, a) => sum + Number(a.priceSnapshot ?? a.servicePrice),
    0
  );

  const grossFromCharges = monthlyCharges.reduce((sum, c) => sum + Number(c.amount), 0);
  const totalGrossMonthly = grossFromAppointments + grossFromCharges;

  const totalEarned = Math.round((totalGrossMonthly * commissionRate) / 100);
  const totalTipsAmount = monthlyTips.reduce((sum, t) => sum + Number(t.amount), 0);

  const dailyAppointments = barberAppointments.filter((a) => {
    if (a.status !== 'completado') return false;
    if (auditDate) {
      const aDate = (a.createdAt || '').split('T')[0];
      if (aDate !== auditDate) return false;
    }
    return true;
  });

  const dailyCharges = barberCharges.filter((c) => {
    if (auditDate) {
      const cDate = (c.createdAt || '').split('T')[0];
      if (cDate !== auditDate) return false;
    }
    return true;
  });

  const dailyTips = barberTips.filter((t) => {
    if (auditDate) {
      const tDate = (t.createdAt || '').split('T')[0];
      if (tDate !== auditDate) return false;
    }
    return true;
  });

  const dailyGross = 
    dailyAppointments.reduce((sum, a) => sum + Number(a.priceSnapshot ?? a.servicePrice), 0) +
    dailyCharges.reduce((sum, c) => sum + Number(c.amount), 0);

  const dailyCommission = Math.round((dailyGross * commissionRate) / 100);
  const dailyTipsTotal = dailyTips.reduce((sum, t) => sum + Number(t.amount), 0);

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
                Seleccioná tu tarjeta e ingresá tu PIN de 4 a 6 dígitos para ver tus turnos, comisiones y propinas.
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
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="PIN de 4 a 6 dígitos"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
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
        ) : panelLoading ? (
          <PanelLoading label="PIN validado. Preparando tus turnos y finanzas..." />
        ) : (
          <div className="space-y-6">
            {!cashOpen && (
              <div role="status" className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-sm text-amber-300">
                Caja cerrada: podés consultar tus turnos e historial, pero no registrar ni eliminar cobros o propinas, ni completar turnos. Al abrir una nueva caja, volvé a ingresar para actualizar el estado.
              </div>
            )}
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

            <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-emerald-400" />
                  Mis Ganancias Día a Día
                </h3>
                <input
                  type="date"
                  value={auditDate}
                  onChange={(e) => setAuditDate(e.target.value)}
                  className="px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-700 text-xs font-bold text-emerald-400 outline-none cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-1">
                  <span className="text-xs text-zinc-400">Mi Comisión Generada (Día)</span>
                  <p className="text-2xl font-extrabold text-emerald-400">${dailyCommission}</p>
                  <span className="text-[11px] text-zinc-500">{dailyAppointments.length} turnos + {dailyCharges.length} extras</span>
                </div>
                <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-1">
                  <span className="text-xs text-zinc-400">Mis Propinas (Día)</span>
                  <p className="text-2xl font-extrabold text-amber-400">+${dailyTipsTotal}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 space-y-1">
                <span className="text-xs text-zinc-400">Turnos Completados (Mes)</span>
                <p className="text-3xl font-extrabold text-white">{completedAppointments.length}</p>
              </div>

              <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 space-y-1">
                <span className="text-xs text-emerald-400 font-bold">Mis Comisiones (Mes)</span>
                <p className="text-3xl font-extrabold text-emerald-400">${totalEarned}</p>
              </div>

              <div className="bg-zinc-900/90 border border-emerald-500/30 rounded-2xl p-5 space-y-1">
                <span className="text-xs text-amber-400 font-bold flex items-center gap-1.5">
                  <Coins className="w-3.5 h-3.5" />
                  Mis Propinas (Mes)
                </span>
                <p className="text-3xl font-extrabold text-amber-400">+${totalTipsAmount}</p>
              </div>
            </div>

            <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-5 sm:p-6 space-y-4">
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  <Coins className="w-4 h-4 text-emerald-400" />
                  Registrar Cobro Manual (Corte sin turno previo)
                </h3>
              </div>

              <form onSubmit={handleAddMyCharge} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <input
                  type="number"
                  placeholder="Monto $"
                  value={newChargeAmount}
                  onChange={(e) => setNewChargeAmount(e.target.value)}
                  className="sm:col-span-4 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-base sm:text-sm outline-none"
                />
                <input
                  type="text"
                  placeholder="Nota..."
                  value={newChargeNote}
                  onChange={(e) => setNewChargeNote(e.target.value)}
                  className="sm:col-span-6 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-base sm:text-sm outline-none"
                />
                <button
                  type="submit"
                  disabled={savingCharge || !cashOpen}
                  className="sm:col-span-2 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-extrabold text-xs cursor-pointer flex items-center justify-center gap-1 touch-manipulation"
                >
                  <Plus className="w-4 h-4" />
                  <span>{savingCharge ? '...' : 'Sumar'}</span>
                </button>
              </form>

              {monthlyCharges.length > 0 && (
                <div className="space-y-2 pt-2">
                  {monthlyCharges.map((chg) => (
                    <div
                      key={chg.id}
                      className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-zinc-400 font-medium">{chg.dateString}</span>
                        {chg.note && <span className="text-zinc-200">• {chg.note}</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-sm text-emerald-400">+${chg.amount}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteMyCharge(chg.id)}
                          disabled={!cashOpen}
                          className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-rose-400 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-5 sm:p-6 space-y-4">
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  <Coins className="w-4 h-4 text-amber-400" />
                  Cuenta de Propinas ({selectedBarberObj?.name})
                </h3>
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
                  placeholder="Nota opcional..."
                  value={newTipNote}
                  onChange={(e) => setNewTipNote(e.target.value)}
                  className="sm:col-span-6 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-base sm:text-sm outline-none"
                />
                <button
                  type="submit"
                  disabled={savingTip || !cashOpen}
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
                          disabled={!cashOpen}
                          className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-rose-400 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-emerald-400" />
                  Mis Turnos Asignados
                </h3>
              </div>

              {barberAppointments.length === 0 ? (
                <div className="p-12 text-center bg-zinc-950 border border-zinc-800 rounded-2xl space-y-2">
                  <CalendarIcon className="w-8 h-8 text-zinc-600 mx-auto" />
                  <p className="text-xs text-zinc-400">No hay turnos registrados.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {barberAppointments.map((apt) => (
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
                            onClick={() => {
                              if (!canCompleteAppointment(apt.dateString)) {
                                alert('No podés completar un turno que corresponde a una fecha futura.');
                                return;
                              }
                              handleStatusChange(apt.id, 'completado');
                            }}
                            disabled={!cashOpen}
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

export default function BarberClient({initialShop}: {initialShop: PublicShopData}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
          Cargando...
        </div>
      }
    >
      <BarberPortalContent initialShop={initialShop} />
    </Suspense>
  );
}