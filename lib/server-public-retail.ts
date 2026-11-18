import 'server-only';
import {cacheLife,cacheTag} from 'next/cache';
import {getSupabaseServer,SHOP_UUID} from '@/lib/supabase-server';
import {resolveRetailImage} from '@/lib/retail-images';

export type PublicRetailProduct={
  id:string;slug:string;name:string;description:string;price:number;
  available:boolean;imageUrl:string|null;
};

// Cacheamos sólo el catálogo público. Las ventas, stock real y pagos
// siempre siguen consultándose en vivo en las APIs privadas.
async function cachedPublicProducts(projectUrl:string,shopId:string):Promise<PublicRetailProduct[]> {
  'use cache';
  cacheLife({stale:20,revalidate:20,expire:120});
  cacheTag('retail-catalog-'+shopId);
  const db=getSupabaseServer();
  const {data,error}=await db.from('retail_products')
    .select('id,slug,name,description,price,stock_quantity,image_path')
    .eq('shop_id',shopId).eq('active',true)
    .order('created_at',{ascending:true});
  if(error)throw new Error('No se pudo consultar el catálogo público.');
  return (data||[]).map(product=>({
    id:product.id,
    slug:product.slug,
    name:product.name,
    description:product.description,
    price:Number(product.price),
    available:Number(product.stock_quantity)>0,
    imageUrl:resolveRetailImage(product.image_path,shopId,db),
  }));
}

export async function getPublicRetailProducts():Promise<PublicRetailProduct[]> {
  return cachedPublicProducts(process.env.NEXT_PUBLIC_SUPABASE_URL||'',SHOP_UUID);
}
