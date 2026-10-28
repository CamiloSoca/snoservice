import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isOnSitePaymentMethod} from '../lib/payment-method.ts';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const modal=read('components/AppointmentDetailModal.tsx');
const barberApi=read('app/api/barber/route.ts');
const adminApi=read('app/api/admin/route.ts');
const store=read('lib/booking-store.ts');
const admin=read('app/admin/page.tsx');
const barber=read('components/BarberClient.tsx');

test('solo efectivo y transferencia en el local',()=>{
  assert.equal(isOnSitePaymentMethod('cash'),true);
  assert.equal(isOnSitePaymentMethod('transfer'),true);
  for(const method of ['card','online','credit',null,'efectivo']) {
    assert.equal(isOnSitePaymentMethod(method),false);
  }
});

test('el detalle obliga a elegir método para completar',()=>{
  assert.match(modal,/paymentMethod === option.value/);
  assert.match(modal,/Seleccioná cómo pagó el cliente/);
  assert.match(modal,/disabled=\{busy \|\| !completeAllowed \|\| \(!paymentMethod&&!prepaid&&!courtesy\)\}/);
  assert.match(modal,/onComplete\(appointment, paymentMethod\)/);
  assert.match(modal,/El cobro se realiza en el local/);
});

test('ambas APIs verifican el método y lo guardan con la transición sin duplicar',()=>{
  for(const api of [barberApi,adminApi]){
    assert.match(api,/isOnSitePaymentMethod\(paymentMethod\)/);
    assert.match(api,/payment_method: paymentMethod/);
    assert.match(api,/\.eq\('status', 'confirmado'\)/);
    assert.match(api,/status === 'completado'/);
  }
  assert.match(store,/jsonRequest\('PATCH', \{id, status, paymentMethod\}\)/);
});

test('admin y barberos piden método aun en sus listas antiguas',()=>{
  for(const panel of [admin,barber]){
    assert.match(panel,/Escribí EFECTIVO o TRANSFERENCIA/);
    assert.match(panel,/method === 'efectivo' \? 'cash' : 'transfer'/);
  }
});
