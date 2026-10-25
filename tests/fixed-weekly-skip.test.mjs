import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {upcomingFixedDates} from '../lib/fixed-booking-occurrence.ts';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const tuesday={weekday:2,start_date:'2026-10-27',end_date:null,skipped_dates:[]};

test('solo fecha inicial: un martes semanal continúa sin fecha final',()=>{
  assert.deepEqual(upcomingFixedDates(tuesday,'2026-10-25',4),
   ['2026-10-27','2026-11-03','2026-11-10','2026-11-17']);
});
test('saltear un martes libera exclusivamente ese martes, no los siguientes',()=>{
  const skipped={...tuesday,skipped_dates:['2026-11-03']};
  assert.deepEqual(upcomingFixedDates(skipped,'2026-10-25',4),
   ['2026-10-27','2026-11-10','2026-11-17','2026-11-24']);
  assert.deepEqual(upcomingFixedDates(skipped,'2026-11-04',2),
   ['2026-11-10','2026-11-17']);
});
test('respeta fecha final opcional y comienzo futuro',()=>{
  assert.deepEqual(upcomingFixedDates({...tuesday,end_date:'2026-11-04'},'2026-10-25',10),
   ['2026-10-27','2026-11-03']);
  assert.deepEqual(upcomingFixedDates({...tuesday,start_date:'2026-12-01'},'2026-10-25',1),
   ['2026-12-01']);
});
test('no muestra fechas inválidas ni toma el día equivocado por zona horaria',()=>{
  assert.deepEqual(upcomingFixedDates({...tuesday,weekday:9},'2026-10-25'),[]);
  assert.deepEqual(upcomingFixedDates({...tuesday,start_date:'2026-02-30'},'2026-10-25'),[]);
  assert.deepEqual(upcomingFixedDates(tuesday,'wrong'),[]);
  assert.deepEqual(upcomingFixedDates(tuesday,'2026-10-25',0),[]);
});
test('reservas pública y profesional ignoran exclusivamente las fechas liberadas',()=>{
  const publicApi=read('app/api/public/booking/route.ts');
  const fixedApi=read('app/api/agenda/fixed/route.ts');
  const calendar=read('components/AgendaCalendar.tsx');
  const management=read('components/FixedAgendaManager.tsx');
  assert.match(publicApi,/skipped_dates/);
  assert.match(publicApi,/!\(f\.skipped_dates\|\|\[\]\)\.includes\(iso\)/);
  assert.match(fixedApi,/skippedDates:r\.skipped_dates\|\|\[\]/);
  assert.match(calendar,/!f\.skippedDates\?\.includes\(date\)/);
  assert.match(management,/Liberar solo esta fecha/);
  assert.match(management,/Restaurar/);
  assert.match(management,/Hasta \(opcional\)/);
  assert.match(management,/Pausar fijo \(todas las semanas\)/);
});
test('la API admin valida fecha y privilegios, y usa RPC atómica',()=>{
  const api=read('app/api/admin/fixed-bookings/route.ts');
  assert.match(api,/requireAdminSession\(\)/);
  assert.match(api,/verifyCsrfOrigin\(request\)/);
  assert.match(api,/action==='skip_date'/);
  assert.match(api,/isValidUUID\(id\)/);
  assert.match(api,/rpc\('set_fixed_booking_week_skip'/);
  assert.match(api,/error\.code==='23505'/);
});
test('SQL no reescribe horarios ni reservas y aplica excepción solo a la fecha concreta',()=>{
  const sql=read('security/production/18_fixed_booking_single_occurrence_skip.sql');
  assert.match(sql,/ADD COLUMN skipped_dates date\[\] NOT NULL DEFAULT/);
  assert.match(sql,/d <> ALL\(f\.skipped_dates\)/);
  assert.match(sql,/dates\.d::date <> ALL\(NEW\.skipped_dates\)/);
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.set_fixed_booking_week_skip/);
  assert.match(sql,/p_occurrence<v_today/);
  assert.match(sql,/extract\(dow from p_occurrence\)::int<>v\.weekday/);
  assert.match(sql,/SELECT \* INTO v FROM public\.fixed_bookings[\s\S]*FOR UPDATE/);
  assert.match(sql,/array_remove\(v\.skipped_dates,p_occurrence\)/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.set_fixed_booking_week_skip/);
  assert.doesNotMatch(sql,/UPDATE public\.appointments|DELETE FROM public\.appointments|DROP TRIGGER/);
});
