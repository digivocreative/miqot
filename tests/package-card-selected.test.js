import test from 'node:test';
import assert from 'node:assert/strict';

import {
  loadPackageCardModule,
  motionPropsFor,
  renderPackageCard,
  samplePackage,
} from './fixtures/package-card-render.js';

/**
 * Di layar ≥1024px kartu TIDAK memuai — detailnya pindah ke rail kiri/kanan.
 * Kartu hanya ditandai "sedang dibahas".
 *
 * Yang dikunci di sini bukan warnanya, melainkan invarian yang bikin fitur ini
 * berguna: menandai kartu tidak boleh ikut membuka wilayah muai. Kalau ikut
 * terbuka, isinya dobel dengan rail dan scroll ~3.000px yang mau dihapus itu
 * kembali lagi.
 */

test('kartu terpilih memakai bingkai aktif yang sama dengan kartu terbuka', async () => {
  const { html } = await renderPackageCard({ package: samplePackage(), isSelected: true });
  assert.match(html, /border-emerald-100/);
});

test('terpilih TIDAK membuka wilayah muai — tinggi panel tetap 0', async () => {
  const { motion } = await renderPackageCard({ package: samplePackage(), isSelected: true });
  assert.equal(motionPropsFor(motion, 'data-expand-panel').animate.height, 0);
});

test('terpilih tetap menyembunyikan panel dari pembaca layar', async () => {
  const { motion } = await renderPackageCard({ package: samplePackage(), isSelected: true });
  assert.equal(motionPropsFor(motion, 'data-expand-panel')['aria-hidden'], true);
});

test('terbuka tetap membuka panel — perilaku di bawah 1024px tak berubah', async () => {
  const { motion, html } = await renderPackageCard({ package: samplePackage(), isExpanded: true });
  assert.equal(motionPropsFor(motion, 'data-expand-panel').animate.height, 'auto');
  assert.match(html, /border-emerald-100/);
});

test('tanpa terpilih dan tanpa terbuka, bingkai netral', async () => {
  const { html } = await renderPackageCard({ package: samplePackage() });
  assert.match(html, /border-gray-100/);
  assert.doesNotMatch(html, /border-emerald-100/);
});

/**
 * Comparator memo — gerbang yang paling gampang lolos tanpa terasa.
 *
 * Daftar kartu publik me-mount ratusan kartu sekaligus, jadi PackageCard
 * di-memo dengan comparator manual. Prop yang lupa didaftarkan di situ tidak
 * menimbulkan galat apa pun: komponennya hanya tidak pernah render ulang, dan
 * perubahannya tidak pernah terlihat. Render SSR tidak bisa menangkap ini —
 * memo tidak pernah jalan saat render sekali. Karena itu comparator-nya diadu
 * langsung di sini.
 */
test('comparator memo memperhitungkan isSelected', async () => {
  const { arePackageCardPropsEqual } = await loadPackageCardModule();
  const pkg = samplePackage();
  assert.equal(arePackageCardPropsEqual({ package: pkg }, { package: pkg }), true);
  assert.equal(
    arePackageCardPropsEqual({ package: pkg, isSelected: false }, { package: pkg, isSelected: true }),
    false,
    'kartu tidak akan render ulang saat dipilih — bingkainya tidak pernah muncul',
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
