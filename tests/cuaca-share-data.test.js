import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  agentNameFontSize,
  buildCuacaCaption,
  buildCuacaShareProps,
  cityLocalDate,
  conditionFontSize,
  formatDeg,
  resolveCuacaShareCity,
  tempFontSize,
  uvLabelFull,
  weatherIconKey,
} from '../lib/cuaca-share-data.js';

const makkah = {
  key: 'makkah', name: 'Mekkah', country: 'Arab Saudi', flag: '🇸🇦',
  temp: 31, feelsLike: 33, humidity: 44, windSpeed: 6, uvIndex: 2, uvLabel: 'Rendah',
  weatherCode: 0, label: 'Cerah', icon: '☀️', tempMin: 27, tempMax: 38,
  forecast: [
    { day: 'Sel', icon: '☁️', tempMin: 25, tempMax: 37 },
    { day: 'Rab', icon: '🌦️', weatherCode: 53, tempMin: 26, tempMax: 36 },
    { day: 'Kam', icon: '🌦', tempMin: 26, tempMax: 36 },
  ],
};
const hainan = { ...makkah, key: 'hainan', name: 'Hainan', country: 'China', uvIndex: 8, uvLabel: 'Sgt Tinggi', weatherCode: 51, label: 'Gerimis', icon: '🌦️' };
const agent = { name: 'Bagas Pramudita', slug: 'bagas' };
const SYNC = '2026-10-12T05:00:08.523+00:00';

test('weather icon prefers the WMO code and falls back to legacy emoji', () => {
  assert.equal(weatherIconKey({ weatherCode: 0 }), 'sun');
  assert.equal(weatherIconKey({ weatherCode: 2 }), 'cloud-sun');
  assert.equal(weatherIconKey({ weatherCode: 3 }), 'cloud');
  assert.equal(weatherIconKey({ weatherCode: 45 }), 'cloud-fog');
  assert.equal(weatherIconKey({ weatherCode: 53 }), 'cloud-drizzle');
  assert.equal(weatherIconKey({ weatherCode: 63 }), 'cloud-rain');
  assert.equal(weatherIconKey({ weatherCode: 75 }), 'snowflake');
  assert.equal(weatherIconKey({ weatherCode: 81 }), 'cloud-rain');
  assert.equal(weatherIconKey({ weatherCode: 95 }), 'cloud-lightning');
  assert.equal(weatherIconKey({ icon: '☁️' }), 'cloud');
  assert.equal(weatherIconKey({ icon: '🌦' }), 'cloud-drizzle', 'emoji tanpa VS16');
  assert.equal(weatherIconKey({ icon: '⛈️' }), 'cloud-lightning');
  assert.equal(weatherIconKey({ weatherCode: null, icon: '🌡️' }), 'thermometer');
  assert.equal(weatherIconKey({}), 'thermometer');
});

test('labels, temperatures and font steps', () => {
  assert.equal(uvLabelFull('Sgt Tinggi'), 'Sangat Tinggi');
  assert.equal(uvLabelFull('Rendah'), 'Rendah');
  assert.equal(formatDeg(31), '31°');
  assert.equal(formatDeg(-12), '−12°');
  assert.equal(tempFontSize(31), 230);
  assert.equal(tempFontSize(-3), 230);
  assert.equal(tempFontSize(-12), 190);
  assert.equal(conditionFontSize('Cerah'), 60);
  assert.equal(conditionFontSize('Cerah berawan'), 50);
  assert.equal(agentNameFontSize('Bagas Pramudita'), 34);
  assert.equal(agentNameFontSize('Muhammad Abdurrahman Hafidz'), 30);
  assert.equal(agentNameFontSize('Muhammad Abdurrahman Al-Hafidz Indonesia'), 26);
});

test('date label follows the city timezone, not WIB', () => {
  // 23:30 WIB 12 Okt = 19:30 Mekkah 12 Okt
  assert.deepEqual(cityLocalDate('2026-10-12T16:30:00Z', 'Asia/Riyadh'), { dateKey: '20261012', monthIndex: 9, label: 'Senin, 12 Okt 2026' });
  // 03:30 WIB 1 Nov = 23:30 Mekkah 31 Okt → catatan bulan Oktober
  assert.deepEqual(cityLocalDate('2026-10-31T20:30:00Z', 'Asia/Riyadh'), { dateKey: '20261031', monthIndex: 9, label: 'Sabtu, 31 Okt 2026' });
  assert.equal(cityLocalDate('2026-10-31T20:30:00Z', 'Asia/Jakarta').label, 'Minggu, 1 Nov 2026');
  // syncedAt rusak → pakai `now`
  assert.equal(cityLocalDate('bukan-tanggal', 'Asia/Riyadh', Date.parse('2026-10-12T05:00:00Z')).dateKey, '20261012');
});

test('banner props map weather + agent data', () => {
  const p = buildCuacaShareProps(makkah, agent, { syncedAt: SYNC });
  assert.equal(p.cityKey, 'makkah');
  assert.equal(p.subtitle, 'Update cuaca kota tujuan umroh');
  assert.equal(p.photo, 'makkah.jpg');
  assert.equal(p.conditionIcon, 'sun');
  assert.equal(p.tempFontSize, 230);
  assert.deepEqual(p.forecast.map(f => f.icon), ['cloud', 'cloud-drizzle', 'cloud-drizzle']);
  assert.equal(p.seasonalNote, 'Oktober nyaman untuk siang — mulai cocok aktivitas di luar.');
  assert.equal(p.dateLabel, 'Senin, 12 Okt 2026');
  assert.deepEqual(p.agent, { name: 'Bagas Pramudita', initials: 'BP', nameFontSize: 34, siteLabel: 'alhijaz.co/bagas' });

  const h = buildCuacaShareProps(hainan, agent, { syncedAt: SYNC });
  assert.equal(h.photo, null);
  assert.equal(h.subtitle, 'Update cuaca kota tujuan wisata');
  assert.equal(h.uvLabel, 'Sangat Tinggi');
  assert.equal(h.seasonalNote, 'Oktober musim hujan berakhir. Mulai nyaman kembali.');
});

test('caption lists weather, note and agent contact; WA line optional', () => {
  const p = buildCuacaShareProps(makkah, agent, { syncedAt: SYNC });
  assert.equal(buildCuacaCaption(p, { waNumber: '6281234567890' }), [
    '🌤️ Cuaca Mekkah hari ini — Senin, 12 Okt 2026',
    '31°C Cerah (terasa 33°C) · 27–38°C',
    'Oktober nyaman untuk siang — mulai cocok aktivitas di luar.',
    '',
    'Info paket Umroh & Haji:',
    'Bagas Pramudita',
    'wa.me/6281234567890',
    'alhijaz.co/bagas',
  ].join('\n'));
  assert.doesNotMatch(buildCuacaCaption(p, { waNumber: null }), /wa\.me/);
});

test('share city validation rejects unknown keys before looking at data', () => {
  const cities = [makkah];
  assert.equal(resolveCuacaShareCity('makkah', cities).city, makkah);
  assert.equal(resolveCuacaShareCity('madinah', cities).status, 404);
  for (const bad of ['../../etc', '', undefined, ['makkah', 'dubai'], 'MAKKAH']) {
    assert.equal(resolveCuacaShareCity(bad, cities).status, 400, String(bad));
  }
});
