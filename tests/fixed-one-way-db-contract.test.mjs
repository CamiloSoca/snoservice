import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bookingIntervalsConflict} from '../lib/appointment-rules.ts';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('security/production/17_fixed_bookings_one_way.sql');
const rollback=read('security/production/17_fixed_bookings_one_way_rollback.sql');

test('regla en los dos sentidos: nunca se superpone hacia adelante',()=>{
  const cases=[
    ['09:00',60,'09:30',60,false],
    ['09:30',60,'09:00',60,true],
    ['10:00',60,'09:30',60,true],
    ['10:30',60,'09:30',60,false],
    ['09:30',60,'09:30',60,true],
    ['09:00',60,'09:15',60,true],
    ['09:00',45,'09:30',60,false],
    ['09:00',60,'09:30',90,true],
    ['09:00',90,'09:30',60,true],
    ['09:00',120,'09:30',60,true],
    ['09:30',60,'09:00',120,true],
    ['09:00',60,'10:00',120,false],
    ['09:00',60,'08:30',60,true],
  ];
  for(const [a,ad,b,bd,want] of cases){
    assert.equal(bookingIntervalsConflict(a,ad,b,bd),want,
      `candidato ${a}/${ad}, existente ${b}/${bd}`);
  }
});
test('misma regla SQL para público/fijo y fijo/fijo, con verificaciones atómicas',()=>{
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.booking_conflicts_one_way\(/);
  assert.equal(sql.split('public.booking_conflicts_one_way(').length-1,5);
  assert.match(sql,/v_candidate > v_booked OR/);
  assert.match(sql,/p_candidate_minutes >= 90 OR p_booked_minutes >= 90/);
  assert.match(sql,/v_shared > 30;/);
  assert.match(sql,/v_candidate = v_booked THEN RETURN true/);
  assert.match(sql,/v_shared = 0 THEN RETURN false/);
  assert.equal(sql.split("pg_advisory_xact_lock(hashtextextended('13cut-fixed-oneway:'").length-1,2);
  assert.match(sql,/Funciones de agenda diferentes: ABORTAR/);
  assert.match(sql,/REVOKE ALL ON FUNCTION .* FROM PUBLIC,anon,authenticated/);
  assert.doesNotMatch(sql,/DELETE FROM|UPDATE public\.appointments|UPDATE public\.fixed_bookings|DROP TRIGGER/i);
});
test('rollback conserva las definiciones antiguas y no modifica registros',()=>{
  assert.match(rollback,/CREATE OR REPLACE FUNCTION public\.guard_weekly_bookings/);
  assert.match(rollback,/CREATE OR REPLACE FUNCTION public\.validate_fixed_booking/);
  assert.match(rollback,/DROP FUNCTION public\.booking_conflicts_one_way/);
  assert.match(rollback,/Rollback cancelado/);
  assert.doesNotMatch(rollback,/DELETE FROM|UPDATE public\.appointments|UPDATE public\.fixed_bookings|DROP TRIGGER/i);
});
