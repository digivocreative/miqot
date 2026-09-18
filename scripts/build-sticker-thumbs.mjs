// Bangun thumbnail picker sticker dari PNG asli di Bunny.
//
// Sticker asli 1254×1254 PNG, ±440 KB per keping — galeri 21 keping = ±9,5 MB
// di kuota HP agent. Bunny Image Optimizer TIDAK aktif di pull zone ini
// (?width=, ?format=webp, ?class= ketiganya dikembalikan utuh sebagai PNG
// 448 KB, diuji 2026-09-18), jadi turunannya dibuat di sini dan di-commit.
// WebP 256px ≈ 30 KB/keping → ±630 KB untuk seluruh galeri.
//
// Aman terhadap precache: PRECACHE_GLOB_PATTERNS (src/lib/pwa/buildConfig.js)
// hanya menyapu assets/**, index.html, offline.html, ikon, dan font brosur.
// Berkas public/ mendarat di AKAR dist/, jadi img-sticker/ tidak ikut precache
// — sama seperti public/img-brosur/ yang isinya cover 1 MB-an.
//
// Jalankan ulang tiap menambah sticker:
//   node scripts/build-sticker-thumbs.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { STICKERS, stickerFullUrl } from '../src/lib/stickerCatalog.js';

const THUMB_PX = 256;
const outDir = fileURLToPath(new URL('../public/img-sticker/', import.meta.url));

await mkdir(outDir, { recursive: true });

let total = 0;
for (const sticker of STICKERS) {
  const url = stickerFullUrl(sticker.id);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${sticker.id}: HTTP ${response.status} dari ${url}`);
  const source = Buffer.from(await response.arrayBuffer());

  const webp = await sharp(source)
    .resize(THUMB_PX, THUMB_PX, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 90, effort: 6 })
    .toBuffer();

  await writeFile(`${outDir}${sticker.id}.webp`, webp);
  total += webp.length;
  console.log(`${sticker.id.padEnd(20)} ${(webp.length / 1024).toFixed(0)} KB`);
}

console.log(`\n${STICKERS.length} thumbnail, total ${(total / 1024).toFixed(0)} KB`);
