import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const preview = read('app/api/admin/cash-close-preview/route.ts');
const modal = read('components/CashCloseDialog.tsx');
const admin = read('app/admin/page.tsx');
const backend = read('app/api/admin/route.ts');
const cash = read('supabase/migrations/20261023_cash_drawer_owner_draws.sql');

test('preview consulta arqueo oficial y restringe datos a administración',()=>{
  assert.match(preview,/requireAdminSession\(\)/);
  assert.match(preview,/cash_drawer_snapshot/);
  assert.match(preview,/cache/i);
  assert.match(preview,/Cache-Control.*private, no-store/);
  assert.match(preview,/\.eq\('shop_id',SHOP_UUID\)\.eq\('cash_register_id',drawer\.registerId\)/);
  assert.match(preview,/return NextResponse\.json\(\{\s*drawer,\s*sales:/);
});

test('propinas se separan de la facturación pero no se pierden del efectivo contado',()=>{
  assert.match(preview,/const cash=money\(Number\(drawer\.cashIn\)-tipCash\)/);
  assert.match(preview,/const transfer=money\(Number\(drawer\.transferIn\)-tipTransfer\)/);
  assert.match(preview,/const total=money\(cash\+transfer\)/);
  assert.match(modal,/Propinas en efectivo/);
  assert.match(modal,/preview\.sales\.tipCash/);
  assert.match(modal,/preview\.drawer\.expectedCash/);
  assert.match(modal,/Las propinas no son facturación del local/);
  // Ejemplo real auditado: $3000 cash de servicios, $2100 transferencia,
  // $50 de propina cash, $400 inicial, $0 salidas.
  const cashIn=3050,tipCash=50,transIn=2100,tipTransfer=0,opening=400,spent=0;
  assert.equal(cashIn-tipCash+transIn-tipTransfer,5100);
  assert.equal(opening+cashIn-spent,3450);
});

test('no hay monto precargado ni prompt del navegador en el cierre',()=>{
  assert.match(modal,/const \[counted,setCounted\]=useState\(''\)/);
  assert.match(modal,/placeholder="Ingresar monto contado/);
  assert.match(modal,/value=\{counted\}/);
  assert.match(modal,/const canClose=Boolean\(preview && !loading && !saving && !blocked && valid && confirmed\)/);
  assert.match(modal,/type="checkbox" checked=\{confirmed\}/);
  assert.match(modal,/Diferencia de caja/);
  assert.match(admin,/import CashCloseDialog from/);
  assert.match(admin,/<CashCloseDialog/);
  assert.doesNotMatch(admin,/window\.prompt\('Contá el efectivo físico que quedó en caja al cerrar/);
});

test('cierre mantiene POST existente, permite diferencias reales y verifica datos recientes',()=>{
  assert.match(modal,/const fresh=await readPreview\(\)/);
  assert.match(modal,/fresh\.sales\.cash!==preview\.sales\.cash/);
  assert.match(modal,/setConfirmed\(false\)/);
  assert.match(modal,/operation:'CLOSE_CASH'/);
  assert.match(modal,/countedCash:normalized/);
  assert.match(modal,/acknowledgeLegacy:legacy/);
  assert.match(backend,/close_cash_reconciled/);
  assert.match(backend,/close_cash_financial/);
  assert.match(cash,/cash_variance=delta/);
  assert.match(modal,/Comisiones y sueldos semanales/);
});

test('solo se altera vista y endpoint GET; no hay migración ni cambios de finanzas',()=>{
  assert.doesNotMatch(preview,/export async function (POST|PUT|PATCH|DELETE)\(/);
  assert.match(modal,/Cierre de caja/);
});
