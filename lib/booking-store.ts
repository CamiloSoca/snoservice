// lib/booking-store.ts
import { supabase } from './supabase';

export type BrandAccent = 'navy' | 'emerald' | 'bronze' | 'mono';

const SHOP_UUID = '11111111-1111-1111-1111-111111111113';

// Helper para generar UUID v4 válidos en el cliente y evitar el error 22P02 de Postgres
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
  durationMinutes: number; // <-- Nuevo: guarda cuánto dura este turno específico
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
  { id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b11', slug: 'nahuel', name: 'Nahuel', role: 'Barbero', bio: '', specialties: ['Corte', 'Mechas'], serviceIds: ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44'], isOwner: true, active: true, commissionRate: 100, pin: '1313' },
  { id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b22', slug: 'emanuel', name: 'Emanuel', role: 'Barbero', bio: '', specialties: ['Corte'], serviceIds: ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'], isOwner: false, active: true, commissionRate: 50, pin: '1111' },
  { id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b33', slug: 'alexander', name: 'Alexander', role: 'Barbero', bio: '', specialties: ['Corte', 'Mechas'], serviceIds: ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44'], isOwner: false, active: true, commissionRate: 50, pin: '2222' },
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

// ============================================================================
// MOTOR MATEMÁTICO DE HORARIOS Y BLOQUEO DE DURACIÓN VARIABLE
// ============================================================================

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

/**
 * Genera los horarios base del día.
 * Por defecto usa intervalos de 30 minutos para soportar cortes de 30, 45, 60, 90 y 120 min.
 */
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

  // Generamos slots cada `stepMinutes` (ej. 09:00, 09:30, 10:00...)
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

/**
 * Verifica si un horario candidato (`candidateTime`) está libre para un barbero
 * teniendo en cuenta cuánto dura el servicio que el cliente quiere hacerse (`serviceDurationMinutes`)
 * y cuánto duran los turnos que el barbero ya tiene agendados ese día.
 *
 * Regla de colisión de intervalos:
 * Dos turnos [InicioA, FinA] y [InicioB, FinB] chocan SI Y SOLO SI:
 * InicioA < FinB  Y  FinA > InicioB
 */
/**
 * Lógica Real de Barbería (Bloqueo hacia adelante):
 * - Un turno existente ocupa al barbero desde su hora de inicio hasta (inicio + duración).
 *   Ej: Color a las 12:00 (120 min) bloquea de 12:00 a 14:00 (no deja agendar 12:00, 12:30, 13:00, 13:30).
 *   Ej: Corte a las 10:00 (45 min) bloquea de 10:00 a 10:45 (no deja agendar 10:00 ni 10:30).
 * - Si un horario ANTERIOR está libre (ej: 11:30 antes de un turno de las 12:00),
 *   SIEMPRE permite agendarlo para no dejar huecos muertos y que el barbero maneje sus tiempos.
 */
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

  // Filtrar los turnos activos de ese barbero en ese día
  const barberDayApts = existingAppointments.filter(
    (apt) =>
      apt.barberId === barberId &&
      apt.dateString === dateString &&
      apt.status !== 'cancelado'
  );

  for (const apt of barberDayApts) {
    const aptStart = timeToMinutes(apt.timeSlot);

    // Duración del turno que ya estaba agendado
    let aptDuration = Number(apt.durationMinutes) || 0;
    if (!aptDuration && allServices.length > 0) {
      const matchedSrv = allServices.find((s) => s.id === apt.serviceId);
      if (matchedSrv) aptDuration = Number(matchedSrv.durationMinutes);
    }
    if (!aptDuration) aptDuration = 60;

    const aptEnd = aptStart + aptDuration;

    // Bloquea únicamente si la hora que el cliente quiere elegir cae ADENTRO de un turno ya ocupado
    if (candidateStart >= aptStart && candidateStart < aptEnd) {
      return false;
    }
  }

  return true;
}

/**
 * Devuelve directamente las listas de horarios de mañana y tarde que están 100% disponibles
 */
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
// CONEXIÓN DIRECTA A SUPABASE
// ============================================================================

export async function getShopConfig(): Promise<ShopConfig> {
  const { data, error } = await supabase.from('shops').select('*').eq('id', SHOP_UUID).maybeSingle();
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
  await supabase.from('shops').update({
    name: config.name,
    address: config.address,
    phone: config.phone,
    tagline: config.tagline,
    background_image_url: config.backgroundImageUrl,
  }).eq('id', SHOP_UUID);
}

export async function getServices(): Promise<ServiceItem[]> {
  const { data, error } = await supabase
    .from('services')
    .select('*')
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
  for (const s of services) {
    if (!isValidUUID(s.id)) {
      s.id = generateUUID();
    }
    const { error } = await supabase.from('services').upsert({
      id: s.id,
      shop_id: SHOP_UUID,
      name: s.name.trim(),
      price: Number(s.price) || 0,
      duration_minutes: Number(s.durationMinutes) || 60,
      description: s.description || `${s.durationMinutes || 60} min`,
      image_url: s.imageUrl,
      active: s.active ?? true,
    }, { onConflict: 'id' });

    if (error) {
      console.error(`❌ Error al guardar servicio ${s.name}:`, error.message);
    }
  }
}

export async function deleteServiceFromDb(id: string): Promise<void> {
  if (!isValidUUID(id)) return;
  const { error } = await supabase.from('services').delete().eq('id', id).eq('shop_id', SHOP_UUID);
  if (error) console.error('❌ Error al eliminar servicio:', error.message);
}

export async function getBarbers(): Promise<BarberItem[]> {
  const { data, error } = await supabase.from('barbers').select('*').eq('shop_id', SHOP_UUID);
  if (error || !data || data.length === 0) return DEFAULT_BARBERS;
  return data.map((b) => ({
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
  for (const b of barbers) {
    if (!isValidUUID(b.id)) {
      b.id = generateUUID();
    }

    const payload = {
      id: b.id,
      shop_id: SHOP_UUID,
      slug:
        b.slug ||
        b.name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, '-'),
      name: b.name.trim(),
      role: b.role || 'Barbero',
      bio: b.bio || '',
      specialties: b.specialties || ['Corte'],
      service_ids: b.serviceIds || [],
      commission_rate: Number(b.commissionRate) || 50,
      pin: b.pin || '1234',
      active: b.active ?? true,
    };

    const { error } = await supabase.from('barbers').upsert(payload, { onConflict: 'id' });

    if (error) {
      console.error(`❌ Error al guardar barbero ${b.name}:`, error.message);
    }
  }
}

export async function deleteBarberFromDb(id: string): Promise<void> {
  if (!isValidUUID(id)) return;
  const { error } = await supabase.from('barbers').delete().eq('id', id).eq('shop_id', SHOP_UUID);
  if (error) console.error('❌ Error al eliminar barbero:', error.message);
}

export async function getAppointments(): Promise<AppointmentItem[]> {
  const { data, error } = await supabase
    .from('appointments')
    .select('*, services(name, price, duration_minutes), barbers(name)')
    .eq('shop_id', SHOP_UUID)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  return data.map((apt) => ({
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
  // 1. Obtener servicios y turnos actuales en vivo para evitar doble reserva
  const [currentApts, currentServices] = await Promise.all([
    getAppointments(),
    getServices(),
  ]);

  const selectedService = currentServices.find((s) => s.id === data.serviceId);
  const durationMinutes =
    Number(data.durationMinutes) || Number(selectedService?.durationMinutes) || 60;

  // 2. Validar disponibilidad real con duración variable antes de insertar
  const stillAvailable = isSlotAvailable({
    candidateTime: data.timeSlot,
    serviceDurationMinutes: durationMinutes,
    barberId: data.barberId,
    dateString: data.dateString,
    existingAppointments: currentApts,
    allServices: currentServices,
  });

  if (!stillAvailable) {
    throw new Error(
      'Este horario acaba de ser ocupado o no cuenta con tiempo suficiente para la duración del servicio elegido. Por favor elige otro horario.'
    );
  }

  const randomCode = '13C-' + Math.floor(1000 + Math.random() * 9000);

  // Payload base 100% compatible con la tabla appointments
  const baseApt: Record<string, any> = {
    shop_id: SHOP_UUID,
    code: randomCode,
    service_id: isValidUUID(data.serviceId) ? data.serviceId : null,
    barber_id: isValidUUID(data.barberId) ? data.barberId : null,
    date_string: data.dateString,
    time_slot: data.timeSlot,
    duration_minutes: durationMinutes,
    client_name: sanitizeInput(data.clientName),
    client_phone: sanitizeInput(data.clientPhone),
    client_notes: sanitizeInput(data.clientNotes || ''),
    price_snapshot: Number(data.servicePrice) || 0,
    status: 'confirmado',
  };

  let { data: inserted, error } = await supabase
    .from('appointments')
    .insert([baseApt])
    .select()
    .single();

  // Si aún no corriste el ALTER TABLE de duration_minutes, reintenta automáticamente sin esa columna
  if (error) {
    console.warn('Reintentando insert sin columnas opcionales...', error.message);
    const fallbackApt = { ...baseApt };
    delete fallbackApt.duration_minutes;

    const retry = await supabase
      .from('appointments')
      .insert([fallbackApt])
      .select()
      .single();

    inserted = retry.data;
    error = retry.error;
  }

  if (error) {
    console.error(
      'Error insertando turno en Supabase:',
      error.message,
      error.details,
      error.hint
    );
    throw new Error(`No se pudo guardar el turno: ${error.message}`);
  }

  return {
    ...data,
    durationMinutes,
    id: inserted?.id || generateUUID(),
    code: randomCode,
    status: 'confirmado',
    createdAt: inserted?.created_at || new Date().toISOString(),
  };
}

export async function updateAppointmentStatus(
  id: string,
  status: AppointmentItem['status']
): Promise<AppointmentItem[]> {
  await supabase.from('appointments').update({ status }).eq('id', id);
  return await getAppointments();
}

export async function getExpenses(): Promise<ExpenseItem[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('shop_id', SHOP_UUID)
    .order('expense_date', { ascending: false });
  if (error || !data) return [];
  return data.map((e) => ({
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
  await supabase.from('expenses').insert([
    {
      shop_id: SHOP_UUID,
      description: sanitizeInput(data.description),
      amount: data.amount,
      category: data.category,
      expense_date: data.date,
    },
  ]);
  return await getExpenses();
}

export async function deleteExpense(id: string): Promise<ExpenseItem[]> {
  await supabase.from('expenses').delete().eq('id', id);
  return await getExpenses();
}