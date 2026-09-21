#!/usr/bin/env node
// Subset Inter (public/fonts/brochure/Inter-*.woff2) menjadi berkas -latin dan -latin-ext
// mengikuti pembagian unicode-range Google Fonts (+ beberapa simbol UI di subset latin).
// Berkas penuh (109–113 KB/berat, semua skrip) tetap dipertahankan sebagai fallback @font-face
// dengan unicode-range U+0000-FFFF di index.html; peramban hanya mengunduhnya bila ada glyph
// BMP di luar subset (emoji di luar BMP tidak memicunya). Hasil di-commit (sekali jalan).
//
// Fitur OpenType yang dipakai UI (tnum/pnum untuk angka harga & kursi, kern, calt) WAJIB
// bertahan — harfbuzz mempertahankan semua fitur layout secara default, tapi skrip ini
// memverifikasinya lewat tag pada output sfnt supaya regresi ketahuan saat dijalankan.
//
// Jalankan: node scripts/subset-fonts.mjs
import subsetFont from 'subset-font';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fontDir = join(root, 'public/fonts/brochure');

const WEIGHTS = ['Regular', 'SemiBold', 'Bold', 'ExtraBold', 'Black'];

// Daftar codepoint = unicode-range Google Fonts (samakan persis dengan @font-face di index.html).
export const UNICODE_RANGES = {
  latin: [
    [0x0000, 0x00ff], [0x0131, 0x0131], [0x0152, 0x0153], [0x02bb, 0x02bc], [0x02c6, 0x02c6],
    [0x02da, 0x02da], [0x02dc, 0x02dc], [0x0304, 0x0304], [0x0308, 0x0308], [0x0329, 0x0329],
    [0x2000, 0x206f], [0x20ac, 0x20ac], [0x2122, 0x2122], [0x2191, 0x2191], [0x2193, 0x2193],
    [0x2212, 0x2212], [0x2215, 0x2215], [0xfeff, 0xfeff], [0xfffd, 0xfffd],
    // Tambahan di luar daftar Google Fonts — simbol UI yang dirender Inter (★ rating hotel,
    // ☆, ← →, ✓). Tanpa ini peramban mengunduh berkas penuh (108 KB) hanya untuk ★.
    [0x2190, 0x2190], [0x2192, 0x2192], [0x2605, 0x2606], [0x2713, 0x2713],
  ],
  'latin-ext': [
    [0x0100, 0x02ba], [0x02bd, 0x02c5], [0x02c7, 0x02cc], [0x02ce, 0x02d7], [0x02dd, 0x02ff],
    [0x0304, 0x0304], [0x0308, 0x0308], [0x0329, 0x0329], [0x1d00, 0x1dbf], [0x1e00, 0x1e9f],
    [0x1ef2, 0x1eff], [0x2020, 0x2020], [0x20a0, 0x20ab], [0x20ad, 0x20c0], [0x2113, 0x2113],
    [0x2c60, 0x2c7f], [0xa720, 0xa7ff],
  ],
};

// Fitur yang wajib tetap ada di subset (dipakai kelas Tailwind tabular-nums dst.).
// tnum/pnum/calt hanya punya lookup untuk angka & Latin dasar (U+0030-0039 dst.) — subset
// latin-ext tidak memuat glyph itu sehingga harfbuzz sah membuang fiturnya; angka selalu
// dirender dari berkas -latin. Untuk latin-ext cukup kern yang wajib bertahan.
const REQUIRED_FEATURES = {
  latin: ['tnum', 'pnum', 'kern', 'calt'],
  'latin-ext': ['kern'],
};

function rangesToText(ranges) {
  let text = '';
  for (const [from, to] of ranges) {
    for (let cp = from; cp <= to; cp += 1) {
      // Karakter kontrol C0/C1 tidak punya glyph; lewati agar harfbuzz tidak menyisipkan .notdef ekstra.
      if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) continue;
      text += String.fromCodePoint(cp);
    }
  }
  return text;
}

function missingFeatures(sfntBuffer, subset) {
  return REQUIRED_FEATURES[subset].filter((tag) => !sfntBuffer.includes(Buffer.from(tag, 'ascii')));
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

let failed = false;
for (const weight of WEIGHTS) {
  const source = readFileSync(join(fontDir, `Inter-${weight}.woff2`));
  for (const [subset, ranges] of Object.entries(UNICODE_RANGES)) {
    const text = rangesToText(ranges);
    const woff2 = await subsetFont(source, text, { targetFormat: 'woff2' });
    // Verifikasi tag fitur pada bentuk sfnt (woff2 terkompresi, tag tidak terbaca mentah).
    const sfnt = await subsetFont(source, text, { targetFormat: 'sfnt' });
    const missing = missingFeatures(sfnt, subset);
    const outName = `Inter-${weight}-${subset}.woff2`;
    if (missing.length > 0) {
      failed = true;
      console.error(`GAGAL ${outName}: fitur hilang ${missing.join(',')} — berkas TIDAK ditulis`);
      continue;
    }
    writeFileSync(join(fontDir, outName), woff2);
    console.log(`${outName}: ${kb(woff2.length)} (penuh ${kb(source.length)}), fitur ${REQUIRED_FEATURES[subset].join('/')} OK`);
  }
}

if (failed) process.exitCode = 1;
