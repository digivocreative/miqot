// Sekali jalan: foto destinasi Bunny (foto rombongan + badge logo di atas-tengah)
// → public/cuaca-share/{city}.jpg untuk kartu banner Share Cuaca (952×400, ±2,38:1).
// Jalankan: node scripts/prepare-cuaca-photos.mjs   (hasilnya di-commit)
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { DESTINASI_PHOTO_BASE } from '../lib/itinerary-destinasi.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'public/cuaca-share');
const SOURCES = {
  makkah: 'masjidil-haram',
  madinah: 'masjid-nabawi',
  istanbul: 'blue-mosque',
  cappadocia: 'balon-udara-cappadocia',
  dubai: 'burj-khalifa',
};
const WIDTH = 1344;      // lebar asli foto destinasi
const BADGE_CUT = 118;   // tinggi pita badge logo di atas (pada lebar 1344)
const OUT_H = 565;       // 1344 / 2,38

mkdirSync(OUT_DIR, { recursive: true });
for (const [city, file] of Object.entries(SOURCES)) {
  const res = await fetch(`${DESTINASI_PHOTO_BASE}/${file}.png`);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  const resized = await sharp(Buffer.from(await res.arrayBuffer())).resize({ width: WIDTH }).toBuffer();
  const out = resolve(OUT_DIR, `${city}.jpg`);
  const info = await sharp(resized)
    .extract({ left: 0, top: BADGE_CUT, width: WIDTH, height: OUT_H })
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(out);
  console.log(`${city}.jpg ${info.width}×${info.height} ${(info.size / 1024).toFixed(0)} KB`);
}
