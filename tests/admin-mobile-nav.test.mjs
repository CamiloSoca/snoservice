import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
const start = source.indexOf('<nav aria-label="Secciones de administración"');
const end = source.indexOf('</nav>',start);
const nav = source.slice(start,end + 6);

test('las seis secciones del panel admin permanecen visibles en móvil', () => {
  assert.ok(start >= 0 && end > start);
  assert.match(nav,/grid grid-cols-3/);
  assert.match(nav,/sm:grid-cols-6/);
  assert.doesNotMatch(nav,/overflow-x-auto|overscroll-x-contain/);
  for (const label of ['Inicio','Agenda','Caja','Informes','Equipo','Configuración']) {
    assert.match(nav, new RegExp("label:'" + label + "'"));
  }
});

test('el menú conserva botones interactivos con estado y selección', () => {
  assert.match(nav, /<button type="button" key=\{id\}/);
  assert.match(nav, /onClick=\{\(\) => setActiveTab\(id\)\}/);
  assert.match(nav, /aria-current=\{active \? 'page' : undefined\}/);
  assert.match(nav, /focus-visible:outline-emerald-400/);
});

test('las rutas de Equipo y Configuración y sus opciones siguen presentes', () => {
  assert.match(source,/activeTab==='configuracion'/);
  assert.match(source,/activeTab==='barberos'/);
  assert.match(source,/Servicios y precios/);
  assert.match(source,/Datos de la barbería/);
});
