import 'server-only';

import crypto from 'node:crypto';
import { getSupabaseServer, SHOP_UUID } from '@/lib/supabase-server';

export type InstagramPost = {
  id: string;
  imageUrl: string;
  permalink: string;
  caption: string;
  likeCount: number | null;
};

type InstagramConnection = {
  shop_id: string;
  username: string;
  instagram_user_id: string;
  access_token_encrypted: string;
  token_expires_at: string;
};

type InstagramMedia = {
  id?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  caption?: string;
  timestamp?: string;
  like_count?: number | null;
};

const IG_HOST = 'https://graph.instagram.com';
const CACHE_MS = 5 * 60 * 1000;
const EMPTY_CACHE_MS = 60 * 1000;
const REFRESH_BEFORE_MS = 20 * 24 * 60 * 60 * 1000;
let feedCache: { shop: string; expires: number; posts: InstagramPost[] } | null = null;
let pendingFeed: Promise<InstagramPost[]> | null = null;

export function instagramOAuthConfig(): { appId: string; appSecret: string; redirectUri: string } | null {
  const appId = process.env.INSTAGRAM_APP_ID?.trim() || '';
  const appSecret = process.env.INSTAGRAM_APP_SECRET?.trim() || '';
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI?.trim() || '';
  if (!appId || !appSecret || !redirectUri) return null;
  try {
    const uri = new URL(redirectUri);
    if ((uri.protocol !== 'https:' && process.env.NODE_ENV === 'production') ||
      uri.pathname !== '/api/admin/instagram/callback' || uri.search || uri.hash) return null;
  } catch { return null; }
  return { appId, appSecret, redirectUri };
}

function cipherKey(): Buffer {
  const secret = process.env.SESSION_SECRET || '';
  if (secret.length < 32) throw new Error('No se configuró SESSION_SECRET.');
  return crypto.createHmac('sha256', secret).update('snoservice-instagram-token-encryption-v1').digest();
}

export function encryptInstagramToken(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', cipherKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url')].join('.');
}

function decryptInstagramToken(value: string): string {
  const [version, iv, tag, contents] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !contents) throw new Error('Token de Instagram inválido.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', cipherKey(),
    Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(contents, 'base64url')),
    decipher.final()]).toString('utf8');
}

async function getConnection(): Promise<InstagramConnection | null> {
  if (!SHOP_UUID) return null;
  const { data, error } = await getSupabaseServer().from('instagram_connections')
    .select('shop_id,username,instagram_user_id,access_token_encrypted,token_expires_at')
    .eq('shop_id', SHOP_UUID).maybeSingle();
  if (error) throw new Error('No se pudo consultar la conexión de Instagram.');
  return data as InstagramConnection | null;
}

export async function getInstagramConnectionStatus() {
  const connection = await getConnection();
  return {
    configured: Boolean(instagramOAuthConfig()),
    connected: Boolean(connection),
    username: connection?.username || null,
  };
}

export async function saveInstagramConnection(input: {
  username: string; userId: string; accessToken: string; expiresIn: number;
}): Promise<void> {
  if (!SHOP_UUID) throw new Error('La barbería no está configurada.');
  const { error } = await getSupabaseServer().from('instagram_connections').upsert({
    shop_id: SHOP_UUID,
    username: input.username,
    instagram_user_id: input.userId,
    access_token_encrypted: encryptInstagramToken(input.accessToken),
    token_expires_at: new Date(Date.now() + input.expiresIn * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'shop_id' });
  if (error) throw new Error('No se pudo guardar la conexión de Instagram.');
  feedCache = null;
}

async function metaGet(path: string, token: string, params: Record<string, string>) {
  const uri = new URL(IG_HOST + path);
  for (const [key, value] of Object.entries(params)) uri.searchParams.set(key, value);
  const response = await fetch(uri, {
    headers: { Authorization: 'Bearer ' + token },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('Instagram respondió con estado ' + response.status);
  return response.json() as Promise<unknown>;
}

export async function exchangeInstagramAuthorizationCode(code: string): Promise<{
  username: string; userId: string; accessToken: string; expiresIn: number;
}> {
  const config = instagramOAuthConfig();
  if (!config) throw new Error('Falta la configuración de Meta.');
  const shortResponse = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.appId, client_secret: config.appSecret,
      grant_type: 'authorization_code', redirect_uri: config.redirectUri, code,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  if (!shortResponse.ok) throw new Error('Instagram rechazó la autorización.');
  const short = await shortResponse.json() as { access_token?: string; user_id?: number | string };
  if (!short.access_token || !short.user_id) throw new Error('La respuesta de Instagram es inválida.');

  const long = await metaGet('/access_token', short.access_token, {
    grant_type: 'ig_exchange_token',
    client_secret: config.appSecret,
    access_token: short.access_token,
  }) as { access_token?: string; expires_in?: number };
  if (!long.access_token || !Number.isFinite(long.expires_in) ||
    (long.expires_in || 0) < 3600) throw new Error('No se pudo obtener el acceso prolongado.');

  const profile = await metaGet('/me', long.access_token, { fields: 'id,username' }) as {
    id?: string; username?: string;
  };
  const username = profile.username?.toLowerCase() || '';
  const expected = (process.env.INSTAGRAM_EXPECTED_USERNAME || '13.cut')
    .replace(/^@/, '').toLowerCase();
  if (username !== expected) throw new Error('La cuenta autorizada no es @' + expected + '.');

  return {
    username, userId: String(profile.id || short.user_id),
    accessToken: long.access_token, expiresIn: long.expires_in!,
  };
}

async function tokenForConnection(connection: InstagramConnection): Promise<string> {
  const token = decryptInstagramToken(connection.access_token_encrypted);
  const expiry = Date.parse(connection.token_expires_at);
  if (!Number.isFinite(expiry) || expiry <= Date.now()) {
    throw new Error('El acceso a Instagram venció; volvé a conectarlo.');
  }
  if (expiry > Date.now() + REFRESH_BEFORE_MS) return token;

  // El token se renueva sin intervención del dueño mientras siga vigente.
  const refreshed = await metaGet('/refresh_access_token', token, {
    grant_type: 'ig_refresh_token', access_token: token,
  }) as { access_token?: string; expires_in?: number };
  if (!refreshed.access_token || !Number.isFinite(refreshed.expires_in) ||
    (refreshed.expires_in || 0) < 3600) throw new Error('Instagram no renovó el acceso.');
  await saveInstagramConnection({
    username: connection.username, userId: connection.instagram_user_id,
    accessToken: refreshed.access_token, expiresIn: refreshed.expires_in!,
  });
  return refreshed.access_token;
}

function isPublicHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith('https://')) return false;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

async function fetchInstagramFeed(): Promise<InstagramPost[]> {
  const connection = await getConnection();
  if (!connection) return [];
  const accessToken = await tokenForConnection(connection);
  // Likes son opcionales: si Meta rechaza este campo, conservar la galería.
  const baseFields = 'id,media_type,media_url,thumbnail_url,permalink,caption,timestamp';
  let response: { data?: InstagramMedia[] };
  try {
    response = await metaGet('/me/media', accessToken, {
      fields: baseFields + ',like_count',
      limit: '12',
    }) as { data?: InstagramMedia[] };
  } catch {
    response = await metaGet('/me/media', accessToken, {
      fields: baseFields,
      limit: '12',
    }) as { data?: InstagramMedia[] };
  }
  if (!Array.isArray(response.data)) throw new Error('Formato de publicaciones inválido.');
  return response.data
    .filter(media => media && typeof media.id === 'string')
    .sort((a, b) => Date.parse(b.timestamp || '') - Date.parse(a.timestamp || ''))
    .flatMap((media): InstagramPost[] => {
      const imageUrl = media.media_type === 'VIDEO' ? media.thumbnail_url : media.media_url;
      if (!isPublicHttpsUrl(imageUrl) || !isPublicHttpsUrl(media.permalink)) return [];
      if (new URL(media.permalink).hostname !== 'www.instagram.com' &&
        new URL(media.permalink).hostname !== 'instagram.com') return [];
      return [{
        id: media.id!, imageUrl, permalink: media.permalink,
        caption: (media.caption || 'Publicación de 13 Cut').slice(0, 180),
        likeCount: typeof media.like_count === 'number' &&
          Number.isFinite(media.like_count) && media.like_count >= 0
          ? Math.trunc(media.like_count) : null,
      }];
    })
    .slice(0, 4);
}

export async function getPublicInstagramFeed(): Promise<InstagramPost[]> {
  if (feedCache && feedCache.shop === SHOP_UUID && feedCache.expires > Date.now()) {
    return feedCache.posts;
  }
  if (pendingFeed) return pendingFeed;
  pendingFeed = (async () => {
    try {
      const posts = await fetchInstagramFeed();
      feedCache = {
        shop: SHOP_UUID, posts,
        expires: Date.now() + (posts.length ? CACHE_MS : EMPTY_CACHE_MS),
      };
      return posts;
    } catch {
      // Nunca cortar la página pública si Meta o su autorización fallan.
      const posts = feedCache?.shop === SHOP_UUID ? feedCache.posts : [];
      feedCache = { shop: SHOP_UUID, posts, expires: Date.now() + EMPTY_CACHE_MS };
      return posts;
    }
  })();
  try { return await pendingFeed; } finally { pendingFeed = null; }
}
