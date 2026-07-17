import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { formatLocalPhone, generatePackageValueAgentCardPng } from '../lib/og-generator.mjs';

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

test('agent identity sheet is intentionally plain and contains only canonical identity assets', () => {
  const source = readFileSync(new URL('../lib/og-generator.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('export async function generatePackageValueAgentCardPng');
  const end = source.indexOf('/**\n * Generate a 1200x630 OG PNG for a portal-jamaah', start);
  const generator = source.slice(start, end);

  assert.ok(start > -1 && end > start);
  assert.match(generator, /fill="#FFFFFF"/);
  assert.match(generator, /normalizeAgentWebsite/);
  assert.match(generator, /logo-alhijaz-besar\.png/);
  assert.doesNotMatch(generator, /linearGradient|assetLabelChip|LEMBAR REFERENSI|SALIN ASET|<rect x=/);
  assert.doesNotMatch(generator, /const initials|Konsultan Umroh|SALIN ASET/);
});

test('agent phone is normalized to readable local groups', () => {
  assert.equal(formatLocalPhone('0822 9000 2020'), '0822-9000-2020');
  assert.equal(formatLocalPhone('+62 822-9000-2020'), '0822-9000-2020');
});
