// lib/supabase-server.ts
import 'server-only';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const SHOP_UUID = '11111111-1111-1111-1111-111111111113';

let cachedServerClient: SupabaseClient | null = null;

export function getSupabaseServer(): SupabaseClient {
  if (cachedServerClient) return cachedServerClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en las variables de entorno del servidor.'
    );
  }

  cachedServerClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedServerClient;
}