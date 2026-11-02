import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

const integration=read('lib/instagram-server.ts');
const adminStatus=read('app/api/admin/instagram/status/route.ts');
const adminCard=read('components/admin/InstagramConnection.tsx');
const callback=read('app/api/admin/instagram/callback/route.ts');
const publicFeed=read('app/api/public/instagram/route.ts');

test('Instagram no se marca sano solo porque un token existe',()=>{
  assert.match(integration,/feedStatus = posts.length \? 'ok' : 'empty'/);
  assert.match(integration,/await fetchInstagramFeed\(\)/);
  assert.match(integration,/savedAt: connection\?\.updated_at/);
  assert.match(adminCard,/status.feedStatus === 'ok' \? 'Publicaciones disponibles' : 'Acceso guardado'/);
  assert.match(adminCard,/La conexión no está entregando publicaciones/);
  assert.match(adminCard,/Última autorización guardada/);
});

test('error de Meta se clasifica por números sin guardar tokens ni respuesta completa',()=>{
  assert.match(integration,/IG_META_HTTP_/);
  assert.match(integration,/IG_TOKEN_DECRYPT_FAILED/);
  assert.match(integration,/INSTAGRAM_PUBLIC_FEED_ERROR/);
  assert.match(integration,/INSTAGRAM_MEDIA_EMPTY/);
  assert.match(callback,/INSTAGRAM_OAUTH_CALLBACK_FAILED/);
  assert.doesNotMatch(integration,/console\.\w+\(.*accessToken/);
  assert.doesNotMatch(callback,/console\.\w+\(.*code.*\)/);
});

test('solo el administrador recibe diagnóstico y nunca secretos',()=>{
  assert.match(adminStatus,/requireAdminSession\(\)/);
  assert.match(adminStatus,/status: 401/);
  assert.match(adminCard,/oauthResult === 'invalid_state'/);
  assert.match(adminCard,/oauthResult === 'unauthorized'/);
  assert.match(adminCard,/oauthResult === 'connected'/);
  assert.match(callback,/timingSafeEqual/);
  assert.match(publicFeed,/NextResponse\.json\(\{ posts \}/);
  assert.doesNotMatch(publicFeed,/failureCode|token_expires_at|access_token_encrypted/);
});

test('reserva y demás datos de 13 CUT no se ven afectados',()=>{
  assert.doesNotMatch(integration,/from\('appointments'\)|from\('cash_registers'\)|from\('fixed_monthly/);
  assert.doesNotMatch(adminCard,/updateAppointment|saveCashRegister|cancelBooking/);
});

test('si Instagram rechaza campos opcionales el feed prueba solo campos mínimos',()=>{
  assert.match(integration,/INSTAGRAM_MINIMAL_FIELDS_RETRY/);
  assert.match(integration,/safeInstagramErrorCode\(error\)/);
  assert.match(integration,/IG_META_HTTP_400_CODE_\(100\|200\)/);
  assert.match(integration,/fields: 'id,media_type,media_url,thumbnail_url,permalink,timestamp'/);
  assert.match(adminCard,/Meta rechazó el acceso a publicaciones por permisos/);
  assert.match(adminCard,/instagram_business_basic/);
});
