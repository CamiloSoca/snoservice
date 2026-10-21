import type { BarberItem, ServiceItem, ShopConfig } from '@/lib/booking-store';

export interface PublicShopData {
  shopConfig: ShopConfig;
  services: ServiceItem[];
  barbers: BarberItem[];
}

// Datos públicos y poco cambiantes, por pestaña. Nunca incluir reservas,
// PIN, ingresos o datos financieros. Las reservas mantienen su GET no-store.
const CACHE_TTL_MS = 25_000;
let cachedShop: PublicShopData | null = null;
let cachedAt = 0;
let currentRequest: Promise<PublicShopData> | null = null;
let generation = 0;

export function invalidatePublicShopData(): void {
  generation += 1;
  cachedShop = null;
  cachedAt = 0;
  currentRequest = null;
}

export async function getPublicShopData(forceRefresh = false): Promise<PublicShopData> {
  if (!forceRefresh && cachedShop && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedShop;
  }

  if (!forceRefresh && currentRequest) return currentRequest;

  const requestGeneration = generation;
  const request = (async (): Promise<PublicShopData> => {
    const response = await fetch('/api/public/shop', {
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error('No se pudo cargar la información del local.');
    const payload: PublicShopData = await response.json();

    if (!payload.shopConfig?.id || !payload.shopConfig?.schedule ||
        !Array.isArray(payload.services) || !Array.isArray(payload.barbers)) {
      throw new Error('La información recibida del local no es válida.');
    }

    if (requestGeneration === generation) {
      cachedShop = payload;
      cachedAt = Date.now();
    }
    return payload;
  })();

  currentRequest = request;
  try {
    return await request;
  } finally {
    if (currentRequest === request) currentRequest = null;
  }
}
