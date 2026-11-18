import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

const api=read('app/api/retail/route.ts');
const panel=read('components/RetailSalesPanel.tsx');
const migration=read('supabase/migrations/20261118_retail_seller_breakdown.sql');

test('la API separa historial propio y totales propios por sesión autenticada',()=>{
  assert.match(api,/const session=await getBarberSession\(\)/);
  assert.match(api,/\.eq\('id',session\.sub\)\.maybeSingle\(\)/);
  assert.match(api,/if\(identity\.role==='barber'\)history=history\.eq\('barber_id',identity\.barberId\)/);
  assert.match(api,/db\.rpc\('retail_sales_summary',\{p_shop_id:SHOP_UUID,p_barber_id:identity\.barberId\}\)/);
  assert.match(api,/unitsTotal:Number\(ownSummary\?\.unitsTotal\|\|0\)/);
  assert.match(api,/unitsThisMonth:Number\(ownSummary\?\.unitsThisMonth\|\|0\)/);
  assert.match(api,/\.\.\.\(identity\.role==='admin'\?\{/);
});

test('el desglose entre barberos jamás se consulta ni envía sin rol admin',()=>{
  assert.match(api,/identity\.role==='admin'\s*\?\s*db\.rpc\('retail_seller_breakdown'/);
  assert.match(api,/sellerBreakdown:breakdown\.data\|\|\[\]/);
  assert.match(api,/const admin=await requireAdminSession\(\)/);
  assert.doesNotMatch(api,/get\('barberId'\)|searchParams\.get\('barberId'\)/);
  assert.doesNotMatch(api,/body\.barberId/);
});

test('sólo administración puede ejecutar el resumen por vendedor',()=>{
  assert.match(migration,/CREATE OR REPLACE FUNCTION public\.retail_seller_breakdown/);
  assert.match(migration,/s\.shop_id=p_shop_id/);
  assert.match(migration,/b\.shop_id=p_shop_id/);
  assert.match(migration,/LEFT JOIN totals t ON t\.barber_id=b\.id/);
  assert.match(migration,/WHERE t\.barber_id IS NULL/);
  assert.match(migration,/REVOKE ALL ON FUNCTION public\.retail_seller_breakdown\(uuid\)\s*FROM PUBLIC,anon,authenticated/);
  assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.retail_seller_breakdown\(uuid\)\s*TO service_role/);
});

test('los barberos sólo ven su propio conteo y Nahuel ve unidades por vendedor',()=>{
  assert.match(panel,/scope==='barber'\?\(/);
  assert.match(panel,/Mis ceras vendidas este mes/);
  assert.match(panel,/Mis ceras vendidas en total/);
  assert.match(panel,/scope==='admin'\?'Últimas ventas registradas':'Mis últimas ventas'/);
  assert.match(panel,/Ceras vendidas por barbero/);
  assert.match(panel,/data\.sellerBreakdown\|\|\[\]/);
  assert.match(panel,/seller\.name/);
  assert.match(panel,/seller\.unitsMonth/);
  assert.match(panel,/seller\.unitsTotal/);
  assert.doesNotMatch(panel,/La venta es 100% de Nahuel|No genera comisión para los barberos/);
});

test('estadística de productos no modifica la lógica del stock ni comisiones',()=>{
  const finance=read('supabase/migrations/20261118_retail_wax_products_and_sales.sql');
  assert.match(finance,/barber_commission numeric NOT NULL DEFAULT 0 CHECK\(barber_commission=0\)/);
  assert.match(finance,/UPDATE public\.retail_products\s+SET stock_quantity=stock_quantity-p_quantity/);
  assert.doesNotMatch(migration,/UPDATE public\.retail_sales|INSERT INTO public\.retail_sales|UPDATE public\.barber_payouts/);
});
