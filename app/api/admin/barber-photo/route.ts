import {randomUUID} from 'node:crypto';
import {NextResponse} from 'next/server';
import {revalidatePath, revalidateTag} from 'next/cache';
import {getSupabaseServer, SHOP_UUID} from '@/lib/supabase-server';
import {publicShopCacheTag} from '@/lib/public-shop-cache';
import {requireAdminSession, verifyCsrfOrigin} from '@/lib/session';
import {isValidUUID} from '@/lib/booking-store';
import {
  BARBER_PHOTO_BUCKET, MAX_BARBER_PHOTO_BYTES,
  detectBarberPhotoFormat, storedBarberPhotoPath,
} from '@/lib/barber-photo';

const noStore = {'Cache-Control': 'private, no-store'};
const jsonError = (message: string, status: number) =>
  NextResponse.json({error: message}, {status, headers: noStore});

function invalidateBarberPhotoViews() {
  // La tienda pública se comparte entre Inicio, Agendar y Portal de Barberos.
  revalidateTag(publicShopCacheTag(process.env.NEXT_PUBLIC_SUPABASE_URL || '', SHOP_UUID), {expire: 0});
  revalidatePath('/');
  revalidatePath('/barbero');
  revalidatePath('/agendar');
}

async function authenticatedBarber(barberId: string) {
  if (!isValidUUID(barberId)) return null;
  const supabase = getSupabaseServer();
  const {data, error} = await supabase.from('barbers')
    .select('id,image_url').eq('shop_id',SHOP_UUID).eq('id',barberId).maybeSingle();
  if (error) throw error;
  return data;
}

async function removeFormerPhoto(imageUrl: string | null | undefined, barberId: string) {
  const oldPath = storedBarberPhotoPath(
    imageUrl, process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    SHOP_UUID, barberId
  );
  if (!oldPath) return;
  const {error} = await getSupabaseServer().storage.from(BARBER_PHOTO_BUCKET).remove([oldPath]);
  if (error) console.warn('No se pudo borrar una foto anterior del barbero',error.message);
}

export async function POST(request: Request) {
  if (!verifyCsrfOrigin(request)) return jsonError('Origen inválido.',403);
  if (!await requireAdminSession()) return jsonError('No autorizado.',401);
  try {
    const form = await request.formData();
    const barberId = form.get('barberId');
    const file = form.get('photo');
    if (typeof barberId !== 'string' || !isValidUUID(barberId)) {
      return jsonError('Barbero inválido.',400);
    }
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_BARBER_PHOTO_BYTES) {
      return jsonError('Elegí una imagen de hasta 2 MB.',400);
    }
    const mimeTypes = ['image/jpeg','image/png','image/webp'];
    if (!mimeTypes.includes(file.type)) return jsonError('Solo JPG, PNG o WebP.',400);
    const barber = await authenticatedBarber(barberId);
    if (!barber) return jsonError('El barbero no pertenece a este local.',404);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > MAX_BARBER_PHOTO_BYTES) return jsonError('Foto demasiado grande.',400);
    const format = detectBarberPhotoFormat(bytes);
    if (!format || format.contentType !== file.type) {
      return jsonError('La imagen no tiene un formato válido.',400);
    }
    const supabase = getSupabaseServer();
    const path = SHOP_UUID + '/' + barberId + '/' + randomUUID() + '.' + format.extension;
    const {error: uploadError} = await supabase.storage.from(BARBER_PHOTO_BUCKET)
      .upload(path,bytes,{contentType:format.contentType,upsert:false,cacheControl:'3600'});
    if (uploadError) {
      console.error('Error subiendo foto de barbero:',uploadError.message);
      return jsonError('No se pudo subir la foto.',503);
    }
    const {data: urlData} = supabase.storage.from(BARBER_PHOTO_BUCKET).getPublicUrl(path);
    const {data: updated, error: updateError} = await supabase.from('barbers')
      .update({image_url:urlData.publicUrl})
      .eq('shop_id',SHOP_UUID).eq('id',barberId).select('id').maybeSingle();
    if (updateError || !updated) {
      await supabase.storage.from(BARBER_PHOTO_BUCKET).remove([path]);
      return jsonError('No se pudo asociar la foto al barbero.',503);
    }
    await removeFormerPhoto(barber.image_url,barberId);
    invalidateBarberPhotoViews();
    return NextResponse.json({ok:true,imageUrl:urlData.publicUrl},{headers:noStore});
  } catch (error) {
    console.error('Error procesando foto de barbero', error);
    return jsonError('No se pudo procesar la foto.',500);
  }
}

export async function DELETE(request: Request) {
  if (!verifyCsrfOrigin(request)) return jsonError('Origen inválido.',403);
  if (!await requireAdminSession()) return jsonError('No autorizado.',401);
  try {
    const input = await request.json().catch(() => ({}));
    const barberId = input.barberId;
    if (typeof barberId !== 'string' || !isValidUUID(barberId)) {
      return jsonError('Barbero inválido.',400);
    }
    const barber = await authenticatedBarber(barberId);
    if (!barber) return jsonError('Barbero no encontrado.',404);
    const {error} = await getSupabaseServer().from('barbers')
      .update({image_url:null}).eq('shop_id',SHOP_UUID).eq('id',barberId);
    if (error) return jsonError('No se pudo quitar la foto.',503);
    await removeFormerPhoto(barber.image_url,barberId);
    invalidateBarberPhotoViews();
    return NextResponse.json({ok:true,imageUrl:''},{headers:noStore});
  } catch (error) {
    console.error('Error quitando foto de barbero',error);
    return jsonError('No se pudo quitar la foto.',500);
  }
}
