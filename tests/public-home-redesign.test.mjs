import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const home = read('components/HomeClient.tsx');
const nav = read('components/BottomNav.tsx');
const profile = read('components/PublicBarberProfile.tsx');
const profileRoute = read('app/equipo/[slug]/page.tsx');
const booking = read('components/BookingClient.tsx');
const provider = read('components/PublicShopProvider.tsx');

test('portada mantiene una sola acción de reserva y servicios reales', () => {
  assert.match(home, /\/\* HERO BANNER \*\//);
  assert.match(home, /initialShop\.services\.filter\(service => service\.active !== false\)/);
  assert.match(home, /href="\/agendar"/);
  assert.match(home, /Horarios y ubicación/);
  assert.match(home, /<details/);
});
test('trabajos de la cuenta profesional antes del equipo y fotos de barberos opcionales', () => {
  assert.ok(home.indexOf('{/* INSTAGRAM') < home.indexOf('{/* EQUIPO:'));
  assert.match(home, /instagramPosts\.map/);
  assert.match(home, /post\.likeCount\.toLocaleString\('es-UY'\)/);
  assert.match(home, /id="equipo"/);
  assert.match(home, /b\.imageUrl/);
  assert.match(home, /'\/equipo\/' \+ encodeURIComponent\(slug\)/);
  assert.match(home, /'\/agendar\?barbero=' \+ encodeURIComponent\(slug\)/);
});
test('navegación pública ofrece Equipo y Más, con acceso staff y admin intactos', () => {
  assert.match(nav, /href="\/#equipo"/);
  assert.match(nav, /aria-expanded=\{moreOpen\}/);
  assert.match(nav, /href="\/barbero"/);
  assert.match(nav, /href="\/admin"/);
  assert.match(nav, /pathname\.startsWith\('\/agendar'\)/);
});
test('ficha del barbero usa catálogo público y enlaza al flujo de reserva existente', () => {
  assert.match(profile, /PublicShopGate variant="home"/);
  assert.match(profileRoute, /export const instant = false/);
  assert.match(profile, /shop\.barbers\.find/);
  assert.match(profile, /barber\.imageUrl/);
  assert.match(profile, /shop\.services/);
  assert.match(profile, /'\/agendar\?barbero=' \+ encodeURIComponent/);
  assert.match(profile, /if \(!barber\)/);
  assert.match(booking, /searchParams\.get\('barbero'\)/);
  assert.match(provider, /pathname\.startsWith\('\/equipo'\)/);
});
