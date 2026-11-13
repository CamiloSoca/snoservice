import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const publicManifest=JSON.parse(read('public/manifest.json'));
const adminManifest=JSON.parse(read('public/admin-manifest.webmanifest'));
const barberManifest=JSON.parse(read('public/barbero-manifest.webmanifest'));
const root=read('app/layout.tsx');
const admin=read('app/admin/layout.tsx');
const barber=read('app/barbero/layout.tsx');
const barberPage=read('app/barbero/page.tsx');

test('la app de clientes sigue abriendo la portada pública',()=>{
  assert.equal(publicManifest.start_url,'/');
  assert.match(root,/manifest: "\/manifest\.json"/);
});

test('el acceso de los barberos instala una app separada que abre /barbero',()=>{
  assert.equal(barberManifest.id,'/barbero');
  assert.equal(barberManifest.start_url,'/barbero');
  assert.equal(barberManifest.scope,'/');
  assert.equal(barberManifest.display,'standalone');
  assert.match(barberManifest.name,/Barberos/);
  assert.match(barber,/manifest: '\/barbero-manifest\.webmanifest'/);
  assert.match(barber,/title: '13 CUT Barberos'/);
  assert.equal(barberManifest.icons[0].src,publicManifest.icons[0].src);
  assert.match(barberPage,/BarberClient/);
});

test('barberos, administración y clientes tienen tres inicios distintos',()=>{
  const apps=[publicManifest,adminManifest,barberManifest];
  assert.equal(new Set(apps.map(x=>x.start_url)).size,3);
  assert.equal(new Set([publicManifest.id||publicManifest.start_url,adminManifest.id,barberManifest.id]).size,3);
  assert.equal(adminManifest.start_url,'/admin');
  assert.match(admin,/manifest: '\/admin-manifest\.webmanifest'/);
});

test('el cambio no modifica permisos, caja ni agenda',()=>{
  assert.doesNotMatch(barber,/supabase-server|requireAdminSession|finance|redirect/i);
  assert.doesNotMatch(barberManifest.description,/token|password|secret/i);
});
