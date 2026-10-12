import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCuacaShareProps } from '../lib/cuaca-share-data.js';
import { loadCuacaTemplateRenderer } from './fixtures/cuaca-share-render.js';

const base = {
  key: 'makkah', name: 'Mekkah', country: 'Arab Saudi', temp: 31, feelsLike: 33, humidity: 44,
  windSpeed: 6, uvIndex: 2, uvLabel: 'Rendah', weatherCode: 0, label: 'Cerah', icon: '☀️',
  tempMin: 27, tempMax: 38,
  forecast: [
    { day: 'Sel', icon: '☁️', tempMin: 25, tempMax: 37 },
    { day: 'Rab', icon: '🌦️', tempMin: 26, tempMax: 36 },
    { day: 'Kam', icon: '🌦️', tempMin: 26, tempMax: 36 },
  ],
};
const SYNC = '2026-10-12T05:00:08Z';
const assets = { photoSrc: '/cuaca-share/makkah.jpg', logoSrc: '/logo-alhijaz-besar.svg', agentPhotoSrc: null };

test('banner renders the agreed C2 content without emoji', async () => {
  const { render } = await loadCuacaTemplateRenderer();
  const html = render(buildCuacaShareProps(base, { name: 'Bagas Pramudita', slug: 'bagas' }, { syncedAt: SYNC }), assets);
  for (const text of ['Cuaca Hari Ini', 'Update cuaca kota tujuan umroh', 'Mekkah', 'Arab Saudi', '31°', 'Cerah',
    'terasa 33° · 27–38°', '44%', '6 km/j', 'UV 2', 'Rendah', 'Sel', '25° / 37°',
    'Oktober nyaman untuk siang — mulai cocok aktivitas di luar.', 'Bagas Pramudita', 'alhijaz.co/bagas',
    'Senin, 12 Okt 2026']) {
    assert.ok(html.includes(text), `missing: ${text}`);
  }
  assert.doesNotMatch(html, /\p{Extended_Pictographic}/u);
  assert.match(html, /data-cuaca-share/);
  assert.match(html, /data-city-card="photo"/);
  assert.match(html, /src="\/cuaca-share\/makkah\.jpg"/);
  assert.match(html, />BP</, 'inisial saat agent tanpa foto');
});

test('city without photo renders the pattern panel', async () => {
  const { render } = await loadCuacaTemplateRenderer();
  const props = buildCuacaShareProps({ ...base, key: 'hainan', name: 'Hainan', country: 'China' }, { name: 'A', slug: 'a' }, { syncedAt: SYNC });
  const html = render(props, { ...assets, photoSrc: null });
  assert.match(html, /data-city-card="pattern"/);
  assert.doesNotMatch(html, /cuaca-share\/.*\.jpg/);
});

test('long name, negative temp and long condition shrink instead of overflowing', async () => {
  const { render } = await loadCuacaTemplateRenderer();
  const props = buildCuacaShareProps(
    { ...base, key: 'cappadocia', name: 'Cappadocia', country: 'Türkiye', temp: -12, feelsLike: -17, tempMin: -15, tempMax: -8, label: 'Cerah berawan', weatherCode: 2 },
    { name: 'Muhammad Abdurrahman Al-Hafidz Indonesia', slug: 'hafidz' },
    { syncedAt: '2027-01-12T05:00:00Z' },
  );
  const html = render(props, { ...assets, photoSrc: '/cuaca-share/cappadocia.jpg', agentPhotoSrc: 'https://sb.alhijaz.co/a.jpg' });
  assert.match(html, /font-size:190px[^"]*">−12°/);
  assert.match(html, /font-size:50px[^"]*">Cerah berawan/);
  assert.ok(html.includes('terasa −17° · −15° / −8°'), 'rentang negatif terbaca');
  assert.match(html, /font-size:26px[^"]*text-overflow:ellipsis[^"]*">Muhammad Abdurrahman Al-Hafidz Indonesia/);
  assert.match(html, /src="https:\/\/sb\.alhijaz\.co\/a\.jpg"/);
});
