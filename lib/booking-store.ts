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

export interface ShopConfig {
  id: string;
  slug?: string;
  name: string;
  tagline: string;
  address: string;
  city: string;
  phone: string;
  instagramHandle: string;
  instagramUrl: string;
  openingHours: string;
  accent: BrandAccent;
  logoUrl?: string;
  coverImageUrl?: string;
  backgroundImageUrl?: string;
}

export const DEFAULT_SHOP_CONFIG: ShopConfig = {
  id: SHOP_UUID,
  slug: '13cut',
  name: '13´Cut',
  tagline: 'Avenida Agraciada 3778, Montevideo',
  address: 'Avenida Agraciada 3778',
  city: 'Montevideo',
  phone: '098509376',
  instagramHandle: '@13cut',
  instagramUrl: 'https://instagram.com',
  openingHours: 'Mar a Vie • Sáb 9-18',
  accent: 'mono',
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

export function buildRealOpenDays(): DayOption[] {
  const days: DayOption[] = [];
  const cursor = new Date();
  while (days.length < 6) {
    const dow = cursor.getDay();
    const rule = DEFAULT_SCHEDULE[dow];
    if (rule && !rule.closed) {
      const dayName = cursor.toLocaleDateString('es-UY', { weekday: 'short' }).replace('.', '');
      const capDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
      const dayNumber = String(cursor.getDate());
      const monthName = cursor.toLocaleDateString('es-UY', { month: 'short' }).replace('.', '');
      const capMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
      days.push({
        dateString: `${capDay} ${dayNumber} ${capMonth}`,
        dayName: capDay,
        dayNumber,
        monthName: capMonth,
        dayOfWeek: dow,
      });
    }
    cursor.setDate(cursor.getDate() + 1);
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
  stepMinutes: number = 30
): { morning: string[]; afternoon: string[] } {
  const rule = DEFAULT_SCHEDULE[dayOfWeek];
  if (!rule || rule.closed || !rule.open || !rule.close) {
    return { morning: [], afternoon: [] };
  }

  const startMins = timeToMinutes(rule.open);
  const endMins = timeToMinutes(rule.close);

  const morning: string[] = [];
  const afternoon: string[] = [];

  for (let current = startMins; current + 30 <= endMins; current += stepMinutes) {
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
// CAPA DE ACCESO A DATOS (LECTURAS PÚBLICAS VS RUTAS DE SERVIDOR PROTEGIDAS)
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
  return data;
}

export async function getShopConfig(): Promise<ShopConfig> {
  const { data, error } = await supabase
    .from('shops')
    .select(
      'id, slug, name, tagline, address, city, phone, instagram_handle, instagram_url, opening_hours, accent, logo_url, cover_image_url, background_image_url'
    )
    .eq('id', SHOP_UUID)
    .maybeSingle();

  if (error || !data) return DEFAULT_SHOP_CONFIG;
  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    tagline: data.tagline || data.address,
    address: data.address,
    city: data.city || 'Montevideo',
    phone: data.phone || '098509376',
    instagramHandle: data.instagram_handle || '@13cut',
    instagramUrl: data.instagram_url || 'https://instagram.com',
    openingHours: data.opening_hours || 'Mar a Vie • Sáb 9-18',
    accent: data.accent || 'mono',
    logoUrl: data.logo_url,
    coverImageUrl: data.cover_image_url,
    backgroundImageUrl: data.background_image_url,
  };
}

export async function saveShopConfig(config: ShopConfig): Promise<void> {
  await callAdminOperation({
    operation: 'SAVE_SHOP_CONFIG',
    config,
  });
}

export async function getServices(): Promise<ServiceItem[]> {
  const { data, error } = await supabase
    .from('services')
    .select('id, name, price, duration_minutes, description, image_url, active')
    .eq('shop_id', SHOP_UUID)
    .order('price', { ascending: true });

  if (error || !data || data.length === 0) return DEFAULT_SERVICES;
  return data.map((s) => ({
    id: s.id,
    name: s.name,
    price: Number(s.price),
    durationMinutes: Number(s.duration_minutes) || 60,
    description: s.description || `${s.duration_minutes || 60} min`,
    imageUrl: s.image_url,
    active: s.active ?? true,
  }));
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

/**
 * Lectura pública de barberos: NO solicita ni expone pin ni commission_rate.
 */
export async function getBarbers(): Promise<BarberItem[]> {
  const { data, error } = await supabase
    .from('barbers')
    .select('id, slug, name, role, bio, specialties, service_ids, active')
    .eq('shop_id', SHOP_UUID);

  if (error) {
    console.error('Error leyendo barberos públicos desde Supabase:', error.message);
    return DEFAULT_BARBERS;
  }
  if (!data || data.length === 0) return DEFAULT_BARBERS;

  return data.map((b) => ({
    id: b.id,
    slug: b.slug || b.name.toLowerCase(),
    name: b.name,
    role: b.role || 'Barbero',
    bio: b.bio || '',
    specialties: b.specialties || ['Corte'],
    serviceIds: b.service_ids || [],
    active: b.active ?? true,
    commissionRate: 0,
    pin: '',
    isOwner: false,
  }));
}

/**
 * Lectura administrativa de barberos (incluye commission_rate y pin validando sesión en servidor)
 */
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
    serviceIds: b.service_ids || [],
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

/**
 * Disponibilidad pública para la agenda web (NO devuelve nombres, teléfonos ni notas de clientes)
 */
export async function getPublicBookedSlots(): Promise<AppointmentItem[]> {
  const res = await fetch('/api/public/booking', { cache: 'no-store' });
  if (!res.ok) return [];
  const json = await res.json().catch(() => ({}));
  return Array.isArray(json.appointments) ? json.appointments : [];
}

/**
 * Lectura completa de citas exclusiva para el Panel Admin
 */
export async function getAppointments(): Promise<AppointmentItem[]> {
  const res = await fetch('/api/admin?resource=appointments', { cache: 'no-store' });
  if (!res.ok) {
    return getPublicBookedSlots();
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