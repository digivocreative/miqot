// Pratinjau kartu OG itinerary tanpa server. Bukan bagian pipeline produksi.
// Jalankan: node scripts/preview-itinerary-og.mjs <folder-keluaran>
import fs from 'fs';
import path from 'path';
import { generateItineraryOgPng } from '../lib/og-generator.mjs';

const outDir = process.argv[2] || '.';
fs.mkdirSync(outDir, { recursive: true });

const base = {
  paketName: 'UMROH AKHIR RAMADHAN 1447',
  departDate: '2027-03-12',
  airline: 'SAUDIA',
  dayCount: 9,
  segments: [{ key: 'madinah', nights: 3 }, { key: 'mekkah', nights: 4 }],
  agentName: 'Bagas Pramudita',
};

const cases = {
  'judul-1-baris': base,
  'judul-2-baris': { ...base, paketName: 'UMROH PLUS TURKI ISTANBUL BURSA CAPPADOCIA 15 HARI BY TURKISH AIRLINES' },
  'lima-segmen': {
    ...base,
    dayCount: 16,
    segments: [
      { key: 'madinah', nights: 3 }, { key: 'mekkah', nights: 4 }, { key: 'dubai', nights: 2 },
      { key: 'turki', nights: 3 }, { key: 'mesir', nights: 2 },
    ],
  },
  'tanpa-segmen': { ...base, segments: null },
  'nama-beremoji': { ...base, agentName: 'Bagas 🌙 Pramudita', paketName: 'UMROH ✨ HEMAT' },
};

for (const [name, input] of Object.entries(cases)) {
  const png = await generateItineraryOgPng(input);
  const file = path.join(outDir, `itin-og-${name}.png`);
  fs.writeFileSync(file, png);
  console.log(`${file} — ${(png.length / 1024).toFixed(0)} KB`);
}
