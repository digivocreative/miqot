import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { transformSync } from 'esbuild';

async function importTsModule(path) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const { code } = transformSync(source, {
    loader: 'ts',
    format: 'esm',
    sourcemap: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

const MODULE = 'src/lib/flightDirection.ts';

test('direction dari server menang atas kode bandara', async () => {
  const { isReturnFlight } = await importTsModule(MODULE);

  // Kepulangan yang mendarat di luar CGK tetap dibaca pulang.
  assert.equal(isReturnFlight({ direction: 'pulang', arrCode: 'SUB' }), true);
  assert.equal(isReturnFlight({ direction: 'kepulangan', arrCode: 'SUB' }), true);

  // Keberangkatan yang kebetulan transit balik ke CGK tidak dilabeli pulang.
  assert.equal(isReturnFlight({ direction: 'pergi', arrCode: 'CGK' }), false);
  assert.equal(isReturnFlight({ direction: 'keberangkatan', arrCode: 'CGK' }), false);
});

test('tanpa direction, arah diambil dari bandara tujuan akhir', async () => {
  const { isReturnFlight } = await importTsModule(MODULE);

  assert.equal(isReturnFlight({ arrCode: 'CGK' }), true);
  assert.equal(isReturnFlight({ arrCode: 'cgk' }), true);
  assert.equal(isReturnFlight({ arrCode: 'JED' }), false);
});

test('multi-leg memakai segmen terakhir, bukan segmen aktif', async () => {
  const { isReturnFlight } = await importTsModule(MODULE);

  // JED-DXB / DXB-CGK — leg aktif masih DXB, tujuan akhir CGK.
  assert.equal(isReturnFlight({
    arrCode: 'DXB',
    segments: [{ arrCode: 'DXB' }, { arrCode: 'CGK' }],
  }), true);

  // CGK-DXB / DXB-JED — leg pertama berangkat dari CGK, bukan pulang.
  assert.equal(isReturnFlight({
    arrCode: 'DXB',
    segments: [{ arrCode: 'DXB' }, { arrCode: 'JED' }],
  }), false);

  // Segmen terakhir tanpa kode mundur ke segmen sebelumnya yang terisi.
  assert.equal(isReturnFlight({
    arrCode: 'DXB',
    segments: [{ arrCode: 'CGK' }, { arrCode: null }],
  }), true);
});

test('data kosong atau tidak dikenal tidak dilabeli pulang', async () => {
  const { isReturnFlight } = await importTsModule(MODULE);

  assert.equal(isReturnFlight(null), false);
  assert.equal(isReturnFlight(undefined), false);
  assert.equal(isReturnFlight({}), false);
  assert.equal(isReturnFlight({ direction: '', arrCode: '' }), false);
  assert.equal(isReturnFlight({ direction: 'entah', arrCode: 'JED' }), false);
  assert.equal(isReturnFlight({ segments: [] }), false);
});
