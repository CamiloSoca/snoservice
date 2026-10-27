import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = p => readFileSync(new URL('../'+p,import.meta.url),'utf8');
const api=read('app/api/finance/route.ts');
const store=read('lib/booking-store.ts');
const staff=read('components/BarberClient.tsx');
const admin=read('app/admin/page.tsx');
const adminBootstrap=read('app/api/admin/bootstrap/route.ts');
const barberBootstrap=read('app/api/barber/bootstrap/route.ts');
const sql=read('supabase/migrations/20261027_manual_charge_actor_attribution.sql');

test('la pantalla de barbero tiene un alcance de sesión explícito aun con admin abierto',()=>{
  assert.match(api,/if \(barberScope\)/);
  assert.match(api,/barber\.sub !== barberId/);
  assert.match(api,/return \{admin: false, barberId: barber\.sub\}/);
  assert.match(api,/authorize\(barberId, params\.get\('scope'\) === 'barber'\)/);
  assert.match(api,/authorize\(barberId, body\.scope === 'barber'\)/);
  assert.match(api,/authorize\(null, body\.scope === 'barber'\)/);
  assert.match(api,/item\.barber_id !== session\.barberId/);
});
test('cobros y propinas del barbero nunca reemplazan la lista por registros globales',()=>{
  assert.match(staff,/scope: 'barber'/);
  assert.match(staff,/deleteManualCharge\(chargeId, selectedBarberId, 'barber'\)/);
  assert.match(staff,/deleteTip\(tipId, selectedBarberId, 'barber'\)/);
  assert.match(store,/getManualCharges\(item\.scope === 'barber' \? item\.barberId : undefined, item\.scope\)/);
  assert.match(store,/getTips\(item\.scope === 'barber' \? item\.barberId : undefined, item\.scope\)/);
});
test('auditoría deriva autor de sesión, sin aceptar identidad enviada por cliente',()=>{
  assert.match(api,/created_by_role:session\.admin\?'admin':'barber'/);
  assert.match(api,/created_by_barber_id:session\.admin\?null:session\.barberId/);
  assert.match(store,/createdByRole: d\.created_by_role/);
  assert.match(admin,/Registrado por:/);
  assert.match(admin,/Sin registrar \(anterior a esta mejora\)/);
  assert.match(adminBootstrap,/created_by_role,created_by_barber_id/);
  assert.match(barberBootstrap,/created_by_role,created_by_barber_id/);
});
test('migración agrega columnas sin borrar registros ni reescribir comisiones',()=>{
  assert.match(sql,/ADD COLUMN IF NOT EXISTS created_by_role/);
  assert.match(sql,/ADD COLUMN IF NOT EXISTS created_by_barber_id/);
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.admin_bootstrap_snapshot/);
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.barber_bootstrap_snapshot/);
  assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE|DELETE FROM public\.manual_charges|UPDATE public\.manual_charges/i);
});
