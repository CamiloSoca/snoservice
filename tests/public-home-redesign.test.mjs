import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const home = read('components/HomeClient.tsx');
const nav = read('components/BottomNav.tsx');
const profile = read('components/BarberDetailPanel.tsx');
const booking = read('components/BookingClient.tsx');
const provider = read('components/PublicShopProvider.tsx');

test('inicio tiene cuatro bloques y las reservas continúan en el flujo original', () => {
  const hero = home.indexOf('{/* HERO BANNER */}');
  const team = home.indexOf('{/* EQUIPO:');
  const instagram = home.indexOf('{/* INSTAGRAM');
  const info = home.indexOf('{/* HORARIOS Y UBICACIÓN');
  assert.ok(hero >= 0 && hero < team && team < instagram && instagram < info);
  assert.doesNotMatch(home, /Nuestros servicios/);
  assert.doesNotMatch(home, /\{\/\* SERVICIOS/);
  assert.match(home, /href="\/agendar"/);
  assert.doesNotMatch(home, /<details/);
});
test('horarios y ubicación visibles lado a lado en móvil, con horarios del local', () => {
  const info = home.split('{/* HORARIOS Y UBICACIÓN')[1]?.split('</section>')[0] || '';
  assert.match(info, /grid grid-cols-2 items-stretch gap-3/);
  assert.match(info, /flex flex-1 flex-col items-center justify-center/);
  assert.match(info, /rounded-xl border px-2 py-1.5/);
  assert.match(info, /border-emerald-600\/25 bg-emerald-950\/40/);
  assert.match(info, /border-rose-600\/25 bg-rose-950\/35/);
  assert.match(info, /whitespace-nowrap text-right font-medium">Cerrado/);
  assert.match(info, /activeSchedule\[dayKey\]/);
  for (const name of ['lunes','martes','miercoles','jueves','viernes','sabado','domingo']) {
    assert.ok(info.includes(name), name);
  }
  assert.match(info, /day\.openTime\.replace/);
  assert.match(info, /day\.closeTime\.replace/);
  assert.match(info, /shopAddress/);
  assert.match(info, /shopCity/);
  assert.match(info, /google\.com\/maps\/search\/\?api=1/);
});
test('trabajos de la cuenta profesional antes del equipo y fotos de barberos opcionales', () => {
  assert.ok(home.indexOf('{/* EQUIPO:') < home.indexOf('{/* INSTAGRAM'));
  assert.match(home, /instagramPosts\.map/);
  assert.match(home, /post\.likeCount\.toLocaleString\('es-UY'\)/);
  const instagramSection = home.split('{/* INSTAGRAM')[1]?.split('</section>')[0] || '';
  assert.match(instagramSection, /src=\{bannerUrl\}/);
  assert.match(instagramSection, /src=\{logoImage\}/);
  assert.match(instagramSection, /className="grid grid-cols-2 gap-3 lg:grid-cols-4"/);
  assert.match(home, /id="equipo"/);
  assert.match(home, /b\.imageUrl/);
  assert.match(home, /onClick=\{\(\) => setSelectedBarber\(b\)\}/);
  assert.match(home, /'\/agendar\?barbero=' \+ encodeURIComponent\(slug\)/);
});
test('barra inferior tiene acceso directo a Admin, sin menú Más', () => {
  assert.match(nav, /href="\/barbero"/);
  assert.match(nav, /href="\/admin"/);
  assert.match(nav, /prefetch=\{false\}/);
  assert.match(nav, /<span className="text-\[10px\] tracking-tight">Admin<\/span>/);
  assert.doesNotMatch(nav, /moreOpen|>Más<|aria-expanded/);
  assert.match(nav, /pathname\.startsWith\('\/agendar'\)/);
});
test('ficha del barbero usa catálogo público y enlaza al flujo de reserva existente', () => {
  assert.match(profile, /role="dialog" aria-modal="true"/);
  assert.match(home, /BarberDetailPanel shop=\{initialShop\}/);
  assert.match(profile, /barber\.imageUrl/);
  assert.match(profile, /shop\.services/);
  assert.match(profile, /'\/agendar\?barbero=' \+ encodeURIComponent/);
  assert.match(profile, /onClick=\{onClose\}/);
  assert.match(profile, /pt-\[calc\(env\(safe-area-inset-top\)\+0\.75rem\)\]/);
  assert.match(profile, /sticky top-0 z-30/);
  assert.match(profile, /aria-label="Cerrar perfil"/);
  assert.match(profile, /backButtonRef\.current\?\.focus\(\)/);
  assert.match(profile, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(profile, /barber\.imageUrl \? \(/);
  assert.match(profile, /Foto por agregar/);
  assert.doesNotMatch(profile, /src=\{banner\}/);
  assert.match(profile, /href="\/#info" onClick=\{onClose\}/);
  assert.match(booking, /searchParams\.get\('barbero'\)/);
  assert.match(provider, /pathname\.startsWith\('\/agendar'\)/);
});
