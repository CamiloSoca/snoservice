import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {appointmentTimeState} from '../lib/appointment-rules.ts';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('security/production/21_fixed_occurrence_completion.sql');
const rpc=read('app/api/agenda/fixed/complete/route.ts');
const agenda=read('components/AgendaCalendar.tsx');
const fixed=read('app/api/agenda/fixed/route.ts');
const modal=read('components/AppointmentDetailModal.tsx');

test('el viernes 30/10 el corte se puede completar desde su hora, no antes',()=>{
 const booking={dateString:'Vie 30 Oct',timeSlot:'17:00',createdAt:'2026-10-30T12:00:00.000Z'};
 assert.equal(appointmentTimeState({...booking,now:new Date('2026-10-30T19:59:00Z')}),'future');
 assert.equal(appointmentTimeState({...booking,now:new Date('2026-10-30T20:00:00Z')}),'started');
 assert.equal(appointmentTimeState({...booking,now:new Date('2026-10-31T11:00:00Z')}),'started');
});
test('completar un viernes no completa la próxima semana',()=>{
 const next={dateString:'Vie 6 Nov',timeSlot:'17:00',createdAt:'2026-11-06T12:00:00.000Z'};
 assert.equal(appointmentTimeState({...next,now:new Date('2026-10-30T22:00:00Z')}),'future');
 assert.match(agenda,/completedFixed\.find\(c=>c\.fixedBookingId===f\.id&&c\.occurrenceDate===date\)/);
 assert.match(agenda,/fixedBookingId:f\.id,fixedDate:date/);
 assert.match(agenda,/status:\(paid\?'completado':'confirmado'\)/);
});
test('se usa el precio verdadero y el botón Completar también en fijos',()=>{
 assert.match(fixed,/services\(name,price\)/);
 assert.match(fixed,/servicePrice:Number\(service\?\.price\|\|0\)/);
 assert.match(agenda,/const price=f\.complimentary\?0:paid&&!paid\.coveredBySubscription\?paid\.amount:f\.servicePrice/);
 assert.match(modal,/fixedSubscription\?\.covered/);
 assert.doesNotMatch(modal,/const completeAllowed = !appointment\.isFixed/);
});
test('la API usa sesión y CSRF; sólo el dueño/barbero correcto puede cobrar',()=>{
 assert.match(rpc,/verifyCsrfOrigin\(request\)/);
 assert.match(rpc,/getBarberSession\(\)/);
 assert.match(rpc,/requireAdminSession\(\)/);
 assert.match(rpc,/\.eq\('barber_id',staff\.sub\)/);
 assert.match(rpc,/requireOpenCash\(\)/);
 assert.match(rpc,/rpc\('complete_fixed_booking_occurrence'/);
 assert.match(rpc,/p_occurrence:occurrenceDate/);
 assert.match(rpc,/error\.code==='23505'/);
});
test('la contabilidad del fijo se almacena 1 vez con UNIQUE por fecha y se calcula en el trigger existente',()=>{
 assert.match(sql,/ADD COLUMN fixed_booking_id uuid REFERENCES public\.fixed_bookings\(id\)/);
 assert.match(sql,/ADD COLUMN fixed_occurrence_date date/);
 assert.match(sql,/CREATE UNIQUE INDEX manual_charges_fixed_occurrence_unique/);
 assert.match(sql,/shop_id,fixed_booking_id,fixed_occurrence_date/);
 assert.match(sql,/fixed_booking_id IS NOT NULL/);
 assert.match(sql,/p_occurrence = ANY\(v_fixed\.skipped_dates\)/);
 assert.match(sql,/v_fixed\.time_slot::time > v_date_now::time/);
 assert.match(sql,/INSERT INTO public\.manual_charges/);
 assert.match(sql,/RETURNING id INTO v_charge/);
 assert.match(sql,/snapshot_manual_charge_finances/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.complete_fixed_booking_occurrence/);
 assert.match(sql,/TO service_role/);
 assert.doesNotMatch(sql,/DELETE FROM public\.appointments|UPDATE public\.appointments|UPDATE public\.fixed_bookings/);
});
test('el cobro del fijo no se puede borrar, la caja se preserva',()=>{
 assert.match(sql,/CREATE TRIGGER trg_guard_completed_fixed_charge/);
 assert.match(sql,/IF OLD\.fixed_booking_id IS NOT NULL THEN/);
 const finance=read('app/api/finance/route.ts');
 assert.match(finance,/snapshot_manual_charge_finances|commission_rate_snapshot/);
 assert.match(read('components/BarberClient.tsx'),/chg\.note\?\.startsWith\('Turno fijo ·'\)/);
 assert.match(read('app/admin/page.tsx'),/chg\.note\?\.startsWith\('Turno fijo ·'\)/);
});
test('el estado de cada fecha no depende de la caché de la sesión',()=>{
 assert.match(agenda,/URLSearchParams\(\{from:dates\[0\],to:dates\[dates\.length-1\]\}\)/);
 assert.match(fixed,/\.gte\('fixed_occurrence_date',start\)\.lte\('fixed_occurrence_date',end\)/);
 assert.match(agenda,/setCompletedFixed\(Array\.isArray\(json\.completed\)/);
 assert.match(agenda,/setFixedReload\(value=>value\+1\)/);
});
