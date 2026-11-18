import {NextResponse} from 'next/server';
import {getSupabaseServer,SHOP_UUID} from '@/lib/supabase-server';
import {requireAdminSession,verifyCsrfOrigin} from '@/lib/session';
import {resolveRetailImage} from '@/lib/retail-images';

const maxBytes=2*1024*1024;
const allowed:{[key:string]:string}={
  'image/jpeg':'jpg','image/png':'png','image/webp':'webp',
};
const headers={'Cache-Control':'private, no-store'};

export async function POST(request:Request){
  if(!verifyCsrfOrigin(request))
    return NextResponse.json({error:'Origen no autorizado.'},{status:403,headers});
  if(!await requireAdminSession())
    return NextResponse.json({error:'Solo administración puede cargar imágenes.'},{status:401,headers});
  const length=Number(request.headers.get('content-length')||0);
  if(length>maxBytes+32768)
    return NextResponse.json({error:'La imagen supera 2 MB.'},{status:413,headers});
  try{
    const data=await request.formData();
    const file=data.get('image');
    if(!(file instanceof File)||!allowed[file.type]||file.size<100||file.size>maxBytes)
      return NextResponse.json({error:'Subí una imagen JPG, PNG o WebP de hasta 2 MB.'},{status:422,headers});
    const bytes=Buffer.from(await file.arrayBuffer());
    const jpg=bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
    const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const webp=bytes.subarray(0,4).toString('ascii')==='RIFF'&&
      bytes.subarray(8,12).toString('ascii')==='WEBP';
    if(!((file.type==='image/jpeg'&&jpg)||(file.type==='image/png'&&png)||
      (file.type==='image/webp'&&webp)))
      return NextResponse.json({error:'La imagen no coincide con el formato indicado.'},{status:422,headers});
    const path=SHOP_UUID+'/'+crypto.randomUUID()+'.'+allowed[file.type];
    const db=getSupabaseServer();
    const {error}=await db.storage.from('retail-product-images')
      .upload(path,bytes,{contentType:file.type,upsert:false,cacheControl:'31536000'});
    if(error)return NextResponse.json({error:'No se pudo subir la imagen.'},{status:503,headers});
    const imagePath='storage:'+path;
    return NextResponse.json({ok:true,imagePath,
      imageUrl:resolveRetailImage(imagePath,SHOP_UUID,db)},{headers});
  }catch{
    return NextResponse.json({error:'No se pudo procesar la imagen.'},{status:500,headers});
  }
}
