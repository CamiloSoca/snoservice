import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const home = read('components/HomeClient.tsx');
const nav = read('components/BottomNav.tsx');
const info = read('components/ShopInfoCards.tsx');
const instagram = read('components/InstagramCarousel.tsx');
const detail = read('components/BarberDetailPanel.tsx');

test('fondo de inicio usa luces estáticas de Tailwind sin cargar una foto adicional desenfocada', () => {
  assert.match(home, /radial-gradient/);
  assert.match(home, /pointer-events-none absolute inset-0/);
  assert.doesNotMatch(home, /filter blur-md scale-105 grayscale/);
  assert.match(home, /const bannerUrl = shopConfig\.coverImageUrl \|\| shopConfig\.backgroundImageUrl \|\| ''/);
});

test('los accesos visuales del cliente no muestran tijeras ni modifican los enlaces de reserva', () => {
  assert.match(nav, /CalendarCheck/);
  assert.doesNotMatch(nav, /Scissors/);
  assert.match(nav, /bottomNavigationItems\(pathname\)/);
  assert.match(home, /href="\/agendar"/);
  assert.match(home, /'\/agendar\?barbero=' \+ encodeURIComponent\(slug\)/);
  assert.doesNotMatch(home, /<Scissors/);
  assert.doesNotMatch(instagram, /<Scissors/);
  assert.doesNotMatch(detail, /<Scissors/);
});

test('navegación e información mantienen accesibilidad y funcionalidades', () => {
  assert.match(nav, /aria-current=\{isActive \? 'page' : undefined\}/);
  assert.match(nav, /focus-visible:outline-2/);
  assert.match(info, /Horario de hoy/);
  assert.match(info, /<iframe/);
  assert.match(info, /loading="lazy"/);
  assert.match(info, /Cómo llegar/);
  assert.match(instagram, /resolveLoopIndex/);
  assert.match(instagram, /slides\.map/);
  assert.match(instagram, /loading="lazy"/);
});
