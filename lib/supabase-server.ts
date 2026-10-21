// lib/supabase-server.ts
import { createClient } from '@supabase/supabase-js';

export const SHOP_UUID =
  process.env.NEXT_PUBLIC_SHOP_ID ||
  process.env.SHOP_ID ||
  '11111111-1111-1111-1111-111111111113';

export const SHOP_PREFIX =
  process.env.NEXT_PUBLIC_SHOP_PREFIX || '13C';

export function getSupabaseServer() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Faltan las credenciales de Supabase en las variables de entorno.');
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}