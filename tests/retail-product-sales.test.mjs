import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

const db=read('supabase/migrations/20261118_retail_wax_products_and_sales.sql');
const cash=read('supabase/migrations/20261118_retail_cash_reconciliation.sql');
const report=read('supabase/migrations/20261118_retail_finance_summary.sql');
const api=read('app/api/retail/route.ts');
const publicPage=read('app/ceras/page.tsx');
const home=read('components/HomeClient.tsx');
const barber=read('components/BarberClient.tsx');
const admin=read('app/admin/page.tsx');
const sales=read('components/RetailSalesPanel.tsx');

test('producto de 350 inicia con stock cero, nunca ficticio',()=>{
 assert.match(db,/golden-moustache-matte-60g/);
 assert.match(db,/350,0,true/);
 assert.match(db,/stock_quantity integer NOT NULL DEFAULT 0/);
 assert.match(db,/CHECK\(stock_quantity >= 0\)/);
});

test('venta de cera descuenta stock y cobra en una misma transacción atómica',()=>{
 assert.match(db,/CREATE OR REPLACE FUNCTION public.record_retail_sale/);
 assert.match(db,/FROM public.retail_products\s+WHERE id=p_product_id AND shop_id=p_shop_id FOR UPDATE/);
 assert.match(db,/UPDATE public.retail_products\s+SET stock_quantity=stock_quantity-p_quantity/);
 assert.match(db,/INSERT INTO public.retail_sales/);
 assert.match(db,/v_product.stock_quantity<p_quantity/);
 assert.match(db,/v_register:=public.cash_register_for_finance\(p_shop_id\)/);
 assert.match(db,/request_id uuid NOT NULL UNIQUE/);
 assert.match(db,/v_prior\.quantity<>p_quantity/);
});

test('no se suma comisión del barbero por vender productos',()=>{
 assert.match(db,/barber_commission numeric NOT NULL DEFAULT 0 CHECK\(barber_commission=0\)/);
 assert.match(db,/p_payment_method,0/);
 assert.doesNotMatch(db,/INSERT INTO public.manual_charges/);
 assert.doesNotMatch(db,/UPDATE public.barber_payouts/);
 assert.match(sales,/No genera comisión para los barberos/);
});

test('caja incorpora venta de producto en efectivo, transferencia e informe de cierre',()=>{
 assert.match(cash,/FROM public.retail_sales/);
 assert.match(cash,/v_cashin:=v_cashin\+v_cash;v_transferin:=v_transferin\+v_transfer/);
 assert.match(cash,/v_gross:=v_gross\+v_retail/);
 assert.match(cash,/'retailSales',v_retail/);
 assert.match(report,/cashThisMonth/);
 assert.match(report,/transferThisMonth/);
});

test('inventario privado y registros no están expuestos al navegador sin sesión',()=>{
 for(const table of ['retail_products','retail_sales','retail_stock_adjustments']){
   assert.match(db,new RegExp('ALTER TABLE public\\.'+table+' ENABLE ROW LEVEL SECURITY'));
 }
 assert.match(db,/REVOKE ALL ON public.retail_products,public.retail_sales,public.retail_stock_adjustments FROM PUBLIC,anon,authenticated/);
 assert.match(db,/REVOKE ALL ON FUNCTION public.record_retail_sale/);
 assert.match(db,/REVOKE ALL ON FUNCTION public.set_retail_stock/);
 assert.match(api,/verifyCsrfOrigin\(request\)/);
 assert.match(api,/await getBarberSession\(\)/);
 assert.match(api,/await requireAdminSession\(\)/);
 assert.match(api,/body.action==='SET_STOCK'&&identity.role==='admin'/);
 assert.match(api,/p_barber_id:identity.barberId/);
});

test('control visual separado en clientes, barbero y administración',()=>{
 assert.match(publicPage,/api\/retail\?scope=public/);
 assert.match(publicPage,/no cobra ni reserva productos/);
 assert.match(home,/href="\/ceras"/);
 assert.match(barber,/<RetailSalesPanel scope="barber"\/>/);
 assert.match(admin,/<RetailSalesPanel scope="admin" \/>/);
 assert.match(sales,/action:'SALE'/);
 assert.match(sales,/action:'SET_STOCK'/);
 assert.match(sales,/crypto\.randomUUID\(\)/);
 assert.match(sales,/¿Confirmás que cobraste/);
});
