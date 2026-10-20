// lib/booking-store.ts
import { supabase } from './supabase';

export type BrandAccent = 'navy' | 'emerald' | 'bronze' | 'mono';

export const SHOP_UUID =
  process.env.NEXT_PUBLIC_SHOP_ID || '11111111-1111-1111-1111-111111111113';

export function getShopPrefix(shopName?: string): string {
  if (!shopName) return process.env.NEXT_PUBLIC_SHOP_PREFIX || '13C';
  const clean = shopName.replace(/[^a-zA-Z0-9]/g, '').trim();
  if (clean.length >= 3) {
    return clean.slice(0, 3).toUpperCase();
  } else if (clean.length > 0) {
    return clean.toUpperCase();
  }
  return 'TC';
}

export const SHOP_PREFIX = process.env.NEXT_PUBLIC_SHOP_PREFIX || '13C';

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
  clientPhone?: string; // 👈 Mantenido oculto por compatibilidad con la BD
  clientEmail: string;  // 👈 Nuevo campo principal
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

export interface TipItem {
  id: string;
  barberId: string;
  barberName?: string;
  amount: number;
  note?: string;
  dateString: string;
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
  name: process.env.NEXT_PUBLIC_SHOP_NAME || '13´Cut',
  address: process.env.NEXT_PUBLIC_SHOP_ADDRESS || 'Avenida Agraciada 3778',
  phone: process.env.NEXT_PUBLIC_SHOP_PHONE || '098509376',
  city: process.env.NEXT_PUBLIC_SHOP_CITY || 'Montevideo',
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

const MONTH_NAME_TO_NUMBER: Record<string, number> = {
  ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
  jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11,
};

export function getCachedInitialData() {
  return {
    shopConfig: DEFAULT_SHOP_CONFIG,
    services: DEFAULT_SERVICES,
    barbers: DEFAULT_BARBERS,
    hasCache: false,
  };
}

export function sortAppointmentsChronologically(appointments: AppointmentItem[]): AppointmentItem[] {
  return [...appointments].sort((a, b) => {
    try {
      const parseDateStr = (dateStr: string, timeStr: string) => {
        const parts = dateStr.toLowerCase().split(' ');
        const dayNum = parseInt(parts[1]) || 1;
        const monthStr = parts[2]?.replace('.', '') || 'ene';
        const monthNum = MONTH_NAME_TO_NUMBER[monthStr] ?? 0;
        
        const [hours, mins] = (timeStr || '09:00').split(':').map(Number);
        const now = new Date();
        let year = now.getFullYear();
        const d = new Date(year, monthNum, dayNum, hours || 0, mins || 0);
        return d.getTime();
      };

      const timeA = parseDateStr(a.dateString, a.timeSlot);
      const timeB = parseDateStr(b.dateString, b.timeSlot);
      return timeA - timeB;
    } catch {
      return 0;
    }
  });
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

export function buildRealOpenDays(
  totalDays = 30,
  customSchedule?: CustomScheduleMap
): DayOption[] {
  const activeSchedule = customSchedule || DEFAULT_SHOP_CONFIG.schedule;
  const days: DayOption[] = [];
  const today = new Date();

  for (let i = 0; i < totalDays; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);

    const dayOfWeek = d.getDay();
    const dayKey = DAY_INDEX_TO_KEY[dayOfWeek];
    const dayRule = activeSchedule?.[dayKey];

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
  const activeSchedule = customSchedule || DEFAULT_SHOP_CONFIG.schedule;
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
  const interval = Math.max(15, Number(stepMinutes) || 30);

  for (let current = startMins; current + interval <= endMins; current += interval) {
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
    serviceDurationMinutes,
    barberId,
    dateString,
    existingAppointments,
    allServices = [],
  } = params;

  const candidateStart = timeToMinutes(candidateTime);
  const durNew = Number(serviceDurationMinutes) || 60;
  const candidateEnd = candidateStart + durNew;

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

    if (candidateStart < aptStart && candidateEnd > aptStart) {
      const overlapMinutes = candidateEnd - aptStart;
      const MAX_ALLOWED_OVERLAP_MINUTES = 30;

      if (overlapMinutes > MAX_ALLOWED_OVERLAP_MINUTES) {
        return false;
      }
    }
  }
  return true;
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
  return data;
}

export async function getShopConfig(forceRefresh = false): Promise<ShopConfig> {
  try {
    if (!forceRefresh && typeof window !== 'undefined') {
      const cached = sessionStorage.getItem('shop_config_cache');
      if (cached) return JSON.parse(cached);
    }

    if (!supabase) return DEFAULT_SHOP_CONFIG;
    const { data, error } = await supabase
      .from('shops')
      .select('*')
      .eq('id', SHOP_UUID)
      .maybeSingle();

    if (error || !data) return DEFAULT_SHOP_CONFIG;

    const cfg: ShopConfig = {
      ...DEFAULT_SHOP_CONFIG,
      id: data.id ?? DEFAULT_SHOP_CONFIG.id,
      name: data.name ?? DEFAULT_SHOP_CONFIG.name,
      address: data.address ?? DEFAULT_SHOP_CONFIG.address,
      phone: data.phone ?? DEFAULT_SHOP_CONFIG.phone,
      city: data.city ?? DEFAULT_SHOP_CONFIG.city,
      backgroundImageUrl:
        data.background_image_url ||
        data.backgroundImageUrl ||
        DEFAULT_SHOP_CONFIG.backgroundImageUrl,
      logoUrl: data.logo_url || data.logoUrl || DEFAULT_SHOP_CONFIG.logoUrl,
      coverImageUrl:
        data.cover_image_url || data.coverImageUrl || DEFAULT_SHOP_CONFIG.coverImageUrl,
      schedule: (data as any).schedule || DEFAULT_SHOP_CONFIG.schedule,
    };

    if (typeof window !== 'undefined') {
      sessionStorage.setItem('shop_config_cache', JSON.stringify(cfg));
    }
    return cfg;
  } catch {
    return DEFAULT_SHOP_CONFIG;
  }
}

export async function saveShopConfig(config: ShopConfig): Promise<void> {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('shop_config_cache');
  }
  await callAdminOperation({
    operation: 'SAVE_SHOP_CONFIG',
    config,
  });
}

export async function getServices(forceRefresh = false): Promise<ServiceItem[]> {
  try {
    if (!forceRefresh && typeof window !== 'undefined') {
      const cached = sessionStorage.getItem('services_cache');
      if (cached) return JSON.parse(cached);
    }

    if (!supabase) return DEFAULT_SERVICES;
    const { data, error } = await supabase
      .from('services')
      .select('id, name, price, duration_minutes, description, image_url, active')
      .eq('shop_id', SHOP_UUID)
      .eq('active', true)
      .order('price', { ascending: true });

    if (error || !data || data.length === 0) {
      return DEFAULT_SERVICES;
    }

    const services = data.map((s) => ({
      id: s.id,
      name: s.name,
      price: Number(s.price),
      durationMinutes: Number(s.duration_minutes) || 60,
      description: s.description || `${s.duration_minutes || 60} min`,
      imageUrl: s.image_url,
      active: s.active ?? true,
    }));

    if (typeof window !== 'undefined') {
      sessionStorage.setItem('services_cache', JSON.stringify(services));
    }
    return services;
  } catch {
    return DEFAULT_SERVICES;
  }
}

export async function saveServices(services: ServiceItem[]): Promise<void> {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('services_cache');
  }
  await callAdminOperation({
    operation: 'SAVE_SERVICES',
    services,
  });
}

export async function deleteServiceFromDb(id: string): Promise<void> {
  if (!isValidUUID(id)) return;
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('services_cache');
  }
  await callAdminOperation({
    operation: 'DELETE_SERVICE',
    id,
  });
}

export async function getBarbers(forceRefresh = false): Promise<BarberItem[]> {
  try {
    if (!forceRefresh && typeof window !== 'undefined') {
      const cached = sessionStorage.getItem('barbers_cache');
      if (cached) return JSON.parse(cached);
    }

    if (!supabase) return DEFAULT_BARBERS;
    const { data, error } = await supabase
      .from('barbers')
      .select('id, slug, name, role, bio, specialties, service_ids, active')
      .eq('shop_id', SHOP_UUID)
      .eq('active', true);

    if (error || !data || data.length === 0) {
      return DEFAULT_BARBERS;
    }

    const barbers = data.map((b) => ({
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

    if (typeof window !== 'undefined') {
      sessionStorage.setItem('barbers_cache', JSON.stringify(barbers));
    }
    return barbers;
  } catch {
    return DEFAULT_BARBERS;
  }
}

export async function getAdminBarbers(): Promise<BarberItem[]> {
  const res = await fetch('/api/admin?resource=barbers', { cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || 'No autorizado para leer barberos.');
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
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('barbers_cache');
  }
  await callAdminOperation({
    operation: 'SAVE_BARBERS',
    barbers,
  });
}

export async function deleteBarberFromDb(id: string): Promise<void> {
  if (!isValidUUID(id)) return;
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('barbers_cache');
  }
  await callAdminOperation({
    operation: 'DELETE_BARBER',
    id,
  });
}

export async function getPublicBookedSlots(forceRefresh = false): Promise<AppointmentItem[]> {
  try {
    const res = await fetch('/api/public/booking', { cache: 'no-store' });
    if (!res.ok) return [];
    const json = await res.json().catch(() => ({}));
    const apts = Array.isArray(json.appointments) ? json.appointments : [];
    return sortAppointmentsChronologically(apts);
  } catch {
    return [];
  }
}

export async function getAppointments(): Promise<AppointmentItem[]> {
  const res = await fetch('/api/admin?resource=appointments', { cache: 'no-store' });
  if (!res.ok) {
    return getPublicBookedSlots(true);
  }
  const json = await res.json().catch(() => ({}));
  const data = Array.isArray(json.data) ? json.data : [];

  let shopPrefix = SHOP_PREFIX;
  try {
    const cfg = await getShopConfig(false);
    if (cfg && cfg.name) {
      shopPrefix = getShopPrefix(cfg.name);
    }
  } catch {}

  const apts = data.map((apt: any) => ({
    id: apt.id,
    code: apt.code || `${shopPrefix}-${Math.floor(1000 + Math.random() * 9000)}`,
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
    clientPhone: apt.client_phone || '098509376', // Oculto por defecto para compatibilidad
    clientEmail: apt.client_email || '',         // 👈 Mapeado desde la BD
    clientNotes: apt.client_notes,
    status: apt.status || 'confirmado',
    createdAt: apt.created_at,
  }));

  return sortAppointmentsChronologically(apts);
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
      clientPhone: data.clientPhone || '098509376', // Oculto por defecto para que la BD no falle
      clientEmail: data.clientEmail,               // 👈 Enviado al backend
      clientNotes: data.clientNotes || '',
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.appointment) {
    throw new Error(json.error || 'No se pudo guardar el turno.');
  }

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
    appointments: sortAppointmentsChronologically(Array.isArray(json.appointments) ? json.appointments : []),
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

export async function getTips(barberId?: string): Promise<TipItem[]> {
  try {
    if (!supabase) return [];
    let query = supabase
      .from('tips')
      .select('id, barber_id, amount, note, date_string, created_at, barbers(name)')
      .eq('shop_id', SHOP_UUID)
      .order('created_at', { ascending: false });

    if (barberId) {
      query = query.eq('barber_id', barberId);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((t: any) => ({
      id: t.id,
      barberId: t.barber_id,
      barberName: t.barbers?.name || 'Barbero',
      amount: Number(t.amount),
      note: t.note || '',
      dateString: t.date_string,
      createdAt: t.created_at,
    }));
  } catch {
    return [];
  }
}

export async function createTip(params: {
  barberId: string;
  amount: number;
  note?: string;
}): Promise<TipItem[]> {
  if (!supabase) throw new Error('Base de datos no disponible');
  const cleanAmount = Number(params.amount);
  if (!cleanAmount || cleanAmount <= 0) {
    throw new Error('El monto de la propina debe ser mayor a 0.');
  }

  const todayStr = new Date().toLocaleDateString('es-UY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const { error } = await supabase.from('tips').insert({
    shop_id: SHOP_UUID,
    barber_id: params.barberId,
    amount: cleanAmount,
    note: sanitizeInput(params.note || ''),
    date_string: todayStr,
  });

  if (error) {
    throw new Error('No se pudo guardar la propina: ' + error.message);
  }

  return await getTips();
}

export async function deleteTip(id: string): Promise<TipItem[]> {
  if (!supabase || !isValidUUID(id)) return await getTips();
  await supabase.from('tips').delete().eq('id', id).eq('shop_id', SHOP_UUID);
  return await getTips();
}