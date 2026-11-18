import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const page=read('app/page.tsx');
const home=read('components/HomeClient.tsx');
const publicPage=read('app/ceras/page.tsx');
const serverRetail=read('lib/server-public-retail.ts');
const productPhoto=read('components/RetailProductPhoto.tsx');
const dataStore=read('lib/public-shop-data.ts');
const provider=read('components/PublicShopProvider.tsx');
const nav=read('components/BottomNav.tsx');
const carousel=read('components/InstagramCarousel.tsx');
const existingPhotos=read('supabase/migrations/20261118_retail_product_images.sql');

test('home pinta contenido sin esperar hidratación ni pedir catálogo desde JS',()=>{
 assert.match(page,/getServerPublicShopData/);
 assert.match(page,/getPublicRetailProducts/);
 assert.match(page,/<HomeClient initialShop=\{shop\}/);
 assert.doesNotMatch(page,/PublicShopGate/);
 assert.match(home,/seedPublicShopData\(initialShop\)/);
 assert.match(dataStore,/export function seedPublicShopData/);
});
test('las dos páginas utilizan la foto real y evitan el cuadrado blanco',()=>{
 assert.match(home,/<RetailProductPhoto/);
 assert.match(publicPage,/<RetailProductPhoto/);
 assert.match(existingPhotos,/golden-moustache-pomada-matte-60g\.jpg/);
 assert.match(productPhoto,/pomade=slug==='golden-moustache-matte-60g'/);
 assert.match(productPhoto,/rounded-full/);
 assert.match(productPhoto,/scale-\[1\.32\]/);
 assert.match(productPhoto,/unoptimized=\{src.startsWith\('\/products\/'\)\}/);
});
test('catálogo de productos aparece junto con datos del local sin waterfall client-side',()=>{
 assert.match(publicPage,/Promise\.all/);
 assert.match(publicPage,/getServerPublicShopData/);
 assert.match(publicPage,/getPublicRetailProducts/);
 assert.doesNotMatch(publicPage,/fetch\('/);
 assert.doesNotMatch(publicPage,/PublicShopGate/);
 assert.match(serverRetail,/cacheLife/);
 assert.match(serverRetail,/from\('retail_products'\)/);
});
test('no compiten las consultas públicas, IG ni múltiples prefetches con la primera pintura',()=>{
 assert.match(provider,/activePanel\?window\.setInterval/);
 assert.match(carousel,/rootMargin: '150px 0px'/);
 assert.match(nav,/item.href !== '\/ceras'/);
 assert.match(home,/href="\/ceras" prefetch=\{false\}/);
 assert.match(home,/encodeURIComponent\(slug\)\} prefetch=\{false\}/);
});
test('reservas y finanzas siguen manejándose en endpoints originales',()=>{
 assert.match(home,/href="\/agendar"/);
 assert.match(publicPage,/href="\/agendar"/);
 assert.doesNotMatch(serverRetail,/barber_payouts|barber_commission|INSERT INTO/);
});
