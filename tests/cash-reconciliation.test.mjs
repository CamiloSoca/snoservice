import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migrations=read('supabase/migrations/20261023_cash_drawer_owner_draws.sql');
const base=read('supabase/migrations/20261023_local_cash_transfer_payouts.sql');
const cashRoute=read('app/api/finance/cash/route.ts');
const payouts=read('app/api/finance/payouts/route.ts');
const finance=read('app/api/finance/route.ts');
const admin=read('app/api/admin/route.ts');
const adminUI=read('app/admin/page.tsx');
const barberUI=read('components/BarberClient.tsx');
const cashUI=read('components/CashDrawerCard.tsx');
const closeUI=read('components/CashCloseDialog.tsx');

test('se registra y cuenta el medio de pago al completar, sin asumir cash de históricos',()=>{
  assert.match(migrations,/ADD COLUMN IF NOT EXISTS payment_confirmed_at/);
  assert.match(migrations,/payment_confirmed_at IS NOT NULL AND payment_method='cash'/);
  assert.match(migrations,/payment_confirmed_at IS NULL/);
  assert.match(migrations,/capture_completed_payment_method/);
  assert.match(migrations,/NEW\.payment_confirmed_at:=clock_timestamp\(\)/);
});
test('caja física suma entradas cash y resta solo salidas cash',()=>{
  assert.match(migrations,/v_cashin:=v_cashin\+v_cash/g);
  assert.match(migrations,/v_cashout:=v_cashout\+v_cash/g);
  assert.match(migrations,/COALESCE\(c\.initial_amount,0\)\+v_cashin-v_cashout/);
  assert.match(migrations,/cash_variance=delta/);
  assert.match(migrations,/p_counted_cash-expected/);
  assert.match(migrations,/opening_verified AND v_unknown=0/);
});
test('retiros owner y barbero son idempotentes, cash requiere fondos y admin autenticado',()=>{
  for(const sql of [base,migrations])assert.match(sql,/request_id/);
  assert.match(migrations,/CREATE TABLE IF NOT EXISTS public\.owner_draws/);
  assert.match(migrations,/owner_draws ENABLE ROW LEVEL SECURITY/);
  assert.match(migrations,/SECURITY INVOKER/);
  assert.match(migrations,/FOR UPDATE/);
  assert.match(migrations,/snap->>'expectedCash'/);
  assert.match(cashRoute,/requireAdminSession\(\)/);
  assert.match(cashRoute,/verifyCsrfOrigin\(request\)/);
  assert.match(payouts,/requireAdminSession\(\)/);
  assert.match(migrations,/GRANT EXECUTE ON FUNCTION public\.record_owner_draw/);
});
test('apertura exige efectivo contado; cierre distingue cierre físico y legado',()=>{
  assert.match(admin,/opening_verified:true/);
  assert.match(admin,/close_cash_reconciled/);
  assert.match(admin,/acknowledgeLegacy/);
  assert.match(adminUI,/¿Cuánto hay al abrir esta jornada/);
  assert.match(closeUI,/countedCash:normalized/);
  assert.match(closeUI,/acknowledgeLegacy:legacy/);
  assert.match(adminUI,/summary\.physicalCashVerified/);
});
test('cada movimiento identifica si fue efectivo o transferencia',()=>{
  for(const t of ['manual_charges','tips','expenses'])assert.match(migrations,new RegExp(''+t+'.*payment_method|payment_method.*'+t,'s'));
  assert.match(finance,/isOnSitePaymentMethod\(paymentMethod\)/);
  assert.match(admin,/isOnSitePaymentMethod\(exp\.paymentMethod\)/);
  assert.match(finance,/commission_rate_snapshot:rate/);
  assert.match(adminUI,/setExpensePaymentMethod/);
  assert.match(adminUI,/setTipPaymentMethod/);
  assert.match(adminUI,/setChargePaymentMethod/);
  assert.match(barberUI,/setNewTipPayment/);
  assert.match(barberUI,/setNewChargePayment/);
});
test('retiros owner no se registran como gastos operativos',()=>{
  assert.match(cashUI,/NO como gasto|no se registra como gasto/);
  assert.match(cashUI,/method==='cash'/);
  assert.match(cashRoute,/record_owner_draw/);
  assert.match(cashUI,/drawer\.reliable/);
  assert.match(cashUI,/registrado/);
});
