import test from 'node:test';
import assert from 'node:assert/strict';

import {
  loadPackageCardModule,
  motionPropsFor,
  renderPackageCard,
  samplePackage,
} from './fixtures/package-card-render.js';

/**
 * Di layar ≥1024px kartu TETAP memuai — kalau tidak, seluruh tombol aksinya
 * (Kirim WhatsApp, Screenshot & Simpan, Tanya AI, Salin link, baris agent)
 * ikut terkunci di dalam panel yang tak pernah terbuka, dan agent kehilangan
 * justru ujung percakapannya.
 *
 * Yang disembunyikan HANYA dua blok yang benar-benar pindah: perjalanan (rail
 * kiri memuat itinerary lengkap) dan hotel plus (rail kanan memuat semua hotel
 * berikut fotonya). Rincian biaya, brosur, dan suhu tetap tinggal di kartu.
 */

test('railMode menandai kartu supaya blok yang pindah ke rail tersembunyi', async () => {
  const { html } = await renderPackageCard({ package: samplePackage(), railMode: true });
  assert.match(html, /jadwal-rail-mode/);
});

test('tanpa railMode tidak ada penanda — perilaku di bawah 1024px utuh', async () => {
  const { html } = await renderPackageCard({ package: samplePackage() });
  assert.doesNotMatch(html, /jadwal-rail-mode/);
});

test('railMode TIDAK menghalangi kartu memuai — tombol harus tetap terjangkau', async () => {
  const { motion } = await renderPackageCard({
    package: samplePackage(),
    railMode: true,
    isExpanded: true,
  });
  assert.equal(motionPropsFor(motion, 'data-expand-panel').animate.height, 'auto');
});

/**
 * Penanda dipasang per blok, bukan satu pembungkus besar: baris tombol duduk di
 * antara blok-blok itu, jadi menyembunyikan satu wilayah utuh ikut menelan
 * tombolnya — persis masalah yang sedang dihindari.
 */
test('blok perjalanan bertanda — rail kiri sudah memuat itinerary lengkap', async () => {
  const { html } = await renderPackageCard({ package: samplePackage(), isExpanded: true });
  assert.match(html, /data-rail-hidden="perjalanan"/);
});

/**
 * Ini yang paling gampang salah arah: rincian biaya, brosur, dan suhu SENGAJA
 * tinggal di kartu. Kalau ikut tertandai, ketiganya lenyap dari layar lebar
 * tanpa ada penggantinya di rail mana pun.
 */
test('suhu TIDAK bertanda — sengaja tetap di kartu', async () => {
  const { html } = await renderPackageCard({ package: samplePackage(), isExpanded: true });
  assert.doesNotMatch(
    html,
    /data-temp-section[^>]*data-rail-hidden|data-rail-hidden[^>]*data-temp-section/,
    'suhu tidak pindah ke rail mana pun — menandainya membuatnya hilang begitu saja',
  );
});

test('yang bertanda tidak lebih dari dua blok', async () => {
  const { html } = await renderPackageCard({ package: samplePackage(), isExpanded: true });
  const marked = html.match(/data-rail-hidden=/g) ?? [];
  assert.ok(
    marked.length <= 2,
    `${marked.length} blok bertanda — hanya perjalanan dan hotel plus yang pindah ke rail`,
  );
});

test('bingkai aktif tetap murni dari isExpanded', async () => {
  const { html: aktif } = await renderPackageCard({ package: samplePackage(), isExpanded: true });
  assert.match(aktif, /border-emerald-100/);
  const { html: diam } = await renderPackageCard({ package: samplePackage() });
  assert.match(diam, /border-gray-100/);
  assert.doesNotMatch(diam, /border-emerald-100/);
});

/**
 * Comparator memo — gerbang yang paling gampang lolos tanpa terasa.
 *
 * Daftar kartu publik me-mount ratusan kartu sekaligus, jadi PackageCard di-memo
 * dengan comparator manual. Prop yang lupa didaftarkan di situ tidak menimbulkan
 * galat apa pun: komponennya hanya tidak pernah render ulang. Render SSR tidak
 * bisa menangkapnya — memo tidak pernah jalan saat render sekali.
 */
test('comparator memo memperhitungkan railMode', async () => {
  const { arePackageCardPropsEqual } = await loadPackageCardModule();
  const pkg = samplePackage();
  assert.equal(arePackageCardPropsEqual({ package: pkg }, { package: pkg }), true);
  assert.equal(
    arePackageCardPropsEqual({ package: pkg, railMode: false }, { package: pkg, railMode: true }),
    false,
    'kartu tidak render ulang saat masuk/keluar mode rail — blok yang pindah tetap tampil dobel',
  );
});

test('comparator memo tetap memperhitungkan isExpanded', async () => {
  const { arePackageCardPropsEqual } = await loadPackageCardModule();
  const pkg = samplePackage();
  assert.equal(
    arePackageCardPropsEqual({ package: pkg, isExpanded: false }, { package: pkg, isExpanded: true }),
    false,
  );
});
