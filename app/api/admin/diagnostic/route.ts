import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { requireAdminSession } from '@/lib/session';

function compactError(error: unknown) {
  if (!error || typeof error !== 'object') return { code: null, roleHint: null };
  const e = error as { code?: string; hint?: string };
  const role = /\b(?:TO|role )\s*(anon|authenticated|service_role)\b/i.exec(e.hint || '')?.[1] || null;
  return { code: e.code || null, roleHint: role };
}

async function directProbe(url: string, key: string, includeBearer: boolean) {
  try {
    const headers: Record<string, string> = { apikey: key, Accept: 'application/json' };
    if (includeBearer) headers.Authorization = `Bearer ${key}`;
    const response = await fetch(`${url}/rest/v1/appointments?select=id&limit=0`, {
      method: 'GET',
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const payload = await response.json().catch(() => ({}));
    return { status: response.status, ...compactError(payload) };
  } catch {
    return { status: null, code: 'request_failed', roleHint: null };
  }
}

export async function GET() {
  if (!await requireAdminSession()) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const keyFamily = key.startsWith('sb_secret_')
    ? 'secret'
    : key.startsWith('eyJ') ? 'legacy_jwt' : key ? 'other' : 'missing';
  if (!url || !key) {
    return NextResponse.json({ configured: false, keyFamily, urlMatchesProduction: url.includes('mgrggoyraetgfjwjbuts') });
  }
  const [client, bearer, apikeyOnly] = await Promise.all([
    (async () => {
      try {
        const { error } = await getSupabaseServer().from('appointments').select('id', { count: 'exact', head: true });
        return { ok: !error, ...compactError(error) };
      } catch {
        return { ok: false, code: 'client_exception', roleHint: null };
      }
    })(),
    directProbe(url, key, true),
    directProbe(url, key, false),
  ]);
  return NextResponse.json({
    configured: true,
    keyFamily,
    urlMatchesProduction: url.includes('mgrggoyraetgfjwjbuts'),
    client,
    bearer,
    apikeyOnly,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
