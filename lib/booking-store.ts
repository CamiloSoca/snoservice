// lib/booking-store.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export const SHOP_UUID = '11111111-1111-1111-1111-111111111113';
export const SHOP_PREFIX = '13C';

export interface ShopConfig {
  id: string;
  name: string;
  phone: string;
  address: string;
  city: string;
  logoUrl?: string;
  backgroundImageUrl?: string;
  coverImageUrl?: string;
  instagramHandle?: string;
  instagramUrl?: string;
  schedule: Record<string, { isOpen: boolean; openTime: string; closeTime: string }>;
}

export const DEFAULT_SHOP_CONFIG: ShopConfig = {
  id: SHOP_UUID,
  name: '13-Cut Barbería',
  phone: '098509376',
  address: 'Avenida Agraciada 3778',
  city: 'Montevideo',
  logoUrl: '',
  backgroundImageUrl: '',
  coverImageUrl: '',
  schedule: {
    lunes: { isOpen: false, openTime: '09:00', closeTime: '19:00' },
    martes: { isOpen: true, openTime: '09:00', closeTime: '19:00' },
    miercoles: { isOpen: true, openTime: '09:00', closeTime: '19:00' },
    jueves: { isOpen: true, openTime: '09:00', closeTime: '19:00' },
    viernes: { isOpen: true, openTime: '09:00', closeTime: '19:00' },
    sabado: { isOpen: true, openTime: '09:00', closeTime: '19:00' },
    domingo: { isOpen: false, openTime: '09:00', closeTime: '19:00' },
  },
};

export interface ServiceItem {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
  description?: string;
  imageUrl?: string;
  active?: boolean;
}

export interface BarberItem {
  id: string;
  slug?: string;
  name: string;
  role?: string;
  bio?: string;
  specialties?: string[];
  serviceIds?: string[];
  isOwner?: boolean;
  active?: boolean;
  commissionRate: number;
  pin: string;
}

export interface AppointmentItem {
  id: string;
  code: string;
  serviceId: string;
  serviceName: string;
  servicePrice: number;
  priceSnapshot?: number;
  durationMinutes: number;
  barberId: string;
  barberName: string;
  dateString: string;
  timeSlot: string;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  clientNotes?: string;
  status: 'confirmado' | 'completado' | 'cancelado';
  createdAt: string;
}

export type ExpenseCategory = 'Insumos' | 'Alquiler / Servicios' | 'Adelantos / Sueldos' | 'Marketing' | 'Otros';

export interface ExpenseItem {
  id: string;
  description: string;
  amount: number;
  category: ExpenseCategory;
  date: string;
  createdAt?: string;
}

export interface TipItem {
  id: string;
  barberId: string;
  barberName?: string;
  amount: number;
  note?: string;
  dateString: string;
  createdAt: string;
}

export interface ManualChargeItem {
  id: string;
  barberId: string;
  barberName?: string;
  amount: number;
  note?: string;
  dateString: string;
  createdAt: string;
}

export interface DayOption {
  dateString: string;
  dayName: string;
  dayNumber: string;
  monthName: string;
  dayOfWeek: number;
}

export const DEFAULT_SERVICES: ServiceItem[] = [
  { id: 's1', name: 'Corte', price: 400, durationMinutes: 30, description: '30 min', active: true },
  { id: 's2', name: 'Corte & Barba', price: 600, durationMinutes: 45, description: '45 min', active: true },
];

export const DEFAULT_BARBERS: BarberItem[] = [
  {
    id: 'b1',
    slug: 'nahuel',
    name: 'Nahuel',
    role: 'Barbero Principal',
    bio: 'Especialista en fades.',
    specialties: ['Fade'],
    serviceIds: ['s1', 's2'],
    isOwner: true,
    active: true,
    commissionRate: 100,
    pin: '1234',
  },
];

let cachedShopConfig: ShopConfig = DEFAULT_SHOP_CONFIG;
let cachedServices: ServiceItem[] = DEFAULT_SERVICES;
let cachedBarbers: BarberItem[] = DEFAULT_BARBERS;

export function getCachedInitialData(): {
  shopConfig: ShopConfig;
  services: ServiceItem[];
  barbers: BarberItem[];
} {
  return {
    shopConfig: cachedShopConfig || DEFAULT_SHOP_CONFIG,
    services: Array.isArray(cachedServices) && cachedServices.length > 0 ? cachedServices : DEFAULT_SERVICES,
    barbers: Array.isArray(cachedBarbers) && cachedBarbers.length > 0 ? cachedBarbers : DEFAULT_BARBERS,
  };
}

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function isValidUUID(id: string): boolean {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export function timeToMinutes(timeStr: string): number {
  if (!timeStr || !timeStr.includes(':')) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToTime(totalMins: number): string {
  const h = Math.floor(totalMins / 60) % 24;
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function canCompleteAppointment(dateString: string): boolean {
  if (!dateString) return true;

  const monthMap: Record<string, number> = {
    ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
    jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11,
    enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
    julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
  };

  const clean = dateString
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const now = new Date();
  let day: number | null = null;
  let month: number = now.getMonth();
  let year: number = now.getFullYear();

  for (const t of clean) {
    if (!isNaN(Number(t))) {
      const num = Number(t);
      if (num > 31) {
        year = num;
      } else if (day === null) {
        day = num;
      }
    } else if (monthMap[t] !== undefined) {
      month = monthMap[t];
    }
  }

  if (day === null) return true;

  if (now.getMonth() === 11 && month === 0 && year === now.getFullYear()) {
    year += 1;
  }

  const aptDate = new Date(year, month, day, 0, 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  return aptDate.getTime() <= todayEnd.getTime();
}

export function sortAppointmentsChronologically(apts: AppointmentItem[]): AppointmentItem[] {
  const monthMap: Record<string, number> = {
    ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
    jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11,
    enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
    julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
  };

  return [...apts].sort((a, b) => {
    const parseDate = (dStr: string) => {
      if (!dStr) return 0;
      const clean = dStr
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
      let day: number | null = null;
      let month = 0;
      let year = new Date().getFullYear();
      for (const t of clean) {
        if (!isNaN(Number(t))) {
          const num = Number(t);
          if (num > 31) year = num;
          else if (day === null) day = num;
        } else if (monthMap[t] !== undefined) {
          month = monthMap[t];
        }
      }
      return new Date(year, month, day ?? 1).getTime();
    };

    const timeA = timeToMinutes(a.timeSlot);
    const timeB = timeToMinutes(b.timeSlot);
    const dateA = parseDate(a.dateString);
    const dateB = parseDate(b.dateString);
    if (dateA !== dateB) return dateA - dateB;
    return timeA - timeB;
  });
}

export function buildRealOpenDays(count = 30, scheduleRule?: ShopConfig['schedule']): DayOption[] {
  const days: DayOption[] = [];
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const dayKeyMap = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const now = new Date();
  const schedule = scheduleRule || DEFAULT_SHOP_CONFIG.schedule;

  for (let i = 0; i < count; i++) {
    const d = new Date(now.getTime());
    d.setDate(now.getDate() + i);
    const dayOfWeek = d.getDay();
    const key = dayKeyMap[dayOfWeek];
    const rule = schedule[key] || { isOpen: true };
    if (rule.isOpen !== false) {
      days.push({
        dateString: `${dayNames[dayOfWeek]} ${d.getDate()} ${monthNames[d.getMonth()]}`,
        dayName: dayNames[dayOfWeek],
        dayNumber: String(d.getDate()),
        monthName: monthNames[d.getMonth()],
        dayOfWeek,
      });
    }
  }
  return days.length > 0
    ? days
    : [{ dateString: 'Hoy', dayName: 'Hoy', dayNumber: '1', monthName: 'Ene', dayOfWeek: 2 }];
}

export function getSlotsForDayOfWeek(
  dayOfWeek: number,
  intervalMinutes = 30,
  schedule?: ShopConfig['schedule']
): { morning: string[]; afternoon: string[] } {
  const dayKeyMap = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const key = dayKeyMap[dayOfWeek] || 'martes';
  const activeSchedule = schedule || cachedShopConfig.schedule || DEFAULT_SHOP_CONFIG.schedule;
  const rule = activeSchedule[key] || { isOpen: true, openTime: '09:00', closeTime: '19:00' };

  if (rule.isOpen === false) {
    return { morning: [], afternoon: [] };
  }

  const openMins = timeToMinutes(rule.openTime || '09:00');
  const closeMins = timeToMinutes(rule.closeTime || '19:00');
  const step = Math.max(15, Number(intervalMinutes) || 30);

  const morning: string[] = [];
  const afternoon: string[] = [];

  for (let m = openMins; m < closeMins; m += step) {
    const formatted = minutesToTime(m);
    if (m < 13 * 60) {
      morning.push(formatted);
    } else {
      afternoon.push(formatted);
    }
  }

  return { morning, afternoon };
}

// Las duraciones son estimadas. La agenda permite aprovechar SOLO huecos
// anteriores a reservas existentes, nunca pisar un turno ya iniciado.
// Servicios >90 minutos son estrictos en ambas direcciones.
export function isSlotAvailable(params: {
  candidateTime: string;
  serviceDurationMinutes: number;
  barberId: string;
  dateString: string;
  dayOfWeek?: number;
  existingAppointments: AppointmentItem[];
  allServices?: ServiceItem[];
}): boolean {
  const {
    candidateTime,
    serviceDurationMinutes,
    barberId,
    dateString,
    existingAppointments,
    allServices,
  } = params;

  if (!candidateTime || !barberId || !dateString) return false;
  const candidateStart = timeToMinutes(candidateTime);
  const duration = Math.max(15, Number(serviceDurationMinutes) || 60);
  const candidateEnd = candidateStart + duration;
  const FLEXIBLE_LIMIT_MINUTES = 90;
  const MINIMUM_START_GAP_MINUTES = 30;

  for (const apt of Array.isArray(existingAppointments) ? existingAppointments : []) {
    if (apt.status === 'cancelado') continue;
    if (apt.barberId !== barberId || apt.dateString !== dateString) continue;

    const aptStart = timeToMinutes(apt.timeSlot);
    const matchedDuration = allServices?.find((s) => s.id === apt.serviceId)?.durationMinutes;
    const aptDuration = Math.max(15, Number(apt.durationMinutes || matchedDuration) || 60);
    const aptEnd = aptStart + aptDuration;

    // Nunca asignar el mismo horario exacto.
    if (aptStart === candidateStart) return false;

    if (aptStart < candidateStart) {
      // Si el cliente EXISTENTE llegó primero a la agenda, se respeta
      // su duración hacia adelante, aunque su corte sea flexible.
      if (aptEnd > candidateStart) return false;
    } else if (candidateEnd > aptStart) {
      // Solo una reserva CORTA que se agrega ANTES de otra reserva CORTA
      // puede usar el hueco previo de >=30 min.
      if (duration > FLEXIBLE_LIMIT_MINUTES ||
          aptDuration > FLEXIBLE_LIMIT_MINUTES ||
          aptStart - candidateStart < MINIMUM_START_GAP_MINUTES) {
        return false;
      }
    }
  }

  return true;
}

async function apiRequest(path: string, options?: RequestInit): Promise<any> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'No se pudo completar la operación.');
  return payload;
}

function jsonRequest(method: string, data: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
}

function mapService(d: any): ServiceItem {
  return {
    id: d.id,
    name: d.name,
    price: Number(d.price) || 0,
    durationMinutes: Number(d.duration_minutes) || 60,
    description: d.description || '',
    imageUrl: d.image_url || '',
    active: d.active ?? true,
  };
}

function mapBarber(d: any): BarberItem {
  return {
    id: d.id,
    slug: d.slug || '',
    name: d.name,
    role: d.role || 'Barbero',
    bio: d.bio || '',
    specialties: d.specialties || [],
    serviceIds: d.service_ids || [],
    isOwner: d.is_owner ?? false,
    active: d.active ?? true,
    commissionRate: Number(d.commission_rate ?? 0),
    pin: d.pin || '',
  };
}

function mapAppointment(d: any): AppointmentItem {
  const srv = Array.isArray(d.services) ? d.services[0] : d.services;
  const brb = Array.isArray(d.barbers) ? d.barbers[0] : d.barbers;
  return {
    id: d.id, code: d.code || '',
    serviceId: d.service_id, serviceName: srv?.name || 'Servicio',
    servicePrice: Number(srv?.price ?? d.price_snapshot ?? 0),
    priceSnapshot: Number(d.price_snapshot ?? 0),
    durationMinutes: Number(d.duration_minutes ?? srv?.duration_minutes ?? 60),
    barberId: d.barber_id, barberName: brb?.name || 'Barbero',
    dateString: d.date_string, timeSlot: d.time_slot,
    clientName: d.client_name || '', clientPhone: d.client_phone || '',
    clientEmail: d.client_email || '', clientNotes: d.client_notes || '',
    status: d.status || 'confirmado', createdAt: d.created_at,
  };
}

export async function getShopConfig(forceRefresh = false): Promise<ShopConfig> {
  if (!supabase) throw new Error('Falta la configuración pública de Supabase.');
  const { data, error } = await supabase
    .from('shops')
    .select('id,name,phone,address,city,logo_url,background_image_url,cover_image_url,schedule')
    .eq('id', SHOP_UUID)
    .maybeSingle();
  if (error) throw new Error('No se pudo cargar la información del local.');
  if (!data) return cachedShopConfig;
  const config: ShopConfig = {
    id: data.id,
    name: data.name || DEFAULT_SHOP_CONFIG.name,
    phone: data.phone || DEFAULT_SHOP_CONFIG.phone,
    address: data.address || DEFAULT_SHOP_CONFIG.address,
    city: data.city || DEFAULT_SHOP_CONFIG.city,
    logoUrl: data.logo_url || '',
    backgroundImageUrl: data.background_image_url || '',
    coverImageUrl: data.cover_image_url || '',
    schedule: data.schedule || DEFAULT_SHOP_CONFIG.schedule,
  };
  cachedShopConfig = config;
  return config;
}

export async function saveShopConfig(cfg: ShopConfig): Promise<void> {
  await apiRequest('/api/admin', jsonRequest('POST', {operation: 'SAVE_SHOP_CONFIG', config: cfg}));
  cachedShopConfig = cfg;
}

export async function getServices(forceRefresh = false): Promise<ServiceItem[]> {
  if (!supabase) throw new Error('Falta la configuración pública de Supabase.');
  const { data, error } = await supabase
    .from('services')
    .select('id,name,price,duration_minutes,description,image_url,active')
    .eq('shop_id', SHOP_UUID)
    .eq('active', true);
  if (error) throw new Error('No se pudieron cargar los servicios.');
  const items = (data || []).map(mapService);
  cachedServices = items;
  return items;
}

export async function getAdminServices(forceRefresh = false): Promise<ServiceItem[]> {
  const { data } = await apiRequest('/api/admin?resource=services');
  const items = (data || []).map(mapService);
  cachedServices = items;
  return items;
}

export async function saveServices(services: ServiceItem[]): Promise<void> {
  await apiRequest('/api/admin', jsonRequest('POST', {operation: 'SAVE_SERVICES', services}));
  cachedServices = services;
}

export async function deleteServiceFromDb(id: string): Promise<void> {
  await apiRequest('/api/admin', jsonRequest('POST', {operation: 'DELETE_SERVICE', id}));
}

export async function getBarbers(forceRefresh = false): Promise<BarberItem[]> {
  if (!supabase) throw new Error('Falta la configuración pública de Supabase.');
  // Nunca consultar PIN o comisiones desde el navegador público.
  const { data, error } = await supabase
    .from('barbers')
    .select('id,slug,name,role,bio,specialties,service_ids,active')
    .eq('shop_id', SHOP_UUID)
    .eq('active', true);
  if (error) throw new Error('No se pudieron cargar los barberos.');
  const items = (data || []).map(mapBarber);
  cachedBarbers = items;
  return items;
}

export async function getAdminBarbers(forceRefresh = false): Promise<BarberItem[]> {
  const { data } = await apiRequest('/api/admin?resource=barbers');
  const items = (data || []).map(mapBarber);
  cachedBarbers = items;
  return items;
}

export async function saveBarbers(barbers: BarberItem[]): Promise<void> {
  await apiRequest('/api/admin', jsonRequest('POST', {operation: 'SAVE_BARBERS', barbers}));
  cachedBarbers = barbers;
}

export async function deleteBarberFromDb(id: string): Promise<void> {
  await apiRequest('/api/admin', jsonRequest('POST', {operation: 'DELETE_BARBER', id}));
}

export async function getAppointments(forceRefresh = false): Promise<AppointmentItem[]> {
  const { data } = await apiRequest('/api/admin?resource=appointments');
  return (data || []).map(mapAppointment);
}

export interface AdminDashboardSnapshot {
  appointments: AppointmentItem[];
  services: ServiceItem[];
  barbers: BarberItem[];
  expenses: ExpenseItem[];
  tips: TipItem[];
  manualCharges: ManualChargeItem[];
  config: ShopConfig;
  cashStatus: 'abierta' | 'cerrada';
  lastClosedDate: string;
}

// Reemplaza las ocho peticiones iniciales del admin por una sola petición.
// La API verifica la sesión antes de consultar datos privados.
export async function getAdminDashboardSnapshot(): Promise<AdminDashboardSnapshot> {
  const payload = await apiRequest('/api/admin/bootstrap', { cache: 'no-store' });

  const appointments = (payload.appointments || []).map(mapAppointment);
  const services = (payload.services || []).map(mapService);
  const barbers = (payload.barbers || []).map(mapBarber);
  const expenses: ExpenseItem[] = (payload.expenses || []).map((d: any) => ({
    id: d.id,
    description: d.description,
    amount: Number(d.amount) || 0,
    category: d.category || 'Otros',
    date: d.expense_date || '',
    createdAt: d.created_at,
  }));
  const tips = (payload.tips || []).map(mapFinancialEntry);
  const manualCharges = (payload.manualCharges || []).map(mapFinancialEntry);

  const shop = payload.shop;
  const config: ShopConfig = shop ? {
    id: shop.id,
    name: shop.name || DEFAULT_SHOP_CONFIG.name,
    phone: shop.phone || DEFAULT_SHOP_CONFIG.phone,
    address: shop.address || DEFAULT_SHOP_CONFIG.address,
    city: shop.city || DEFAULT_SHOP_CONFIG.city,
    logoUrl: shop.logo_url || '',
    backgroundImageUrl: shop.background_image_url || '',
    coverImageUrl: shop.cover_image_url || '',
    schedule: shop.schedule || DEFAULT_SHOP_CONFIG.schedule,
  } : cachedShopConfig;

  const cash = payload.cashRegisters?.[0];
  cachedShopConfig = config;
  cachedServices = services;
  cachedBarbers = barbers;

  return {
    appointments,
    services,
    barbers,
    expenses,
    tips,
    manualCharges,
    config,
    cashStatus: cash?.status === 'abierta' ? 'abierta' : 'cerrada',
    lastClosedDate: cash?.closed_at ? cash.closed_at.split('T')[0] : '',
  };
}

export async function getPublicBookedSlots(forceRefresh = false): Promise<AppointmentItem[]> {
  const { appointments } = await apiRequest('/api/public/booking', {cache: 'no-store'});
  return (appointments || []) as AppointmentItem[];
}

export async function createAppointment(item: {
  serviceId: string;
  serviceName?: string;
  servicePrice?: number;
  priceSnapshot?: number;
  durationMinutes?: number;
  barberId: string;
  barberName?: string;
  dateString: string;
  timeSlot: string;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  clientNotes?: string;
}): Promise<AppointmentItem> {
  const { appointment } = await apiRequest('/api/public/booking', jsonRequest('POST', item));
  return appointment as AppointmentItem;
}

export async function updateAppointmentStatus(
  id: string,
  status: AppointmentItem['status']
): Promise<AppointmentItem[]> {
  await apiRequest('/api/barber', jsonRequest('PATCH', { id, status }));
  const admin = await fetch('/api/admin?resource=appointments', {credentials: 'same-origin', cache: 'no-store'});
  if (admin.ok) {
    const payload = await admin.json();
    return (payload.data || []).map(mapAppointment);
  }
  if (admin.status !== 401) throw new Error('No se pudo recargar la agenda.');
  const { appointments } = await apiRequest('/api/barber', {cache: 'no-store'});
  return appointments || [];
}

export async function getExpenses(): Promise<ExpenseItem[]> {
  const { data } = await apiRequest('/api/admin?resource=expenses');
  return (data || []).map((d: any) => ({
    id: d.id, description: d.description, amount: Number(d.amount) || 0,
    category: d.category || 'Otros', date: d.expense_date || '',
    createdAt: d.created_at,
  }));
}

export async function createExpense(item: {
  description: string;
  amount: number;
  category: ExpenseCategory;
  date: string;
}): Promise<ExpenseItem[]> {
  await apiRequest('/api/admin', jsonRequest('POST', {operation: 'CREATE_EXPENSE', expense: item}));
  return getExpenses();
}

export async function deleteExpense(id: string): Promise<ExpenseItem[]> {
  await apiRequest('/api/admin', jsonRequest('POST', {operation: 'DELETE_EXPENSE', id}));
  return getExpenses();
}

function mapFinancialEntry(d: any): TipItem {
  return {
    id: d.id, barberId: d.barber_id,
    barberName: d.barbers?.name || 'Barbero',
    amount: Number(d.amount) || 0,
    note: d.note || '', dateString: d.date_string || '',
    createdAt: d.created_at,
  };
}

export async function getTips(barberId?: string): Promise<TipItem[]> {
  const query = new URLSearchParams({resource: 'tips'});
  if (barberId) query.set('barberId', barberId);
  const { data } = await apiRequest('/api/finance?' + query.toString(), {cache: 'no-store'});
  return (data || []).map(mapFinancialEntry);
}

export async function createTip(item: {
  barberId: string;
  amount: number;
  note?: string;
}): Promise<TipItem[]> {
  await apiRequest('/api/finance', jsonRequest('POST', {resource: 'tips', item}));
  return getTips();
}

export async function deleteTip(id: string): Promise<TipItem[]> {
  await apiRequest('/api/finance', jsonRequest('DELETE', {resource: 'tips', id}));
  return getTips();
}

export async function getManualCharges(barberId?: string): Promise<ManualChargeItem[]> {
  const query = new URLSearchParams({resource: 'manual_charges'});
  if (barberId) query.set('barberId', barberId);
  const { data } = await apiRequest('/api/finance?' + query.toString(), {cache: 'no-store'});
  return (data || []).map(mapFinancialEntry);
}

export async function createManualCharge(item: {
  barberId: string;
  amount: number;
  note?: string;
}): Promise<ManualChargeItem[]> {
  await apiRequest('/api/finance', jsonRequest('POST', {resource: 'manual_charges', item}));
  return getManualCharges();
}

export async function deleteManualCharge(id: string): Promise<ManualChargeItem[]> {
  await apiRequest('/api/finance', jsonRequest('DELETE', {resource: 'manual_charges', id}));
  return getManualCharges();
}

export async function unlockBarberPanelWithPin(barberId: string, pin: string) {
  const result = await apiRequest('/api/barber', jsonRequest('POST', {barberId, pin}));
  return {
    commissionRate: Number(result.commissionRate) || 50,
    appointments: (result.appointments || []) as AppointmentItem[],
  };
}

export function isValidUruguayanPhone(phone: string): boolean {
  if (!phone) return false;
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 8 && cleaned.length <= 12;
}

export function sanitizeInput(input: string): string {
  if (!input) return '';
  return input.replace(/[<>]/g, '').trim();
}