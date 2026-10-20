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

  if (!candidateTime || !barberId || !dateString) return true;

  const candidateStart = timeToMinutes(candidateTime);
  const duration = Math.max(15, Number(serviceDurationMinutes) || 60);
  const candidateEnd = candidateStart + duration;

  const list = Array.isArray(existingAppointments) ? existingAppointments : [];

  for (const apt of list) {
    if (apt.status === 'cancelado') continue;
    if (apt.barberId !== barberId) continue;
    if (apt.dateString !== dateString) continue;

    const aptStart = timeToMinutes(apt.timeSlot);
    const matchedServiceDur = allServices?.find((s) => s.id === apt.serviceId)?.durationMinutes;
    const aptDuration = Number(apt.durationMinutes || matchedServiceDur) || 60;
    const aptEnd = aptStart + aptDuration;

    if (candidateStart >= aptStart && candidateStart < aptEnd) {
      return false;
    }

    if (candidateStart < aptStart && candidateEnd > aptStart) {
      if (duration > 90) {
        return false;
      }
      const overlapMinutes = candidateEnd - aptStart;
      if (overlapMinutes > 30 && aptStart - candidateStart < 30) {
        return false;
      }
    }
  }

  return true;
}

export async function getShopConfig(forceRefresh = false): Promise<ShopConfig> {
  if (!supabase) return cachedShopConfig;
  try {
    const { data } = await supabase.from('shops').select('*').eq('id', SHOP_UUID).maybeSingle();
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
  } catch {
    return cachedShopConfig;
  }
}

export async function saveShopConfig(cfg: ShopConfig): Promise<void> {
  cachedShopConfig = cfg;
  if (!supabase) return;
  await supabase.from('shops').upsert({
    id: SHOP_UUID,
    name: cfg.name,
    phone: cfg.phone,
    address: cfg.address,
    city: cfg.city,
    logo_url: cfg.logoUrl,
    background_image_url: cfg.backgroundImageUrl,
    cover_image_url: cfg.coverImageUrl,
    schedule: cfg.schedule,
  });
}

export async function getServices(forceRefresh = false): Promise<ServiceItem[]> {
  if (!supabase) return cachedServices;
  try {
    const { data } = await supabase.from('services').select('*').eq('shop_id', SHOP_UUID);
    if (!data || data.length === 0) return cachedServices;
    const mapped: ServiceItem[] = data.map((d) => ({
      id: d.id,
      name: d.name,
      price: Number(d.price) || 0,
      durationMinutes: Number(d.duration_minutes) || 60,
      description: d.description || `${d.duration_minutes || 60} min`,
      imageUrl: d.image_url || '',
      active: d.active ?? true,
    }));
    cachedServices = mapped;
    return mapped;
  } catch {
    return cachedServices;
  }
}

export async function saveServices(services: ServiceItem[]): Promise<void> {
  cachedServices = services;
  if (!supabase) return;
  for (const s of services) {
    await supabase.from('services').upsert({
      id: s.id,
      shop_id: SHOP_UUID,
      name: s.name,
      price: s.price,
      duration_minutes: s.durationMinutes,
      description: s.description,
      image_url: s.imageUrl,
      active: s.active ?? true,
    });
  }
}

export async function deleteServiceFromDb(id: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('services').delete().eq('id', id).eq('shop_id', SHOP_UUID);
}

export async function getBarbers(forceRefresh = false): Promise<BarberItem[]> {
  if (!supabase) return cachedBarbers;
  try {
    const { data } = await supabase.from('barbers').select('*').eq('shop_id', SHOP_UUID);
    if (!data || data.length === 0) return cachedBarbers;
    const mapped: BarberItem[] = data.map((d) => ({
      id: d.id,
      slug: d.slug || '',
      name: d.name,
      role: d.role || 'Barbero',
      bio: d.bio || '',
      specialties: d.specialties || [],
      serviceIds: d.service_ids || [],
      isOwner: d.is_owner ?? false,
      active: d.active ?? true,
      commissionRate: Number(d.commission_rate) || 50,
      pin: d.pin || '1234',
    }));
    cachedBarbers = mapped;
    return mapped;
  } catch {
    return cachedBarbers;
  }
}

export async function getAdminBarbers(forceRefresh = false): Promise<BarberItem[]> {
  return getBarbers(forceRefresh);
}

export async function saveBarbers(barbers: BarberItem[]): Promise<void> {
  cachedBarbers = barbers;
  if (!supabase) return;
  
  for (const b of barbers) {
    // Enviamos estrictamente los campos básicos que sabemos que existen en la tabla
    const payload: Record<string, any> = {
      id: b.id,
      shop_id: SHOP_UUID,
      name: b.name,
      commission_rate: Number(b.commissionRate) || 50,
      pin: String(b.pin || '1234'),
    };

    // Agregamos de forma segura solo si existen en tu base de datos
    if (b.role) payload.role = b.role;
    if (b.specialties) payload.specialties = b.specialties;
    if (b.serviceIds) payload.service_ids = b.serviceIds;
    if (b.active !== undefined) payload.active = b.active;

    const { error } = await supabase.from('barbers').upsert(payload);
    if (error) {
      console.error(`Error de Supabase al guardar barbero ${b.name}:`, error.message);
      throw new Error(`Error al guardar barbero: ${error.message}`);
    }
  }
}

export async function deleteBarberFromDb(id: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('barbers').delete().eq('id', id).eq('shop_id', SHOP_UUID);
}

export async function getAppointments(forceRefresh = false): Promise<AppointmentItem[]> {
  if (!supabase) return [];
  try {
    const { data } = await supabase
      .from('appointments')
      .select(`
        id, code, service_id, barber_id, date_string, time_slot,
        duration_minutes, client_name, client_phone, client_email, client_notes,
        status, price_snapshot, created_at,
        services:service_id (name, price),
        barbers:barber_id (name)
      `)
      .eq('shop_id', SHOP_UUID)
      .order('created_at', { ascending: false });

    if (!data) return [];
    return data.map((d: any) => {
      const srv = Array.isArray(d.services) ? d.services[0] : d.services;
      const brb = Array.isArray(d.barbers) ? d.barbers[0] : d.barbers;
      return {
        id: d.id,
        code: d.code || '',
        serviceId: d.service_id,
        serviceName: srv?.name || 'Servicio',
        servicePrice: Number(srv?.price ?? d.price_snapshot) || 0,
        priceSnapshot: Number(d.price_snapshot ?? srv?.price) || 0,
        durationMinutes: Number(d.duration_minutes) || 60,
        barberId: d.barber_id,
        barberName: brb?.name || 'Barbero',
        dateString: d.date_string,
        timeSlot: d.time_slot,
        clientName: d.client_name,
        clientPhone: d.client_phone,
        clientEmail: d.client_email || '',
        clientNotes: d.client_notes || '',
        status: d.status || 'confirmado',
        createdAt: d.created_at,
      };
    });
  } catch {
    return [];
  }
}

export async function getPublicBookedSlots(forceRefresh = false): Promise<AppointmentItem[]> {
  const apts = await getAppointments(forceRefresh);
  return apts.filter((a) => a.status !== 'cancelado');
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
  if (!supabase) throw new Error('Sin conexión con Supabase');
  const code = Math.random().toString(36).substring(2, 6).toUpperCase();
  const finalPrice = Number(item.priceSnapshot ?? item.servicePrice) || 0;
  const finalDuration = Number(item.durationMinutes) || 60;

  const { data, error } = await supabase
    .from('appointments')
    .insert([
      {
        shop_id: SHOP_UUID,
        code,
        service_id: item.serviceId,
        barber_id: item.barberId,
        date_string: item.dateString,
        time_slot: item.timeSlot,
        client_name: item.clientName,
        client_phone: item.clientPhone,
        client_email: item.clientEmail || '',
        client_notes: item.clientNotes || '',
        price_snapshot: finalPrice,
        duration_minutes: finalDuration,
        status: 'confirmado',
      },
    ])
    .select()
    .single();

  if (error) throw new Error(error.message);

  return {
    id: data.id,
    code: data.code || code,
    serviceId: data.service_id,
    serviceName: item.serviceName || 'Servicio',
    servicePrice: finalPrice,
    priceSnapshot: finalPrice,
    durationMinutes: finalDuration,
    barberId: data.barber_id,
    barberName: item.barberName || 'Barbero',
    dateString: data.date_string,
    timeSlot: data.time_slot,
    clientName: data.client_name,
    clientPhone: data.client_phone,
    clientEmail: data.client_email || item.clientEmail || '',
    clientNotes: data.client_notes || '',
    status: data.status || 'confirmado',
    createdAt: data.created_at,
  };
}

export async function updateAppointmentStatus(
  id: string,
  status: AppointmentItem['status']
): Promise<AppointmentItem[]> {
  if (!supabase) return [];

  if (status === 'completado') {
    const { data: existing } = await supabase
      .from('appointments')
      .select('date_string')
      .eq('id', id)
      .maybeSingle();

    if (existing?.date_string && !canCompleteAppointment(existing.date_string)) {
      throw new Error('No podés completar un turno que corresponde a una fecha futura.');
    }
  }

  await supabase.from('appointments').update({ status }).eq('id', id);
  return getAppointments(true);
}

export async function getExpenses(): Promise<ExpenseItem[]> {
  if (!supabase) return [];
  try {
    const { data } = await supabase
      .from('expenses')
      .select('*')
      .eq('shop_id', SHOP_UUID)
      .order('created_at', { ascending: false });
    if (!data) return [];
    return data.map((d) => ({
      id: d.id,
      description: d.description,
      amount: Number(d.amount) || 0,
      category: d.category || 'Otros',
      date: d.date || new Date().toISOString().split('T')[0],
      createdAt: d.created_at,
    }));
  } catch {
    return [];
  }
}

export async function createExpense(item: {
  description: string;
  amount: number;
  category: ExpenseCategory;
  date: string;
}): Promise<ExpenseItem[]> {
  if (!supabase) return [];
  await supabase.from('expenses').insert([
    {
      shop_id: SHOP_UUID,
      description: item.description,
      amount: item.amount,
      category: item.category,
      date: item.date,
    },
  ]);
  return getExpenses();
}

export async function deleteExpense(id: string): Promise<ExpenseItem[]> {
  if (!supabase) return [];
  await supabase.from('expenses').delete().eq('id', id).eq('shop_id', SHOP_UUID);
  return getExpenses();
}

export async function getTips(barberId?: string): Promise<TipItem[]> {
  if (!supabase) return [];
  try {
    let query = supabase
      .from('tips')
      .select('*, barbers (name)')
      .eq('shop_id', SHOP_UUID)
      .order('created_at', { ascending: false });
    if (barberId) query = query.eq('barber_id', barberId);
    const { data } = await query;
    if (!data) return [];
    return data.map((d: any) => ({
      id: d.id,
      barberId: d.barber_id,
      barberName: d.barbers?.name || 'Barbero',
      amount: Number(d.amount) || 0,
      note: d.note || '',
      dateString: d.date_string || new Date().toLocaleDateString(),
      createdAt: d.created_at,
    }));
  } catch {
    return [];
  }
}

export async function createTip(item: {
  barberId: string;
  amount: number;
  note?: string;
}): Promise<TipItem[]> {
  if (!supabase) return [];
  await supabase.from('tips').insert([
    {
      shop_id: SHOP_UUID,
      barber_id: item.barberId,
      amount: item.amount,
      note: item.note || '',
      date_string: new Date().toLocaleDateString('es-UY', { day: 'numeric', month: 'short' }),
    },
  ]);
  return getTips();
}

export async function deleteTip(id: string): Promise<TipItem[]> {
  if (!supabase) return [];
  await supabase.from('tips').delete().eq('id', id).eq('shop_id', SHOP_UUID);
  return getTips();
}

export async function getManualCharges(barberId?: string): Promise<ManualChargeItem[]> {
  if (!supabase) return [];
  try {
    let query = supabase
      .from('manual_charges')
      .select('*, barbers (name)')
      .eq('shop_id', SHOP_UUID)
      .order('created_at', { ascending: false });
    if (barberId) query = query.eq('barber_id', barberId);
    const { data } = await query;
    if (!data) return [];
    return data.map((d: any) => ({
      id: d.id,
      barberId: d.barber_id,
      barberName: d.barbers?.name || 'Barbero',
      amount: Number(d.amount) || 0,
      note: d.note || '',
      dateString: d.date_string || new Date().toLocaleDateString(),
      createdAt: d.created_at,
    }));
  } catch {
    return [];
  }
}

export async function createManualCharge(item: {
  barberId: string;
  amount: number;
  note?: string;
}): Promise<ManualChargeItem[]> {
  if (!supabase) return [];
  await supabase.from('manual_charges').insert([
    {
      shop_id: SHOP_UUID,
      barber_id: item.barberId,
      amount: item.amount,
      note: item.note || '',
      date_string: new Date().toLocaleDateString('es-UY', { day: 'numeric', month: 'short' }),
    },
  ]);
  return getManualCharges();
}

export async function deleteManualCharge(id: string): Promise<ManualChargeItem[]> {
  if (!supabase) return [];
  await supabase.from('manual_charges').delete().eq('id', id).eq('shop_id', SHOP_UUID);
  return getManualCharges();
}

export async function unlockBarberPanelWithPin(barberId: string, pin: string) {
  if (!supabase) throw new Error('Sin conexión con la base de datos.');
  const { data: barber, error } = await supabase
    .from('barbers')
    .select('id, name, commission_rate, pin')
    .eq('id', barberId)
    .eq('shop_id', SHOP_UUID)
    .maybeSingle();
  if (error || !barber) throw new Error('Barbero no encontrado.');
  if (String(barber.pin).trim() !== String(pin).trim()) throw new Error('PIN incorrecto.');
  const apts = await getAppointments();
  return {
    commissionRate: Number(barber.commission_rate) || 50,
    appointments: apts.filter((a) => a.barberId === barberId),
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