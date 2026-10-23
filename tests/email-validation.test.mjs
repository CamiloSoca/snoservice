import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestEmailCorrection} from '../lib/email-validation.ts';

test('avisa si Gmail termina en .con y conserva el nombre de usuario', () => {
  assert.equal(suggestEmailCorrection('cliente@gmail.con'), 'cliente@gmail.com');
});

test('reconoce erratas comunes de los principales proveedores', () => {
  for (const [wrong, expected] of [
    ['usuario@gamil.com', 'usuario@gmail.com'],
    ['usuario@GMIAL.COM', 'usuario@gmail.com'],
    ['usuario@hotmail.con', 'usuario@hotmail.com'],
    ['usuario@hotmial.com', 'usuario@hotmail.com'],
    ['usuario@outlok.com', 'usuario@outlook.com'],
    ['usuario@outlook.con', 'usuario@outlook.com'],
    ['usuario@yahoo.con', 'usuario@yahoo.com'],
    ['usuario@icloud.con', 'usuario@icloud.com'],
  ]) {
    assert.equal(suggestEmailCorrection(wrong), expected);
  }
});

test('no bloquea proveedores y dominios propios válidos, aunque sean poco comunes', () => {
  for (const email of [
    'cliente@gmail.com',
    'cliente@hotmail.com',
    'cliente@miempresa.uy',
    'cliente@proton.me',
    'cliente@gmail.co',
    'cliente@mail.barberia.com.uy',
  ]) {
    assert.equal(suggestEmailCorrection(email), null);
  }
});

test('ignora correos incompletos sin inventar direcciones y detecta espacios alrededor', () => {
  assert.equal(suggestEmailCorrection('cliente@'), null);
  assert.equal(suggestEmailCorrection('cliente@@gmail.con'), null);
  assert.equal(suggestEmailCorrection('  cliente@GMAIL.CON '), 'cliente@gmail.com');
});
