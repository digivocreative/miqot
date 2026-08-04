import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from 'cheerio';

import { renderPackageCard, samplePackage } from './fixtures/package-card-render.js';

const source = readFileSync(new URL('../src/components/PackageCard.tsx', import.meta.url), 'utf8');

const pkg = samplePackage();
const brosurImg = ($) => $(`img[src="${pkg.brosurUrl}"]`).length;

// Brosur ±300KB/gambar. Preview di kartu list hanya boleh ter-mount setelah
// kartu pernah dibuka — kalau gate ini hilang, SEMUA kartu di list langsung
// mengunduh brosurnya masing-masing saat halaman dimuat.
test('brosur preview mounts lazily: single view langsung, kartu list setelah pernah dibuka', async () => {
  const tertutup = await renderPackageCard({ package: pkg, isExpanded: false, isSingleView: false });
  assert.equal(brosurImg(load(tertutup.html)), 0, 'kartu list yang tertutup belum boleh memuat brosur');

  const terbuka = await renderPackageCard({ package: pkg, isExpanded: true, isSingleView: false });
  assert.equal(brosurImg(load(terbuka.html)), 1, 'kartu list yang terbuka memuat brosurnya');

  const single = await renderPackageCard({ package: pkg, isExpanded: false, isSingleView: true });
  assert.equal(brosurImg(load(single.html)), 1, 'single view memuat brosur tanpa menunggu dibuka');
});

// Render harness ini tidak menjalankan useEffect, jadi lolosnya kasus "terbuka"
// di atas sekaligus membuktikan mount-nya render-phase: kalau gate-nya pindah ke
// useEffect, framer-motion mengukur tinggi target tanpa brosur lalu panelnya
// melompat +574px di frame terakhir animasi expand.

test('skeleton 3:4 menahan tinggi sampai gambar siap, lalu fade-in', () => {
  assert.match(source, /brosurLoaded \? undefined : 'aspect-\[3\/4\] [^']*animate-pulse'/);
  assert.match(source, /\$\{brosurLoaded \? 'opacity-100' : 'opacity-0'\}/);
  assert.match(source, /onLoad=\{\(\) => setBrosurLoaded\(true\)\}/);
  // Gambar dari cache bisa complete sebelum onLoad terpasang.
  assert.match(source, /el\?\.complete && el\.naturalWidth > 0/);
});

// Dulu brosur hanya dikecualikan selama belum termuat; sekarang penandanya
// permanen — brosur punya tombol "Brosur" + Download sendiri, jadi hasil
// "Simpan" tidak perlu ikut memuatnya sama sekali.
test('brosur tidak pernah ikut ke-export screenshot kartu', async () => {
  const { html } = await renderPackageCard({ package: pkg, isExpanded: true });
  const $ = load(html);
  assert.equal(brosurImg($), 1, 'brosur tampil di kartu yang hidup');

  // Selektor yang sama dipakai jalur ekspor: clone.querySelectorAll(...).remove()
  // lalu diulang sebagai `exclude` snapdom.
  assert.match(source, /\[data-screenshot-ignore\]/, 'jalur ekspor masih membuang elemen bertanda ini');
  $('[data-screenshot-ignore]').remove();

  assert.equal(brosurImg($), 0, 'brosur ikut terbuang dari hasil ekspor');
});
