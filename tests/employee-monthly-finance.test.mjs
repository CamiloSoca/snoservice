import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const db=readFileSync(new URL('../supabase/migrations/20261105_employee_fixed_monthly_prepaid.sql',import.meta.url),'utf8');
const api=readFileSync(new URL('../app/api/admin/fixed-subscriptions/route.ts',import.meta.url),'utf8');
const apiComplete=readFileSync(new URL('../app/api/agenda/fixed/complete/route.ts',import.meta.url),'utf8');
const monthly=readFileSync(new URL('../components/FixedMonthlyPanel.tsx',import.meta.url),'utf8');
const fixed=readFileSync(new URL('../components/FixedAgendaManager.tsx',import.meta.url),'utf8');
const barber=readFileSync(new URL('../app/api/barber/bootstrap/route.ts',import.meta.url),'utf8');
const admin=readFileSync(new URL('../app/admin/page.tsx',import.meta.url),'utf8');

test('admite planes mensuales de cualquier barbero activo; no sólo del dueño',()=>{
 assert.match(db,/CREATE OR REPLACE FUNCTION public.guard_fixed_monthly_plan_owner/);
 assert.match(db,/SELECT b.active,f.complimentary/);
 assert.doesNotMatch(api,/Esta función solamente aplica a clientes fijos del dueño/);
 assert.match(fixed,/!item.complimentary&&monthlyMonth/);
});
test('registrar pago ya realizado no modifica caja ni duplica cobro',()=>{
 assert.match(api,/body\?\.action==='record_paid'/);
 assert.match(api,/record_fixed_monthly_paid_off_drawer/);
 assert.match(db,/payment_source='historical_off_drawer' AND manual_charge_id IS NULL/);
 const segment=db.split('CREATE OR REPLACE FUNCTION public.record_fixed_monthly_paid_off_drawer')[1].split('-- A covered cut')[0];
 assert.doesNotMatch(segment,/INSERT INTO public.manual_charges/);
 assert.doesNotMatch(segment,/cash_register_for_finance/);
 assert.match(segment,/IF EXISTS \(SELECT 1 FROM public.fixed_monthly_periods/);
 assert.match(db,/REVOKE ALL ON FUNCTION public.record_fixed_monthly_paid_off_drawer/);
 assert.match(api,/requireAdminSession/);
 assert.match(monthly,/Registrar pago ya realizado \(sin mover caja\)/);
});
test('mensualidad con caja cobra una vez; comisión se genera en cada corte',()=>{
 assert.match(db,/monthly_prepaid boolean NOT NULL DEFAULT false/);
 assert.match(db,/NEW.monthly_prepaid THEN 0 ELSE v_rate/);
 const completed=db.split('CREATE OR REPLACE FUNCTION public.complete_fixed_monthly_occurrence')[1];
 assert.match(completed,/v_total:=round\(v_period.price_snapshot\*v_rate\/100,2\)/);
 assert.match(completed,/v_share:=CASE WHEN v_used=v_period.included_cuts-1/);
 assert.match(completed,/INSERT INTO public.fixed_monthly_uses/);
 assert.doesNotMatch(completed,/INSERT INTO public.manual_charges/);
 assert.match(apiComplete,/mode==='subscription'/);
});
test('saldo de barberos y reportes incluyen sólo comisiones devengadas',()=>{
 assert.match(db,/SELECT f.barber_id,coalesce\(sum\(u.barber_earnings_snapshot\),0\)/);
 assert.match(barber,/barber_earnings_snapshot/);
 assert.match(admin,/monthlyCommission/);
 assert.match(admin,/externalMonthlyTotal/);
});
