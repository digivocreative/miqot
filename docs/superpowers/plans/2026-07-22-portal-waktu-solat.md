# Widget Waktu Solat Mekkah & Madinah — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambah satu kartu di Beranda Portal Jamaah yang menampilkan jadwal solat Mekkah & Madinah (solat berikutnya + hitung mundur + deret 5 waktu), dengan tab kota yang default-nya mengikuti lokasi jamaah.

**Architecture:** Logika murni (zona waktu Riyadh, hitung solat berikutnya, resolusi kota) di root `lib/prayer-times.js` (+ `.d.ts`), diuji dengan `node --test` dan di-bundle ke FE — pola persis `lib/teras-linkify.js`. Lapisan FE: modul fetch+cache Aladhan (`prayerTimesApi.ts`), hook (`usePrayerTimes.ts`), dan komponen kartu (`PrayerTimesCard.tsx`) yang disisipkan ke `BerandaPage.tsx`. Tanpa backend baru — Aladhan dipanggil langsung dari browser (CORS `*`), seperti pembaca equran.id.

**Tech Stack:** React + TypeScript (Vite), Tailwind (varian light/dark), lucide-react. Uji unit: `node:test` + `node:assert/strict`. API eksternal: Aladhan `v1/timings`.

## Global Constraints

- Metode hitung dipaku ke **Umm al-Qura** — `method=4` di setiap panggilan Aladhan. Tidak diekspos ke pengguna.
- Zona Mekkah & Madinah = **`Asia/Riyadh`** (UTC+3, tanpa DST). Semua "sekarang", "solat berikutnya", dan kunci cache dihitung di zona ini via `Intl` — **bukan** `new Date()` lokal perangkat.
- Koordinat tetap (dikodekan konstan, tanpa geolokasi perangkat): Mekkah `21.4225, 39.8262`; Madinah `24.4672, 39.6111`.
- **Default kota utama = Mekkah**; naik ke Madinah hanya best-effort. Kota utama hanya menentukan tab aktif saat render pertama.
- **Tanpa backend baru**: fetch Aladhan langsung dari browser, cache di `localStorage`.
- **Hanya kartu Beranda** — tidak ada route/menu baru, jadi 5 titik sinkron route enum (lihat memori `reference_portal_jamaah_routes`) TIDAK disentuh.
- Impor root `lib/*.js` dari FE memakai ekstensi `.js` eksplisit (mis. `import { getRiyadhNow } from '../../../../lib/prayer-times.js'`), didampingi `.d.ts` untuk tipe — pola `lib/teras-linkify.js` + `lib/teras-linkify.d.ts`.
- Gate FE = `npx tsc -p tsconfig.json --noEmit` **dan** `npm run build`. Ada ~6 error tsc pre-existing di luar portal (RahmahJuli/FlightStatus) — bukan blok; pastikan tak menambah error baru pada file yang disentuh. E2E/visual dijalankan oleh user.

---

### Task 1: Helper waktu murni di `lib/prayer-times.js`

Konstanta + helper zona-waktu & solat-berikutnya. Unit-tested penuh dengan `node --test`.

**Files:**
- Create: `lib/prayer-times.js`
- Create: `lib/prayer-times.d.ts`
- Test: `tests/prayer-times.test.js`

**Interfaces:**
- Produces:
  - `ALADHAN_METHOD: number`
  - `PRAYER_CITIES: Record<'mekkah'|'madinah', { id, label, latitude, longitude }>`
  - `PRAYER_ORDER: readonly ['Fajr','Dhuhr','Asr','Maghrib','Isha']`
  - `PRAYER_LABELS: Record<PrayerName, string>` (Indonesia)
  - `HIJRI_MONTHS_ID: readonly string[]`
  - `getRiyadhNow(nowMs: number): { dateKey: string /* DD-MM-YYYY */, isoDate: string /* YYYY-MM-DD */, minutesOfDay: number }`
  - `parseHHMM(value): number | null`
  - `formatHHMM(value): string`
  - `computeNextPrayer(timings, nowMinutes): { name, label, timeLabel, minutesUntil, tomorrow } | null`
  - `formatCountdown(minutesUntil): string`
  - `formatHijri(hijri): string | null`
  - `buildTimingsUrl(cityId, dateKey): string`

- [ ] **Step 1: Write the failing test**

Create `tests/prayer-times.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getRiyadhNow,
  parseHHMM,
  formatHHMM,
  computeNextPrayer,
  formatCountdown,
  formatHijri,
  buildTimingsUrl,
} from '../lib/prayer-times.js';

const TIMINGS = { Fajr: '04:25', Dhuhr: '12:27', Asr: '15:44', Maghrib: '19:04', Isha: '20:34' };

test('getRiyadhNow: pukul 12:27 Riyadh dari UTC 09:27', () => {
  const now = getRiyadhNow(Date.parse('2026-07-22T09:27:00Z'));
  assert.equal(now.dateKey, '22-07-2026');
  assert.equal(now.isoDate, '2026-07-22');
  assert.equal(now.minutesOfDay, 12 * 60 + 27);
});

test('getRiyadhNow: pakai tanggal Riyadh, bukan WIB (lintas tengah malam)', () => {
  // UTC 21:30 = Riyadh 00:30 tanggal 23 (WIB sudah 04:30 tgl 23 juga, tapi kita uji zona Riyadh)
  const now = getRiyadhNow(Date.parse('2026-07-22T21:30:00Z'));
  assert.equal(now.dateKey, '23-07-2026');
  assert.equal(now.minutesOfDay, 30);
});

test('parseHHMM: menit sejak tengah malam, toleran suffix, tolak invalid', () => {
  assert.equal(parseHHMM('19:04'), 19 * 60 + 4);
  assert.equal(parseHHMM('04:25'), 265);
  assert.equal(parseHHMM('19:04 (+03)'), 1144);
  assert.equal(parseHHMM('bukan jam'), null);
  assert.equal(parseHHMM('25:00'), null);
});

test('formatHHMM: normalisasi ke HH:MM dua digit', () => {
  assert.equal(formatHHMM('4:25'), '04:25');
  assert.equal(formatHHMM('19:04 (+03)'), '19:04');
  assert.equal(formatHHMM('rusak'), '--:--');
});

test('computeNextPrayer: tepat di waktu Dzuhur → berikutnya Ashar', () => {
  const next = computeNextPrayer(TIMINGS, 12 * 60 + 27);
  assert.equal(next.name, 'Asr');
  assert.equal(next.label, 'Ashar');
  assert.equal(next.timeLabel, '15:44');
  assert.equal(next.minutesUntil, 197);
  assert.equal(next.tomorrow, false);
});

test('computeNextPrayer: dini hari → Subuh hari ini', () => {
  const next = computeNextPrayer(TIMINGS, 100);
  assert.equal(next.name, 'Fajr');
  assert.equal(next.tomorrow, false);
  assert.equal(next.minutesUntil, 165);
});

test('computeNextPrayer: setelah Isya → Subuh besok', () => {
  const next = computeNextPrayer(TIMINGS, 21 * 60 + 40);
  assert.equal(next.name, 'Fajr');
  assert.equal(next.tomorrow, true);
  assert.equal(next.minutesUntil, (1440 - (21 * 60 + 40)) + 265);
});

test('formatCountdown', () => {
  assert.equal(formatCountdown(197), '3 jam 17 mnt lagi');
  assert.equal(formatCountdown(45), '45 mnt lagi');
  assert.equal(formatCountdown(0), 'kurang dari 1 mnt');
});

test('formatHijri: nomor bulan → nama Indonesia', () => {
  assert.equal(formatHijri({ day: 8, month: { number: 2, en: 'Safar' }, year: 1448 }), '8 Safar 1448 H');
  assert.equal(formatHijri(null), null);
});

test('buildTimingsUrl: koordinat + method=4', () => {
  const url = buildTimingsUrl('mekkah', '22-07-2026');
  assert.match(url, /\/timings\/22-07-2026\?/);
  assert.match(url, /latitude=21\.4225/);
  assert.match(url, /longitude=39\.8262/);
  assert.match(url, /method=4/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/prayer-times.test.js`
Expected: FAIL — `Cannot find module '../lib/prayer-times.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/prayer-times.js`:

```js
// Logika murni jadwal solat Portal Jamaah — tanpa DOM/jaringan. Aman diuji `node --test`
// sekaligus di-bundle ke FE (pola lib/teras-linkify.js).
// Zona Mekkah & Madinah = Asia/Riyadh (UTC+3, tanpa DST).

export const ALADHAN_METHOD = 4; // Umm al-Qura University, Makkah (metode resmi Arab Saudi)

export const PRAYER_CITIES = {
  mekkah: { id: 'mekkah', label: 'Mekkah', latitude: 21.4225, longitude: 39.8262 },
  madinah: { id: 'madinah', label: 'Madinah', latitude: 24.4672, longitude: 39.6111 },
};

export const PRAYER_ORDER = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

export const PRAYER_LABELS = {
  Fajr: 'Subuh',
  Dhuhr: 'Dzuhur',
  Asr: 'Ashar',
  Maghrib: 'Maghrib',
  Isha: 'Isya',
};

export const HIJRI_MONTHS_ID = [
  'Muharram', 'Safar', 'Rabiul Awal', 'Rabiul Akhir',
  'Jumadil Awal', 'Jumadil Akhir', 'Rajab', 'Syaban',
  'Ramadhan', 'Syawal', 'Dzulqaidah', 'Dzulhijjah',
];

export function getRiyadhNow(nowMs) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    hourCycle: 'h23', // 00–23; hindari kuirk '24' saat tengah malam
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
  const parts = {};
  for (const p of fmt.formatToParts(new Date(nowMs))) parts[p.type] = p.value;
  return {
    dateKey: `${parts.day}-${parts.month}-${parts.year}`, // DD-MM-YYYY (parameter Aladhan)
    isoDate: `${parts.year}-${parts.month}-${parts.day}`, // YYYY-MM-DD (perbandingan tanggal)
    minutesOfDay: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export function parseHHMM(value) {
  const m = String(value ?? '').match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function formatHHMM(value) {
  const min = parseHHMM(value);
  if (min == null) return '--:--';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function computeNextPrayer(timings, nowMinutes) {
  if (!timings) return null;
  for (const name of PRAYER_ORDER) {
    const t = parseHHMM(timings[name]);
    if (t == null) continue;
    if (t > nowMinutes) {
      return { name, label: PRAYER_LABELS[name], timeLabel: formatHHMM(timings[name]), minutesUntil: t - nowMinutes, tomorrow: false };
    }
  }
  const fajr = parseHHMM(timings.Fajr);
  if (fajr == null) return null;
  return { name: 'Fajr', label: PRAYER_LABELS.Fajr, timeLabel: formatHHMM(timings.Fajr), minutesUntil: (1440 - nowMinutes) + fajr, tomorrow: true };
}

export function formatCountdown(minutesUntil) {
  if (minutesUntil == null || minutesUntil < 0) return '';
  if (minutesUntil < 1) return 'kurang dari 1 mnt';
  const h = Math.floor(minutesUntil / 60);
  const m = minutesUntil % 60;
  if (h === 0) return `${m} mnt lagi`;
  return `${h} jam ${m} mnt lagi`;
}

export function formatHijri(hijri) {
  if (!hijri) return null;
  const day = Number(hijri.day);
  const year = hijri.year;
  if (!day || !year) return null;
  const monthIdx = Number(hijri.month?.number);
  const month = HIJRI_MONTHS_ID[monthIdx - 1] || hijri.month?.en || '';
  return `${day} ${month} ${year} H`.replace(/\s+/g, ' ').trim();
}

export function buildTimingsUrl(cityId, dateKey) {
  const city = PRAYER_CITIES[cityId];
  if (!city) throw new Error(`Kota tidak dikenal: ${cityId}`);
  return `https://api.aladhan.com/v1/timings/${dateKey}?latitude=${city.latitude}&longitude=${city.longitude}&method=${ALADHAN_METHOD}`;
}
```

Create `lib/prayer-times.d.ts`:

```ts
export type PrayerCityId = 'mekkah' | 'madinah';
export type PrayerName = 'Fajr' | 'Dhuhr' | 'Asr' | 'Maghrib' | 'Isha';
export type PrayerTimings = Record<PrayerName, string>;

export const ALADHAN_METHOD: number;

export interface PrayerCity { id: PrayerCityId; label: string; latitude: number; longitude: number; }
export const PRAYER_CITIES: Record<PrayerCityId, PrayerCity>;
export const PRAYER_ORDER: readonly PrayerName[];
export const PRAYER_LABELS: Record<PrayerName, string>;
export const HIJRI_MONTHS_ID: readonly string[];

export interface RiyadhNow { dateKey: string; isoDate: string; minutesOfDay: number; }
export function getRiyadhNow(nowMs: number): RiyadhNow;

export function parseHHMM(value: unknown): number | null;
export function formatHHMM(value: unknown): string;

export interface NextPrayer { name: PrayerName; label: string; timeLabel: string; minutesUntil: number; tomorrow: boolean; }
export function computeNextPrayer(timings: Partial<PrayerTimings> | null | undefined, nowMinutes: number): NextPrayer | null;

export function formatCountdown(minutesUntil: number | null | undefined): string;

export interface AladhanHijri { day?: string | number; year?: string | number; month?: { number?: number; en?: string; ar?: string }; }
export function formatHijri(hijri: AladhanHijri | null | undefined): string | null;

export function buildTimingsUrl(cityId: PrayerCityId, dateKey: string): string;

// --- Ditambah di Task 2 ---
export function tripDayIndex(startIso: string | null | undefined, endIso: string | null | undefined, todayIso: string): number | null;
export interface ItineraryDayLike { location?: string | null; title?: string | null; }
export function resolvePrimaryCity(input?: { itineraryDays: ReadonlyArray<ItineraryDayLike>; dayIndex: number | null }): PrayerCityId;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/prayer-times.test.js`
Expected: PASS (semua test di Step 1 hijau).

- [ ] **Step 5: Commit**

```bash
git add lib/prayer-times.js lib/prayer-times.d.ts tests/prayer-times.test.js
git commit -m "feat(portal-jamaah): helper waktu solat murni (zona Riyadh + next-prayer)"
```

---

### Task 2: Helper resolusi kota di `lib/prayer-times.js`

`tripDayIndex` + `resolvePrimaryCity` — best-effort pilih kota utama, default Mekkah.

**Files:**
- Modify: `lib/prayer-times.js` (tambah 2 fungsi + helper internal)
- Modify: `tests/prayer-times.test.js` (tambah test)
- Note: `.d.ts` sudah memuat deklarasinya (ditulis di Task 1).

**Interfaces:**
- Consumes: `PRAYER_CITIES` (tak wajib) — mandiri.
- Produces:
  - `tripDayIndex(startIso, endIso, todayIso): number | null` — indeks hari perjalanan (0-based) bila `todayIso` di dalam rentang inklusif; `null` bila di luar rentang atau tanggal mulai tak valid. `endIso` null = tanpa batas atas.
  - `resolvePrimaryCity({ itineraryDays, dayIndex }): 'mekkah' | 'madinah'` — 'madinah' bila `itineraryDays[dayIndex]` menyebut Madinah; selain itu 'mekkah'.

- [ ] **Step 1: Write the failing test**

Tambahkan ke `tests/prayer-times.test.js` (impor dua nama baru pada baris `import`):

```js
// tambahkan `tripDayIndex, resolvePrimaryCity` ke daftar import dari '../lib/prayer-times.js'

test('tripDayIndex: indeks hari dalam rentang, null di luar', () => {
  assert.equal(tripDayIndex('2026-07-20', '2026-07-29', '2026-07-22'), 2);
  assert.equal(tripDayIndex('2026-07-20', '2026-07-29', '2026-07-20'), 0);
  assert.equal(tripDayIndex('2026-07-20', '2026-07-29', '2026-07-19'), null); // sebelum berangkat
  assert.equal(tripDayIndex('2026-07-20', '2026-07-29', '2026-07-30'), null); // sesudah pulang
  assert.equal(tripDayIndex('2026-07-20', null, '2026-07-25'), 5);            // tanpa batas atas
  assert.equal(tripDayIndex(null, '2026-07-29', '2026-07-25'), null);         // mulai tak valid
});

test('tripDayIndex: toleran timestamp berimbuh waktu', () => {
  assert.equal(tripDayIndex('2026-07-20T00:00:00Z', '2026-07-29', '2026-07-22T10:00:00Z'), 2);
});

test('resolvePrimaryCity: default Mekkah, naik ke Madinah saat cocok', () => {
  const days = [{ location: 'Makkah' }, { location: 'Madinah, Masjid Nabawi' }];
  assert.equal(resolvePrimaryCity({ itineraryDays: days, dayIndex: 1 }), 'madinah');
  assert.equal(resolvePrimaryCity({ itineraryDays: days, dayIndex: 0 }), 'mekkah');
  assert.equal(resolvePrimaryCity({ itineraryDays: days, dayIndex: null }), 'mekkah');
  assert.equal(resolvePrimaryCity({ itineraryDays: [{ location: null }], dayIndex: 0 }), 'mekkah');
  assert.equal(resolvePrimaryCity(), 'mekkah');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/prayer-times.test.js`
Expected: FAIL — `tripDayIndex`/`resolvePrimaryCity` bukan fungsi (import undefined).

- [ ] **Step 3: Write minimal implementation**

Tambahkan ke akhir `lib/prayer-times.js`:

```js
function toIsoDay(value) {
  const m = String(value ?? '').match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

export function tripDayIndex(startIso, endIso, todayIso) {
  const start = toIsoDay(startIso);
  const today = toIsoDay(todayIso);
  if (!start || !today) return null;
  if (today < start) return null;
  const end = toIsoDay(endIso);
  if (end && today > end) return null;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const idx = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / MS_PER_DAY);
  return idx >= 0 ? idx : null;
}

export function resolvePrimaryCity({ itineraryDays, dayIndex } = {}) {
  if (dayIndex == null || !Array.isArray(itineraryDays)) return 'mekkah';
  const day = itineraryDays[dayIndex];
  const text = String(day?.location ?? day?.title ?? '').toLowerCase();
  if (/madinah|madina|medina/.test(text)) return 'madinah';
  return 'mekkah';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/prayer-times.test.js`
Expected: PASS (semua test Task 1 + Task 2 hijau).

- [ ] **Step 5: Commit**

```bash
git add lib/prayer-times.js tests/prayer-times.test.js
git commit -m "feat(portal-jamaah): resolusi kota utama waktu solat (tripDayIndex + resolvePrimaryCity)"
```

---

### Task 3: Ekstrak `extractItineraryDays` ke `utils/itinerary.ts`

Refactor kecil agar normalisasi itinerary bisa dipakai ulang oleh hook waktu solat (DRY). Tak mengubah perilaku PerjalananPage.

**Files:**
- Create: `src/components/portal-jamaah/utils/itinerary.ts`
- Modify: `src/components/portal-jamaah/pages/PerjalananPage.tsx` (hapus fungsi lokal, impor dari util)

**Interfaces:**
- Consumes: `addDays`, `formatShortDate` dari `./formatDate`; tipe `ItineraryDay` dari `../components/ItineraryList`.
- Produces: `extractItineraryDays(raw: unknown, startDate?: string | null): ItineraryDay[]`; re-export tipe `ItineraryDay`.

- [ ] **Step 1: Create the shared util**

Create `src/components/portal-jamaah/utils/itinerary.ts`:

```ts
import { addDays, formatShortDate } from './formatDate';
import type { ItineraryDay } from '../components/ItineraryList';

export type { ItineraryDay };

// Normalisasi itinerary mentah (schedule.itinerary bertipe unknown / bisa {days:[]})
// menjadi daftar hari terstruktur. Dipindah dari PerjalananPage agar dipakai ulang.
export function extractItineraryDays(raw: unknown, startDate?: string | null): ItineraryDay[] {
  const source = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { days?: unknown[] }).days)
      ? (raw as { days: unknown[] }).days
      : [];
  return source.map((item, index) => {
    const day = item as Record<string, unknown>;
    return {
      dayNumber: String(day.dayNumber || day.day || `Hari ${index + 1}`),
      title: String(day.title || day.judul || 'Agenda perjalanan'),
      date: day.date ? String(day.date) : formatShortDate(addDays(startDate, index)),
      location: day.location ? String(day.location) : null,
    };
  });
}
```

- [ ] **Step 2: Re-point PerjalananPage**

In `src/components/portal-jamaah/pages/PerjalananPage.tsx`:
1. Hapus definisi fungsi lokal `function extractItineraryDays(...) { ... }` (blok di sekitar baris 113–128).
2. Tambahkan impor di dekat impor lain: `import { extractItineraryDays } from '../utils/itinerary';`
3. Jika setelah penghapusan `addDays` dan/atau `formatShortDate` tak lagi dipakai di file ini, hapus keduanya dari baris impor `./utils/formatDate` (biarkan nama lain yang masih dipakai). Jangan hapus impor `ItineraryDay`/`ItineraryList` — masih dipakai.

- [ ] **Step 3: Verify types and build**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: Tidak ada error BARU pada `PerjalananPage.tsx` atau `utils/itinerary.ts` (error pre-existing di file lain boleh tetap ada).

Run: `npm run build`
Expected: Build sukses.

- [ ] **Step 4: Commit**

```bash
git add src/components/portal-jamaah/utils/itinerary.ts src/components/portal-jamaah/pages/PerjalananPage.tsx
git commit -m "refactor(portal-jamaah): ekstrak extractItineraryDays ke utils/itinerary"
```

---

### Task 4: Modul fetch+cache Aladhan `prayerTimesApi.ts`

Panggil Aladhan dari browser, cache per kota+tanggal di `localStorage` + memory. Verifikasi via tsc/build (fetch/localStorage tak diuji unit — logika murni sudah ditutup Task 1).

**Files:**
- Create: `src/components/portal-jamaah/lib/prayerTimesApi.ts`

**Interfaces:**
- Consumes: `buildTimingsUrl`, `formatHijri`, tipe `PrayerName`, `PrayerCityId` dari `../../../../lib/prayer-times.js`.
- Produces:
  - `type Timings = Record<PrayerName, string>`
  - `interface CityPrayerData { timings: Timings; hijriLabel: string | null }`
  - `fetchCityTimings(cityId: PrayerCityId, dateKey: string): Promise<CityPrayerData>`
  - re-export `type PrayerCityId`.

- [ ] **Step 1: Write the module**

Create `src/components/portal-jamaah/lib/prayerTimesApi.ts`:

```ts
// Jadwal solat Portal Jamaah — fetch + cache dari Aladhan API (CORS `*`, dipanggil
// langsung dari browser tanpa proxy backend, pola lib/quranApi.ts).
import {
  buildTimingsUrl,
  formatHijri,
  type PrayerCityId,
  type PrayerName,
} from '../../../../lib/prayer-times.js';

export type { PrayerCityId };
export type Timings = Record<PrayerName, string>;

export interface CityPrayerData {
  timings: Timings;
  hijriLabel: string | null;
}

const CACHE_PREFIX = 'portal_prayer';
const REQUIRED: PrayerName[] = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const memoryCache = new Map<string, CityPrayerData>();

interface AladhanResponse {
  code: number;
  data?: {
    timings?: Record<string, string>;
    date?: { hijri?: Parameters<typeof formatHijri>[0] };
  };
}

function pickTimings(raw: Record<string, string> | undefined): Timings {
  if (!raw) throw new Error('Timings kosong');
  const out = {} as Timings;
  for (const name of REQUIRED) {
    if (!raw[name]) throw new Error(`Waktu ${name} tidak ada`);
    out[name] = raw[name];
  }
  return out;
}

export async function fetchCityTimings(cityId: PrayerCityId, dateKey: string): Promise<CityPrayerData> {
  const key = `${CACHE_PREFIX}_${cityId}_${dateKey}`;

  const mem = memoryCache.get(key);
  if (mem) return mem;

  try {
    const cached = localStorage.getItem(key);
    if (cached) {
      const parsed = JSON.parse(cached) as CityPrayerData;
      if (parsed?.timings?.Fajr) {
        memoryCache.set(key, parsed);
        return parsed;
      }
    }
  } catch {
    // localStorage tak tersedia / korup — abaikan, ambil dari jaringan.
  }

  const res = await fetch(buildTimingsUrl(cityId, dateKey));
  if (!res.ok) throw new Error(`Gagal memuat jadwal solat (${res.status})`);
  const json = (await res.json()) as AladhanResponse;

  const data: CityPrayerData = {
    timings: pickTimings(json.data?.timings),
    hijriLabel: formatHijri(json.data?.date?.hijri),
  };

  memoryCache.set(key, data);
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // penyimpanan penuh / mode privat — cukup andalkan memory cache.
  }
  return data;
}
```

- [ ] **Step 2: Verify types and build**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: Tidak ada error pada `prayerTimesApi.ts` (impor `.js` + tipe dari `.d.ts` resolve seperti `teras-linkify`).

Run: `npm run build`
Expected: Build sukses.

- [ ] **Step 3: Commit**

```bash
git add src/components/portal-jamaah/lib/prayerTimesApi.ts
git commit -m "feat(portal-jamaah): modul fetch+cache jadwal solat Aladhan"
```

---

### Task 5: Hook `usePrayerTimes.ts`

Muat kedua kota untuk hari Riyadh saat ini, tentukan kota utama, muat ulang saat ganti hari/fokus.

**Files:**
- Create: `src/components/portal-jamaah/hooks/usePrayerTimes.ts`

**Interfaces:**
- Consumes: `fetchCityTimings`, `CityPrayerData`, `PrayerCityId` dari `../lib/prayerTimesApi`; `extractItineraryDays` dari `../utils/itinerary`; `getRiyadhNow`, `resolvePrimaryCity`, `tripDayIndex` dari `../../../../lib/prayer-times.js`; tipe `PortalBooking`, `PortalSchedule` dari `./usePortalMe`.
- Produces:
  - `type CityStatus = 'loading' | 'ready' | 'error'`
  - `interface CityState { status: CityStatus; data: CityPrayerData | null }`
  - `interface PrayerTimesState { dateKey: string; primaryCity: PrayerCityId; cities: Record<PrayerCityId, CityState> }`
  - `usePrayerTimes(schedule: PortalSchedule | null, booking: PortalBooking): PrayerTimesState`

- [ ] **Step 1: Write the hook**

Create `src/components/portal-jamaah/hooks/usePrayerTimes.ts`:

```ts
import { useEffect, useState } from 'react';
import { fetchCityTimings, type CityPrayerData, type PrayerCityId } from '../lib/prayerTimesApi';
import { extractItineraryDays } from '../utils/itinerary';
import { getRiyadhNow, resolvePrimaryCity, tripDayIndex } from '../../../../lib/prayer-times.js';
import type { PortalBooking, PortalSchedule } from './usePortalMe';

export type CityStatus = 'loading' | 'ready' | 'error';

export interface CityState {
  status: CityStatus;
  data: CityPrayerData | null;
}

export interface PrayerTimesState {
  dateKey: string;
  primaryCity: PrayerCityId;
  cities: Record<PrayerCityId, CityState>;
}

const CITY_IDS: PrayerCityId[] = ['mekkah', 'madinah'];

export function usePrayerTimes(schedule: PortalSchedule | null, booking: PortalBooking): PrayerTimesState {
  const now = getRiyadhNow(Date.now());
  const [dateKey, setDateKey] = useState(now.dateKey);
  const [cities, setCities] = useState<Record<PrayerCityId, CityState>>({
    mekkah: { status: 'loading', data: null },
    madinah: { status: 'loading', data: null },
  });

  const itineraryDays = extractItineraryDays(schedule?.itinerary, booking.tgl_berangkat);
  const dayIndex = tripDayIndex(booking.tgl_berangkat, booking.tgl_pulang, now.isoDate);
  const primaryCity = resolvePrimaryCity({ itineraryDays, dayIndex });

  // Muat kedua kota untuk hari Riyadh aktif.
  useEffect(() => {
    let cancelled = false;
    for (const cityId of CITY_IDS) {
      setCities((prev) => ({ ...prev, [cityId]: { status: 'loading', data: prev[cityId].data } }));
      fetchCityTimings(cityId, dateKey)
        .then((data) => {
          if (!cancelled) setCities((prev) => ({ ...prev, [cityId]: { status: 'ready', data } }));
        })
        .catch(() => {
          if (!cancelled) setCities((prev) => ({ ...prev, [cityId]: { status: 'error', data: prev[cityId].data } }));
        });
    }
    return () => { cancelled = true; };
  }, [dateKey]);

  // Ganti hari (zona Riyadh) → set dateKey baru → efek di atas memuat ulang.
  useEffect(() => {
    function check() {
      const next = getRiyadhNow(Date.now()).dateKey;
      setDateKey((current) => (current === next ? current : next));
    }
    const id = window.setInterval(check, 60_000);
    window.addEventListener('focus', check);
    return () => { window.clearInterval(id); window.removeEventListener('focus', check); };
  }, []);

  return { dateKey, primaryCity, cities };
}
```

- [ ] **Step 2: Verify types and build**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: Tidak ada error pada `usePrayerTimes.ts`.

Run: `npm run build`
Expected: Build sukses.

- [ ] **Step 3: Commit**

```bash
git add src/components/portal-jamaah/hooks/usePrayerTimes.ts
git commit -m "feat(portal-jamaah): hook usePrayerTimes (dua kota + ganti hari Riyadh)"
```

---

### Task 6: Kartu `PrayerTimesCard.tsx` + pasang di Beranda

Komponen presentasi: header (Hijriah + label zona), tab kota, sorotan solat berikutnya + hitung mundur, deret 5 waktu. Disisipkan di Beranda setelah Smart Alerts.

**Files:**
- Create: `src/components/portal-jamaah/components/PrayerTimesCard.tsx`
- Modify: `src/components/portal-jamaah/pages/BerandaPage.tsx`

**Interfaces:**
- Consumes: `usePrayerTimes` dari `../hooks/usePrayerTimes`; `PrayerCityId` dari `../lib/prayerTimesApi`; `PortalBooking`, `PortalSchedule` dari `../hooks/usePortalMe`; `PRAYER_ORDER`, `PRAYER_LABELS`, `computeNextPrayer`, `formatCountdown`, `formatHHMM`, `getRiyadhNow` dari `../../../../lib/prayer-times.js`.
- Produces: `default export function PrayerTimesCard({ schedule, booking }): JSX.Element`.

- [ ] **Step 1: Write the component**

Create `src/components/portal-jamaah/components/PrayerTimesCard.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { Clock } from 'lucide-react';
import { usePrayerTimes } from '../hooks/usePrayerTimes';
import type { PrayerCityId } from '../lib/prayerTimesApi';
import type { PortalBooking, PortalSchedule } from '../hooks/usePortalMe';
import {
  PRAYER_ORDER,
  PRAYER_LABELS,
  computeNextPrayer,
  formatCountdown,
  formatHHMM,
  getRiyadhNow,
} from '../../../../lib/prayer-times.js';

const CITY_TABS: { id: PrayerCityId; label: string }[] = [
  { id: 'mekkah', label: 'Mekkah' },
  { id: 'madinah', label: 'Madinah' },
];

function useRiyadhMinutes(): number {
  const [minutes, setMinutes] = useState(() => getRiyadhNow(Date.now()).minutesOfDay);
  useEffect(() => {
    function tick() { setMinutes(getRiyadhNow(Date.now()).minutesOfDay); }
    const id = window.setInterval(tick, 30_000);
    window.addEventListener('focus', tick);
    return () => { window.clearInterval(id); window.removeEventListener('focus', tick); };
  }, []);
  return minutes;
}

export default function PrayerTimesCard({
  schedule,
  booking,
}: {
  schedule: PortalSchedule | null;
  booking: PortalBooking;
}) {
  const { primaryCity, cities } = usePrayerTimes(schedule, booking);
  const [activeCity, setActiveCity] = useState<PrayerCityId>(primaryCity);
  const nowMinutes = useRiyadhMinutes();

  const active = cities[activeCity];
  const next = useMemo(
    () => (active.data ? computeNextPrayer(active.data.timings, nowMinutes) : null),
    [active.data, nowMinutes],
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center gap-2 px-4 pt-4">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
          <Clock className="h-4 w-4" strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Waktu Solat</h2>
          <p className="truncate text-[11px] text-gray-500 dark:text-slate-400">
            {active.data?.hijriLabel ? `${active.data.hijriLabel} · ` : ''}Waktu Arab Saudi
          </p>
        </div>
      </div>

      <div className="mt-3 flex gap-1 px-4">
        {CITY_TABS.map((tab) => {
          const on = tab.id === activeCity;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveCity(tab.id)}
              aria-pressed={on}
              className={`min-h-9 flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                on
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="p-4">
        {!active.data && active.status === 'error' ? (
          <PrayerError />
        ) : !active.data ? (
          <PrayerSkeleton />
        ) : (
          <>
            {next && (
              <div className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 dark:bg-emerald-900/20">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                  Solat berikutnya{next.tomorrow ? ' (besok)' : ''}
                </p>
                <div className="mt-0.5 flex items-baseline justify-between gap-2">
                  <span className="text-lg font-bold text-gray-900 dark:text-white">
                    {next.label} · {next.timeLabel}
                  </span>
                  <span className="flex-none text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    {formatCountdown(next.minutesUntil)}
                  </span>
                </div>
              </div>
            )}
            <div className="grid grid-cols-5 gap-1">
              {PRAYER_ORDER.map((name) => {
                const isNext = next?.name === name && !next?.tomorrow;
                return (
                  <div
                    key={name}
                    className={`rounded-lg px-1 py-2 text-center ${
                      isNext
                        ? 'bg-emerald-600 text-white'
                        : 'bg-gray-50 text-gray-500 dark:bg-slate-700/50 dark:text-slate-400'
                    }`}
                  >
                    <p className="text-[10px] font-semibold">{PRAYER_LABELS[name]}</p>
                    <p className={`mt-0.5 text-xs font-bold ${isNext ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
                      {formatHHMM(active.data!.timings[name])}
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function PrayerSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-16 rounded-xl bg-gray-100 dark:bg-slate-700" />
      <div className="grid grid-cols-5 gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 rounded-lg bg-gray-100 dark:bg-slate-700" />
        ))}
      </div>
    </div>
  );
}

function PrayerError() {
  return (
    <div className="py-4 text-center">
      <Clock className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-600" strokeWidth={2} />
      <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">Jadwal solat tak tersedia</p>
      <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Periksa koneksi lalu buka lagi Beranda.</p>
    </div>
  );
}
```

- [ ] **Step 2: Wire into BerandaPage**

In `src/components/portal-jamaah/pages/BerandaPage.tsx`:
1. Tambahkan impor bersama impor komponen lain: `import PrayerTimesCard from '../components/PrayerTimesCard';`
2. Sisipkan kartu tepat setelah `<SmartAlertsStrip .../>` dan sebelum `<PortalMenuGrid .../>`:

```tsx
        <SmartAlertsStrip data={data} onNavigate={onNavigate} />

        <PrayerTimesCard schedule={data.schedule} booking={data.booking} />

        <PortalMenuGrid onNavigate={onNavigate} />
```

- [ ] **Step 3: Verify types and build**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: Tidak ada error pada `PrayerTimesCard.tsx` atau `BerandaPage.tsx`.

Run: `npm run build`
Expected: Build sukses.

- [ ] **Step 4: Commit**

```bash
git add src/components/portal-jamaah/components/PrayerTimesCard.tsx src/components/portal-jamaah/pages/BerandaPage.tsx
git commit -m "feat(portal-jamaah): kartu Waktu Solat Mekkah & Madinah di Beranda"
```

---

## Manual verification checklist (untuk user)

Jalankan `npm run dev`, buka Portal Jamaah via magic link, lalu di Beranda:

- [ ] Kartu "Waktu Solat" muncul di bawah Smart Alerts, di atas grid menu.
- [ ] Tab **Mekkah** / **Madinah** berganti; angka sedikit berbeda (~1–3 menit) antar kota.
- [ ] "Solat berikutnya" menampilkan nama + jam + hitung mundur; solat berikutnya juga ter-highlight di deret 5 waktu.
- [ ] Tanggal Hijriah tampil di sub-judul.
- [ ] Mode gelap: warna kartu, tab, dan highlight terbaca.
- [ ] Matikan jaringan lalu reload → kartu tetap tampil dari cache (bila sudah pernah dimuat hari itu).
- [ ] Blokir Aladhan / hapus cache saat offline → kartu fallback "Jadwal solat tak tersedia", Beranda lain tetap normal.
- [ ] (Opsional tz) Set jam perangkat ke sekitar tengah malam WIB → jadwal tetap menunjuk hari & waktu Riyadh yang benar.

## Catatan risiko

- **Ketergantungan Aladhan**: bila API turun & belum ada cache → fallback ringkas; tak merusak Beranda. Sumber bisa diganti di `prayerTimesApi.ts` tanpa menyentuh UI.
- **Akurasi kota utama**: `schedule.itinerary` bertipe bebas & `location` sering null → deteksi Madinah jarang aktif; ini hanya memengaruhi tab default, bukan kebenaran data. Default aman = Mekkah.
