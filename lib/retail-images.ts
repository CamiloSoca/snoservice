import type {getSupabaseServer} from '@/lib/supabase-server';

// Only pre-approved local images or product-specific storage paths can be served.
// The database stores references rather than binary files / external URLs.
export function validRetailImagePath(path:string,shopId:string):boolean {
  if(path==='')return true;
  if(path.length>260)return false;
  if(/^\/products\/[a-z0-9][a-z0-9._/-]*\.(jpg|jpeg|png|webp)$/.test(path))
    return !path.includes('..')&&!path.includes('//');
  return new RegExp('^storage:'+shopId+'/[0-9a-f-]{36}\\.(jpg|jpeg|png|webp)$').test(path);
}

export function resolveRetailImage(
  path:string,shopId:string,db:ReturnType<typeof getSupabaseServer>
):string|null {
  if(!validRetailImagePath(path,shopId)||!path)return null;
  if(path.startsWith('/products/'))return path;
  const objectPath=path.slice('storage:'.length);
  return db.storage.from('retail-product-images').getPublicUrl(objectPath).data.publicUrl;
}
