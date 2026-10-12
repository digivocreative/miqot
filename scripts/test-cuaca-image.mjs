// Uji render banner Share Cuaca tanpa server: 3 kasus ekstrem → /tmp/cuaca-*.jpg.
// Jalankan: node scripts/test-cuaca-image.mjs   lalu buka berkasnya.
import { writeFile } from 'fs/promises';
import { buildCuacaShareProps } from '../lib/cuaca-share-data.js';
import { loadCuacaShareAssets, renderCuacaShareJpeg } from '../lib/cuaca-share-render.js';

const base = {
  temp: 31, feelsLike: 33, humidity: 44, windSpeed: 6, uvIndex: 2, uvLabel: 'Rendah',
  weatherCode: 0, label: 'Cerah', icon: '☀️', tempMin: 27, tempMax: 38,
  forecast: [
    { day: 'Sel', icon: '☁️', weatherCode: 3, tempMin: 25, tempMax: 37 },
    { day: 'Rab', icon: '🌦️', weatherCode: 53, tempMin: 26, tempMax: 36 },
    { day: 'Kam', icon: '🌦️', weatherCode: 53, tempMin: 26, tempMax: 36 },
  ],
};
const SYNC = new Date().toISOString();
const cases = [
  ['mekkah', { ...base, key: 'makkah', name: 'Mekkah', country: 'Arab Saudi' },
    { name: 'Bagas Pramudita', slug: 'bagas', photo: 'https://ui-avatars.com/api/?name=Bagas+Pramudita&background=0F6E56&color=fff&size=192' }],
  ['hainan', { ...base, key: 'hainan', name: 'Hainan', country: 'China', temp: 29, label: 'Gerimis', weatherCode: 51, uvIndex: 8, uvLabel: 'Sgt Tinggi' },
    { name: 'Nina Nasution', slug: 'nina', photo: '' }],
  ['ekstrem', { ...base, key: 'cappadocia', name: 'Cappadocia', country: 'Türkiye', temp: -12, feelsLike: -17, tempMin: -15, tempMax: -8, label: 'Cerah berawan', weatherCode: 2 },
    { name: 'Muhammad Abdurrahman Al-Hafidz Indonesia', slug: 'hafidz', photo: '' }],
];

for (const [name, city, agent] of cases) {
  console.time(name);
  const data = buildCuacaShareProps(city, agent, { syncedAt: SYNC });
  const buf = await renderCuacaShareJpeg({ data, assets: await loadCuacaShareAssets(data, agent.photo) });
  const out = `/tmp/cuaca-${name}.jpg`;
  await writeFile(out, buf);
  console.timeEnd(name);
  console.log(`Wrote ${out} — ${(buf.length / 1024).toFixed(1)} KB`);
}
