import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../lib/public-shop-data.ts', import.meta.url), 'utf8');
const home = readFileSync(new URL('../components/HomeClient.tsx', import.meta.url), 'utf8');
const icon = readFileSync(new URL('../lib/brand-home-icon.tsx', import.meta.url), 'utf8');
const cacheSource = readFileSync(new URL('../lib/public-shop-cache.ts', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../lib/server-public-shop.ts', import.meta.url), 'utf8');
const cacheModule = {exports: {}};
runInNewContext(ts.transpile(cacheSource, {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}), {
  module: cacheModule,
  exports: cacheModule.exports,
  URL,
});
const compiled = ts.transpile(source, {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022,
});

function shopData(id, name) {
  return {
    shopConfig: {id, name, schedule: {lunes: {isOpen: true, openTime: '09:00', closeTime: '18:00'}}},
    services: [{id: `${id}-service`, name: 'Corte', price: 500, durationMinutes: 30}],
    barbers: [{id: `${id}-barber`, name: 'QA Barbero'}],
  };
}

function createStore({project, shopId, sessionStorage, response}) {
  const cjsModule = {exports: {}};
  const storage = sessionStorage || new Map();
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: `https://${project}.supabase.co`,
    NEXT_PUBLIC_SHOP_ID: shopId,
  };
  const fetchState = {response};
  const window = {
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    location: {pathname: '/'},
  };
  runInNewContext(compiled, {
    module: cjsModule,
    exports: cjsModule.exports,
    require: (name) => {
      if (name === '@/lib/public-shop-cache') return cacheModule.exports;
      throw new Error(`Unexpected runtime import: ${name}`);
    },
    process: {env},
    window,
    URL,
    Date,
    Set,
    Promise,
    Error,
    JSON,
    Number,
    Array,
    fetch: async () => ({ok: true, json: async () => fetchState.response}),
  });
  return {api: cjsModule.exports, storage, env, setResponse: (value) => {fetchState.response = value;}};
}

test('la caché pública se separa por proyecto Supabase y Shop ID sin borrar datos de otra tienda', async () => {
  const storage = new Map();
  const firstShop = shopData('qa-shop-a', 'QA A');
  const secondShop = shopData('qa-shop-b', 'QA B');
  const first = createStore({project: 'staging-a', shopId: 'qa-shop-a', sessionStorage: storage, response: firstShop});
  assert.equal((await first.api.getPublicShopData(true)).shopConfig.id, 'qa-shop-a');
  assert.equal(storage.size, 1);
  const firstKey = [...storage.keys()][0];

  const otherShop = createStore({project: 'staging-a', shopId: 'qa-shop-b', sessionStorage: storage, response: secondShop});
  assert.equal(otherShop.api.getPublicShopSnapshot().data, null);
  assert.equal((await otherShop.api.getPublicShopData()).shopConfig.id, 'qa-shop-b');
  assert.equal(storage.size, 2);
  const secondKey = [...storage.keys()].find((key) => key !== firstKey);
  assert.notEqual(firstKey, secondKey);

  const otherProject = createStore({project: 'staging-b', shopId: 'qa-shop-a', sessionStorage: storage, response: firstShop});
  assert.equal(otherProject.api.getPublicShopSnapshot().data, null);
  assert.equal((await otherProject.api.getPublicShopData()).shopConfig.id, 'qa-shop-a');
  assert.equal(storage.size, 3);
  assert.ok(storage.has(firstKey));
});

test('un snapshot guardado con otro Shop ID se ignora y no se borra', async () => {
  const storage = new Map();
  const shopA = shopData('qa-shop-a', 'QA A');
  const shopB = shopData('qa-shop-b', 'QA B');
  const seed = createStore({project: 'staging-a', shopId: 'qa-shop-b', sessionStorage: storage, response: shopB});
  await seed.api.getPublicShopData(true);
  const cacheKey = [...storage.keys()][0];
  storage.set(cacheKey, JSON.stringify({version: 4, savedAt: Date.now(), data: shopA}));

  const guarded = createStore({project: 'staging-a', shopId: 'qa-shop-b', sessionStorage: storage, response: shopB});
  assert.equal(guarded.api.getPublicShopSnapshot().data, null);
  assert.ok(storage.has(cacheKey));
  assert.equal((await guarded.api.getPublicShopData()).shopConfig.id, 'qa-shop-b');
  assert.equal(JSON.parse(storage.get(cacheKey)).data.shopConfig.id, 'qa-shop-b');
});

test('la tienda activa puede cambiar dentro de la sesión sin reutilizar el snapshot anterior', async () => {
  const storage = new Map();
  const store = createStore({project: 'staging-a', shopId: 'qa-shop-a', sessionStorage: storage, response: shopData('qa-shop-a', 'QA A')});
  await store.api.getPublicShopData(true);
  const firstKey = [...storage.keys()][0];

  store.env.NEXT_PUBLIC_SUPABASE_URL = 'https://staging-b.supabase.co';
  store.env.NEXT_PUBLIC_SHOP_ID = 'qa-shop-b';
  store.setResponse(shopData('qa-shop-b', 'QA B'));
  assert.equal(store.api.getPublicShopSnapshot().data, null);
  assert.equal((await store.api.getPublicShopData()).shopConfig.id, 'qa-shop-b');
  assert.equal(storage.size, 2);
  assert.ok(storage.has(firstKey));
});

test('una respuesta pública de otra tienda no se publica ni se persiste', async () => {
  const storage = new Map();
  const wrongShop = createStore({
    project: 'staging-a', shopId: 'qa-shop-b', sessionStorage: storage,
    response: shopData('qa-shop-a', 'QA A'),
  });
  await assert.rejects(wrongShop.api.getPublicShopData(true), /no corresponde a la barberia configurada/);
  assert.equal(wrongShop.api.getPublicShopSnapshot().data, null);
  assert.equal(storage.size, 0);
});

test('la portada sin imágenes configuradas no carga recursos de otra barbería', () => {
  assert.doesNotMatch(home, /https?:\/\/[^'"\s]+\.supabase\.co/i);
  assert.doesNotMatch(home, /bookly\.uy/i);
  assert.match(home, /const bgImage = shopConfig\.backgroundImageUrl \|\| ''/);
  assert.match(home, /const bannerUrl = shopConfig\.coverImageUrl \|\| shopConfig\.backgroundImageUrl \|\| ''/);
  assert.match(home, /No hay publicaciones con im[áa]genes configuradas/);
  assert.doesNotMatch(icon, /https?:\/\//i);
});

test('la caché de servidor y sus invalidaciones incluyen proyecto y Shop ID', () => {
  const url = 'https://project-a.supabase.co';
  const otherProject = 'https://project-b.supabase.co';
  const sameShop = 'qa-shop-a';
  const keyA = cacheModule.exports.publicShopStorageKey(url, sameShop);
  const keyB = cacheModule.exports.publicShopStorageKey(otherProject, sameShop);
  const tagA = cacheModule.exports.publicShopCacheTag(url, sameShop);
  assert.notEqual(keyA, keyB);
  assert.notEqual(tagA, cacheModule.exports.publicShopCacheTag(url, 'qa-shop-b'));
  assert.match(serverSource, /getCachedPublicShopData\(projectUrl, SHOP_UUID\)/);
  assert.match(serverSource, /cacheTag\(publicShopCacheTag\(projectUrl, shopId\)\)/);
});
