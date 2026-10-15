'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Scissors,
  Calendar as CalendarIcon,
  Users,
  DollarSign,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  MessageSquare,
  ArrowLeft,
  Clock,
  LogOut,
  Settings,
  Check,
  Image as ImageIcon,
  Wallet,
  TrendingUp,
  Percent,
  KeyRound,
  Receipt,
  UserCheck,
  ExternalLink,
  Crown,
  Save,
  AlertCircle,
} from 'lucide-react';
import {
  ServiceItem,
  BarberItem,
  AppointmentItem,
  ExpenseItem,
  ExpenseCategory,
  ShopConfig,
  DEFAULT_SHOP_CONFIG,
  generateUUID,
  getServices,
  saveServices,
  deleteServiceFromDb,
  getAdminBarbers,
  saveBarbers,
  deleteBarberFromDb,
  getAppointments,
  updateAppointmentStatus,
  getExpenses,
  createExpense,
  deleteExpense,
  getShopConfig,
  saveShopConfig,
  buildRealOpenDays,
  DayOption,
} from '@/lib/booking-store';

type PeriodFilter = 'hoy' | 'semana' | 'mes';

function isWithinPeriod(isoOrDateStr: string, period: PeriodFilter): boolean {
  if (!isoOrDateStr) return true;
  const target = new Date(isoOrDateStr);
  if (isNaN(target.getTime())) return true;

  const now = new Date();
  if (period === 'hoy') {
    return (
      target.getFullYear() === now.getFullYear() &&
      target.getMonth() === now.getMonth() &&
      target.getDate() === now.getDate()
    );
  }
  if (period === 'semana') {
    const diffDays = (now.getTime() - target.getTime()) / (1000 * 3600 * 24);
    return diffDays <= 7 && diffDays >= -7;
  }
  if (period === 'mes') {
    return (
      target.getFullYear() === now.getFullYear() &&
      target.getMonth() === now.getMonth()
    );
  }
  return true;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<
    'caja' | 'agenda' | 'turnos' | 'barberos' | 'servicios' | 'marca'
  >('caja');

  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [barbers, setBarbers] = useState<BarberItem[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [shopConfig, setShopConfig] = useState<ShopConfig>(DEFAULT_SHOP_CONFIG);
  const [days, setDays] = useState<DayOption[]>([]);
  const [savedBanner, setSavedBanner] = useState(false);
  const [savingBarberId, setSavingBarberId] = useState<string | null>(null);
  const [adminError, setAdminError] = useState<string>('');

  const [period, setPeriod] = useState<PeriodFilter>('mes');
  const [onlyCompleted, setOnlyCompleted] = useState<boolean>(false);

  // Filtros para la pestaña de Agenda Global
  const [adminAgendaDate, setAdminAgendaDate] = useState<string>('');
  const [adminAgendaBarberId, setAdminAgendaBarberId] = useState<string>('todos');

  const [newServiceName, setNewServiceName] = useState('');
  const [newServicePrice, setNewServicePrice] = useState('');
  const [newServiceDuration, setNewServiceDuration] = useState('60');

  const [newBarberName, setNewBarberName] = useState('');
  const [newBarberCommission, setNewBarberCommission] = useState('50');
  const [newBarberPin, setNewBarberPin] = useState('1234');

  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>('Insumos');

  useEffect(() => {
    async function loadAdminData() {
      try {
        setAdminError('');
        const openDays = buildRealOpenDays();
        setDays(openDays);
        if (openDays.length > 0) {
          setAdminAgendaDate(openDays[0].dateString);
        }

        const [apts, srvs, brbs, exps, cfg] = await Promise.all([
          getAppointments(),
          getServices(),
          getAdminBarbers(),
          getExpenses(),
          getShopConfig(),
        ]);

        setAppointments(Array.isArray(apts) ? apts : []);
        setServices(Array.isArray(srvs) ? srvs : []);
        setBarbers(Array.isArray(brbs) ? brbs : []);
        setExpenses(Array.isArray(exps) ? exps : []);
        setShopConfig(cfg || DEFAULT_SHOP_CONFIG);
      } catch (err: any) {
        console.error('Error cargando panel de admin:', err);
        setAdminError(err?.message || 'Error al cargar los datos del panel administrativo.');
      }
    }

    loadAdminData();
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/login');
    router.refresh();
  };

  const handleStatusChange = async (id: string, status: AppointmentItem['status']) => {
    try {
      setAdminError('');
      const updated = await updateAppointmentStatus(id, status);
      setAppointments(Array.isArray(updated) ? updated : []);
    } catch (err: any) {
      setAdminError(err?.message || 'No se pudo actualizar el estado del turno.');
    }
  };

  const handleAddService = async () => {
    if (!newServiceName.trim() || !newServicePrice) return;
    const dur = Math.max(15, Number(newServiceDuration) || 60);
    const newItem: ServiceItem = {
      id: generateUUID(),
      name: newServiceName.trim(),
      price: Number(newServicePrice),
      durationMinutes: dur,
      description: `${dur} min`,
      active: true,
    };
    const previous = services;
    const updated = [...services, newItem];
    try {
      setAdminError('');
      await saveServices(updated);
      setServices(updated);
      setNewServiceName('');
      setNewServicePrice('');
    } catch (err: any) {
      setServices(previous);
      setAdminError(err?.message || 'Error al guardar el nuevo servicio.');
    }
  };

  const handleUpdateServicePrice = async (id: string, newPrice: number) => {
    const previous = services;
    const updated = services.map((s) => (s.id === id ? { ...s, price: newPrice } : s));
    setServices(updated);
    try {
      setAdminError('');
      await saveServices(updated);
    } catch (err: any) {
      setServices(previous);
      setAdminError(err?.message || 'Error al actualizar el precio del servicio.');
    }
  };

  const handleUpdateServiceDuration = async (id: string, newDuration: number) => {
    const dur = Math.max(15, Number(newDuration) || 60);
    const previous = services;
    const updated = services.map((s) =>
      s.id === id ? { ...s, durationMinutes: dur, description: `${dur} min` } : s
    );
    setServices(updated);
    try {
      setAdminError('');
      await saveServices(updated);
    } catch (err: any) {
      setServices(previous);
      setAdminError(err?.message || 'Error al actualizar la duración del servicio.');
    }
  };

  const handleDeleteService = async (id: string) => {
    const previous = services;
    const updated = services.filter((s) => s.id !== id);
    try {
      setAdminError('');
      await deleteServiceFromDb(id);
      setServices(updated);
    } catch (err: any) {
      setServices(previous);
      setAdminError(err?.message || 'Error al eliminar el servicio.');
    }
  };

  const handleAddBarber = async () => {
    if (!newBarberName.trim()) return;
    const rate = Math.min(100, Math.max(0, Number(newBarberCommission) || 50));
    const cleanPin = newBarberPin.trim().slice(0, 4) || '1234';
    const slug = newBarberName
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-');

    const newItem: BarberItem = {
      id: generateUUID(),
      slug,
      name: newBarberName.trim(),
      role: 'Barbero',
      bio: '',
      specialties: ['Corte', 'Corte & Barba'],
      serviceIds: services.map((s) => s.id),
      isOwner: rate === 100,
      active: true,
      commissionRate: rate,
      pin: cleanPin,
    };
    const previous = barbers;
    const updated = [...barbers, newItem];
    try {
      setAdminError('');
      await saveBarbers(updated);
      const freshBarbers = await getAdminBarbers();
      setBarbers(freshBarbers.length > 0 ? freshBarbers : updated);
      setNewBarberName('');
      setNewBarberCommission('50');
      setNewBarberPin('1234');
    } catch (err: any) {
      setBarbers(previous);
      setAdminError(err?.message || 'Error al agregar el barbero en la base de datos.');
    }
  };

  const handleUpdateBarberField = async (
    id: string,
    field: 'commissionRate' | 'pin',
    value: number | string
  ) => {
    const previous = barbers;
    const updated = barbers.map((b) => {
      if (b.id !== id) return b;
      if (field === 'commissionRate') {
        const rate = Math.min(100, Math.max(0, Number(value) || 0));
        return { ...b, commissionRate: rate, isOwner: rate === 100 };
      }
      return { ...b, pin: String(value).slice(0, 4) };
    });
    setBarbers(updated);
    try {
      setAdminError('');
      await saveBarbers(updated);
    } catch (err: any) {
      setBarbers(previous);
      setAdminError(err?.message || 'Error al actualizar los datos del barbero.');
    }
  };

  const handleToggleBarberService = (barberId: string, serviceId: string) => {
    const updated = barbers.map((b) => {
      if (b.id !== barberId) return b;
      const currentIds = b.serviceIds || [];
      const exists = currentIds.includes(serviceId);
      const nextIds = exists
        ? currentIds.filter((id) => id !== serviceId)
        : [...currentIds, serviceId];
      return { ...b, serviceIds: nextIds };
    });
    setBarbers(updated);
  };

  const handleSaveBarberChanges = async (barberId: string) => {
    try {
      setAdminError('');
      await saveBarbers(barbers);
      setSavingBarberId(barberId);
      setTimeout(() => setSavingBarberId(null), 1500);
    } catch (err: any) {
      setSavingBarberId(null);
      setAdminError(err?.message || 'Error al guardar los servicios del barbero.');
    }
  };

  const handleDeleteBarber = async (id: string) => {
    const previous = barbers;
    const updated = barbers.filter((b) => b.id !== id);
    try {
      setAdminError('');
      await deleteBarberFromDb(id);
      setBarbers(updated);
    } catch (err: any) {
      setBarbers(previous);
      setAdminError(err?.message || 'Error al eliminar el barbero.');
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseDesc.trim() || !expenseAmount || Number(expenseAmount) <= 0) return;
    try {
      setAdminError('');
      const updated = await createExpense({
        description: expenseDesc.trim(),
        amount: Number(expenseAmount),
        category: expenseCategory,
        date: new Date().toISOString().split('T')[0],
      });
      setExpenses(Array.isArray(updated) ? updated : []);
      setExpenseDesc('');
      setExpenseAmount('');
    } catch (err: any) {
      setAdminError(err?.message || 'Error al registrar el gasto.');
    }
  };

  const handleRemoveExpense = async (id: string) => {
    try {
      setAdminError('');
      const updated = await deleteExpense(id);
      setExpenses(Array.isArray(updated) ? updated : []);
    } catch (err: any) {
      setAdminError(err?.message || 'Error al eliminar el gasto.');
    }
  };

  const handleSaveBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setAdminError('');
      await saveShopConfig(shopConfig);
      setSavedBanner(true);
      setTimeout(() => setSavedBanner(false), 2500);
    } catch (err: any) {
      setSavedBanner(false);
      setAdminError(err?.message || 'Error al guardar la configuración del local.');
    }
  };

  const safeAppointments = Array.isArray(appointments) ? appointments : [];
  const safeExpenses = Array.isArray(expenses) ? expenses : [];
  const safeBarbers = Array.isArray(barbers) ? barbers : [];

  const filteredAppointments = safeAppointments.filter((apt) => {
    if (apt.status === 'cancelado') return false;
    if (onlyCompleted && apt.status !== 'completado') return false;
    return isWithinPeriod(apt.createdAt, period);
  });

  const filteredExpenses = safeExpenses.filter((exp) =>
    isWithinPeriod(exp.createdAt || exp.date, period)
  );

  // Turnos para la pestaña de Agenda Global del Admin
  const adminAgendaAppointments = safeAppointments.filter((apt) => {
    if (apt.status === 'cancelado') return false;
    if (adminAgendaDate && apt.dateString !== adminAgendaDate) return false;
    if (adminAgendaBarberId !== 'todos' && apt.barberId !== adminAgendaBarberId) return false;
    return true;
  });

  const barberFinancials = safeBarbers.map((barber) => {
    const barberApts = filteredAppointments.filter((apt) => apt.barberId === barber.id);
    const cutsCount = barberApts.length;
    const grossGenerated = barberApts.reduce(
      (sum, apt) => sum + Number(apt.priceSnapshot ?? apt.servicePrice),
      0
    );

    const barberTakeHome = Math.round((grossGenerated * barber.commissionRate) / 100);
    const leftForOwner = grossGenerated - barberTakeHome;

    return {
      barber,
      cutsCount,
      grossGenerated,
      barberTakeHome,
      leftForOwner,
    };
  });

  const grossRevenueTotal = barberFinancials.reduce((sum, b) => sum + b.grossGenerated, 0);
  const ownerOwnCutsRevenue = barberFinancials
    .filter((b) => b.barber.isOwner || b.barber.commissionRate === 100)
    .reduce((sum, b) => sum + b.barberTakeHome, 0);
  const staffCommissionsToPay = barberFinancials
    .filter((b) => !b.barber.isOwner && b.barber.commissionRate < 100)
    .reduce((sum, b) => sum + b.barberTakeHome, 0);
  const ownerShareFromStaff = barberFinancials.reduce((sum, b) => sum + b.leftForOwner, 0);
  const ownerTotalGrossIncome = ownerOwnCutsRevenue + ownerShareFromStaff;
  const totalExpensesAmount = filteredExpenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
  const ownerFinalNetPocket = ownerTotalGrossIncome - totalExpensesAmount;

  const getClientWhatsAppLink = (apt: AppointmentItem) => {
    const rawDigits = apt.clientPhone.replace(/\D/g, '');
    const formattedPhone = rawDigits.startsWith('0')
      ? '598' + rawDigits.slice(1)
      : rawDigits.startsWith('598')
      ? rawDigits
      : '598' + rawDigits;
    const msg = `Hola ${apt.clientName}, te escribimos de ${shopConfig.name} por tu turno de ${apt.serviceName} el día ${apt.dateString} a las ${apt.timeSlot} hs.`;
    return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(msg)}`;
  };

  const bgImage = shopConfig.backgroundImageUrl || DEFAULT_SHOP_CONFIG.backgroundImageUrl;
  const logoImage = shopConfig.logoUrl || DEFAULT_SHOP_CONFIG.logoUrl;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-16 relative">
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <img
          src={bgImage}
          alt="Fondo"
          className="w-full h-full object-cover object-center grayscale opacity-[0.11]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/85 via-zinc-950/75 to-zinc-950/95" />
      </div>

      <div className="relative z-10">
        <header className="sticky top-0 z-30 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/80 px-4 py-3">
          <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center space-x-2.5">
              {logoImage ? (
                <div className="w-9 h-9 rounded-xl overflow-hidden border border-zinc-700 bg-zinc-950 shrink-0">
                  <img src={logoImage} alt={shopConfig.name} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-100 shrink-0">
                  <Scissors className="w-4 h-4" />
                </div>
              )}
              <div>
                <h1 className="font-bold text-sm sm:text-base tracking-tight">
                  {shopConfig.name} • Admin
                </h1>
              </div>
            </div>

            <div className="flex items-center space-x-1.5">
              <Link
                href="/barbero"
                className="px-2.5 py-2 rounded-xl bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 text-zinc-100 text-xs font-semibold flex items-center space-x-1"
              >
                <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Barberos</span>
              </Link>

              <Link
                href="/"
                className="px-2.5 py-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-bold flex items-center space-x-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Web</span>
              </Link>

              <button
                type="button"
                onClick={handleLogout}
                className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-rose-400 text-xs font-medium cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto p-4 space-y-6 pt-5">
          {adminError && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{adminError}</span>
              </div>
              <button
                type="button"
                onClick={() => setAdminError('')}
                className="text-rose-300 hover:text-white text-xs underline cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-1.5 bg-zinc-900/90 p-1.5 rounded-2xl border border-zinc-800 backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setActiveTab('caja')}
              className={`py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'caja'
                  ? 'bg-zinc-100 text-zinc-950 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Caja</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('agenda')}
              className={`py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'agenda'
                  ? 'bg-zinc-100 text-zinc-950 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Agenda</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('turnos')}
              className={`py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'turnos'
                  ? 'bg-zinc-100 text-zinc-950 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Lista ({safeAppointments.filter((a) => a.status !== 'cancelado').length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('barberos')}
              className={`py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'barberos'
                  ? 'bg-zinc-100 text-zinc-950 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Barberos</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('servicios')}
              className={`py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'servicios'
                  ? 'bg-zinc-100 text-zinc-950 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>Servicios</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('marca')}
              className={`py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'marca'
                  ? 'bg-zinc-100 text-zinc-950 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Local</span>
            </button>
          </div>

          {/* VISTA DE CAJA */}
          {activeTab === 'caja' && (
            <div className="space-y-6">
              <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center space-x-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                  {(
                    [
                      { id: 'hoy', label: 'Hoy' },
                      { id: 'semana', label: 'Semana' },
                      { id: 'mes', label: 'Este Mes' },
                    ] as { id: PeriodFilter; label: string }[]
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setPeriod(item.id)}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                        period === item.id
                          ? 'bg-zinc-100 text-zinc-950'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <label className="flex items-center space-x-2 text-xs text-zinc-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={onlyCompleted}
                    onChange={(e) => setOnlyCompleted(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-950"
                  />
                  <span>Solo turnos completados</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 space-y-1">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Facturación Total</span>
                    <TrendingUp className="w-4 h-4 text-zinc-200" />
                  </div>
                  <p className="text-2xl font-extrabold text-white">${grossRevenueTotal}</p>
                  <p className="text-[11px] text-zinc-500">{filteredAppointments.length} turnos</p>
                </div>

                <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 space-y-1">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Pago a Barberos</span>
                    <Users className="w-4 h-4 text-amber-400" />
                  </div>
                  <p className="text-2xl font-extrabold text-amber-400">-${staffCommissionsToPay}</p>
                  <p className="text-[11px] text-zinc-500">Comisiones equipo</p>
                </div>

                <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 space-y-1">
                  <div className="flex items-center justify-between text-xs text-zinc-300 font-semibold">
                    <span>Total Bruto Negocio</span>
                    <Crown className="w-4 h-4 text-emerald-400" />
                  </div>
                  <p className="text-2xl font-extrabold text-emerald-400">${ownerTotalGrossIncome}</p>
                  <p className="text-[11px] text-zinc-400">Propietario + retención</p>
                </div>

                <div
                  className={`border rounded-2xl p-4 space-y-1 ${
                    ownerFinalNetPocket >= 0
                      ? 'bg-emerald-950/30 border-emerald-500/40'
                      : 'bg-rose-950/30 border-rose-500/40'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold text-emerald-300">
                    <span>Neto en Bolsillo</span>
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                  </div>
                  <p
                    className={`text-2xl font-extrabold ${
                      ownerFinalNetPocket >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    ${ownerFinalNetPocket}
                  </p>
                  <p className="text-[11px] text-zinc-400">Gastos: -${totalExpensesAmount}</p>
                </div>
              </div>

              <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 space-y-4">
                <h3 className="font-bold text-base">Liquidación por Barbero</h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                  {barberFinancials.map((item) => {
                    const isOwner = item.barber.isOwner || item.barber.commissionRate === 100;
                    return (
                      <div
                        key={item.barber.id}
                        className="bg-zinc-950/80 border border-zinc-800 rounded-2xl p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                          <div className="flex items-center space-x-2.5">
                            <div className="w-9 h-9 rounded-xl bg-zinc-800 text-zinc-100 flex items-center justify-center font-bold text-sm">
                              {item.barber.name.charAt(0)}
                            </div>
                            <div>
                              <h4 className="font-bold text-sm">{item.barber.name}</h4>
                              <span className="text-[11px] text-zinc-400">
                                Comisión: <strong>{item.barber.commissionRate}%</strong>
                              </span>
                            </div>
                          </div>
                          <span className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-semibold">
                            {item.cutsCount} turnos
                          </span>
                        </div>

                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Total facturado:</span>
                            <span className="font-semibold">${item.grossGenerated}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Cobra barbero:</span>
                            <span className="font-bold text-amber-400">${item.barberTakeHome}</span>
                          </div>
                          <div className="flex justify-between pt-2 border-t border-zinc-800/80">
                            <span className="text-zinc-300 font-medium">Para local:</span>
                            <span className="font-bold text-emerald-400">
                              +${isOwner ? item.barberTakeHome : item.leftForOwner}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 space-y-4">
                <h3 className="font-bold text-base flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-rose-400" />
                  Gastos del Local
                </h3>

                <form onSubmit={handleAddExpense} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                  <input
                    type="text"
                    placeholder="Descripción del gasto..."
                    value={expenseDesc}
                    onChange={(e) => setExpenseDesc(e.target.value)}
                    className="sm:col-span-5 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm outline-none"
                  />
                  <select
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value as ExpenseCategory)}
                    className="sm:col-span-3 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm outline-none text-zinc-200"
                  >
                    <option value="Insumos">Insumos</option>
                    <option value="Alquiler / Servicios">Alquiler / Luz</option>
                    <option value="Adelantos / Sueldos">Adelantos</option>
                    <option value="Otros">Otros</option>
                  </select>
                  <input
                    type="number"
                    placeholder="Monto $"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    className="sm:col-span-2 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm outline-none"
                  />
                  <button
                    type="submit"
                    className="sm:col-span-2 py-2.5 px-4 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-xs cursor-pointer flex items-center justify-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Agregar</span>
                  </button>
                </form>

                <div className="space-y-2">
                  {filteredExpenses.map((exp) => (
                    <div
                      key={exp.id}
                      className="bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-3.5 flex items-center justify-between gap-3"
                    >
                      <div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-800 text-zinc-300 mr-2">
                          {exp.category}
                        </span>
                        <span className="text-sm font-medium text-zinc-200">{exp.description}</span>
                      </div>

                      <div className="flex items-center space-x-3">
                        <span className="font-bold text-sm text-rose-400">-${exp.amount}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveExpense(exp.id)}
                          className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-rose-400 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* NUEVA VISTA: CALENDARIO / AGENDA GLOBAL DEL DUEÑO */}
          {activeTab === 'agenda' && (
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-5 sm:p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
                <div>
                  <h3 className="font-bold text-base flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4 text-emerald-400" />
                    Agenda General de la Barbería
                  </h3>
                  <p className="text-xs text-zinc-400">Controlá los turnos agendados por día y por barbero</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={adminAgendaBarberId}
                    onChange={(e) => setAdminAgendaBarberId(e.target.value)}
                    className="px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 outline-none font-semibold cursor-pointer"
                  >
                    <option value="todos">Todos los barberos</option>
                    {safeBarbers.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={adminAgendaDate}
                    onChange={(e) => setAdminAgendaDate(e.target.value)}
                    className="px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 outline-none font-semibold cursor-pointer"
                  >
                    {days.map((d) => (
                      <option key={d.dateString} value={d.dateString}>
                        {d.dateString}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-3">
                {adminAgendaAppointments.length === 0 ? (
                  <div className="p-12 text-center bg-zinc-950 border border-zinc-800 rounded-2xl space-y-2">
                    <CalendarIcon className="w-8 h-8 text-zinc-600 mx-auto" />
                    <p className="text-xs text-zinc-400 font-medium">
                      No hay turnos agendados para este filtro.
                    </p>
                  </div>
                ) : (
                  adminAgendaAppointments.map((apt) => (
                    <div
                      key={apt.id}
                      className="bg-zinc-950 border border-zinc-800/90 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-zinc-700 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-extrabold text-emerald-400">
                            {apt.dateString} • {apt.timeSlot} hs ({apt.durationMinutes || 60}m)
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
                        <h4 className="font-bold text-sm sm:text-base pt-0.5">
                          {apt.clientName}{' '}
                          <span className="font-normal text-xs text-zinc-400">
                            ({apt.clientPhone})
                          </span>
                        </h4>
                        <p className="text-xs text-zinc-400">
                          Servicio: <strong className="text-zinc-200">{apt.serviceName}</strong> (${apt.priceSnapshot ?? apt.servicePrice}) • Atiende: <strong className="text-zinc-200">{apt.barberName}</strong>
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={getClientWhatsAppLink(apt)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-200 text-xs font-medium flex items-center space-x-1"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                          <span>WhatsApp</span>
                        </a>

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
                  ))
                )}
              </div>
            </div>
          )}

          {/* VISTA DE TURNOS (LISTA) */}
          {activeTab === 'turnos' && (
            <div className="space-y-3">
              {safeAppointments.length === 0 ? (
                <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-10 text-center space-y-2">
                  <CalendarIcon className="w-8 h-8 text-zinc-600 mx-auto" />
                  <h3 className="font-semibold text-sm">Sin turnos agendados</h3>
                </div>
              ) : (
                safeAppointments.map((apt) => (
                  <div
                    key={apt.id}
                    className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="px-2.5 py-0.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-200">
                          {apt.dateString} • {apt.timeSlot} hs ({apt.durationMinutes || 60} min)
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-medium capitalize ${
                            apt.status === 'confirmado'
                              ? 'bg-amber-500/10 text-amber-400'
                              : apt.status === 'completado'
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : 'bg-rose-500/10 text-rose-400 line-through'
                          }`}
                        >
                          {apt.status}
                        </span>
                      </div>

                      <h3 className="font-semibold text-sm sm:text-base pt-1">
                        {apt.clientName}{' '}
                        <span className="text-xs font-normal text-zinc-400">
                          ({apt.clientPhone})
                        </span>
                      </h3>

                      <p className="text-xs text-zinc-400">
                        {apt.serviceName} (${apt.priceSnapshot ?? apt.servicePrice}) •{' '}
                        <strong className="text-zinc-200">{apt.barberName}</strong>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={getClientWhatsAppLink(apt)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 hover:bg-zinc-800 text-zinc-200 text-xs font-medium flex items-center space-x-1.5"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                        <span>WhatsApp</span>
                      </a>

                      {apt.status !== 'completado' && (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(apt.id, 'completado')}
                          className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 text-xs font-semibold flex items-center space-x-1 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Completar</span>
                        </button>
                      )}

                      {apt.status !== 'cancelado' && (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(apt.id, 'cancelado')}
                          className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-rose-400 hover:bg-rose-500/10 text-xs font-medium flex items-center space-x-1 cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Cancelar</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* VISTA DE BARBEROS */}
          {activeTab === 'barberos' && (
            <div className="space-y-5">
              <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 space-y-4">
                <h3 className="font-semibold text-sm flex items-center gap-1.5">
                  <Plus className="w-4 h-4" /> Agregar Barbero
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                  <input
                    type="text"
                    placeholder="Nombre"
                    value={newBarberName}
                    onChange={(e) => setNewBarberName(e.target.value)}
                    className="sm:col-span-6 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm outline-none"
                  />
                  <div className="sm:col-span-2 flex items-center bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2">
                    <Percent className="w-3.5 h-3.5 text-zinc-500 mr-1.5 shrink-0" />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={newBarberCommission}
                      onChange={(e) => setNewBarberCommission(e.target.value)}
                      className="w-full bg-transparent text-sm outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2 flex items-center bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2">
                    <KeyRound className="w-3.5 h-3.5 text-zinc-500 mr-1.5 shrink-0" />
                    <input
                      type="text"
                      maxLength={4}
                      value={newBarberPin}
                      onChange={(e) => setNewBarberPin(e.target.value)}
                      className="w-full bg-transparent text-sm outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddBarber}
                    className="sm:col-span-2 py-2.5 px-3 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-xs cursor-pointer"
                  >
                    Sumar
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {safeBarbers.map((brb) => (
                  <div
                    key={brb.id}
                    className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-11 h-11 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center font-bold text-base text-zinc-100">
                          {brb.name.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-base">{brb.name}</h4>
                            <Link
                              href={`/barbero?perfil=${brb.slug || brb.name.toLowerCase()}`}
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                            >
                              <span>Ver Perfil</span>
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          </div>
                          <p className="text-xs text-zinc-400">Barbero</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5">
                        <div className="flex items-center space-x-1.5 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5">
                          <span className="text-xs text-zinc-400">Comisión:</span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={brb.commissionRate}
                            onChange={(e) =>
                              handleUpdateBarberField(brb.id, 'commissionRate', e.target.value)
                            }
                            className="w-12 bg-transparent font-bold text-amber-400 outline-none text-sm text-right"
                          />
                          <span className="text-xs font-bold text-amber-400">%</span>
                        </div>

                        <div className="flex items-center space-x-1.5 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5">
                          <KeyRound className="w-3.5 h-3.5 text-zinc-400" />
                          <span className="text-xs text-zinc-400">PIN:</span>
                          <input
                            type="text"
                            maxLength={4}
                            value={brb.pin}
                            onChange={(e) => handleUpdateBarberField(brb.id, 'pin', e.target.value)}
                            className="w-12 bg-transparent font-mono font-bold text-zinc-100 outline-none text-sm"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteBarber(brb.id)}
                          className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-rose-400 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-zinc-800/80 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-zinc-400 font-medium">
                          Servicios habilitados para {brb.name}:
                        </p>
                        <button
                          type="button"
                          onClick={() => handleSaveBarberChanges(brb.id)}
                          className="px-3.5 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 hover:bg-emerald-500/25 text-emerald-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>
                            {savingBarberId === brb.id ? '¡Guardado!' : 'Guardar Servicios'}
                          </span>
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {services.map((srv) => {
                          const enabled = (brb.serviceIds || []).includes(srv.id);
                          return (
                            <button
                              key={srv.id}
                              type="button"
                              onClick={() => handleToggleBarberService(brb.id, srv.id)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 cursor-pointer transition-all ${
                                enabled
                                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                                  : 'bg-zinc-950 border-zinc-800 text-zinc-500 line-through'
                              }`}
                            >
                              {enabled && <Check className="w-3 h-3" />}
                              <span>
                                {srv.name} (${srv.price})
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* VISTA DE SERVICIOS */}
          {activeTab === 'servicios' && (
            <div className="space-y-5">
              <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 space-y-3.5">
                <h3 className="font-semibold text-sm flex items-center gap-1.5">
                  <Plus className="w-4 h-4" /> Nuevo servicio
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                  <input
                    type="text"
                    placeholder="Nombre (ej: Corte)"
                    value={newServiceName}
                    onChange={(e) => setNewServiceName(e.target.value)}
                    className="sm:col-span-5 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm outline-none"
                  />
                  <input
                    type="number"
                    placeholder="Precio $"
                    value={newServicePrice}
                    onChange={(e) => setNewServicePrice(e.target.value)}
                    className="sm:col-span-3 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm outline-none"
                  />
                  <input
                    type="number"
                    placeholder="Minutos (ej: 45)"
                    value={newServiceDuration}
                    onChange={(e) => setNewServiceDuration(e.target.value)}
                    className="sm:col-span-2 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddService}
                    className="sm:col-span-2 py-2.5 px-4 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-xs cursor-pointer"
                  >
                    Agregar
                  </button>
                </div>
              </div>

              <div className="space-y-2.5">
                {services.map((srv) => (
                  <div
                    key={srv.id}
                    className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center space-x-3.5">
                      {srv.imageUrl && (
                        <img
                          src={srv.imageUrl}
                          alt={srv.name}
                          className="w-12 h-12 rounded-xl object-cover border border-zinc-800 shrink-0"
                        />
                      )}
                      <div>
                        <h4 className="font-bold text-sm sm:text-base">{srv.name}</h4>
                        <span className="text-[11px] text-zinc-400 flex items-center mt-0.5">
                          <Clock className="w-3 h-3 mr-1" /> Bloquea {srv.durationMinutes} min en agenda
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5">
                        <Clock className="w-3.5 h-3.5 text-zinc-500 mr-1.5" />
                        <input
                          type="number"
                          min={15}
                          step={15}
                          value={srv.durationMinutes}
                          onChange={(e) =>
                            handleUpdateServiceDuration(srv.id, Number(e.target.value))
                          }
                          className="w-12 bg-transparent font-bold text-emerald-400 outline-none text-sm text-right"
                        />
                        <span className="text-xs text-zinc-400 ml-1">min</span>
                      </div>

                      <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5">
                        <span className="text-xs text-zinc-500 mr-1">$</span>
                        <input
                          type="number"
                          value={srv.price}
                          onChange={(e) => handleUpdateServicePrice(srv.id, Number(e.target.value))}
                          className="w-16 bg-transparent font-bold text-zinc-100 outline-none text-sm"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteService(srv.id)}
                        className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* VISTA DE CONFIGURACIÓN DE LOCAL */}
          {activeTab === 'marca' && (
            <form
              onSubmit={handleSaveBrand}
              className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 space-y-5"
            >
              <h3 className="font-semibold text-base">Datos de {shopConfig.name}</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Nombre</label>
                  <input
                    type="text"
                    value={shopConfig.name}
                    onChange={(e) => setShopConfig({ ...shopConfig, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Dirección</label>
                  <input
                    type="text"
                    value={shopConfig.address}
                    onChange={(e) => setShopConfig({ ...shopConfig, address: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5" />
                    Foto de Portada / Fondo (URL)
                  </label>
                  <input
                    type="url"
                    value={shopConfig.backgroundImageUrl || ''}
                    onChange={(e) =>
                      setShopConfig({
                        ...shopConfig,
                        backgroundImageUrl: e.target.value,
                        coverImageUrl: e.target.value,
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                {savedBanner ? (
                  <span className="text-xs text-emerald-400 font-medium flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Guardado
                  </span>
                ) : (
                  <span />
                )}

                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-xs cursor-pointer"
                >
                  Guardar cambios
                </button>
              </div>
            </form>
          )}
        </main>
      </div>
    </div>
  );
}