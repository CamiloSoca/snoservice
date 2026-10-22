// Validación compartida para fotos públicas de barberos.
export const MAX_BARBER_PHOTO_BYTES = 2 * 1024 * 1024;
export const BARBER_PHOTO_BUCKET = 'barber-photos';

export type PhotoFormat = {extension: 'jpg' | 'png' | 'webp'; contentType: string};

export function detectBarberPhotoFormat(bytes: Uint8Array): PhotoFormat | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return {extension: 'jpg', contentType: 'image/jpeg'};
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e &&
      bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a &&
      bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return {extension: 'png', contentType: 'image/png'};
  }
  if (String.fromCharCode(...bytes.subarray(0,4)) === 'RIFF' &&
      String.fromCharCode(...bytes.subarray(8,12)) === 'WEBP') {
    return {extension: 'webp', contentType: 'image/webp'};
  }
  return null;
}

// Borramos únicamente objetos nuestros de este barbero y esta tienda.
// No confiar en paths obtenidos de la base sin esta comprobación.
export function storedBarberPhotoPath(
  imageUrl: string | null | undefined, supabaseUrl: string,
  shopId: string, barberId: string
): string | null {
  if (!imageUrl || !supabaseUrl) return null;
  try {
    const image = new URL(imageUrl);
    const expected = new URL(supabaseUrl);
    if (image.origin !== expected.origin || image.search || image.hash) return null;
    const prefix = '/storage/v1/object/public/' + BARBER_PHOTO_BUCKET + '/' +
      shopId + '/' + barberId + '/';
    if (!image.pathname.startsWith(prefix)) return null;
    const file = image.pathname.slice(prefix.length);
    if (!/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(file)) return null;
    return shopId + '/' + barberId + '/' + file;
  } catch {
    return null;
  }
}
