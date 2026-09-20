# Meta & Kartu OG per Filter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tiap URL filter halaman Jadwal publik punya `<title>`, `description`, dan `og:image` sendiri saat di-share ke WhatsApp.

**Architecture:** Kodek slug filter diangkat dari `src/utils/filter-logic.ts` (TypeScript, tak bisa diimpor Node) ke `lib/filter-slug.js` (JS murni) supaya server dan klien memakai kodek yang sama. Di atasnya, `lib/filter-share-meta.js` membangun teks meta, dan `generateFilterOgPng` menggambar kartu ke-6 di `lib/og-generator.mjs`. Kartu TIDAK memuat data paket, jadi server tidak perlu ikut menyaring paket sama sekali.

**Tech Stack:** Node ESM, Express (`server.js`), sharp + SVG (`lib/og-generator.mjs`), React/TS (`src/App.tsx`), `node --test` + esbuild untuk tes.

**Spec:** `docs/superpowers/specs/2026-09-20-meta-og-filter-jadwal-design.md`

## Global Constraints

- Kartu OG **tanpa data paket** (tanpa jumlah paket, harga, tanggal). Ini yang menghapus kebutuhan server menyaring paket.
- Kanvas OG selalu **1200×630**.
- Setiap teks yang masuk SVG **wajib** lewat `stripUnrenderableGlyphs` lalu `escapeXml`. Emoji yang lolos membuat Pango gagal **fatal** dan mematikan proses Express — bukan exception JS, tidak ada try/catch yang menyelamatkan.
- `resolveFilterSlug` adalah **gerbang negatif** di `src/main.tsx`: slug tak dikenal = ID paket. Perilakunya wajib identik sesudah ekstraksi; pola yang melonggar menelan `/nikita/JBU1574`.
- `tests/jadwal-filter-url.test.js` **tidak boleh diubah** sepanjang plan ini. Ia jaring pengaman ekstraksi.
- Baseline `npx tsc --noEmit` = **33 error** (semuanya pre-existing). Tidak boleh bertambah — modul `lib/*.js` yang diimpor TS wajib punya `.d.ts` pendamping.
- Tanpa sitemap, robots.txt, canonical. Di luar cakupan.
- Commit langsung di `main`, `git add` per berkas.

---

### Task 1: Angkat kodek slug ke `lib/filter-slug.js`

**Files:**
- Create: `lib/filter-slug.js`
- Create: `lib/filter-slug.d.ts`
- Create: `tests/filter-slug.test.js`
- Modify: `src/utils/filter-logic.ts` (buang blok kodek, ganti jadi impor + re-export)
- Test (tidak diubah, harus tetap hijau): `tests/jadwal-filter-url.test.js`

**Interfaces:**
- Consumes: `packageTypeSlug`, `packageTypeFromSlug` dari `src/lib/packageType.js`.
- Produces:
  - `FILTER_MODE_SLUGS: Record<string,string>`
  - `SLUG_TO_FILTER_MODE: Record<string,string>`
  - `LEGACY_FILTER_SLUGS: Record<string,{mode:string,secondaryValue?:string}>`
  - `FILTER_MODE_LABELS: Record<string,string>`
  - `LANDING_FILTER_CODES: readonly string[]`
  - `MONTH_NAMES_ID: readonly string[]`
  - `filterModeLabel(mode: string): string`
  - `getFilterSlug(mode: string): string`
  - `buildFilterSlug(mode: string, secondaryValue?: string): string`
  - `resolveFilterSlug(slug: string): { mode: string; secondaryValue?: string } | null`
  - `getFilterModeFromSlug(slug: string): string | null`
  - `landingCityName(code: string): string`

- [ ] **Step 1: Tulis tes yang gagal**

Buat `tests/filter-slug.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LANDING_FILTER_CODES,
  buildFilterSlug,
  getFilterModeFromSlug,
  landingCityName,
  resolveFilterSlug,
} from '../lib/filter-slug.js';
import { airportCityName } from './fixtures/journey-city.js';

// Kodek slug filter, kini JS murni supaya server.js bisa memakainya. Perilakunya
// WAJIB identik dengan versi TypeScript-nya — dijaga juga dari sisi pemanggil TS
// oleh tests/jadwal-filter-url.test.js yang sengaja TIDAK diubah.

test('bolak-balik: tiap bentuk slug kembali ke mode + nilainya', () => {
  const cases = [
    ['TIPE PAKET', 'UMROH RAMADHAN', 'umroh-ramadhan'],
    ['TIPE PAKET', 'PLUS AL ULA', 'plus-al-ula'],
    ['LANDING DI', 'MED', 'landing-madinah'],
    ['LANDING DI', 'JED', 'landing-jeddah'],
    ['DATA PER-BULAN', '2026-11', 'november-2026'],
    ['DURASI PERJALANAN', '9', '9-hari'],
  ];
  for (const [mode, value, slug] of cases) {
    assert.equal(buildFilterSlug(mode, value), slug, `${mode} → slug`);
    assert.deepEqual(resolveFilterSlug(slug), { mode, secondaryValue: value }, `${slug} → filter`);
  }
});

test('mode telanjang: slug tanpa nilai', () => {
  assert.equal(buildFilterSlug('LANDING DI', ''), 'landing-di');
  assert.equal(buildFilterSlug('AVAILABLE', ''), '');
  assert.deepEqual(resolveFilterSlug('tipe-paket'), { mode: 'TIPE PAKET' });
  assert.deepEqual(resolveFilterSlug('data-per-bulan'), { mode: 'DATA PER-BULAN' });
});

test('slug lama tetap dikenali — link-nya sudah tersebar di WhatsApp', () => {
  assert.deepEqual(resolveFilterSlug('umroh-promo'), { mode: 'TIPE PAKET', secondaryValue: 'UMROH PROMO' });
  assert.deepEqual(resolveFilterSlug('bintang-5'), { mode: 'TIPE PAKET', secondaryValue: 'UMROH RAHMAH' });
});

test('GERBANG NEGATIF: slug asing tetap null, kalau tidak detail paket jadi daftar jadwal', () => {
  // src/main.tsx membaca null sebagai "ini ID paket". Pola yang melonggar akan
  // menelan /nikita/JBU1574.
  for (const asing of ['JBU1574', 'jbu1574', '', 'ngawur', 'landing-', 'hari', '0-hari-x']) {
    assert.equal(getFilterModeFromSlug(asing), null, `slug asing: "${asing}"`);
  }
});

test('paritas nama kota: peta lokal sejalan dengan journey.ts', () => {
  // Modul ini menyalin dua entri (JED/MED) saja, bukan seluruh LANDING_AIRPORT_MAP.
  // Tes ini yang menahan keduanya tidak menyimpang diam-diam.
  for (const code of LANDING_FILTER_CODES) {
    assert.equal(landingCityName(code), airportCityName(code), `kota ${code}`);
  }
});
```

Buat juga `tests/fixtures/journey-city.js` yang membundel `airportCityName` dari TypeScript-nya:

```js
// airportCityName hidup di src/utils/journey.ts (TS, ber-alias '@'). Dibundel
// esbuild supaya tes paritas membandingkan dengan sumber ASLI, bukan salinan.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = new URL('../..', import.meta.url).pathname;
const dir = await mkdtemp(join(tmpdir(), 'journey-city-'));
const outfile = join(dir, 'journey.mjs');
await build({
  entryPoints: [join(root, 'src/utils/journey.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  alias: { '@': join(root, 'src') },
  logLevel: 'silent',
});
export const { airportCityName } = await import(pathToFileURL(outfile).href);
```

- [ ] **Step 2: Jalankan tes, pastikan GAGAL**

Run: `node --test tests/filter-slug.test.js`
Expected: FAIL — `Cannot find module '../lib/filter-slug.js'`

- [ ] **Step 3: Buat `lib/filter-slug.js`**

Pindahkan verbatim dari `src/utils/filter-logic.ts` (buang anotasi TS):

```js
/**
 * Kodek slug filter halaman Jadwal publik — SATU sumber untuk tiga pemakai:
 *   1. Klien   → src/utils/filter-logic.ts (re-export; pemanggil tak berubah)
 *   2. Router  → src/main.tsx lewat getFilterModeFromSlug (GERBANG NEGATIF)
 *   3. Server  → server.js, untuk meta & kartu OG per filter
 *
 * Diangkat ke sini karena filter-logic.ts itu TypeScript ber-alias '@' dan
 * mengimpor data-service — Node tidak bisa mengimpornya. Menyalin kodeknya ke
 * server bukan pilihan: slug filter bertambah dari waktu ke waktu
 * ('umroh-ramadhan' lahir 2026-09-20), dan salinan yang tertinggal membuat slug
 * baru kehilangan kartu OG-nya tanpa satu tes pun gagal.
 *
 * JEBAKAN: setiap pola di sini WAJIB sempit dan tertutup. main.tsx membaca
 * "slug tak dikenal" sebagai ID paket; pola yang melonggar akan menelan
 * /nikita/JBU1574 dan mengubah halaman detail paket jadi daftar jadwal.
 */

import { packageTypeFromSlug, packageTypeSlug } from '../src/lib/packageType.js';

export const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

/** Dua pintu masuk Saudi; lihat catatan di filter-logic.ts kenapa hanya dua. */
export const LANDING_FILTER_CODES = ['JED', 'MED'];

/**
 * Nama kota untuk DUA kode landing saja. Sengaja bukan seluruh
 * LANDING_AIRPORT_MAP milik journey.ts — modul ini tidak boleh menyeret
 * dependensi TS. Paritasnya dikunci tests/filter-slug.test.js.
 */
const LANDING_CITY_NAME = { JED: 'Jeddah', MED: 'Madinah' };

export function landingCityName(code) {
  const key = String(code || '').trim().toUpperCase();
  return LANDING_CITY_NAME[key] || key;
}

export const FILTER_MODE_SLUGS = {
  'AVAILABLE': '',
  'LANDING DI': 'landing-di',
  'LIBURAN_SEKOLAH': 'liburan-sekolah',
  'UMROH CUTI 5 HARI': 'cuti-5-hari',
  'TIPE PAKET': 'tipe-paket',
  'DURASI PERJALANAN': 'durasi-perjalanan',
  'DATA PER-BULAN': 'data-per-bulan',
  'SEMUA DATA': 'semua-data',
};

export const FILTER_MODE_LABELS = {
  'AVAILABLE': 'SEAT TERSEDIA',
  'TIPE PAKET': 'JENIS PAKET',
  'LANDING DI': 'LANDING DI',
  'LIBURAN_SEKOLAH': 'LIBURAN SEKOLAH',
  'UMROH CUTI 5 HARI': 'UMROH CUTI 5 HARI',
  'DURASI PERJALANAN': 'DURASI PERJALANAN',
  'DATA PER-BULAN': 'DATA PER-BULAN',
  'SEMUA DATA': 'SEMUA DATA',
};

export function filterModeLabel(mode) {
  return FILTER_MODE_LABELS[mode] ?? String(mode).replace(/_/g, ' ');
}

export const SLUG_TO_FILTER_MODE = Object.fromEntries(
  Object.entries(FILTER_MODE_SLUGS)
    .filter(([, slug]) => slug !== '')
    .map(([mode, slug]) => [slug, mode])
);

export const LEGACY_FILTER_SLUGS = {
  'umroh-promo': { mode: 'TIPE PAKET', secondaryValue: 'UMROH PROMO' },
  'umroh-musim-dingin': { mode: 'TIPE PAKET', secondaryValue: 'UMROH MUSIM DINGIN' },
  'umroh-reguler': { mode: 'TIPE PAKET', secondaryValue: 'UMROH SAJA' },
  'bintang-5': { mode: 'TIPE PAKET', secondaryValue: 'UMROH RAHMAH' },
};

export function getFilterSlug(mode) {
  return FILTER_MODE_SLUGS[mode] || '';
}

const LANDING_SLUG_PREFIX = 'landing-';
const DURATION_SLUG_SUFFIX = '-hari';

function slugifyCity(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function landingSlug(code) {
  const key = String(code || '').trim().toUpperCase();
  if (!LANDING_FILTER_CODES.includes(key)) return null;
  const city = slugifyCity(landingCityName(key));
  return city ? `${LANDING_SLUG_PREFIX}${city}` : null;
}

function landingFromSlug(slug) {
  if (!slug.startsWith(LANDING_SLUG_PREFIX)) return null;
  const city = slug.slice(LANDING_SLUG_PREFIX.length);
  if (!city) return null;
  return LANDING_FILTER_CODES.find(code => slugifyCity(landingCityName(code)) === city) ?? null;
}

function monthSlug(monthKey) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || '').trim());
  if (!match) return null;
  const name = MONTH_NAMES_ID[parseInt(match[2], 10) - 1];
  return name ? `${name.toLowerCase()}-${match[1]}` : null;
}

function monthFromSlug(slug) {
  const match = /^([a-z]+)-(\d{4})$/.exec(slug);
  if (!match) return null;
  const index = MONTH_NAMES_ID.findIndex(name => name.toLowerCase() === match[1]);
  if (index < 0) return null;
  return `${match[2]}-${String(index + 1).padStart(2, '0')}`;
}

function durationSlug(days) {
  return /^\d{1,2}$/.test(String(days || '').trim())
    ? `${parseInt(days, 10)}${DURATION_SLUG_SUFFIX}`
    : null;
}

function durationFromSlug(slug) {
  const match = new RegExp(`^(\\d{1,2})${DURATION_SLUG_SUFFIX}$`).exec(slug);
  return match ? String(parseInt(match[1], 10)) : null;
}

export function buildFilterSlug(mode, secondaryValue) {
  const base = getFilterSlug(mode);
  const value = String(secondaryValue || '').trim();
  if (!value) return base;

  switch (mode) {
    case 'LANDING DI': return landingSlug(value) || base;
    case 'DATA PER-BULAN': return monthSlug(value) || base;
    case 'DURASI PERJALANAN': return durationSlug(value) || base;
    case 'TIPE PAKET': return packageTypeSlug(value) || base;
    default: return base;
  }
}

export function resolveFilterSlug(slug) {
  const key = String(slug || '').toLowerCase();
  if (!key) return null;

  const mode = SLUG_TO_FILTER_MODE[key];
  if (mode) return { mode };

  const legacy = LEGACY_FILTER_SLUGS[key];
  if (legacy) return legacy;

  const landing = landingFromSlug(key);
  if (landing) return { mode: 'LANDING DI', secondaryValue: landing };

  const month = monthFromSlug(key);
  if (month) return { mode: 'DATA PER-BULAN', secondaryValue: month };

  const days = durationFromSlug(key);
  if (days) return { mode: 'DURASI PERJALANAN', secondaryValue: days };

  // Roster tipe paket tertutup (PACKAGE_TYPE_ORDER), jadi aman sebagai penutup.
  const type = packageTypeFromSlug(key);
  if (type) return { mode: 'TIPE PAKET', secondaryValue: type };

  return null;
}

export function getFilterModeFromSlug(slug) {
  return resolveFilterSlug(slug)?.mode ?? null;
}
```

**Catatan:** `LEGACY_FILTER_SLUGS` sekarang memakai string literal, bukan konstanta `PACKAGE_TYPE_*`, supaya modul ini tidak ikut mengimpor konstanta yang hanya dipakai di situ. Nilainya identik; tes bolak-balik menguncinya.

- [ ] **Step 4: Buat `lib/filter-slug.d.ts`**

```ts
export interface ResolvedFilterSlug {
  mode: string;
  secondaryValue?: string;
}

export const MONTH_NAMES_ID: readonly string[];
export const LANDING_FILTER_CODES: readonly string[];
export const FILTER_MODE_SLUGS: Record<string, string>;
export const FILTER_MODE_LABELS: Record<string, string>;
export const SLUG_TO_FILTER_MODE: Record<string, string>;
export const LEGACY_FILTER_SLUGS: Record<string, ResolvedFilterSlug>;

export function landingCityName(code: string): string;
export function filterModeLabel(mode: string): string;
export function getFilterSlug(mode: string): string;
export function buildFilterSlug(mode: string, secondaryValue?: string): string;
export function resolveFilterSlug(slug: string): ResolvedFilterSlug | null;
export function getFilterModeFromSlug(slug: string): string | null;
```

- [ ] **Step 5: Jalankan tes baru, pastikan LULUS**

Run: `node --test tests/filter-slug.test.js`
Expected: PASS, 5 tes.

- [ ] **Step 6: Ubah `src/utils/filter-logic.ts` jadi re-export bertipe**

Hapus blok kodek (konstanta slug, label, helper slug, `buildFilterSlug`, `resolveFilterSlug`, `getFilterModeFromSlug`, `getFilterSlug`, `LANDING_FILTER_CODES`, `MONTH_NAMES_ID`) dan ganti dengan:

```ts
import {
  FILTER_MODE_LABELS as FILTER_MODE_LABELS_JS,
  FILTER_MODE_SLUGS as FILTER_MODE_SLUGS_JS,
  LANDING_FILTER_CODES as LANDING_FILTER_CODES_JS,
  LEGACY_FILTER_SLUGS as LEGACY_FILTER_SLUGS_JS,
  MONTH_NAMES_ID as MONTH_NAMES_ID_JS,
  SLUG_TO_FILTER_MODE as SLUG_TO_FILTER_MODE_JS,
  buildFilterSlug as buildFilterSlugJs,
  filterModeLabel as filterModeLabelJs,
  getFilterSlug as getFilterSlugJs,
  resolveFilterSlug as resolveFilterSlugJs,
} from '../../lib/filter-slug.js';

// Kodeknya JS murni (dipakai server.js juga). Di sini ia dipakaikan kembali tipe
// FilterMode supaya 15 pemanggil resolveFilterSlug dan barrel src/utils/index.ts
// tidak ada yang perlu berubah.
const MONTH_NAMES_ID = MONTH_NAMES_ID_JS;

export const FILTER_MODE_SLUGS = FILTER_MODE_SLUGS_JS as Record<FilterMode, string>;
export const FILTER_MODE_LABELS = FILTER_MODE_LABELS_JS as Record<FilterMode, string>;
export const SLUG_TO_FILTER_MODE = SLUG_TO_FILTER_MODE_JS as Record<string, FilterMode>;
export const LEGACY_FILTER_SLUGS = LEGACY_FILTER_SLUGS_JS as Record<string, { mode: FilterMode; secondaryValue?: string }>;
export const LANDING_FILTER_CODES: readonly string[] = LANDING_FILTER_CODES_JS;

export function filterModeLabel(mode: FilterMode | string): string {
  return filterModeLabelJs(String(mode));
}
export function getFilterSlug(mode: FilterMode): string {
  return getFilterSlugJs(mode);
}
export function buildFilterSlug(mode: FilterMode, secondaryValue?: string): string {
  return buildFilterSlugJs(mode, secondaryValue);
}
export function resolveFilterSlug(slug: string): { mode: FilterMode; secondaryValue?: string } | null {
  return resolveFilterSlugJs(slug) as { mode: FilterMode; secondaryValue?: string } | null;
}
export function getFilterModeFromSlug(slug: string): FilterMode | null {
  return resolveFilterSlug(slug)?.mode ?? null;
}
```

`MONTH_NAMES_ID` tetap dipakai `approximateHijriMonth` dan `groupByMonth` di berkas ini, jadi alias lokalnya dipertahankan. Impor `airportCityName` dari `./journey` mungkin jadi tak terpakai — periksa dan buang kalau iya (`getLandingCityName` masih memakainya di fungsi lain; jangan buang membabi buta).

- [ ] **Step 7: Buktikan ekstraksi tidak mengubah perilaku**

Run: `node --test tests/jadwal-filter-url.test.js tests/jadwal-filter-tipe-paket.test.js tests/filter-header-tipe-paket.test.js tests/jadwal-filter-landing-di.test.js`
Expected: PASS semua, **tanpa satu baris tes pun diubah**. Kalau ada yang merah, ekstraksinya mengubah perilaku — perbaiki modulnya, jangan tesnya.

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -cE "error TS"`
Expected: `33` (tidak bertambah).

Run: `NODE_ENV=production npm run build`
Expected: hijau.

- [ ] **Step 8: Commit**

```bash
git add lib/filter-slug.js lib/filter-slug.d.ts tests/filter-slug.test.js tests/fixtures/journey-city.js src/utils/filter-logic.ts
git commit -m "refactor(filter): angkat kodek slug ke lib/filter-slug.js"
```

---

### Task 2: `lib/filter-share-meta.js` — teks meta per filter

**Files:**
- Create: `lib/filter-share-meta.js`
- Create: `lib/filter-share-meta.d.ts`
- Create: `tests/filter-share-meta.test.js`

**Interfaces:**
- Consumes: `resolveFilterSlug`, `landingCityName`, `MONTH_NAMES_ID` dari `lib/filter-slug.js`; `packageTypeLabel` dari `src/lib/packageType.js`.
- Produces: `buildFilterShareMeta({ filterSlug, agentName, agentSlug }) → FilterShareMeta | null` dengan bentuk `{ mode, eyebrow, headline, title, description, ogImagePath }`.

- [ ] **Step 1: Tulis tes yang gagal**

Buat `tests/filter-share-meta.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFilterShareMeta } from '../lib/filter-share-meta.js';

const nikita = { agentName: 'Nikita Sari', agentSlug: 'nikita' };

test('tiap dimensi punya eyebrow & headline sendiri', () => {
  const cases = [
    ['umroh-ramadhan',  'JENIS PAKET',       'Umroh Ramadhan',         'Umroh Ramadhan'],
    ['landing-madinah', 'KOTA LANDING',      'Madinah',                'Landing Madinah'],
    ['9-hari',          'DURASI PERJALANAN', '9 Hari',                 'Umroh 9 Hari'],
    ['november-2026',   'KEBERANGKATAN',     'November 2026',          'Keberangkatan November 2026'],
  ];
  for (const [slug, eyebrow, headline, titleHead] of cases) {
    const meta = buildFilterShareMeta({ filterSlug: slug, ...nikita });
    assert.equal(meta.eyebrow, eyebrow, `${slug} eyebrow`);
    assert.equal(meta.headline, headline, `${slug} headline`);
    assert.equal(meta.title, `${titleHead} — Jadwal Umroh Alhijaz | Nikita Sari`, `${slug} title`);
    assert.equal(meta.ogImagePath, `/og/filter/nikita/${slug}.png`, `${slug} og path`);
  }
});

test('mode telanjang memakai Title Case dari eyebrow-nya', () => {
  // Label dropdown "DATA PER-BULAN" itu jargon internal — tidak boleh tayang.
  const bulan = buildFilterShareMeta({ filterSlug: 'data-per-bulan', ...nikita });
  assert.equal(bulan.eyebrow, 'KEBERANGKATAN');
  assert.equal(bulan.headline, 'Keberangkatan');
  const tipe = buildFilterShareMeta({ filterSlug: 'tipe-paket', ...nikita });
  assert.equal(tipe.headline, 'Jenis Paket');
});

test('tanpa agent: sufiks jatuh ke nama perusahaan, og path tanpa slug', () => {
  const meta = buildFilterShareMeta({ filterSlug: 'umroh-ramadhan' });
  assert.equal(meta.title, 'Umroh Ramadhan — Jadwal Umroh Alhijaz Indowisata');
  assert.equal(meta.ogImagePath, '/og/filter/umroh-ramadhan.png');
  assert.doesNotMatch(meta.description, /bersama/);
});

test('deskripsi menyebut filter + agent dan menutup dengan ajakan WhatsApp', () => {
  const meta = buildFilterShareMeta({ filterSlug: 'umroh-ramadhan', ...nikita });
  assert.match(meta.description, /Umroh Ramadhan/);
  assert.match(meta.description, /Nikita Sari/);
  assert.match(meta.description, /WhatsApp/);
});

test('slug bukan-filter → null (bukan kartu kosong)', () => {
  // Pemanggil memakai null sebagai "pakai kartu agent" — fail-open.
  for (const asing of ['JBU1574', 'ngawur', '', undefined, 'jamaah']) {
    assert.equal(buildFilterShareMeta({ filterSlug: asing, ...nikita }), null, `slug: ${asing}`);
  }
});

test('mode tanpa sub-filter tidak dapat kartu sendiri', () => {
  // SEAT TERSEDIA & SEMUA DATA itu keadaan bawaan halaman, bukan "filter" yang
  // layak dibagikan dengan kartu sendiri.
  assert.equal(buildFilterShareMeta({ filterSlug: 'semua-data', ...nikita }), null);
});
```

- [ ] **Step 2: Jalankan, pastikan GAGAL**

Run: `node --test tests/filter-share-meta.test.js`
Expected: FAIL — `Cannot find module '../lib/filter-share-meta.js'`

- [ ] **Step 3: Implementasi `lib/filter-share-meta.js`**

```js
/**
 * Teks meta & kartu share untuk URL filter halaman Jadwal publik.
 *
 * SATU sumber untuk dua pemakai: server.js (suntikan SSR + rute /og/filter) dan
 * src/App.tsx (judul tab saat pindah filter tanpa reload). Kalau dipisah, judul
 * tab dan kartu WhatsApp bisa menyebut filter yang sama dengan dua nama berbeda.
 *
 * Kartunya TIDAK memuat data paket (jumlah/harga/tanggal) — itu keputusan
 * produk, dan konsekuensinya modul ini tidak butuh satu baris pun data jadwal.
 */

import { MONTH_NAMES_ID, landingCityName, resolveFilterSlug } from './filter-slug.js';
import { packageTypeLabel } from '../src/lib/packageType.js';

const COMPANY = 'Alhijaz Indowisata';

/**
 * Label dimensi SENGAJA tidak diambil dari FILTER_MODE_LABELS: label itu milik
 * dropdown (huruf besar semua) dan sebagiannya jargon internal — "DATA
 * PER-BULAN" tidak pantas tayang di kartu yang dikirim ke jamaah.
 */
const DIMENSION = {
  'TIPE PAKET':        { eyebrow: 'JENIS PAKET',       bare: 'Jenis Paket' },
  'LANDING DI':        { eyebrow: 'KOTA LANDING',      bare: 'Kota Landing' },
  'DURASI PERJALANAN': { eyebrow: 'DURASI PERJALANAN', bare: 'Durasi Perjalanan' },
  'DATA PER-BULAN':    { eyebrow: 'KEBERANGKATAN',     bare: 'Keberangkatan' },
};

/** 'UMROH RAMADHAN' → 'Umroh Ramadhan'; 'PLUS AL ULA' → 'Plus AL ULA'. */
function typeHeadline(value) {
  return packageTypeLabel(value);
}

/** '2026-11' → 'November 2026' */
function monthHeadline(value) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(value || ''));
  if (!m) return '';
  return `${MONTH_NAMES_ID[parseInt(m[2], 10) - 1]} ${m[1]}`;
}

function headlineFor(mode, value) {
  if (!value) return DIMENSION[mode].bare;
  switch (mode) {
    case 'TIPE PAKET': return typeHeadline(value);
    case 'LANDING DI': return landingCityName(value);
    case 'DURASI PERJALANAN': return `${value} Hari`;
    case 'DATA PER-BULAN': return monthHeadline(value);
    default: return DIMENSION[mode].bare;
  }
}

/** Bentuk yang dibaca manusia di judul — beda dari headline kartu. */
function titleHeadFor(mode, value, headline) {
  if (!value) return DIMENSION[mode].bare;
  switch (mode) {
    case 'LANDING DI': return `Landing ${headline}`;
    case 'DURASI PERJALANAN': return `Umroh ${headline}`;
    case 'DATA PER-BULAN': return `Keberangkatan ${headline}`;
    default: return headline;
  }
}

export function buildFilterShareMeta({ filterSlug, agentName, agentSlug } = {}) {
  const resolved = resolveFilterSlug(filterSlug);
  if (!resolved) return null;

  const dimension = DIMENSION[resolved.mode];
  // AVAILABLE / SEMUA DATA / LIBURAN_SEKOLAH / CUTI 5 HARI tidak punya entri:
  // itu keadaan halaman, bukan filter yang layak punya kartu sendiri.
  if (!dimension) return null;

  const value = resolved.secondaryValue || '';
  const headline = headlineFor(resolved.mode, value);
  if (!headline) return null;

  const titleHead = titleHeadFor(resolved.mode, value, headline);
  const name = String(agentName || '').trim();
  const slug = String(agentSlug || '').trim();

  const title = name
    ? `${titleHead} — Jadwal Umroh Alhijaz | ${name}`
    : `${titleHead} — Jadwal Umroh ${COMPANY}`;

  const description = name
    ? `Jadwal dan harga paket ${titleHead.toLowerCase()} dari ${COMPANY} bersama ${name}. Klik untuk lihat pilihan paket dan konsultasi via WhatsApp.`
    : `Jadwal dan harga paket ${titleHead.toLowerCase()} dari ${COMPANY}. Klik untuk lihat pilihan paket dan konsultasi via WhatsApp.`;

  const safeSlug = String(filterSlug || '').toLowerCase();
  const ogImagePath = slug
    ? `/og/filter/${slug}/${safeSlug}.png`
    : `/og/filter/${safeSlug}.png`;

  return { mode: resolved.mode, eyebrow: dimension.eyebrow, headline, title, description, ogImagePath };
}
```

- [ ] **Step 4: Buat `lib/filter-share-meta.d.ts`**

```ts
export interface FilterShareMeta {
  mode: string;
  eyebrow: string;
  headline: string;
  title: string;
  description: string;
  ogImagePath: string;
}

export function buildFilterShareMeta(input: {
  filterSlug?: string | null;
  agentName?: string | null;
  agentSlug?: string | null;
}): FilterShareMeta | null;
```

- [ ] **Step 5: Jalankan tes, pastikan LULUS**

Run: `node --test tests/filter-share-meta.test.js`
Expected: PASS, 6 tes.

- [ ] **Step 6: Commit**

```bash
git add lib/filter-share-meta.js lib/filter-share-meta.d.ts tests/filter-share-meta.test.js
git commit -m "feat(og): modul teks meta share per filter jadwal"
```

---

### Task 3: `generateFilterOgPng` — kartu OG ke-6

**Files:**
- Modify: `lib/og-generator.mjs` (tambah fungsi di akhir, sebelum `regenerateOgForAgent`)
- Create: `tests/filter-og-card.test.js`

**Interfaces:**
- Consumes: helper yang sudah ada di berkas yang sama — `stripUnrenderableGlyphs`, `escapeXml`, `measureText`, `wrapOgLines`, `truncateOgText`, `ogInitials`.
- Produces: `generateFilterOgPng({ eyebrow, headline, agentName, agentPhotoBuffer }) → Promise<Buffer>` (PNG 1200×630).

- [ ] **Step 1: Tulis tes yang gagal**

Buat `tests/filter-og-card.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { generateFilterOgPng } from '../lib/og-generator.mjs';

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
  const png = await generateFilterOgPng({
    eyebrow: 'KOTA LANDING',
    headline: 'Madinah',
    agentName: 'Nikita ❤️ Sari 🕋',
    agentPhotoBuffer: null,
  });
  const meta = await sharp(png).metadata();
  assert.equal(meta.width, 1200);
});

test('headline panjang tetap terbentuk (turun ukuran, bukan meledak)', async () => {
  const png = await generateFilterOgPng({
    eyebrow: 'JENIS PAKET',
    headline: 'Umroh Plus Turki Dan Dubai Sekalian Al Ula Panjang Sekali',
    agentName: '',
    agentPhotoBuffer: null,
  });
  const meta = await sharp(png).metadata();
  assert.equal(meta.height, 630);
});

test('tanpa agent: footer jatuh ke nama perusahaan', async () => {
  const png = await generateFilterOgPng({
    eyebrow: 'KEBERANGKATAN',
    headline: 'November 2026',
    agentName: '',
    agentPhotoBuffer: null,
  });
  assert.ok(png.length > 1000);
});
```

- [ ] **Step 2: Jalankan, pastikan GAGAL**

Run: `node --test tests/filter-og-card.test.js`
Expected: FAIL — `generateFilterOgPng is not a function`

- [ ] **Step 3: Implementasi di `lib/og-generator.mjs`**

Tambahkan sebelum `regenerateOgForAgent`:

```js
/**
 * Kartu share untuk URL filter halaman Jadwal (mis. /nikita/umroh-ramadhan).
 *
 * Memakai sasis kartu paket: gradien hijau, logo AIW, watermark Ka'bah, baris
 * agent. Bedanya SENGAJA kosong di tengah — tanpa chip, panel harga, atau blok
 * hotel — karena kartu ini tidak memuat data paket sama sekali. Itu yang
 * membuatnya tidak bisa basi, dan karena itu pula ia tidak butuh penanda versi
 * ?v= seperti kartu paket.
 */
export async function generateFilterOgPng({ eyebrow, headline, agentName, agentPhotoBuffer }) {
  const W = 1200;
  const H = 630;
  const MARGIN = 56;

  const rawHeadline = stripUnrenderableGlyphs(String(headline || '')).trim() || 'Jadwal Umroh';
  const TITLE_STEPS = [
    { size: 72, step: 82, maxLines: 2, eyebrowGap: 74 },
    { size: 56, step: 64, maxLines: 3, eyebrowGap: 60 },
  ];
  const fitted = TITLE_STEPS
    .map(s => ({ ...s, lines: wrapOgLines(rawHeadline, s.size, 760, s.maxLines) }))
    .find(s => !s.lines.some(line => line.endsWith('…')))
    || { ...TITLE_STEPS[TITLE_STEPS.length - 1], lines: wrapOgLines(rawHeadline, 56, 760, 3) };

  const titleLines = fitted.lines.map(escapeXml);
  const lastBaseline = 360;
  const firstBaseline = lastBaseline - fitted.step * (titleLines.length - 1);
  const eyebrowBaseline = firstBaseline - fitted.eyebrowGap;

  const safeEyebrow = escapeXml(stripUnrenderableGlyphs(String(eyebrow || 'JADWAL UMROH')).toUpperCase());
  const safeAgent = escapeXml(truncateOgText(stripUnrenderableGlyphs(agentName) || '', 28));
  const safeInitials = escapeXml(ogInitials(agentName));

  const badgeText = 'JADWAL UMROH';
  const badgeW = Math.round(measureText(badgeText, 14) + 3 * badgeText.length + 32);
  const badgeX = W - MARGIN - badgeW;

  let avatarBuffer = null;
  if (agentPhotoBuffer) {
    try {
      avatarBuffer = await sharp(agentPhotoBuffer)
        .resize(52, 52, { fit: 'cover' })
        .composite([{ input: Buffer.from('<svg width="52" height="52"><circle cx="26" cy="26" r="26" fill="white"/></svg>'), blend: 'dest-in' }])
        .png()
        .toBuffer();
    } catch (err) {
      console.warn('[og-generator] Failed to process filter agent photo:', err.message);
    }
  }

  const footerSvg = safeAgent
    ? `
      <circle cx="84" cy="556" r="28" fill="#FFFFFF26" stroke="#D4AF37" stroke-width="2"/>
      ${avatarBuffer ? '' : `<text x="84" y="564" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="800" fill="#FFFFFF" text-anchor="middle">${safeInitials}</text>`}
      <text x="126" y="550" font-family="Inter, Arial, sans-serif" font-size="19" font-weight="700" fill="#FFFFFF">${safeAgent}</text>
      <text x="126" y="572" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="700" letter-spacing="1.6" fill="#F0DDA8">KONSULTAN UMROH &amp; HAJI PLUS</text>`
    : `
      <text x="${MARGIN}" y="550" font-family="Inter, Arial, sans-serif" font-size="19" font-weight="700" fill="#FFFFFF">PT Alhijaz Indowisata</text>
      <text x="${MARGIN}" y="572" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="700" letter-spacing="1.6" fill="#F0DDA8">TRAVEL UMROH &amp; HAJI PLUS</text>`;

  const svg = Buffer.from(`
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fltBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#03241A"/>
          <stop offset="100%" stop-color="#0A5C42"/>
        </linearGradient>
        <radialGradient id="fltHalo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#F0DDA8" stop-opacity="0.20"/>
          <stop offset="100%" stop-color="#F0DDA8" stop-opacity="0"/>
        </radialGradient>
      </defs>

      <rect width="${W}" height="${H}" fill="url(#fltBg)"/>
      <circle cx="1160" cy="50" r="260" fill="#D4AF37" opacity="0.08"/>
      <circle cx="70" cy="660" r="230" fill="#34D399" opacity="0.08"/>
      <circle cx="1000" cy="220" r="178" fill="url(#fltHalo)"/>

      <rect x="${badgeX}" y="48" width="${badgeW}" height="35" rx="9" fill="none" stroke="#FFFFFF66" stroke-width="1.5"/>
      <text x="${badgeX + badgeW / 2}" y="71" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="800" letter-spacing="3" fill="#FFFFFFCC" text-anchor="middle">${badgeText}</text>

      <text x="${MARGIN}" y="${eyebrowBaseline}" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="800" letter-spacing="3.4" fill="#D4AF37">${safeEyebrow}</text>
      ${titleLines.map((line, i) => `<text x="${MARGIN}" y="${firstBaseline + i * fitted.step}" font-family="Inter, Arial, sans-serif" font-size="${fitted.size}" font-weight="800" letter-spacing="-1.4" fill="#FFFFFF">${line}</text>`).join('')}

      <rect x="${MARGIN}" y="424" width="96" height="5" rx="2.5" fill="#D4AF37"/>
      <text x="${MARGIN}" y="470" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="600" fill="#FFFFFFCC">Lihat jadwal, harga, dan sisa kursi</text>

      ${footerSvg}
      <text x="${W - MARGIN}" y="562" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="700" fill="#FFFFFFB3" text-anchor="end">alhijaz.co</text>
    </svg>
  `);

  const composites = [];

  const logoPath = path.join(PROJECT_ROOT, 'src', 'new-logo', 'new-logo-alhijaz-white.png');
  if (fs.existsSync(logoPath)) {
    const logo = await sharp(logoPath).resize({ width: 190 }).png().toBuffer();
    composites.push({ input: logo, left: MARGIN, top: 46 });
  }

  const emblemPath = path.join(PROJECT_ROOT, 'public', 'img-brosur', 'kabah.png');
  if (fs.existsSync(emblemPath)) {
    try {
      const scaled = await sharp(emblemPath).resize({ width: 340 }).ensureAlpha().png().toBuffer();
      const { width: ew, height: eh } = await sharp(scaled).metadata();
      const emblem = await sharp(scaled)
        .composite([{ input: Buffer.from(`<svg width="${ew}" height="${eh}"><rect width="${ew}" height="${eh}" fill="#ffffff4a"/></svg>`), blend: 'dest-in' }])
        .png()
        .toBuffer();
      composites.push({ input: emblem, left: 820, top: 190 });
    } catch (err) {
      console.warn('[og-generator] Failed to process filter emblem:', err.message);
    }
  }

  if (avatarBuffer && safeAgent) composites.push({ input: avatarBuffer, left: 58, top: 530 });

  return sharp(svg).composite(composites).png({ quality: 92 }).toBuffer();
}
```

- [ ] **Step 4: Jalankan tes, pastikan LULUS**

Run: `node --test tests/filter-og-card.test.js`
Expected: PASS, 4 tes.

- [ ] **Step 5: Lihat kartunya dengan mata sendiri**

```bash
node -e "import('./lib/og-generator.mjs').then(async m => { const fs = await import('fs'); fs.writeFileSync('/tmp/claude-501/filter-card.png', await m.generateFilterOgPng({ eyebrow: 'JENIS PAKET', headline: 'Umroh Ramadhan', agentName: 'Nikita Sari', agentPhotoBuffer: null })); })"
```

Buka `/tmp/claude-501/filter-card.png`. Periksa: eyebrow emas terbaca, headline tidak terpotong, tidak ada blok kosong menganga, Kabah tidak menabrak teks. Setel koordinat kalau perlu, lalu ulangi.

- [ ] **Step 6: Commit**

```bash
git add lib/og-generator.mjs tests/filter-og-card.test.js
git commit -m "feat(og): kartu share per filter jadwal"
```

---

### Task 4: Rute `/og/filter/…png`

**Files:**
- Modify: `server.js` (tambah dua rute tepat sesudah `app.get('/og/paket/:packageId.png')`, ~baris 23793)

**Interfaces:**
- Consumes: `buildFilterShareMeta` (Task 2), `generateFilterOgPng` (Task 3), `resolveSlug` + `loadAgentPhotoBuffer` (sudah ada di server.js).
- Produces: URL `/og/filter/:slug/:filterSlug.png` dan `/og/filter/:filterSlug.png`.

- [ ] **Step 1: Tambah impor**

Di baris impor `lib/og-generator.mjs` (server.js:46), tambahkan `generateFilterOgPng`. Lalu tambahkan impor baru:

```js
import { buildFilterShareMeta } from './lib/filter-share-meta.js';
```

- [ ] **Step 2: Tambah rute**

```js
// Kartu share per filter jadwal. Tidak memuat data paket, jadi tidak perlu
// penanda versi ?v= seperti kartu paket — tak ada yang bisa basi.
const FILTER_SLUG_RE = /^[a-z0-9-]{1,48}$/;

async function sendFilterOgPng(res, { agent, filterSlug }) {
  const meta = buildFilterShareMeta({
    filterSlug,
    agentName: agent?.name || '',
    agentSlug: agent?.slug || '',
  });
  if (!meta) return res.status(404).type('text/plain').send('not found');

  const agentPhotoBuffer = agent ? await loadAgentPhotoBuffer(agent.photo, agent.slug) : null;
  const png = await generateFilterOgPng({
    eyebrow: meta.eyebrow,
    headline: meta.headline,
    agentName: agent?.name || '',
    agentPhotoBuffer,
  });

  return res.set({
    'Content-Type': 'image/png',
    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
  }).send(png);
}

app.get('/og/filter/:slug/:filterSlug.png', async (req, res) => {
  const slug = String(req.params.slug || '').toLowerCase();
  const filterSlug = String(req.params.filterSlug || '').toLowerCase();
  if (!/^[a-z0-9-]{1,64}$/.test(slug) || !FILTER_SLUG_RE.test(filterSlug)) {
    return res.status(404).type('text/plain').send('not found');
  }
  try {
    const resolved = await resolveSlug(slug);
    if (!resolved?.agent) return res.status(404).type('text/plain').send('not found');
    return await sendFilterOgPng(res, { agent: resolved.agent, filterSlug });
  } catch (err) {
    console.error('[og/filter] generation failed:', slug, filterSlug, err.message);
    return res.status(500).type('text/plain').send('og generation failed');
  }
});

// Bentuk tanpa agent, untuk link telanjang alhijaz.co/umroh-ramadhan.
app.get('/og/filter/:filterSlug.png', async (req, res) => {
  const filterSlug = String(req.params.filterSlug || '').toLowerCase();
  if (!FILTER_SLUG_RE.test(filterSlug)) {
    return res.status(404).type('text/plain').send('not found');
  }
  try {
    return await sendFilterOgPng(res, { agent: null, filterSlug });
  } catch (err) {
    console.error('[og/filter] generation failed (tanpa slug):', filterSlug, err.message);
    return res.status(500).type('text/plain').send('og generation failed');
  }
});
```

- [ ] **Step 3: Cek sintaks**

Run: `node --check server.js`
Expected: keluar tanpa output.

- [ ] **Step 4: Uji rutenya hidup**

Restart server lokal (`npm start` di terminal terpisah — server.js TIDAK hot-reload), lalu:

```bash
curl -s -o /tmp/claude-501/r1.png -w "%{http_code} %{content_type} %{size_download}\n" "http://localhost:3000/og/filter/nikita/umroh-ramadhan.png"
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/og/filter/nikita/JBU1574.png"
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/og/filter/umroh-ramadhan.png"
```

Expected: `200 image/png <ukuran>`, lalu `404`, lalu `200`.

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "feat(og): rute kartu share per filter jadwal"
```

---

### Task 5: Suntikan SSR di SPA fallback

**Files:**
- Modify: `server.js` — cabang `if (agent) { … }` di `app.get('{*path}')` (~baris 24398-24425)

**Interfaces:**
- Consumes: `buildFilterShareMeta` (sudah diimpor di Task 4).
- Produces: HTML dengan `<title>`, `description`, `og:*`, `twitter:*` per filter.

- [ ] **Step 1: Hitung `filterMeta` sebelum cabang judul**

Tepat sesudah blok `portalMeta` dihitung, tambahkan:

```js
    // Segmen filter: /:slug/:filterSlug di alhijaz.co, atau segmen pertama di
    // custom domain (host sudah mengidentifikasi agent).
    // Slug yang bukan filter mengembalikan null → cabangnya dilewati dan kartu
    // agent yang dipakai. Fail-open: lebih baik kartu generik daripada kosong.
    const pathSegments = req.path.replace(/^\/+/, '').split('/').filter(Boolean);
    const filterSegment = req.customDomain ? pathSegments[0] : pathSegments[1];
    const filterMeta = portalMeta
      ? null
      : buildFilterShareMeta({
          filterSlug: filterSegment,
          agentName: agent.name,
          agentSlug: agent.slug,
        });
```

- [ ] **Step 2: Sisipkan cabang di rantai judul**

Ubah `if (portalMeta) { … } else { … }` jadi tiga cabang:

```js
    if (portalMeta) {
      // …biarkan apa adanya…
    } else if (filterMeta) {
      newTitle = filterMeta.title;
      newDescription = filterMeta.description;
      ogImageUrl = `${ogImageOrigin}${filterMeta.ogImagePath}`;
    } else {
      // …biarkan apa adanya…
    }
```

- [ ] **Step 3: Cek sintaks**

Run: `node --check server.js`
Expected: keluar tanpa output.

- [ ] **Step 4: Uji HTML yang dikirim server — bukan setelah JS jalan**

Restart server, lalu:

```bash
for u in "/nikita" "/nikita/umroh-ramadhan" "/nikita/landing-madinah" "/nikita/9-hari" "/nikita/november-2026" "/nikita/tipe-paket" "/nikita/JBU1517"; do
  echo "--- $u"
  curl -s "http://localhost:3000$u" | grep -oE '<title>[^<]*</title>|<meta property="og:image" content="[^"]*"' | head -2
done
```

Expected:
- `/nikita` → judul agent generik, `og:image` = `/og/nikita.png`
- keempat URL filter → judul sendiri, `og:image` = `/og/filter/nikita/<slug>.png`
- `/nikita/tipe-paket` → "Jenis Paket — …"
- `/nikita/JBU1517` → **tidak** berubah jadi kartu filter (fail-open ke kartu paket/agent)

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "feat(og): suntikan meta per filter di SPA fallback"
```

---

### Task 6: Judul tab ikut filter di klien

**Files:**
- Modify: `src/App.tsx` (~baris 317-330)
- Create: `tests/jadwal-filter-title.test.js`

**Interfaces:**
- Consumes: `buildFilterShareMeta` (Task 2), `buildFilterSlug` (sudah diimpor App.tsx lewat `@/utils`).

- [ ] **Step 1: Tulis tes penjaga yang gagal**

Buat `tests/jadwal-filter-title.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');

test('judul tab dibangun dari modul share-meta yang sama dengan SSR', () => {
  // Kalau klien menyusun judulnya sendiri, judul tab dan kartu WhatsApp bisa
  // menyebut filter yang sama dengan dua nama berbeda.
  assert.match(app, /buildFilterShareMeta/);
  assert.match(app, /from '@\/\.\.\/lib\/filter-share-meta\.js'|from '\.\.\/lib\/filter-share-meta\.js'/);
});

test('efek judul ikut filterMode & filterSecondaryValue', () => {
  // Tanpa dua dep ini, judul hanya benar saat muat pertama dan basi begitu
  // pengguna berpindah filter tanpa reload.
  const effect = app.match(/\/\/ Dynamic SEO[\s\S]*?\}, \[[^\]]*\]\);/)?.[0] ?? '';
  assert.notEqual(effect, '', 'efek judul tidak ditemukan');
  assert.match(effect, /filterMode/);
  assert.match(effect, /filterSecondaryValue/);
});

test('paket tunggal tetap menang atas judul filter', () => {
  const effect = app.match(/\/\/ Dynamic SEO[\s\S]*?\}, \[[^\]]*\]\);/)?.[0] ?? '';
  assert.match(effect, /singlePackageId/, 'gerbang singlePackageId hilang → dua efek berebut judul');
});
```

- [ ] **Step 2: Jalankan, pastikan GAGAL**

Run: `node --test tests/jadwal-filter-title.test.js`
Expected: FAIL — `buildFilterShareMeta` belum ada di App.tsx.

- [ ] **Step 3: Pindahkan blok judul ke efeknya sendiri**

Buang blok "Dynamic SEO" dari efek pembaca URL, dan tambahkan efek terpisah:

```tsx
  // Dynamic SEO — judul tab & description mengikuti filter yang sedang aktif.
  //
  // Server sudah menulis meta yang benar untuk muat pertama (SPA fallback di
  // server.js). Efek ini yang menangani apa yang SSR tidak bisa jangkau:
  // pengguna berpindah filter tanpa reload. Ia memakai modul yang SAMA dengan
  // server supaya judul tab dan kartu WhatsApp tidak pernah menyebut filter
  // yang sama dengan dua nama berbeda.
  //
  // Paket tunggal punya efeknya sendiri yang lebih spesifik — digerbang di sini
  // supaya keduanya tidak berebut judul.
  useEffect(() => {
    if (singlePackageId) return;
    const agentName = currentAgent?.name || '';
    const filterSlug = buildFilterSlug(filterMode, filterSecondaryValue);
    const meta = buildFilterShareMeta({ filterSlug, agentName });

    const title = meta?.title
      || (agentName ? `Jadwal Umroh Alhijaz | ${agentName}` : 'Jadwal Umroh - Alhijaz Indowisata');
    const description = meta?.description
      || (agentName
        ? `Dapatkan info lengkap paket umrah Alhijaz Indowisata bersama ${agentName}. Klik untuk konsultasi via WhatsApp.`
        : 'Cek jadwal dan harga paket Umroh Alhijaz Indowisata');

    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
  }, [singlePackageId, currentAgent, filterMode, filterSecondaryValue]);
```

Tambahkan impor di bagian atas `src/App.tsx`:

```tsx
import { buildFilterShareMeta } from '../lib/filter-share-meta.js';
```

- [ ] **Step 4: Jalankan tes, pastikan LULUS**

Run: `node --test tests/jadwal-filter-title.test.js`
Expected: PASS, 3 tes.

- [ ] **Step 5: Verifikasi tidak ada regresi**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -cE "error TS"`
Expected: `33`.

Run: `NODE_ENV=production npm run build`
Expected: hijau.

Run: `node --test tests/filter-slug.test.js tests/filter-share-meta.test.js tests/filter-og-card.test.js tests/jadwal-filter-title.test.js tests/jadwal-filter-url.test.js tests/jadwal-filter-tipe-paket.test.js tests/filter-header-tipe-paket.test.js tests/jadwal-filter-landing-di.test.js tests/package-type.test.js`
Expected: PASS semua.

- [ ] **Step 6: Verifikasi di browser**

Buka `http://localhost:5173/nikita`, ganti filter ke beberapa mode, periksa judul tab berubah dan **tidak** berkedip balik ke judul generik.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx tests/jadwal-filter-title.test.js
git commit -m "feat(jadwal): judul tab ikut filter aktif"
```

---

## Verifikasi akhir

- [ ] `npx tsc --noEmit` = 33 error (tidak bertambah)
- [ ] `NODE_ENV=production npm run build` hijau
- [ ] Seluruh suite terkait hijau, `tests/jadwal-filter-url.test.js` **tidak diubah**
- [ ] `curl` ke 5 URL filter menunjukkan `<title>` dan `og:image` berbeda-beda
- [ ] Kartu PNG dilihat dengan mata, bukan sekadar diasumsikan terbentuk
- [ ] `/nikita/JBU1517` dan `/nikita` tidak berubah perilakunya
