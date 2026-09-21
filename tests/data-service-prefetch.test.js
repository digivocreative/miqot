import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSync } from 'esbuild';

// fetchFromApi (src/services/data-service.ts) memakai promise prefetch
// window.__schedulesPrefetch[yearCode] yang dimulai skrip inline index.html
// (kontrak: tests/schedules-prefetch-year.test.js). Yang dikunci di sini adalah
// PERILAKU bundel sungguhan, bukan ejaan kode:
//  - prefetch dipakai SEKALI lalu dihapus dari map, fetch normal tidak dipanggil;
//  - forceRefresh (refreshPackages / pull-to-refresh) tidak memakainya, KECUALI
//    preferPrefetch (revalidasi latar saat mount untuk cache basi, App.tsx);
//  - prefetch ditolak / kehabisan waktu → fallback fetch normal; respons !ok
//    dipakai apa adanya (galat HTTP) tanpa fetch ulang;
//  - prefetch berumur > SCHEDULES_PREFETCH_MAX_AGE_MS (stempel window.__schedulesPrefetchAt)
//    atau tanpa stempel dibuang → fetch normal (kursi/harga basi tak boleh tampil segar);
//  - tanpa window (SSR/tes) tetap fetch normal.

const rootPath = new URL('..', import.meta.url).pathname;
const outDir = realpathSync(mkdtempSync(join(tmpdir(), 'data-service-prefetch-')));
process.on('exit', () => rmSync(outDir, { recursive: true, force: true }));

const outfile = join(outDir, 'data-service.mjs');
buildSync({
  entryPoints: [join(rootPath, 'src/services/data-service.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
});

// Node 20 tidak punya localStorage — stub in-memory supaya cache paket berjalan.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};
globalThis.window = {};

const { getPackages, refreshPackages } = await import(outfile);

const YEAR = '1448';
const body = (total) => JSON.stringify({ status: 'ok', iTotalDisplayRecords: total, aaData: [] });
const jsonResponse = (total, status = 200) => new Response(body(total), {
  status,
  headers: { 'content-type': 'application/json' },
});
// Seperti skrip inline index.html: promise + stempel mulai (Date.now()) per tahun.
const setPrefetch = (promise, { year = YEAR, startedAt = Date.now() } = {}) => {
  window.__schedulesPrefetch = { [year]: promise };
  window.__schedulesPrefetchAt = { [year]: startedAt };
};

let fetchCalls;
beforeEach(() => {
  store.clear();
  fetchCalls = [];
  globalThis.window = {};
  globalThis.fetch = async (url) => {
    fetchCalls.push(String(url));
    return jsonResponse(3);
  };
});

test('prefetch dipakai sekali (fetch normal tidak dipanggil) lalu dihapus dari map', async () => {
  setPrefetch(Promise.resolve(jsonResponse(7)));

  const first = await getPackages({ yearCode: YEAR });
  assert.equal(first.success, true);
  assert.equal(first.fromCache, false);
  assert.equal(first.totalRecords, 7, 'payload dari respons prefetch');
  assert.deepEqual(fetchCalls, [], 'fetch normal tidak boleh dipanggil');
  assert.equal(YEAR in window.__schedulesPrefetch, false, 'entri prefetch dihapus (sekali pakai)');
  assert.ok(store.has(`umroh_packages_cache_v2_${YEAR}`), 'respons prefetch tetap disimpan ke cache');

  // Berikutnya: cache segar → tidak fetch; refresh paksa → fetch normal.
  const cached = await getPackages({ yearCode: YEAR });
  assert.equal(cached.fromCache, true);
  assert.deepEqual(fetchCalls, []);

  const refreshed = await refreshPackages({ yearCode: YEAR });
  assert.equal(refreshed.totalRecords, 3);
  assert.deepEqual(fetchCalls, [`/api/schedules/${YEAR}`]);
});

test('forceRefresh tidak memakai prefetch dan membiarkan entrinya', async () => {
  const pending = Promise.resolve(jsonResponse(7));
  setPrefetch(pending);

  const result = await refreshPackages({ yearCode: YEAR });
  assert.equal(result.totalRecords, 3, 'data dari fetch normal, bukan prefetch');
  assert.deepEqual(fetchCalls, [`/api/schedules/${YEAR}`]);
  assert.equal(window.__schedulesPrefetch[YEAR], pending, 'entri prefetch tidak disentuh');
});

test('prefetch ditolak → fallback fetch normal, entri tetap dihapus', async () => {
  const rejected = Promise.reject(new TypeError('Failed to fetch'));
  rejected.catch(() => {}); // seperti index.html: cabang catch tambahan
  setPrefetch(rejected);

  const result = await getPackages({ yearCode: YEAR, silent: true });
  assert.equal(result.success, true);
  assert.equal(result.totalRecords, 3);
  assert.deepEqual(fetchCalls, [`/api/schedules/${YEAR}`]);
  assert.equal(YEAR in window.__schedulesPrefetch, false);
});

test('preferPrefetch: revalidasi latar saat mount (cache basi) memakai prefetch, sekali', async () => {
  // Cache BASI (> TTL 30 menit): App.tsx menyajikan snapshot (nonBlockingStale) lalu
  // merevalidasi lewat refreshPackages — jalur kunjungan ulang yang paling umum.
  store.set(`umroh_packages_cache_v2_${YEAR}`, JSON.stringify({
    timestamp: Date.now() - 120 * 60 * 1000,
    apiResponse: { status: 'ok', iTotalDisplayRecords: 1, aaData: [] },
  }));
  setPrefetch(Promise.resolve(jsonResponse(7)));

  const stale = await getPackages({ yearCode: YEAR, nonBlockingStale: true });
  assert.equal(stale.fromCache, true);
  assert.equal(stale.totalRecords, 1);
  assert.deepEqual(fetchCalls, [], 'snapshot basi tanpa fetch');
  assert.ok(YEAR in window.__schedulesPrefetch, 'prefetch belum dipakai');

  const fresh = await refreshPackages({ yearCode: YEAR, silent: true, preferPrefetch: true });
  assert.equal(fresh.success, true);
  assert.equal(fresh.fromCache, false);
  assert.equal(fresh.totalRecords, 7, 'data dari respons prefetch');
  assert.deepEqual(fetchCalls, [], 'tidak ada fetch identik kedua');
  assert.equal(YEAR in window.__schedulesPrefetch, false, 'entri dihapus (sekali pakai)');

  // Refresh berikutnya (pull-to-refresh): map kosong → fetch baru.
  const again = await refreshPackages({ yearCode: YEAR, silent: true, preferPrefetch: true });
  assert.equal(again.totalRecords, 3);
  assert.deepEqual(fetchCalls, [`/api/schedules/${YEAR}`]);
});

test('prefetch !ok (503) dipakai sebagai respons: galat HTTP, tanpa fetch ulang', async () => {
  setPrefetch(Promise.resolve(jsonResponse(0, 503)));

  const result = await getPackages({ yearCode: YEAR, silent: true });
  assert.equal(result.success, false);
  assert.equal(result.error, 'HTTP error! status: 503');
  assert.deepEqual(fetchCalls, [], 'server yang sakit tidak dipukul dua kali');
  assert.equal(YEAR in window.__schedulesPrefetch, false, 'entri tetap dihapus');
});

test('prefetch menggantung melewati timeout → fallback fetch normal', async () => {
  setPrefetch(new Promise(() => {}));

  const result = await getPackages({ yearCode: YEAR, timeout: 30, silent: true });
  assert.equal(result.success, true);
  assert.equal(result.totalRecords, 3);
  assert.deepEqual(fetchCalls, [`/api/schedules/${YEAR}`]);
});

test('prefetch untuk tahun lain tidak dipakai', async () => {
  setPrefetch(Promise.resolve(jsonResponse(7)), { year: '1449' });

  const result = await getPackages({ yearCode: YEAR });
  assert.equal(result.totalRecords, 3);
  assert.deepEqual(fetchCalls, [`/api/schedules/${YEAR}`]);
  assert.ok('1449' in window.__schedulesPrefetch, 'entri tahun lain tidak disentuh');
});

test('fetch normal gagal setelah prefetch gagal → hasil error seperti semula', async () => {
  const rejected = Promise.reject(new Error('prefetch down'));
  rejected.catch(() => {});
  setPrefetch(rejected);
  globalThis.fetch = async () => { throw new Error('network down'); };

  const result = await getPackages({ yearCode: YEAR, silent: true });
  assert.equal(result.success, false);
  assert.equal(result.error, 'network down');
  assert.deepEqual(result.packages, []);
});

test('prefetch berumur lebih dari batas dibuang → fetch normal, entri dihapus', async () => {
  // Agent login membuka "/" (dashboard in-place, App tidak mount): promise menggantung
  // berjam-jam, lalu getPackages() dari halaman lain (Voice Over, PaketPicker) tidak boleh
  // menampilkan — apalagi meng-cache dengan stempel baru — kursi/harga selama itu.
  setPrefetch(Promise.resolve(jsonResponse(7)), { startedAt: Date.now() - 2 * 60 * 60 * 1000 });

  const result = await getPackages({ yearCode: YEAR });
  assert.equal(result.totalRecords, 3, 'data dari fetch normal, bukan prefetch basi');
  assert.deepEqual(fetchCalls, [`/api/schedules/${YEAR}`]);
  assert.equal(YEAR in window.__schedulesPrefetch, false, 'entri basi tetap dihapus');
  assert.equal(YEAR in window.__schedulesPrefetchAt, false, 'stempelnya ikut dihapus');
  const cached = JSON.parse(store.get(`umroh_packages_cache_v2_${YEAR}`));
  assert.equal(cached.apiResponse.iTotalDisplayRecords, 3, 'cache berisi data fetch normal');
});

test('prefetch di bawah batas umur masih dipakai; tanpa stempel tidak dipercaya', async () => {
  setPrefetch(Promise.resolve(jsonResponse(7)), { startedAt: Date.now() - 25 * 1000 });
  const young = await getPackages({ yearCode: YEAR });
  assert.equal(young.totalRecords, 7, 'prefetch 25 dtk masih dipakai');
  assert.deepEqual(fetchCalls, []);

  store.clear();
  window.__schedulesPrefetch = { [YEAR]: Promise.resolve(jsonResponse(7)) };
  delete window.__schedulesPrefetchAt;
  const unstamped = await getPackages({ yearCode: YEAR });
  assert.equal(unstamped.totalRecords, 3, 'tanpa stempel → fetch normal');
  assert.deepEqual(fetchCalls, [`/api/schedules/${YEAR}`]);
  assert.equal(YEAR in window.__schedulesPrefetch, false, 'entri tetap dihapus');
});

test('tanpa window (SSR/tes) langsung fetch normal', async () => {
  delete globalThis.window;
  try {
    const result = await getPackages({ yearCode: YEAR });
    assert.equal(result.totalRecords, 3);
    assert.deepEqual(fetchCalls, [`/api/schedules/${YEAR}`]);
  } finally {
    globalThis.window = {};
  }
});
