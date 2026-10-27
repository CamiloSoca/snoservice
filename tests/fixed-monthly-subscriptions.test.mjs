// Contratos verificables sin conexión DB. Las pruebas de ejecución transaccional
// están en tests/qa_abonos_rollback.sql y se corren en STAGING después de migrar.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(resolve(root,p),'utf8');
const sql=read('supabase/migrations/20261026_fixed_monthly_subscriptions.sql');
const fkIndexes=read('supabase/migrations/20261026_fixed_monthly_fk_indexes.sql');
const activeOwnerGuard=read('supabase/migrations/20261027_fixed_monthly_active_owner_guard.sql');
const api=read('app/api/agenda/fixed/complete/route.ts');
const adminApi=read('app/api/admin/fixed-subscriptions/route.ts');
const adminBootstrap=read('app/api/admin/bootstrap/route.ts');
const barberBootstrap=read('app/api/barber/bootstrap/route.ts');
const adminView=read('app/admin/page.tsx');
const barberView=read('components/BarberClient.tsx');

test('Pago mensual único, con caja abierta y precio histórico',()=>{
  assert.match(sql,/UNIQUE\(shop_id,fixed_booking_id,period_month\)/);
  assert.match(sql,/cash_register_for_finance\(p_shop_id\)/);
  assert.match(sql,/price_snapshot/);
  assert.match(sql,/INSERT INTO public\.manual_charges/);
});
test('Los cortes abonados se completan sin insertar movimientos financieros',()=>{
  const block=sql.split('CREATE FUNCTION public.complete_fixed_monthly_occurrence')[1]
     .split('CREATE OR REPLACE FUNCTION public.complete_fixed_booking_occurrence')[0];
  assert.match(block,/INSERT INTO public\.fixed_monthly_uses/);
  assert.doesNotMatch(block,/INSERT INTO public\.manual_charges/);
  assert.match(block,/v_used>=v_period\.included_cuts/);
  assert.match(api,/mode==='subscription'/);
});
test('Turnos ausentes/cancelados no consumen beneficios',()=>{
  const block=sql.split('CREATE FUNCTION public.complete_fixed_monthly_occurrence')[1]
     .split('CREATE OR REPLACE FUNCTION public.complete_fixed_booking_occurrence')[0];
  assert.match(block,/p_occurrence=ANY\(v_fixed\.skipped_dates\)/);
  assert.match(block,/v_fixed\.active/);
});
test('Las cuotas se renuevan por período sin cobro automático',()=>{
  assert.match(sql,/period_month=date_trunc\('month',p_occurrence\)::date/);
  assert.match(sql,/p_month <> date_trunc\('month',v_now\)::date/);
  assert.doesNotMatch(sql,/cron\.schedule|pg_cron/i);
  assert.match(adminApi,/action==='pay'/);
});
test('La simultaneidad está protegida con bloqueo y índices únicos',()=>{
  assert.match(sql,/fixed_bookings\r?\n  WHERE id=p_fixed_id AND shop_id=p_shop_id FOR UPDATE/);
  assert.match(sql,/UNIQUE\(shop_id,fixed_booking_id,occurrence_date\)/);
  assert.match(sql,/UNIQUE\(shop_id,fixed_booking_id,period_month\)/);
});
test('La API requiere autorización y protección CSRF',()=>{
  assert.match(adminApi,/requireAdminSession\(\)/);
  assert.match(adminApi,/verifyCsrfOrigin\(request\)/);
  assert.match(adminApi,/\.eq\('shop_id',SHOP_UUID\)/);
});
test('Covered uses are counted as performed services without adding revenue',()=>{
  assert.match(adminBootstrap,/fixed_monthly_uses/);
  assert.match(barberBootstrap,/fixed_monthly_uses/);
  assert.match(adminView,/filteredMonthlyUses/);
  assert.match(barberView,/monthlyFixedUses/);
  assert.doesNotMatch(barberView,/monthlyFixedUses\.reduce\([\s\S]{0,180}amount/);
});
test('Five-Sunday rollback fixture uses four benefits and charges the fifth individually',()=>{
  const qa=read('tests/qa_abonos_rollback.sql');
  assert.match(qa,/2026-08-30/);
  assert.match(qa,/El quinto uso abonado no fue rechazado/);
  assert.match(qa,/complete_fixed_booking_occurrence\(v_shop,v_fixed,v_fifth_sunday,'transfer'\)/);
  assert.match(qa,/ROLLBACK;/);
});
test('Foreign-key indexes and active-owner payment guard are recorded as migrations',()=>{
  assert.match(fkIndexes,/fixed_monthly_periods\(shop_id, manual_charge_id\)/);
  assert.match(fkIndexes,/fixed_monthly_uses\(period_id, shop_id, fixed_booking_id\)/);
  assert.match(activeOwnerGuard,/SELECT is_owner,active INTO v_owner,v_barber_active/);
  assert.match(activeOwnerGuard,/v_barber_active IS DISTINCT FROM true/);
  assert.match(activeOwnerGuard,/REVOKE ALL ON FUNCTION/);
});
