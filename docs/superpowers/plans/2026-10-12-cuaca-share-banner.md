# Banner Share Cuaca Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tombol Share di widget "Cuaca Kota Tujuan" yang menghasilkan banner 4:5 (1080×1350) bermerek agent — seri Kurs + ornamen islami — siap diunduh, dibagikan, atau disalin caption-nya.

**Architecture:** Satu komponen React bodoh (`CuacaShareTemplate`) menerima props jadi dari modul murni `lib/cuaca-share-data.js`. Klien memakainya sebagai pratinjau; server mem-bundle komponen yang sama dengan esbuild lalu memotretnya di Chromium (Playwright) menjadi JPEG, dengan cache disk per agent×kota×sinkron cuaca. Pola render meniru `lib/card-export.js`; antrean render dan CSS font diangkat ke `lib/headless-render.js` supaya dipakai bersama.

**Tech Stack:** React 18 + TypeScript (Vite), lucide-react, Express (`server.js`), esbuild, Playwright Chromium, sharp (skrip aset), `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-12-cuaca-share-banner-design.md` (mockup `~/Downloads/cuaca-share/cuaca-share.pen`, frame C2 & C3).

## Global Constraints

- Ukuran banner tetap **1080×1350** CSS px, render `deviceScaleFactor: 1`, **JPEG quality 88**.
- Tidak ada emoji di banner (ikon = lucide SVG). Emoji boleh di caption.
- Situs agent di banner & caption: `alhijaz.co/{slug}`.
- Identitas agent di server **hanya** dari `getAgentById(req.user.id)`; query hanya `city`.
- Endpoint tidak pernah memanggil Open-Meteo; baca `weatherMemory`/`weather_cache`.
- Font server: Inter 400/600/700/800 dari `public/fonts/brochure` (template tidak memakai bobot lain).
- Cache: `data/cuaca-share-cache/YYYY-MM-DD/{slug}-{city}-{sha16}.jpg`, TTL 2 hari, maks 256 MB, versi template `'c2-v1'`.
- Foto kota: `public/cuaca-share/{makkah,madinah,istanbul,cappadocia,dubai}.jpg`; Hainan tanpa foto.
- Event analytics: `open_share_cuaca` (feature), `download_share_cuaca`, `share_cuaca`, `copy_cuaca_caption` (action), param `city`; wajib di `FEATURE_LABELS`/`ACTION_LABELS`.
- Komit langsung di `main`, `git add` per berkas; jangan sentuh `lib/kurs-share-cache.mjs` / `lib/kurs-image-generator.mjs`.

## Review Focus

1. **Cache cuaca lama** — `forecast[]` tanpa `weatherCode`, emoji dengan/tanpa VS16 (`☀️` vs `☀`) → ikon tetap benar, tidak jatuh ke ikon default. (Task 2)
2. **Suhu minus dua digit & label kondisi panjang** — Cappadocia `−12°` + "Cerah berawan" / "Hujan lebat" → font menyusut, baris suhu tidak meluber keluar kanvas. (Task 2 + Task 3)
3. **Tanggal di sekitar tengah malam** — `syncedAt` 23.30 WIB (Mekkah masih 19.30 hari yang sama), `syncedAt` 03.30 WIB (Mekkah masih kemarin) dan `syncedAt` tidak valid → label tanggal & catatan musim ikut zona kota. (Task 2)
4. **Foto agent bermasalah** — host di luar daftar, `http:`, timeout, bukan gambar, > 3 MB → render tetap jalan dengan inisial. (Task 5)
5. **Query `city` aneh** — `../../etc`, array `?city=a&city=b`, kosong → 400 sebelum menyentuh disk/Chromium. (Task 2 + Task 7)

---

## File Structure

| Berkas | Tanggung jawab |
|---|---|
| `lib/weather-cities.js` (+ `.d.ts`) | Daftar 6 kota (dipindah dari `server.js`) + meta banner (foto, jenis subjudul) |
| `lib/weather-seasonal-notes.js` (+ `.d.ts`) | `SEASONAL_NOTES` (dipindah dari `CuacaWidget.tsx`) |
| `lib/cuaca-share-data.js` (+ `.d.ts`) | Logika murni: ikon, label, tanggal lokal, ukuran font, props banner, caption, validasi kota |
| `src/components/cuaca-share/CuacaOrnament.tsx` | SVG ornamen (pola khatam + roset) dan panel pola untuk kota tanpa foto |
| `src/components/cuaca-share/CuacaShareTemplate.tsx` | Kanvas banner 1080×1350 (bodoh, props → markup) |
| `public/cuaca-share/*.jpg` + `scripts/prepare-cuaca-photos.mjs` | Foto kota terpotong (badge logo terbuang) |
| `lib/headless-render.js` | Antrean render tunggal + CSS font tersemat (dipakai card-export & cuaca) |
| `lib/card-export.js` | Dipindah memakai `headless-render.js` (perilaku tetap) |
| `src/cuaca-share-entry.tsx` | Entry halaman render server |
| `lib/cuaca-share-render.js` | Bundle + aset (foto kota, logo, foto agent) + Playwright → JPEG |
| `lib/cuaca-share-cache.mjs` | Cache disk + dedupe in-flight + pembersihan |
| `server.js` | Impor kota, `weatherCode` di forecast, endpoint, cron pembersihan, label analytics |
| `src/components/ShareCuacaModal.tsx` | Sheet "Bagikan Cuaca" |
| `src/components/CuacaWidget.tsx` | Pil Share + prop `agent` + `syncedAt` |
| `src/components/DashboardLayout.tsx` | Meneruskan `agent` ke `CuacaWidget` |
| `scripts/test-cuaca-image.mjs` | Uji render manual 3 kasus ekstrem |
| `tests/…` | Lihat tiap task |

---

### Task 1: Modul kota & catatan musim bersama + `weatherCode` di prakiraan

**Files:**
- Create: `lib/weather-cities.js`, `lib/weather-cities.d.ts`, `lib/weather-seasonal-notes.js`, `lib/weather-seasonal-notes.d.ts`
- Modify: `server.js` (blok `const WEATHER_CITIES = [` ±baris 20447; `fetchCityWeather` forecast ±baris 20491; impor di atas)
- Modify: `src/components/CuacaWidget.tsx:14-100` (hapus `SEASONAL_NOTES` lokal, impor dari lib)
- Test: `tests/weather-shared-modules.test.js`

**Interfaces:**
- Produces: `WEATHER_CITIES: {key,name,country,flag,lat,lon,tz}[]`, `CUACA_SHARE_CITY_META: Record<string,{photo: string|null, trip: 'umroh'|'wisata'}>`, `SEASONAL_NOTES: Record<string,string[]>`.

- [ ] **Step 1: Write the failing test** — `tests/weather-shared-modules.test.js`

```js
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEATHER_CITIES, CUACA_SHARE_CITY_META } from '../lib/weather-cities.js';
import { SEASONAL_NOTES } from '../lib/weather-seasonal-notes.js';

const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const widget = readFileSync(new URL('../src/components/CuacaWidget.tsx', import.meta.url), 'utf8');

test('weather cities keep the canonical tab order and timezones', () => {
  assert.deepEqual(WEATHER_CITIES.map(c => c.key), ['makkah', 'madinah', 'istanbul', 'cappadocia', 'dubai', 'hainan']);
  assert.equal(WEATHER_CITIES.find(c => c.key === 'makkah').tz, 'Asia/Riyadh');
  assert.equal(WEATHER_CITIES.find(c => c.key === 'hainan').tz, 'Asia/Shanghai');
});

test('every city has banner meta and twelve seasonal notes', () => {
  for (const { key } of WEATHER_CITIES) {
    assert.ok(CUACA_SHARE_CITY_META[key], `meta ${key}`);
    assert.equal(SEASONAL_NOTES[key]?.length, 12, `notes ${key}`);
  }
  assert.equal(CUACA_SHARE_CITY_META.hainan.photo, null);
  assert.equal(CUACA_SHARE_CITY_META.makkah.trip, 'umroh');
  assert.equal(CUACA_SHARE_CITY_META.dubai.trip, 'wisata');
  assert.equal(SEASONAL_NOTES.makkah[9], 'Oktober nyaman untuk siang — mulai cocok aktivitas di luar.');
});

test('server and widget import the shared modules instead of inline copies', () => {
  assert.match(server, /import \{ WEATHER_CITIES \} from '\.\/lib\/weather-cities\.js';/);
  assert.doesNotMatch(server, /const WEATHER_CITIES = \[/);
  assert.match(widget, /import \{ SEASONAL_NOTES \} from '\.\.\/\.\.\/lib\/weather-seasonal-notes\.js';/);
  assert.doesNotMatch(widget, /const SEASONAL_NOTES/);
});

test('daily forecast entries carry their WMO weather code', () => {
  assert.match(server, /icon: wmoMap\(daily\.weather_code\[i \+ 1\]\)\.icon,\n\s+weatherCode: daily\.weather_code\[i \+ 1\],/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/weather-shared-modules.test.js`
Expected: FAIL — `Cannot find module '…/lib/weather-cities.js'`.

- [ ] **Step 3: Create `lib/weather-cities.js`**

```js
// Kota widget "Cuaca Kota Tujuan". Dipakai server (fetch Open-Meteo tiap 3 jam)
// dan banner Share Cuaca (zona waktu, foto kartu, subjudul). Urutan = urutan tab.
export const WEATHER_CITIES = [
  { key: 'makkah',     name: 'Mekkah',     country: 'Arab Saudi', flag: '🇸🇦', lat: 21.3891, lon: 39.8579, tz: 'Asia/Riyadh' },
  { key: 'madinah',    name: 'Madinah',    country: 'Arab Saudi', flag: '🇸🇦', lat: 24.5247, lon: 39.5692, tz: 'Asia/Riyadh' },
  { key: 'istanbul',   name: 'Istanbul',   country: 'Türkiye',    flag: '🇹🇷', lat: 41.0082, lon: 28.9784, tz: 'Europe/Istanbul' },
  { key: 'cappadocia', name: 'Cappadocia', country: 'Türkiye',    flag: '🇹🇷', lat: 38.6431, lon: 34.8287, tz: 'Europe/Istanbul' },
  { key: 'dubai',      name: 'Dubai',      country: 'UAE',        flag: '🇦🇪', lat: 25.2048, lon: 55.2708, tz: 'Asia/Dubai' },
  { key: 'hainan',     name: 'Hainan',     country: 'China',      flag: '🇨🇳', lat: 18.2528, lon: 109.5120, tz: 'Asia/Shanghai' },
];

// Banner Share Cuaca: foto kartu di public/cuaca-share/ (null = panel pola) dan
// jenis subjudul ("kota tujuan umroh" vs "kota tujuan wisata").
export const CUACA_SHARE_CITY_META = {
  makkah:     { photo: 'makkah.jpg',     trip: 'umroh' },
  madinah:    { photo: 'madinah.jpg',    trip: 'umroh' },
  istanbul:   { photo: 'istanbul.jpg',   trip: 'wisata' },
  cappadocia: { photo: 'cappadocia.jpg', trip: 'wisata' },
  dubai:      { photo: 'dubai.jpg',      trip: 'wisata' },
  hainan:     { photo: null,             trip: 'wisata' },
};
```

`lib/weather-cities.d.ts`:

```ts
export interface WeatherCity {
  key: string;
  name: string;
  country: string;
  flag: string;
  lat: number;
  lon: number;
  tz: string;
}

export const WEATHER_CITIES: WeatherCity[];
export const CUACA_SHARE_CITY_META: Record<string, { photo: string | null; trip: 'umroh' | 'wisata' }>;
```

- [ ] **Step 4: Create `lib/weather-seasonal-notes.js`** — pindahkan objek `SEASONAL_NOTES` dari `src/components/CuacaWidget.tsx:15-100` **apa adanya** (enam kunci × 12 string), dengan header:

```js
// Catatan musim per kota per bulan (0 = Januari). Satu sumber untuk widget
// "Cuaca Kota Tujuan" dan banner Share Cuaca.
export const SEASONAL_NOTES = {
  makkah: [
    // …12 string makkah persis dari CuacaWidget.tsx…
  ],
  // …madinah, istanbul, cappadocia, dubai, hainan persis…
};
```

(Salin dengan `sed -n '15,100p' src/components/CuacaWidget.tsx` lalu ganti baris pertama `const SEASONAL_NOTES: Record<string, string[]> = {` menjadi `export const SEASONAL_NOTES = {`.)

`lib/weather-seasonal-notes.d.ts`:

```ts
export const SEASONAL_NOTES: Record<string, string[]>;
```

- [ ] **Step 5: Wire server & widget**

`server.js` — tambah impor di dekat impor lib lain (setelah `import { flightItineraryFields } from './lib/flight-itinerary-link.js';`):

```js
import { WEATHER_CITIES } from './lib/weather-cities.js';
```

Hapus blok `const WEATHER_CITIES = [ … ];` (7 baris) di bawah `// ─── WEATHER ENDPOINT ───`. Di `fetchCityWeather`, ubah map forecast menjadi:

```js
    return {
      day: DAYS_ID[d.getDay()],
      icon: wmoMap(daily.weather_code[i + 1]).icon,
      weatherCode: daily.weather_code[i + 1],
      tempMin: Math.round(daily.temperature_2m_min[i + 1]),
      tempMax: Math.round(daily.temperature_2m_max[i + 1]),
    };
```

`src/components/CuacaWidget.tsx` — hapus blok `// ─── Seasonal notes …` + `const SEASONAL_NOTES … };` dan tambahkan impor:

```ts
import { SEASONAL_NOTES } from '../../lib/weather-seasonal-notes.js';
```

- [ ] **Step 6: Run tests + syntax check**

Run: `node --test tests/weather-shared-modules.test.js && node --check server.js`
Expected: PASS (4 tests), no syntax error.

- [ ] **Step 7: Commit**

```bash
git add lib/weather-cities.js lib/weather-cities.d.ts lib/weather-seasonal-notes.js lib/weather-seasonal-notes.d.ts server.js src/components/CuacaWidget.tsx tests/weather-shared-modules.test.js
git commit -m "refactor(cuaca): kota & catatan musim jadi modul bersama + weatherCode prakiraan"
```

---

### Task 2: Logika murni banner — `lib/cuaca-share-data.js`

**Files:**
- Create: `lib/cuaca-share-data.js`, `lib/cuaca-share-data.d.ts`
- Test: `tests/cuaca-share-data.test.js`

**Interfaces:**
- Consumes: `WEATHER_CITIES`, `CUACA_SHARE_CITY_META` (Task 1), `SEASONAL_NOTES` (Task 1).
- Produces:
  - `CUACA_SHARE_W = 1080`, `CUACA_SHARE_H = 1350`
  - `weatherIconKey({ weatherCode?, icon? }): CuacaIconKey`
  - `uvLabelFull(label): string`
  - `formatTemp(n): string` (minus tipografis `−`), `formatDeg(n): string` (`formatTemp(n) + '°'`)
  - `cityLocalDate(syncedAt, tz, now?): { dateKey: 'YYYYMMDD', monthIndex: 0..11, label: 'Senin, 12 Okt 2026' }`
  - `agentInitials(name): string`, `agentNameFontSize(name): 34|30|26`, `tempFontSize(temp): 230|190`, `conditionFontSize(label): 60|50`
  - `buildCuacaShareProps(city, agent, { syncedAt, now? }): CuacaShareProps`
  - `buildCuacaCaption(props, { waNumber }): string`
  - `resolveCuacaShareCity(cityKey, cities): { status: 200, city } | { status: 400|404, error }`

- [ ] **Step 1: Write the failing test** — `tests/cuaca-share-data.test.js`

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/cuaca-share-data.test.js`
Expected: FAIL — `Cannot find module '…/lib/cuaca-share-data.js'`.

- [ ] **Step 3: Implement `lib/cuaca-share-data.js`**

```js
// Logika murni banner Share Cuaca (spec 2026-10-12). Dipakai klien (pratinjau +
// caption) dan server (render). Template hanya menerima hasil fungsi di sini.
import { WEATHER_CITIES, CUACA_SHARE_CITY_META } from './weather-cities.js';
import { SEASONAL_NOTES } from './weather-seasonal-notes.js';

export const CUACA_SHARE_W = 1080;
export const CUACA_SHARE_H = 1350;

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];

// Emoji wmoMap lama (data cache sebelum forecast punya weatherCode). Kunci tanpa
// VS16 (U+FE0F) supaya "☀️" dan "☀" sama-sama cocok.
const stripVs = s => String(s || '').replace(/️/g, '').trim();
const EMOJI_ICON = new Map([
  ['☀', 'sun'], ['🌤', 'cloud-sun'], ['☁', 'cloud'], ['🌫', 'cloud-fog'],
  ['🌦', 'cloud-drizzle'], ['🌧', 'cloud-rain'], ['❄', 'snowflake'], ['⛈', 'cloud-lightning'],
]);

// Ambang sama dengan wmoMap di server.js.
export function weatherIconKey({ weatherCode, icon } = {}) {
  const code = weatherCode == null ? NaN : Number(weatherCode);
  if (Number.isFinite(code)) {
    if (code === 0) return 'sun';
    if (code <= 2) return 'cloud-sun';
    if (code === 3) return 'cloud';
    if (code <= 49) return 'cloud-fog';
    if (code <= 57) return 'cloud-drizzle';
    if (code <= 67) return 'cloud-rain';
    if (code <= 77) return 'snowflake';
    if (code <= 82) return 'cloud-rain';
    if (code <= 86) return 'snowflake';
    if (code <= 99) return 'cloud-lightning';
  }
  return EMOJI_ICON.get(stripVs(icon)) || 'thermometer';
}

export function uvLabelFull(label) {
  return label === 'Sgt Tinggi' ? 'Sangat Tinggi' : String(label || '');
}

export function formatTemp(n) {
  const v = Math.round(Number(n) || 0);
  return v < 0 ? `−${Math.abs(v)}` : String(v);
}

export function formatDeg(n) {
  return `${formatTemp(n)}°`;
}

export function cityLocalDate(syncedAt, tz, now = Date.now()) {
  const parsed = new Date(syncedAt);
  const at = Number.isNaN(parsed.getTime()) ? new Date(now) : parsed;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz || 'Asia/Jakarta',
      year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short',
    }).formatToParts(at).map(p => [p.type, p.value]),
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const weekday = WEEKDAY_EN.indexOf(parts.weekday);
  return {
    dateKey: `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`,
    monthIndex: month - 1,
    label: `${DAY_NAMES[weekday]}, ${day} ${MONTH_SHORT[month - 1]} ${year}`,
  };
}

export function agentInitials(name) {
  const initials = String(name || '').trim().split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  return initials || 'A';
}

export function agentNameFontSize(name) {
  const len = String(name || '').trim().length;
  if (len <= 22) return 34;
  if (len <= 28) return 30;
  return 26;
}

export function tempFontSize(temp) {
  return formatDeg(temp).length <= 3 ? 230 : 190;
}

export function conditionFontSize(label) {
  return String(label || '').length <= 10 ? 60 : 50;
}

export function buildCuacaShareProps(city, agent, { syncedAt, now = Date.now() } = {}) {
  const def = WEATHER_CITIES.find(c => c.key === city.key);
  const meta = CUACA_SHARE_CITY_META[city.key] || { photo: null, trip: 'wisata' };
  const date = cityLocalDate(syncedAt, def?.tz, now);
  const name = String(agent?.name || '').trim();
  return {
    cityKey: city.key,
    cityName: city.name,
    country: city.country,
    subtitle: meta.trip === 'umroh' ? 'Update cuaca kota tujuan umroh' : 'Update cuaca kota tujuan wisata',
    photo: meta.photo,
    temp: city.temp,
    tempFontSize: tempFontSize(city.temp),
    conditionLabel: city.label,
    conditionFontSize: conditionFontSize(city.label),
    conditionIcon: weatherIconKey(city),
    feelsLike: city.feelsLike,
    tempMin: city.tempMin,
    tempMax: city.tempMax,
    humidity: city.humidity,
    windSpeed: city.windSpeed,
    uvIndex: city.uvIndex,
    uvLabel: uvLabelFull(city.uvLabel),
    forecast: (city.forecast || []).slice(0, 3).map(f => ({
      day: f.day, icon: weatherIconKey(f), tempMin: f.tempMin, tempMax: f.tempMax,
    })),
    seasonalNote: SEASONAL_NOTES[city.key]?.[date.monthIndex] || '',
    dateKey: date.dateKey,
    dateLabel: date.label,
    agent: {
      name,
      initials: agentInitials(name),
      nameFontSize: agentNameFontSize(name),
      siteLabel: `alhijaz.co/${String(agent?.slug || '').trim()}`,
    },
  };
}

export function buildCuacaCaption(props, { waNumber } = {}) {
  const lines = [
    `🌤️ Cuaca ${props.cityName} hari ini — ${props.dateLabel}`,
    `${formatDeg(props.temp)}C ${props.conditionLabel} (terasa ${formatDeg(props.feelsLike)}C) · ${formatTemp(props.tempMin)}–${formatDeg(props.tempMax)}C`,
  ];
  if (props.seasonalNote) lines.push(props.seasonalNote);
  lines.push('', 'Info paket Umroh & Haji:', props.agent.name);
  if (waNumber) lines.push(`wa.me/${waNumber}`);
  lines.push(props.agent.siteLabel);
  return lines.join('\n');
}

export function resolveCuacaShareCity(cityKey, cities) {
  const key = typeof cityKey === 'string' ? cityKey : '';
  if (!WEATHER_CITIES.some(c => c.key === key)) return { status: 400, error: 'Kota tidak dikenal' };
  const city = (cities || []).find(c => c?.key === key);
  if (!city) return { status: 404, error: 'Data cuaca kota ini belum tersedia' };
  return { status: 200, city };
}
```

`lib/cuaca-share-data.d.ts`:

```ts
export type CuacaIconKey =
  | 'sun' | 'cloud-sun' | 'cloud' | 'cloud-fog' | 'cloud-drizzle'
  | 'cloud-rain' | 'snowflake' | 'cloud-lightning' | 'thermometer';

export interface CuacaShareForecastInput {
  day: string;
  icon: string;
  weatherCode?: number | null;
  tempMin: number;
  tempMax: number;
}

export interface CuacaShareCity {
  key: string;
  name: string;
  country: string;
  flag?: string;
  temp: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  uvIndex: number;
  uvLabel: string;
  label: string;
  icon: string;
  weatherCode?: number | null;
  tempMin: number;
  tempMax: number;
  forecast: CuacaShareForecastInput[];
}

export interface CuacaShareProps {
  cityKey: string;
  cityName: string;
  country: string;
  subtitle: string;
  photo: string | null;
  temp: number;
  tempFontSize: number;
  conditionLabel: string;
  conditionFontSize: number;
  conditionIcon: CuacaIconKey;
  feelsLike: number;
  tempMin: number;
  tempMax: number;
  humidity: number;
  windSpeed: number;
  uvIndex: number;
  uvLabel: string;
  forecast: { day: string; icon: CuacaIconKey; tempMin: number; tempMax: number }[];
  seasonalNote: string;
  dateKey: string;
  dateLabel: string;
  agent: { name: string; initials: string; nameFontSize: number; siteLabel: string };
}

export const CUACA_SHARE_W: number;
export const CUACA_SHARE_H: number;
export function weatherIconKey(input?: { weatherCode?: number | null; icon?: string | null }): CuacaIconKey;
export function uvLabelFull(label: string | null | undefined): string;
export function formatTemp(n: number): string;
export function formatDeg(n: number): string;
export function cityLocalDate(syncedAt: string | null | undefined, tz: string | undefined, now?: number): { dateKey: string; monthIndex: number; label: string };
export function agentInitials(name: string | null | undefined): string;
export function agentNameFontSize(name: string | null | undefined): number;
export function tempFontSize(temp: number): number;
export function conditionFontSize(label: string | null | undefined): number;
export function buildCuacaShareProps(
  city: CuacaShareCity,
  agent: { name?: string | null; slug?: string | null },
  opts?: { syncedAt?: string | null; now?: number },
): CuacaShareProps;
export function buildCuacaCaption(props: CuacaShareProps, opts?: { waNumber?: string | null }): string;
export function resolveCuacaShareCity(
  cityKey: unknown,
  cities: CuacaShareCity[] | null | undefined,
): { status: 200; city: CuacaShareCity } | { status: 400 | 404; error: string };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/cuaca-share-data.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/cuaca-share-data.js lib/cuaca-share-data.d.ts tests/cuaca-share-data.test.js
git commit -m "feat(cuaca): logika murni banner Share Cuaca (ikon, tanggal kota, caption, validasi)"
```

---

### Task 3: Template banner + ornamen + foto kota

**Files:**
- Create: `src/components/cuaca-share/CuacaOrnament.tsx`, `src/components/cuaca-share/CuacaShareTemplate.tsx`
- Create: `scripts/prepare-cuaca-photos.mjs`, `public/cuaca-share/{makkah,madinah,istanbul,cappadocia,dubai}.jpg` (hasil skrip)
- Create: `tests/fixtures/cuaca-share-render.js`
- Test: `tests/cuaca-share-template.test.js`

**Interfaces:**
- Consumes: `CuacaShareProps`, `CuacaIconKey`, `CUACA_SHARE_W/H`, `formatDeg`, `formatTemp` (Task 2).
- Produces: `CuacaShareTemplate({ data: CuacaShareProps, assets: CuacaShareAssets })`, `interface CuacaShareAssets { photoSrc: string | null; logoSrc: string; agentPhotoSrc: string | null }`. Root element punya atribut `data-cuaca-share`; kartu kota `data-city-card="photo"|"pattern"`.

- [ ] **Step 1: Write the SSR fixture** — `tests/fixtures/cuaca-share-render.js`

```js
// Harness SSR CuacaShareTemplate: bundle (esbuild, CJS) lalu renderToStaticMarkup.
// Tes membaca HASIL render, bukan teks sumber. Template murni (tanpa portal/
// framer), jadi tidak perlu shim seperti package-card-render.js.
import { build } from 'esbuild';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const NODE_PATHS = createRequire(import.meta.url).resolve.paths('react').filter((dir) => existsSync(dir));
let loaded = null;

export function loadCuacaTemplateRenderer() {
  loaded ||= (async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cuaca-ssr-'));
    const entry = join(dir, 'entry.tsx');
    const template = join(ROOT, 'src/components/cuaca-share/CuacaShareTemplate.tsx');
    writeFileSync(entry, [
      "import { renderToStaticMarkup } from 'react-dom/server';",
      "import { createElement } from 'react';",
      `import { CuacaShareTemplate } from ${JSON.stringify(template)};`,
      'export const render = (data, assets) => renderToStaticMarkup(createElement(CuacaShareTemplate, { data, assets }));',
    ].join('\n'));
    const outfile = join(dir, 'out.cjs');
    await build({
      entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', outfile,
      jsx: 'automatic', nodePaths: NODE_PATHS, logLevel: 'silent',
      define: { 'process.env.NODE_ENV': '"production"' },
    });
    return createRequire(import.meta.url)(outfile);
  })();
  return loaded;
}
```

- [ ] **Step 2: Write the failing test** — `tests/cuaca-share-template.test.js`

```js
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
  assert.match(html, /font-size:26px[^"]*text-overflow:ellipsis[^"]*">Muhammad Abdurrahman Al-Hafidz Indonesia/);
  assert.match(html, /src="https:\/\/sb\.alhijaz\.co\/a\.jpg"/);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/cuaca-share-template.test.js`
Expected: FAIL — esbuild `Could not resolve ".../CuacaShareTemplate.tsx"`.

- [ ] **Step 4: Implement `src/components/cuaca-share/CuacaOrnament.tsx`**

```tsx
// Ornamen banner Share Cuaca (mockup C2/C3): pola khatam (bintang-8 dari dua
// persegi) yang memudar dari kanan atas + roset bunga yang sama dengan banner
// Kurs. SVG inline — tidak ada berkas gambar, identik di pratinjau & server.
import type { ReactNode } from 'react';
import { CUACA_SHARE_H, CUACA_SHARE_W } from '../../../lib/cuaca-share-data.js';

const GOLD = '#F8DFA1';
const MINT = '#D1FAE5';

function khatamPaths(tile: number, radius: number) {
  const c = tile / 2;
  const s = +(radius / Math.SQRT2).toFixed(2);
  return {
    links: `M${c} ${c - radius}V0M${c + radius} ${c}H${tile}M${c} ${c + radius}V${tile}M${c - radius} ${c}H0`
      + `M${c - s} ${c - s}L0 0M${c + s} ${c - s}L${tile} 0M${c + s} ${c + s}L${tile} ${tile}M${c - s} ${c + s}L0 ${tile}`,
    star: `M${c - s} ${c - s}H${c + s}V${c + s}H${c - s}Z`
      + `M${c} ${c - radius}L${c + radius} ${c}L${c} ${c + radius}L${c - radius} ${c}Z`,
    c,
  };
}

function KhatamPattern({ id, tile, radius, offset }: { id: string; tile: number; radius: number; offset: [number, number] }) {
  const p = khatamPaths(tile, radius);
  return (
    <pattern id={id} width={tile} height={tile} patternUnits="userSpaceOnUse" x={offset[0]} y={offset[1]}>
      <path d={p.links} stroke={MINT} strokeWidth={1.8} fill="none" />
      <path d={p.star} stroke={GOLD} strokeWidth={2} fill="none" />
      <circle cx={p.c} cy={p.c} r={tile / 17} stroke={GOLD} strokeWidth={1.4} fill="none" />
    </pattern>
  );
}

function Rosette() {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M0 -260C62 -192 62 -88 0 -18C-62 -88 -62 -192 0 -260Z M0 260C62 192 62 88 0 18C-62 88 -62 192 0 260Z M-260 0C-192 -62 -88 -62 -18 0C-88 62 -192 62 -260 0Z M260 0C192 -62 88 -62 18 0C88 62 192 62 260 0Z" stroke={GOLD} strokeWidth={4} />
      <path d="M-184 -184C-92 -180 -28 -108 -18 -18C-108 -28 -180 -92 -184 -184Z M184 -184C180 -92 108 -28 18 -18C28 -108 92 -180 184 -184Z M184 184C92 180 28 108 18 18C108 28 180 92 184 184Z M-184 184C-180 92 -108 28 -18 18C-28 108 -92 180 -184 184Z" stroke={MINT} strokeWidth={3} />
      <path d="M0 -18C38 -62 38 -122 0 -166C-38 -122 -38 -62 0 -18Z M0 18C38 62 38 122 0 166C-38 122 -38 62 0 18Z M-18 0C-62 -38 -122 -38 -166 0C-122 38 -62 38 -18 0Z M18 0C62 -38 122 -38 166 0C122 38 62 38 18 0Z" stroke={MINT} strokeWidth={2.2} opacity={0.85} />
      <path d="M-130 -42C-76 -86 -30 -84 0 0C30 -84 76 -86 130 -42 M-130 42C-76 86 -30 84 0 0C30 84 76 86 130 42 M-42 -130C-86 -76 -84 -30 0 0C-84 30 -86 76 -42 130 M42 -130C86 -76 84 -30 0 0C84 30 86 76 42 130" stroke={GOLD} strokeWidth={2.4} opacity={0.85} />
      <circle r={34} stroke={GOLD} strokeWidth={3} />
      <circle r={12} stroke={MINT} strokeWidth={2} />
    </g>
  );
}

/** Lapisan latar seluruh banner (di bawah konten). */
export function CuacaOrnament() {
  const W = CUACA_SHARE_W;
  const H = CUACA_SHARE_H;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
      <defs>
        <KhatamPattern id="cuaca-khatam" tile={120} radius={46} offset={[-20, -20]} />
        <radialGradient id="cuaca-khatam-fade" cx="0.92" cy="0.06" r="1.05">
          <stop offset="0" stopColor="#fff" stopOpacity={1} />
          <stop offset="0.45" stopColor="#fff" stopOpacity={0.45} />
          <stop offset="0.85" stopColor="#fff" stopOpacity={0.08} />
          <stop offset="1" stopColor="#fff" stopOpacity={0} />
        </radialGradient>
        <mask id="cuaca-khatam-mask">
          <rect width={W} height={H} fill="url(#cuaca-khatam-fade)" />
        </mask>
      </defs>
      <rect width={W} height={H} fill="url(#cuaca-khatam)" mask="url(#cuaca-khatam-mask)" opacity={0.26} />
      <g transform="translate(1000 760) scale(1.25)" opacity={0.16}><Rosette /></g>
      <g transform="translate(70 1240) scale(0.7)" opacity={0.1}><Rosette /></g>
    </svg>
  );
}

/** Pengganti foto untuk kota tanpa foto (mockup C3). `children` = ikon cuaca besar. */
export function KhatamPanel({ children }: { children: ReactNode }) {
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <svg width="100%" height="100%" viewBox="0 0 952 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id="cuaca-panel-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#0E6A53" />
            <stop offset="1" stopColor="#05261D" />
          </linearGradient>
          <KhatamPattern id="cuaca-panel-khatam" tile={96} radius={37} offset={[-12, -28]} />
          <radialGradient id="cuaca-panel-glow" cx="0.78" cy="0.42" r="0.55">
            <stop offset="0" stopColor={GOLD} stopOpacity={0.22} />
            <stop offset="1" stopColor={GOLD} stopOpacity={0} />
          </radialGradient>
        </defs>
        <rect width="952" height="400" fill="url(#cuaca-panel-bg)" />
        <rect width="952" height="400" fill="url(#cuaca-panel-khatam)" opacity={0.22} />
        <rect width="952" height="400" fill="url(#cuaca-panel-glow)" />
      </svg>
      <div style={{ position: 'absolute', right: 40, top: 0, bottom: 0, display: 'flex', alignItems: 'center' }}>{children}</div>
    </div>
  );
}
```

- [ ] **Step 5: Implement `src/components/cuaca-share/CuacaShareTemplate.tsx`**

```tsx
// Banner Share Cuaca 1080×1350 (mockup C2/C3). Komponen BODOH: semua nilai
// sudah dihitung lib/cuaca-share-data.js. Dirender sebagai pratinjau di
// ShareCuacaModal dan dipotret Chromium di server (src/cuaca-share-entry.tsx),
// jadi gaya ditulis inline — tidak bergantung CSS Tailwind halaman.
import {
  BadgeCheck, CalendarDays, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSun,
  Droplets, MapPin, Snowflake, Sun, SunMedium, Thermometer, Wind,
} from 'lucide-react';
import type { CuacaIconKey, CuacaShareProps } from '../../../lib/cuaca-share-data.js';
import { CUACA_SHARE_H, CUACA_SHARE_W, formatDeg, formatTemp } from '../../../lib/cuaca-share-data.js';
import { CuacaOrnament, KhatamPanel } from './CuacaOrnament';

export interface CuacaShareAssets {
  photoSrc: string | null;
  logoSrc: string;
  agentPhotoSrc: string | null;
}

const FONT = "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const GOLD = '#F8DFA1';
const MINT = '#A7F3D0';
const MINT_SOFT = '#D1FAE5';

const ICONS: Record<CuacaIconKey, typeof Sun> = {
  sun: Sun, 'cloud-sun': CloudSun, cloud: Cloud, 'cloud-fog': CloudFog, 'cloud-drizzle': CloudDrizzle,
  'cloud-rain': CloudRain, snowflake: Snowflake, 'cloud-lightning': CloudLightning, thermometer: Thermometer,
};

function WeatherIcon({ name, size, color }: { name: CuacaIconKey; size: number; color: string }) {
  const Icon = ICONS[name] ?? Thermometer;
  return <Icon size={size} color={color} strokeWidth={2} style={{ flexShrink: 0 }} />;
}

function CityCard({ data, photoSrc }: { data: CuacaShareProps; photoSrc: string | null }) {
  return (
    <div
      data-city-card={photoSrc ? 'photo' : 'pattern'}
      style={{ position: 'relative', height: 400, flexShrink: 0, borderRadius: 32, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.18)' }}
    >
      {photoSrc ? (
        <>
          <img src={photoSrc} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(5,66,51,0) 45%, rgba(5,66,51,0.85) 100%)' }} />
        </>
      ) : (
        <KhatamPanel><WeatherIcon name={data.conditionIcon} size={230} color={GOLD} /></KhatamPanel>
      )}
      <div style={{ position: 'absolute', left: 24, bottom: 24, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 22px', borderRadius: 999, background: 'rgba(5,38,29,0.72)', border: '1px solid rgba(255,255,255,0.2)' }}>
        <MapPin size={28} color={GOLD} strokeWidth={2} />
        <span style={{ fontSize: 32, fontWeight: 800 }}>{data.cityName}</span>
        <span style={{ fontSize: 26, fontWeight: 600, color: MINT_SOFT }}>{data.country}</span>
      </div>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: typeof Sun; value: string; label: string }) {
  const Icon = icon;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, whiteSpace: 'nowrap' }}>
      <Icon size={30} color={MINT} strokeWidth={2} />
      <span style={{ fontSize: 30, fontWeight: 700 }}>{value}</span>
      <span style={{ fontSize: 26, fontWeight: 600, color: 'rgba(255,255,255,0.67)' }}>{label}</span>
    </div>
  );
}

function AgentPanel({ data, photoSrc }: { data: CuacaShareProps; photoSrc: string | null }) {
  const { agent } = data;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, padding: '24px 28px', borderRadius: 32, background: 'rgba(5,38,29,0.5)', border: '1px solid rgba(255,255,255,0.12)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, minWidth: 0, flex: 1 }}>
        <div style={{ width: 88, height: 88, flexShrink: 0, borderRadius: 44, border: `4px solid ${GOLD}`, overflow: 'hidden', background: '#2F5FA8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {photoSrc
            ? <img src={photoSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 34, fontWeight: 800 }}>{agent.initials}</span>}
        </div>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{ fontSize: agent.nameFontSize, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{agent.name}</span>
            <BadgeCheck size={32} color="#1D9BF0" strokeWidth={2} style={{ flexShrink: 0 }} />
          </div>
          <span style={{ fontSize: 24, fontWeight: 600, color: MINT }}>{agent.siteLabel}</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, padding: '16px 22px', borderRadius: 999, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}>
        <CalendarDays size={26} color={GOLD} strokeWidth={2} />
        <span style={{ fontSize: 26, fontWeight: 700, whiteSpace: 'nowrap' }}>{data.dateLabel}</span>
      </div>
    </div>
  );
}

export function CuacaShareTemplate({ data, assets }: { data: CuacaShareProps; assets: CuacaShareAssets }) {
  return (
    <div
      data-cuaca-share
      style={{
        position: 'relative', width: CUACA_SHARE_W, height: CUACA_SHARE_H, overflow: 'hidden',
        fontFamily: FONT, color: '#FFFFFF',
        background: 'linear-gradient(200deg, #0F6E56 0%, #0A5644 55%, #054233 100%)',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 120% 90% at 15% 85%, rgba(29,138,106,0.33), rgba(29,138,106,0) 70%)' }} />
      <CuacaOrnament />
      <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', gap: 30, padding: '64px 64px 56px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }}>
          <div>
            <div style={{ fontSize: 76, fontWeight: 800, letterSpacing: -2, lineHeight: 1.05 }}>Cuaca Hari Ini</div>
            <div style={{ fontSize: 28, fontWeight: 600, color: MINT, marginTop: 10 }}>{data.subtitle}</div>
          </div>
          <img src={assets.logoSrc} alt="Alhijaz" style={{ height: 120, width: 'auto', filter: 'brightness(0) invert(1)', opacity: 0.96 }} />
        </div>

        <CityCard data={data} photoSrc={assets.photoSrc} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
          <div style={{ fontSize: data.tempFontSize, fontWeight: 800, letterSpacing: -10, lineHeight: 0.9, whiteSpace: 'nowrap' }}>{formatDeg(data.temp)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <WeatherIcon name={data.conditionIcon} size={56} color={GOLD} />
              <span style={{ fontSize: data.conditionFontSize, fontWeight: 800, color: GOLD, whiteSpace: 'nowrap' }}>{data.conditionLabel}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 4, borderRadius: 2, background: GOLD, flexShrink: 0 }} />
              <span style={{ fontSize: 30, fontWeight: 600, color: MINT, whiteSpace: 'nowrap' }}>
                {`terasa ${formatDeg(data.feelsLike)} · ${formatTemp(data.tempMin)}–${formatDeg(data.tempMax)}`}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
          <Stat icon={Droplets} value={`${data.humidity}%`} label="Lembap" />
          <Stat icon={Wind} value={`${data.windSpeed} km/j`} label="Angin" />
          <Stat icon={SunMedium} value={`UV ${data.uvIndex}`} label={data.uvLabel} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '22px 28px', borderRadius: 28, background: 'rgba(5,38,29,0.4)', border: '1px solid rgba(255,255,255,0.12)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {data.forecast.map(f => (
              <div key={f.day} style={{ display: 'flex', alignItems: 'center', gap: 16, whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: 30, fontWeight: 700, color: GOLD }}>{f.day}</span>
                <WeatherIcon name={f.icon} size={38} color="#FFFFFF" />
                <span style={{ fontSize: 30, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{`${formatDeg(f.tempMin)} / ${formatDeg(f.tempMax)}`}</span>
              </div>
            ))}
          </div>
          {data.seasonalNote && (
            <>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.12)' }} />
              <div style={{ fontSize: 26, fontWeight: 400, color: MINT_SOFT, lineHeight: 1.35 }}>{data.seasonalNote}</div>
            </>
          )}
        </div>

        <div style={{ flex: 1 }} />
        <AgentPanel data={data} photoSrc={assets.agentPhotoSrc} />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test tests/cuaca-share-template.test.js`
Expected: PASS (3 tests). Jika regex style gagal karena urutan properti React, sesuaikan regex ke urutan yang dihasilkan React (`font-size:…;…;white-space:nowrap;overflow:hidden;text-overflow:ellipsis`) — perilaku yang dikunci tetap ukuran font + ellipsis.

- [ ] **Step 7: Prepare city photos** — `scripts/prepare-cuaca-photos.mjs`

```js
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
```

Run: `node scripts/prepare-cuaca-photos.mjs`
Expected: 5 baris `…jpg 1344×565 ~150 KB`. Buka tiap berkas (Read) dan pastikan badge logo "ALHIJAZ" tidak terlihat; bila masih terpotong sebagian, naikkan `BADGE_CUT` (maks 191 agar tinggi tetap muat) dan jalankan ulang.

- [ ] **Step 8: Commit**

```bash
git add src/components/cuaca-share/CuacaOrnament.tsx src/components/cuaca-share/CuacaShareTemplate.tsx tests/fixtures/cuaca-share-render.js tests/cuaca-share-template.test.js scripts/prepare-cuaca-photos.mjs public/cuaca-share/makkah.jpg public/cuaca-share/madinah.jpg public/cuaca-share/istanbul.jpg public/cuaca-share/cappadocia.jpg public/cuaca-share/dubai.jpg
git commit -m "feat(cuaca): template banner Share Cuaca (seri Kurs + ornamen khatam) + foto kota"
```

---

### Task 4: Antrean render & font bersama — `lib/headless-render.js`

**Files:**
- Create: `lib/headless-render.js`
- Modify: `lib/card-export.js` (fungsi `getFontCss`, variabel `renderLock`, `renderCardPng`)
- Test: `tests/headless-render.test.js`

**Interfaces:**
- Produces: `withRenderLock<T>(run: () => Promise<T>): Promise<T>`, `getEmbeddedFontCss(faces: [family, weight, file][], fontDir?): string`, `BROCHURE_FONT_DIR: string`.

- [ ] **Step 1: Write the failing test** — `tests/headless-render.test.js`

```js
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getEmbeddedFontCss, withRenderLock } from '../lib/headless-render.js';

const cardExport = readFileSync(new URL('../lib/card-export.js', import.meta.url), 'utf8');

test('render lock runs one job at a time and survives a failing job', async () => {
  const log = [];
  const job = (name, ms, fail) => () => new Promise((res, rej) => {
    log.push(`start ${name}`);
    setTimeout(() => { log.push(`end ${name}`); fail ? rej(new Error(name)) : res(name); }, ms);
  });
  const a = withRenderLock(job('a', 30, true));
  const b = withRenderLock(job('b', 5));
  await assert.rejects(a, /a/);
  assert.equal(await b, 'b');
  assert.deepEqual(log, ['start a', 'end a', 'start b', 'end b']);
});

test('font css embeds each face as base64 woff2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fonts-'));
  writeFileSync(join(dir, 'X.woff2'), Buffer.from('abc'));
  const css = getEmbeddedFontCss([['Inter', 800, 'X.woff2']], dir);
  assert.equal(css, "@font-face{font-family:'Inter';font-style:normal;font-weight:800;src:url(data:font/woff2;base64,YWJj) format('woff2');}");
});

test('card export uses the shared lock and font helper', () => {
  assert.match(cardExport, /from '\.\/headless-render\.js'/);
  assert.match(cardExport, /return withRenderLock\(run\);/);
  assert.doesNotMatch(cardExport, /let renderLock/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/headless-render.test.js`
Expected: FAIL — `Cannot find module '…/lib/headless-render.js'`.

- [ ] **Step 3: Implement `lib/headless-render.js`**

```js
// Bagian bersama render server di headless Chromium (kartu nama, banner cuaca).
// Satu antrean untuk semua: VPS kecil, satu Chromium pada satu waktu.
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const BROCHURE_FONT_DIR = resolve(ROOT, 'public/fonts/brochure');

const fontCssCache = new Map();

// Font di-embed sebagai data: agar halaman setContent mandiri (tanpa dependensi
// express static / port) dan font PASTI termuat sebelum screenshot.
export function getEmbeddedFontCss(faces, fontDir = BROCHURE_FONT_DIR) {
  const key = `${fontDir}|${faces.map(f => f.join(':')).join(',')}`;
  if (fontCssCache.has(key)) return fontCssCache.get(key);
  const css = faces.map(([family, weight, file]) => {
    const b64 = readFileSync(resolve(fontDir, file)).toString('base64');
    return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
  }).join('\n');
  fontCssCache.set(key, css);
  return css;
}

let renderLock = Promise.resolve();

export function withRenderLock(run) {
  const p = renderLock.then(run, run);
  renderLock = p.then(() => {}, () => {});
  return p;
}
```

- [ ] **Step 4: Refactor `lib/card-export.js`**

Tambah impor setelah impor `url`:

```js
import { getEmbeddedFontCss, withRenderLock } from './headless-render.js';
```

Ganti `let fontCssCache = null;  // string` (hapus baris itu) dan seluruh fungsi `getFontCss` menjadi:

```js
function getFontCss() {
  return getEmbeddedFontCss(FONT_FACES, FONT_DIR);
}
```

Hapus `let renderLock = Promise.resolve();` beserta komentarnya tetap ("Satu render pada satu waktu…") dan ganti tiga baris terakhir `renderCardPng`:

```js
  const p = renderLock.then(run, run);
  renderLock = p.then(() => {}, () => {});
  return p;
```

menjadi:

```js
  return withRenderLock(run);
```

`readFileSync` masih dipakai? Bila tidak lagi dipakai di `card-export.js`, hapus dari impor `fs` (tetap pertahankan `statSync`).

- [ ] **Step 5: Run tests**

Run: `node --test tests/headless-render.test.js && node --check lib/card-export.js && node -e "import('./lib/card-export.js').then(m=>console.log(Object.keys(m)))"`
Expected: PASS (3 tests); ekspor `validateCardExportBody, renderCardPng, handleCardExport`.

- [ ] **Step 6: Commit**

```bash
git add lib/headless-render.js lib/card-export.js tests/headless-render.test.js
git commit -m "refactor(render): antrean Chromium & font tersemat jadi lib/headless-render.js"
```

---

### Task 5: Render server — entry + `lib/cuaca-share-render.js`

**Files:**
- Create: `src/cuaca-share-entry.tsx`, `lib/cuaca-share-render.js`, `scripts/test-cuaca-image.mjs`
- Test: `tests/cuaca-share-render.test.js`

**Interfaces:**
- Consumes: `CuacaShareTemplate`, `CuacaShareAssets` (Task 3); `CUACA_SHARE_W/H`, `CuacaShareProps` (Task 2); `withRenderLock`, `getEmbeddedFontCss` (Task 4).
- Produces:
  - `isAllowedAgentPhotoUrl(url): boolean`
  - `fetchAgentPhotoDataUri(url, { timeoutMs?, fetchImpl? }): Promise<string|null>`
  - `loadCuacaShareAssets(data: CuacaShareProps, agentPhotoUrl, opts?): Promise<CuacaShareAssets>`
  - `buildCuacaShellHtml(payload, { bundle?, fontCss? }): string`
  - `renderCuacaShareJpeg({ data, assets }): Promise<Buffer>`

- [ ] **Step 1: Write the failing test** — `tests/cuaca-share-render.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCuacaShellHtml,
  fetchAgentPhotoDataUri,
  isAllowedAgentPhotoUrl,
  loadCuacaShareAssets,
} from '../lib/cuaca-share-render.js';

const okImage = (type = 'image/jpeg', size = 4) => async () => ({
  ok: true,
  headers: { get: () => type },
  arrayBuffer: async () => new Uint8Array(size).buffer,
});

test('agent photo hosts are allow-listed and https only', () => {
  assert.equal(isAllowedAgentPhotoUrl('https://sb.alhijaz.co/storage/v1/object/public/agent-photos/a.jpg'), true);
  assert.equal(isAllowedAgentPhotoUrl('https://ui-avatars.com/api/?name=A'), true);
  assert.equal(isAllowedAgentPhotoUrl('http://sb.alhijaz.co/a.jpg'), false);
  assert.equal(isAllowedAgentPhotoUrl('https://evil.example/a.jpg'), false);
  assert.equal(isAllowedAgentPhotoUrl('https://127.0.0.1/a.jpg'), false);
  assert.equal(isAllowedAgentPhotoUrl(''), false);
});

test('agent photo fetch degrades to null instead of failing the render', async () => {
  const url = 'https://sb.alhijaz.co/a.jpg';
  assert.match(await fetchAgentPhotoDataUri(url, { fetchImpl: okImage() }), /^data:image\/jpeg;base64,/);
  assert.equal(await fetchAgentPhotoDataUri('https://evil.example/a.jpg', { fetchImpl: okImage() }), null);
  assert.equal(await fetchAgentPhotoDataUri(url, { fetchImpl: okImage('text/html') }), null);
  assert.equal(await fetchAgentPhotoDataUri(url, { fetchImpl: okImage('image/png', 3 * 1024 * 1024 + 1) }), null);
  assert.equal(await fetchAgentPhotoDataUri(url, { fetchImpl: async () => ({ ok: false, headers: { get: () => '' } }) }), null);
  assert.equal(await fetchAgentPhotoDataUri(url, { fetchImpl: async () => { throw new Error('timeout'); } }), null);
});

test('assets embed the city photo and logo as data URIs; Hainan has no photo', async () => {
  const withPhoto = await loadCuacaShareAssets({ photo: 'makkah.jpg' }, '', {});
  assert.match(withPhoto.photoSrc, /^data:image\/jpeg;base64,/);
  assert.match(withPhoto.logoSrc, /^data:image\/svg\+xml;base64,/);
  assert.equal(withPhoto.agentPhotoSrc, null);
  const noPhoto = await loadCuacaShareAssets({ photo: null }, '', {});
  assert.equal(noPhoto.photoSrc, null);
});

test('shell html escapes "<" so payload strings cannot close the script tag', () => {
  const html = buildCuacaShellHtml({ data: { cityName: '</script><script>alert(1)</script>' } }, { bundle: '', fontCss: '' });
  assert.doesNotMatch(html, /<\/script><script>alert/);
  assert.match(html, /\\u003c\/script>/);
  assert.match(html, /<div id="banner"><\/div>/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/cuaca-share-render.test.js`
Expected: FAIL — `Cannot find module '…/lib/cuaca-share-render.js'`.

- [ ] **Step 3: Implement `src/cuaca-share-entry.tsx`**

```tsx
// Entry halaman render banner Share Cuaca — dibundel runtime oleh
// lib/cuaca-share-render.js dan dijalankan di headless Chromium. Props disuntik
// via window.CUACA_RENDER; hasil element-screenshot = persis pratinjau.
import { createRoot } from 'react-dom/client';
import { CuacaShareTemplate } from './components/cuaca-share/CuacaShareTemplate';
import type { CuacaShareAssets } from './components/cuaca-share/CuacaShareTemplate';
import type { CuacaShareProps } from '../lib/cuaca-share-data.js';

declare global {
  interface Window {
    CUACA_RENDER: { data: CuacaShareProps; assets: CuacaShareAssets };
    __ready?: boolean;
    __renderError?: string;
  }
}

async function main() {
  try {
    const { data, assets } = window.CUACA_RENDER;
    createRoot(document.getElementById('banner')!).render(<CuacaShareTemplate data={data} assets={assets} />);
    await new Promise(r => setTimeout(r, 50));
    await document.fonts.ready;
    const imgs = Array.from(document.querySelectorAll('img'));
    await Promise.all(imgs.map(img => img.complete
      ? Promise.resolve()
      : new Promise(res => { img.addEventListener('load', res); img.addEventListener('error', res); })));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    window.__ready = true;
  } catch (e: any) {
    window.__renderError = String(e?.message || e);
  }
}

main();
```

- [ ] **Step 4: Implement `lib/cuaca-share-render.js`**

```js
// Render banner Share Cuaca di server: bundle src/cuaca-share-entry.tsx (komponen
// yang sama dengan pratinjau) → headless Chromium → JPEG 1080×1350 (spec 2026-10-12).
import { buildSync } from 'esbuild';
import { readFileSync, statSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { CUACA_SHARE_H, CUACA_SHARE_W } from './cuaca-share-data.js';
import { getEmbeddedFontCss, withRenderLock } from './headless-render.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = resolve(ROOT, 'src/cuaca-share-entry.tsx');
const BUNDLE_INPUTS = [
  ENTRY,
  resolve(ROOT, 'src/components/cuaca-share/CuacaShareTemplate.tsx'),
  resolve(ROOT, 'src/components/cuaca-share/CuacaOrnament.tsx'),
  resolve(ROOT, 'lib/cuaca-share-data.js'),
];
const PHOTO_DIR = resolve(ROOT, 'public/cuaca-share');
const LOGO_PATH = resolve(ROOT, 'public/logo-alhijaz-besar.svg');
const FONT_FACES = [
  ['Inter', 400, 'Inter-Regular.woff2'],
  ['Inter', 600, 'Inter-SemiBold.woff2'],
  ['Inter', 700, 'Inter-Bold.woff2'],
  ['Inter', 800, 'Inter-ExtraBold.woff2'],
];
// Sinkron dengan PHOTO_HOSTS di lib/card-export.js (foto agent: storage sendiri + ui-avatars).
const AGENT_PHOTO_HOSTS = new Set(['sb.alhijaz.co', 'alhijaz.co', 'www.alhijaz.co', 'ui-avatars.com']);
const AGENT_PHOTO_TYPES = /^image\/(jpeg|png|webp|gif|svg\+xml)$/;
const AGENT_PHOTO_MAX_BYTES = 3 * 1024 * 1024;

let bundleCache = null; // { key, code }
let logoDataUri = null;

function getBundle() {
  const key = BUNDLE_INPUTS.map(f => statSync(f).mtimeMs).join(':');
  if (bundleCache?.key === key) return bundleCache.code;
  const out = buildSync({
    entryPoints: [ENTRY],
    bundle: true,
    write: false,
    format: 'iife',
    jsx: 'automatic',
    minify: true,
    absWorkingDir: ROOT,
    logLevel: 'silent',
  });
  bundleCache = { key, code: out.outputFiles[0].text };
  return bundleCache.code;
}

function getLogoDataUri() {
  logoDataUri ||= `data:image/svg+xml;base64,${readFileSync(LOGO_PATH).toString('base64')}`;
  return logoDataUri;
}

export function isAllowedAgentPhotoUrl(url) {
  try {
    const u = new URL(String(url || ''));
    return u.protocol === 'https:' && AGENT_PHOTO_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

// Foto agent gagal (host asing, lambat, bukan gambar, terlalu besar) → null →
// template memakai inisial. Render tidak pernah gagal karena foto.
export async function fetchAgentPhotoDataUri(url, { timeoutMs = 4000, fetchImpl = fetch } = {}) {
  if (!isAllowedAgentPhotoUrl(url)) return null;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const type = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!AGENT_PHOTO_TYPES.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > AGENT_PHOTO_MAX_BYTES) return null;
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

export async function loadCuacaShareAssets(data, agentPhotoUrl, opts = {}) {
  const photoSrc = data.photo
    ? `data:image/jpeg;base64,${readFileSync(resolve(PHOTO_DIR, data.photo)).toString('base64')}`
    : null;
  return {
    photoSrc,
    logoSrc: getLogoDataUri(),
    agentPhotoSrc: await fetchAgentPhotoDataUri(agentPhotoUrl, opts),
  };
}

export function buildCuacaShellHtml(payload, { bundle, fontCss } = {}) {
  // "<" di-escape agar string payload tak bisa menutup tag <script>.
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{background:#054233}
${fontCss ?? getEmbeddedFontCss(FONT_FACES)}
</style></head><body><div id="banner"></div><script>window.CUACA_RENDER = ${json};</script><script>${bundle ?? getBundle()}</script></body></html>`;
}

export async function renderCuacaShareJpeg({ data, assets }) {
  return withRenderLock(async () => {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        viewport: { width: CUACA_SHARE_W, height: CUACA_SHARE_H },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      await page.setContent(buildCuacaShellHtml({ data, assets }), { waitUntil: 'domcontentloaded' });
      await page.waitForFunction('window.__ready === true || window.__renderError', null, { timeout: 25000 });
      const err = await page.evaluate('window.__renderError || null');
      if (err) throw new Error(`render page: ${err}`);
      const el = await page.$('[data-cuaca-share]');
      if (!el) throw new Error('elemen banner tidak ditemukan');
      return await el.screenshot({ type: 'jpeg', quality: 88 });
    } finally {
      await browser.close().catch(() => {});
    }
  });
}
```

- [ ] **Step 5: Run tests**

Run: `node --test tests/cuaca-share-render.test.js`
Expected: PASS (4 tests).

- [ ] **Step 6: Render smoke script** — `scripts/test-cuaca-image.mjs`

```js
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
```

Run: `node scripts/test-cuaca-image.mjs`
Expected: 3 berkas JPEG 1080×1350. Buka masing-masing (Read): Mekkah mirip frame C2; Hainan mirip C3 dengan inisial "NN"; kasus ekstrem: `−12°` + "Cerah berawan" muat dalam satu baris, nama agent terpotong `…` tanpa menabrak pil tanggal.

- [ ] **Step 7: Commit**

```bash
git add src/cuaca-share-entry.tsx lib/cuaca-share-render.js scripts/test-cuaca-image.mjs tests/cuaca-share-render.test.js
git commit -m "feat(cuaca): render banner Share Cuaca di server (esbuild + Chromium)"
```

---

### Task 6: Cache disk — `lib/cuaca-share-cache.mjs`

**Files:**
- Create: `lib/cuaca-share-cache.mjs`
- Test: `tests/cuaca-share-cache.test.js`

**Interfaces:**
- Produces:
  - `CUACA_SHARE_TEMPLATE_VERSION = 'c2-v1'`, `DEFAULT_CUACA_SHARE_CACHE_DIR`, `DEFAULT_CUACA_SHARE_CACHE_TTL_MS` (2 hari), `DEFAULT_CUACA_SHARE_CACHE_MAX_BYTES` (256 MB)
  - `buildCuacaShareCacheKey({ cityKey, syncedAt, agent: {slug,name,phone,photo}, templateVersion? }): string` → `{slug}-{city}-{sha16}.jpg`
  - `getOrCreateCuacaShareImage({ cityKey, syncedAt, agent, dateKey, render: () => Promise<Buffer>, cacheDir?, templateVersion? }): Promise<{ buffer, cacheHit, path, key }>`
  - `cleanupCuacaShareCache({ cacheDir?, ttlMs?, maxBytes?, now? }): Promise<{ scanned, deletedExpired, deletedForSize, freedBytes, remainingBytes }>`

- [ ] **Step 1: Write the failing test** — `tests/cuaca-share-cache.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, stat, utimes, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildCuacaShareCacheKey,
  cleanupCuacaShareCache,
  getOrCreateCuacaShareImage,
} from '../lib/cuaca-share-cache.mjs';

const agent = { slug: 'bagas', name: 'Bagas Pramudita', phone: '0812', photo: 'https://sb.alhijaz.co/a.jpg' };
const SYNC = '2026-10-12T05:00:08Z';
const tempDir = () => mkdtemp(path.join(tmpdir(), 'cuaca-share-cache-'));

test('cache key changes with weather sync, agent photo, city and template', () => {
  const base = buildCuacaShareCacheKey({ cityKey: 'makkah', syncedAt: SYNC, agent, templateVersion: 't1' });
  assert.match(base, /^bagas-makkah-[a-f0-9]{16}\.jpg$/);
  assert.equal(buildCuacaShareCacheKey({ cityKey: 'makkah', syncedAt: SYNC, agent, templateVersion: 't1' }), base);
  for (const changed of [
    { cityKey: 'makkah', syncedAt: '2026-10-12T08:00:00Z', agent, templateVersion: 't1' },
    { cityKey: 'makkah', syncedAt: SYNC, agent: { ...agent, photo: 'https://sb.alhijaz.co/b.jpg' }, templateVersion: 't1' },
    { cityKey: 'madinah', syncedAt: SYNC, agent, templateVersion: 't1' },
    { cityKey: 'makkah', syncedAt: SYNC, agent, templateVersion: 't2' },
  ]) assert.notEqual(buildCuacaShareCacheKey(changed), base);
});

test('second request is a cache hit; concurrent requests share one render', async () => {
  const cacheDir = await tempDir();
  let calls = 0;
  const render = async () => { calls += 1; await new Promise(r => setTimeout(r, 20)); return Buffer.from(`img-${calls}`); };
  const args = { cityKey: 'makkah', syncedAt: SYNC, agent, dateKey: '20261012', render, cacheDir };
  const [a, b] = await Promise.all([getOrCreateCuacaShareImage(args), getOrCreateCuacaShareImage(args)]);
  assert.equal(calls, 1);
  assert.equal(a.buffer.toString(), 'img-1');
  assert.equal(b.buffer.toString(), 'img-1');
  const third = await getOrCreateCuacaShareImage(args);
  assert.equal(third.cacheHit, true);
  assert.equal(calls, 1);
  assert.deepEqual(await readdir(cacheDir), ['2026-10-12']);
});

test('empty render result is rejected and not cached', async () => {
  const cacheDir = await tempDir();
  await assert.rejects(
    getOrCreateCuacaShareImage({ cityKey: 'makkah', syncedAt: SYNC, agent, dateKey: '20261012', render: async () => Buffer.alloc(0), cacheDir }),
    /kosong/,
  );
});

test('cleanup deletes expired files then oldest files beyond the size cap', async () => {
  const cacheDir = await tempDir();
  const dir = path.join(cacheDir, '2026-10-10');
  await mkdir(dir, { recursive: true });
  const now = Date.now();
  const files = [['old.jpg', 3 * 864e5, 10], ['mid.jpg', 3600e3, 10], ['new.jpg', 60e3, 10]];
  for (const [name, age, size] of files) {
    const p = path.join(dir, name);
    await writeFile(p, Buffer.alloc(size));
    await utimes(p, (now - age) / 1000, (now - age) / 1000);
  }
  const stats = await cleanupCuacaShareCache({ cacheDir, ttlMs: 2 * 864e5, maxBytes: 15, now });
  assert.equal(stats.deletedExpired, 1);
  assert.equal(stats.deletedForSize, 1);
  assert.deepEqual(await readdir(dir), ['new.jpg']);
  assert.ok((await stat(path.join(dir, 'new.jpg'))).isFile());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/cuaca-share-cache.test.js`
Expected: FAIL — `Cannot find module '…/lib/cuaca-share-cache.mjs'`.

- [ ] **Step 3: Implement `lib/cuaca-share-cache.mjs`**

```js
// Cache disk banner Share Cuaca (spec 2026-10-12). Pola lib/kurs-share-cache.mjs,
// sengaja modul terpisah agar Kurs tidak tersentuh. Gambar dibuat ulang hanya
// setelah cron cuaca (syncedAt) berganti atau identitas agent berubah.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const CUACA_SHARE_TEMPLATE_VERSION = 'c2-v1';
export const DEFAULT_CUACA_SHARE_CACHE_DIR = path.resolve(__dirname, '..', 'data', 'cuaca-share-cache');
export const DEFAULT_CUACA_SHARE_CACHE_TTL_MS = 2 * 24 * 60 * 60 * 1000;
export const DEFAULT_CUACA_SHARE_CACHE_MAX_BYTES = 256 * 1024 * 1024;

const inFlight = new Map();

function safeSegment(value, fallback) {
  const safe = String(value || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return safe || fallback;
}

export function buildCuacaShareCacheKey({ cityKey, syncedAt, agent, templateVersion = CUACA_SHARE_TEMPLATE_VERSION }) {
  const payload = {
    templateVersion,
    cityKey: String(cityKey || ''),
    syncedAt: String(syncedAt || ''),
    agent: {
      slug: String(agent?.slug || ''),
      name: String(agent?.name || ''),
      phone: String(agent?.phone || ''),
      photo: String(agent?.photo || ''),
    },
  };
  const hash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
  return `${safeSegment(agent?.slug, 'agent')}-${safeSegment(cityKey, 'kota')}-${hash}.jpg`;
}

function dateDirFromKey(dateKey) {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(dateKey || ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

async function readCached(filePath) {
  try {
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

async function writeFileAtomic(filePath, buffer) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, buffer);
  await fs.rename(tmp, filePath);
}

export async function getOrCreateCuacaShareImage({
  cityKey,
  syncedAt,
  agent,
  dateKey,
  render,
  cacheDir = DEFAULT_CUACA_SHARE_CACHE_DIR,
  templateVersion = CUACA_SHARE_TEMPLATE_VERSION,
}) {
  if (!agent?.slug) throw new Error('Agent slug tidak tersedia');
  const key = buildCuacaShareCacheKey({ cityKey, syncedAt, agent, templateVersion });
  const filePath = path.join(cacheDir, dateDirFromKey(dateKey), key);

  const cached = await readCached(filePath);
  if (cached) return { buffer: cached, cacheHit: true, path: filePath, key };
  if (inFlight.has(filePath)) return inFlight.get(filePath);

  const promise = (async () => {
    const again = await readCached(filePath);
    if (again) return { buffer: again, cacheHit: true, path: filePath, key };
    const buffer = await render();
    if (!buffer?.length) throw new Error('Gambar cuaca hasil render kosong');
    await writeFileAtomic(filePath, buffer);
    return { buffer, cacheHit: false, path: filePath, key };
  })();

  inFlight.set(filePath, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(filePath);
  }
}

async function listCacheFiles(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err?.code === 'ENOENT') return [];
    throw err;
  }
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listCacheFiles(fullPath));
    } else if (entry.isFile() && /\.jpe?g$/i.test(entry.name)) {
      const s = await fs.stat(fullPath);
      files.push({ path: fullPath, size: s.size, mtimeMs: s.mtimeMs });
    }
  }
  return files;
}

async function removeEmptyDirs(dir, root = dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) await removeEmptyDirs(path.join(dir, entry.name), root);
  }
  if (dir === root) return;
  try {
    if ((await fs.readdir(dir)).length === 0) await fs.rmdir(dir);
  } catch {
    // Best effort.
  }
}

export async function cleanupCuacaShareCache({
  cacheDir = DEFAULT_CUACA_SHARE_CACHE_DIR,
  ttlMs = DEFAULT_CUACA_SHARE_CACHE_TTL_MS,
  maxBytes = DEFAULT_CUACA_SHARE_CACHE_MAX_BYTES,
  now = Date.now(),
} = {}) {
  await fs.mkdir(cacheDir, { recursive: true });
  const files = await listCacheFiles(cacheDir);
  const stats = { scanned: files.length, deletedExpired: 0, deletedForSize: 0, freedBytes: 0, remainingBytes: 0 };
  const remaining = [];

  for (const file of files) {
    if (now - file.mtimeMs > ttlMs) {
      try {
        await fs.unlink(file.path);
        stats.deletedExpired += 1;
        stats.freedBytes += file.size;
      } catch {
        // Sudah dihapus proses lain.
      }
    } else {
      remaining.push(file);
    }
  }

  let total = remaining.reduce((sum, f) => sum + f.size, 0);
  if (maxBytes > 0 && total > maxBytes) {
    remaining.sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const file of remaining) {
      if (total <= maxBytes) break;
      try {
        await fs.unlink(file.path);
        total -= file.size;
        stats.deletedForSize += 1;
        stats.freedBytes += file.size;
      } catch {
        // Sudah dihapus proses lain.
      }
    }
  }

  stats.remainingBytes = Math.max(0, total);
  await removeEmptyDirs(cacheDir);
  return stats;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/cuaca-share-cache.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/cuaca-share-cache.mjs tests/cuaca-share-cache.test.js
git commit -m "feat(cuaca): cache disk banner Share Cuaca per agent×kota×sinkron"
```

---

### Task 7: Endpoint server, cron pembersihan, label analytics

**Files:**
- Modify: `server.js` — impor; route baru tepat setelah handler `app.get('/api/weather/cities', …)`; blok `runKursShareCacheCleanup` (±baris 1021-1037); `FEATURE_LABELS` (±19245) dan `ACTION_LABELS` (±19314)
- Test: `tests/cuaca-share-endpoint.test.js`

**Interfaces:**
- Consumes: `resolveCuacaShareCity`, `buildCuacaShareProps` (Task 2); `loadCuacaShareAssets`, `renderCuacaShareJpeg` (Task 5); `getOrCreateCuacaShareImage`, `cleanupCuacaShareCache` (Task 6); `getAgentById`, `weatherMemory`, `weatherDbReadAt`, `WEATHER_DB_READ_TTL_MS`, `loadWeatherFromSupabase` (sudah ada di `server.js`).
- Produces: `GET /api/weather/share-image?city={key}` → `image/jpeg` | 400 | 404 | 503 | 500.

- [ ] **Step 1: Write the failing test** — `tests/cuaca-share-endpoint.test.js`

```js
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const start = server.indexOf("app.get('/api/weather/share-image'");
const route = start >= 0 ? server.slice(start, server.indexOf('\n});', start)) : '';

test('share-image route is authenticated and takes identity from the session only', () => {
  assert.ok(route, 'route /api/weather/share-image ada');
  assert.match(route, /authMiddleware/);
  assert.match(route, /getAgentById\(req\.user\.id\)/);
  assert.match(route, /resolveCuacaShareCity\(req\.query\.city, weatherMemory\.cities\)/);
  assert.doesNotMatch(route, /req\.query\.(?!city\b)\w+/);
  assert.doesNotMatch(route, /fetchAllCitiesWeather|api\.open-meteo/);
});

test('validation runs before render and cache', () => {
  const validate = route.indexOf('resolveCuacaShareCity(');
  assert.ok(validate > 0);
  assert.ok(validate < route.indexOf('getOrCreateCuacaShareImage('));
  assert.ok(validate < route.indexOf('getAgentById('));
  assert.match(route, /'X-Cuaca-Image-Cache': result\.cacheHit \? 'HIT' : 'MISS'/);
  assert.match(route, /Sentry\.captureException/);
});

test('cache cleanup runs at startup and in the 03:30 WIB cron', () => {
  assert.match(server, /runCuacaShareCacheCleanup\('startup'\);/);
  assert.match(server, /cron\.schedule\('30 3 \* \* \*', \(\) => \{\n\s+runKursShareCacheCleanup\('daily'\);\n\s+runCuacaShareCacheCleanup\('daily'\);/);
});

test('analytics events are registered so they are not dropped', () => {
  assert.match(server, /open_share_cuaca: 'Bagikan Cuaca'/);
  assert.match(server, /download_share_cuaca: 'Unduh Gambar Cuaca'/);
  assert.match(server, /share_cuaca: 'Bagikan Cuaca'/);
  assert.match(server, /copy_cuaca_caption: 'Salin Caption Cuaca'/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/cuaca-share-endpoint.test.js`
Expected: FAIL — `route /api/weather/share-image ada`.

- [ ] **Step 3: Imports** — di `server.js`, setelah `import { WEATHER_CITIES } from './lib/weather-cities.js';`:

```js
import { buildCuacaShareProps, resolveCuacaShareCity } from './lib/cuaca-share-data.js';
import { loadCuacaShareAssets, renderCuacaShareJpeg } from './lib/cuaca-share-render.js';
import { cleanupCuacaShareCache, getOrCreateCuacaShareImage } from './lib/cuaca-share-cache.mjs';
```

- [ ] **Step 4: Route** — sisipkan tepat setelah penutup `app.get('/api/weather/cities', …)` (`});`):

```js
// GET /api/weather/share-image?city=makkah — banner Share Cuaca 4:5 per agent
// (spec 2026-10-12). Identitas agent HANYA dari sesi; data dari cache cuaca.
app.get('/api/weather/share-image', authMiddleware, async (req, res) => {
  try {
    const now = Date.now();
    if (!weatherMemory || now - weatherDbReadAt >= WEATHER_DB_READ_TTL_MS) {
      await loadWeatherFromSupabase();
      weatherDbReadAt = now;
    }
    if (!weatherMemory) {
      return res.status(503).json({ success: false, error: 'Data cuaca belum tersedia' });
    }
    const resolved = resolveCuacaShareCity(req.query.city, weatherMemory.cities);
    if (resolved.status !== 200) {
      return res.status(resolved.status).json({ success: false, error: resolved.error });
    }

    const agent = await getAgentById(req.user.id);
    if (!agent) return res.status(404).json({ success: false, error: 'Agent not found' });
    const identity = {
      name: agent.name || '',
      phone: agent.phone || '',
      photo: agent.photo || '',
      slug: agent.slug || req.user.slug,
    };
    const { syncedAt } = weatherMemory;
    const data = buildCuacaShareProps(resolved.city, identity, { syncedAt });
    const result = await getOrCreateCuacaShareImage({
      cityKey: data.cityKey,
      syncedAt,
      agent: identity,
      dateKey: data.dateKey,
      render: async () => renderCuacaShareJpeg({ data, assets: await loadCuacaShareAssets(data, identity.photo) }),
    });

    res.set({
      'Content-Type': 'image/jpeg',
      'Content-Length': String(result.buffer.length),
      'Content-Disposition': `inline; filename="cuaca-${data.cityKey}-${data.dateKey}.jpg"`,
      'Cache-Control': 'no-store',
      'X-Cuaca-Image-Cache': result.cacheHit ? 'HIT' : 'MISS',
    });
    res.send(result.buffer);
  } catch (err) {
    console.error('[CuacaShare] Generate error:', err.message);
    try { Sentry.captureException(err); } catch { /* noop */ }
    res.status(500).json({ success: false, error: 'Gagal membuat gambar cuaca' });
  }
});
```

- [ ] **Step 5: Cleanup cron** — ganti blok:

```js
runKursShareCacheCleanup('startup');
cron.schedule('30 3 * * *', () => {
  runKursShareCacheCleanup('daily');
}, { timezone: 'Asia/Jakarta' });
```

menjadi:

```js
async function runCuacaShareCacheCleanup(reason = 'scheduled') {
  try {
    const stats = await cleanupCuacaShareCache();
    console.log(
      `[CuacaShareCache] Cleanup ${reason}: scanned=${stats.scanned}, ` +
      `expired=${stats.deletedExpired}, size=${stats.deletedForSize}, ` +
      `freed=${Math.round(stats.freedBytes / 1024)}KB, remaining=${Math.round(stats.remainingBytes / 1024)}KB`
    );
  } catch (err) {
    console.warn('[CuacaShareCache] Cleanup failed:', err.message);
  }
}

runKursShareCacheCleanup('startup');
runCuacaShareCacheCleanup('startup');
cron.schedule('30 3 * * *', () => {
  runKursShareCacheCleanup('daily');
  runCuacaShareCacheCleanup('daily');
}, { timezone: 'Asia/Jakarta' });
```

- [ ] **Step 6: Analytics labels** — di `FEATURE_LABELS`, setelah `open_share_kurs: 'Bagikan Kurs',` tambah ` open_share_cuaca: 'Bagikan Cuaca',`. Di `ACTION_LABELS`, setelah `copy_kurs_caption: 'Salin Caption Kurs',` tambah baris:

```js
  download_share_cuaca: 'Unduh Gambar Cuaca', share_cuaca: 'Bagikan Cuaca',
  copy_cuaca_caption: 'Salin Caption Cuaca',
```

- [ ] **Step 7: Run tests + syntax**

Run: `node --test tests/cuaca-share-endpoint.test.js tests/weather-shared-modules.test.js && node --check server.js`
Expected: PASS (8 tests), syntax OK.

- [ ] **Step 8: Commit**

```bash
git add server.js tests/cuaca-share-endpoint.test.js
git commit -m "feat(cuaca): endpoint /api/weather/share-image + cron pembersihan + label analytics"
```

---

### Task 8: Sheet "Bagikan Cuaca" + pil Share di widget

**Files:**
- Create: `src/components/ShareCuacaModal.tsx`
- Modify: `src/components/CuacaWidget.tsx` (tipe data, `syncedAt`, header, modal), `src/components/DashboardLayout.tsx:1544` (`<CuacaWidget />`)
- Test: `tests/cuaca-share-ui.test.js`

**Interfaces:**
- Consumes: `buildCuacaShareProps`, `buildCuacaCaption`, `CUACA_SHARE_W/H`, `CuacaShareCity` (Task 2); `CuacaShareTemplate` (Task 3); endpoint Task 7.
- Produces: `ShareCuacaModal({ open, onClose, city: CuacaShareCity, syncedAt: string|null, agent: CuacaShareAgent })`, `interface CuacaShareAgent { name: string; phone: string; photo: string; slug: string }`; `CuacaWidget({ agent?: CuacaShareAgent })`.

- [ ] **Step 1: Write the failing test** — `tests/cuaca-share-ui.test.js`

```js
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const modal = read('src/components/ShareCuacaModal.tsx');
const widget = read('src/components/CuacaWidget.tsx');
const dashboard = read('src/components/DashboardLayout.tsx');

test('modal prefetches the server image for the active city and reuses it', () => {
  assert.match(modal, /`\/api\/weather\/share-image\?city=\$\{encodeURIComponent\(city\.key\)\}`/);
  assert.match(modal, /blobRef\.current/);
  assert.match(modal, /<CuacaShareTemplate data=\{data\} assets=\{previewAssets\} \/>/);
  assert.match(modal, /photoSrc: data\.photo \? `\/cuaca-share\/\$\{data\.photo\}` : null/);
});

test('modal tracks the four registered events with the city', () => {
  assert.match(modal, /trackEvent\('feature', 'open_share_cuaca', \{ city: city\.key \}\)/);
  assert.match(modal, /trackEvent\('action', 'download_share_cuaca', \{ city: city\.key \}\)/);
  assert.match(modal, /trackEvent\('action', 'share_cuaca', \{ city: city\.key \}\)/);
  assert.match(modal, /trackEvent\('action', 'copy_cuaca_caption', \{ city: city\.key \}\)/);
});

test('caption uses the shared builder and the normalized WA number', () => {
  assert.match(modal, /buildCuacaCaption\(data, \{ waNumber: normalizeWaNumber\(agent\.phone\) \}\)/);
});

test('modal closes on Android back and has a retry path', () => {
  assert.match(modal, /useBackToClose\(open, onClose\)/);
  assert.match(modal, /Gagal membuat gambar/);
  assert.match(modal, /Coba lagi/);
});

test('widget shows the Share pill only with data and an agent, and passes syncedAt', () => {
  assert.match(widget, /setSyncedAt\(json\.syncedAt \?\? null\)/);
  assert.match(widget, /\{agent && \(\s*<button[\s\S]*aria-label="Bagikan cuaca"/);
  assert.match(widget, /<ShareCuacaModal[\s\S]*city=\{city\}[\s\S]*syncedAt=\{syncedAt\}[\s\S]*agent=\{agent\}/);
  assert.match(dashboard, /<CuacaWidget agent=\{\{ name: agentData\.name, phone: agentData\.phone, photo: agentData\.photo, slug: agentData\.slug \}\} \/>/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/cuaca-share-ui.test.js`
Expected: FAIL — `ENOENT … ShareCuacaModal.tsx`.

- [ ] **Step 3: Implement `src/components/ShareCuacaModal.tsx`**

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Copy, Download, Loader2, RotateCcw, Share2, X } from 'lucide-react';
import { CuacaShareTemplate } from './cuaca-share/CuacaShareTemplate';
import type { CuacaShareAssets } from './cuaca-share/CuacaShareTemplate';
import { buildCuacaCaption, buildCuacaShareProps, CUACA_SHARE_H, CUACA_SHARE_W } from '../../lib/cuaca-share-data.js';
import type { CuacaShareCity } from '../../lib/cuaca-share-data.js';
import { trackEvent } from '../utils/analytics';
import { canShareFiles, downloadBlob, isTouchPrimary } from '../utils/share';
import { normalizeWaNumber } from '../utils/phone';
import { useBackToClose } from '../hooks/useBackToClose';
import { lockDocumentScroll } from '../lib/scrollLock';
import { getAuthHeaders } from '../lib/authSession';

export interface CuacaShareAgent {
  name: string;
  phone: string;
  photo: string;
  slug: string;
}

export interface ShareCuacaModalProps {
  open: boolean;
  onClose: () => void;
  city: CuacaShareCity;
  syncedAt: string | null;
  agent: CuacaShareAgent;
}

const PREVIEW_MAX_WIDTH = 420;
const PREVIEW_MIN_WIDTH = 260;
const PREVIEW_FRAME_INSET = 32;
const LOGO_SRC = '/logo-alhijaz-besar.svg';

type ImageState = 'loading' | 'ready' | 'error';

/** Gestur ketuk sudah kedaluwarsa → share sheet pasti ditolak (pola ShareKursModal). */
function tapActivationExpired(): boolean {
  const activation = (navigator as { userActivation?: UserActivation }).userActivation;
  return activation ? !activation.isActive : false;
}

export default function ShareCuacaModal({ open, onClose, city, syncedAt, agent }: ShareCuacaModalProps) {
  const [imageState, setImageState] = useState<ImageState>('loading');
  const [attempt, setAttempt] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [readyFile, setReadyFile] = useState<File | null>(null);
  const [previewScale, setPreviewScale] = useState(PREVIEW_MAX_WIDTH / CUACA_SHARE_W);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const blobRef = useRef<Blob | null>(null);

  const data = useMemo(() => buildCuacaShareProps(city, agent, { syncedAt }), [city, agent, syncedAt]);
  const previewAssets: CuacaShareAssets = useMemo(() => ({
    photoSrc: data.photo ? `/cuaca-share/${data.photo}` : null,
    logoSrc: LOGO_SRC,
    agentPhotoSrc: agent.photo || null,
  }), [data.photo, agent.photo]);
  const fileName = `cuaca-${data.cityKey}-${data.dateKey}.jpg`;
  const showShareButton = isTouchPrimary() && typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useBackToClose(open, onClose);
  useEffect(() => (open ? lockDocumentScroll() : undefined), [open]);

  useEffect(() => {
    if (open) trackEvent('feature', 'open_share_cuaca', { city: city.key });
  }, [open, city.key]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Ambil JPEG server di latar begitu sheet terbuka: saat tombol diketuk berkas
  // sudah siap, jadi navigator.share() dipanggil tanpa await (gestur iOS aman).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    blobRef.current = null;
    setReadyFile(null);
    setImageState('loading');
    (async () => {
      try {
        const res = await fetch(`/api/weather/share-image?city=${encodeURIComponent(city.key)}`, {
          headers: getAuthHeaders(),
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (cancelled) return;
        blobRef.current = blob;
        setImageState('ready');
      } catch (err) {
        if (cancelled) return;
        console.error('[ShareCuaca] Gambar gagal:', err);
        setImageState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [open, city.key, syncedAt, attempt]);

  const computeScale = useCallback(() => {
    if (!previewContainerRef.current) return;
    const available = Math.max(0, previewContainerRef.current.clientWidth - PREVIEW_FRAME_INSET);
    setPreviewScale(Math.max(PREVIEW_MIN_WIDTH, Math.min(available, PREVIEW_MAX_WIDTH)) / CUACA_SHARE_W);
  }, []);

  useEffect(() => {
    if (!open) return;
    computeScale();
    window.addEventListener('resize', computeScale);
    return () => window.removeEventListener('resize', computeScale);
  }, [open, computeScale]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleDownload = () => {
    const blob = blobRef.current;
    if (!blob) return;
    downloadBlob(blob, fileName);
    trackEvent('action', 'download_share_cuaca', { city: city.key });
  };

  const shareFile = async (file: File) => {
    try {
      await navigator.share({ files: [file] });
      trackEvent('action', 'share_cuaca', { city: city.key });
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      if (e?.name === 'NotAllowedError') {
        setReadyFile(file);
        return;
      }
      console.error('[ShareCuaca] Share gagal:', e);
      downloadBlob(file, file.name);
      showToast('Gagal membuka menu bagikan. Gambar diunduh sebagai gantinya.');
    }
  };

  const handleShare = () => {
    if (readyFile) {
      const file = readyFile;
      setReadyFile(null);
      void shareFile(file);
      return;
    }
    const blob = blobRef.current;
    if (!blob) return;
    const file = new File([blob], fileName, { type: 'image/jpeg' });
    if (!canShareFiles([file])) {
      downloadBlob(blob, fileName);
      showToast('Perangkat ini tidak bisa berbagi langsung. Gambar diunduh.');
      return;
    }
    if (tapActivationExpired()) {
      setReadyFile(file);
      return;
    }
    void shareFile(file);
  };

  const handleCopyCaption = async () => {
    const caption = buildCuacaCaption(data, { waNumber: normalizeWaNumber(agent.phone) });
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(caption);
      } else {
        const ta = document.createElement('textarea');
        ta.value = caption;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      showToast('Caption tersalin');
      trackEvent('action', 'copy_cuaca_caption', { city: city.key });
    } catch (e) {
      console.error('[ShareCuaca] Copy gagal:', e);
      showToast('Gagal menyalin caption');
    }
  };

  const busy = imageState !== 'ready';
  const previewW = CUACA_SHARE_W * previewScale;
  const previewH = CUACA_SHARE_H * previewScale;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[9999] bg-white dark:bg-slate-900 flex flex-col"
          initial={{ opacity: 0, y: '100%' }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        >
          <div className="flex-none sticky top-0 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-gray-200/60 dark:border-slate-700/60 px-5 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] flex justify-between items-center shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate pr-4">Bagikan Cuaca</h2>
            <button
              onClick={onClose}
              aria-label="Tutup"
              className="touch-hit relative p-2 bg-gray-100 dark:bg-slate-800 rounded-full text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors shrink-0"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto bg-gray-100 dark:bg-slate-950 px-5 py-6">
            <div ref={previewContainerRef} className="max-w-xl mx-auto">
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3 flex justify-center">
                <div style={{ width: previewW, height: previewH, position: 'relative', borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
                  <div style={{ transform: `scale(${previewScale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0, width: CUACA_SHARE_W, height: CUACA_SHARE_H }}>
                    <CuacaShareTemplate data={data} assets={previewAssets} />
                  </div>
                </div>
              </div>
              {imageState === 'error' && (
                <div role="alert" className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 px-4 py-3">
                  <span className="text-xs font-semibold text-red-700 dark:text-red-300">Gagal membuat gambar</span>
                  <button
                    onClick={() => setAttempt(n => n + 1)}
                    className="flex items-center gap-1.5 text-xs font-bold text-red-700 dark:text-red-300 active:scale-95"
                  >
                    <RotateCcw size={14} strokeWidth={2.5} />
                    Coba lagi
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex-none sticky bottom-0 bg-white dark:bg-slate-900 border-t border-gray-200/60 dark:border-slate-700/60 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            <div className="max-w-md mx-auto space-y-2">
              <div className={`grid ${showShareButton ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
                <button
                  onClick={handleDownload}
                  disabled={busy}
                  className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold shadow-lg shadow-emerald-500/20 active:scale-95 transition"
                >
                  {imageState === 'loading' ? <Loader2 size={16} strokeWidth={2.5} className="animate-spin" /> : <Download size={16} strokeWidth={2.5} />}
                  {imageState === 'loading' ? 'Menyiapkan gambar…' : 'Download'}
                </button>
                {showShareButton && (
                  <button
                    onClick={handleShare}
                    disabled={busy}
                    className="flex items-center justify-center gap-2 whitespace-nowrap py-3.5 rounded-xl border border-emerald-500 text-emerald-600 dark:text-emerald-400 text-sm font-bold hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-50 active:scale-95 transition"
                  >
                    <Share2 size={16} strokeWidth={2.5} />
                    {readyFile ? 'Bagikan sekarang' : 'Bagikan'}
                  </button>
                )}
              </div>
              <button
                onClick={handleCopyCaption}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-slate-800 active:scale-95 transition"
              >
                <Copy size={16} strokeWidth={2.5} />
                Salin Caption
              </button>
            </div>
          </div>

          {toast && (
            <div role="status" className="fixed bottom-[calc(7rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-[10000] w-max max-w-[calc(100vw-2rem)] text-center bg-gray-900 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-xl">
              {toast}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
```

- [ ] **Step 4: Wire `CuacaWidget.tsx`**

Ganti impor & tipe di atas berkas:

```tsx
import { lazy, Suspense, useState, useEffect } from 'react';
import { Share2 } from 'lucide-react';
import { getAuthHeaders } from '../lib/authSession';
import { cityTemperatureData } from '../data/temperatureData';
import { SEASONAL_NOTES } from '../../lib/weather-seasonal-notes.js';
import type { CuacaShareCity } from '../../lib/cuaca-share-data.js';
import type { CuacaShareAgent } from './ShareCuacaModal';

const ShareCuacaModal = lazy(() => import('./ShareCuacaModal'));

// ─── Types ───────────────────────────────────────────────────────
type CityWeather = CuacaShareCity & { flag: string };
```

(hapus `interface CityWeather { … }` lama.)

Ubah tanda tangan & state:

```tsx
export default function CuacaWidget({ agent }: { agent?: CuacaShareAgent }) {
  const [cities, setCities] = useState<CityWeather[]>([]);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareMounted, setShareMounted] = useState(false);
```

Di `fetchWeather`, setelah `setCities(json.data);` tambah:

```tsx
      setSyncedAt(json.syncedAt ?? null);
```

Ganti blok header:

```tsx
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-50 dark:border-slate-700/50 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">
          Cuaca Kota Tujuan
        </h3>
        {agent && (
          <button
            onClick={() => { setShareMounted(true); setShareOpen(true); }}
            aria-label="Bagikan cuaca"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors active:scale-95"
          >
            <Share2 size={10} strokeWidth={2.5} />
            Share
          </button>
        )}
      </div>
```

(Pil hanya tampil di cabang render utama — sesudah `if (!city) return null;` — jadi otomatis tersembunyi saat kota aktif tak punya data.)

Sebelum penutup `</div>` terluar widget (setelah blok seasonal note `</div>` milik `p-4 space-y-3`), tambah:

```tsx
      {agent && shareMounted && (
        <Suspense fallback={null}>
          <ShareCuacaModal
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            city={city}
            syncedAt={syncedAt}
            agent={agent}
          />
        </Suspense>
      )}
```

- [ ] **Step 5: Wire `DashboardLayout.tsx`** — ganti `<Suspense fallback={null}><CuacaWidget /></Suspense>` menjadi:

```tsx
            <Suspense fallback={null}><CuacaWidget agent={{ name: agentData.name, phone: agentData.phone, photo: agentData.photo, slug: agentData.slug }} /></Suspense>
```

- [ ] **Step 6: Run tests + typecheck**

Run: `node --test tests/cuaca-share-ui.test.js && npx tsc --noEmit -p . 2>&1 | grep -E "ShareCuacaModal|CuacaWidget|cuaca-share|DashboardLayout" ; echo tsc-done`
Expected: PASS (5 tests); tidak ada galat tsc baru di berkas-berkas itu (bandingkan dengan `git stash` bila ragu).

- [ ] **Step 7: Commit**

```bash
git add src/components/ShareCuacaModal.tsx src/components/CuacaWidget.tsx src/components/DashboardLayout.tsx tests/cuaca-share-ui.test.js
git commit -m "feat(cuaca): sheet Bagikan Cuaca + pil Share di widget Cuaca Kota Tujuan"
```

---

### Task 9: Verifikasi menyeluruh

**Files:** tidak ada berkas baru (perbaikan kecil bila verifikasi menemukan masalah).

- [ ] **Step 1: Semua tes terkait**

Run: `node --test tests/weather-shared-modules.test.js tests/cuaca-share-*.test.js tests/headless-render.test.js tests/kurs-share-cache.test.js tests/pwa-build-config.test.js`
Expected: semua PASS.

- [ ] **Step 2: Precache** — pastikan `.jpg` di `public/cuaca-share/` tidak masuk precache:

Run: `npx vite build --outDir /tmp/cuaca-build-check --emptyOutDir 2>&1 | tail -3 && grep -c "cuaca-share" /tmp/cuaca-build-check/sw.js || true`
Expected: build sukses; `0` kemunculan `cuaca-share` di `sw.js`.

- [ ] **Step 3: Render smoke** — `node scripts/test-cuaca-image.mjs`, buka ketiga JPEG (Read) dan bandingkan dengan mockup C2/C3.

- [ ] **Step 4: Uji langsung di localhost** — restart server API lokal (tab terminal "api server", `npm run start`), buka `http://localhost:5173/dashboard` di browser pane (viewport mobile), pilih tab Mekkah → Share → pratinjau muncul, tombol aktif setelah "Menyiapkan gambar…", Download menghasilkan berkas; ulangi untuk Hainan. Cek header respons `X-Cuaca-Image-Cache` MISS lalu HIT.

- [ ] **Step 5: Commit perbaikan (bila ada)** — `git add <berkas yang diperbaiki>` lalu `git commit -m "fix(cuaca): <ringkas>"`.

---

## Self-Review (diisi penulis rencana)

- **Cakupan spec:** §4.1 → T1; §4.2 → T1; §4.3 → T2; §4.4 → T3; §4.5 → T4+T5; §4.6 → T6; §4.7 → T7; §4.8 → T1; §4.9 → T8; §4.10 → T3; §5 → T7+T8; §6 → T2; §7 → T2/T5/T7/T8; §8 → T2–T9.
- **Penyimpangan kecil dari spec:** caption menerima `waNumber` yang sudah dinormalkan `normalizeWaNumber` di klien (lib JS tidak bisa mengimpor util TS); hasil sama dengan spec §4.3.
- **Konsistensi tipe:** `CuacaShareProps.photo` (nama berkas) dipakai klien (`/cuaca-share/${photo}`) dan server (`loadCuacaShareAssets`); `CuacaShareAssets` didefinisikan sekali di Task 3; `dateKey` `YYYYMMDD` dipakai cache (Task 6) dan nama berkas (Task 7/8).
