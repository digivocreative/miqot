import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { generateFilterOgPng } from '../lib/og-generator.mjs';

// Kartu share per URL filter jadwal — kartu ke-6 di lib/og-generator.mjs.

test('kartu filter: PNG 1200x630 yang sah', async () => {
  const png = await generateFilterOgPng({
    eyebrow: 'JENIS PAKET',
    headline: 'Umroh Ramadhan',
    agentName: 'Nikita Sari',
    agentPhotoBuffer: null,
  });
  assert.ok(Buffer.isBuffer(png));
  const meta = await sharp(png).metadata();
  assert.equal(meta.format, 'png');
  assert.equal(meta.width, 1200);
  assert.equal(meta.height, 630);
});

test('emoji di nama agent TIDAK mematikan proses', async () => {
  // Pango gagal FATAL kalau glyph emoji sampai ke <text> — bukan exception JS,
  // jadi tidak ada try/catch upstream yang bisa menyelamatkan server Express.
  // Satu ❤️ di nama agent dulu cukup untuk menjatuhkan seluruh server.
  const png = await generateFilterOgPng({
    eyebrow: 'KOTA LANDING',
    headline: 'Madinah',
    agentName: 'Nikita ❤️ Sari 🕋',
    agentPhotoBuffer: null,
  });
  const meta = await sharp(png).metadata();
  assert.equal(meta.width, 1200);
});

test('emoji di headline juga aman', async () => {
  const png = await generateFilterOgPng({
    eyebrow: 'JENIS PAKET',
    headline: 'Umroh 🕋 Ramadhan',
    agentName: '',
    agentPhotoBuffer: null,
  });
  const meta = await sharp(png).metadata();
  assert.equal(meta.height, 630);
});

test('headline panjang tetap terbentuk (turun ukuran, bukan meledak)', async () => {
  const png = await generateFilterOgPng({
    eyebrow: 'JENIS PAKET',
    headline: 'Umroh Plus Turki Dan Dubai Sekalian Al Ula Panjang Sekali',
    agentName: '',
    agentPhotoBuffer: null,
  });
  const meta = await sharp(png).metadata();
  assert.equal(meta.width, 1200);
  assert.equal(meta.height, 630);
});

test('tanpa agent: kartu tetap terbentuk (footer jatuh ke nama perusahaan)', async () => {
  const png = await generateFilterOgPng({
    eyebrow: 'KEBERANGKATAN',
    headline: 'November 2026',
    agentName: '',
    agentPhotoBuffer: null,
  });
  assert.ok(png.length > 1000);
  const meta = await sharp(png).metadata();
  assert.equal(meta.width, 1200);
});

test('masukan kosong tidak melempar — jatuh ke teks cadangan', async () => {
  const png = await generateFilterOgPng({});
  const meta = await sharp(png).metadata();
  assert.equal(meta.width, 1200);
});
