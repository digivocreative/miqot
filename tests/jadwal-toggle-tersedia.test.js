import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// Tombol "hanya seat tersedia" di baris Cari halaman jadwal publik.
//
// KENAPA ADA: gerbang kursi cuma hidup di mode SEAT TERSEDIA, jadi mode
// berdimensi (Landing/Jenis/Durasi/Bulan) selalu memperlihatkan paket habis.
// Tombol ini jalan keluarnya — MENYEMPITKAN, bukan melebarkan: mati = semua
// jadwal (bawaan), nyala = paket habis disembunyikan.
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

const { filterPackages, MODES_WITH_AVAILABILITY_TOGGLE } =
  await bundle('src/utils/filter-logic.ts', 'filter-logic-tersedia');
const { buildFilterSearch, parseFilterSearch, AVAILABILITY_PARAM } =
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

// ── Perilaku gerbang ──

test('toggle mati = bawaan: mode berdimensi tetap memuat paket habis', () => {
  for (const mode of MODES_WITH_AVAILABILITY_TOGGLE) {
    if (mode === 'LIBURAN_SEKOLAH' || mode === 'UMROH CUTI 5 HARI') continue; // punya predikat tanggal sendiri
    assert.deepEqual(names(filterPackages(DATA, { mode })), ['ADA', 'HABIS'], mode);
    assert.deepEqual(names(filterPackages(DATA, { mode, availableOnly: false })), ['ADA', 'HABIS'], mode);
  }
});

test('toggle nyala menyembunyikan paket habis di tiap mode berdimensi', () => {
  for (const mode of MODES_WITH_AVAILABILITY_TOGGLE) {
    if (mode === 'LIBURAN_SEKOLAH' || mode === 'UMROH CUTI 5 HARI') continue;
    assert.deepEqual(names(filterPackages(DATA, { mode, availableOnly: true })), ['ADA'], mode);
  }
});

test('toggle nyala tetap menghormati sub-nilai, bukan menggantikannya', () => {
  const data = [
    pkg('JED ADA'),
    pkg('JED HABIS', { seatSisa: 0 }),
    pkg('MED ADA', { keberangkatan: { tgl: '2026-10-07', jam: '08.00', rute: 'CGK-MED' } }),
  ];
  const params = { mode: 'LANDING DI', secondaryValue: 'JED', availableOnly: true };
  assert.deepEqual(names(filterPackages(data, params)), ['JED ADA']);
});

test('mode URL-saja ikut patuh pada toggle', () => {
  const libur = { keberangkatan: { tgl: '2026-06-20', jam: '08.00' } };
  const data = [pkg('LIBUR ADA', libur), pkg('LIBUR HABIS', { ...libur, seatSisa: 0 })];
  assert.deepEqual(names(filterPackages(data, { mode: 'LIBURAN_SEKOLAH' })), ['LIBUR ADA', 'LIBUR HABIS']);
  assert.deepEqual(
    names(filterPackages(data, { mode: 'LIBURAN_SEKOLAH', availableOnly: true })),
    ['LIBUR ADA'],
  );
});

test('fail-closed: availableOnly diabaikan di mode di luar cakupan tombol', () => {
  // Tombolnya tidak dirender di dua mode ini, jadi flag yang nyasar dari URL
  // tidak boleh diam-diam menyaring daftar yang tombolnya tak terlihat.
  assert.deepEqual(names(filterPackages(DATA, { mode: 'SEMUA DATA', availableOnly: true })), ['ADA', 'HABIS']);
  // SEAT TERSEDIA memang sudah bergerbang; flag tidak mengubah apa pun.
  assert.deepEqual(names(filterPackages(DATA, { mode: 'AVAILABLE', availableOnly: true })), ['ADA']);
  assert.deepEqual(names(filterPackages(DATA, { mode: 'AVAILABLE', availableOnly: false })), ['ADA']);
});

test('cakupan tombol: 6 mode berdimensi, TANPA dua mode yang sudah menyatakan gerbangnya', () => {
  assert.deepEqual([...MODES_WITH_AVAILABILITY_TOGGLE].sort(), [
    'DATA PER-BULAN',
    'DURASI PERJALANAN',
    'LANDING DI',
    'LIBURAN_SEKOLAH',
    'TIPE PAKET',
    'UMROH CUTI 5 HARI',
  ]);
  for (const gone of ['AVAILABLE', 'SEMUA DATA']) {
    assert.ok(!MODES_WITH_AVAILABILITY_TOGGLE.includes(gone), gone);
  }
});

// ── URL ──

test('toggle ikut ke URL sebagai flag, dan bawaannya tidak menulis apa pun', () => {
  assert.equal(AVAILABILITY_PARAM, 'tersedia');
  assert.equal(buildFilterSearch({ availableOnly: true }), '?tersedia');
  // Link tetap pendek selama toggle di posisi bawaan.
  assert.equal(buildFilterSearch({ availableOnly: false }), '');
  assert.equal(buildFilterSearch({}), '');
});

test('toggle selamat bolak-balik lewat URL, berdampingan dengan filter lain', () => {
  const search = buildFilterSearch({ availableOnly: true, quickFilter: 'promo', sortOrder: 'HARGA_TERMURAH' });
  const parsed = parseFilterSearch(search);
  assert.equal(parsed.availableOnly, true);
  assert.equal(parsed.quickFilter, 'promo');
  assert.equal(parsed.sortOrder, 'HARGA_TERMURAH');
  assert.equal(parseFilterSearch('').availableOnly, false);
});

// ── Sambungan UI (source guard) ──

test('tombol hanya dirender di mode yang punya cakupan', () => {
  assert.match(filterHeader, /MODES_WITH_AVAILABILITY_TOGGLE\.includes\(filterMode\)/);
  // Daftarnya milik filter-logic, bukan salinan rantai === di komponen.
  assert.doesNotMatch(filterHeader, /filterMode === 'LANDING DI' \|\|/);
});

test('roster sub-filter memakai gerbang yang SAMA dengan hasilnya', () => {
  // Kalau roster lepas dari toggle, angka di label berbohong: "Jeddah (59 paket)"
  // di atas 29 kartu. Dikunci juga oleh tests/filter-header-tipe-paket.test.js.
  const memo = filterHeader.match(/const rosterPackages = useMemo\([\s\S]*?\}, \[[^\]]*\]\);/)?.[0] ?? '';
  assert.notEqual(memo, '', 'memo rosterPackages tidak ditemukan');
  assert.match(memo, /availableOnly/);
  assert.match(memo, /seatSisa > 0/);
});

test('App membuang state toggle saat modenya keluar cakupan', () => {
  // Kalau disimpan, user kembali ke Landing dan daftarnya pendek karena saringan
  // yang tombolnya sempat tak terlihat — filter siluman.
  const handler = app.match(/const handleFilterModeChange = [\s\S]*?\n  \};/)?.[0] ?? '';
  assert.notEqual(handler, '', 'handleFilterModeChange tidak ditemukan');
  assert.match(handler, /MODES_WITH_AVAILABILITY_TOGGLE\.includes\(mode\)/);
  assert.match(handler, /setAvailableOnly\(false\)/);
});

test('App menyalurkan toggle ke hasil, ke URL, dan ke telemetri', () => {
  assert.match(app, /availableOnly,?\n?\s*\}\);/);            // masuk ke filterPackages
  assert.match(app, /buildFilterSearch\(\{[\s\S]*?availableOnly[\s\S]*?\}\)/);
  assert.match(app, /trackFilterChange\('tersedia'/);
  // Reset filter mengembalikan toggle ke bawaan juga.
  const reset = app.match(/const handleResetFilters = [\s\S]*?\n  \};/)?.[0] ?? '';
  assert.match(reset, /setAvailableOnly\(false\)/);
});
