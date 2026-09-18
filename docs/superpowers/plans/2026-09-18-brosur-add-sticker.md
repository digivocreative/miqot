# Add Sticker (Brosur) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agent bisa menempelkan sticker pemasaran ke brosur — geser bebas, atur ukuran, beberapa sekaligus — dan sticker itu ikut terbakar ke berkas yang diunduh/dibagikan.

**Architecture:** Rasterisasi dulu, lalu satu studio. Ketiga permukaan brosur menyiapkan satu `Blob`, menyerahkannya ke `StickerStudio` (blob masuk → blob keluar), dan studio yang memiliki tombol Simpan/Bagikan. Geometri sticker ternormalisasi (0..1) di modul murni yang dipakai bersama oleh pratinjau DOM dan komposit kanvas, jadi keduanya tidak bisa berbeda pendapat.

**Tech Stack:** React 18 + TypeScript, Tailwind, framer-motion, Pointer Events, Canvas 2D, `node:test` + esbuild + playwright/chromium + vite untuk tes, `sharp` untuk membangun aset thumbnail.

**Spec:** `docs/superpowers/specs/2026-09-18-brosur-add-sticker-design.md`

## Global Constraints

- **Commit langsung di `main`.** Cek `git branch --show-current` sebelum commit. `git add` per berkas, jangan `git add -A`.
- **Git butuh `export DEVELOPER_DIR=/Library/Developer/CommandLineTools`** di shell ini, kalau tidak setiap perintah git keluar dengan exit 69 "Xcode license".
- **`npm run lint` rusak repo-wide** — jangan dipakai sebagai gerbang.
- **Suite penuh/e2e dijalankan user.** Sesi ini menjalankan `node --check`, `npx tsc`, `npm run build`, dan tes yang terkait saja.
- **Baseline merah pre-existing (bukan regresi):** `npx tsc` ±23 galat; `tests/brochure-export-consistency.browser.test.js` subtes 1, 4, 5; `tests/native-share-payload.browser.test.js`.
- **Tes playwright wajib menutup browser di `finally`/`after`.** Chromium yang dibiarkan hidup menahan event loop node dan `node --test` menggantung SELAMANYA tanpa satu baris keluaran.
- **Jangan pernah `<img crossOrigin>` untuk gambar yang akan di-`drawImage` lalu di-`toBlob`.** Ambil sebagai blob lalu `decodeImageBlob`. Kanvas yang ternoda baru melempar setelah semuanya tergambar.
- **Sticker ditempel di ATAS brosur yang sudah di-stamp identitas agent**, tidak pernah sebaliknya.
- URL sticker: `https://alhijaz.b-cdn.net/sticker/<id>.png` (CORS `*`, terverifikasi 2026-09-18).
- Keluaran studio selalu **JPEG kualitas 0.9**, ekstensi `.jpg`, cocok dengan `BROSUR_EXPORT_QUALITY`.

---

### Task 1: Katalog sticker + aset thumbnail

**Files:**
- Create: `src/lib/stickerCatalog.js`
- Create: `src/lib/stickerCatalog.d.ts`
- Create: `scripts/build-sticker-thumbs.mjs`
- Create: `public/img-sticker/<21 berkas>.webp` (dihasilkan script)
- Test: `tests/sticker-catalog.test.js`

**Interfaces:**
- Consumes: —
- Produces: `STICKER_BASE`, `STICKER_THUMB_BASE`, `STICKERS`, `STICKER_GROUPS`, `stickerById(id)`, `stickerFullUrl(id)`, `stickerThumbUrl(id)`

- [ ] **Step 1: Tulis tes yang gagal**

`tests/sticker-catalog.test.js`:

```js
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  STICKERS, STICKER_GROUPS, STICKER_BASE,
  stickerById, stickerFullUrl, stickerThumbUrl,
} from '../src/lib/stickerCatalog.js';

const root = fileURLToPath(new URL('..', import.meta.url));

test('21 sticker, id unik', () => {
  assert.equal(STICKERS.length, 21);
  assert.equal(new Set(STICKERS.map(s => s.id)).size, 21);
});

test('tiap sticker punya thumbnail yang benar-benar ada di public/img-sticker', () => {
  for (const s of STICKERS) {
    assert.ok(existsSync(`${root}public/img-sticker/${s.id}.webp`), `thumbnail hilang: ${s.id}`);
  }
});

test('tiap sticker masuk grup yang terdaftar dan punya label', () => {
  const ids = new Set(STICKER_GROUPS.map(g => g.id));
  for (const s of STICKERS) {
    assert.ok(ids.has(s.group), `grup tak dikenal: ${s.group}`);
    assert.ok(s.label.length > 0);
    assert.ok(s.aspect > 0);
  }
});

test('setiap grup punya minimal satu sticker — tidak ada tab kosong di picker', () => {
  for (const g of STICKER_GROUPS) {
    assert.ok(STICKERS.some(s => s.group === g.id), `grup kosong: ${g.id}`);
  }
});

test('URL terbentuk dari id, bukan ditulis ulang per entri', () => {
  assert.equal(stickerFullUrl('sold-out'), `${STICKER_BASE}/sold-out.png`);
  assert.equal(stickerThumbUrl('sold-out'), '/img-sticker/sold-out.webp');
  assert.equal(stickerById('sold-out').label, 'Sold Out');
  assert.equal(stickerById('tidak-ada'), null);
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

```bash
node --test tests/sticker-catalog.test.js
```
Expected: FAIL — `Cannot find module '../src/lib/stickerCatalog.js'`

- [ ] **Step 3: Tulis katalog**

`src/lib/stickerCatalog.js` — semua sticker 1254×1254 (diverifikasi 2026-09-18), jadi `aspect: 1`:

```js
// Katalog sticker brosur. Daftar sengaja hardcode: sticker baru jarang, dan
// manifest/endpoint menambah mode gagal (JSON basi di cache CDN) untuk masalah
// yang tidak ada. Menambah sticker = unggah PNG ke Bunny, tambah baris di sini,
// jalankan `node scripts/build-sticker-thumbs.mjs`, commit thumbnail-nya.
export const STICKER_BASE = 'https://alhijaz.b-cdn.net/sticker';
export const STICKER_THUMB_BASE = '/img-sticker';

export const STICKER_GROUPS = [
  { id: 'ketersediaan', label: 'Ketersediaan' },
  { id: 'populer', label: 'Populer' },
  { id: 'fasilitas', label: 'Fasilitas' },
  { id: 'plus', label: 'Plus' },
  { id: 'promo', label: 'Promo' },
];

// `aspect` = lebar/tinggi, ditulis di sini dan TIDAK dibaca dari naturalWidth
// saat runtime. Geometri jadi tidak pernah bergantung pada gambar sudah termuat
// atau belum, dan pratinjau (thumbnail lokal) dijamin memakai rasio yang sama
// dengan komposit (PNG Bunny).
export const STICKERS = [
  { id: 'sisa-1-seat',       label: 'Sisa 1 Seat',       group: 'ketersediaan', aspect: 1 },
  { id: 'sisa-2-seat',       label: 'Sisa 2 Seat',       group: 'ketersediaan', aspect: 1 },
  { id: 'sisa-3-seat',       label: 'Sisa 3 Seat',       group: 'ketersediaan', aspect: 1 },
  { id: 'seat-terbatas',     label: 'Seat Terbatas',     group: 'ketersediaan', aspect: 1 },
  { id: 'tinggal-sedikit',   label: 'Tinggal Sedikit',   group: 'ketersediaan', aspect: 1 },
  { id: 'hampir-full',       label: 'Hampir Full',       group: 'ketersediaan', aspect: 1 },
  { id: 'last-seat',         label: 'Last Seat',         group: 'ketersediaan', aspect: 1 },
  { id: 'full-booked',       label: 'Full Booked',       group: 'ketersediaan', aspect: 1 },
  { id: 'sold-out',          label: 'Sold Out',          group: 'ketersediaan', aspect: 1 },
  { id: 'best-seller',       label: 'Best Seller',       group: 'populer',      aspect: 1 },
  { id: 'paling-dicari',     label: 'Paling Dicari',     group: 'populer',      aspect: 1 },
  { id: 'favorit-jamaah',    label: 'Favorit Jamaah',    group: 'populer',      aspect: 1 },
  { id: 'jadwal-favorit',    label: 'Jadwal Favorit',    group: 'populer',      aspect: 1 },
  { id: 'pilihan-keluarga',  label: 'Pilihan Keluarga',  group: 'populer',      aspect: 1 },
  { id: 'hotel-bintang-5',   label: 'Hotel Bintang 5',   group: 'fasilitas',    aspect: 1 },
  { id: 'hotel-dekat-haram', label: 'Hotel Dekat Haram', group: 'fasilitas',    aspect: 1 },
  { id: 'direct-flight',     label: 'Direct Flight',     group: 'fasilitas',    aspect: 1 },
  { id: 'plus-dubai',        label: 'Plus Dubai',        group: 'plus',         aspect: 1 },
  { id: 'plus-redsea',       label: 'Plus Red Sea',      group: 'plus',         aspect: 1 },
  { id: 'plus-turki',        label: 'Plus Turki',        group: 'plus',         aspect: 1 },
  { id: 'promo-terbatas',    label: 'Promo Terbatas',    group: 'promo',        aspect: 1 },
];

const BY_ID = new Map(STICKERS.map(s => [s.id, s]));

export function stickerById(id) {
  return BY_ID.get(id) ?? null;
}

export function stickerFullUrl(id) {
  return `${STICKER_BASE}/${id}.png`;
}

export function stickerThumbUrl(id) {
  return `${STICKER_THUMB_BASE}/${id}.webp`;
}
```

`src/lib/stickerCatalog.d.ts`:

```ts
export type StickerGroupId = 'ketersediaan' | 'populer' | 'fasilitas' | 'plus' | 'promo';

export interface StickerDef {
  id: string;
  label: string;
  group: StickerGroupId;
  /** lebar/tinggi gambar sticker. */
  aspect: number;
}

export interface StickerGroupDef {
  id: StickerGroupId;
  label: string;
}

export const STICKER_BASE: string;
export const STICKER_THUMB_BASE: string;
export const STICKER_GROUPS: ReadonlyArray<StickerGroupDef>;
export const STICKERS: ReadonlyArray<StickerDef>;
export function stickerById(id: string): StickerDef | null;
export function stickerFullUrl(id: string): string;
export function stickerThumbUrl(id: string): string;
```

- [ ] **Step 4: Tulis script pembangun thumbnail**

`scripts/build-sticker-thumbs.mjs`:

```js
// Bangun thumbnail picker dari sticker asli di Bunny.
//
// Sticker asli 1254×1254 PNG, ±440 KB per keping — galeri 21 keping = ±9,5 MB
// di kuota HP agent. Bunny Image Optimizer TIDAK aktif di pull zone ini
// (?width=/?format= dikembalikan utuh sebagai PNG), jadi turunannya dibuat di
// sini dan di-commit. WebP 256px ≈ 30 KB/keping.
//
// Aman terhadap precache: PRECACHE_GLOB_PATTERNS hanya menyapu assets/**,
// index.html, offline.html, ikon, dan font brosur. Berkas public/ mendarat di
// akar dist/, jadi img-sticker/ tidak ikut precache.
//
// Jalankan ulang tiap menambah sticker: node scripts/build-sticker-thumbs.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { STICKERS, stickerFullUrl } from '../src/lib/stickerCatalog.js';

const THUMB_PX = 256;
const outDir = fileURLToPath(new URL('../public/img-sticker/', import.meta.url));

await mkdir(outDir, { recursive: true });

let total = 0;
for (const sticker of STICKERS) {
  const url = stickerFullUrl(sticker.id);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${sticker.id}: HTTP ${response.status} dari ${url}`);
  const source = Buffer.from(await response.arrayBuffer());

  const webp = await sharp(source)
    .resize(THUMB_PX, THUMB_PX, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 90, effort: 6 })
    .toBuffer();

  await writeFile(`${outDir}${sticker.id}.webp`, webp);
  total += webp.length;
  console.log(`${sticker.id.padEnd(20)} ${(webp.length / 1024).toFixed(0)} KB`);
}

console.log(`\n${STICKERS.length} thumbnail, total ${(total / 1024).toFixed(0)} KB`);
```

- [ ] **Step 5: Jalankan script, lalu jalankan tes**

```bash
node scripts/build-sticker-thumbs.mjs && node --test tests/sticker-catalog.test.js
```
Expected: 21 baris ukuran lalu total ±630 KB; kelima tes PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/stickerCatalog.js src/lib/stickerCatalog.d.ts scripts/build-sticker-thumbs.mjs tests/sticker-catalog.test.js public/img-sticker
git commit -m "feat(brosur): katalog 21 sticker + script thumbnail WebP lokal"
```

---

### Task 2: Geometri sticker (murni)

**Files:**
- Create: `src/lib/stickerLayout.js`
- Create: `src/lib/stickerLayout.d.ts`
- Test: `tests/sticker-layout.test.js`

**Interfaces:**
- Consumes: `StickerDef.aspect` dari Task 1 (diteruskan sebagai argumen; modul ini TIDAK mengimpor katalog — ia murni geometri)
- Produces: `STICKER_W_MIN = 0.1`, `STICKER_W_MAX = 1`, `STICKER_W_DEFAULT = 0.3`, `MIN_VISIBLE = 0.25`, `defaultPlacement(stickerId, index)`, `clampPlacement(placement, aspect, imageAspect)`, `placementToRect(placement, aspect, boxW, boxH)`, `rectToPlacement(rect, boxW, boxH)`
- Bentuk `Placement`: `{ stickerId: string, cx: number, cy: number, w: number }`
- Bentuk `Rect`: `{ x: number, y: number, w: number, h: number }` (piksel, x/y = sudut kiri-atas)

- [ ] **Step 1: Tulis tes yang gagal**

`tests/sticker-layout.test.js`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  STICKER_W_DEFAULT, STICKER_W_MAX, STICKER_W_MIN,
  clampPlacement, defaultPlacement, placementToRect, rectToPlacement,
} from '../src/lib/stickerLayout.js';

// Empat ukuran brosur paket yang beredar + kanvas Brosur Jadwal.
const CANVASES = [
  [1080, 1440], [1081, 1440], [1200, 1600], [1279, 1600], [1080, 1620],
];

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('placement default di tengah dan selebar STICKER_W_DEFAULT', () => {
  const p = defaultPlacement('sold-out', 0);
  assert.equal(p.stickerId, 'sold-out');
  assert.equal(p.w, STICKER_W_DEFAULT);
  assert.equal(p.cx, 0.5);
  assert.equal(p.cy, 0.5);
});

test('sticker kedua bergeser dari yang pertama — tidak menimpa persis', () => {
  const a = defaultPlacement('sold-out', 0);
  const b = defaultPlacement('best-seller', 1);
  assert.ok(a.cx !== b.cx || a.cy !== b.cy, 'placement index 1 identik dengan index 0');
});

test('pergeseran default berputar, tidak lari keluar gambar', () => {
  for (let i = 0; i < 12; i++) {
    const p = defaultPlacement('x', i);
    assert.ok(p.cx > 0 && p.cx < 1, `cx keluar rentang di index ${i}: ${p.cx}`);
    assert.ok(p.cy > 0 && p.cy < 1, `cy keluar rentang di index ${i}: ${p.cy}`);
  }
});

test('lebar di-clamp ke rentang yang diizinkan', () => {
  assert.equal(clampPlacement({ stickerId: 'x', cx: 0.5, cy: 0.5, w: 5 }, 1, 0.75).w, STICKER_W_MAX);
  assert.equal(clampPlacement({ stickerId: 'x', cx: 0.5, cy: 0.5, w: 0.001 }, 1, 0.75).w, STICKER_W_MIN);
});

test('sticker tidak bisa digeser hilang di luar tepi — minimal 25% tetap terlihat', () => {
  const imageAspect = 1080 / 1440;
  const p = clampPlacement({ stickerId: 'x', cx: 9, cy: -9, w: 0.3 }, 1, imageAspect);
  const rect = placementToRect(p, 1, 1080, 1440);
  const visibleW = Math.min(rect.x + rect.w, 1080) - Math.max(rect.x, 0);
  const visibleH = Math.min(rect.y + rect.h, 1440) - Math.max(rect.y, 0);
  assert.ok(visibleW >= rect.w * 0.25 - 1e-6, `lebar terlihat ${visibleW} < 25% dari ${rect.w}`);
  assert.ok(visibleH >= rect.h * 0.25 - 1e-6, `tinggi terlihat ${visibleH} < 25% dari ${rect.h}`);
});

test('rasio sticker terjaga di semua ukuran kanvas — persegi tetap persegi', () => {
  for (const [w, h] of CANVASES) {
    const rect = placementToRect({ stickerId: 'x', cx: 0.5, cy: 0.5, w: 0.3 }, 1, w, h);
    assert.ok(near(rect.w, rect.h, 1e-6), `${w}x${h}: ${rect.w} != ${rect.h}`);
    assert.ok(near(rect.w, w * 0.3), `${w}x${h}: lebar ${rect.w} != 30% dari ${w}`);
  }
});

test('rasio non-persegi ikut dihormati', () => {
  const rect = placementToRect({ stickerId: 'x', cx: 0.5, cy: 0.5, w: 0.5 }, 2, 1000, 1000);
  assert.ok(near(rect.w, 500));
  assert.ok(near(rect.h, 250));
});

test('konversi piksel bolak-balik kembali ke nilai semula di semua kanvas', () => {
  const original = { stickerId: 'x', cx: 0.42, cy: 0.63, w: 0.27 };
  for (const [w, h] of CANVASES) {
    const rect = placementToRect(original, 1, w, h);
    const back = rectToPlacement({ ...rect, stickerId: 'x' }, w, h);
    assert.ok(near(back.cx, original.cx, 1e-9), `${w}x${h} cx: ${back.cx}`);
    assert.ok(near(back.cy, original.cy, 1e-9), `${w}x${h} cy: ${back.cy}`);
    assert.ok(near(back.w, original.w, 1e-9), `${w}x${h} w: ${back.w}`);
  }
});

test('placement yang sama menghasilkan rect proporsional identik di kanvas berbeda', () => {
  const p = { stickerId: 'x', cx: 0.25, cy: 0.75, w: 0.4 };
  const a = placementToRect(p, 1, 1080, 1440);
  const b = placementToRect(p, 1, 1279, 1600);
  assert.ok(near(a.x / 1080, b.x / 1279, 1e-9));
  assert.ok(near(a.w / 1080, b.w / 1279, 1e-9));
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

```bash
node --test tests/sticker-layout.test.js
```
Expected: FAIL — `Cannot find module '../src/lib/stickerLayout.js'`

- [ ] **Step 3: Implementasi**

`src/lib/stickerLayout.js`:

```js
// Geometri sticker, ternormalisasi dan murni.
//
// Brosur paket beredar dalam EMPAT ukuran (1080×1440, 1081×1440, 1200×1600,
// 1279×1600) dan Brosur Jadwal 1080×1620, sementara editor menampilkannya
// diperkecil agar muat layar HP. Koordinat piksel karena itu dijamin salah.
// Yang disimpan adalah pecahan: cx/cy titik tengah dalam 0..1, w lebar sebagai
// pecahan lebar gambar. Tinggi TIDAK disimpan — ia turunan dari rasio sticker.
//
// Pratinjau dan komposit memanggil placementToRect() yang sama dengan rasio
// yang sama, hanya beda ukuran kotak, jadi keduanya tidak bisa berbeda pendapat.
export const STICKER_W_MIN = 0.1;
export const STICKER_W_MAX = 1;
export const STICKER_W_DEFAULT = 0.3;

/** Bagian sticker yang wajib tetap di dalam gambar, supaya tak bisa hilang. */
export const MIN_VISIBLE = 0.25;

// Sticker ke-n muncul bergeser dari yang sebelumnya supaya tumpukan tidak
// menimpa persis dan yang di bawah masih bisa ditap. Berputar di 8 posisi
// sehingga sticker ke-9 kembali ke tengah, bukan lari keluar gambar.
const STAGGER = [
  [0, 0], [0.08, 0.08], [-0.08, -0.08], [0.08, -0.08],
  [-0.08, 0.08], [0.16, 0.16], [-0.16, -0.16], [0.16, -0.16],
];

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function defaultPlacement(stickerId, index = 0) {
  const [dx, dy] = STAGGER[((index % STAGGER.length) + STAGGER.length) % STAGGER.length];
  return { stickerId, cx: 0.5 + dx, cy: 0.5 + dy, w: STICKER_W_DEFAULT };
}

/**
 * @param imageAspect lebar/tinggi GAMBAR DASAR — dibutuhkan karena `w` diukur
 *   terhadap lebar sedangkan batas vertikal diukur terhadap tinggi.
 */
export function clampPlacement(placement, aspect, imageAspect) {
  const w = clampNumber(placement.w, STICKER_W_MIN, STICKER_W_MAX);
  // Tinggi sticker sebagai pecahan TINGGI gambar.
  const h = (w / aspect) * imageAspect;
  const halfW = w / 2;
  const halfH = h / 2;
  // Titik tengah boleh keluar tepi sejauh (setengah − bagian wajib terlihat).
  const slackX = halfW - w * MIN_VISIBLE;
  const slackY = halfH - h * MIN_VISIBLE;
  return {
    stickerId: placement.stickerId,
    cx: clampNumber(placement.cx, -slackX, 1 + slackX),
    cy: clampNumber(placement.cy, -slackY, 1 + slackY),
    w,
  };
}

export function placementToRect(placement, aspect, boxW, boxH) {
  const w = placement.w * boxW;
  const h = w / aspect;
  return { x: placement.cx * boxW - w / 2, y: placement.cy * boxH - h / 2, w, h };
}

export function rectToPlacement(rect, boxW, boxH) {
  return {
    stickerId: rect.stickerId,
    cx: (rect.x + rect.w / 2) / boxW,
    cy: (rect.y + rect.h / 2) / boxH,
    w: rect.w / boxW,
  };
}
```

`src/lib/stickerLayout.d.ts`:

```ts
export interface StickerPlacement {
  stickerId: string;
  /** Titik tengah horizontal, pecahan lebar gambar (0..1, boleh sedikit di luar). */
  cx: number;
  /** Titik tengah vertikal, pecahan tinggi gambar. */
  cy: number;
  /** Lebar sticker sebagai pecahan lebar gambar. */
  w: number;
}

export interface StickerRect {
  stickerId?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const STICKER_W_MIN: number;
export const STICKER_W_MAX: number;
export const STICKER_W_DEFAULT: number;
export const MIN_VISIBLE: number;
export function defaultPlacement(stickerId: string, index?: number): StickerPlacement;
export function clampPlacement(placement: StickerPlacement, aspect: number, imageAspect: number): StickerPlacement;
export function placementToRect(placement: StickerPlacement, aspect: number, boxW: number, boxH: number): StickerRect;
export function rectToPlacement(rect: StickerRect, boxW: number, boxH: number): StickerPlacement;
```

- [ ] **Step 4: Jalankan tes, pastikan hijau**

```bash
node --test tests/sticker-layout.test.js
```
Expected: 9 tes PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stickerLayout.js src/lib/stickerLayout.d.ts tests/sticker-layout.test.js
git commit -m "feat(brosur): geometri sticker ternormalisasi — satu sumber untuk pratinjau & komposit"
```

---

### Task 3: Komposit ke kanvas

**Files:**
- Create: `src/utils/compositeStickers.ts`
- Create: `tests/fixtures/sticker-composite-harness.html`
- Test: `tests/sticker-composite.browser.test.js`

**Interfaces:**
- Consumes: `decodeImageBlob`, `canvasToBlob` dari `src/utils/canvasImage`; `stickerById`, `stickerFullUrl` dari Task 1; `placementToRect` dari Task 2
- Produces: `compositeStickers(base: Blob, placements: StickerPlacement[]): Promise<Blob>`, `loadStickerImage(id: string): Promise<DecodedImage>`, `STICKER_OUTPUT_MIME = 'image/jpeg'`, `STICKER_OUTPUT_QUALITY = 0.9`, `STICKER_OUTPUT_EXT = 'jpg'`

- [ ] **Step 1: Tulis harness + tes browser yang gagal**

`tests/fixtures/sticker-composite-harness.html` — halaman kosong; modul di-import lewat `page.evaluate` dari dev server vite sehingga TS-nya ditranspile vite, bukan esbuild manual:

```html
<!doctype html>
<html lang="id">
  <head><meta charset="utf-8" /><title>sticker composite harness</title></head>
  <body>
    <script type="module">
      import { compositeStickers } from '/src/utils/compositeStickers.ts';
      window.__compositeStickers = compositeStickers;
      window.__ready = true;
    </script>
  </body>
</html>
```

`tests/sticker-composite.browser.test.js`:

```js
// Penjaga invarian inti Add Sticker: yang dilihat agent == yang terkirim.
//
// Komposit dijalankan SUNGGUHAN di chromium (kanvas tidak ada di node), dengan
// PNG sticker di-stub lewat route interception supaya tes tidak bergantung pada
// Bunny CDN — yang diuji geometrinya, bukan jaringannya.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const HARNESS = '/tests/fixtures/sticker-composite-harness.html';

// PNG 8×8 merah solid, opaque — dipakai sebagai semua sticker.
const RED_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAGklEQVQokWP8z8Dwn4GKgIlqJo0aOGrgsDEQAI5+AwUX6BEsAAAAAElFTkSuQmCC';

describe('compositeStickers', () => {
  let server;
  let browser;
  let page;

  before(async () => {
    server = await createServer({ root: projectRoot, server: { port: 0 }, logLevel: 'error' });
    await server.listen();
    browser = await chromium.launch();
    page = await browser.newPage();
    await page.route('**/alhijaz.b-cdn.net/sticker/*.png', route =>
      route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(RED_PNG_BASE64, 'base64') }),
    );
    const port = server.config.server.port ?? server.httpServer.address().port;
    await page.goto(`http://localhost:${port}${HARNESS}`);
    await page.waitForFunction(() => window.__ready === true);
  });

  // WAJIB: chromium yang dibiarkan hidup menahan event loop node dan
  // `node --test` menggantung selamanya tanpa satu baris keluaran.
  after(async () => {
    await browser?.close();
    await server?.close();
  });

  async function composite(baseW, baseH, placements) {
    return page.evaluate(async ({ baseW, baseH, placements }) => {
      // Gambar dasar putih polos seukuran brosur.
      const c = document.createElement('canvas');
      c.width = baseW;
      c.height = baseH;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, baseW, baseH);
      const base = await new Promise(r => c.toBlob(r, 'image/png'));

      const out = await window.__compositeStickers(base, placements);

      const bmp = await createImageBitmap(out);
      const read = document.createElement('canvas');
      read.width = bmp.width;
      read.height = bmp.height;
      read.getContext('2d').drawImage(bmp, 0, 0);
      const rctx = read.getContext('2d');
      const at = (x, y) => Array.from(rctx.getImageData(Math.round(x), Math.round(y), 1, 1).data);
      return { width: bmp.width, height: bmp.height, type: out.type, at: { center: at(baseW / 2, baseH / 2), topLeft: at(4, 4), bottomRight: at(baseW - 5, baseH - 5) } };
    }, { baseW, baseH, placements });
  }

  const isRedish = ([r, g, b]) => r > 150 && g < 110 && b < 110;
  const isWhitish = ([r, g, b]) => r > 240 && g > 240 && b > 240;

  test('dimensi keluaran sama persis dengan dimensi masukan', async () => {
    for (const [w, h] of [[1080, 1440], [1081, 1440], [1279, 1600]]) {
      const out = await composite(w, h, [{ stickerId: 'sold-out', cx: 0.5, cy: 0.5, w: 0.3 }]);
      assert.equal(out.width, w, `lebar ${w}x${h}`);
      assert.equal(out.height, h, `tinggi ${w}x${h}`);
    }
  });

  test('sticker benar-benar tergambar di tempat yang diminta', async () => {
    const out = await composite(1080, 1440, [{ stickerId: 'sold-out', cx: 0.5, cy: 0.5, w: 0.3 }]);
    assert.ok(isRedish(out.at.center), `titik tengah tidak merah: ${out.at.center}`);
  });

  test('piksel di luar kotak sticker tidak tersentuh', async () => {
    const out = await composite(1080, 1440, [{ stickerId: 'sold-out', cx: 0.5, cy: 0.5, w: 0.3 }]);
    assert.ok(isWhitish(out.at.topLeft), `sudut kiri-atas ikut berubah: ${out.at.topLeft}`);
    assert.ok(isWhitish(out.at.bottomRight), `sudut kanan-bawah ikut berubah: ${out.at.bottomRight}`);
  });

  test('tanpa sticker, gambar dasar tetap utuh', async () => {
    const out = await composite(1080, 1440, []);
    assert.ok(isWhitish(out.at.center));
    assert.equal(out.width, 1080);
  });

  test('keluaran JPEG', async () => {
    const out = await composite(1080, 1440, [{ stickerId: 'sold-out', cx: 0.5, cy: 0.5, w: 0.3 }]);
    assert.equal(out.type, 'image/jpeg');
  });

  test('sticker yang gagal diambil melempar — tidak diam-diam dilewati', async () => {
    const failed = await page.evaluate(async () => {
      const c = document.createElement('canvas');
      c.width = 100; c.height = 100;
      const base = await new Promise(r => c.toBlob(r, 'image/png'));
      try {
        await window.__compositeStickers(base, [{ stickerId: 'tidak-ada-di-katalog', cx: 0.5, cy: 0.5, w: 0.3 }]);
        return null;
      } catch (e) {
        return String(e.message || e);
      }
    });
    assert.ok(failed, 'komposit sticker tak dikenal seharusnya melempar, bukan mengembalikan gambar polos');
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

```bash
node --test tests/sticker-composite.browser.test.js
```
Expected: FAIL — modul `/src/utils/compositeStickers.ts` tidak ada.

- [ ] **Step 3: Implementasi**

`src/utils/compositeStickers.ts`:

```ts
// Membakar sticker ke PIKSEL gambar brosur.
//
// Kontraknya blob masuk → blob keluar, tanpa pengetahuan apa pun soal paket,
// jadwal, atau desain brosur. Itu yang membuat ketiga permukaan brosur dilayani
// satu implementasi.
//
// Berbeda sikap dengan stampAgentOnBrochure yang sengaja fail-silent: di sana
// brosur tanpa identitas agent masih berguna, di sini sticker JUSTRU yang
// diminta. Sticker yang hilang diam-diam berarti agent mengirim brosur yang
// dikira ada tempelannya — jadi semua kegagalan di sini MELEMPAR.
import { placementToRect } from '../lib/stickerLayout.js';
import { stickerById, stickerFullUrl } from '../lib/stickerCatalog.js';
import type { StickerPlacement } from '../lib/stickerLayout';
import { canvasToBlob, decodeImageBlob, type DecodedImage } from './canvasImage';

export const STICKER_OUTPUT_MIME = 'image/jpeg';
export const STICKER_OUTPUT_QUALITY = 0.9;
export const STICKER_OUTPUT_EXT = 'jpg';

// Sticker yang sudah terdekode dipakai ulang: agent kerap menempel sticker yang
// sama di beberapa brosur berturut-turut, dan PNG-nya ±440 KB.
const cache = new Map<string, Promise<DecodedImage>>();

export function loadStickerImage(id: string): Promise<DecodedImage> {
  const cached = cache.get(id);
  if (cached) return cached;

  // JANGAN pakai <img crossOrigin> di sini. Gambar lintas-origin yang
  // di-drawImage lewat elemen <img> bisa menodai kanvas, dan toBlob baru
  // melempar SETELAH semuanya tergambar — jebakan yang sudah menggigit di
  // jalur stamp agent. Bunny mengirim access-control-allow-origin: *.
  const pending = (async () => {
    const response = await fetch(stickerFullUrl(id));
    if (!response.ok) throw new Error(`Sticker ${id} gagal diambil (HTTP ${response.status})`);
    return decodeImageBlob(await response.blob());
  })();

  // Kegagalan tidak boleh mengendap di cache — agent yang offline lalu online
  // lagi harus bisa mencoba lagi.
  pending.catch(() => cache.delete(id));
  cache.set(id, pending);
  return pending;
}

export async function compositeStickers(base: Blob, placements: StickerPlacement[]): Promise<Blob> {
  const decodedBase = await decodeImageBlob(base);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = decodedBase.width;
    canvas.height = decodedBase.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Kanvas tidak tersedia');

    ctx.drawImage(decodedBase.bitmap, 0, 0, decodedBase.width, decodedBase.height);

    for (const placement of placements) {
      const def = stickerById(placement.stickerId);
      if (!def) throw new Error(`Sticker ${placement.stickerId} tidak ada di katalog`);
      const image = await loadStickerImage(def.id);
      const rect = placementToRect(placement, def.aspect, decodedBase.width, decodedBase.height);
      ctx.drawImage(image.bitmap, rect.x, rect.y, rect.w, rect.h);
    }

    const out = await canvasToBlob(canvas, STICKER_OUTPUT_MIME, STICKER_OUTPUT_QUALITY);
    if (canvas.width !== decodedBase.width || canvas.height !== decodedBase.height) {
      throw new Error('Dimensi keluaran berubah');
    }
    return out;
  } finally {
    decodedBase.close();
  }
}
```

- [ ] **Step 4: Jalankan tes, pastikan hijau**

```bash
node --test tests/sticker-composite.browser.test.js
```
Expected: 6 tes PASS, dan perintah **selesai** (tidak menggantung — bukti `after` menutup chromium).

- [ ] **Step 5: Commit**

```bash
git add src/utils/compositeStickers.ts tests/fixtures/sticker-composite-harness.html tests/sticker-composite.browser.test.js
git commit -m "feat(brosur): komposit sticker ke kanvas — dimensi terkunci, gagal berisik"
```

---

### Task 4: StickerStudio

**Files:**
- Create: `src/components/StickerStudio.tsx`

**Interfaces:**
- Consumes: `STICKERS`/`STICKER_GROUPS`/`stickerById`/`stickerThumbUrl` (Task 1), `clampPlacement`/`defaultPlacement`/`placementToRect`/`STICKER_W_MIN`/`STICKER_W_MAX` (Task 2), `compositeStickers`/`STICKER_OUTPUT_EXT`/`STICKER_OUTPUT_MIME` (Task 3), `canShareFiles`/`downloadBlob`/`isTouchPrimary` dari `../utils/share`, `useBackToClose` dari `../hooks/useBackToClose`
- Produces:

```ts
export interface StickerStudioProps {
  isOpen: boolean;
  onClose: () => void;
  /** Gambar dasar yang akan ditempeli — sudah final (identitas agent terbakar). */
  baseBlob: Blob | null;
  /** Nama berkas TANPA ekstensi; studio menambahkan `.jpg`. */
  fileNameBase: string;
  tone?: 'emerald' | 'burgundy';
}
export function StickerStudio(props: StickerStudioProps): JSX.Element | null;
export default StickerStudio;
```

- [ ] **Step 1: Implementasi komponen**

Struktur (portal ke `document.body`, `z-[10001]` supaya di atas `BrochureModal` yang `z-[9999]`):

```
<div class="fixed inset-0 z-[10001] bg-white dark:bg-slate-900 flex flex-col">
  header:  judul "Tempel Sticker" + tombol X (onClose)
  body:    <div ref=stageRef class="relative" style={{width: stageW, height: stageH}}>
             <img src={baseUrl} class="absolute inset-0 w-full h-full" />
             {placements.map((p, i) => (
               <img data-sticker-layer={i} src={stickerThumbUrl(p.stickerId)}
                    style={{position:'absolute', left:rect.x, top:rect.y, width:rect.w, height:rect.h,
                            touchAction:'none', cursor:'move'}} />
             ))}
             {selected !== null && <>garis putus-putus + tombol × + pegangan sudut kanan-bawah</>}
           </div>
  footer:  [Tambah Sticker] [Simpan] / [Bagikan]
  sheet:   picker (grid berkelompok)
</div>
```

Aturan yang wajib ada:

1. **`baseUrl`** = `URL.createObjectURL(baseBlob)` di `useEffect`, di-`revokeObjectURL` saat ganti/unmount. Tanpa ini setiap buka-tutup membocorkan satu blob URL.
2. **`stageW`/`stageH`** dihitung dari dimensi natural `baseBlob` (dibaca lewat `createImageBitmap`/`Image` sekali saat blob berubah) agar muat `stageBox` tanpa memotong: skala = `min(boxW / naturalW, boxH / naturalH)`. Semua rect sticker dihitung dengan `placementToRect(p, def.aspect, stageW, stageH)` — **ukuran panggung, bukan ukuran natural**. Itulah kenapa geometri ternormalisasi: panggung dan kanvas ekspor beda ukuran tapi hasilnya proporsional identik.
3. **Geser** — Pointer Events di tiap lapisan sticker:
   - `onPointerDown`: `e.currentTarget.setPointerCapture(e.pointerId)`, catat `{ pointerId, startX: e.clientX, startY: e.clientY, startCx, startCy }`, `setSelected(i)`, `e.stopPropagation()`.
   - `onPointerMove`: kalau pointer tercatat → `cx = startCx + (e.clientX - startX) / stageW`, `cy = startCy + (e.clientY - startY) / stageH`, lalu `clampPlacement`.
   - `onPointerUp`/`onPointerCancel`: lepas catatan.
   - `style={{ touchAction: 'none' }}` **wajib** — tanpa itu browser men-scroll halaman alih-alih menggeser sticker.
4. **Cubit dua jari** — lacak pointer aktif di `Map<pointerId, {x,y}>` pada lapisan. Saat jumlahnya 2: jarak awal `d0` + lebar awal `w0` dicatat; tiap gerak `w = w0 * (d / d0)`, `clampPlacement` membatasinya ke `STICKER_W_MIN..STICKER_W_MAX`.
5. **Pegangan sudut kanan-bawah** (desktop/mouse) — pointer drag yang mengubah `w` dari jarak titik tengah sticker ke pointer: `w = (2 * dist / stageW) * (aspect-aware)`; paling sederhana: `w = clamp(2 * Math.abs(e.clientX - centerClientX) / stageW)`.
6. **Tap di luar sticker** (`onPointerDown` di `stageRef` sendiri) → `setSelected(null)`.
7. **Tombol ×** di sudut kiri-atas sticker terpilih → buang placement itu; kalau kosong, `selected = null`.
8. **Picker**: sheet dari bawah, per grup `STICKER_GROUPS`, grid `grid-cols-3`, tiap sel `<img src={stickerThumbUrl(s.id)} loading="lazy" />` + label. Tap → `setPlacements(prev => [...prev, clampPlacement(defaultPlacement(s.id, prev.length), def.aspect, imageAspect)])`, `setSelected(panjang baru - 1)`, tutup sheet.
9. **Simpan/Bagikan**: `setBusy(true)` → `const blob = await compositeStickers(baseBlob, placements)` → `const file = new File([blob], \`${fileNameBase}.${STICKER_OUTPUT_EXT}\`, { type: STICKER_OUTPUT_MIME })` → kalau `canShareFiles([file])` dan tombolnya Bagikan → `navigator.share({ files: [file] })` (abaikan `AbortError`), selain itu `downloadBlob(blob, file.name)`. **`catch` → `setError(pesan)` dan JANGAN tutup studio** — placement tetap utuh supaya agent bisa coba lagi.
10. **`useBackToClose(isOpen, onClose)`** — gestur back menutup studio, bukan halaman/modal di bawahnya.
11. Saat `isOpen` berubah `false` → reset `placements`, `selected`, `error` (penyimpanan sekali pakai).
12. Label tombol simpan mengikuti perangkat, seperti `BrochureModal`: `isTouchPrimary() && navigator.share` → "Bagikan", selain itu "Download".
13. Tombol Simpan/Bagikan **disabled saat `placements.length === 0`** dengan petunjuk "Pilih sticker dulu" — mencegah agent mengunduh ulang gambar yang sama tanpa tempelan.
14. Beri `data-sticker-layer={index}`, `data-sticker-pick={id}`, `data-sticker-save`, `data-sticker-add` sebagai penanda uji — **jangan** mengandalkan label teks, karena labelnya berubah per perangkat (pola yang sama dengan `data-share-chatgpt` di `BrochurePromptModal`).

- [ ] **Step 2: Periksa sintaks & tipe**

```bash
npx tsc --noEmit 2>&1 | grep -c "StickerStudio"
```
Expected: `0` — tidak ada galat baru dari berkas ini (baseline ±23 galat lain tetap ada).

- [ ] **Step 3: Commit**

```bash
git add src/components/StickerStudio.tsx
git commit -m "feat(brosur): StickerStudio — geser & atur ukuran sticker, simpan/bagikan dari dalam"
```

---

### Task 5: Pasang di kartu Jadwal + BrochureModal

**Files:**
- Modify: `src/components/PackageCard.tsx` (footer blok brosur, ±`:2006-2016`)
- Modify: `src/components/BrochureModal.tsx` (footer, ±`:361-395`)

**Interfaces:**
- Consumes: `StickerStudio` (Task 4)
- Produces: — (dua titik panggil; `BrochurePaketGrid` ikut terlayani lewat `BrochureModal` tanpa perubahan)

- [ ] **Step 1: `PackageCard` — tombol + studio**

Di footer blok brosur, sisipkan tombol di antara Download dan Share:

```tsx
<button
  type="button"
  data-sticker-open
  onClick={async () => {
    const blob = stampedBrosur.blob ?? await (await fetch(brosurImageUrl)).blob();
    setStickerBase(blob);
  }}
  className="flex items-center gap-1.5 text-gray-400 dark:text-slate-500 hover:text-emerald-500 transition-colors"
>
  <Sticker size={16} />
  <span className="text-xs font-semibold">Sticker</span>
</button>
```

State + render (di dekat `BrochureModal` yang sudah ada di komponen ini):

```tsx
const [stickerBase, setStickerBase] = useState<Blob | null>(null);
...
<StickerStudio
  isOpen={stickerBase !== null}
  onClose={() => setStickerBase(null)}
  baseBlob={stickerBase}
  fileNameBase={`Brosur - ${pkg.nama || 'Paket'}`}
/>
```

Impor: tambahkan `Sticker` ke impor `lucide-react` yang sudah ada, dan `import { StickerStudio } from './StickerStudio';`.

- [ ] **Step 2: `BrochureModal` — tombol + studio**

Di footer, sisipkan sebelum tombol Bagikan (tombol persegi, bukan `flex-1`, supaya `AI Tools` + `Bagikan` tetap lapang):

```tsx
<button
  type="button"
  data-sticker-open
  aria-label="Tempel sticker"
  onClick={async () => {
    const blob = stampedBlob ?? await (await fetch(renderUrl)).blob();
    setStickerBase(blob);
  }}
  className="flex-none w-12 flex items-center justify-center rounded-xl border border-emerald-200 dark:border-emerald-700/70 bg-emerald-50 dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 transition-all duration-200 active:scale-95"
>
  <Sticker size={18} />
</button>
```

State `stickerBase` + `<StickerStudio ... fileNameBase={\`Brosur - ${title}\`} tone={tone} />` dirender **di dalam portal yang sama**, setelah footer.

- [ ] **Step 3: Periksa tipe & build**

```bash
npx tsc --noEmit 2>&1 | grep -E "PackageCard|BrochureModal|StickerStudio" | head
```
Expected: kosong.

- [ ] **Step 4: Commit**

```bash
git add src/components/PackageCard.tsx src/components/BrochureModal.tsx
git commit -m "feat(brosur): tombol Sticker di kartu Jadwal & BrochureModal (Brosur Paket ikut terlayani)"
```

---

### Task 6: Pasang di Brosur Jadwal

**Files:**
- Modify: `src/components/BrochureSchedulePage.tsx` (baris aksi per halaman, ±`:1395-1400`)

**Interfaces:**
- Consumes: `StickerStudio` (Task 4), `canonicalImageAt(pageIndex)` + `filenameForBrochure` + `exportLabel` yang sudah ada di berkas ini
- Produces: —

- [ ] **Step 1: Handler**

```tsx
function handleSticker(pageIndex: number) {
  if (!exportLabel) return;
  const image = canonicalImageAt(pageIndex);
  if (!image) {
    showToast('File ekspor masih disiapkan, coba lagi sebentar');
    return;
  }
  setStickerPage({
    blob: image.blob,
    // filenameForBrochure menambahkan ekstensinya sendiri; studio memakai .jpg,
    // jadi ekstensi dibuang di sini dan studio yang memasangnya kembali.
    name: filenameForBrochure(exportLabel, pageIndex + 1, activeImagePages.length, image.ext).replace(/\.[^.]+$/, ''),
  });
}
```

State: `const [stickerPage, setStickerPage] = useState<{ blob: Blob; name: string } | null>(null);`

- [ ] **Step 2: Tombol**

Bungkus baris tombol yang ada supaya Sticker dapat barisnya sendiri (3 kolom akan memotong label "Buat Ulang AI" di HP):

```tsx
<div className="space-y-2">
  <div className="grid grid-cols-2 gap-2">
    {/* … Buat Ulang AI + Simpan yang sudah ada, tidak diubah … */}
  </div>
  <button
    type="button"
    data-sticker-open
    onClick={() => handleSticker(index)}
    disabled={!previewAvailable || busy !== null || catalogBusy}
    className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-slate-800 border border-emerald-200 dark:border-emerald-700/70 transition-all duration-200 active:scale-[0.98] disabled:opacity-70"
  >
    <Sticker size={16} />
    <span>Tempel Sticker</span>
  </button>
</div>
```

Dan di dekat modal lain di akhir komponen:

```tsx
<StickerStudio
  isOpen={stickerPage !== null}
  onClose={() => setStickerPage(null)}
  baseBlob={stickerPage?.blob ?? null}
  fileNameBase={stickerPage?.name ?? 'Brosur'}
/>
```

- [ ] **Step 3: Periksa tipe**

```bash
npx tsc --noEmit 2>&1 | grep "BrochureSchedulePage" | head
```
Expected: kosong.

- [ ] **Step 4: Commit**

```bash
git add src/components/BrochureSchedulePage.tsx
git commit -m "feat(brosur): tombol Tempel Sticker per halaman Brosur Jadwal"
```

---

### Task 7: Verifikasi menyeluruh

**Files:** —

- [ ] **Step 1: Tes yang terkait**

```bash
node --test tests/sticker-catalog.test.js tests/sticker-layout.test.js tests/sticker-composite.browser.test.js
```
Expected: semua PASS, perintah selesai (tidak menggantung).

- [ ] **Step 2: Tes brosur yang sudah ada — pastikan tidak ada regresi**

```bash
node --test tests/brochure-schedule.test.js tests/brochure-contact-slot.test.js tests/brosur-paket-katalog.test.js tests/package-card-brosur-preview.test.js tests/dashboard-brosur-toggle.test.js
```
Expected: PASS (tes ini tidak menyentuh jalur sticker; kalau merah, itu regresi nyata).

- [ ] **Step 3: Typecheck — bandingkan dengan baseline**

```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"
```
Expected: ±23 (baseline pre-existing). Angka yang lebih tinggi = galat baru; cari yang menyebut berkas sticker.

- [ ] **Step 4: Build produksi**

```bash
NODE_ENV=production npm run build
```
Expected: sukses. `npm run lint` **tidak** dipakai (rusak repo-wide).

- [ ] **Step 5: Periksa precache tidak membengkak**

```bash
grep -c "img-sticker" dist/sw.js
```
Expected: `0` — thumbnail sticker tidak boleh masuk daftar precache.

- [ ] **Step 6: Commit apa pun yang tersisa & lapor**

Laporkan ke user: hasil tiap perintah apa adanya, termasuk merah yang pre-existing, plus checklist manual yang harus dicoba sendiri (3 permukaan × geser/ubah ukuran/hapus × simpan & bagikan di HP).

---

## Self-Review

**Spec coverage:**
- §4.1 katalog → Task 1 · §4.2 geometri → Task 2 · §4.3 komposit → Task 3 · §4.4 UI → Task 4
- §5 tiga titik panggil → Task 5 (dua) + Task 6 (satu)
- §6 aset & precache → Task 1 (script + aset), Task 7 Step 5 (penjaga precache)
- §7 gagal berisik → Task 3 (melempar, diuji) + Task 4 aturan 9 (galat tampil, studio tidak tertutup)
- §8 pengujian → Task 1, 2, 3 + Task 7

**Type consistency:** `StickerPlacement` dipakai sama di Task 2 (`.d.ts`), Task 3 (impor tipe), Task 4 (state). `placementToRect(placement, aspect, boxW, boxH)` dipanggil dengan urutan argumen identik di Task 3 dan Task 4. `STICKER_OUTPUT_EXT`/`STICKER_OUTPUT_MIME` didefinisikan Task 3, dipakai Task 4.

**Catatan jujur:** Task 4 memberi struktur, prop, dan aturan gesture yang tepat, bukan 400 baris TSX lengkap. Itu batas yang disengaja — komponen UI dengan gestur lebih baik ditulis sambil melihat hasilnya daripada disalin dari rencana; yang presisi (geometri, komposit, katalog) semuanya ditulis utuh.
