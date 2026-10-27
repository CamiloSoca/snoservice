function projectScope(supabaseUrl: string): string {
  try {
    return new URL(supabaseUrl).hostname.toLowerCase();
  } catch {
    return 'unknown-project';
  }
}

export function publicShopStorageKey(supabaseUrl: string, shopId: string): string {
  return `snoservice.public-shop.v4:${projectScope(supabaseUrl)}:${shopId || 'unconfigured-shop'}`;
}

export function publicShopCacheTag(supabaseUrl: string, shopId: string): string {
  return `public-shop-v4-${projectScope(supabaseUrl)}-${shopId || 'unconfigured-shop'}`;
}
