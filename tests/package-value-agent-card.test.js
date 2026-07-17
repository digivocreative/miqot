import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { generatePackageValueAgentCardPng } from '../lib/og-generator.mjs';

test('agent identity sheet is a 1200x630 PNG and supports a photo fallback', async () => {
  const png = await generatePackageValueAgentCardPng({
    name: 'Nikita Sari',
    phone: '62822900020',
    photoBuffer: null,
    website: 'alhijaz.co/nikita',
  });
  const metadata = await sharp(png).metadata();

  assert.equal(metadata.format, 'png');
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 630);
  assert.ok(png.length > 10_000);
});

test('agent identity sheet survives extreme inputs without throwing', async () => {
  const cases = [
    // Nama sangat panjang → dipecah 2 baris / ellipsis, bukan overflow.
    { name: 'Prof. Dr. Hj. Siti Nurhaliza Ramadhani Al-Munawwarah', phone: '62811223344556677', photoBuffer: null, website: 'www.contohwebsitesangatpanjangsekali.co.id' },
    // Foto korup → jatuh ke monogram, bukan error 500.
    { name: 'Agent Foto Rusak', phone: '62822', photoBuffer: Buffer.from('bukan-gambar'), website: '' },
    // Tanpa data sama sekali.
    { name: '', phone: '', photoBuffer: null, website: undefined },
  ];
  for (const input of cases) {
    const png = await generatePackageValueAgentCardPng(input);
    const metadata = await sharp(png).metadata();
    assert.equal(metadata.width, 1200);
    assert.equal(metadata.height, 630);
  }
});

test('agent identity sheet uses labeled asset blocks so the image model extracts identity accurately', () => {
  const source = readFileSync(new URL('../lib/og-generator.mjs', import.meta.url), 'utf8');

  assert.match(source, /LEMBAR REFERENSI IDENTITAS AGENT/);
  assert.match(source, /Lampiran untuk AI — bukan template banner/);
  // Chip aset bernomor 01-06 sebagai checklist untuk model image-gen.
  assert.match(source, /01 · FOTO/);
  assert.match(source, /02 · NAMA/);
  assert.match(source, /03 · PERAN/);
  assert.match(source, /04 · WHATSAPP/);
  assert.match(source, /05 · WEBSITE/);
  assert.match(source, /06 · LOGO/);
  // Info relevan baru: peran resmi + website; caption foto anti-halusinasi wajah.
  assert.match(source, /Konsultan Umroh &amp; Haji — Alhijaz Indowisata/);
  assert.match(source, /normalizeAgentWebsite/);
  assert.match(source, /Gunakan wajah ini apa adanya/);
  assert.match(source, /Tanpa foto — jangan buat wajah/);
  assert.match(source, /SALIN ASET APA ADANYA/);
  assert.match(source, /logo-alhijaz-besar\.png/);
});
