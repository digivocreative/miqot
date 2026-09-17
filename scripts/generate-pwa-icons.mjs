#!/usr/bin/env node
// Membuat ikon PWA "maskable" dari public/icon-512x512.png.
//
// Ikon asli memenuhi kanvas: logo AIW melebar sampai ±92% sisi, sehingga launcher
// Android bermasker bulat memotong ujung "A" dan "W" (zona aman maskable = lingkaran
// berdiameter 80%). Skrip ini mengambil logo putih dari ikon asli (latar merah →
// transparan), menggambar ulang gradien latarnya, lalu menaruh logo ±62% lebar kanvas
// di tengah — seluruh logo berada di dalam zona aman.
//
// Jalankan: node scripts/generate-pwa-icons.mjs
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'public/icon-512x512.png');
const SIZE = 512;
const LOGO_WIDTH_RATIO = 0.62;

const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;

const pixel = (x, y) => {
  const i = (y * width + x) * channels;
  return [data[i], data[i + 1], data[i + 2]];
};
const hex = ([r, g, b]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
// Baris atas tidak tersentuh logo: warna ujung kiri & kanan gradien.
const left = hex(pixel(4, 12));
const right = hex(pixel(width - 5, 12));

// Logo = piksel putih. Kanal terkecil tinggi hanya pada putih; tepi antialias → alpha parsial.
const mask = Buffer.alloc(width * height);
let minX = width, minY = height, maxX = 0, maxY = 0;
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const [r, g, b] = pixel(x, y);
    const alpha = Math.max(0, Math.min(255, Math.round(((Math.min(r, g, b) - 70) / (255 - 70)) * 255)));
    mask[y * width + x] = alpha;
    if (alpha > 24) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}

const cropW = maxX - minX + 1;
const cropH = maxY - minY + 1;
const white = Buffer.alloc(width * height * 4, 255);
for (let i = 0; i < width * height; i += 1) white[i * 4 + 3] = mask[i];
const logo = await sharp(white, { raw: { width, height, channels: 4 } })
  .extract({ left: minX, top: minY, width: cropW, height: cropH })
  .resize({ width: Math.round(SIZE * LOGO_WIDTH_RATIO) })
  .png()
  .toBuffer();
const logoMeta = await sharp(logo).metadata();

const background = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">` +
  `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${left}"/><stop offset="1" stop-color="${right}"/></linearGradient></defs>` +
  `<rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/></svg>`,
);

const maskable = await sharp(background)
  .composite([{
    input: logo,
    left: Math.round((SIZE - logoMeta.width) / 2),
    top: Math.round((SIZE - logoMeta.height) / 2),
  }])
  .png({ compressionLevel: 9 })
  .toBuffer();

await sharp(maskable).toFile(join(root, 'public/icon-maskable-512x512.png'));
await sharp(maskable).resize(192, 192).png({ compressionLevel: 9 }).toFile(join(root, 'public/icon-maskable-192x192.png'));
console.log(`maskable icons written (gradient ${left} → ${right}, logo ${logoMeta.width}x${logoMeta.height})`);
