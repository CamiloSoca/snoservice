import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeHours,resolvedHours,WEEK_DAYS} from '../lib/weekly-hours.ts';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261025_barber_hours_fixed_bookings.sql');
const admin=read('app/admin/page.tsx');
const api=read('app/api/public/booking/route.ts');
const fixed=read('app/api/admin/fixed-bookings/route.ts');
const ui=read('components/BookingClient.tsx');
const editor=read('components/WeeklyScheduleEditor.tsx');

const all=Object.fromEntries(WEEK_DAYS.map(x=>[x.key,{isOpen:true,openTime:'09:00',closeTime:'19:00'}]));
const saturday=Object.fromEntries(WEEK_DAYS.map(x=>[x.key,{isOpen:x.key==='sabado',openTime:'10:00',closeTime:'15:00'}]));

test('un barbero trabaja solo sábado entre 10 y 15; el local limita su horario',()=>{
 const result=resolvedHours(all,normalizeHours(saturday));
 assert.equal(result.lunes.isOpen,false);
 assert.equal(result.viernes.isOpen,false);
 assert.equal(result.sabado.isOpen,true);
 assert.equal(result.sabado.openTime,'10:00');
 assert.equal(result.sabado.closeTime,'15:00');
 assert.equal(resolvedHours({...all,sabado:{isOpen:false,openTime:'09:00',closeTime:'19:00'}},saturday).sabado.isOpen,false);
 assert.equal(resolvedHours(all,null).lunes.isOpen,true);
});
test('no se pueden guardar reglas de horas inválidas ni días desconocidos',()=>{
 assert.throws(()=>normalizeHours({...all,martes:{isOpen:true,openTime:'21:00',closeTime:'11:00'}}));
 assert.throws(()=>normalizeHours({...all,martes:{isOpen:true,openTime:'fake',closeTime:'19:00'}}));
 assert.throws(()=>normalizeHours({...all,feriado:{isOpen:false,openTime:'09:00',closeTime:'19:00'}}));
 assert.throws(()=>normalizeHours({sabado:{isOpen:true,openTime:'09:00',closeTime:'12:00'}}));
 assert.equal(normalizeHours(null),null);
});
test('la reserva pública aplica horario específico y bloquea clientes fijos',()=>{
 assert.match(ui,/resolvedHours\(shopConfig.schedule, selectedBarber\?\.workingSchedule\)/);
 assert.match(api,/resolvedHours\(shopRow.schedule as BusinessSchedule,barberRow.working_schedule\)/);
 assert.match(api,/from\('fixed_bookings'\)/);
 assert.match(api,/fixedSlots/);
 assert.match(sql,/CREATE TRIGGER trg_guard_weekly_bookings/);
 assert.match(sql,/Fuera del horario del barbero/);
 assert.match(sql,/Horario reservado para un cliente de agenda fija/);
});
test('la edición de horarios del local y los barberos está visible en administración',()=>{
 assert.match(admin,/Horarios de la barbería/);
 assert.match(admin,/Días y horarios del nuevo barbero/);
 assert.match(admin,/Horarios de /);
 assert.match(admin,/Guardar horarios y servicios/);
 assert.match(editor,/Desde/);
 assert.match(editor,/Hasta/);
});
test('agenda fija: edición, pausa, permisos y protección de datos personales',()=>{
 assert.match(admin,/activeTab === 'fijos'/);
 assert.match(admin,/Agenda fija/);
 assert.match(fixed,/requireAdminSession\(\)/);
 assert.match(fixed,/verifyCsrfOrigin\(request\)/);
 assert.match(fixed,/action==='toggle'/);
 assert.match(fixed,/action!=='save'/);
 assert.match(sql,/fixed_bookings ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON public.fixed_bookings FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/GRANT SELECT,INSERT,UPDATE,DELETE ON public.fixed_bookings TO service_role/);
 assert.match(sql,/Hay reservas existentes en uno de esos días/);
});

test('clientes fijos aparecen en día y semana sin poder completar/cancelar como reserva normal',()=>{
 const calendar=read('components/AgendaCalendar.tsx');
 const modal=read('components/AppointmentDetailModal.tsx');
 const route=read('app/api/agenda/fixed/route.ts');
 assert.match(calendar,/fixedEvents=useMemo/);
 assert.match(calendar,/fixedDate:date/);
 assert.match(calendar,/isFixed:true/);
 assert.match(calendar,/appointment\.isFixed \? 'Fijo'/);
 assert.match(calendar,/fixedReload/);
 assert.match(modal,/!appointment\.isFixed && appointment\.status === 'confirmado'/);
 assert.match(modal,/No se factura automáticamente/);
 assert.match(route,/if\(!admin&&staff\)query=query\.eq\('barber_id',staff\.sub\)/);
 assert.match(route,/Cache-Control.*private, no-store/);
});

test('los fijos se pueden pausar sin borrar historial ni emitir cobros',()=>{
 const management=read('components/FixedAgendaManager.tsx');
 assert.match(management,/Pausar fijo/);
 assert.match(management,/Reactivar/);
 assert.match(management,/Editar/);
 assert.match(sql,/IF NOT NEW\.active THEN/);
 assert.doesNotMatch(management,/delete\(/);
});
