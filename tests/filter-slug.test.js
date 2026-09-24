import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FILTER_MODE_LABELS,
  LANDING_FILTER_CODES,
  buildFilterSlug,
  getFilterModeFromSlug,
  filterModeLabel,
  landingCityName,
  resolveFilterSlug,
} from '../lib/filter-slug.js';
import { airportCityName } from './fixtures/journey-city.js';

// Kodek slug filter, kini JS murni supaya server.js bisa memakainya untuk meta
// & kartu OG per filter. Perilakunya WAJIB identik dengan versi TypeScript-nya
// — dijaga juga dari sisi pemanggil TS oleh tests/jadwal-filter-url.test.js yang
// sengaja TIDAK diubah saat kodek ini diangkat ke lib/.

test('bolak-balik: tiap bentuk slug kembali ke mode + nilainya', () => {
  const cases = [
    ['TIPE PAKET', 'UMROH RAMADHAN', 'umroh-ramadhan'],
    ['TIPE PAKET', 'UMROH JUMATAIN', 'umroh-jumatain'],
    ['TIPE PAKET', 'PLUS AL ULA', 'plus-al-ula'],
    ['LANDING DI', 'MED', 'landing-madinah'],
    ['LANDING DI', 'JED', 'landing-jeddah'],
    ['DATA PER-BULAN', '2026-11', 'november-2026'],
    ['DURASI PERJALANAN', '9', '9-hari'],
  ];
  for (const [mode, value, slug] of cases) {
    assert.equal(buildFilterSlug(mode, value), slug, `${mode} → slug`);
    assert.deepEqual(resolveFilterSlug(slug), { mode, secondaryValue: value }, `${slug} → filter`);
  }
});

test('mode telanjang: slug tanpa nilai', () => {
  assert.equal(buildFilterSlug('LANDING DI', ''), 'landing-di');
  assert.equal(buildFilterSlug('AVAILABLE', ''), '');
  assert.deepEqual(resolveFilterSlug('tipe-paket'), { mode: 'TIPE PAKET' });
  assert.deepEqual(resolveFilterSlug('data-per-bulan'), { mode: 'DATA PER-BULAN' });
});

test('slug lama tetap dikenali — link-nya sudah tersebar di WhatsApp', () => {
  assert.deepEqual(resolveFilterSlug('umroh-promo'), { mode: 'TIPE PAKET', secondaryValue: 'UMROH PROMO' });
  assert.deepEqual(resolveFilterSlug('bintang-5'), { mode: 'TIPE PAKET', secondaryValue: 'UMROH RAHMAH' });
});

test('GERBANG NEGATIF: slug asing tetap null, kalau tidak detail paket jadi daftar jadwal', () => {
  // src/main.tsx membaca null sebagai "ini ID paket". Pola yang melonggar akan
  // menelan /nikita/JBU1574 dan mengubah halaman detail paket jadi daftar.
  for (const asing of ['JBU1574', 'jbu1574', '', 'ngawur', 'landing-', 'hari', '0-hari-x']) {
    assert.equal(getFilterModeFromSlug(asing), null, `slug asing: "${asing}"`);
  }
});

test('paritas nama kota: peta lokal sejalan dengan journey.ts', () => {
  // Modul ini menyalin dua entri (JED/MED) saja, bukan seluruh
  // LANDING_AIRPORT_MAP — supaya lib/ tidak menyeret dependensi TS. Tes ini yang
  // menahan keduanya tidak menyimpang diam-diam.
  for (const code of LANDING_FILTER_CODES) {
    assert.equal(landingCityName(code), airportCityName(code), `kota ${code}`);
  }
});

test('label mode: "TIPE PAKET" tampil sebagai "JENIS PAKET"', () => {
  // Nilainya terikat slug /tipe-paket + LEGACY_FILTER_SLUGS, jadi yang berubah
  // cuma teks tampilannya. Ini penjaga PERILAKU — pasangannya penjaga
  // teks-sumber di tests/filter-header-tipe-paket.test.js.
  assert.equal(filterModeLabel('TIPE PAKET'), 'JENIS PAKET');
  assert.equal(FILTER_MODE_LABELS['TIPE PAKET'], 'JENIS PAKET');
  assert.equal(filterModeLabel('AVAILABLE'), 'SEAT TERSEDIA');
  // Mode tak dikenal jatuh ke teksnya sendiri, underscore jadi spasi.
  assert.equal(filterModeLabel('LIBURAN_SEKOLAH'), 'LIBURAN SEKOLAH');
  assert.equal(filterModeLabel('NGAWUR_MODE'), 'NGAWUR MODE');
});
