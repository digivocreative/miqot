import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { generateFlightShareOgPng } from '../lib/og-generator.mjs';

const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

const sampleFlight = {
  flightNumber: 'EK 357',
  flightDate: '2026-07-12',
  depIata: 'CGK',
  arrIata: 'DXB',
  depCity: 'Jakarta',
  arrCity: 'Dubai',
  depTime: '17:40',
  arrTime: '22:30',
  duration: '7 jam 50 menit',
  airlineName: 'Emirates',
  groupNumber: '15',
  pax: 47,
  tourLeader: 'WIDI PURWANTI',
  agentName: 'Nila Novita',
};

test('flight share OG generator returns a social-preview PNG at 1200x630', async () => {
  const png = await generateFlightShareOgPng(sampleFlight);
  const metadata = await sharp(png).metadata();

  assert.equal(metadata.format, 'png');
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 630);
  assert.equal(metadata.hasAlpha, false);
  assert.ok(png.length > 20_000);
});

test('flight share OG generator supports a personalized agent photo', async () => {
  const agentPhotoBuffer = readFileSync(new URL('../public/agents/nila.jpg', import.meta.url));
  const png = await generateFlightShareOgPng({ ...sampleFlight, agentPhotoBuffer });
  const metadata = await sharp(png).metadata();

  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 630);
  assert.ok(png.length > 30_000);
});

test('server exposes a cached flight-specific OG endpoint before static fallback', () => {
  const routeIndex = server.indexOf("app.get('/og/flight/:code.png'");
  const staticIndex = server.indexOf('app.use(express.static(distPath');

  assert.notEqual(routeIndex, -1);
  assert.ok(routeIndex < staticIndex);
  assert.match(server, /generateFlightShareOgPng\(\{/);
  assert.match(server, /'Content-Type': 'image\/png'/);
  assert.match(server, /max-age=3600, stale-while-revalidate=86400/);
});

test('flight page injects a versioned large-image preview and accessible metadata', () => {
  const handler = server.slice(
    server.indexOf("app.get('/f/:code'"),
    server.indexOf('// SPA fallback — inject OG tags'),
  );

  assert.match(handler, /\/og\/flight\/\$\{encodeURIComponent\(code\)\}\.png\?v=\$\{imageVersion\}/);
  assert.match(handler, /crypto\.createHash\('sha1'\)/);
  assert.match(handler, /<link rel="canonical" href="\$\{canonicalUrl\}" \/>/);
  assert.match(handler, /og:image:type" content="image\/png"/);
  assert.match(handler, /og:image:alt" content="\$\{imageAlt\}"/);
  assert.match(handler, /twitter:card" content="summary_large_image"/);
  assert.match(handler, /twitter:image:alt" content="\$\{imageAlt\}"/);
  assert.doesNotMatch(handler, /\/og\/\$\{agentSlug\}\.png/);
});
