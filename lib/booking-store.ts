// lib/booking-store.ts
import { supabase } from './supabase';

export type BrandAccent = 'navy' | 'emerald' | 'bronze' | 'mono';

const SHOP_UUID = '11111111-1111-1111-1111-111111111113';

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export interface ServiceItem {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
  description: string;
  imageUrl?: string;
  active: boolean;
}

export interface BarberItem {
  id: string;
  slug: string;
  name: string;
  role: string;
  bio: string;
  specialties: string[];
  serviceIds: string[];
  active: boolean;
  commissionRate: number;
  pin: string;
  isOwner?: boolean;
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
  clientPhone: string;
  clientNotes?: string;
  status: 'confirmado' | 'completado' | 'cancelado';
  createdAt: string;
}

export type ExpenseCategory =
  | 'Insumos'
  | 'Alquiler / Servicios'
  | 'Adelantos / Sueldos'
  | 'Marketing'
  | 'Otros';

export interface ExpenseItem {
  id: string;
  description: string;
  amount: number;
  category: ExpenseCategory;
  date: string;
  createdAt: string;
}

export interface DaySchedule {
  open?: string;
  close?: string;
  closed?: boolean;
}

export type WeeklySchedule = Record<number, DaySchedule>;

export type CustomScheduleMap = Record<
  string,
  { isOpen: boolean; openTime: string; closeTime: string }
>;

export interface ShopConfig {
  id: string;
  name: string;
  address: string;
  phone: string;
  city?: string;
  tagline?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  backgroundImageUrl?: string;
  instagramHandle?: string;
  instagramUrl?: string;
  schedule?: CustomScheduleMap;
}

export const DEFAULT_SHOP_CONFIG: ShopConfig = {
  id: SHOP_UUID,
  name: '13´Cut',
  address: 'Avenida Agraciada 3778',
  phone: '098509376',
  city: 'Montevideo',
  tagline: 'Reserva tu turno',
  logoUrl: '',
  coverImageUrl: '',
  backgroundImageUrl: '',
  instagramHandle: '@13cut',
  instagramUrl: 'https://instagram.com',
  schedule: {
    lunes: { isOpen: false, openTime: '09:00', closeTime: '19:00' },
    martes: { isOpen: true, openTime: '09:00', closeTime: '22:00' },
    miercoles: { isOpen: true, openTime: '10:00', closeTime: '19:00' },
    jueves: { isOpen: true, openTime: '10:00', closeTime: '19:00' },
    viernes: { isOpen: true, openTime: '10:00', closeTime: '19:00' },
    sabado: { isOpen: true, openTime: '09:00', closeTime: '18:00' },
    domingo: { isOpen: false, openTime: '09:00', closeTime: '19:00' },
  },
};

export const DEFAULT_SERVICES: ServiceItem[] = [
  { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', name: 'Corte', price: 400, durationMinutes: 60, description: '60 min', active: true },
  { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', name: 'Corte & Barba', price: 500, durationMinutes: 60, description: '60 min', active: true },
  { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', name: 'Mechas', price: 1400, durationMinutes: 120, description: '120 min', active: true },
  { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', name: 'Color Global', price: 2500, durationMinutes: 120, description: '120 min', active: true },
];

export const DEFAULT_BARBERS: BarberItem[] = [
  { id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b11', slug: 'nahuel', name: 'Nahuel', role: 'Barbero', bio: '', specialties: ['Corte', 'Mechas'], serviceIds: ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44'], isOwner: true, active: true, commissionRate: 0, pin: '' },
  { id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b22', slug: 'emanuel', name: 'Emanuel', role: 'Barbero', bio: '', specialties: ['Corte'], serviceIds: ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'], isOwner: false, active: true, commissionRate: 0, pin: '' },
  { id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b33', slug: 'alexander', name: 'Alexander', role: 'Barbero', bio: '', specialties: ['Corte', 'Mechas'], serviceIds: ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44'], isOwner: false, active: true, commissionRate: 0, pin: '' },
];

export const DEFAULT_SCHEDULE: WeeklySchedule = {
  1: { closed: true },
  2: { open: '09:00', close: '22:00' },
  3: { open: '10:00', close: '19:00' },
  4: { open: '10:00', close: '19:00' },
  5: { open: '10:00', close: '19:00' },
  6: { open: '09:00', close: '18:00' },
  0: { closed: true },
};

export interface DayOption {
  dateString: string;
  dayName: string;
  dayNumber: string;
  monthName: string;
  dayOfWeek: number;
}

const DAY_INDEX_TO_KEY: Record<number, string> = {
  0: 'domingo',
  1: 'lunes',
  2: 'martes',
  3: 'miercoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sabado',
};

// ============================================================================
// MOTOR DE CACHÉ ULTRA RÁPIDO (RAM + SESSION STORAGE + DEDUPLICACIÓN)
// ============================================================================

const SESSION_CACHE_KEY = '13cut_global_store_cache_v2';
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutos para config/barberos/servicios
const SLOTS_TTL_MS = 25 * 1000; // 25 segundos para turnos ocupados

interface MemoryCache {
  shopConfig?: { data: ShopConfig; ts: number };
  services?: { data: ServiceItem[]; ts: number };
  barbers?: { data: BarberItem[]; ts: number };
  bookedSlots?: { data: AppointmentItem[]; ts: number };
}

const memCache: MemoryCache = {};
const inflightRequests: Record<string, Promise<any> | undefined> = {};

function syncToSessionStorage() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(
      SESSION_CACHE_KEY,
      JSON.stringify({
        shopConfig: memCache.shopConfig,
        services: memCache.services,
        barbers: memCache.barbers,
      })
    );
  } catch {
    // Ignorar errores de cuota
  }
}

function hydrateFromSessionStorage() {
  if (typeof window === 'undefined') return;
  if (memCache.shopConfig && memCache.services && memCache.barbers) return;
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed.shopConfig && !memCache.shopConfig) memCache.shopConfig = parsed.shopConfig;
    if (parsed.services && !memCache.services) memCache.services = parsed.services;
    if (parsed.barbers && !memCache.barbers) memCache.barbers = parsed.barbers;
  } catch {
    // Ignorar errores de parseo
  }
}

/**
 * Permite a cualquier pantalla (Home, Agendar, Barbero) obtener los datos en 0ms
 * en el primer renderizado si ya fueron cargados en otra pestaña.
 */
export function getCachedInitialData(): {
  shopConfig: ShopConfig;
  services: ServiceItem[];
  barbers: BarberItem[];
  hasCache: boolean;
} {
  hydrateFromSessionStorage();
  return {
    shopConfig: memCache.shopConfig?.data || DEFAULT_SHOP_CONFIG,
    services: memCache.services?.data || DEFAULT_SERVICES,
    barbers: memCache.barbers?.data || DEFAULT_BARBERS,
    hasCache: Boolean(memCache.shopConfig || memCache.barbers || memCache.services),
  };
}

export function invalidateStoreCache() {
  delete memCache.shopConfig;
  delete memCache.services;
  delete memCache.barbers;
  delete memCache.bookedSlots;
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(SESSION_CACHE_KEY);
    } catch {}
  }
}

// ============================================================================
// GENERADORES DE DÍAS Y HORARIOS SINCRONIZADOS CON EL SCHEDULE DEL LOCAL
// ============================================================================

export function buildRealOpenDays(
  totalDays = 30,
  customSchedule?: CustomScheduleMap
): DayOption[] {
  hydrateFromSessionStorage();
  const activeSchedule =
    customSchedule ||
    memCache.shopConfig?.data?.schedule ||
    DEFAULT_SHOP_CONFIG.schedule;

  const days: DayOption[] = [];
  const today = new Date();

  for (let i = 0; i < totalDays; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);

    const dayOfWeek = d.getDay();
    const dayKey = DAY_INDEX_TO_KEY[dayOfWeek];
    const dayRule = activeSchedule?.[dayKey];

    // Si existe configuración dinámica, respetamos isOpen; sino usamos el fallback de Mar a Sáb
    const isOpenDay = dayRule ? Boolean(dayRule.isOpen) : dayOfWeek !== 0 && dayOfWeek !== 1;

    if (isOpenDay) {
      const dayName = d.toLocaleDateString('es-UY', { weekday: 'short' }).replace('.', '');
      const dayNumber = String(d.getDate());
      const monthName = d.toLocaleDateString('es-UY', { month: 'short' }).replace('.', '');

      days.push({
        dateString: `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${dayNumber} ${
          monthName.charAt(0).toUpperCase() + monthName.slice(1)
        }`,
        dayName,
        dayNumber,
        monthName,
        dayOfWeek,
      });
    }
  }
  return days;
}

export function timeToMinutes(timeStr: string): number {
  if (!timeStr || !timeStr.includes(':')) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function getSlotsForDayOfWeek(
  dayOfWeek: number,
  stepMinutes: number = 30,
  customSchedule?: CustomScheduleMap
): { morning: string[]; afternoon: string[] } {
  hydrateFromSessionStorage();
  const activeSchedule =
    customSchedule ||
    memCache.shopConfig?.data?.schedule ||
    DEFAULT_SHOP_CONFIG.schedule;

  const dayKey = DAY_INDEX_TO_KEY[dayOfWeek];
  const dynamicRule = activeSchedule?.[dayKey];

  let openStr: string | undefined;
  let closeStr: string | undefined;
  let isClosed = false;

  if (dynamicRule) {
    isClosed = !dynamicRule.isOpen;
    openStr = dynamicRule.openTime;
    closeStr = dynamicRule.closeTime;
  } else {
    const fallbackRule = DEFAULT_SCHEDULE[dayOfWeek];
    isClosed = Boolean(!fallbackRule || fallbackRule.closed);
    openStr = fallbackRule?.open;
    closeStr = fallbackRule?.close;
  }

  if (isClosed || !openStr || !closeStr) {
    return { morning: [], afternoon: [] };
  }

  const startMins = timeToMinutes(openStr);
  const endMins = timeToMinutes(closeStr);

  const morning: string[] = [];
  const afternoon: string[] = [];

  for (let current = startMins; current + stepMinutes <= endMins; current += stepMinutes) {
    const slot = minutesToTime(current);
    if (current < 13 * 60) {
      morning.push(slot);
    } else {
      afternoon.push(slot);
    }
  }
  return { morning, afternoon };
}

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
    barberId,
    dateString,
    existingAppointments,
    allServices = [],
  } = params;

  const candidateStart = timeToMinutes(candidateTime);

  const barberDayApts = existingAppointments.filter(
    (apt) =>
      apt.barberId === barberId &&
      apt.dateString === dateString &&
      apt.status !== 'cancelado'
  );

  for (const apt of barberDayApts) {
    const aptStart = timeToMinutes(apt.timeSlot);

    let aptDuration = Number(apt.durationMinutes) || 0;
    if (!aptDuration && allServices.length > 0) {
      const matchedSrv = allServices.find((s) => s.id === apt.serviceId);
      if (matchedSrv) aptDuration = Number(matchedSrv.durationMinutes);
    }
    if (!aptDuration) aptDuration = 60;

    const aptEnd = aptStart + aptDuration;

    if (candidateStart >= aptStart && candidateStart < aptEnd) {
      return false;
    }
  }

  return true;
}

export function getAvailableSlotsForBooking(params: {
  dayOfWeek: number;
  dateString: string;
  barberId: string;
  serviceDurationMinutes: number;
  existingAppointments: AppointmentItem[];
  allServices?: ServiceItem[];
  stepMinutes?: number;
}): { morning: string[]; afternoon: string[] } {
  const {
    dayOfWeek,
    dateString,
    barberId,
    serviceDurationMinutes,
    existingAppointments,
    allServices,
    stepMinutes = 30,
  } = params;

  const rawSlots = getSlotsForDayOfWeek(dayOfWeek, stepMinutes);

  const filterFn = (slot: string) =>
    isSlotAvailable({
      candidateTime: slot,
      serviceDurationMinutes,
      barberId,
      dateString,
      dayOfWeek,
      existingAppointments,
      allServices,
    });

  return {
    morning: rawSlots.morning.filter(filterFn),
    afternoon: rawSlots.afternoon.filter(filterFn),
  };
}

export function isValidUruguayanPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('09') && digits.length === 9) return true;
  if (digits.startsWith('9') && digits.length === 8) return true;
  if (digits.startsWith('5989') && digits.length === 11) return true;
  return false;
}

export function sanitizeInput(input: string): string {
  if (!input) return '';
  return input.replace(/[<>]/g, '').trim();
}

// ============================================================================
// CAPA DE ACCESO A DATOS CON CACHÉ Y DEDUPLICACIÓN
// ============================================================================

async function callAdminOperation(payload: Record<string, any>): Promise<any> {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'No se pudo completar la operación administrativa.');
  }
  invalidateStoreCache();
  return data;
}

export async function getShopConfig(forceRefresh = false): Promise<ShopConfig> {
  hydrateFromSessionStorage();
  const now = Date.now();
  if (!forceRefresh && memCache.shopConfig && now - memCache.shopConfig.ts < CACHE_TTL_MS) {
    return memCache.shopConfig.data;
  }

  if (inflightRequests.shopConfig) return inflightRequests.shopConfig;

  inflightRequests.shopConfig = (async () => {
    try {
      if (!supabase) return DEFAULT_SHOP_CONFIG;
      const { data, error } = await supabase.from('shops').select('*').single();
      if (error || !data) return memCache.shopConfig?.data || DEFAULT_SHOP_CONFIG;

      const mapped: ShopConfig = {
        ...DEFAULT_SHOP_CONFIG,
        id: data.id ?? DEFAULT_SHOP_CONFIG.id,
        name: data.name ?? DEFAULT_SHOP_CONFIG.name,
        address: data.address ?? DEFAULT_SHOP_CONFIG.address,
        phone: data.phone ?? DEFAULT_SHOP_CONFIG.phone,
        backgroundImageUrl:
          data.background_image_url ||
          data.backgroundImageUrl ||
          DEFAULT_SHOP_CONFIG.backgroundImageUrl,
        logoUrl: data.logo_url || data.logoUrl || DEFAULT_SHOP_CONFIG.logoUrl,
        coverImageUrl:
          data.cover_image_url || data.coverImageUrl || DEFAULT_SHOP_CONFIG.coverImageUrl,
        schedule: (data as any).schedule || DEFAULT_SHOP_CONFIG.schedule,
      };

      memCache.shopConfig = { data: mapped, ts: Date.now() };
      syncToSessionStorage();
      return mapped;
    } finally {
      delete inflightRequests.shopConfig;
    }
  })();

  return inflightRequests.shopConfig;
}

export async function saveShopConfig(config: ShopConfig): Promise<void> {
  if (!supabase) return;

  const payload = {
    name: config.name,
    address: config.address,
    phone: config.phone,
    background_image_url: config.backgroundImageUrl,
    logo_url: config.logoUrl,
    cover_image_url: config.coverImageUrl,
    schedule: config.schedule || DEFAULT_SHOP_CONFIG.schedule,
  };

  const targetId = isValidUUID(config.id) ? config.id : SHOP_UUID;

  const { error } = await supabase.from('shops').update(payload).eq('id', targetId);

  if (error) {
    console.error('Error guardando shop config:', error.message);
    throw new Error(error.message);
  }

  memCache.shopConfig = { data: { ...config, id: targetId }, ts: Date.now() };
  syncToSessionStorage();
}

export async function getServices(forceRefresh = false): Promise<ServiceItem[]> {
  hydrateFromSessionStorage();
  const now = Date.now();
  if (!forceRefresh && memCache.services && now - memCache.services.ts < CACHE_TTL_MS) {
    return memCache.services.data;
  }

  if (inflightRequests.services) return inflightRequests.services;

  inflightRequests.services = (async () => {
    try {
      const { data, error } = await supabase
        .from('services')
        .select('id, name, price, duration_minutes, description, image_url, active')
        .eq('shop_id', SHOP_UUID)
        .order('price', { ascending: true });

      if (error || !data || data.length === 0) {
        return memCache.services?.data || DEFAULT_SERVICES;
      }

      const mapped: ServiceItem[] = data.map((s) => ({
        id: s.id,
        name: s.name,
        price: Number(s.price),
        durationMinutes: Number(s.duration_minutes) || 60,
        description: s.description || `${s.duration_minutes || 60} min`,
        imageUrl: s.image_url,
        active: s.active ?? true,
      }));

      memCache.services = { data: mapped, ts: Date.now() };
      syncToSessionStorage();
      return mapped;
    } finally {
      delete inflightRequests.services;
    }
  })();

  return inflightRequests.services;
}

export async function saveServices(services: ServiceItem[]): Promise<void> {
  await callAdminOperation({
    operation: 'SAVE_SERVICES',
    services,
  });
}

export async function deleteServiceFromDb(id: string): Promise<void> {
  if (!isValidUUID(id)) return;
  await callAdminOperation({
    operation: 'DELETE_SERVICE',
    id,
  });
}

export async function getBarbers(forceRefresh = false): Promise<BarberItem[]> {
  hydrateFromSessionStorage();
  const now = Date.now();
  if (!forceRefresh && memCache.barbers && now - memCache.barbers.ts < CACHE_TTL_MS) {
    return memCache.barbers.data;
  }

  if (inflightRequests.barbers) return inflightRequests.barbers;

  inflightRequests.barbers = (async () => {
    try {
      const { data, error } = await supabase
        .from('barbers')
        .select('id, slug, name, role, bio, specialties, service_ids, active')
        .eq('shop_id', SHOP_UUID);

      if (error || !data || data.length === 0) {
        return memCache.barbers?.data || DEFAULT_BARBERS;
      }

      const mapped: BarberItem[] = data.map((b) => ({
        id: b.id,
        slug: b.slug || b.name.toLowerCase(),
        name: b.name,
        role: b.role || 'Barbero',
        bio: b.bio || '',
        specialties: b.specialties || ['Corte'],
        serviceIds: Array.isArray(b.service_ids) ? b.service_ids : [],
        active: b.active ?? true,
        commissionRate: 0,
        pin: '',
        isOwner: false,
      }));

      memCache.barbers = { data: mapped, ts: Date.now() };
      syncToSessionStorage();
      return mapped;
    } finally {
      delete inflightRequests.barbers;
    }
  })();

  return inflightRequests.barbers;
}

export async function getAdminBarbers(): Promise<BarberItem[]> {
  const res = await fetch('/api/admin?resource=barbers', { cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || 'No autorizado para leer barberos de administración.');
  }
  const data = Array.isArray(json.data) ? json.data : [];
  return data.map((b: any) => ({
    id: b.id,
    slug: b.slug || b.name.toLowerCase(),
    name: b.name,
    role: b.role || 'Barbero',
    bio: b.bio || '',
    specialties: b.specialties || ['Corte'],
    serviceIds: Array.isArray(b.service_ids) ? b.service_ids : [],
    active: b.active ?? true,
    commissionRate: Number(b.commission_rate ?? 50),
    pin: b.pin || '1234',
    isOwner: Number(b.commission_rate) === 100,
  }));
}

export async function saveBarbers(barbers: BarberItem[]): Promise<void> {
  await callAdminOperation({
    operation: 'SAVE_BARBERS',
    barbers,
  });
}

export async function deleteBarberFromDb(id: string): Promise<void> {
  if (!isValidUUID(id)) return;
  await callAdminOperation({
    operation: 'DELETE_BARBER',
    id,
  });
}

export async function getPublicBookedSlots(forceRefresh = false): Promise<AppointmentItem[]> {
  const now = Date.now();
  if (!forceRefresh && memCache.bookedSlots && now - memCache.bookedSlots.ts < SLOTS_TTL_MS) {
    return memCache.bookedSlots.data;
  }

  if (inflightRequests.bookedSlots) return inflightRequests.bookedSlots;

  inflightRequests.bookedSlots = (async () => {
    try {
      const res = await fetch('/api/public/booking', { cache: 'no-store' });
      if (!res.ok) return memCache.bookedSlots?.data || [];
      const json = await res.json().catch(() => ({}));
      const list = Array.isArray(json.appointments) ? json.appointments : [];
      memCache.bookedSlots = { data: list, ts: Date.now() };
      return list;
    } finally {
      delete inflightRequests.bookedSlots;
    }
  })();

  return inflightRequests.bookedSlots;
}

export async function getAppointments(): Promise<AppointmentItem[]> {
  const res = await fetch('/api/admin?resource=appointments', { cache: 'no-store' });
  if (!res.ok) {
    return getPublicBookedSlots(true);
  }
  const json = await res.json().catch(() => ({}));
  const data = Array.isArray(json.data) ? json.data : [];

  return data.map((apt: any) => ({
    id: apt.id,
    code: apt.code || '13C-0000',
    serviceId: apt.service_id,
    serviceName: apt.services?.name || 'Servicio',
    servicePrice: Number(apt.price_snapshot ?? apt.services?.price ?? 0),
    priceSnapshot: Number(apt.price_snapshot ?? 0),
    durationMinutes: Number(apt.duration_minutes ?? apt.services?.duration_minutes ?? 60),
    barberId: apt.barber_id,
    barberName: apt.barbers?.name || 'Barbero',
    dateString: apt.date_string,
    timeSlot: apt.time_slot,
    clientName: apt.client_name,
    clientPhone: apt.client_phone,
    clientNotes: apt.client_notes,
    status: apt.status || 'confirmado',
    createdAt: apt.created_at,
  }));
}

export async function createAppointment(
  data: Omit<AppointmentItem, 'id' | 'code' | 'status' | 'createdAt' | 'durationMinutes'> & {
    durationMinutes?: number;
  }
): Promise<AppointmentItem> {
  const res = await fetch('/api/public/booking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceId: data.serviceId,
      barberId: data.barberId,
      dateString: data.dateString,
      timeSlot: data.timeSlot,
      clientName: data.clientName,
      clientPhone: data.clientPhone,
      clientNotes: data.clientNotes || '',
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.appointment) {
    throw new Error(json.error || 'No se pudo guardar el turno.');
  }

  delete memCache.bookedSlots;
  return json.appointment as AppointmentItem;
}

export async function updateAppointmentStatus(
  id: string,
  status: AppointmentItem['status']
): Promise<AppointmentItem[]> {
  const res = await fetch('/api/barber', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || 'No autorizado para actualizar el estado del turno.');
  }
  delete memCache.bookedSlots;
  return await getAppointments();
}

export async function unlockBarberPanelWithPin(
  barberId: string,
  pin: string
): Promise<{ commissionRate: number; appointments: AppointmentItem[] }> {
  const res = await fetch('/api/barber', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ barberId, pin }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) {
    throw new Error(json.error || 'PIN incorrecto.');
  }
  return {
    commissionRate: Number(json.commissionRate ?? 50),
    appointments: Array.isArray(json.appointments) ? json.appointments : [],
  };
}

export async function getExpenses(): Promise<ExpenseItem[]> {
  const res = await fetch('/api/admin?resource=expenses', { cache: 'no-store' });
  if (!res.ok) return [];
  const json = await res.json().catch(() => ({}));
  const data = Array.isArray(json.data) ? json.data : [];

  return data.map((e: any) => ({
    id: e.id,
    description: e.description,
    amount: Number(e.amount),
    category: (e.category as ExpenseCategory) || 'Insumos',
    date: e.expense_date,
    createdAt: e.created_at,
  }));
}

export async function createExpense(
  data: Omit<ExpenseItem, 'id' | 'createdAt'>
): Promise<ExpenseItem[]> {
  await callAdminOperation({
    operation: 'CREATE_EXPENSE',
    expense: data,
  });
  return await getExpenses();
}

export async function deleteExpense(id: string): Promise<ExpenseItem[]> {
  await callAdminOperation({
    operation: 'DELETE_EXPENSE',
    id,
  });
  return await getExpenses();
}