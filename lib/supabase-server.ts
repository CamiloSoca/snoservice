// Cliente exclusivo del servidor. No introducir cookies ni credenciales
// de visitantes en la instancia con service_role.
import { createClient } from '@supabase/supabase-js';

export const SHOP_UUID =
  process.env.NEXT_PUBLIC_SHOP_ID ||
  process.env.SHOP_ID ||
  '11111111-1111-1111-1111-111111111113';

export const SHOP_PREFIX =
  process.env.NEXT_PUBLIC_SHOP_PREFIX || '13C';

type ServerClient = ReturnType<typeof createClient>;
let cachedClient: ServerClient | null = null;
let cachedConfiguration = '';

export function getSupabaseServer(): ServerClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Faltan las credenciales de Supabase en las variables de entorno.');
  }

  // Reusar en invocaciones calientes: evita reconstruir auth/fetch/storage
  // de supabase-js en cada consulta. Nunca exponer este modulo al cliente.
  const configuration = `${supabaseUrl}:${supabaseKey}`;
  if (cachedClient && cachedConfiguration === configuration) {
    return cachedClient;
  }

  cachedClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  cachedConfiguration = configuration;
  return cachedClient;
}
