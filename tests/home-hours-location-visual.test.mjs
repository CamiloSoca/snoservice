import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {groupOpeningHours,montevideoWeekday} from '../lib/home-hours-display.ts';

const open=(openTime,closeTime)=>({isOpen:true,openTime,closeTime});
const closed={isOpen:false,openTime:'09:00',closeTime:'18:00'};
const hours={
  lunes:closed,
  martes:open('10:00','20:00'),
  miercoles:open('10:00','20:00'),
  jueves:open('10:00','19:00'),
  viernes:open('10:00','20:00'),
  sabado:open('09:00','18:00'),
  domingo:closed,
};
const home=readFileSync(new URL('../components/HomeClient.tsx',import.meta.url),'utf8');
const view=readFileSync(new URL('../components/ShopInfoCards.tsx',import.meta.url),'utf8');

test('agrupa solo días consecutivos con idéntico horario sin alterar datos',()=>{
  const before=JSON.stringify(hours);
  const groups=groupOpeningHours(hours);
  assert.deepEqual(groups.map(x=>[x.label,x.hours]),[
    ['Lun','Cerrado'],
    ['Mar – Mié','10 – 20'],
    ['Jue','10 – 19'],
    ['Vie','10 – 20'],
    ['Sáb','09 – 18'],
    ['Dom','Cerrado'],
  ]);
  assert.equal(JSON.stringify(hours),before);
  assert.equal(groups.length,6);
});

test('cuando se edita el horario, el resumen refleja los datos actualizados',()=>{
  const changed={...hours,jueves:open('10:00','20:00')};
  const groups=groupOpeningHours(changed);
  assert.deepEqual(groups[1].keys,['martes','miercoles','jueves','viernes']);
  assert.equal(groups[1].label,'Mar – Vie');
  assert.equal(groups[1].hours,'10 – 20');
});

test('el día destacado usa hora Uruguay, incluso si el servidor está en UTC',()=>{
  assert.equal(montevideoWeekday(new Date('2026-11-02T01:00:00.000Z')),'domingo');
  assert.equal(montevideoWeekday(new Date('2026-11-02T16:00:00.000Z')),'lunes');
});

test('ambas tarjetas preservan vista clara y oscura y nunca modifican las reservas',()=>{
  assert.match(home,/schedule=\{activeSchedule\}/);
  assert.match(home,/address=\{shopAddress\}/);
  assert.match(home,/city=\{shopCity\}/);
  assert.match(view,/border-white\/\[0\.07\] bg-\[#151917\]/);
  assert.match(view,/bg-white shadow-/);
  assert.match(view,/aria-label="Horarios semanales"/);
  assert.match(view,/referrerPolicy="no-referrer-when-downgrade"/);
  assert.match(view,/noopener noreferrer/);
  assert.doesNotMatch(view,/saveShop|updateAppointment|createAppointment|post\('/);
});
