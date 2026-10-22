import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EMPTY_FILTERS, activeFilterCount, countByTab, filterCalonHaji, formatKabKota, formatProvinsi,
  isBerhakLunas, isLunas, jknBucket, kabKotaOptions, provinsiOptions, withProvinsi,
} from '../src/lib/calonHaji.js';

// Data karangan.
const base = { tahap: 1, keterangan: 'URUT PORSI', status_jemaah: 'AKTIF', usia: 40 };
const ROWS = [
  { ...base, no_urut: 1, no_porsi: '3000000101', nik: '3175019901800011', nama: 'SITI NURHALIZA', status_cadangan: 'NON CADANGAN', kepesertaan_jkn: 'AKTIF', kab_kota: 'KOTA DEPOK', provinsi: 'JAWA BARAT' },
  { ...base, no_urut: 2, no_porsi: '3000000102', nik: '3175019901800012', nama: 'BUDI SANTOSO', status_cadangan: 'CADANGAN', status_jemaah: 'LUNAS', kepesertaan_jkn: null, kab_kota: 'KAB. BOGOR', provinsi: 'JAWA BARAT' },
  { ...base, no_urut: 3, no_porsi: '3000000103', nik: '3175019901800013', nama: 'RINA KARTIKA', status_cadangan: 'CADANGAN', kepesertaan_jkn: 'BELUM TERDAFTAR', kab_kota: 'KOTA TANGERANG', provinsi: 'BANTEN' },
];
const run = (opts) => filterCalonHaji(ROWS, { tab: 'semua', query: '', filters: EMPTY_FILTERS, ...opts }).map((r) => r.no_urut);

test('formatKabKota buang "KOTA ", "KAB." tetap, title case', () => {
  assert.equal(formatKabKota('KOTA JAKARTA TIMUR'), 'Jakarta Timur');
  assert.equal(formatKabKota('KAB. BEKASI'), 'Kab. Bekasi');
});

test('formatProvinsi menjaga DKI dan D.I.', () => {
  assert.equal(formatProvinsi('DKI JAKARTA'), 'DKI Jakarta');
  assert.equal(formatProvinsi('D.I. YOGYAKARTA'), 'D.I. Yogyakarta');
  assert.equal(formatProvinsi('JAWA BARAT'), 'Jawa Barat');
});

test('jknBucket memetakan 4 nilai ke 3 kelompok', () => {
  assert.equal(jknBucket(null), 'tidak_ada');
  assert.equal(jknBucket('BELUM TERDAFTAR'), 'tidak_ada');
  assert.equal(jknBucket('TERDAFTAR, BELUM AKTIF'), 'belum_aktif');
  assert.equal(jknBucket('AKTIF'), 'aktif');
});

test('isBerhakLunas / isLunas', () => {
  assert.equal(isBerhakLunas(ROWS[0]), true);
  assert.equal(isBerhakLunas(ROWS[1]), false);
  assert.equal(isLunas(ROWS[1]), true);
  assert.equal(isLunas(ROWS[0]), false);
});

test('countByTab: LUNAS tidak memengaruhi hitungan', () => {
  assert.deepEqual(countByTab(ROWS), { semua: 3, berhak: 1, cadangan: 2 });
});

test('cari: huruf kecil + spasi berlebih cocok nama', () => {
  assert.deepEqual(run({ query: '  siti  nur ' }), [1]);
});

test('cari: potongan no. porsi dan NIK', () => {
  assert.deepEqual(run({ query: '000103' }), [3]);
  assert.deepEqual(run({ query: '99018000' }), [1, 2, 3]);
  assert.deepEqual(run({ query: '800012' }), [2]);
});

test('cari: NIK/porsi diketik berspasi atau bertitik tetap ketemu', () => {
  assert.deepEqual(run({ query: '3175 0199 0180 0012' }), [2]);
  assert.deepEqual(run({ query: '3000.000.103' }), [3]);
});

test('tab cadangan + JKN tidak_ada → cadangan dengan JKN null/BELUM TERDAFTAR', () => {
  assert.deepEqual(run({ tab: 'cadangan', filters: { ...EMPTY_FILTERS, jkn: 'tidak_ada' } }), [2, 3]);
  assert.deepEqual(run({ tab: 'berhak', filters: { ...EMPTY_FILTERS, jkn: 'tidak_ada' } }), []);
});

test('filter provinsi + kab/kota', () => {
  assert.deepEqual(run({ filters: { ...EMPTY_FILTERS, provinsi: 'JAWA BARAT' } }), [1, 2]);
  assert.deepEqual(run({ filters: { ...EMPTY_FILTERS, provinsi: 'JAWA BARAT', kabKota: 'KAB. BOGOR' } }), [2]);
});

test('opsi provinsi & kab/kota alfabetis, kab/kota mengikuti provinsi', () => {
  assert.deepEqual(provinsiOptions(ROWS), ['BANTEN', 'JAWA BARAT']);
  assert.deepEqual(kabKotaOptions(ROWS, 'JAWA BARAT'), ['KAB. BOGOR', 'KOTA DEPOK']);
  assert.deepEqual(kabKotaOptions(ROWS, null), ['KAB. BOGOR', 'KOTA DEPOK', 'KOTA TANGERANG']);
});

test('withProvinsi mereset kab/kota yang tidak ada di provinsi baru', () => {
  const f = { provinsi: 'JAWA BARAT', kabKota: 'KOTA DEPOK', jkn: 'semua' };
  assert.deepEqual(withProvinsi(f, 'BANTEN', ROWS), { provinsi: 'BANTEN', kabKota: null, jkn: 'semua' });
  assert.deepEqual(withProvinsi(f, 'JAWA BARAT', ROWS), f);
});

test('activeFilterCount', () => {
  assert.equal(activeFilterCount(EMPTY_FILTERS), 0);
  assert.equal(activeFilterCount({ provinsi: 'BANTEN', kabKota: null, jkn: 'aktif' }), 2);
});
