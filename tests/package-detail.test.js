import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTs } from './fixtures/load-ts.js';

/**
 * Empat helper ini dulu terkurung di dalam PackageCard.tsx (2.719 baris) dan
 * hanya bisa diuji lewat render. Rail desktop butuh perhitungan yang PERSIS
 * sama dengan kartu — kalau keduanya menghitung sendiri-sendiri, hotel plus bisa
 * muncul di kartu tapi hilang di rail tanpa ada yang menyadarinya.
 *
 * Yang paling berharga dikunci di sini adalah fallback antar-tier: kota
 * transit/plus (Cairo, Dubai, Istanbul) bersifat itinerary-wide, BUKAN per-tier,
 * tapi upstream kadang hanya mengisinya di salah satu tier.
 */
const { tiersOf, extraHotelsOf, hotelStarsOf, hotelDistanceOf, formatHargaCell } =
  await loadTs('src/lib/packageDetail.ts');

test('tier "Hemat" selalu di depan, sisanya mempertahankan urutan asli', () => {
  assert.deepEqual(tiersOf({ UHUD: {}, HEMAT: {}, RAHMAH: {} }), ['HEMAT', 'UHUD', 'RAHMAH']);
  assert.deepEqual(tiersOf({ RAHMAH: {}, UHUD: {} }), ['RAHMAH', 'UHUD']);
});

test('pencocokan "hemat" tidak peka huruf besar maupun spasi pinggir', () => {
  assert.deepEqual(tiersOf({ UHUD: {}, ' hemat ': {} }), [' hemat ', 'UHUD']);
});

test('harga kosong = tidak ada tier, bukan lempar galat', () => {
  assert.deepEqual(tiersOf({}), []);
  assert.deepEqual(tiersOf(null), []);
});

test('hotel kota plus diambil dari tier aktif', () => {
  const tierAktif = { cairo_hotel: 'STEIGENBERGER', cairo_bintang: '5' };
  assert.deepEqual(
    extraHotelsOf(tierAktif, { UHUD: tierAktif }),
    [{ city: 'Cairo', name: 'STEIGENBERGER', star: '5' }],
  );
});

test('kota plus kosong di tier aktif diambil dari tier lain — kota transit bukan per-tier', () => {
  const tierAktif = {};
  const semua = { HEMAT: tierAktif, UHUD: { dubai_hotel: 'ROVE', dubai_bintang: '4' } };
  assert.deepEqual(extraHotelsOf(tierAktif, semua), [{ city: 'Dubai', name: 'ROVE', star: '4' }]);
});

test('tier aktif menang atas tier lain saat keduanya punya isi', () => {
  const tierAktif = { dubai_hotel: 'HILTON', dubai_bintang: '5' };
  const semua = { HEMAT: tierAktif, UHUD: { dubai_hotel: 'ROVE', dubai_bintang: '4' } };
  assert.equal(extraHotelsOf(tierAktif, semua)[0].name, 'HILTON');
});

test('bintang yang hilang jadi "0", bukan undefined', () => {
  const tierAktif = { dubai_hotel: 'ROVE' };
  assert.equal(extraHotelsOf(tierAktif, { HEMAT: tierAktif })[0].star, '0');
});

test('urutan kota mengikuti daftar tetap, bukan urutan kunci payload', () => {
  const tierAktif = { cairo_hotel: 'A', dubai_hotel: 'B', istanbul_hotel: 'C' };
  assert.deepEqual(
    extraHotelsOf(tierAktif, { HEMAT: tierAktif }).map((h) => h.city),
    ['Istanbul', 'Cairo', 'Dubai'],
  );
});

test('hotelInfo kosong = tidak ada kota plus, bukan lempar galat', () => {
  assert.deepEqual(extraHotelsOf(null, {}), []);
  assert.deepEqual(extraHotelsOf(undefined, undefined), []);
});

test('bintang dari payload menang; "0" dianggap kosong lalu jatuh ke metadata', () => {
  assert.equal(hotelStarsOf('ANJUM', '4'), '4');
  assert.equal(hotelStarsOf('ANJUM', '0'), '5');
  assert.equal(hotelStarsOf('ANJUM', ''), '5');
});

test('jarak dari payload menang; kosong jatuh ke metadata', () => {
  assert.equal(hotelDistanceOf('ANJUM', '±99m'), '±99m');
  assert.equal(hotelDistanceOf('ANJUM', ''), '±450m');
});

test('hotel tak dikenal tidak mengarang bintang atau jarak', () => {
  assert.equal(hotelStarsOf('HOTEL YANG TIDAK ADA', ''), '');
  assert.equal(hotelDistanceOf('HOTEL YANG TIDAK ADA', ''), '');
});

test('sel harga: "-" polos tanpa "Rp" saat harga tidak ada', () => {
  assert.equal(formatHargaCell(undefined), '-');
  assert.equal(formatHargaCell(''), '-');
  assert.equal(formatHargaCell('bukan angka'), '-');
});

test('sel harga memakai pemisah ribuan Indonesia', () => {
  assert.equal(formatHargaCell('33900000'), 'Rp 33.900.000');
});
