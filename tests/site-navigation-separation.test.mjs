import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {navigationArea,bottomNavigationItems} from '../lib/site-navigation.ts';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const nav=read('components/BottomNav.tsx');
const home=read('components/HomeClient.tsx');
const barber=read('components/BarberClient.tsx');
const admin=read('app/admin/page.tsx');
const adminLayout=read('app/admin/layout.tsx');
const barberPage=read('app/barbero/page.tsx');
const middleware=read('middleware.ts');
const barberApi=read('app/api/barber/route.ts');

test('cliente: sólo Inicio y Reservar en la navegación pública',()=>{
  assert.equal(navigationArea('/'),'public');
  assert.deepEqual(bottomNavigationItems('/'),[
    {href:'/',label:'Inicio'},
    {href:'/agendar',label:'Reservar'},
  ]);
  assert.equal(bottomNavigationItems('/').some(link=>['/admin','/barbero','/login'].includes(link.href)),false);
  assert.equal(home.includes('href="/admin"'),false);
  assert.equal(home.includes('href="/barbero"'),false);
});

test('admin: navegación independiente Administración y Barberos',()=>{
  assert.equal(navigationArea('/admin'),'admin');
  assert.deepEqual(bottomNavigationItems('/admin'),[
    {href:'/admin',label:'Administración'},
    {href:'/barbero',label:'Barberos'},
  ]);
  assert.deepEqual(bottomNavigationItems('/admin/configuracion'),bottomNavigationItems('/admin'));
  assert.equal(bottomNavigationItems('/admin').some(link=>['/','/agendar'].includes(link.href)),false);
  assert.match(admin,/href="\/admin"/);
  assert.match(admin,/href="\/barbero"/);
  assert.doesNotMatch(admin,/href="\/"\s*prefetch=/);
});

test('barberos: sólo acceso PIN en su URL, sin menú público ni administración',()=>{
  assert.equal(navigationArea('/barbero'),'staff');
  assert.deepEqual(bottomNavigationItems('/barbero'),[]);
  assert.deepEqual(bottomNavigationItems('/barbero/'),[]);
  assert.match(barber,/Acceso Barbero/);
  assert.match(barber,/unlockBarberPanelWithPin/);
  assert.doesNotMatch(barber,/href="\/admin"/);
  assert.doesNotMatch(barber,/href="\/"/);
  assert.match(barberPage,/BarberClient/);
});

test('el login admin y el asistente de reservas no heredan menú incorrecto',()=>{
  assert.equal(navigationArea('/login'),'none');
  assert.deepEqual(bottomNavigationItems('/login'),[]);
  assert.deepEqual(bottomNavigationItems('/agendar'),[]);
  assert.deepEqual(bottomNavigationItems('/agendar/confirmado'),[]);
  assert.deepEqual(bottomNavigationItems('/administrator'),[]);
  assert.match(nav,/bottomNavigationItems\(pathname\)/);
  assert.match(nav,/if \(items\.length === 0\) return null/);
});

test('se conservan las protecciones reales: admin requiere sesión y barbero PIN',()=>{
  assert.match(adminLayout,/requireAdminSession\(\)/);
  assert.match(middleware,/pathname\.startsWith\('\/admin'\)/);
  assert.match(barberApi,/verify|session|PIN|pin/i);
});
