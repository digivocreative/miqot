import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTerasPath, terasProfilePath } from '../src/lib/terasRoutes.ts';

test('kode share 8-hex tetap dikenali sebagai share', () => {
  assert.deepEqual(parseTerasPath('/teras/9fc969b0'), { kind: 'share', code: '9fc969b0' });
  assert.deepEqual(parseTerasPath('/teras/9FC969B0'), { kind: 'share', code: '9fc969b0' });
});

test('slug agent biasa dikenali sebagai profil', () => {
  assert.deepEqual(parseTerasPath('/teras/nila'), { kind: 'profile', slug: 'nila' });
  assert.deepEqual(parseTerasPath('/teras/Nila/'), { kind: 'profile', slug: 'nila' });
  assert.deepEqual(parseTerasPath('/teras/agent-satu'), { kind: 'profile', slug: 'agent-satu' });
});

test('8 karakter yang bukan hex adalah profil, bukan share', () => {
  assert.deepEqual(parseTerasPath('/teras/nikitaaz'), { kind: 'profile', slug: 'nikitaaz' });
});

test('path yang bukan cabang teras mengembalikan null', () => {
  assert.equal(parseTerasPath('/'), null);
  assert.equal(parseTerasPath('/teras'), null);
  assert.equal(parseTerasPath('/teras/'), null);
  assert.equal(parseTerasPath('/dashboard/teras'), null);
  assert.equal(parseTerasPath('/teras/nila/extra'), null);
  assert.equal(parseTerasPath(''), null);
});

test('slug di-decode dan karakter ilegal ditolak', () => {
  assert.deepEqual(parseTerasPath('/teras/agent%2Dsatu'), { kind: 'profile', slug: 'agent-satu' });
  assert.equal(parseTerasPath('/teras/nila?x=1'), null);
  assert.equal(parseTerasPath('/teras/NILA_X'), null);
});

test('terasProfilePath membangun path profil', () => {
  assert.equal(terasProfilePath('nila'), '/teras/nila');
  assert.equal(terasProfilePath('Nila'), '/teras/nila');
});
