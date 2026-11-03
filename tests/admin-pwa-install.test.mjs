import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const publicManifest = JSON.parse(read('public/manifest.json'));
const adminManifest = JSON.parse(read('public/admin-manifest.webmanifest'));
const rootLayout = read('app/layout.tsx');
const adminLayout = read('app/admin/layout.tsx');

test('la instalación pública sigue abriendo inicio y mantiene su manifiesto', () => {
  assert.equal(publicManifest.start_url, '/');
  assert.match(rootLayout, /manifest: "\/manifest\.json"/);
});

test('el icono de administración abre /admin y es distinto del inicio público', () => {
  assert.equal(adminManifest.id, '/admin');
  assert.equal(adminManifest.start_url, '/admin');
  assert.equal(adminManifest.display, 'standalone');
  assert.match(adminManifest.name, /Administraci[oó]n/);
  assert.notEqual(adminManifest.start_url, publicManifest.start_url);
  assert.match(adminLayout, /manifest: '\/admin-manifest\.webmanifest'/);
  assert.match(adminLayout, /title: '13 CUT Admin'/);
});

test('al vencer la sesión, /login sigue dentro de la app y el servidor protege /admin', () => {
  assert.equal(adminManifest.scope, '/');
  assert.match(adminLayout, /requireAdminSession\(\)/);
  assert.match(adminLayout, /if \(!session\)/);
  assert.match(adminLayout, /redirect\('\/login'\)/);
  assert.doesNotMatch(adminManifest.description, /token|password|secret/i);
});
