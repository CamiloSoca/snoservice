import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  bookingIntervalsConflict,
  bookingAvailabilityConflict,
  slotsOverlap,
} from '../lib/appointment-rules.ts';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('matriz acordada: normal flexible vs fijo exclusivo de 10:00 a 11:00',()=>{
 const cases=[
   {candidate:'09:00',normal:false,fixed:false,description:'termina justo al empezar'},
   {candidate:'09:30',normal:false,fixed:true,description:'excepción histórica de 30 min solo para normales'},
   {candidate:'10:00',normal:true,fixed:true,description:'misma hora, bloqueado'},
   {candidate:'10:30',normal:true,fixed:true,description:'no comenzar dentro de un turno'},
   {candidate:'11:00',normal:false,fixed:false,description:'comienza justo al finalizar'},
 ];
 for(const c of cases){
   assert.equal(bookingAvailabilityConflict(c.candidate,60,'10:00',60,false),c.normal,c.description+' normal');
   assert.equal(bookingAvailabilityConflict(c.candidate,60,'10:00',60,true),c.fixed,c.description+' fijo');
 }
});

test('paridad exhaustiva: ninguna reserva normal cambia su comportamiento',()=>{
 const durations=[15,30,45,60,75,90,120,180];
 const minuteToTime=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
 let compared=0;
 for(let candidate=7*60;candidate<=19*60;candidate+=15){
   for(let booked=7*60;booked<=19*60;booked+=15){
     for(const cDuration of durations){
       for(const bDuration of durations){
         const a=minuteToTime(candidate),b=minuteToTime(booked);
         assert.equal(
           bookingAvailabilityConflict(a,cDuration,b,bDuration,false),
           bookingIntervalsConflict(a,cDuration,b,bDuration),
           'Normal rule changed: '+a+' '+cDuration+' vs '+b+' '+bDuration,
         );
         compared++;
       }
     }
   }
 }
 assert.equal(compared,49*49*durations.length**2);
});

test('agenda fija es exclusividad simétrica: sin un solo minuto superpuesto',()=>{
 const durations=[15,30,45,60,75,90,120,180];
 const minuteToTime=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
 for(let candidate=8*60;candidate<=18*60;candidate+=15){
   for(let fixed=8*60;fixed<=18*60;fixed+=15){
     for(const cDuration of durations){
       for(const bDuration of durations){
         const a=minuteToTime(candidate),b=minuteToTime(fixed);
         assert.equal(bookingAvailabilityConflict(a,cDuration,b,bDuration,true),
           slotsOverlap(a,cDuration,b,bDuration),'Exclusive rule mismatch '+a+' vs '+b);
         assert.equal(bookingAvailabilityConflict(a,cDuration,b,bDuration,true),
           bookingAvailabilityConflict(b,bDuration,a,cDuration,true),
           'Standing bookings should never allow one directional overlap');
       }
     }
   }
 }
});

test('servicios largos respetan su exclusividad frente a turnos normales',()=>{
 assert.equal(bookingAvailabilityConflict('09:30',90,'10:00',60,false),true);
 assert.equal(bookingAvailabilityConflict('09:30',60,'10:00',90,false),true);
 assert.equal(bookingAvailabilityConflict('09:30',60,'10:00',60,false),false);
 assert.equal(bookingAvailabilityConflict('10:00',60,'09:30',60,false),true);
});

test('la marca isFixed va desde API pública hasta isSlotAvailable, sin datos personales',()=>{
 const api=source('app/api/public/booking/route.ts');
 const store=source('lib/booking-store.ts');
 assert.match(api,/durationMinutes:f\.duration_minutes,status:'confirmado',isFixed:true/);
 assert.match(api,/barber_id,weekday,time_slot,duration_minutes,start_date,end_date/);
 assert.match(api,/appointments: \[\.\.\.sanitizedSlots,\.\.\.fixedSlots\]/);
 assert.match(store,/isFixed: slot\.isFixed === true/);
 assert.match(store,/bookingAvailabilityConflict\(candidateTime, duration, apt\.timeSlot, aptDuration, apt\.isFixed === true\)/);
 assert.match(store,/apt\.barberId !== barberId \|\| apt\.dateString !== dateString/);
 assert.match(store,/if \(apt\.status === 'cancelado'\) continue/);
 const fixedGet=api.split('export async function POST')[0];
 assert.doesNotMatch(fixedGet,/client_name|client_phone|client_email/);
});

test('el servidor mantiene la validación en PostgreSQL y sin despliegue automático',()=>{
 const api=source('app/api/public/booking/route.ts');
 const dbGuard=source('supabase/migrations/20261025_barber_hours_fixed_bookings.sql');
 const vercel=JSON.parse(source('vercel.json'));
 assert.match(api,/\.from\('appointments'\)[\s\S]*?\.insert\(\[insertPayload\]\)/);
 assert.match(dbGuard,/Horario reservado para un cliente de agenda fija/);
 assert.match(dbGuard,/NEW\.time_slot::time < f\.time_slot::time\+f\.duration_minutes\*interval '1 minute'/);
 assert.equal(vercel.git.deploymentEnabled,false);
});
