import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_BARBER_PHOTO_BYTES, detectBarberPhotoFormat, storedBarberPhotoPath,
} from '../lib/barber-photo.ts';

test('acepta solo firmas JPG, PNG y WebP', () => {
  assert.equal(detectBarberPhotoFormat(Uint8Array.from([255,216,255,...Array(9).fill(0)]))?.contentType,'image/jpeg');
  assert.equal(detectBarberPhotoFormat(Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]))?.contentType,'image/png');
  assert.equal(detectBarberPhotoFormat(Uint8Array.from([82,73,70,70,0,0,0,0,87,69,66,80]))?.contentType,'image/webp');
  assert.equal(detectBarberPhotoFormat(Uint8Array.from([60,115,118,103,...Array(8).fill(0)])),null);
  assert.equal(MAX_BARBER_PHOTO_BYTES,2097152);
});

test('solo permite borrar objetos propios del mismo barbero, bucket y proyecto', () => {
  const base='https://example.supabase.co';
  const shop='11111111-1111-1111-1111-111111111113';
  const barber='46a38021-c9ef-4be6-940f-3190898ed925';
  const filename='12345678-1234-1234-1234-123456789abc.jpg';
  const path=shop+'/'+barber+'/'+filename;
  const url=base+'/storage/v1/object/public/barber-photos/'+path;
  assert.equal(storedBarberPhotoPath(url,base,shop,barber),path);
  assert.equal(storedBarberPhotoPath(url,'https://evil.example',shop,barber),null);
  assert.equal(storedBarberPhotoPath(url,base,'another-shop',barber),null);
  assert.equal(storedBarberPhotoPath(url,base,shop,'another-barber'),null);
  assert.equal(storedBarberPhotoPath(url+'?foo=1',base,shop,barber),null);
  assert.equal(storedBarberPhotoPath(base+'/storage/v1/object/public/another-bucket/'+path,base,shop,barber),null);
});
