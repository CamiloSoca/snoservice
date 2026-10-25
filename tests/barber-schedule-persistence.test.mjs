import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeHours} from '../lib/weekly-hours.ts';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('RPC de inicio devuelve horario personal de cada barbero',()=>{
 const sql=read('security/production/20_admin_bootstrap_barber_schedule.sql');
 assert.match(sql,/commission_rate,is_owner,image_url,working_schedule/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.admin_bootstrap_snapshot/);
 assert.match(sql,/BEGIN;/);
 assert.match(sql,/COMMIT;/);
 assert.match(sql,/RPC administrativo cambió: cancelar/);
 assert.doesNotMatch(sql,/UPDATE public\.barbers|UPDATE public\.appointments|DELETE FROM public\./);
});

test('admin nunca acepta snapshot RPC que omite horarios propios',()=>{
 const code=read('app/api/admin/bootstrap/route.ts');
 assert.match(code,/fastData\.barbers\.every\(/);
 assert.match(code,/hasOwnProperty\.call\(barber, 'working_schedule'\)/);
 assert.match(code,/working_schedule'\)/);
 assert.match(code,/rpcUnavailableUntil/);
 assert.match(code,/using consultas paralelas/);
 assert.match(code,/working_schedule'\)/);
});
test('guardado de horarios confirma persistencia tras SELECT real, no solo POST',()=>{
 const ui=read('app/admin/page.tsx');
 const store=read('lib/booking-store.ts');
 assert.match(ui,/await saveBarbers\(\[barber\]\)/);
 assert.match(ui,/const fresh = \(await getAdminBarbers\(true\)\)/);
 assert.match(ui,/JSON\.stringify\(expectedHours\) !== JSON\.stringify\(persistedHours\)/);
 assert.match(ui,/Verificando guardado/);
 assert.match(store,/api\/admin\?resource=barbers', \{cache:'no-store'\}/);
 assert.doesNotMatch(ui,/await saveBarbers\(barbers\);/);
});
test('modificar un barbero no sobrescribe otros ni borra horarios omitidos',()=>{
 const ui=read('app/admin/page.tsx');
 const api=read('app/api/admin/route.ts');
 assert.match(ui,/await saveBarbers\(\[newItem\]\)/);
 assert.match(ui,/await saveBarbers\(\[changed\]\)/);
 assert.match(api,/hasWorkingSchedule/);
 assert.match(api,/hasWorkingSchedule \? \{working_schedule: workingSchedule\} : \{\}/);
});
test('normalización preserva un horario completo y rechaza horas imposibles',()=>{
 const valid={
 lunes:{isOpen:true,openTime:'10:00',closeTime:'18:00'},
 martes:{isOpen:true,openTime:'09:00',closeTime:'17:00'},
 miercoles:{isOpen:true,openTime:'09:00',closeTime:'17:00'},
 jueves:{isOpen:true,openTime:'09:00',closeTime:'17:00'},
 viernes:{isOpen:true,openTime:'09:00',closeTime:'17:00'},
 sabado:{isOpen:false,openTime:'09:00',closeTime:'13:00'},
 domingo:{isOpen:false,openTime:'09:00',closeTime:'13:00'},
 };
 assert.deepEqual(normalizeHours(valid),valid);
 assert.throws(()=>normalizeHours({...valid,lunes:{isOpen:true,openTime:'22:00',closeTime:'09:00'}}));
});
