import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { transformSync } from 'esbuild';

async function importTsModule(path) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'esm', sourcemap: false });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

const pkg = (id, brosur) => ({ id, nama: `PAKET ${id}`, brosur });

test('katalog Brosur Paket hanya memuat paket dari hasil filter yang tampil', async () => {
  const { buildPaketKatalogScope } = await importTsModule('src/lib/brosurPaketKatalog.ts');

  const oktober = [pkg('JBU1554', 'https://cdn/1554.jpg'), pkg('JBU1555', 'https://cdn/1555.jpg')];
  const scope = buildPaketKatalogScope(oktober, 'Oktober 2026');

  assert.deepEqual(scope.packages.map(p => p.id), ['JBU1554', 'JBU1555']);
  assert.equal(scope.label, 'Oktober 2026');
  assert.deepEqual(scope.summary, [{ label: 'Oktober 2026', count: 2 }]);
});

test('paket tanpa brosur resmi dibuang — tidak ada halaman PDF kosong', async () => {
  const { buildPaketKatalogScope } = await importTsModule('src/lib/brosurPaketKatalog.ts');

  const scope = buildPaketKatalogScope(
    [pkg('A', 'https://cdn/a.jpg'), pkg('B', null), pkg('C', '   '), pkg('D', undefined)],
    'November 2026',
  );

  assert.deepEqual(scope.packages.map(p => p.id), ['A']);
  assert.deepEqual(scope.summary, [{ label: 'November 2026', count: 1 }]);
});

test('label, ringkasan cover, dan daftar halaman selalu sepakat', async () => {
  const { buildPaketKatalogScope } = await importTsModule('src/lib/brosurPaketKatalog.ts');

  // Bug aslinya: halaman semua bulan, cover menulis "Semua Bulan", grid satu
  // bulan. Ketiganya kini turun dari satu panggilan, jadi tidak bisa berbeda.
  const scope = buildPaketKatalogScope([pkg('A', 'https://cdn/a.jpg')], 'Desember 2026');
  const [row] = scope.summary;

  assert.equal(row.label, scope.label);
  assert.equal(row.count, scope.packages.length);
  assert.notEqual(scope.label, 'Semua Bulan');
});

test('filter tanpa label jatuh ke teks netral, bukan string kosong', async () => {
  const { buildPaketKatalogScope } = await importTsModule('src/lib/brosurPaketKatalog.ts');

  assert.equal(buildPaketKatalogScope([], '').label, 'Filter aktif');
  assert.equal(buildPaketKatalogScope([], null).label, 'Filter aktif');
  assert.equal(buildPaketKatalogScope(null, '  ').label, 'Filter aktif');
  assert.deepEqual(buildPaketKatalogScope(null, '').summary, []);
});

// ── Penjagaan pemasangan di halaman ────────────────────────────────────────
// Bug-nya ada di CALL SITE, bukan di helper: katalog Brosur Paket dulu membaca
// gabungan semua bulan (catalogMonthEntries) alih-alih hasil filter. Dua
// asersi di bawah dijangkarkan ke DEKLARASI-nya, bukan ke salinan teks UI.

const pageSource = readFileSync(new URL('../src/components/BrochureSchedulePage.tsx', import.meta.url), 'utf8');

/** Ambil badan deklarasi `const <name> = ...` sampai deklarasi top-level berikutnya. */
function declarationBody(source, name) {
  const start = source.indexOf(`const ${name} =`);
  assert.notEqual(start, -1, `deklarasi ${name} tidak ditemukan`);
  const rest = source.slice(start + 1);
  const end = rest.search(/\n {2}(?:const|function|async function|return|useEffect)\b/);
  return rest.slice(0, end === -1 ? undefined : end);
}

test('sumber halaman katalog Brosur Paket = hasil filter, bukan gabungan bulan', () => {
  const body = declarationBody(pageSource, 'packageCatalogScope');

  assert.match(body, /buildPaketKatalogScope/);
  assert.match(body, /filteredPackages/);
  assert.doesNotMatch(
    body,
    /catalogMonthEntries|months\b/,
    'katalog Brosur Paket kembali menggabung semua bulan — lihat src/lib/brosurPaketKatalog.ts',
  );
});

test('nama berkas & ringkasan cover Brosur Paket ikut bulan terpilih', () => {
  // "Semua Bulan" adalah label katalog Brosur Jadwal. Kalau ia bocor ke sisi
  // paket, PDF satu bulan akan tersimpan/ber-cover seolah semua bulan.
  const paketFlow = pageSource.slice(pageSource.indexOf('async function handleDownloadPackageCatalog('));
  const body = paketFlow.slice(0, paketFlow.indexOf('\n  // Build the catalog PDF'));

  assert.match(body, /packageCatalogFilename\(agent, packageCatalogScope\.label\)/);
  assert.match(body, /summary: packageCatalogScope\.summary/);
  assert.doesNotMatch(body, /catalogFilterLabel/);
});

test('Brosur Jadwal tetap membentang semua bulan pada dimensi Bulan', () => {
  // Perbedaan dua mode itu disengaja; jangan ikut "diperbaiki" bersama paket.
  const plan = pageSource.slice(pageSource.indexOf('function buildCatalogPlan('));
  assert.match(plan.slice(0, plan.indexOf('\n  // Ringkasan cover')), /catalogMonthEntries/);
});
