import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const bootstrap = read('app/api/barber/bootstrap/route.ts');
const store = read('lib/booking-store.ts');
const staff = read('components/BarberClient.tsx');
const admin = read('app/admin/page.tsx');

test('barber fallback only selects existing columns on tips and includes manual charge author', () => {
  const tipSelect = bootstrap.split("timed('tips'")[1]?.split("timed('charges'")[0] || '';
  const chargeSelect = bootstrap.split("timed('charges'")[1]?.split("timed('cash'")[0] || '';
  assert.match(tipSelect, /select\('id,barber_id,amount,note,date_string,created_at,cash_register_id'\)/);
  assert.doesNotMatch(tipSelect, /created_by_role|created_by_barber_id/);
  assert.match(chargeSelect, /created_by_role,created_by_barber_id/);
  assert.match(tipSelect, /eq\('barber_id', session.sub\)/);
  assert.match(chargeSelect, /eq\('barber_id', session.sub\)/);
});

test('manual charge save receipt separates confirmed POST from failed GET without duplicate POST', () => {
  assert.match(store, /export interface ManualChargeSaveResult/);
  assert.match(store, /const receipt = await apiRequest\('\/api\/finance', jsonRequest\('POST'/);
  assert.match(store, /const charges = await getManualCharges\(item.scope === 'barber' \? item.barberId : undefined, item.scope\)/);
  assert.match(store, /return \{id: receipt.id as string, charges\};/);
  assert.match(store, /catch \{[\s\S]*?return \{id: receipt.id as string, charges: null\};/);
  assert.equal((store.match(/const receipt = await apiRequest\('\/api\/finance', jsonRequest\('POST'/g) || []).length,1);
});

test('barber has an inline success/warning/error message below the manual charge form', () => {
  assert.match(staff, /setChargeFeedback\(result.charges !== null/);
  assert.match(staff, /Ingreso guardado correctamente/);
  assert.match(staff, /Ingreso guardado, pero todavía no se pudo actualizar la lista/);
  assert.match(staff, /No se pudo confirmar el ingreso/);
  const chargeForm = staff.split('<form onSubmit={handleAddMyCharge}')[1]?.split('{monthlyCharges.length > 0')[0] || '';
  assert.match(chargeForm, /chargeFeedback &&/);
  assert.match(chargeForm, /role=\{chargeFeedback.kind === 'error' \? 'alert' : 'status'\}/);
  assert.match(staff, /if \(result.charges !== null\) \{\s*setBarberCharges\(result.charges\)/);
  assert.match(staff, /chargeAttempt.current = null;/);
});

test('admin never interprets a failed refresh as a failed charge write', () => {
  assert.match(admin, /if \(result.charges !== null\) \{\s*setManualCharges\(result.charges\)/);
  assert.match(admin, /Cobro registrado, pero no se pudo actualizar la lista/);
});
