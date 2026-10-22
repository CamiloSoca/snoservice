import type { BarberItem, ServiceItem, ShopConfig } from '@/lib/booking-store';

export interface PublicShopData {
  shopConfig: ShopConfig;
  services: ServiceItem[];
  barbers: BarberItem[];
}

interface PublicShopSnapshot {
  data: PublicShopData | null;
  state: 'idle' | 'loading' | 'ready' | 'error';
  updatedAt: number;
}

// Session storage is per tab. Store ONLY the public projection returned by
// /api/public/shop; never bookings, clients, PINs, tokens or financial data.
const STORAGE_KEY = 'snoservice.public-shop.v3';
const STORAGE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const REVALIDATE_AFTER_MS = 45 * 1000;
const EMPTY_SNAPSHOT: PublicShopSnapshot = {data: null, state: 'idle', updatedAt: 0};

let snapshot: PublicShopSnapshot = EMPTY_SNAPSHOT;
let hydrated = false;
let generation = 0;
let request: Promise<PublicShopData> | null = null;
const listeners = new Set<() => void>();

function publish(next: PublicShopSnapshot): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function isPublicData(value: unknown): value is PublicShopData {
  if (!value || typeof value !== 'object') return false;
  const raw = value as Partial<PublicShopData>;
  return typeof raw.shopConfig?.id === 'string' &&
    typeof raw.shopConfig.name === 'string' &&
    typeof raw.shopConfig.schedule === 'object' &&
    raw.shopConfig.schedule !== null &&
    Array.isArray(raw.services) &&
    Array.isArray(raw.barbers) &&
    raw.services.every((s) => typeof s.id === 'string' && typeof s.name === 'string') &&
    raw.barbers.every((b) => typeof b.id === 'string' && typeof b.name === 'string');
}

function onlyPublicFields(source: PublicShopData): PublicShopData {
  const shop = source.shopConfig;
  return {
    shopConfig: {
      id: shop.id,
      name: shop.name,
      phone: shop.phone || '',
      address: shop.address || '',
      city: shop.city || '',
      logoUrl: shop.logoUrl || '',
      backgroundImageUrl: shop.backgroundImageUrl || '',
      coverImageUrl: shop.coverImageUrl || '',
      schedule: shop.schedule,
    },
    services: source.services.map((s) => ({
      id: s.id, name: s.name, price: Number(s.price) || 0,
      durationMinutes: Number(s.durationMinutes) || 60,
      description: s.description || '', imageUrl: s.imageUrl || '', active: s.active !== false,
    })),
    barbers: source.barbers.map((b) => ({
      id: b.id, slug: b.slug || '', name: b.name, role: b.role || 'Barbero',
      bio: b.bio || '', specialties: b.specialties || [],
      serviceIds: b.serviceIds || [], imageUrl: b.imageUrl || '', active: b.active !== false,
      isOwner: false, commissionRate: 0, pin: '',
    })),
  };
}

function hydrateFromSession(): void {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved: {version?: number; savedAt?: number; data?: unknown} = JSON.parse(raw);
    const now = Date.now();
    if (saved.version !== 3 || !saved.savedAt || now < saved.savedAt ||
      now - saved.savedAt > STORAGE_MAX_AGE_MS || !isPublicData(saved.data)) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    snapshot = {
      data: onlyPublicFields(saved.data),
      state: 'ready',
      updatedAt: saved.savedAt,
    };
  } catch {
    try { window.sessionStorage.removeItem(STORAGE_KEY); } catch {}
  }
}

function persistPublicData(data: PublicShopData, savedAt: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY,
      JSON.stringify({version: 3, savedAt, data}));
  } catch {
    // Private browsing/storage quota: in-memory caching still works.
  }
}

export function subscribePublicShop(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getPublicShopSnapshot(): PublicShopSnapshot {
  hydrateFromSession();
  return snapshot;
}

export function getServerPublicShopSnapshot(): PublicShopSnapshot {
  return EMPTY_SNAPSHOT;
}

export function publicShopNeedsRefresh(): boolean {
  hydrateFromSession();
  return !snapshot.data || Date.now() - snapshot.updatedAt >= REVALIDATE_AFTER_MS;
}

export function invalidatePublicShopData(): void {
  generation += 1;
  request = null;
  hydrated = true;
  publish(EMPTY_SNAPSHOT);
  if (typeof window !== 'undefined') {
    try { window.sessionStorage.removeItem(STORAGE_KEY); } catch {}
    // Desde /admin no consultar innecesariamente el catálogo público.
    // El proveedor lo recargará cuando la navegación vuelva a una
    // pantalla pública; mientras tanto la caché previa queda invalidada.
    const pathname = window.location.pathname;
    if (pathname === '/' || pathname.startsWith('/agendar') || pathname.startsWith('/barbero')) {
      void getPublicShopData(true).catch(() => {});
    }
  }
}

export async function getPublicShopData(forceRefresh = false): Promise<PublicShopData> {
  hydrateFromSession();
  if (!forceRefresh && snapshot.data && !publicShopNeedsRefresh()) {
    return snapshot.data;
  }
  if (request) return request;

  const startedGeneration = generation;
  publish({
    ...snapshot,
    state: snapshot.data ? 'ready' : 'loading',
  });

  const pending = (async (): Promise<PublicShopData> => {
    const response = await fetch('/api/public/shop', {
      // Netlify private previews need same-origin access cookies.
      // The endpoint returns a strictly public catalog, never private session data.
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('No se pudo consultar la informacion publica.');
    const incoming: unknown = await response.json();
    if (!isPublicData(incoming)) throw new Error('La informacion del local es invalida.');

    const clean = onlyPublicFields(incoming);
    if (generation === startedGeneration) {
      const savedAt = Date.now();
      persistPublicData(clean, savedAt);
      publish({data: clean, state: 'ready', updatedAt: savedAt});
    }
    return clean;
  })();

  request = pending;
  try {
    return await pending;
  } catch (error) {
    if (generation === startedGeneration) {
      publish({...snapshot, state: snapshot.data ? 'ready' : 'error'});
    }
    throw error;
  } finally {
    if (request === pending) request = null;
  }
}
