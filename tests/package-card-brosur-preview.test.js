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

// Brosurnya 1081x1440. Rasio kotak yang ditahan harus sama dengan rasio
// gambarnya: kalau melenceng, tingginya tetap berubah saat gambarnya mendarat —
// lompatannya cuma jadi lebih kecil.
const BROSUR_RASIO = 1081 / 1440;

/**
 * Rasio yang BENAR-BENAR dikunci sebuah kotak, dibaca dari kelasnya.
 * null = kotaknya tidak mengunci rasio apa pun, jadi tingginya ikut isi.
 *
 * Sengaja diterjemahkan jadi angka, bukan dicocokkan sebagai teks: yang diuji
 * "kotaknya menahan tinggi 3:4", bukan "kelasnya dieja aspect-[3/4]".
 * aspect-[1081/1440] ikut lolos; aspect-square dan aspect-auto tidak.
 */
function aspectRatioOf(className = '') {
  for (const cls of className.split(/\s+/)) {
    if (cls === 'aspect-square') return 1;
    if (cls === 'aspect-video') return 16 / 9;
    const arbitrer = /^aspect-\[(\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?\]$/.exec(cls);
    if (arbitrer) return Number(arbitrer[1]) / Number(arbitrer[2] ?? 1);
  }
  return null;
}

// Brosur ±300KB: ia selalu datang belakangan. Sampai ia siap, kotaknya wajib
// SUDAH setinggi gambar yang akan mengisinya — kalau tidak, panel expand yang
// sedang dianimasikan tersentak begitu gambarnya mendarat.
//
// Keadaan yang terbaca di sini memang keadaan "belum siap": harness SSR tidak
// menjalankan efek, ref, maupun onLoad, jadi gerbang kesiapannya tetap tertutup
// persis seperti frame pertama di browser. Sisi seberangnya — saat gerbang itu
// dibuka onLoad lalu gambarnya fade-in — tidak bisa diamati tanpa DOM hidup,
// jadi TIDAK ada asersi pura-pura untuknya di sini.
test('sebelum brosur siap: kotaknya sudah menahan tinggi 3:4, gambarnya belum tampak', async () => {
  const { html } = await renderPackageCard({ package: pkg, isExpanded: true });
  const $ = load(html);

  const img = $(`img[src="${pkg.brosurUrl}"]`);
  assert.equal(img.length, 1, 'brosur tidak ter-render sama sekali');

  // Induk LANGSUNG: kotak berasio di tempat lain tidak menahan slot gambar ini.
  const kotak = img.parent();
  const kelasKotak = kotak.attr('class') ?? '';
  const rasio = aspectRatioOf(kelasKotak);
  assert.notEqual(
    rasio,
    null,
    `kotak pembungkus brosur tidak mengunci rasio apa pun (class="${kelasKotak}") — ` +
    'tingginya ikut isi, jadi tata letak melompat saat gambarnya mendarat',
  );
  assert.ok(
    Math.abs(rasio - BROSUR_RASIO) < 0.02,
    `kotak menahan rasio ${rasio.toFixed(3)}, brosurnya ${BROSUR_RASIO.toFixed(3)}`,
  );

  // Kerangkanya harus terbaca "sedang memuat", bukan kotak kosong sewarna kartu.
  assert.match(kelasKotak, /(?:^|\s)animate-pulse(?:\s|$)/, 'kerangka 3:4 tidak berdenyut');

  // Gambarnya menunggu di balik kerangka, dan masuknya lewat transisi opacity.
  const kelasGambar = img.attr('class') ?? '';
  assert.match(kelasGambar, /(?:^|\s)opacity-0(?:\s|$)/, 'gambar sudah dicat sebelum siap');
  assert.doesNotMatch(
    kelasGambar,
    /(?:^|\s)opacity-100(?:\s|$)/,
    'gerbangnya terbalik: gambar justru tampak selagi belum siap',
  );
  assert.match(kelasGambar, /(?:^|\s)transition-opacity(?:\s|$)/, 'tanpa transisi, gambarnya mengedip masuk');
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
