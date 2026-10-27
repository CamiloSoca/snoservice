import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = p => readFileSync(new URL('../' + p, import.meta.url),'utf8');

const api=read('app/api/finance/route.ts');
const store=read('lib/booking-store.ts');
const barber=read('components/BarberClient.tsx');
const admin=read('app/admin/page.tsx');
const adminBoot=read('app/api/admin/bootstrap/route.ts');
const barberBoot=read('app/api/barber/bootstrap/route.ts');
const sql=read('supabase/migrations/20261027_manual_service_classification.sql');
const booking=read('components/BookingClient.tsx');

test('barba por $200 solo existe como cobro manual, no en catálogo público',()=>{
  assert.match(barber, /value="barba_local">Barba \(solo en el local\)/);
  assert.match(admin, /value="barba_local">Barba \(solo en local\)/);
  assert.match(api, /body\.item\?\.manualServiceType === 'barba_local'/);
  assert.match(api, /amount !== 200/);
  assert.match(api, /serviceNameSnapshot = 'Barba'/);
  assert.match(booking, /services\.filter/);
  assert.doesNotMatch(booking, /barba_local/);
  assert.doesNotMatch(sql, /INSERT INTO public\.services/i);
});

test('servicios manuales usan catálogo vigente y se registra nombre estable',()=>{
  assert.match(api, /supabase\.from\('services'\)/);
  assert.match(api, /serviceNameSnapshot = service\.name/);
  assert.match(api, /service_id:serviceId,service_name_snapshot:serviceNameSnapshot/);
  assert.match(store, /serviceNameSnapshot: d\.service_name_snapshot/);
  assert.match(barberBoot, /service_id,service_name_snapshot/);
  assert.match(adminBoot, /service_id,service_name_snapshot/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.admin_bootstrap_snapshot/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.barber_bootstrap_snapshot/);
});

test('las estadísticas combinan reservas completadas con manuales clasificados por periodo',()=>{
  assert.match(barber, /const \[statsPeriod, setStatsPeriod\]/);
  assert.match(barber, /statsPeriod === 'mes'/);
  assert.match(barber, /const monday = reference\.toISOString\(\)\.slice\(0, 10\)/);
  assert.match(barber, /const periodAppointments = barberAppointments\.filter/);
  assert.match(barber, /const periodCharges = barberCharges\.filter/);
  assert.match(barber, /const periodTips = barberTips\.filter/);
  assert.match(barber, /const serviceCounts = new Map<string, number>\(\)/);
  assert.match(barber, /c\.serviceNameSnapshot \|\| 'Sin clasificar'/);
  assert.match(barber, /periodEarnings = \(isOwner \? periodGross : periodCommission\) \+ periodTipsAmount/);
  assert.match(barber, /categorizedCount/);
  assert.match(barber, /Comisiones generadas/);
  assert.match(barber, /Ganancia total/);
});

test('backfill modifica clasificación de cinco filas de Ema y NO dinero ni autor',()=>{
  const block=sql.split('UPDATE public.manual_charges AS m')[1] || '';
  assert.match(block, /SET\s+service_id/);
  assert.match(block, /service_name_snapshot = known\.kind/);
  assert.equal((block.match(/'Cliente'::text/g)||[]).length,2);
  assert.equal((block.match(/'Corte'::text/g)||[]).length,4);
  assert.equal((block.match(/'Barba'::text/g)||[]).length,1);
  assert.match(block, /AND m\.note = known\.note AND m\.amount = known\.amount/);
  assert.match(block, /AND m\.service_name_snapshot IS NULL/);
  assert.doesNotMatch(block, /\bSET\s+(?:amount|barber_earnings_snapshot|business_earnings_snapshot|created_by_role)/i);
});
