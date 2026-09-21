#!/usr/bin/env node
// Membuat varian WebP kecil dari bendera public/flags/*.png untuk watermark PackageCard.
//
// PNG asli 600×401 (65–120 KB) dirender hanya 125×88 px dengan opacity 0.12, tapi menjadi
// elemen LCP di kunjungan pertama (audit 21 Sep 2026). PNG TETAP dipakai CompareDocument
// (react-pdf hanya bisa PNG/JPG) dan itineraryPdfBlob — jangan dihapus. Kartu memakai
// <picture> dengan <source type="image/webp"> dan <img src=png> sebagai fallback.
//
// Jalankan: node scripts/generate-flag-webp.mjs
import sharp from 'sharp';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const flagDir = join(root, 'public/flags');

// 250 px = 2× lebar render watermark (125 px) supaya tetap tajam di layar retina.
const WIDTH = 250;
const QUALITY = 80;

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

for (const file of readdirSync(flagDir).filter((f) => /\.png$/i.test(f)).sort()) {
  const source = join(flagDir, file);
  const target = join(flagDir, `${basename(file, '.png')}.webp`);
  const { size, width, height } = await sharp(source)
    .resize({ width: WIDTH, withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toFile(target);
  console.log(`${basename(target)}: ${width}×${height}, ${kb(size)}`);
}
