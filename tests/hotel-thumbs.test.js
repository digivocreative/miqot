import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTs } from './fixtures/load-ts.js';

/**
 * Nama hotel di payload paket ditulis manusia di admin Alhijaz ("PRESTIGE EX
 * ELAF AL MASHAER", "MAYSAN AL MAQAM EX FAJAR BADEA 2"), sedangkan Direktori
 * Hotel menyimpan nama kanoniknya. Pencocokan yang terlalu longgar akan
 * memasang FOTO HOTEL YANG SALAH di kartu paket — kesalahan yang tidak
 * menimbulkan galat apa pun dan baru ketahuan dari komplain jamaah.
 *
 * Karena itu: hanya kecocokan penuh atau salah-satu-memuat-yang-lain yang
 * diterima, dan kalau ragu lebih baik tanpa foto.
 */
const { matchHotelPhoto } = await loadTs('src/lib/hotelThumbs.ts');

const DIR = [
  { name: 'Prestige ex Elaf Al Mashaer', city: 'mekkah', cover: 'https://cdn/prestige.webp', area: 'Jabal Omar' },
  { name: 'Al Ritz Al Madinah', city: 'madinah', cover: 'https://cdn/ritz.webp', area: 'Markaziyah' },
  { name: 'Anjum', city: 'mekkah', cover: 'https://cdn/anjum.webp', area: null },
  { name: 'Odst Almadinah', city: 'madinah', cover: null, area: null },
];

test('cocok penuh tanpa peduli huruf besar-kecil', () => {
  assert.equal(matchHotelPhoto('PRESTIGE EX ELAF AL MASHAER', DIR)?.cover, 'https://cdn/prestige.webp');
  assert.equal(matchHotelPhoto('al ritz al madinah', DIR)?.cover, 'https://cdn/ritz.webp');
});

test('akhiran "/ SETARAF" dari payload tidak menggagalkan pencocokan', () => {
  assert.equal(matchHotelPhoto('ANJUM / SETARAF', DIR)?.cover, 'https://cdn/anjum.webp');
});

test('nama payload yang lebih panjang tetap cocok bila memuat nama direktori', () => {
  assert.equal(matchHotelPhoto('HOTEL ANJUM MAKKAH', DIR)?.cover, 'https://cdn/anjum.webp');
});

test('hotel tak dikenal TIDAK dipasangkan foto asal-asalan', () => {
  assert.equal(matchHotelPhoto('SWISSOTEL AL MAQAM', DIR), null);
  assert.equal(matchHotelPhoto('', DIR), null);
  assert.equal(matchHotelPhoto(undefined, DIR), null);
});

/**
 * Ini yang paling berbahaya: "AL RITZ" adalah awalan dari "AL RITZ AL MADINAH",
 * tapi juga bisa hotel lain. Yang dipilih harus yang paling panjang cocoknya,
 * bukan yang pertama ditemukan di daftar.
 */
test('saat dua entri sama-sama memuat, yang paling spesifik menang', () => {
  const dir = [
    { name: 'Al Ritz', city: 'madinah', cover: 'https://cdn/generik.webp' },
    { name: 'Al Ritz Al Madinah', city: 'madinah', cover: 'https://cdn/ritz.webp' },
  ];
  assert.equal(matchHotelPhoto('AL RITZ AL MADINAH', dir)?.cover, 'https://cdn/ritz.webp');
});

test('entri direktori tanpa foto tetap dikembalikan — area & jaraknya masih berguna', () => {
  const hit = matchHotelPhoto('ODST ALMADINAH', DIR);
  assert.equal(hit?.cover, null);
  assert.equal(hit?.name, 'Odst Almadinah');
});

test('direktori kosong atau belum termuat = null, bukan lempar galat', () => {
  assert.equal(matchHotelPhoto('ANJUM', []), null);
  assert.equal(matchHotelPhoto('ANJUM', null), null);
});

/**
 * Nama sangat pendek ("EX", "AL") akan memuat-dimuat oleh hampir semua nama.
 * Ambang panjang menahan kecocokan sampah semacam itu.
 */
test('potongan nama terlalu pendek tidak dianggap cocok', () => {
  const dir = [{ name: 'Al', city: 'mekkah', cover: 'https://cdn/salah.webp' }];
  assert.equal(matchHotelPhoto('AL MASSA GRAND', dir), null);
});

/**
 * Kasus nyaris-cocok dari direktori produksi (33 hotel, diperiksa 2026-09-07).
 * "GRAND PLAZA" dan "SOFWAH ROYAL ORCHID" memang TIDAK ada di sana, sementara
 * "Pyramids Gem Plaza" dan "Royal Majestic" ada — persis umpan yang membuat
 * pencocok longgar memasang foto hotel Kairo di paket Madinah.
 */
test('nyaris-cocok dari data produksi tidak menghasilkan foto yang salah', () => {
  const dir = [
    { name: 'Pyramids Gem Plaza', city: 'kairo', cover: 'https://cdn/kairo.webp' },
    { name: 'Royal Majestic', city: 'mekkah', cover: 'https://cdn/majestic.webp' },
  ];
  assert.equal(matchHotelPhoto('GRAND PLAZA', dir), null);
  assert.equal(matchHotelPhoto('SOFWAH ROYAL ORCHID', dir), null);
  // Tapi yang memang cocok tetap harus lolos.
  assert.equal(matchHotelPhoto('ROYAL MAJESTIC', dir)?.cover, 'https://cdn/majestic.webp');
});
