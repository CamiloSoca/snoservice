import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bookingIntervalsConflict} from '../lib/appointment-rules.ts';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('security/production/19_skip_date_validation_only_restored_week.sql');
const rollback=read('security/production/19_skip_date_validation_only_restored_week_rollback.sql');

test('el corte anterior al fijo sigue permitido y el posterior bloqueado',()=>{
 assert.equal(bookingIntervalsConflict('11:30',60,'12:00',60),true);
 assert.equal(bookingIntervalsConflict('12:30',60,'12:00',60),true);
 assert.equal(bookingIntervalsConflict('11:30',120,'12:00',60),true);
 assert.equal(bookingIntervalsConflict('12:00',60,'11:30',60),true);
});
test('liberar un martes no revalida todas las demás semanas',()=>{
 assert.match(sql,/NEW.skipped_dates IS DISTINCT FROM OLD.skipped_dates/);
 assert.match(sql,/NEW.shop_id IS NOT DISTINCT FROM OLD.shop_id/);
 assert.match(sql,/NEW.time_slot IS NOT DISTINCT FROM OLD.time_slot/);
 assert.match(sql,/NEW.active IS NOT DISTINCT FROM OLD.active/);
 assert.match(sql,/FOREACH v_restore_date IN ARRAY OLD.skipped_dates LOOP/);
 assert.match(sql,/v_restore_date <> ALL\(NEW.skipped_dates\)/);
 assert.match(sql,/NEW.updated_at:=now\(\);\s*RETURN NEW;/);
});
test('restaurar una fecha vuelve a controlar fijos y reservas comunes',()=>{
 assert.match(sql,/v_restore_date <> ALL\(f.skipped_dates\)/);
 assert.match(sql,/public.booking_conflicts_one_way\(NEW.time_slot,NEW.duration_minutes,f.time_slot,f.duration_minutes\)/);
 assert.match(sql,/public.booking_display_label\(v_restore_date\)/);
 assert.match(sql,/public.booking_conflicts_one_way\(NEW.time_slot,NEW.duration_minutes,a.time_slot,a.duration_minutes\)/);
 assert.match(sql,/Ya existe una reserva|ya existe una reserva/);
 assert.match(sql,/pg_advisory_xact_lock/);
});
test('migración se protege con hash y no altera datos de horarios',()=>{
 assert.match(sql,/42e5ccf88fdfe6fe69e86517c4a23c75/);
 assert.match(sql,/SET LOCAL lock_timeout='5s'/);
 assert.doesNotMatch(sql,/UPDATE public\.appointments|DELETE FROM public\.appointments|UPDATE public\.fixed_bookings|DROP TRIGGER/);
 assert.match(rollback,/Guard distinto: abortar la reversión/);
 assert.doesNotMatch(rollback,/UPDATE public\.appointments|DELETE FROM public\.appointments|DROP TRIGGER/);
});
