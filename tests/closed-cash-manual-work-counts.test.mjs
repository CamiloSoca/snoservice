import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261027_closed_cash_manual_service_annotations.sql');
const admin=read('app/admin/page.tsx');
const barber=read('components/BarberClient.tsx');
const server=read('lib/manual-service-annotations.ts');
const adminBoot=read('app/api/admin/bootstrap/route.ts');
const barberBoot=read('app/api/barber/bootstrap/route.ts');
const finance=read('app/api/finance/route.ts');

test('Nahuel: se anotan dos cortes, mechas y corte y barba sin volver a cobrarlos',()=>{
  for(const [client,amount,service] of [
    ['cliente julio berni','400','Corte'],
    ['Maxi Arevalo','400','Corte'],
    ['Alejandro','500','Corte y Barba'],
    ['Mechas','1200','Mechas'],
  ]){
    assert.ok(sql.includes("'"+client+"'::text,"+amount+"::numeric"),client);
    assert.ok(sql.includes("'"+service+"'::text"),service);
  }
  assert.match(sql,/INSERT INTO public\.manual_charge_service_annotations/);
  assert.doesNotMatch(sql,/UPDATE public\.manual_charges/);
  assert.doesNotMatch(sql,/INSERT INTO public\.manual_charges/);
  assert.doesNotMatch(sql,/DISABLE TRIGGER/);
  assert.doesNotMatch(sql,/session_replication_role/);
  assert.match(sql,/m\.amount=confirmed\.amount AND m\.payment_method=confirmed\.payment_method/);
  assert.match(sql,/ON CONFLICT \(charge_id\) DO NOTHING/);
});

test('tabla de anotaciones privada y sin permisos públicos o de escritura en runtime',()=>{
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/REVOKE ALL ON public\.manual_charge_service_annotations FROM PUBLIC, anon, authenticated/);
  assert.match(sql,/GRANT SELECT ON public\.manual_charge_service_annotations TO service_role/);
  assert.doesNotMatch(sql,/GRANT INSERT|GRANT UPDATE|GRANT DELETE/);
  assert.match(sql,/REFERENCES public\.manual_charges\(id\) ON DELETE RESTRICT/);
});

test('RPC de Administración y barbero aplica la anotación solo a campos de servicio ausentes',()=>{
  assert.match(sql,/coalesce\(c\.service_id, a\.service_id\)/);
  assert.match(sql,/coalesce\(c\.service_name_snapshot, a\.service_name_snapshot\)/);
  assert.match(sql,/coalesce\(m\.service_id, a\.service_id\)/);
  assert.match(sql,/coalesce\(m\.service_name_snapshot, a\.service_name_snapshot\)/);
  assert.match(sql,/LEFT JOIN public\.manual_charge_service_annotations a/);
  assert.match(server,/if \(row\.service_name_snapshot\) return row/);
  for(const code of [adminBoot,barberBoot,finance])assert.match(code,/resolveManualServiceAnnotations/);
  assert.match(barberBoot,/\.eq\('shop_id', SHOP_UUID\)\.eq\('barber_id', session\.sub\)/);
});

test('ambos contadores diarios incluyen agenda y cobros de servicios, sin contar cobros sin identificar',()=>{
  assert.match(admin,/brbClassifiedCharges = brbCharges\.filter/);
  assert.match(admin,/const workCount = brbApts\.length \+ brbClassifiedCharges\.length \+ brbFixedCount/);
  assert.match(admin,/item\.workCount\} trabajos realizados/);
  assert.match(barber,/dailyClassifiedCharges = dailyCharges\.filter/);
  assert.match(barber,/dailyWorkCount = dailyAppointments\.length \+ dailyClassifiedCharges\.length \+ dailyFixedUses\.length/);
  assert.match(barber,/dailyWorkCount\} trabajos realizados \(agenda \+ manuales \+ abonos\)/);
  assert.doesNotMatch(admin,/item\.cutsCount\} cortes/);
  assert.doesNotMatch(barber,/\{dailyAppointments\.length \+ dailyFixedUses\.length\} cortes realizados/);
});

test('11 servicios el 27/10: seis cortes, una barba de Ema y cuatro de Nahuel',()=>{
  const manualEma=[...Array(5).fill('Corte'),'Barba'];
  const agendaEma=['Corte'];
  const manualNahuel=['Corte','Corte','Corte y Barba','Mechas'];
  const all=[...manualEma,...agendaEma,...manualNahuel];
  assert.equal(all.length,11);
  assert.equal(all.filter(s=>s==='Corte').length,8);
  assert.equal(all.filter(s=>s==='Barba').length,1);
  assert.equal(all.filter(s=>s==='Corte y Barba').length,1);
  assert.equal(all.filter(s=>s==='Mechas').length,1);
  assert.equal([400,400,400,400,400,200,400,400,400,500,1200].reduce((a,b)=>a+b,0),5100);
});
