import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLoopIndex } from '../lib/instagram-carousel-loop.ts';

test('el bucle salta desde la copia después de la última a la primera real', () => {
  assert.equal(resolveLoopIndex(15, 12, 3), 3);
  assert.equal(resolveLoopIndex(16, 12, 3), 4);
  assert.equal(resolveLoopIndex(17, 12, 3), 5);
});

test('el bucle salta desde la copia antes de la primera a las últimas reales', () => {
  assert.equal(resolveLoopIndex(2, 12, 3), 14);
  assert.equal(resolveLoopIndex(1, 12, 3), 13);
  assert.equal(resolveLoopIndex(0, 12, 3), 12);
});

test('en las diapositivas reales no teletransporta', () => {
  for (let slide = 3; slide < 15; slide += 1) {
    assert.equal(resolveLoopIndex(slide, 12, 3), slide);
  }
});

test('sin suficientes publicaciones no duplica ni teletransporta', () => {
  assert.equal(resolveLoopIndex(0, 0, 0), 0);
  assert.equal(resolveLoopIndex(0, 1, 0), 0);
  assert.equal(resolveLoopIndex(4, 2, 2), 2);
  assert.equal(resolveLoopIndex(1, 2, 2), 3);
});
