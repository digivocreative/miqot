#!/usr/bin/env node
// Vendor woff2 latin subset dari Google Fonts (sekali jalan, hasil di-commit ke public/fonts/web).
// Google menyajikan VARIABLE FONT (file sama untuk semua weight) → simpan 1 file per family.
// Pakai: node scripts/download-fonts.mjs
import { mkdirSync, writeFileSync } from 'fs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const FAMILIES = [
  ['Inter', [400, 500, 600, 700]],
  ['Montserrat', [500, 600, 700, 800]],
];

mkdirSync('public/fonts/web', { recursive: true });
for (const [fam, weights] of FAMILIES) {
  const url = `https://fonts.googleapis.com/css2?family=${fam}:wght@${weights.join(';')}&display=swap`;
  const css = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();
  // Ambil URL woff2 blok latin pertama (U+0000-00FF) — file variable yang sama untuk semua weight.
  const blocks = css.split('@font-face').slice(1).filter((b) => /U\+0000-00FF/.test(b));
  const urls = new Set(blocks.map((b) => b.match(/url\((https:[^)]+\.woff2)\)/)[1]));
  if (urls.size !== 1) {
    console.error(`PERINGATAN: ${fam} punya ${urls.size} URL latin berbeda — asumsi variable font tidak berlaku lagi; periksa manual.`);
    process.exitCode = 1;
    continue;
  }
  const u = [...urls][0];
  const buf = Buffer.from(await (await fetch(u)).arrayBuffer());
  const f = `public/fonts/web/${fam.toLowerCase()}-var.woff2`;
  writeFileSync(f, buf);
  console.log(f, buf.length, 'bytes', `(weight ${weights[0]}-${weights[weights.length - 1]})`);
}
