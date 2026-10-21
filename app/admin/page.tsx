// app/admin/page.tsx
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
  ShieldCheck,
  Lock,
  Coins,
  BarChart3,
} from 'lucide-react';
import {
  ServiceItem,
  BarberItem,
  AppointmentItem,
  ExpenseItem,
  ExpenseCategory,
  TipItem,
  ManualChargeItem,
  ShopConfig,
  DEFAULT_SHOP_CONFIG,
  SHOP_UUID,
  generateUUID,
  saveServices,
  deleteServiceFromDb,
  getAdminBarbers,
  getAdminDashboardSnapshot,
  getMontevideoDateKey,
  saveBarbers,
  deleteBarberFromDb,
  updateAppointmentStatus,
  createExpense,
  deleteExpense,
  createTip,
  deleteTip,
  createManualCharge,
  deleteManualCharge,
  saveShopConfig,
  buildRealOpenDays,
  sortAppointmentsChronologically,
  canCompleteAppointment,
  DayOption,
} from '@/lib/booking-store';
import { InitialShopSkeleton, InitialShopError } from '@/components/InitialShopState';
import { splitBusinessRevenue } from '@/lib/financial-allocations';

type PeriodFilter = 'hoy' | 'semana' | 'mes';

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

function isWithinPeriod(
  isoOrDateStr: string,
  period: PeriodFilter,
  selectedMonthYear: string
): boolean {
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
    const [selYear, selMonth] = selectedMonthYear.split('-').map(Number);
    if (!selYear || !selMonth) {
      return (
        target.getFullYear() === now.getFullYear() &&
        target.getMonth() === now.getMonth()
      );
    }
    return (
      target.getFullYear() === selYear &&
      target.getMonth() + 1 === selMonth
    );
  }
  return true;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<
    'caja' | 'facturacion' | 'agenda' | 'turnos' | 'barberos' | 'servicios' | 'marca'
  >('caja');

  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [barbers, setBarbers] = useState<BarberItem[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [tips, setTips] = useState<TipItem[]>([]);
  const [manualCharges, setManualCharges] = useState<ManualChargeItem[]>([]);
  const [shopConfig, setShopConfig] = useState<ShopConfig>(DEFAULT_SHOP_CONFIG);
  const [days, setDays] = useState<DayOption[]>([]);
  const [savedBanner, setSavedBanner] = useState(false);
  const [savingBarberId, setSavingBarberId] = useState<string | null>(null);
  const [adminError, setAdminError] = useState<string>('');
  const [initialLoad, setInitialLoad] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadingTooLong, setLoadingTooLong] = useState(false);

  const [cashStatus, setCashStatus] = useState<'abierta' | 'cerrada'>('cerrada');
  const [lastClosedDate, setLastClosedDate] = useState<string>('');
  const [blockedBarbers, setBlockedBarbers] = useState<Record<string, boolean>>({});

  const availableMonths = getRecentMonths(12);
  const [period, setPeriod] = useState<PeriodFilter>('mes');
  const [selectedMonth, setSelectedMonth] = useState<string>(availableMonths[0].value);

  const [auditDate, setAuditDate] = useState<string>(getMontevideoDateKey());
  const [auditBarberId, setAuditBarberId] = useState<string>('todos');

  const [adminAgendaDate, setAdminAgendaDate] = useState<string>('');
  const [adminAgendaBarberId, setAdminAgendaBarberId] = useState<string>('todos');

  const [newServiceName, setNewServiceName] = useState('');
  const [newServicePrice, setNewServicePrice] = useState('');
  const [newServiceDuration, setNewServiceDuration] = useState('60');

  const [newBarberName, setNewBarberName] = useState('');
  const [newBarberCommission, setNewBarberCommission] = useState('50');
  const [newBarberIsOwner, setNewBarberIsOwner] = useState(false);
  const [newBarberPin, setNewBarberPin] = useState('');
  const [barberPinDrafts, setBarberPinDrafts] = useState<Record<string, string>>({});

  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>('Insumos');
  const [expenseFeedback, setExpenseFeedback] = useState<{kind: 'error' | 'success'; message: string} | null>(null);
  const [savingExpense, setSavingExpense] = useState(false);

  const [tipBarberId, setTipBarberId] = useState<string>('');
  const [tipAmount, setTipAmount] = useState<string>('');
  const [tipNote, setTipNote] = useState<string>('');

  const [chargeBarberId, setChargeBarberId] = useState<string>('');
  const [chargeAmount, setChargeAmount] = useState<string>('');
  const [chargeNote, setChargeNote] = useState<string>('');

  const checkBarberLocks = (brbs: BarberItem[]) => {
    const locks: Record<string, boolean> = {};
    brbs.forEach((b) => {
      const lockUntil = Number(localStorage.getItem(`pin_lock_${b.id}`) || '0');
      locks[b.id] = lockUntil > Date.now();
    });
    setBlockedBarbers(locks);
  };

  useEffect(() => {
    if (initialLoad !== 'loading') return;
    const timer = window.setTimeout(() => setLoadingTooLong(true), 6000);
    return () => window.clearTimeout(timer);
  }, [initialLoad]);

  useEffect(() => {
    async function loadAdminData() {
      try {
        setAdminError('');
        const snapshot = await getAdminDashboardSnapshot();
        const freshConfig = snapshot.config || DEFAULT_SHOP_CONFIG;
        const openDays = buildRealOpenDays(30, freshConfig.schedule);
        setDays(openDays);
        if (openDays.length > 0) {
          setAdminAgendaDate(openDays[0].dateString);
        }

        const freshBarbers = snapshot.barbers;
        if (freshBarbers.length > 0) {
          setTipBarberId(freshBarbers[0].id);
          setChargeBarberId(freshBarbers[0].id);
        }

        setCashStatus(snapshot.cashStatus);
        setLastClosedDate(snapshot.lastClosedDate);
        setAppointments(sortAppointmentsChronologically(snapshot.appointments));
        setServices(snapshot.services);
        setBarbers(freshBarbers);
        setExpenses(snapshot.expenses);
        setTips(snapshot.tips);
        setManualCharges(snapshot.manualCharges);
        setShopConfig(freshConfig);

        checkBarberLocks(freshBarbers);
        setInitialLoad('ready');
      } catch (err: any) {
        console.error('Error cargando panel de admin:', err);
        setAdminError(err?.message || 'Error al cargar los datos del panel administrativo.');
        setInitialLoad('error');
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
      await updateAppointmentStatus(id, status);
      // La API confirmó el cambio: modificar solo el turno afectado.
      setAppointments((current) => current.map((appointment) =>
        appointment.id === id ? {...appointment, status} : appointment
      ));
    } catch (err: any) {
      setAdminError(err?.message || 'No se pudo actualizar el estado del turno.');
    }
  };

  const handleUnblockBarberPin = async (barberId: string, barberName: string) => {
    try {
      // Solo la API administrativa, con cookie firmada, puede desbloquear un PIN.
      const response = await fetch('/api/admin', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({operation: 'UNBLOCK_BARBER_PIN', barberId}),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'No se pudo desbloquear el PIN.');
      }

      localStorage.removeItem(`pin_lock_${barberId}`);
      localStorage.removeItem(`pin_attempts_${barberId}`);
      setBlockedBarbers((prev) => ({ ...prev, [barberId]: false }));

      alert(`¡Listo! El acceso por PIN para ${barberName} fue desbloqueado correctamente.`);
    } catch (err: any) {
      alert(err?.message || 'No se pudo desbloquear al barbero.');
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
    const cleanPin = newBarberPin.trim();
    if (!/^\d{4,6}$/.test(cleanPin) || cleanPin === '1234') {
      setAdminError('Definí un PIN de 4 a 6 dígitos, distinto de 1234.');
      return;
    }
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
      role: 'Barbero Profesional',
      bio: '',
      specialties: ['Fade', 'Corte Clásico'],
      serviceIds: services.map((s) => s.id),
      isOwner: newBarberIsOwner,
      active: true,
      commissionRate: rate,
      pin: cleanPin,
    };

    const previous = barbers;
    const updated = [...barbers, newItem];
    
    try {
      setAdminError('');
      // Guardamos directamente en la base de datos a través de la función del store
      await saveBarbers(updated);
      
      // Recargamos la lista oficial de la base de datos
      const freshBarbers = await getAdminBarbers(true);
      const finalBarbers = Array.isArray(freshBarbers) && freshBarbers.length > 0 ? freshBarbers : updated;
      
      setBarbers(finalBarbers);
      
      if (!tipBarberId && finalBarbers.length > 0) {
        setTipBarberId(finalBarbers[0].id);
        setChargeBarberId(finalBarbers[0].id);
      }
      
      checkBarberLocks(finalBarbers);
      setNewBarberName('');
      setNewBarberCommission('50');
      setNewBarberIsOwner(false);
      setNewBarberPin('');
      
      alert(`¡Barbero ${newItem.name} agregado con éxito!`);
    } catch (err: any) {
      setBarbers(previous);
      console.error('Error al agregar barbero:', err);
      setAdminError(err?.message || 'Error al agregar el barbero en la base de datos.');
    }
  };

  const handleUpdateBarberField = async (
    id: string,
    field: 'commissionRate' | 'pin' | 'isOwner',
    value: number | string | boolean
  ) => {
    const previous = barbers;
    const updated = barbers.map((b) => {
      if (b.id !== id) return b;
      if (field === 'commissionRate') {
        const rate = Math.min(100, Math.max(0, Number(value) || 0));
        return { ...b, commissionRate: rate };
      }
      if (field === 'isOwner') return { ...b, isOwner: value === true };
      return { ...b, pin: String(value).trim() };
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

  const handleBarberPinBlur = (id: string, currentPin: string) => {
    const candidate = barberPinDrafts[id];
    if (candidate === undefined) return;
    if (candidate === currentPin) {
      setBarberPinDrafts((prev) => {
        const next = {...prev};
        delete next[id];
        return next;
      });
      return;
    }
    if (!/^\d{4,6}$/.test(candidate) || candidate === '1234') {
      setAdminError('El PIN debe tener de 4 a 6 dígitos y no puede ser 1234.');
      return; // Mantener el borrador visible, sin guardar un PIN incompleto.
    }
    void handleUpdateBarberField(id, 'pin', candidate);
    setBarberPinDrafts((prev) => {
      const next = {...prev};
      delete next[id];
      return next;
    });
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
    if (savingExpense) return;

    setExpenseFeedback(null);
    const description = expenseDesc.trim();
    const amount = Number(expenseAmount);

    if (!description || !expenseAmount.trim() || !Number.isFinite(amount) || amount <= 0) {
      setExpenseFeedback({kind: 'error', message: 'Ingresá una descripción y un monto mayor a $0.'});
      return;
    }

    setSavingExpense(true);
    try {
      setAdminError('');
      const updated = await createExpense({
        description,
        amount,
        category: expenseCategory,
        date: new Date().toISOString().split('T')[0],
      });
      setExpenses(Array.isArray(updated) ? updated : []);
      setExpenseDesc('');
      setExpenseAmount('');
      setExpenseFeedback({kind: 'success', message: 'Gasto registrado correctamente.'});
    } catch (err: any) {
      setExpenseFeedback({kind: 'error', message: err?.message || 'No se pudo registrar el gasto.'});
    } finally {
      setSavingExpense(false);
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

  const handleAddTipAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tipBarberId || !tipAmount || Number(tipAmount) <= 0) return;
    try {
      setAdminError('');
      const updated = await createTip({
        barberId: tipBarberId,
        amount: Number(tipAmount),
        note: tipNote.trim() || 'Agregada por Admin',
      });
      setTips(Array.isArray(updated) ? updated : []);
      setTipAmount('');
      setTipNote('');
    } catch (err: any) {
      setAdminError(err?.message || 'Error al registrar la propina.');
    }
  };

  const handleRemoveTipAdmin = async (id: string) => {
    try {
      setAdminError('');
      const updated = await deleteTip(id);
      setTips(Array.isArray(updated) ? updated : []);
    } catch (err: any) {
      setAdminError(err?.message || 'Error al eliminar la propina.');
    }
  };

  const handleAddChargeAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chargeBarberId || !chargeAmount || Number(chargeAmount) <= 0) return;
    try {
      setAdminError('');
      const updated = await createManualCharge({
        barberId: chargeBarberId,
        amount: Number(chargeAmount),
        note: chargeNote.trim() || 'Cobro manual extra',
      });
      setManualCharges(Array.isArray(updated) ? updated : []);
      setChargeAmount('');
      setChargeNote('');
    } catch (err: any) {
      setAdminError(err?.message || 'Error al registrar el cobro manual.');
    }
  };

  const handleRemoveChargeAdmin = async (id: string) => {
    try {
      setAdminError('');
      const updated = await deleteManualCharge(id);
      setManualCharges(Array.isArray(updated) ? updated : []);
    } catch (err: any) {
      setAdminError(err?.message || 'Error al eliminar el cobro manual.');
    }
  };

  const handleSaveBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setAdminError('');
      const configToSave: ShopConfig = {
        ...shopConfig,
        name: shopConfig.name.trim(),
        phone: shopConfig.phone.trim(),
        address: shopConfig.address.trim(),
        city: shopConfig.city ? shopConfig.city.trim() : 'Montevideo',
        schedule: shopConfig.schedule || DEFAULT_SHOP_CONFIG.schedule,
      };
      await saveShopConfig(configToSave);
      setDays(buildRealOpenDays(30, configToSave.schedule));
      setSavedBanner(true);
      setTimeout(() => setSavedBanner(false), 2500);
    } catch (err: any) {
      setSavedBanner(false);
      setAdminError(err?.message || 'Error al guardar la configuración del local.');
    }
  };

  const safeAppointments = sortAppointmentsChronologically(
    Array.isArray(appointments) ? appointments : []
  );
  const safeExpenses = Array.isArray(expenses) ? expenses : [];
  const safeTips = Array.isArray(tips) ? tips : [];
  const safeManualCharges = Array.isArray(manualCharges) ? manualCharges : [];
  const safeBarbers = Array.isArray(barbers) ? barbers : [];

  const filteredAppointments = safeAppointments.filter((apt) => {
    if (apt.status !== 'completado') return false;
    return isWithinPeriod(apt.completedAt || apt.createdAt, period, selectedMonth);
  });

  const filteredExpenses = safeExpenses.filter((exp) =>
    isWithinPeriod(exp.createdAt || exp.date, period, selectedMonth)
  );

  const filteredTips = safeTips.filter((t) =>
    isWithinPeriod(t.createdAt, period, selectedMonth)
  );

  const filteredManualCharges = safeManualCharges.filter((c) => {
    return isWithinPeriod(c.createdAt, period, selectedMonth);
  });

  const auditedAppointments = safeAppointments.filter((apt) => {
    if (apt.status !== 'completado') return false;
    if (auditDate) {
      const aptDate = getMontevideoDateKey(apt.completedAt || apt.createdAt);
      if (aptDate !== auditDate) return false;
    }
    if (auditBarberId !== 'todos' && apt.barberId !== auditBarberId) return false;
    return true;
  });

  const auditedManualCharges = safeManualCharges.filter((c) => {
    if (auditDate) {
      const cDate = getMontevideoDateKey(c.createdAt);
      if (cDate !== auditDate) return false;
    }
    if (auditBarberId !== 'todos' && c.barberId !== auditBarberId) return false;
    return true;
  });

  const auditedTips = safeTips.filter((t) => {
    if (auditDate) {
      const tDate = getMontevideoDateKey(t.createdAt);
      if (tDate !== auditDate) return false;
    }
    if (auditBarberId !== 'todos' && t.barberId !== auditBarberId) return false;
    return true;
  });

  const auditedExpenses = safeExpenses.filter((e) => {
    if (auditDate) {
      const eDate = (e.createdAt ? getMontevideoDateKey(e.createdAt) : e.date);
      if (eDate !== auditDate) return false;
    }
    return true;
  });

  const auditedGrossTotal = 
    auditedAppointments.reduce((sum, a) => sum + Number(a.priceSnapshot ?? a.servicePrice), 0) +
    auditedManualCharges.reduce((sum, c) => sum + Number(c.amount), 0);

  const auditedTipsTotal = auditedTips.reduce((sum, t) => sum + Number(t.amount), 0);
  const auditedExpensesTotal = auditedExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

  const auditedBarbersBreakdown = safeBarbers
    .filter((b) => auditBarberId === 'todos' || b.id === auditBarberId)
    .map((barber) => {
      const brbApts = auditedAppointments.filter((a) => a.barberId === barber.id);
      const brbCharges = auditedManualCharges.filter((c) => c.barberId === barber.id);
      const brbTips = auditedTips.filter((t) => t.barberId === barber.id);

      const cutsGen = brbApts.reduce((sum, a) => sum + Number(a.priceSnapshot ?? a.servicePrice), 0);
      const manualGen = brbCharges.reduce((sum, c) => sum + Number(c.amount), 0);
      const totalGen = cutsGen + manualGen;
      const commissionEarned = brbApts.reduce((sum, a) => sum + splitBusinessRevenue(Number(a.priceSnapshot ?? a.servicePrice), barber, a).barber, 0) +
        brbCharges.reduce((sum, c) => sum + splitBusinessRevenue(Number(c.amount), barber, c).barber, 0);
      const tipsEarned = brbTips.reduce((sum, t) => sum + Number(t.amount), 0);

      return {
        barber,
        cutsCount: brbApts.length,
        totalGen,
        commissionEarned,
        tipsEarned,
      };
    });

  const adminAgendaAppointments = safeAppointments.filter((apt) => {
    if (apt.status === 'cancelado') return false;
    if (adminAgendaDate && apt.dateString !== adminAgendaDate) return false;
    if (adminAgendaBarberId !== 'todos' && apt.barberId !== adminAgendaBarberId) return false;
    return true;
  });

  const barberFinancials = safeBarbers.map((barber) => {
    const barberApts = filteredAppointments.filter((apt) => apt.barberId === barber.id);
    const cutsCount = barberApts.length;
    
    const grossFromAppointments = barberApts.reduce(
      (sum, apt) => sum + Number(apt.priceSnapshot ?? apt.servicePrice),
      0
    );

    const barberManualChargesTotal = filteredManualCharges
      .filter((c) => c.barberId === barber.id)
      .reduce((sum, c) => sum + Number(c.amount), 0);

    const grossGenerated = grossFromAppointments + barberManualChargesTotal;

    const allocated = [
      ...barberApts.map(a => splitBusinessRevenue(Number(a.priceSnapshot ?? a.servicePrice), barber, a)),
      ...filteredManualCharges.filter(c => c.barberId === barber.id).map(c => splitBusinessRevenue(Number(c.amount), barber, c)),
    ];
    const barberTakeHome = allocated.reduce((sum, row) => sum + row.barber, 0);
    const leftForOwner = allocated.reduce((sum, row) => sum + row.business, 0);

    const barberTipsTotal = filteredTips
      .filter((t) => t.barberId === barber.id)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    return {
      barber,
      cutsCount,
      grossGenerated,
      barberTakeHome,
      leftForOwner,
      barberTipsTotal,
      barberManualChargesTotal,
    };
  });

  const totalGrossAppointments = barberFinancials.reduce((sum, b) => sum + (b.grossGenerated - b.barberManualChargesTotal), 0);
  const totalManualChargesAll = filteredManualCharges.reduce((sum, c) => sum + Number(c.amount), 0);
  const grossRevenueTotal = totalGrossAppointments + totalManualChargesAll;

  const staffCommissionsToPay = barberFinancials.reduce((sum, b) => sum + b.barberTakeHome, 0);
  const ownerTotalGrossIncome = barberFinancials.reduce((sum, b) => sum + b.leftForOwner, 0);
  const totalExpensesAmount = filteredExpenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
  const ownerFinalNetPocket = ownerTotalGrossIncome - totalExpensesAmount;

  const getClientWhatsAppLink = (apt: AppointmentItem) => {
    const rawDigits = (apt.clientPhone || '098509376').replace(/\D/g, '');
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

  const todayStr = getMontevideoDateKey();
  const isTodayClosed = cashStatus === 'cerrada' && lastClosedDate === todayStr;

  if (initialLoad === 'loading') {
    return (
      <>
        <InitialShopSkeleton variant="admin" label="Cargando agenda, barberos y caja..." />
        {loadingTooLong && (
          <div role="status" className="fixed z-50 bottom-24 sm:bottom-6 left-4 right-4 mx-auto max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-4 shadow-xl flex items-center justify-between gap-3">
            <p className="text-sm text-zinc-300">La carga está demorando más de lo normal.</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="shrink-0 bg-zinc-100 text-zinc-950 text-xs font-semibold px-3 py-2 rounded-xl"
            >
              Reintentar
            </button>
          </div>
        )}
      </>
    );
  }
  if (initialLoad === 'error') {
    return <InitialShopError label={adminError || 'No se pudieron cargar los datos del administrador. Intentá de nuevo.'} />;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-28 sm:pb-16 relative">
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {bgImage ? (
          <img
            src={bgImage}
            alt="Fondo"
            className="w-full h-full object-cover object-center grayscale opacity-[0.11]"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/85 via-zinc-950/75 to-zinc-950/95" />
      </div>

      <div className="relative z-10">
        <header className="sticky top-0 z-30 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/80 px-4 pt-[max(0.75rem,calc(env(safe-area-inset-top)+0.5rem))] pb-3">
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
                prefetch={true}
                className="px-2.5 py-2 rounded-xl bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 active:scale-95 transition-transform text-zinc-100 text-xs font-semibold flex items-center space-x-1 touch-manipulation"
              >
                <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Barberos</span>
              </Link>

              <Link
                href="/"
                prefetch={true}
                className="px-3 py-2 rounded-xl bg-zinc-100 hover:bg-white active:scale-95 transition-transform text-zinc-950 text-xs font-bold flex items-center space-x-1 touch-manipulation"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Inicio</span>
              </Link>

              <button
                type="button"
                onClick={handleLogout}
                className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-rose-400 text-xs font-medium cursor-pointer touch-manipulation active:scale-95"
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

          <div className="grid grid-cols-2 sm:grid-cols-7 gap-1.5 bg-zinc-900/90 p-1.5 rounded-2xl border border-zinc-800 backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setActiveTab('caja')}
              className={`py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 touch-manipulation ${
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
              onClick={() => setActiveTab('facturacion')}
              className={`py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 touch-manipulation ${
                activeTab === 'facturacion'
                  ? 'bg-zinc-100 text-zinc-950 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Facturación</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('agenda')}
              className={`py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 touch-manipulation ${
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
              className={`py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 touch-manipulation ${
                activeTab === 'turnos'
                  ? 'bg-zinc-100 text-zinc-950 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Lista</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('barberos')}
              className={`py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 touch-manipulation ${
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
              className={`py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 touch-manipulation ${
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
              className={`py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 touch-manipulation ${
                activeTab === 'marca'
                  ? 'bg-zinc-100 text-zinc-950 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Local</span>
            </button>
          </div>

          {activeTab === 'caja' && (
            <div className="space-y-6">
              {cashStatus !== 'abierta' && (
                <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                  La caja está cerrada. Podés consultar el historial, pero no agregar ni borrar gastos, propinas o cobros manuales hasta abrir la próxima caja.
                </div>
              )}
              <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-bold text-base flex items-center gap-2">
                      <Wallet className="w-5 h-5 text-emerald-400" />
                      Estado de Caja: <span className={cashStatus === 'abierta' ? 'text-emerald-400 uppercase' : 'text-rose-400 uppercase'}>{cashStatus}</span>
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1">
                      {isTodayClosed 
                        ? 'La caja de hoy ya fue cerrada. El sistema se abrirá automáticamente para la próxima jornada.'
                        : 'Controlá la apertura y el cierre diario de la caja de la barbería.'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {!isTodayClosed && cashStatus === 'cerrada' && (
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await fetch('/api/admin', {
                            method: 'POST', headers: {'Content-Type':'application/json'},
                            body: JSON.stringify({operation:'OPEN_CASH', initialAmount:0}),
                          });
                          if (!res.ok) {
                            const payload = await res.json().catch(() => ({}));
                            alert(payload.error || 'No se pudo abrir la caja.');
                            return;
                          }
                          setCashStatus('abierta');
                          alert('¡Caja abierta con éxito!');
                        }}
                        className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs cursor-pointer"
                      >
                        🟢 Abrir Caja
                      </button>
                    )}

                    {cashStatus === 'abierta' && (
                      <button
                        type="button"
                        onClick={async () => {
                          const todayIso = new Date().toISOString();
                          const res = await fetch('/api/admin', {
                            method: 'POST', headers: {'Content-Type':'application/json'},
                            body: JSON.stringify({operation:'CLOSE_CASH'}),
                          });
                          if (!res.ok) {
                            const payload = await res.json().catch(() => ({}));
                            alert(payload.error || 'No se pudo cerrar la caja.');
                            return;
                          }
                          const payload = await res.json();
                          setCashStatus('cerrada');
                          setLastClosedDate(getMontevideoDateKey(todayIso));
                          const closing = payload.summary;
                          alert(`¡Caja cerrada! Facturación: ${closing.grossSales}. Comisiones: ${closing.barberCommissions}. Gastos: ${closing.expenses}. Fondo común neto: ${closing.fundNet}.`);
                        }}
                        className="px-4 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs cursor-pointer"
                      >
                        🔴 Cerrar Caja (Corte Diario)
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-5 sm:p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
                  <div>
                    <h3 className="font-bold text-base flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-emerald-400" />
                      Auditoría Diaria por Barbero o Total
                    </h3>
                    <p className="text-xs text-zinc-400">Seleccioná un barbero o la vista general y elegí la fecha a consultar.</p>
                  </div>

                  <input
                    type="date"
                    value={auditDate}
                    onChange={(e) => setAuditDate(e.target.value)}
                    className="px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-700 text-xs font-bold text-emerald-400 outline-none cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setAuditBarberId('todos')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center space-x-2.5 ${
                      auditBarberId === 'todos'
                        ? 'bg-zinc-100 text-zinc-950 border-white font-bold shadow-md'
                        : 'bg-zinc-950/80 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${auditBarberId === 'todos' ? 'bg-zinc-950 text-white' : 'bg-zinc-800 text-zinc-200'}`}>
                      ⚡
                    </div>
                    <span className="text-xs truncate">Todos (Total)</span>
                  </button>

                  {safeBarbers.map((b) => {
                    const isSelected = auditBarberId === b.id;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setAuditBarberId(b.id)}
                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center space-x-2.5 ${
                          isSelected
                            ? 'bg-zinc-100 text-zinc-950 border-white font-bold shadow-md'
                            : 'bg-zinc-950/80 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                        }`}
                      >
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${isSelected ? 'bg-zinc-950 text-white' : 'bg-zinc-800 text-zinc-200'}`}>
                          {b.name.charAt(0)}
                        </div>
                        <span className="text-xs truncate">{b.name}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-1">
                    <span className="text-xs text-zinc-400">Facturación Generada</span>
                    <p className="text-2xl font-extrabold text-emerald-400">${auditedGrossTotal}</p>
                    <span className="text-[11px] text-zinc-500">{auditedAppointments.length} turnos + {auditedManualCharges.length} extras</span>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-1">
                    <span className="text-xs text-zinc-400">Propinas Registradas</span>
                    <p className="text-2xl font-extrabold text-amber-400">+${auditedTipsTotal}</p>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-1">
                    <span className="text-xs text-zinc-400">Gastos del Día</span>
                    <p className="text-2xl font-extrabold text-rose-400">-${auditedExpensesTotal}</p>
                  </div>
                </div>

                {auditBarberId === 'todos' && auditedBarbersBreakdown.length > 0 && (
                  <div className="pt-2 space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Desglose por Barbero en esta fecha:</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {auditedBarbersBreakdown.map((item) => (
                        <div key={item.barber.id} className="bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-3 space-y-1 text-xs">
                          <div className="flex justify-between font-bold text-sm text-zinc-100">
                            <span>{item.barber.name}</span>
                            <span className="text-emerald-400">${item.totalGen}</span>
                          </div>
                          <p className="text-zinc-400">{item.cutsCount} cortes • {item.barber.isOwner ? 'Dueño: 100% al fondo común' : 'Comisiones'}: <strong className="text-zinc-200">${item.commissionEarned}</strong></p>
                          {item.tipsEarned > 0 && <p className="text-amber-400 font-medium">Propinas: +${item.tipsEarned}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 space-y-4">
                <div>
                  <h3 className="font-bold text-base flex items-center gap-2">
                    <Coins className="w-4 h-4 text-emerald-400" />
                    Ingresar Cobros Manuales / Cortes Extra
                  </h3>
                </div>

                <form onSubmit={handleAddChargeAdmin} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                  <select
                    value={chargeBarberId}
                    onChange={(e) => setChargeBarberId(e.target.value)}
                    className="sm:col-span-3 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-base sm:text-sm outline-none text-zinc-200 font-semibold"
                  >
                    {safeBarbers.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    placeholder="Monto $"
                    value={chargeAmount}
                    onChange={(e) => setChargeAmount(e.target.value)}
                    className="sm:col-span-3 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-base sm:text-sm outline-none"
                  />

                  <input
                    type="text"
                    placeholder="Nota..."
                    value={chargeNote}
                    onChange={(e) => setChargeNote(e.target.value)}
                    className="sm:col-span-4 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-base sm:text-sm outline-none"
                  />

                  <button
                    type="submit"
                    disabled={cashStatus !== 'abierta'}
                    className="sm:col-span-2 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs cursor-pointer flex items-center justify-center gap-1 touch-manipulation disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Registrar</span>
                  </button>
                </form>

                <div className="space-y-2">
                  {filteredManualCharges.length === 0 ? (
                    <p className="text-xs text-zinc-500 italic py-2">
                      No hay cobros manuales registrados en este período.
                    </p>
                  ) : (
                    filteredManualCharges.map((chg) => {
                      const brbName =
                        safeBarbers.find((b) => b.id === chg.barberId)?.name || 'Barbero';
                      return (
                        <div
                          key={chg.id}
                          className="bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-3 flex items-center justify-between gap-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              {brbName}
                            </span>
                            <span className="text-xs text-zinc-400">{chg.dateString}</span>
                            {chg.note && (
                              <span className="text-xs text-zinc-300 font-medium">• {chg.note}</span>
                            )}
                          </div>

                          <div className="flex items-center space-x-3">
                            <span className="font-bold text-sm text-emerald-400">+${chg.amount}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveChargeAdmin(chg.id)}
                              disabled={cashStatus !== 'abierta'}
                              className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-rose-400 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 space-y-4">
                <h3 className="font-bold text-base flex items-center gap-2">
                  <Coins className="w-4 h-4 text-emerald-400" />
                  Propinas del Equipo
                </h3>

                <form onSubmit={handleAddTipAdmin} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                  <select
                    value={tipBarberId}
                    onChange={(e) => setTipBarberId(e.target.value)}
                    className="sm:col-span-3 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-base sm:text-sm outline-none text-zinc-200 font-semibold"
                  >
                    {safeBarbers.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    placeholder="Monto propina $"
                    value={tipAmount}
                    onChange={(e) => setTipAmount(e.target.value)}
                    className="sm:col-span-3 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-base sm:text-sm outline-none"
                  />

                  <input
                    type="text"
                    placeholder="Nota opcional..."
                    value={tipNote}
                    onChange={(e) => setTipNote(e.target.value)}
                    className="sm:col-span-4 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-base sm:text-sm outline-none"
                  />

                  <button
                    type="submit"
                    disabled={cashStatus !== 'abierta'}
                    className="sm:col-span-2 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs cursor-pointer flex items-center justify-center gap-1 touch-manipulation disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Sumar</span>
                  </button>
                </form>

                <div className="space-y-2">
                  {filteredTips.length === 0 ? (
                    <p className="text-xs text-zinc-500 italic py-2">
                      No hay propinas registradas en este período.
                    </p>
                  ) : (
                    filteredTips.map((tp) => {
                      const brbName =
                        tp.barberName ||
                        safeBarbers.find((b) => b.id === tp.barberId)?.name ||
                        'Barbero';
                      return (
                        <div
                          key={tp.id}
                          className="bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-3 flex items-center justify-between gap-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              {brbName}
                            </span>
                            <span className="text-xs text-zinc-400">{tp.dateString}</span>
                            {tp.note && (
                              <span className="text-xs text-zinc-300 font-medium">• {tp.note}</span>
                            )}
                          </div>

                          <div className="flex items-center space-x-3">
                            <span className="font-bold text-sm text-emerald-400">+${tp.amount}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveTipAdmin(tp.id)}
                              disabled={cashStatus !== 'abierta'}
                              className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-rose-400 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 space-y-4">
                <h3 className="font-bold text-base flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-rose-400" />
                  Gastos del Local
                </h3>

                <form onSubmit={handleAddExpense} noValidate className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                  <input
                    type="text"
                    placeholder="Descripción del gasto..."
                    value={expenseDesc}
                    onChange={(e) => setExpenseDesc(e.target.value)}
                    className="sm:col-span-5 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-base sm:text-sm outline-none"
                  />
                  <select
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value as ExpenseCategory)}
                    className="sm:col-span-3 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-base sm:text-sm outline-none text-zinc-200"
                  >
                    <option value="Insumos">Insumos</option>
                    <option value="Alquiler / Servicios">Alquiler / Luz</option>
                    <option value="Adelantos / Sueldos">Adelantos</option>
                    <option value="Otros">Otros</option>
                  </select>
                  <input
                    type="number"
                    placeholder="Monto $"
                    min="0.01"
                    step="0.01"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    className="sm:col-span-2 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-base sm:text-sm outline-none"
                  />
                  <button
                    type="submit"
                    disabled={savingExpense || cashStatus !== 'abierta'}
                    className="sm:col-span-2 py-2.5 px-4 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-xs cursor-pointer flex items-center justify-center gap-1 touch-manipulation disabled:opacity-50 disabled:cursor-wait"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{savingExpense ? 'Guardando...' : 'Agregar'}</span>
                  </button>
                </form>
                {expenseFeedback && (
                  <p
                    role={expenseFeedback.kind === 'error' ? 'alert' : 'status'}
                    className={expenseFeedback.kind === 'error'
                      ? 'text-xs text-rose-400'
                      : 'text-xs text-emerald-400'}
                  >
                    {expenseFeedback.message}
                  </p>
                )}

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
                          disabled={cashStatus !== 'abierta'}
                          className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-rose-400 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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

          {activeTab === 'facturacion' && (
            <div className="space-y-6">
              <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center space-x-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                    {(
                      [
                        { id: 'hoy', label: 'Hoy' },
                        { id: 'semana', label: 'Semana' },
                        { id: 'mes', label: 'Por Mes' },
                      ] as { id: PeriodFilter; label: string }[]
                    ).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setPeriod(item.id)}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer touch-manipulation ${
                          period === item.id
                            ? 'bg-zinc-100 text-zinc-950'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>

                  {period === 'mes' && (
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-700 text-xs font-bold text-emerald-400 outline-none cursor-pointer"
                    >
                      {availableMonths.map((m) => (
                        <option key={m.value} value={m.value}>
                          📅 {m.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 space-y-1">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Facturación Total</span>
                    <TrendingUp className="w-4 h-4 text-zinc-200" />
                  </div>
                  <p className="text-2xl font-extrabold text-white">${grossRevenueTotal}</p>
                  <p className="text-[11px] text-zinc-500">{filteredAppointments.length} turnos completados</p>
                </div>

                <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 space-y-1">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Comisiones generadas</span>
                    <Users className="w-4 h-4 text-amber-400" />
                  </div>
                  <p className="text-2xl font-extrabold text-amber-400">-${staffCommissionsToPay}</p>
                  <p className="text-[11px] text-zinc-500">Comisiones equipo</p>
                </div>

                <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 space-y-1">
                  <div className="flex items-center justify-between text-xs text-zinc-300 font-semibold">
                    <span>Fondo común antes de gastos</span>
                    <Crown className="w-4 h-4 text-emerald-400" />
                  </div>
                  <p className="text-2xl font-extrabold text-emerald-400">${ownerTotalGrossIncome}</p>
                  <p className="text-[11px] text-zinc-400">Ingresos del local menos comisiones, antes de gastos</p>
                </div>

                <div
                  className={`border rounded-2xl p-4 space-y-1 ${
                    ownerFinalNetPocket >= 0
                      ? 'bg-emerald-950/30 border-emerald-500/40'
                      : 'bg-rose-950/30 border-rose-500/40'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold text-emerald-300">
                    <span>Resultado fondo común</span>
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
                    const isOwner = item.barber.isOwner === true;
                    const totalBarberPocket = item.barberTakeHome + item.barberTipsTotal;

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
                                {isOwner ? 'Propietario: 100% al fondo común' : <>Comisión: <strong>{item.barber.commissionRate}%</strong></>}
                              </span>
                            </div>
                          </div>
                          <span className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-semibold">
                            {item.cutsCount} turnos
                          </span>
                        </div>

                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Cortes completados:</span>
                            <span className="font-semibold">${item.grossGenerated - item.barberManualChargesTotal}</span>
                          </div>
                          {item.barberManualChargesTotal > 0 && (
                            <div className="flex justify-between text-emerald-400 font-medium">
                              <span>Cobros manuales extra:</span>
                              <span>+${item.barberManualChargesTotal}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Comisión total:</span>
                            <span className="font-medium text-zinc-300">${item.barberTakeHome}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Propinas personales:</span>
                            <span className="font-bold text-emerald-400">+${item.barberTipsTotal}</span>
                          </div>

                          <div className="flex justify-between pt-2 border-t border-zinc-800/80 text-amber-400 font-bold">
                            <span>Total para barbero:</span>
                            <span>${totalBarberPocket}</span>
                          </div>

                          <div className="flex justify-between pt-1 text-emerald-400 font-bold">
                            <span>Al fondo común:</span>
                            <span>+${item.leftForOwner}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'agenda' && (
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-5 sm:p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
                <div>
                  <h3 className="font-bold text-base flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4 text-emerald-400" />
                    Agenda General de la Barbería
                  </h3>
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
                            onClick={() => {
                              if (!canCompleteAppointment(apt.dateString)) {
                                alert('No podés completar un turno que corresponde a una fecha futura.');
                                return;
                              }
                              handleStatusChange(apt.id, 'completado');
                            }}
                            disabled={cashStatus !== 'abierta'}
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
                          {apt.dateString} • {apt.timeSlot} hs
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
                        {apt.serviceName} (${apt.priceSnapshot ?? apt.servicePrice}) • <strong className="text-zinc-200">{apt.barberName}</strong>
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
                          onClick={() => {
                            if (!canCompleteAppointment(apt.dateString)) {
                              alert('No podés completar un turno que corresponde a una fecha futura.');
                              return;
                            }
                            handleStatusChange(apt.id, 'completado');
                          }}
                          disabled={cashStatus !== 'abierta'}
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
                    className="sm:col-span-6 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-base sm:text-sm outline-none"
                  />
                  <div className="sm:col-span-2 flex items-center bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2">
                    <Percent className="w-3.5 h-3.5 text-zinc-500 mr-1.5 shrink-0" />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={newBarberCommission}
                      onChange={(e) => setNewBarberCommission(e.target.value)}
                      className="w-full bg-transparent text-base sm:text-sm outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2 flex items-center bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2">
                    <KeyRound className="w-3.5 h-3.5 text-zinc-500 mr-1.5 shrink-0" />
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="PIN de 4 a 6 dígitos"
                      value={newBarberPin}
                      onChange={(e) => setNewBarberPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full bg-transparent text-base sm:text-sm outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddBarber}
                    className="sm:col-span-2 py-2.5 px-3 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-xs cursor-pointer touch-manipulation"
                  >
                    Sumar
                  </button>
                </div>
                <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                  <input type="checkbox" checked={newBarberIsOwner} onChange={(e) => setNewBarberIsOwner(e.target.checked)} className="accent-emerald-500 size-4" />
                  Es propietario: 100% de sus cortes al fondo común (sin comisión)
                </label>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {safeBarbers.map((brb) => {
                  const isLocked = Boolean(blockedBarbers[brb.id]);
                  return (
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
                              {isLocked && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                                  <Lock className="w-3 h-3" /> Bloqueado por PIN
                                </span>
                              )}
                              <Link
                                href={`/barbero?perfil=${brb.slug || brb.name.toLowerCase()}`}
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                              >
                                <span>Ver Perfil</span>
                                <ExternalLink className="w-3 h-3" />
                              </Link>
                            </div>
                            <p className="text-xs text-zinc-400">{brb.isOwner ? 'Propietario · fondo común' : 'Barbero · comisión'}</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5">
                          <label className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-zinc-800 bg-zinc-950 text-xs text-zinc-300 cursor-pointer">
                            <input type="checkbox" className="size-4 accent-emerald-500" checked={brb.isOwner === true} onChange={(e) => handleUpdateBarberField(brb.id, 'isOwner', e.target.checked)} />
                            Propietario
                          </label>
                          <div className="flex items-center space-x-1.5 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5">
                            <span className="text-xs text-zinc-400">{brb.isOwner ? 'Comisión no aplica:' : 'Comisión:'}</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={brb.commissionRate}
                              disabled={brb.isOwner === true}
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
                              inputMode="numeric"
                              maxLength={6}
                              value={barberPinDrafts[brb.id] ?? brb.pin}
                              onChange={(e) => setBarberPinDrafts((prev) => ({
                                ...prev,
                                [brb.id]: e.target.value.replace(/\D/g, '').slice(0, 6),
                              }))}
                              onBlur={() => handleBarberPinBlur(brb.id, brb.pin)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  e.currentTarget.blur();
                                }
                              }}
                              className="w-20 bg-transparent font-mono font-bold text-zinc-100 outline-none text-sm"
                            />
                          </div>

                          {isLocked && (
                            <button
                              type="button"
                              onClick={() => handleUnblockBarberPin(brb.id, brb.name)}
                              className="px-3.5 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold hover:bg-amber-500/30 transition-colors cursor-pointer flex items-center gap-1.5 animate-pulse"
                            >
                              <ShieldCheck className="w-4 h-4 text-amber-400" />
                              <span>Desbloquear PIN</span>
                            </button>
                          )}

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
                  );
                })}
              </div>
            </div>
          )}

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
                    className="sm:col-span-5 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-base sm:text-sm outline-none"
                  />
                  <input
                    type="number"
                    placeholder="Precio $"
                    value={newServicePrice}
                    onChange={(e) => setNewServicePrice(e.target.value)}
                    className="sm:col-span-3 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-base sm:text-sm outline-none"
                  />
                  <input
                    type="number"
                    placeholder="Minutos"
                    value={newServiceDuration}
                    onChange={(e) => setNewServiceDuration(e.target.value)}
                    className="sm:col-span-2 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-base sm:text-sm outline-none"
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
                    <div>
                      <h4 className="font-bold text-sm sm:text-base">{srv.name}</h4>
                      <span className="text-[11px] text-zinc-400 flex items-center mt-0.5">
                        <Clock className="w-3 h-3 mr-1" /> Bloquea {srv.durationMinutes} min en agenda
                      </span>
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

          {activeTab === 'marca' && (
            <form
              onSubmit={handleSaveBrand}
              className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 space-y-5"
            >
              <h3 className="font-semibold text-base">Datos de {shopConfig.name}</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Nombre del Local</label>
                  <input
                    type="text"
                    value={shopConfig.name}
                    onChange={(e) => setShopConfig({ ...shopConfig, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-base sm:text-sm outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Teléfono de Contacto</label>
                  <input
                    type="text"
                    value={shopConfig.phone}
                    onChange={(e) => setShopConfig({ ...shopConfig, phone: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-base sm:text-sm outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Ciudad</label>
                  <input
                    type="text"
                    value={shopConfig.city || ''}
                    onChange={(e) => setShopConfig({ ...shopConfig, city: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-base sm:text-sm outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Dirección</label>
                  <input
                    type="text"
                    value={shopConfig.address}
                    onChange={(e) => setShopConfig({ ...shopConfig, address: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-base sm:text-sm outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5" /> URL del Logo
                  </label>
                  <input
                    type="url"
                    value={shopConfig.logoUrl || ''}
                    onChange={(e) => setShopConfig({ ...shopConfig, logoUrl: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-base sm:text-sm outline-none"
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