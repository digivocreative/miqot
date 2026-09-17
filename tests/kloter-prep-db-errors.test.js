import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { describeLoadError, LOAD_ERROR_MESSAGES } from '../src/lib/loadError.ts';

// Status checklist kloter yang gagal dimuat ditampilkan lewat describeLoadError. readApiJson
// dulu membuang status HTTP dan memakai pesan "Gagal menyimpan data jamaah" untuk MUAT juga,
// jadi server 503 tampil sebagai pesan umum, bukan "Server sedang bermasalah".
async function importTsModule(path) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'esm', sourcemap: false });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

const trip = { slug: '26SEP2026', publicPath: '/26SEP2026' };

test('galat muat checklist membawa status HTTP ke pesan pengguna', async () => {
  const { fetchKloterPrepFromDb } = await importTsModule('src/lib/kloterPrepDb.ts');
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Database sibuk' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    await assert.rejects(fetchKloterPrepFromDb(trip), (error) => {
      assert.equal(describeLoadError(error, { online: true }), LOAD_ERROR_MESSAGES.server);
      return true;
    });
    globalThis.fetch = async () => new Response('<html>', { status: 502 });
    await assert.rejects(fetchKloterPrepFromDb(trip), (error) => {
      assert.equal(describeLoadError(error, { online: true }), LOAD_ERROR_MESSAGES.server);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
