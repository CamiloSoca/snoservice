import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const home = readFileSync(new URL('../components/HomeClient.tsx', import.meta.url), 'utf8');
const instagram = readFileSync(new URL('../lib/instagram-server.ts', import.meta.url), 'utf8');

test('el avatar de la barbería usa la portada existente y una máscara redonda', () => {
  assert.match(home, /<Image\s+src=\{bannerUrl\}/);
  assert.match(home, /overflow-hidden rounded-full border border-white\/25/);
  assert.match(home, /src=\{logoImage\}[\s\S]*?className="object-cover"/);
});

test('los me gusta de Instagram solo aparecen cuando Meta devuelve el contador', () => {
  assert.match(instagram, /baseFields \+ ',like_count'/);
  assert.match(instagram, /likeCount: typeof media\.like_count === 'number'/);
  assert.match(instagram, /likeCount: typeof media\.like_count === 'number'[\s\S]*?: null/);
  assert.match(home, /typeof post\.likeCount === 'number' && Number\.isFinite\(post\.likeCount\)/);
  assert.match(home, /post\.likeCount\.toLocaleString\('es-UY'\)/);
});

test('si la API no entrega likes, sigue mostrando las cuatro publicaciones con sus enlaces', () => {
  assert.match(instagram, /catch \{[\s\S]*?response = await metaGet\('\/me\/media', accessToken, \{/);
  assert.match(instagram, /\.slice\(0, 4\)/);
  assert.match(home, /href=\{post\.permalink\}/);
  assert.match(home, /href=\{shopConfig\.instagramUrl \|\| 'https:\/\/www\.instagram\.com\/13\.cut\/'\}/);
});
