import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// Tombol mata ("sembunyikan paket habis") di baris Cari halaman jadwal publik.
//
// Sejak 2026-09-24 (permintaan user): tombolnya ada di SEMUA filter & sub-filter,
// BAWAANNYA AKTIF (paket habis disembunyikan), dan ia SATU-SATUNYA gerbang
// kursi — sub-filter "Seat Tersedia" diganti "Semua Jenis" supaya tidak ada dua
// kontrol untuk hal yang sama.
//
// TypeScript ber-alias '@' → dibundel dulu (pola tests/jadwal-filter-url.test.js).

const root = new URL('..', import.meta.url).pathname;

async function bundle(entry, name) {
  const dir = await mkdtemp(join(tmpdir(), `${name}-`));
  const outfile = join(dir, `${name}.mjs`);
  await build({
    entryPoints: [join(root, entry)],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    alias: { '@': join(root, 'src') },
    logLevel: 'silent',
  });
  return import(pathToFileURL(outfile).href);
}

const filterLogic = await bundle('src/utils/filter-logic.ts', 'filter-logic-tersedia');
const { filterPackages } = filterLogic;
const { buildFilterSearch, parseFilterSearch, SHOW_SOLD_OUT_PARAM } =
  await bundle('src/utils/filter-url.ts', 'filter-url-tersedia');

const read = rel => readFileSync(join(root, rel), 'utf8');
const filterHeader = read('src/components/FilterHeader.tsx');
const app = read('src/App.tsx');

function pkg(nama, over = {}) {
  return {
    jadwal_id: nama,
    nama,
    isPromo: false,
    seatSisa: 10,
    seatTotal: 46,
    maskapai: 'SAUDIA',
    keberangkatan: { tgl: '2026-10-07', jam: '08.00', rute: 'CGK-JED' },
    kepulangan: { tgl: '2026-10-16', jam: '16.00', rute: 'JED-CGK' },
    harga: { UHUD: { Quard: '33900000' } },
    hotel: {},
    ...over,
  };
}

const DATA = [pkg('ADA'), pkg('HABIS', { seatSisa: 0 })];
const names = list => list.map(p => p.nama).sort();

const ALL_MODES = [
  'AVAILABLE', 'TIPE PAKET', 'AWAL PERJALANAN', 'DURASI PERJALANAN',
  'DATA PER-BULAN', 'SEMUA DATA', 'LANDING DI',
];

// ── Perilaku gerbang ──

test('tombol aktif menyembunyikan paket habis di SEMUA mode, termasuk Semua Jenis & Semua Data', () => {
  for (const mode of ALL_MODES) {
    assert.deepEqual(names(filterPackages(DATA, { mode, availableOnly: true })), ['ADA'], mode);
  }
});

test('tombol mati memuat paket habis di SEMUA mode — tak ada lagi mode yang bergerbang sendiri', () => {
  // Dulu AVAILABLE ("Seat Tersedia") menyaring kursi sendiri. Kini ia "Semua
  // Jenis", dan kursi murni urusan tombol mata.
  for (const mode of ALL_MODES) {
    assert.deepEqual(names(filterPackages(DATA, { mode, availableOnly: false })), ['ADA', 'HABIS'], mode);
  }
});

test('tombol aktif tetap menghormati sub-nilai, bukan menggantikannya', () => {
  const data = [
    pkg('JED ADA'),
    pkg('JED HABIS', { seatSisa: 0 }),
    pkg('MED ADA', { keberangkatan: { tgl: '2026-10-07', jam: '08.00', rute: 'CGK-MED' } }),
  ];
  const params = { mode: 'LANDING DI', secondaryValue: 'JED', availableOnly: true };
  assert.deepEqual(names(filterPackages(data, params)), ['JED ADA']);
});

test('mode URL-saja ikut patuh pada tombol', () => {
  const libur = { keberangkatan: { tgl: '2026-06-20', jam: '08.00' } };
  const data = [pkg('LIBUR ADA', libur), pkg('LIBUR HABIS', { ...libur, seatSisa: 0 })];
  assert.deepEqual(names(filterPackages(data, { mode: 'LIBURAN_SEKOLAH' })), ['LIBUR ADA', 'LIBUR HABIS']);
  assert.deepEqual(
    names(filterPackages(data, { mode: 'LIBURAN_SEKOLAH', availableOnly: true })),
    ['LIBUR ADA'],
  );
});

test('tidak ada lagi daftar mode bercakupan tombol', () => {
  // Pengecualiannya habis, jadi daftarnya ikut dicabut (seperti MODES_WITH_SORT).
  assert.equal('MODES_WITH_AVAILABILITY_TOGGLE' in filterLogic, false);
});

// ── URL ──

test('bawaan AKTIF tidak menulis apa pun; hanya keadaan mati yang masuk URL sebagai ?habis', () => {
  assert.equal(SHOW_SOLD_OUT_PARAM, 'habis');
  assert.equal(buildFilterSearch({ availableOnly: true }), '');
  assert.equal(buildFilterSearch({}), '');
  assert.equal(buildFilterSearch({ availableOnly: false }), '?habis');
});

test('keadaan tombol selamat bolak-balik lewat URL; link lama ?tersedia jatuh ke bawaan', () => {
  const search = buildFilterSearch({ availableOnly: false, quickFilter: 'promo', sortOrder: 'HARGA_TERMURAH' });
  const parsed = parseFilterSearch(search);
  assert.equal(parsed.availableOnly, false);
  assert.equal(parsed.quickFilter, 'promo');
  assert.equal(parsed.sortOrder, 'HARGA_TERMURAH');
  assert.equal(parseFilterSearch('').availableOnly, true);
  // `?tersedia` (flag lama saat bawaannya mati) = aktif = sama dengan bawaan baru.
  assert.equal(parseFilterSearch('?tersedia').availableOnly, true);
});

// ── Sambungan UI (source guard) ──

test('tombol dirender tanpa syarat mode', () => {
  assert.doesNotMatch(filterHeader, /showAvailabilityToggle/);
  assert.doesNotMatch(filterHeader, /MODES_WITH_AVAILABILITY_TOGGLE/);
  assert.match(filterHeader, /aria-label=\{availableOnly \? 'Tampilkan juga paket habis' : 'Sembunyikan paket habis'\}/);
});

test('tampilan aktif netral, bukan hijau — keadaan dibaca dari ikon', () => {
  const btn = filterHeader.match(/<button\s+ref=\{availabilityBtnRef\}[\s\S]*?<\/button>/)?.[0] ?? '';
  assert.notEqual(btn, '', 'tombol mata tidak ditemukan');
  assert.doesNotMatch(btn, /emerald/);
  assert.match(btn, /aria-pressed=\{availableOnly\}/);
  assert.match(btn, /<EyeOff/);
});

test('roster sub-filter memakai gerbang yang SAMA dengan hasilnya', () => {
  // Kalau roster lepas dari tombol, angka di label berbohong: "Jeddah (59 paket)"
  // di atas 29 kartu. Dikunci juga oleh tests/filter-header-tipe-paket.test.js.
  const memo = filterHeader.match(/const rosterPackages = useMemo\([\s\S]*?\}, \[[^\]]*\]\);/)?.[0] ?? '';
  assert.notEqual(memo, '', 'memo rosterPackages tidak ditemukan');
  assert.match(memo, /availableOnly/);
  assert.match(memo, /seatSisa > 0/);
});

test('App: bawaan aktif, tidak direset saat ganti mode, dikembalikan ke aktif saat reset', () => {
  assert.match(app, /const \[availableOnly, setAvailableOnly\] = useState\(true\);/);
  const modeHandler = app.match(/const handleFilterModeChange = [\s\S]*?\n  \};/)?.[0] ?? '';
  assert.notEqual(modeHandler, '', 'handleFilterModeChange tidak ditemukan');
  assert.doesNotMatch(modeHandler, /setAvailableOnly/);
  for (const name of ['handleResetFilters', 'handleYearChange']) {
    const handler = app.match(new RegExp(`const ${name} = [\\s\\S]*?\\n  \\};`))?.[0] ?? '';
    assert.match(handler, /setAvailableOnly\(true\)/, name);
  }
  assert.match(app, /setAvailableOnly\(parsedUrl\.availableOnly\);/);
});

test('App menyalurkan tombol ke hasil, ke URL, dan ke telemetri', () => {
  assert.match(app, /availableOnly,?\n?\s*\}\);/);            // masuk ke filterPackages
  assert.match(app, /buildFilterSearch\(\{[\s\S]*?availableOnly[\s\S]*?\}\)/);
  assert.match(app, /trackFilterChange\('tersedia'/);
});
