// app/admin/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
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
  ChevronDown,
} from 'lucide-react';
import {
  ServiceItem,
  BarberItem,
  AppointmentItem,
  ExpenseItem,
  ExpenseCategory,
  TipItem,
  ManualChargeItem,
  FixedMonthlyUseItem,
  ShopConfig,
  DEFAULT_SHOP_CONFIG,
  SHOP_UUID,
  generateUUID,
  saveServices,
  deleteServiceFromDb,
  getAdminBarbers,
  getAdminDashboardSnapshot,
  getLiveAgendaSnapshot,
  getMontevideoDateKey,
  saveBarbers,
  deleteBarberFromDb,
  updateAppointmentStatus,
  getExpenses,
  createExpense,
  deleteExpense,
  createTip,
  deleteTip,
  createManualCharge,
  deleteManualCharge,
  saveShopConfig,
  saveShopHours,
  sortAppointmentsChronologically,
} from '@/lib/booking-store';
import { appointmentTimeState } from '@/lib/appointment-rules';
import { InitialShopSkeleton, InitialShopError } from '@/components/InitialShopState';
import { splitBusinessRevenue } from '@/lib/financial-allocations';
import { invalidatePublicShopData } from '@/lib/public-shop-data';
import { MAX_BARBER_PHOTO_BYTES } from '@/lib/barber-photo';
import AgendaCalendar from '@/components/AgendaCalendar';
import WeeklyScheduleEditor from '@/components/WeeklyScheduleEditor';
import FixedAgendaManager from '@/components/FixedAgendaManager';
import {normalizeHours, type WeeklyHours} from '@/lib/weekly-hours';
import CashDrawerCard from '@/components/CashDrawerCard';
import CashCloseDialog from '@/components/CashCloseDialog';
import FinanceLedgerCard from '@/components/FinanceLedgerCard';
import InstagramConnection from '@/components/admin/InstagramConnection';
import type {OnSitePaymentMethod} from '@/lib/payment-method';

import {customerWhatsAppLink} from '@/lib/customer-contact';
import {useAgendaAutoSync} from '@/hooks/useAgendaAutoSync';

type PeriodFilter = 'hoy' | 'semana' | 'mes';
type CashHistoryEntry = {
  id: string;
  status: 'abierta' | 'cerrada';
  opened_at: string;
  closed_at: string | null;
  initial_amount: number | string | null;
  total_sales: number | string | null;
  total_expenses: number | string | null;
  final_amount: number | string | null;
};

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
  if (!isoOrDateStr) return false;
  const date = new Date(isoOrDateStr);
  if (Number.isNaN(date.getTime())) return false;
  const dateKey = getMontevideoDateKey(date);
  const todayKey = getMontevideoDateKey();
  if (period === 'hoy') return dateKey === todayKey;
  if (period === 'semana') {
    const delta = (Date.parse(todayKey + 'T00:00:00Z') - Date.parse(dateKey + 'T00:00:00Z')) / 86400000;
    return delta >= 0 && delta < 7;
  }
  return dateKey.slice(0, 7) === selectedMonthYear;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<
    'inicio' | 'caja' | 'facturacion' | 'agenda' | 'turnos' | 'fijos' | 'barberos' | 'servicios' | 'marca' | 'configuracion'
  >('inicio');

  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [barbers, setBarbers] = useState<BarberItem[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [tips, setTips] = useState<TipItem[]>([]);
  const [manualCharges, setManualCharges] = useState<ManualChargeItem[]>([]);
  const [fixedMonthlyUses, setFixedMonthlyUses] = useState<FixedMonthlyUseItem[]>([]);
  const [shopConfig, setShopConfig] = useState<ShopConfig>(DEFAULT_SHOP_CONFIG);
  const [savedBanner, setSavedBanner] = useState(false);
  const [shopHoursSaving,setShopHoursSaving]=useState(false);
  const [shopHoursDirty,setShopHoursDirty]=useState(false);
  const [shopHoursFeedback,setShopHoursFeedback]=useState('');
  const [savingBarberId, setSavingBarberId] = useState<string | null>(null);
  const [barberPhotoBusyId, setBarberPhotoBusyId] = useState<string | null>(null);
  const [adminError, setAdminError] = useState<string>('');
  const [initialLoad, setInitialLoad] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadingTooLong, setLoadingTooLong] = useState(false);

  const [cashStatus, setCashStatus] = useState<'abierta' | 'cerrada'>('cerrada');
  const [cashCloseOpen,setCashCloseOpen]=useState(false);
  const [cashCloseFeedback,setCashCloseFeedback]=useState('');
  const [cashView, setCashView] = useState<'overview'|'pay'|'owner'|'movements'>('overview');
  const [lastClosedDate, setLastClosedDate] = useState<string>('');
  const [cashHistoryOpen, setCashHistoryOpen] = useState(false);
  const [cashHistoryLoading, setCashHistoryLoading] = useState(false);
  const [cashHistoryError, setCashHistoryError] = useState('');
  const [cashHistory, setCashHistory] = useState<CashHistoryEntry[]>([]);
  const [blockedBarbers, setBlockedBarbers] = useState<Record<string, boolean>>({});

  const availableMonths = getRecentMonths(12);
  const [period, setPeriod] = useState<PeriodFilter>('hoy');
  const [selectedMonth, setSelectedMonth] = useState<string>(availableMonths[0].value);

  const [auditDate, setAuditDate] = useState<string>(getMontevideoDateKey());
  const [auditBarberId, setAuditBarberId] = useState<string>('todos');

  const [newServiceName, setNewServiceName] = useState('');
  const [newServicePrice, setNewServicePrice] = useState('');
  const [newServiceDuration, setNewServiceDuration] = useState('60');

  const [newBarberName, setNewBarberName] = useState('');
  const [newBarberCommission, setNewBarberCommission] = useState('50');
  const [newBarberIsOwner, setNewBarberIsOwner] = useState(false);
  const [newBarberPin, setNewBarberPin] = useState('');
  const [newBarberSchedule,setNewBarberSchedule]=useState<WeeklyHours|null>(null);
  const [barberPinDrafts, setBarberPinDrafts] = useState<Record<string, string>>({});

  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>('Insumos');
  const [expensePaymentMethod,setExpensePaymentMethod] = useState<OnSitePaymentMethod | ''>('');
  const [expenseFeedback, setExpenseFeedback] = useState<{kind: 'error' | 'success'; message: string} | null>(null);
  const [savingExpense, setSavingExpense] = useState(false);
  const [removingExpenseId, setRemovingExpenseId] = useState<string | null>(null);
  const expenseAttempt = useRef<{fingerprint: string; id: string; pending: boolean} | null>(null);

  const [tipBarberId, setTipBarberId] = useState<string>('');
  const [tipAmount, setTipAmount] = useState<string>('');
  const [tipNote, setTipNote] = useState<string>('');
  const [tipPaymentMethod,setTipPaymentMethod] = useState<OnSitePaymentMethod | ''>('');
  const [savingTip, setSavingTip] = useState(false);
  const tipAttempt = useRef<{fingerprint: string; id: string; pending: boolean} | null>(null);

  const [chargeBarberId, setChargeBarberId] = useState<string>('');
  const [chargeAmount, setChargeAmount] = useState<string>('');
  const [chargeService, setChargeService] = useState<string>('');
  const [chargeNote, setChargeNote] = useState<string>('');
  const [chargePaymentMethod,setChargePaymentMethod] = useState<OnSitePaymentMethod | ''>('');
  const [savingCharge, setSavingCharge] = useState(false);
  const chargeAttempt = useRef<{fingerprint: string; id: string; pending: boolean} | null>(null);

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
        setFixedMonthlyUses(snapshot.fixedMonthlyUses);
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

  const {syncState: agendaSyncState, lastUpdatedAt: agendaUpdatedAt, refresh: refreshAgenda} =
    useAgendaAutoSync({
      enabled: initialLoad === 'ready',
      refreshData: async () => {
        const live = await getLiveAgendaSnapshot();
        setAppointments(sortAppointmentsChronologically(live.appointments));
        setCashStatus(live.cashOpen ? 'abierta' : 'cerrada');
      },
    });

  // La agenda se refresca con una consulta breve; las cifras contables se
  // reconcilian por separado mientras el administrador consulta finanzas.
  useEffect(() => {
    if (initialLoad !== 'ready' || !['inicio', 'caja', 'facturacion'].includes(activeTab)) return;
    let mounted = true;
    let busy = false;
    const reconcile = async () => {
      if (!mounted || busy || document.visibilityState === 'hidden') return;
      busy = true;
      try {
        const financial = await getAdminDashboardSnapshot();
        if (!mounted) return;
        setAppointments(sortAppointmentsChronologically(financial.appointments));
        setExpenses(financial.expenses);
        setTips(financial.tips);
        setManualCharges(financial.manualCharges);
        setFixedMonthlyUses(financial.fixedMonthlyUses);
        setCashStatus(financial.cashStatus);
        setLastClosedDate(financial.lastClosedDate);
      } catch {
        console.warn('No se pudieron conciliar finanzas; se conserva la última lectura válida.');
      } finally {
        busy = false;
      }
    };
    // Al cambiar desde Agenda a Caja/Inicio, reconciliar lo actualizado en otra sesión.
    void reconcile();
    const timer = window.setInterval(() => {void reconcile();}, 60_000);
    return () => {mounted = false; window.clearInterval(timer);};
  }, [initialLoad, activeTab]);

  const toggleCashHistory = async () => {
    if (cashHistoryOpen) { setCashHistoryOpen(false); return; }
    setCashHistoryOpen(true);
    setCashHistoryLoading(true);
    setCashHistoryError('');
    try {
      const response = await fetch('/api/admin/cash-history', {
        cache: 'no-store', credentials: 'same-origin',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'No se pudo cargar el historial.');
      setCashHistory(Array.isArray(payload.registers) ? payload.registers : []);
    } catch (error: any) {
      setCashHistoryError(error?.message || 'No se pudo cargar el historial.');
    } finally {
      setCashHistoryLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/login');
    router.refresh();
  };

  const handleStatusChange = async (id: string, status: AppointmentItem['status'], paymentMethod?: OnSitePaymentMethod) => {
    try {
      setAdminError('');
      const persisted = await updateAppointmentStatus(id, status, paymentMethod);
      setAppointments((current) => current.map((appointment) =>
        appointment.id === id ? {...appointment, ...persisted} : appointment
      ));
      // El turno ya quedó persistido; un error posterior de lectura jamás
      // puede presentarse como fallo del cobro ni provocar una repetición.
      try {
        const fresh = await getAdminDashboardSnapshot();
        setAppointments(sortAppointmentsChronologically(fresh.appointments));
        setExpenses(fresh.expenses);
        setTips(fresh.tips);
        setManualCharges(fresh.manualCharges);
        setFixedMonthlyUses(fresh.fixedMonthlyUses);
        setCashStatus(fresh.cashStatus);
      } catch {
        console.warn('La operación quedó guardada; el resumen financiero se actualizará al reingresar.');
      }
      refreshAgenda();
      return {ok: true, cancellationEmailStatus: persisted.cancellationEmailStatus};
    } catch (err: any) {
      const message = err?.message || 'No se pudo actualizar el estado del turno.';
      setAdminError(message);
      return {ok: false, error: message};
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

  const handleToggleServiceActive = async (id: string, active: boolean) => {
    const previous = services;
    const updated = services.map((service) => service.id === id ? {...service, active} : service);
    setServices(updated);
    try {
      setAdminError('');
      await saveServices(updated);
    } catch (err: any) {
      setServices(previous);
      setAdminError(err?.message || 'No se pudo actualizar el servicio.');
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
      role: 'Barbero',
      workingSchedule:normalizeHours(newBarberSchedule ?? shopConfig.schedule),
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
      // La RPC hace upsert por barbero, evitando reescribir horarios ajenos.
      await saveBarbers([newItem]);
      
      // Recargamos la lista oficial de la base de datos
      const freshBarbers = await getAdminBarbers(true);
      const finalBarbers = (Array.isArray(freshBarbers) && freshBarbers.length > 0 ? freshBarbers : updated)
        .map((barber) => ({...barber, pin: ''}));
      
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
      setNewBarberSchedule(null);
      
      alert(`¡Barbero ${newItem.name} agregado con éxito!`);
    } catch (err: any) {
      setBarbers(previous);
      console.error('Error al agregar barbero:', err);
      setAdminError(err?.message || 'Error al agregar el barbero en la base de datos.');
    }
  };

  const handleUpdateBarberField = async (
    id: string,
    field: 'commissionRate' | 'pin' | 'isOwner' | 'active',
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
      if (field === 'active') return { ...b, active: value === true };
      return { ...b, pin: String(value).trim() };
    });
    setBarbers(updated.map((barber) => ({...barber, pin: ''})));
    try {
      setAdminError('');
      const changed = updated.find(b => b.id === id);
      if (!changed) throw new Error('Barbero no encontrado.');
      await saveBarbers([changed]);
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

  const handleBarberPhotoUpload = async (barberId: string, file?: File) => {
    if (!file) return;
    if (file.size > MAX_BARBER_PHOTO_BYTES || !['image/jpeg','image/png','image/webp'].includes(file.type)) {
      setAdminError('Elegí una foto JPG, PNG o WebP de hasta 2 MB.');
      return;
    }
    setBarberPhotoBusyId(barberId);
    setAdminError('');
    try {
      const form = new FormData();
      form.append('barberId', barberId);
      form.append('photo', file);
      const response = await fetch('/api/admin/barber-photo', {
        method: 'POST', credentials: 'same-origin', body: form,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || 'No se pudo subir la foto.');
      setBarbers(current => current.map(barber =>
        barber.id === barberId ? {...barber, imageUrl: result.imageUrl} : barber
      ));
      invalidatePublicShopData();
    } catch (error: any) {
      setAdminError(error?.message || 'No se pudo actualizar la foto.');
    } finally {
      setBarberPhotoBusyId(null);
    }
  };

  const handleBarberPhotoRemove = async (barberId: string) => {
    if (!window.confirm('¿Quitar la foto de este barbero?')) return;
    setBarberPhotoBusyId(barberId);
    setAdminError('');
    try {
      const response = await fetch('/api/admin/barber-photo', {
        method: 'DELETE', credentials: 'same-origin',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({barberId}),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || 'No se pudo quitar la foto.');
      setBarbers(current => current.map(barber =>
        barber.id === barberId ? {...barber, imageUrl: ''} : barber
      ));
      invalidatePublicShopData();
    } catch (error: any) {
      setAdminError(error?.message || 'No se pudo quitar la foto.');
    } finally {
      setBarberPhotoBusyId(null);
    }
  };

  const handleSaveBarberChanges = async (barberId: string) => {
    if (savingBarberId) return;
    const barber = barbers.find(item => item.id === barberId);
    if (!barber) {
      setAdminError('No se encontró el barbero que querés guardar.');
      return;
    }
    setSavingBarberId(barberId);
    setAdminError('');
    try {
      // Guardar únicamente este barbero para no alterar horarios de otros.
      await saveBarbers([barber]);
      // Confirmar el resultado con una nueva lectura de Supabase, sin caché.
      const fresh = (await getAdminBarbers(true)).find(item => item.id === barberId);
      const expectedHours = normalizeHours(barber.workingSchedule ?? null);
      const persistedHours = normalizeHours(fresh?.workingSchedule ?? null);
      const expectedServices = [...(barber.serviceIds || [])].sort();
      const persistedServices = [...(fresh?.serviceIds || [])].sort();
      if (!fresh || JSON.stringify(expectedHours) !== JSON.stringify(persistedHours) ||
        JSON.stringify(expectedServices) !== JSON.stringify(persistedServices)) {
        throw new Error('El servidor no confirmó los horarios y servicios guardados. Revisá antes de salir.');
      }
    } catch (err: any) {
      setAdminError(err?.message || 'No se pudieron confirmar los horarios guardados.');
    } finally {
      setSavingBarberId(null);
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
    if (savingExpense || expenseAttempt.current?.pending) return;
    setExpenseFeedback(null);
    const description = expenseDesc.trim();
    const amount = Number(expenseAmount);
    const date = getMontevideoDateKey();

    if (!description || !expenseAmount.trim() || !Number.isFinite(amount) || amount <= 0 || !expensePaymentMethod) {
      setExpenseFeedback({kind: 'error', message: 'Ingresá una descripción y un monto mayor a $0.'});
      return;
    }
    const fingerprint = JSON.stringify([description, amount, expenseCategory, date, expensePaymentMethod]);
    if (expenseAttempt.current?.fingerprint !== fingerprint) {
      expenseAttempt.current = {fingerprint, id: generateUUID(), pending: false};
    }
    expenseAttempt.current!.pending = true;
    setSavingExpense(true);
    try {
      setAdminError('');
      const inserted = await createExpense({
        description, amount, category: expenseCategory, date, paymentMethod: expensePaymentMethod,
      }, expenseAttempt.current!.id);
      setExpenses(current => [...current.filter(exp => exp.id !== inserted.id), inserted]);
      setExpenseDesc('');
      setExpenseAmount('');
      expenseAttempt.current = null;
      setExpenseFeedback({kind: 'success', message: 'Gasto registrado correctamente.'});
    } catch (err: any) {
      setExpenseFeedback({kind: 'error', message: err?.message || 'No se pudo confirmar el gasto. Reintentá sin cambiar los datos.'});
    } finally {
      if (expenseAttempt.current) expenseAttempt.current.pending = false;
      setSavingExpense(false);
    }
  };

  const handleRemoveExpense = async (id: string) => {
    if (removingExpenseId) return;
    setRemovingExpenseId(id);
    setExpenseFeedback(null);
    setAdminError('');
    try {
      const deletedId = await deleteExpense(id);
      setExpenses(current => current.filter(exp => exp.id !== deletedId));
      setExpenseFeedback({kind: 'success', message: 'Gasto eliminado correctamente.'});
    } catch (err: any) {
      try {
        const fresh = await getExpenses();
        setExpenses(fresh);
        if (!fresh.some(exp => exp.id === id)) {
          setExpenseFeedback({kind: 'success', message: 'El gasto ya no figura en el registro.'});
        } else {
          setExpenseFeedback({kind: 'error', message: err?.message || 'No se pudo eliminar el gasto.'});
        }
      } catch {
        setExpenseFeedback({kind: 'error', message: 'No se pudo verificar la eliminación. Actualizá antes de repetir.'});
      }
    } finally {
      setRemovingExpenseId(null);
    }
  };

  const handleAddTipAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tipBarberId || !tipAmount || Number(tipAmount) <= 0 || !tipPaymentMethod) return;
    const fingerprint = JSON.stringify([tipBarberId, Number(tipAmount), tipNote.trim(), tipPaymentMethod]);
    if (tipAttempt.current?.pending) return;
    if (tipAttempt.current?.fingerprint !== fingerprint) {
      tipAttempt.current = {fingerprint, id: generateUUID(), pending: false};
    }
    tipAttempt.current!.pending = true;
    try {
      setSavingTip(true);
      setAdminError('');
      const updated = await createTip({
        barberId: tipBarberId,
        amount: Number(tipAmount),
        paymentMethod:tipPaymentMethod,
        note: tipNote.trim() || 'Agregada por Admin',
        requestId: tipAttempt.current!.id,
      });
      setTips(Array.isArray(updated) ? updated : []);
      setTipAmount('');
      setTipNote('');
      tipAttempt.current = null;
    } catch (err: any) {
      setAdminError(err?.message || 'Error al registrar la propina.');
    } finally {
      if (tipAttempt.current) tipAttempt.current.pending = false;
      setSavingTip(false);
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
    if (!chargeBarberId || !chargeService || !chargeAmount || Number(chargeAmount) <= 0 || !chargePaymentMethod) return;
    const fingerprint = JSON.stringify([chargeBarberId, chargeService, Number(chargeAmount), chargeNote.trim(), chargePaymentMethod]);
    if (chargeAttempt.current?.pending) return;
    if (chargeAttempt.current?.fingerprint !== fingerprint) {
      chargeAttempt.current = {fingerprint, id: generateUUID(), pending: false};
    }
    chargeAttempt.current!.pending = true;
    try {
      setSavingCharge(true);
      setAdminError('');
      const result = await createManualCharge({
        barberId: chargeBarberId,
        amount: Number(chargeAmount),
        paymentMethod:chargePaymentMethod,
        note: chargeNote.trim() || 'Cliente',
        ...(chargeService === 'barba_local'
          ? {manualServiceType: 'barba_local' as const}
          : {serviceId: chargeService}),
        requestId: chargeAttempt.current!.id,
      });
      if (result.charges !== null) {
        setManualCharges(result.charges);
      } else {
        setAdminError('Cobro registrado, pero no se pudo actualizar la lista. No lo ingreses otra vez; revisá la pantalla antes de repetir.');
      }
      setChargeAmount('');
      setChargeService('');
      setChargeNote('');
      chargeAttempt.current = null;
    } catch (err: any) {
      setAdminError(err?.status
        ? (err.message || 'Error al registrar el cobro manual.')
        : 'No se pudo confirmar el guardado. Revisá la lista antes de volver a sumar.');
    } finally {
      if (chargeAttempt.current) chargeAttempt.current.pending = false;
      setSavingCharge(false);
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

  const handleSaveShopHours = async () => {
    if(shopHoursSaving)return;
    setShopHoursSaving(true);
    setAdminError('');
    setShopHoursFeedback('');
    try {
      const hours=normalizeHours(shopConfig.schedule);
      if(!hours)throw new Error('Configurá los siete días.');
      const saved=await saveShopHours(hours);
      setShopConfig(prev=>({...prev,schedule:saved}));
      setShopHoursDirty(false);
      setShopHoursFeedback('Horarios guardados. La portada y la reserva online se actualizarán automáticamente.');
    } catch(error) {
      setAdminError(error instanceof Error?error.message:'No se pudieron guardar los horarios.');
    } finally {
      setShopHoursSaving(false);
    }
  };

  const handleSaveBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if(shopHoursDirty){
      setAdminError('Tenés horarios modificados sin guardar. Primero tocá “Guardar horarios de la barbería”.');
      return;
    }
    try {
      setAdminError('');
      const configToSave: ShopConfig = {
        ...shopConfig,
        name: shopConfig.name.trim(),
        phone: shopConfig.phone.trim(),
        address: shopConfig.address.trim(),
        city: shopConfig.city ? shopConfig.city.trim() : 'Montevideo',
        schedule: normalizeHours(shopConfig.schedule) || DEFAULT_SHOP_CONFIG.schedule,
      };
      await saveShopConfig(configToSave);
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
  const filteredMonthlyUses = fixedMonthlyUses.filter((use) =>
    isWithinPeriod(`${use.occurrence_date}T12:00:00-03:00`,period,selectedMonth));

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
  const auditedMonthlyUses = fixedMonthlyUses.filter((use) =>
    (!auditDate || use.occurrence_date === auditDate) &&
    (auditBarberId === 'todos' || use.barber_id === auditBarberId));

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
  const auditedOldRows = [...auditedAppointments, ...auditedManualCharges].filter(
    item => item.barberEarningsSnapshot == null || item.businessEarningsSnapshot == null
  ).length;

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
        cutsCount: brbApts.length + auditedMonthlyUses.filter((use) => use.barber_id === barber.id).length,
        totalGen,
        commissionEarned,
        tipsEarned,
      };
    });

  const barberFinancials = safeBarbers.map((barber) => {
    const barberApts = filteredAppointments.filter((apt) => apt.barberId === barber.id);
    const barberCharges = filteredManualCharges.filter(c => c.barberId === barber.id);
    // Los cobros no clasificados suman dinero, pero no representan
    // necesariamente un servicio realizado.
    const categorizedCharges = barberCharges.filter(c => Boolean(c.serviceNameSnapshot));
    const monthlyUsesCount = filteredMonthlyUses.filter(use => use.barber_id === barber.id).length;
    const serviceCounts = new Map<string, number>();
    for (const appointment of barberApts) {
      const type = appointment.serviceName || 'Sin clasificar';
      serviceCounts.set(type, (serviceCounts.get(type) || 0) + 1);
    }
    for (const charge of categorizedCharges) {
      const type = charge.serviceNameSnapshot!;
      serviceCounts.set(type, (serviceCounts.get(type) || 0) + 1);
    }
    if (monthlyUsesCount > 0) {
      serviceCounts.set('Abonos realizados', (serviceCounts.get('Abonos realizados') || 0) + monthlyUsesCount);
    }
    const workCount = barberApts.length + categorizedCharges.length + monthlyUsesCount;
    const unclassifiedChargesCount = barberCharges.length - categorizedCharges.length;
    const serviceBreakdown = [...serviceCounts.entries()].sort((a,b) => b[1] - a[1]);
    
    const grossFromAppointments = barberApts.reduce(
      (sum, apt) => sum + Number(apt.priceSnapshot ?? apt.servicePrice),
      0
    );

    const barberManualChargesTotal = barberCharges.reduce((sum, c) => sum + Number(c.amount), 0);

    const grossGenerated = grossFromAppointments + barberManualChargesTotal;

    const allocated = [
      ...barberApts.map(a => splitBusinessRevenue(Number(a.priceSnapshot ?? a.servicePrice), barber, a)),
      ...barberCharges.map(c => splitBusinessRevenue(Number(c.amount), barber, c)),
    ];
    const barberTakeHome = allocated.reduce((sum, row) => sum + row.barber, 0);
    const leftForOwner = allocated.reduce((sum, row) => sum + row.business, 0);

    const barberTipsTotal = filteredTips
      .filter((t) => t.barberId === barber.id)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    return {
      barber,
      workCount,
      appointmentCount: barberApts.length,
      manualCount: barberCharges.length,
      monthlyUsesCount,
      unclassifiedChargesCount,
      serviceBreakdown,
      grossFromAppointments,
      grossGenerated,
      barberTakeHome,
      leftForOwner,
      barberTipsTotal,
      barberManualChargesTotal,
    };
  });

  const totalServicesPerformed = barberFinancials.reduce((sum, b) => sum + b.workCount, 0);
  const totalUnclassifiedCharges = barberFinancials.reduce((sum, b) => sum + b.unclassifiedChargesCount, 0);
  const totalGrossAppointments = barberFinancials.reduce((sum, b) => sum + (b.grossGenerated - b.barberManualChargesTotal), 0);
  const totalManualChargesAll = filteredManualCharges.reduce((sum, c) => sum + Number(c.amount), 0);
  const grossRevenueTotal = totalGrossAppointments + totalManualChargesAll;

  const staffCommissionsToPay = barberFinancials.reduce((sum, b) => sum + b.barberTakeHome, 0);
  const ownerTotalGrossIncome = barberFinancials.reduce((sum, b) => sum + b.leftForOwner, 0);
  const totalExpensesAmount = filteredExpenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
  const ownerFinalNetPocket = ownerTotalGrossIncome - totalExpensesAmount;
  // Las comisiones anteriores a la migración no tienen un reparto histórico verificable.
  const legacyFinancialRows = [...filteredAppointments, ...filteredManualCharges].filter(
    (item) => item.barberEarningsSnapshot == null || item.businessEarningsSnapshot == null
  ).length;

  const getClientWhatsAppLink = (apt: AppointmentItem) =>
    customerWhatsAppLink(apt.clientPhone, apt.clientName, shopConfig.name);

  const bgImage = shopConfig.backgroundImageUrl || DEFAULT_SHOP_CONFIG.backgroundImageUrl;
  const logoImage = shopConfig.logoUrl || DEFAULT_SHOP_CONFIG.logoUrl;

  const todayStr = getMontevideoDateKey();
  const isTodayClosed = cashStatus === 'cerrada' && lastClosedDate === todayStr;
  // El modo de pruebas se habilita únicamente cuando esta web usa la base staging.
  // Producción mantiene el bloqueo de reapertura tras el cierre del mismo día.
  const isStagingTest = process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://vjtwvhdiypfxgodhnjiw.supabase.co';
  const canOpenCash = cashStatus === 'cerrada' && (!isTodayClosed || isStagingTest);

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

          {/* SNOSERVICE_PRESET_V1 */}
          <nav aria-label="Secciones de administración" className="grid grid-cols-3 gap-1.5 rounded-2xl border border-zinc-800 bg-zinc-900/90 p-1.5 sm:grid-cols-6 sm:gap-2 sm:p-2">
            {([
              {id:'inicio',label:'Inicio',icon:BarChart3},
              {id:'agenda',label:'Agenda',icon:CalendarIcon},
              {id:'caja',label:'Caja',icon:Wallet},
              {id:'facturacion',label:'Informes',icon:TrendingUp},
              {id:'barberos',label:'Equipo',icon:Users},
              {id:'configuracion',label:'Configuración',icon:Settings},
            ] as const).map(({id,label,icon:Icon}) => {
              const active = activeTab===id || (id==='agenda' && (activeTab==='turnos'||activeTab==='fijos')) || (id==='configuracion' && (activeTab==='servicios'||activeTab==='marca'));
              return <button type="button" key={id} onClick={() => setActiveTab(id)}
                aria-current={active ? 'page' : undefined}
                className={'flex min-h-[50px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-center text-[10px] font-bold leading-tight transition-colors focus-visible:outline-2 focus-visible:outline-emerald-400 sm:min-h-14 sm:flex-row sm:gap-1.5 sm:p-2 sm:text-[11px] ' + (active?'bg-zinc-100 text-zinc-950':'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100')}>
                <Icon className="h-4 w-4"/>{label}</button>;
            })}
          </nav>
          {(activeTab==='agenda'||activeTab==='turnos'||activeTab==='fijos') && <div role="group" aria-label="Modo de agenda" className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-1">
            <button type="button" onClick={() => setActiveTab('agenda')} aria-pressed={activeTab==='agenda'} className={'min-w-0 flex-1 rounded-lg px-3 py-2 text-xs font-bold sm:flex-none '+(activeTab==='agenda'?'bg-emerald-400 text-zinc-950':'bg-zinc-800 text-zinc-200')}>Calendario</button>
            <button type="button" onClick={() => setActiveTab('turnos')} aria-pressed={activeTab==='turnos'} className={'min-w-0 flex-1 rounded-lg px-3 py-2 text-xs font-bold sm:flex-none '+(activeTab==='turnos'?'bg-emerald-400 text-zinc-950':'bg-zinc-800 text-zinc-200')}>Listado</button>
            <button type="button" onClick={() => setActiveTab('fijos')}
              aria-pressed={activeTab==='fijos'}
              className={'rounded-lg px-4 py-2 text-xs font-bold '+(activeTab==='fijos'?'bg-emerald-400 text-zinc-950':'bg-zinc-800 text-zinc-200')}>
              Agenda fija
            </button>
          </div>}
          {(activeTab==='servicios'||activeTab==='marca') && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 p-2">
             <button type="button" onClick={() => setActiveTab('configuracion')} className="rounded-lg px-3 py-2 text-xs font-bold text-zinc-400 hover:bg-zinc-800 hover:text-white">Configuración</button>
             <span className="text-zinc-600" aria-hidden="true">/</span>
            <button type="button" onClick={() => setActiveTab('servicios')} className={'rounded-lg px-4 py-2 text-xs '+(activeTab==='servicios'?'bg-emerald-400 text-zinc-950':'bg-zinc-800 text-zinc-200')}>Servicios y precios</button>
            <button type="button" onClick={() => setActiveTab('marca')} className={'rounded-lg px-4 py-2 text-xs '+(activeTab==='marca'?'bg-emerald-400 text-zinc-950':'bg-zinc-800 text-zinc-200')}>Datos del local</button>
          </div>}
          {activeTab==='configuracion' && <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setActiveTab('servicios')} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-left hover:border-emerald-400"><Scissors className="mb-3 h-7 w-7 text-emerald-400"/><strong>Servicios y precios</strong><p className="mt-2 text-xs text-zinc-400">Precios, duración y disponibilidad.</p></button>
            <button type="button" onClick={() => setActiveTab('marca')} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-left hover:border-emerald-400"><Settings className="mb-3 h-7 w-7 text-emerald-400"/><strong>Datos de la barbería</strong><p className="mt-2 text-xs text-zinc-400">Horarios, contacto y marca.</p></button>
            <InstagramConnection />
          </div>}
          {activeTab==='inicio' && <div className="space-y-5">
            <div><span className="text-xs font-bold uppercase tracking-widest text-emerald-400">Control del negocio</span><h2 className="mt-1 text-2xl font-extrabold">Resumen de {shopConfig.name}</h2><p className="mt-1 text-xs text-zinc-400">Resumen {period==='hoy'?'de hoy':period==='semana'?'de la semana':'del mes seleccionado'}. El fondo común no es el efectivo de caja.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {([{id:'hoy',label:'Hoy'},{id:'semana',label:'Semana'},{id:'mes',label:'Mes'}] as const).map(option => (
                  <button type="button" key={option.id} onClick={() => setPeriod(option.id)}
                    className={'rounded-lg px-3 py-2 text-xs font-bold '+(period===option.id?'bg-emerald-400 text-zinc-950':'border border-zinc-700 bg-zinc-900 text-zinc-200')}>{option.label}</button>
                ))}
              </div></div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {([
                {k:'Facturación',v:grossRevenueTotal,sub:'Cortes y cobros completados',color:'text-white'},
                {k:'Comisiones generadas',v:staffCommissionsToPay,sub:'Importes del equipo',color:'text-amber-400'},
                {k:'Gastos',v:totalExpensesAmount,sub:'Egresos del período',color:'text-white'},
                {k:'Resultado del negocio',v:ownerFinalNetPocket,sub:'Después de gastos y comisiones. No es saldo acumulado.',color:'text-emerald-400'},
              ] as const).map(m=><div key={m.k} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4"><p className="text-xs text-zinc-400">{m.k}</p><p className={'mt-2 text-2xl font-extrabold '+m.color}>{'$'+Number(m.v).toLocaleString('es-UY')}</p><p className="mt-2 text-[11px] text-zinc-500">{m.sub}</p></div>)}
            </div>
            <div className="grid gap-3 lg:grid-cols-2"><div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"><h3 className="mb-4 font-bold">Accesos rápidos</h3><div className="flex flex-col gap-2">
              <button type="button" onClick={() => setActiveTab('agenda')} className="rounded-xl border border-zinc-700 p-3 text-left text-sm hover:bg-zinc-800">📅 Agenda y clientes →</button>
              <button type="button" onClick={() => setActiveTab('caja')} className="rounded-xl border border-zinc-700 p-3 text-left text-sm hover:bg-zinc-800">💳 Caja y movimientos →</button>
              <button type="button" onClick={() => setActiveTab('facturacion')} className="rounded-xl border border-zinc-700 p-3 text-left text-sm hover:bg-zinc-800">📊 Ganancias por barbero →</button>
            </div></div><div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"><h3 className="mb-3 font-bold">Caja actual</h3><span className={'rounded-full px-3 py-1 text-xs font-bold '+(cashStatus==='abierta'?'bg-emerald-500/20 text-emerald-300':'bg-rose-500/20 text-rose-300')}>{cashStatus}</span><p className="mt-4 text-sm text-zinc-400">{totalServicesPerformed} trabajos registrados en el período consultado.</p><p className="mt-2 text-xs text-zinc-500">Las ganancias del negocio no equivalen al efectivo contado ni a retiros de propietarios.</p><button type="button" onClick={() => setActiveTab('caja')} className="mt-5 w-full rounded-xl bg-emerald-400 p-3 text-xs font-bold text-zinc-950">Ir a caja →</button></div></div>
          </div>}

          {activeTab === 'caja' && (
            <div className="space-y-4">
              <section className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-4 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-extrabold text-zinc-100">Dinero de la barbería</h2>
                    <p className="mt-1 text-sm text-zinc-400">Elegí qué necesitás hacer. Cada movimiento queda registrado.</p>
                  </div>
                  <span className={'rounded-full px-3 py-1.5 text-xs font-bold '+
                    (cashStatus==='abierta'?'bg-emerald-500/15 text-emerald-300':'bg-amber-500/15 text-amber-300')}>
                    Caja {cashStatus}
                  </span>
                </div>
                <div role="tablist" aria-label="Qué hacer con el dinero" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {([
                    {id:'overview',number:'01',label:'Ver caja',detail:'Saldos y cierre'},
                    {id:'pay',number:'02',label:'Pagar barbero',detail:'Comisiones'},
                    {id:'owner',number:'03',label:'Retirar dinero',detail:'Dueño'},
                    {id:'movements',number:'04',label:'Otros movimientos',detail:'Gastos y extras'},
                  ] as const).map(item=>(
                    <button key={item.id} type="button" role="tab"
                      aria-selected={cashView===item.id}
                      onClick={()=>setCashView(item.id)}
                      className={'min-h-[90px] rounded-2xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-emerald-400 '+
                        (cashView===item.id?'border-emerald-400 bg-emerald-500/15':'border-zinc-700 bg-zinc-950 hover:border-zinc-500')}>
                      <span className="text-[10px] font-bold text-emerald-400">{item.number}</span>
                      <span className="mt-1 block text-sm font-extrabold text-zinc-100">{item.label}</span>
                      <span className="mt-0.5 block text-[11px] text-zinc-400">{item.detail}</span>
                    </button>
                  ))}
                </div>
              </section>
              {cashView==='pay'&&<FinanceLedgerCard mode="admin" display="pay" />}
              {cashView==='owner'&&<CashDrawerCard view="owner" />}
              {cashView==='overview'&&<>
                <CashDrawerCard view="overview" key={cashStatus} />
                <FinanceLedgerCard mode="admin" display="summary" />
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
                        ? (isStagingTest
                            ? 'Caja cerrada hoy. En staging podés abrir una nueva sesión de prueba; el cierre anterior queda guardado.'
                            : 'La caja de hoy ya fue cerrada. Podrás abrir otra en la próxima jornada.')
                        : 'Abrí y cerrá sesiones de caja. Una caja cerrada conserva sus movimientos; no retira dinero del fondo común.'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {canOpenCash && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (isTodayClosed && isStagingTest && !window.confirm(
                            '¿Abrir una nueva caja de PRUEBA? La caja que cerraste hoy quedará guardada y esta nueva empezará desde $0.'
                          )) return;
                          const previous=await fetch('/api/finance/cash',{cache:'no-store'}).then(r=>r.json()).catch(()=>({}));
                          const suggested=previous.drawer?.closingCounted==null?'0':String(previous.drawer.closingCounted);
                          const entered=window.prompt('Contá el efectivo físico del cajón. ¿Cuánto hay al abrir esta jornada (UYU)?',suggested);
                          if(entered===null)return;
                          const initialCash=entered.trim();
                          if(!/^\d{1,8}(\.\d{1,2})?$/.test(initialCash)){alert('Ingresá efectivo válido, ej. 1000.');return;}
                          const res = await fetch('/api/admin', {
                            method: 'POST', headers: {'Content-Type':'application/json'},
                            body: JSON.stringify({operation:'OPEN_CASH', initialAmount:initialCash}),
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
                        {isTodayClosed && isStagingTest ? '🧪 Abrir nueva caja de prueba' : '🟢 Abrir Caja'}
                      </button>
                    )}

                    {cashStatus === 'abierta' && (
                      <button type="button"
                        onClick={()=>{setCashCloseFeedback('');setCashCloseOpen(true);}}
                        className="rounded-xl bg-rose-500 px-4 py-2.5 text-xs font-bold text-white hover:bg-rose-400">
                        Cerrar esta caja
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {cashCloseFeedback && (
                <div role="status" className="rounded-xl border border-emerald-600/30 bg-emerald-950/25 px-4 py-3 text-sm text-emerald-200">
                  {cashCloseFeedback}
                </div>
              )}
              {cashCloseOpen && (
                <CashCloseDialog
                  onCancel={()=>setCashCloseOpen(false)}
                  onClosed={summary=>{
                    setCashCloseOpen(false);
                    setCashStatus('cerrada');
                    setLastClosedDate(getMontevideoDateKey());
                    setCashCloseFeedback(summary.physicalCashVerified
                      ? 'Caja cerrada y arqueo registrado. Efectivo esperado: $'+Number(summary.expectedCash||0).toLocaleString('es-UY')+
                        ' · Contado: $'+Number(summary.countedCash||0).toLocaleString('es-UY')+
                        ' · Diferencia: $'+Number(summary.difference||0).toLocaleString('es-UY')+'.'
                      : 'Caja histórica cerrada sin conciliación física. Al abrir la próxima caja contá el efectivo real.');
                  }}
                />
              )}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold">Cierres anteriores</h3>
                    <p className="text-xs text-zinc-400">Cada caja se guarda por separado. Un cierre no reinicia las ganancias acumuladas del negocio.</p>
                  </div>
                  <button type="button" onClick={toggleCashHistory}
                    className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-xs font-bold hover:border-emerald-400">
                    {cashHistoryOpen ? 'Ocultar cierres' : 'Ver cierres anteriores'}
                  </button>
                </div>
                {cashHistoryOpen && (
                  <div className="space-y-2">
                    {cashHistoryLoading && <p className="text-xs text-zinc-400">Cargando cierres...</p>}
                    {cashHistoryError && <p role="alert" className="text-xs text-rose-300">{cashHistoryError}</p>}
                    {!cashHistoryLoading && !cashHistoryError && cashHistory.length === 0 &&
                      <p className="text-xs text-zinc-400">Todavía no hay sesiones registradas.</p>}
                    {!cashHistoryLoading && !cashHistoryError && cashHistory.map(item => {
                      const olderClose = item.status === 'cerrada' &&
                        Number(item.total_sales) === 0 && Number(item.final_amount) !== 0;
                      const label = (value: string | null) => value ? new Date(value).toLocaleString('es-UY', {
                        timeZone:'America/Montevideo',day:'2-digit',month:'2-digit',
                        year:'numeric',hour:'2-digit',minute:'2-digit',
                      }) : 'En curso';
                      return <div key={item.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <strong className="text-zinc-100">{label(item.opened_at)}</strong>
                          <span className={item.status === 'abierta'?'text-emerald-400':'text-zinc-400'}>
                            {item.status === 'abierta'?'Abierta':'Cerrada: '+label(item.closed_at)}
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-zinc-300 sm:grid-cols-3">
                          <span>Facturación: <strong>${Number(item.total_sales).toLocaleString('es-UY')}</strong></span>
                          <span>Gastos: <strong>${Number(item.total_expenses).toLocaleString('es-UY')}</strong></span>
                          <span>Resultado registrado: <strong>${Number(item.final_amount).toLocaleString('es-UY')}</strong></span>
                        </div>
                        {olderClose && <p className="mt-2 text-amber-300">
                          Cierre anterior a la nueva contabilidad: cifras pendientes de conciliación.
                        </p>}
                        <p className="mt-1 text-zinc-500">Resultado económico; no significa efectivo contado ni saldo del fondo común.</p>
                      </div>;
                    })}
                  </div>
                )}
              </div>

              </>}
              {cashView==='movements'&&<>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
                <h3 className="text-base font-bold text-zinc-100">Gastos, propinas y cobros extras</h3>
                <p className="mt-1 text-xs text-zinc-400">Registrá cada ingreso o salida con su medio de pago. Efectivo afecta el cajón; transferencia no.</p>
              </div>
              <details className="group/extracash overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/90 open:border-zinc-700">
                <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-bold hover:bg-zinc-800/60 focus-visible:outline-2 focus-visible:outline-emerald-400 [&::-webkit-details-marker]:hidden">
                  <Coins className="h-5 w-5 text-emerald-400"/>
                  <span className="flex-1">Cobros extras y fijos · {filteredManualCharges.length}</span>
                  <ChevronDown className="h-4 w-4 text-zinc-400 transition-transform group-open/extracash:rotate-180"/>
                </summary>
                <div className="space-y-4 border-t border-zinc-800 p-4 sm:p-5">

                <form onSubmit={handleAddChargeAdmin} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                  <label className="sm:col-span-12 text-xs font-semibold text-zinc-300">Servicio realizado
                    <select required value={chargeService}
                      onChange={e => {
                        const choice = e.target.value;
                        setChargeService(choice);
                        setChargeAmount(choice === 'barba_local' ? '200'
                          : String(services.find(s => s.id === choice)?.price ?? ''));
                      }}
                      className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white">
                      <option value="">Elegir servicio</option>
                      {services.filter(s => s.active !== false).map(s =>
                        <option key={s.id} value={s.id}>{s.name} · ${s.price}</option>)}
                      <option value="barba_local">Barba (solo en local) · $200</option>
                    </select>
                  </label>
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
                    readOnly={chargeService === 'barba_local'}
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

                  <label className="sm:col-span-2 text-[11px] text-zinc-400">Medio de cargo
                    <select value={chargePaymentMethod} onChange={e=>setChargePaymentMethod(e.target.value as OnSitePaymentMethod | '')} required
                      className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-white">
                      <option value="">Elegir</option><option value="cash">Efectivo</option><option value="transfer">Transferencia</option>
                    </select>
                  </label>
                  <button
                    type="submit"
                    disabled={savingCharge || cashStatus !== 'abierta'}
                    className="sm:col-span-2 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs cursor-pointer flex items-center justify-center gap-1 touch-manipulation disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{savingCharge ? 'Guardando...' : 'Registrar'}</span>
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
                            {chg.serviceNameSnapshot && (
                              <span className="text-xs text-emerald-300 font-medium">• {chg.serviceNameSnapshot}</span>
                            )}
                            {chg.note && (
                              <span className="text-xs text-zinc-300 font-medium">· {chg.note}</span>
                            )}
                            <span className="text-[11px] text-zinc-500">
                              Registrado por: {chg.createdByRole === 'admin'
                                ? 'Administración'
                                : chg.createdByRole === 'barber'
                                  ? (safeBarbers.find(b => b.id === chg.createdByBarberId)?.name || 'Barbero no disponible')
                                  : 'Sin registrar (anterior a esta mejora)'}
                              {' · '}{new Date(chg.createdAt).toLocaleTimeString('es-UY', {
                                timeZone: 'America/Montevideo', hour:'2-digit', minute:'2-digit'
                              })}
                            </span>
                          </div>

                          <div className="flex items-center space-x-3">
                            <span className="font-bold text-sm text-emerald-400">+${chg.amount}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveChargeAdmin(chg.id)}
                              disabled={cashStatus !== 'abierta' || Boolean(chg.note?.startsWith('Turno fijo ·'))}
                              title={chg.note?.startsWith('Turno fijo ·')?'Fijo completado: cobro protegido contra borrados':'Eliminar cobro extra'}
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
              </details>

              <details className="group/teamtips overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/90 open:border-zinc-700">
                <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-bold hover:bg-zinc-800/60 focus-visible:outline-2 focus-visible:outline-emerald-400 [&::-webkit-details-marker]:hidden">
                  <Coins className="h-5 w-5 text-emerald-400"/>
                  <span className="flex-1">Propinas del equipo · {filteredTips.length}</span>
                  <ChevronDown className="h-4 w-4 text-zinc-400 transition-transform group-open/teamtips:rotate-180"/>
                </summary>
                <div className="space-y-4 border-t border-zinc-800 p-4 sm:p-5">

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

                  <label className="sm:col-span-2 text-[11px] text-zinc-400">Medio de propina
                    <select value={tipPaymentMethod} onChange={e=>setTipPaymentMethod(e.target.value as OnSitePaymentMethod | '')} required
                      className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-white">
                      <option value="">Elegir</option><option value="cash">Efectivo</option><option value="transfer">Transferencia</option>
                    </select>
                  </label>
                  <button
                    type="submit"
                    disabled={savingTip || cashStatus !== 'abierta'}
                    className="sm:col-span-2 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs cursor-pointer flex items-center justify-center gap-1 touch-manipulation disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{savingTip ? 'Guardando...' : 'Sumar'}</span>
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
              </details>

              <details className="group/expenses overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/90 open:border-zinc-700">
                <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-bold hover:bg-zinc-800/60 focus-visible:outline-2 focus-visible:outline-emerald-400 [&::-webkit-details-marker]:hidden">
                  <Receipt className="h-5 w-5 text-emerald-400"/>
                  <span className="flex-1">Gastos del local · {filteredExpenses.length}</span>
                  <ChevronDown className="h-4 w-4 text-zinc-400 transition-transform group-open/expenses:rotate-180"/>
                </summary>
                <div className="space-y-4 border-t border-zinc-800 p-4 sm:p-5">

                <p className="text-xs text-zinc-400">Registrá aquí insumos, alquiler y otros gastos del local. No registres pagos de comisiones: ya están descontados del resultado del negocio.</p>
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
                    {/* Los pagos de comisiones requieren liquidaciones propias. No descontarlos dos veces. */}
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
                  <label className="sm:col-span-2 text-[11px] text-zinc-400">Medio de gasto
                    <select value={expensePaymentMethod} onChange={e=>setExpensePaymentMethod(e.target.value as OnSitePaymentMethod | '')} required
                      className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-white">
                      <option value="">Elegir</option><option value="cash">Efectivo</option><option value="transfer">Transferencia</option>
                    </select>
                  </label>
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
                          disabled={cashStatus !== 'abierta' || removingExpenseId === exp.id}
                          aria-label={'Eliminar gasto ' + exp.description}
                          className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-rose-400 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                </div>
              </details>
              </>}
            </div>
          )}

          {activeTab === 'facturacion' && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
                <h2 className="text-xl font-extrabold">Informes del negocio</h2>
                <p className="mt-1 text-xs text-zinc-400">Consultá períodos y jornadas anteriores. El resultado económico no es dinero físico en caja.</p>
              </div>
              <details className="group/dailyreport overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/90 open:border-zinc-700">
                <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-bold hover:bg-zinc-800/60 focus-visible:outline-2 focus-visible:outline-emerald-400 [&::-webkit-details-marker]:hidden">
                  <BarChart3 className="h-5 w-5 text-emerald-400"/>
                  <span className="flex-1">Detalle de ingresos por día</span>
                  <ChevronDown className="h-4 w-4 text-zinc-400 transition-transform group-open/dailyreport:rotate-180"/>
                </summary>
                <div className="space-y-5 border-t border-zinc-800 p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
                  <div>
                    <h3 className="font-bold text-base flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-emerald-400" />
                      Detalle de ingresos por día
                    </h3>
                    <p className="text-xs text-zinc-400">Seleccioná una fecha y consultá los ingresos, gastos y propinas de esa jornada.</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => setAuditDate(getMontevideoDateKey())}
                      className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-bold hover:border-emerald-400">Hoy</button>
                    <button type="button" onClick={() => setAuditDate(getMontevideoDateKey(new Date(Date.now() - 86400000)))}
                      className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-bold hover:border-emerald-400">Ayer</button>
                  <input
                    type="date"
                    value={auditDate}
                    onChange={(e) => setAuditDate(e.target.value)}
                    className="px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-700 text-xs font-bold text-emerald-400 outline-none cursor-pointer"
                  />
                  </div>
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
                    <span className="text-xs text-zinc-400">Facturación del día</span>
                    <p className="text-2xl font-extrabold text-emerald-400">${auditedGrossTotal}</p>
                    <span className="text-[11px] text-zinc-500">{auditedAppointments.length} turnos + {auditedManualCharges.length} extras</span>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-1">
                    <span className="text-xs text-zinc-400">Propinas por separado</span>
                    <p className="text-2xl font-extrabold text-amber-400">+${auditedTipsTotal}</p>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-1">
                    <span className="text-xs text-zinc-400">Gastos registrados</span>
                    <p className="text-2xl font-extrabold text-rose-400">-${auditedExpensesTotal}</p>
                  </div>
                </div>

                {auditedOldRows > 0 && (
                  <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                    {auditedOldRows} movimientos de esta fecha son anteriores al registro de comisiones. El reparto mostrado es estimado.
                  </div>
                )}
                {auditBarberId === 'todos' && auditedBarbersBreakdown.length > 0 && (
                  <div className="pt-2 space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Ingresos por barbero</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {auditedBarbersBreakdown.map((item) => (
                        <div key={item.barber.id} className="bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-3 space-y-1 text-xs">
                          <div className="flex justify-between font-bold text-sm text-zinc-100">
                            <span>{item.barber.name}</span>
                            <span className="text-emerald-400">${item.totalGen}</span>
                          </div>
                          <p className="text-zinc-400">{item.cutsCount} cortes • {item.barber.isOwner ? <>Al fondo común: <strong className="text-emerald-300">${item.totalGen - item.commissionEarned}</strong></> : <>Comisión generada: <strong className="text-zinc-200">${item.commissionEarned}</strong></>}</p>
                          {item.tipsEarned > 0 && <p className="text-amber-400 font-medium">Propinas: +${item.tipsEarned}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                </div>
              </details>



              <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-extrabold">Elegí el período</h3>
                  <p className="text-xs text-zinc-400">Todos los importes y las liquidaciones usan el mismo período. Semana = últimos 7 días.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center space-x-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                    {(
                      [
                        { id: 'hoy', label: 'Hoy' },
                        { id: 'semana', label: 'Semana' },
                        { id: 'mes', label: 'Mes' },
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

              {legacyFinancialRows > 0 && (
                <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                  Hay {legacyFinancialRows} operaciones antiguas sin comisión histórica guardada. Su reparto es estimado; no lo uses para liquidar pagos definitivos.
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 space-y-1">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Facturación Total</span>
                    <TrendingUp className="w-4 h-4 text-zinc-200" />
                  </div>
                  <p className="text-2xl font-extrabold text-white">${grossRevenueTotal}</p>
                  <p className="text-[11px] text-zinc-500">{totalServicesPerformed} trabajos realizados{totalUnclassifiedCharges > 0 ? ' · '+totalUnclassifiedCharges+' cobros sin clasificar' : ''}</p>
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
                    <span>Para el negocio antes de gastos</span>
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
                    <span>Resultado del negocio</span>
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

              <details open className="group/settlement overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/90 open:border-zinc-700">
                <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-bold hover:bg-zinc-800/60 focus-visible:outline-2 focus-visible:outline-emerald-400 [&::-webkit-details-marker]:hidden">
                  <Users className="h-5 w-5 text-emerald-400" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <span className="block">Liquidación por barbero</span>
                    <span className="mt-0.5 block text-xs font-normal text-zinc-400">
                      Todos los trabajos juntos, con propinas por separado.
                    </span>
                  </div>
                  <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400 transition-transform group-open/settlement:rotate-180" aria-hidden="true" />
                </summary>
                <div className="grid grid-cols-1 gap-3 border-t border-zinc-800 p-3 sm:p-5 lg:grid-cols-2 xl:grid-cols-3">
                  {barberFinancials.map((item) => {
                    const isOwner = item.barber.isOwner === true;
                    const totalBarberPocket = item.barberTakeHome + item.barberTipsTotal;
                    const money = (amount: number) => '$' + amount.toLocaleString('es-UY', {maximumFractionDigits: 2});

                    return (
                      <article key={item.barber.id} className="min-w-0 space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-3.5 sm:p-4">
                        <header className="flex items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-sm font-extrabold text-zinc-100">
                              {item.barber.name.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <h4 className="truncate text-sm font-extrabold">{item.barber.name}</h4>
                              <p className="text-[11px] text-zinc-400">
                                {isOwner ? 'Propietario · 100% al fondo común' : 'Comisión: ' + item.barber.commissionRate + '%'}
                              </p>
                            </div>
                          </div>
                          <span className="shrink-0 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] font-bold">
                            {item.workCount} trabajos
                          </span>
                        </header>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
                            <p className="text-[11px] text-zinc-400">Trabajos realizados</p>
                            <p className="mt-1 text-2xl font-extrabold tabular-nums">{item.workCount}</p>
                          </div>
                          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
                            <p className="text-[11px] text-zinc-400">Facturación total</p>
                            <p className="mt-1 text-xl font-extrabold tabular-nums">{money(item.grossGenerated)}</p>
                          </div>
                        </div>

                        <div className="flex min-h-8 flex-wrap gap-1.5" aria-label={'Servicios realizados por ' + item.barber.name}>
                          {item.serviceBreakdown.length ? item.serviceBreakdown.map(([service, count]) => (
                            <span key={service} className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300">
                              {service}: <strong className="text-zinc-100">{count}</strong>
                            </span>
                          )) : <span className="text-xs text-zinc-500">Sin trabajos clasificados en este período.</span>}
                        </div>

                        <div className="space-y-2 border-t border-zinc-800 pt-3 text-xs">
                          {!isOwner && (
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-zinc-400">Comisión generada</span>
                              <strong>{money(item.barberTakeHome)}</strong>
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-zinc-400">Propinas personales</span>
                            <strong className="text-amber-400">+{money(item.barberTipsTotal)}</strong>
                          </div>
                          {!isOwner && (
                            <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-500/25 bg-emerald-950/20 px-3 py-3">
                              <span className="font-bold text-emerald-200">Total generado para el barbero</span>
                              <strong className="text-base tabular-nums text-emerald-300">{money(totalBarberPocket)}</strong>
                            </div>
                          )}
                          <div className={['flex items-center justify-between gap-2 rounded-xl px-3 py-2.5',
                            isOwner ? 'border border-emerald-500/25 bg-emerald-950/20' : 'bg-zinc-900/60'
                          ].join(' ')}>
                            <span className={isOwner ? 'font-bold text-emerald-200' : 'text-zinc-400'}>
                              Para la barbería (antes de gastos)
                            </span>
                            <strong className={isOwner ? 'text-base text-emerald-300' : 'text-zinc-100'}>
                              {money(item.leftForOwner)}
                            </strong>
                          </div>
                          {!isOwner && (
                            <p className="text-[11px] leading-relaxed text-zinc-500">Importe generado, no necesariamente pagado.</p>
                          )}
                        </div>

                        <details className="group/source rounded-xl border border-zinc-800 bg-zinc-900/40">
                          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-bold text-zinc-300 [&::-webkit-details-marker]:hidden">
                            Ver origen de los trabajos
                            <ChevronDown className="h-3.5 w-3.5 text-zinc-500 transition-transform group-open/source:rotate-180" aria-hidden="true" />
                          </summary>
                          <div className="space-y-2 border-t border-zinc-800 px-3 py-3 text-[11px] text-zinc-400">
                            <div className="flex justify-between gap-2">
                              <span>Agenda · {item.appointmentCount}</span>
                              <span className="tabular-nums">{money(item.grossFromAppointments)}</span>
                            </div>
                            <div className="flex justify-between gap-2">
                              <span>Ingresos manuales · {item.manualCount}</span>
                              <span className="tabular-nums">{money(item.barberManualChargesTotal)}</span>
                            </div>
                            {item.monthlyUsesCount > 0 && (
                              <p>Abonos: {item.monthlyUsesCount} trabajos incluidos, sin cobro adicional.</p>
                            )}
                            {item.unclassifiedChargesCount > 0 && (
                              <p className="text-amber-300">
                                {item.unclassifiedChargesCount} cobros manuales sin servicio identificado. Incluidos en facturación, no en el contador de trabajos.
                              </p>
                            )}
                          </div>
                        </details>
                      </article>
                    );
                  })}
                </div>
              </details>
            </div>
          )}

          {activeTab === 'agenda' && (
            <AgendaCalendar
              mode="admin"
              appointments={safeAppointments}
              barbers={safeBarbers}
              canComplete={cashStatus === 'abierta'}
              onComplete={(appointment, method) => handleStatusChange(appointment.id, 'completado', method)}
              onCancel={(appointment) => handleStatusChange(appointment.id, 'cancelado')}
              getWhatsAppLink={getClientWhatsAppLink}
              syncState={agendaSyncState}
              lastUpdatedAt={agendaUpdatedAt}
              onRefresh={refreshAgenda}
            />
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
                  <details
                    key={apt.id}
                    className="group/appointment overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/90 open:border-zinc-700"
                  >
                    <summary className="flex min-h-[82px] cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-zinc-800/60 focus-visible:outline-2 focus-visible:outline-emerald-400 [&::-webkit-details-marker]:hidden">
                    <div className="min-w-0 flex-1 space-y-1">
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
                    <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400 transition-transform group-open/appointment:rotate-180" />
                    </summary>

                    <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800 p-4">
                      <a
                        href={getClientWhatsAppLink(apt) || undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 hover:bg-zinc-800 text-zinc-200 text-xs font-medium flex items-center space-x-1.5"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                        <span>WhatsApp</span>
                      </a>

                      {apt.status === 'confirmado' && (
                        <button
                          type="button"
                          onClick={() => {
                            if (appointmentTimeState(apt) !== 'started') {
                              alert('Podés completar el turno cuando llegue su hora de inicio.');
                              return;
                            }
                            const answer = window.prompt('¿Cómo pagó en el local? Escribí EFECTIVO o TRANSFERENCIA.');
                              if (answer === null) return;
                              const method = answer.trim().toLowerCase();
                              if (method !== 'efectivo' && method !== 'transferencia') {
                                alert('Elegí efectivo o transferencia para completar el turno.');
                                return;
                              }
                              void handleStatusChange(apt.id, 'completado', method === 'efectivo' ? 'cash' : 'transfer');
                          }}
                          disabled={cashStatus !== 'abierta'}
                          className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 text-xs font-semibold flex items-center space-x-1 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Completar</span>
                        </button>
                      )}

                      {apt.status === 'confirmado' && (
                        <button
                          type="button"
                          onClick={() => {
                            if (appointmentTimeState(apt) !== 'future') {
                              alert('Este turno ya comenzó o pasó y no se puede cancelar.');
                              return;
                            }
                            handleStatusChange(apt.id, 'cancelado');
                          }}
                          className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-rose-400 hover:bg-rose-500/10 text-xs font-medium flex items-center space-x-1 cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Cancelar</span>
                        </button>
                      )}
                    </div>
                  </details>
                ))
              )}
            </div>
          )}

          {activeTab === 'fijos' && <FixedAgendaManager barbers={barbers} services={services} shopSchedule={shopConfig.schedule}/>}
          {activeTab === 'barberos' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-400">Gestión del equipo</span>
                  <h2 className="mt-1 text-xl font-extrabold tracking-tight sm:text-2xl">Barberos</h2>
                  <p className="mt-1 text-xs text-zinc-400">Abrí un perfil solo cuando necesites editar sus datos, horarios o servicios.</p>
                </div>
                <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-300">
                  {safeBarbers.filter(b => b.active !== false).length} activos de {safeBarbers.length}
                </span>
              </div>

              <details className="group/new overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/90">
                <summary className="flex min-h-20 cursor-pointer list-none items-center gap-3 px-4 py-3 transition-colors hover:bg-zinc-800/60 focus-visible:outline-2 focus-visible:outline-emerald-400 sm:px-5 [&::-webkit-details-marker]:hidden">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300">
                    <Plus className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-zinc-100">Agregar barbero</span>
                    <span className="mt-0.5 block text-xs text-zinc-400">Nombre, PIN, comisión y días de atención</span>
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400 transition-transform group-open/new:rotate-180" />
                </summary>
                <div className="space-y-4 border-t border-zinc-800 p-4 sm:p-5">

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
                </div>
                <WeeklyScheduleEditor title="Días y horarios del nuevo barbero"
                  value={newBarberSchedule ?? shopConfig.schedule}
                  onChange={setNewBarberSchedule}
                  help="Podés habilitar solo sábados o cualquier combinación. Se guardará junto al perfil."/>
                <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                  <input type="checkbox" checked={newBarberIsOwner} onChange={(e) => setNewBarberIsOwner(e.target.checked)} className="accent-emerald-500 size-4" />
                  Es propietario: 100% de sus cortes al fondo común (sin comisión)
                </label>
                <button type="button" onClick={handleAddBarber}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-extrabold text-zinc-950 transition-colors hover:bg-emerald-300">
                  <Save className="size-4"/>
                  Crear barbero y guardar horarios
                </button>
                <p className="text-center text-xs text-zinc-500">
                  Nombre, PIN y días de atención se guardan juntos. Después podés modificarlos.
                </p>
                </div>
              </details>

              <div className="grid grid-cols-1 gap-3">
                {safeBarbers.map((brb) => {
                  const isLocked = Boolean(blockedBarbers[brb.id]);
                  return (
                    <details key={brb.id} className="group/barber overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/90 transition-colors open:border-zinc-700">
                      <summary className="flex min-h-[82px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-zinc-800/60 focus-visible:outline-2 focus-visible:outline-emerald-400 sm:px-5 [&::-webkit-details-marker]:hidden">
                        <span className="flex min-w-0 items-center gap-3">
                          <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 text-base font-bold">
                            {brb.imageUrl ? (
                              <img src={brb.imageUrl} alt="" className="h-full w-full object-cover" />
                            ) : brb.name.charAt(0)}
                          </span>
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="block truncate text-sm font-bold sm:text-base">{brb.name}</span>
                              {isLocked && <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-300">PIN bloqueado</span>}
                            </span>
                            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                              <span className={brb.active !== false ? 'text-emerald-300' : 'text-zinc-500'}>{brb.active !== false ? '● Habilitado' : '○ Deshabilitado'}</span>
                              <span className="text-zinc-600">·</span>
                              <span className="text-zinc-400">{brb.isOwner ? 'Propietario' : 'Barbero'}</span>
                            </span>
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {!brb.isOwner && <span className="hidden rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 sm:inline">{brb.commissionRate}% comisión</span>}
                          <span className="text-[11px] font-semibold text-emerald-300 sm:text-xs">Administrar</span>
                          <ChevronDown className="h-4 w-4 text-zinc-400 transition-transform group-open/barber:rotate-180" />
                        </span>
                      </summary>
                      <div className="space-y-4 border-t border-zinc-800 p-4 sm:p-5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center space-x-3">
                          <div className="flex flex-col items-center gap-1.5">
                            <div className="w-14 h-14 rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 flex items-center justify-center font-bold text-base text-zinc-100">
                              {brb.imageUrl ? (
                                <img src={brb.imageUrl} alt={'Foto de ' + brb.name} className="w-full h-full object-cover" />
                              ) : brb.name.charAt(0)}
                            </div>
                            <label htmlFor={'foto-barbero-' + brb.id}
                              className="text-[11px] font-semibold text-emerald-300 cursor-pointer hover:underline text-center">
                              {barberPhotoBusyId === brb.id ? 'Procesando...' : brb.imageUrl ? 'Cambiar foto' : 'Agregar foto'}
                            </label>
                            <input id={'foto-barbero-' + brb.id} type="file" className="sr-only"
                              accept="image/jpeg,image/png,image/webp"
                              aria-label={'Seleccionar foto de ' + brb.name}
                              disabled={barberPhotoBusyId === brb.id}
                              onChange={event => {
                                const file = event.currentTarget.files?.[0];
                                event.currentTarget.value = '';
                                void handleBarberPhotoUpload(brb.id,file);
                              }} />
                            {brb.imageUrl && (
                              <button type="button" disabled={barberPhotoBusyId === brb.id}
                                onClick={() => void handleBarberPhotoRemove(brb.id)}
                                className="text-[10px] text-zinc-400 hover:text-rose-300 cursor-pointer disabled:opacity-50">
                                Quitar foto
                              </button>
                            )}
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
                          <label className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-zinc-800 bg-zinc-950 text-xs text-zinc-300 cursor-pointer">
                            <input type="checkbox" className="size-4 accent-emerald-500" checked={brb.active !== false} onChange={(e) => handleUpdateBarberField(brb.id, 'active', e.target.checked)} />
                            Habilitado
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
                            <span className="text-xs text-zinc-400">Cambiar PIN:</span>
                            <input
                              type="password"
                              inputMode="numeric"
                              autoComplete="new-password"
                              placeholder="Nuevo PIN"
                              maxLength={6}
                              value={barberPinDrafts[brb.id] ?? ''}
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

                      <details className="group/tools overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950/60">
                        <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-3 transition-colors hover:bg-zinc-800/50 focus-visible:outline-2 focus-visible:outline-emerald-400 sm:px-4 [&::-webkit-details-marker]:hidden">
                          <Clock className="h-4 w-4 shrink-0 text-emerald-300"/>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold">Horarios y servicios</span>
                            <span className="mt-0.5 block text-[11px] text-zinc-400">Editar disponibilidad y servicios habilitados</span>
                          </span>
                          <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400 transition-transform group-open/tools:rotate-180"/>
                        </summary>
                        <div className="space-y-4 border-t border-zinc-800 p-3 sm:p-4">
                      <WeeklyScheduleEditor title={'Horarios de '+brb.name}
                        help="Desmarcá los días que no trabaja. Guardá para actualizar las próximas reservas disponibles."
                        value={brb.workingSchedule ?? shopConfig.schedule}
                        onChange={(hours)=>setBarbers(prev=>prev.map(b=>b.id===brb.id?{...b,workingSchedule:hours}:b))}/>
                      <div className="pt-3 border-t border-zinc-800/80 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-zinc-400 font-medium">
                            Servicios habilitados para {brb.name}:
                          </p>
                          <button
                            type="button"
                            onClick={() => handleSaveBarberChanges(brb.id)}
                             disabled={Boolean(savingBarberId)}
                            className="px-3.5 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 hover:bg-emerald-500/25 text-emerald-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>
                              {savingBarberId === brb.id ? 'Verificando guardado…' : 'Guardar horarios y servicios'}
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
                      </details>
                      </div>
                    </details>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'servicios' && (
            <div className="space-y-5">
              <details className="group/newservice overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/90 open:border-zinc-700">
                <summary className="flex min-h-20 cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-zinc-800/60 focus-visible:outline-2 focus-visible:outline-emerald-400 [&::-webkit-details-marker]:hidden">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300"><Plus className="h-5 w-5"/></span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-bold">Agregar servicio</span><span className="mt-0.5 block text-xs text-zinc-400">Nombre, precio y duración</span></span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400 transition-transform group-open/newservice:rotate-180"/>
                </summary>
                <div className="grid grid-cols-1 gap-2.5 border-t border-zinc-800 p-4 sm:grid-cols-12 sm:p-5">
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
              </details>

              <div className="space-y-2.5">
                {services.map((srv) => (
                  <details key={srv.id} className="group/service overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/90 open:border-zinc-700">
                    <summary className="flex min-h-[76px] cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-zinc-800/60 focus-visible:outline-2 focus-visible:outline-emerald-400 [&::-webkit-details-marker]:hidden">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-zinc-200"><Scissors className="h-5 w-5"/></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold sm:text-base">{srv.name}</span>
                        <span className="mt-1 block text-xs text-zinc-400">{srv.durationMinutes} min · ${srv.price} · {srv.active !== false ? 'Habilitado' : 'Deshabilitado'}</span>
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400 transition-transform group-open/service:rotate-180"/>
                    </summary>
                    <div className="flex flex-wrap items-center gap-2.5 border-t border-zinc-800 p-4">
                      <label className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-300 cursor-pointer">
                        <input type="checkbox" className="size-4 accent-emerald-500" checked={srv.active !== false} onChange={(e) => handleToggleServiceActive(srv.id, e.target.checked)} />
                        Habilitado
                      </label>
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
                  </details>
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

              <details className="group/brand overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/50 open:border-zinc-700">
                <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-zinc-800/60 focus-visible:outline-2 focus-visible:outline-emerald-400 [&::-webkit-details-marker]:hidden">
                  <Settings className="h-5 w-5 text-emerald-400"/>
                  <span className="flex-1 text-sm font-bold">Datos generales y contacto</span>
                  <ChevronDown className="h-4 w-4 text-zinc-400 transition-transform group-open/brand:rotate-180"/>
                </summary>
              <div className="grid grid-cols-1 gap-4 border-t border-zinc-800 p-4 sm:grid-cols-2">
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
              </details>

              <details className="group/hours overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/50 open:border-zinc-700">
                <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-zinc-800/60 focus-visible:outline-2 focus-visible:outline-emerald-400 [&::-webkit-details-marker]:hidden">
                  <Clock className="h-5 w-5 text-emerald-400"/>
                  <span className="flex-1 text-sm font-bold">Horarios de atención {shopHoursDirty ? '· Cambios sin guardar' : ''}</span>
                  <ChevronDown className="h-4 w-4 text-zinc-400 transition-transform group-open/hours:rotate-180"/>
                </summary>
                <div className="space-y-3 border-t border-zinc-800 p-3 sm:p-4">
                <WeeklyScheduleEditor title="Horarios de la barbería"
                  help="Elegí qué días abrís y desde qué hora hasta qué hora. Los barberos solo podrán atender cuando el local esté abierto."
                  value={shopConfig.schedule}
                  onChange={(hours)=>{
                    setShopHoursDirty(true);
                    setShopHoursFeedback('');
                    setShopConfig(prev=>({...prev,schedule:hours}));
                  }}/>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1" aria-live="polite">
                    {shopHoursDirty&&<p className="text-xs font-semibold text-amber-300">Cambios sin guardar</p>}
                    {shopHoursFeedback&&<p role="status" className="text-xs font-semibold text-emerald-300">{shopHoursFeedback}</p>}
                    <p className="text-xs text-zinc-500">Los horarios afectan a la página de inicio y a las reservas.</p>
                  </div>
                  <button type="button" onClick={()=>{void handleSaveShopHours();}} disabled={shopHoursSaving}
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-extrabold text-zinc-950 transition-colors hover:bg-emerald-300 disabled:opacity-60 sm:w-auto">
                    <Save className="size-4"/>
                    {shopHoursSaving?'Guardando horarios…':'Guardar horarios de la barbería'}
                  </button>
                </div>
                </div>
              </details>
              <div className="flex items-center justify-between border-t border-zinc-800 pt-4">
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
                  Guardar datos generales
                </button>
              </div>
            </form>
          )}
        </main>
      </div>
    </div>
  );
}
