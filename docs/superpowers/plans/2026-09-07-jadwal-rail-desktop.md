# Rail Desktop Halaman Jadwal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengisi ruang kosong kiri/kanan halaman jadwal publik di layar ≥1024px dengan dua rail yang terisi saat sebuah paket dipilih — kiri itinerary hari per hari, kanan tab Hotel/Biaya/Brosur — sehingga agent bisa menjelaskan satu paket tanpa menggulir ±3.000px.

**Architecture:** Lebar kolom dan rail jadi satu token CSS (`--jadwal-col-w`, `--jadwal-rail-w`) yang dipakai empat pembungkus yang sekarang menulis `max-w-lg` sendiri-sendiri. Rail memakai `position: fixed` di selokan kiri/kanan sehingga kolom tengah tak pernah bergeser karena interaksi. Di ≥1024px kartu tidak lagi memuai — hanya ditandai terpilih — dan seluruh isi wilayah muai disajikan ulang oleh dua komponen rail baru yang memakai data yang sama lewat helper murni bersama.

**Tech Stack:** React 18 + TypeScript, Vite, Tailwind (kelas + CSS var di `src/index.css`), framer-motion, `node --test` untuk unit, harness SSR esbuild (`tests/fixtures/package-card-render.js`).

**Spec:** `docs/superpowers/specs/2026-09-07-jadwal-rail-desktop-design.md`

## Global Constraints

- **Breakpoint & lebar (persis):** `<1024` kolom 512 / rail 0 · `1024–1279` kolom 420 / rail 270 · `1280–1439` kolom 512 / rail 320 · `≥1440` kolom 512 / rail 368. Jarak kolom↔rail 24px.
- **Perilaku di bawah 1024px tidak boleh berubah sama sekali.** Semua ranjau scroll iOS ada di sana.
- **Tiga pembungkus halaman DAFTAR wajib satu token:** `src/App.tsx:968` (`<main>` daftar), `src/components/FilterHeader.tsx:413`, `src/components/FloatingAgentBar.tsx:103`.
  **Koreksi saat eksekusi:** `App.tsx:860` dan `:878` ternyata milik halaman **Detail Paket** (cabang render terpisah yang `return` lebih awal di `:848`), dan `:1127` milik modal Tampilan Ringkas. Ketiganya tidak punya rail, jadi mempersempit kolomnya di 1024px hanya regresi — **sengaja dibiarkan `max-w-lg`.**
- **Mode gelap wajib** di setiap permukaan baru (`dark:` varian).
- **Analytics halaman publik wajib `trackPublicEvent`**, dan setiap event baru wajib didaftarkan di `server.js` pada `FEATURE_LABELS`, `ACTION_LABELS`, dan `VALID_PUBLIC_EVENTS` — public event yang tidak ter-whitelist di-drop 400 senyap. Butuh restart `server.js`.
- **Mode "Tampilan Ringkas" tidak disentuh** — tetap memakai modal layar penuh.
- **Menjalankan tes:** `node --test tests/<nama>.test.js` (repo tidak punya script `test`; glob wajib eksplisit). `npm run lint` rusak repo-wide — jangan dipakai sebagai gerbang.
- **Baseline merah yang sudah ada** (bukan regresi): 5 tes sejak `ec01280`, 12 tes Direktori Hotel, 3 subtes `brochure-export-consistency`.
- **Commit langsung di `main`.** Cek `git branch --show-current` sebelum tiap commit; `git add` per berkas, jangan `-A`.

---

## File Structure

**Dibuat:**
- `src/lib/packageDetail.ts` — empat helper murni yang sekarang terkurung di `PackageCard.tsx`.
- `src/lib/wideLayout.ts` — konstanta media query + `subscribeWide`, murni & bisa diuji di node.
- `src/hooks/useWideLayout.ts` — pembungkus `useSyncExternalStore` setebal ±12 baris.
- `src/hooks/useItineraryContent.ts` — pengambilan + cache + degradasi itinerary.
- `src/components/jadwal-rails/ItineraryRail.tsx` — rail kiri.
- `src/components/jadwal-rails/DetailRail.tsx` — rail kanan (tab + kaki aksi).
- `src/components/jadwal-rails/RailShell.tsx` — pembungkus geometri + kepala rail bersama.
- `tests/jadwal-layout-token.test.js`, `tests/wide-layout.test.js`, `tests/package-detail.test.js`, `tests/itinerary-degradasi.test.js`, `tests/package-card-selected.test.js`.

**Diubah:** `src/index.css`, `src/App.tsx`, `src/components/PackageCard.tsx`, `src/components/FilterHeader.tsx`, `src/components/FloatingAgentBar.tsx`, `server.js` (registrasi event), `tests/fixtures/export-wrap-probe.js`.

---

### Task 1: Token lebar kolom & rail

**Files:**
- Modify: `src/index.css` (dekat `:root` baris 6–30)
- Modify: `src/App.tsx:878`, `src/App.tsx:1127`
- Modify: `src/components/FilterHeader.tsx:413`
- Modify: `src/components/FloatingAgentBar.tsx:103`
- Test: `tests/jadwal-layout-token.test.js`

**Interfaces:**
- Consumes: —
- Produces: kelas CSS `.jadwal-shell`, `.jadwal-rail`, `.jadwal-rail--left`, `.jadwal-rail--right`, `.jadwal-backdrop`; variabel `--jadwal-col-w`, `--jadwal-rail-w`, `--jadwal-rail-gap`.

- [ ] **Step 1: Tulis tes yang gagal**

`tests/jadwal-layout-token.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

/** Ambil isi blok `:root { ... }` yang berada di dalam @media dengan lebar tertentu. */
function rootBlockAtWidth(minWidth) {
  const re = new RegExp(`@media\\s*\\(min-width:\\s*${minWidth}px\\)\\s*\\{\\s*:root\\s*\\{([^}]*)\\}`, 'm');
  const m = css.match(re);
  assert.ok(m, `tidak ada blok :root di @media (min-width: ${minWidth}px)`);
  return m[1];
}

function baseRootBlock() {
  const m = css.match(/^:root\s*\{([\s\S]*?)\}/m);
  assert.ok(m, 'tidak ada blok :root dasar');
  return m[1];
}

test('lebar kolom & rail dasar = 512px / 0', () => {
  const b = baseRootBlock();
  assert.match(b, /--jadwal-col-w:\s*512px/);
  assert.match(b, /--jadwal-rail-w:\s*0px/);
});

test('1024px: kolom menyempit ke 420, rail 270', () => {
  const b = rootBlockAtWidth(1024);
  assert.match(b, /--jadwal-col-w:\s*420px/);
  assert.match(b, /--jadwal-rail-w:\s*270px/);
});

test('1280px: kolom kembali 512, rail 320', () => {
  const b = rootBlockAtWidth(1280);
  assert.match(b, /--jadwal-col-w:\s*512px/);
  assert.match(b, /--jadwal-rail-w:\s*320px/);
});

test('1440px: rail 368', () => {
  assert.match(rootBlockAtWidth(1440), /--jadwal-rail-w:\s*368px/);
});

test('.jadwal-shell memakai token, bukan angka mati', () => {
  const m = css.match(/\.jadwal-shell\s*\{([^}]*)\}/);
  assert.ok(m, 'tidak ada aturan .jadwal-shell');
  assert.match(m[1], /max-width:\s*var\(--jadwal-col-w\)/);
  assert.doesNotMatch(m[1], /max-width:\s*\d/, 'lebar dipaku angka — token jadi tak berguna');
});

test('rail duduk di selokan, dihitung dari lebar kolom', () => {
  const left = css.match(/\.jadwal-rail--left\s*\{([^}]*)\}/);
  const right = css.match(/\.jadwal-rail--right\s*\{([^}]*)\}/);
  assert.ok(left && right, 'aturan .jadwal-rail--left/--right tidak lengkap');
  assert.match(left[1], /right:\s*calc\(50%\s*\+\s*var\(--jadwal-col-w\)\s*\/\s*2\s*\+\s*var\(--jadwal-rail-gap\)\)/);
  assert.match(right[1], /left:\s*calc\(50%\s*\+\s*var\(--jadwal-col-w\)\s*\/\s*2\s*\+\s*var\(--jadwal-rail-gap\)\)/);
});

test('rail tersembunyi di bawah 1024px', () => {
  const m = css.match(/\.jadwal-rail\s*\{([^}]*)\}/);
  assert.ok(m, 'tidak ada aturan .jadwal-rail dasar');
  assert.match(m[1], /display:\s*none/);
});
```

- [ ] **Step 2: Jalankan, pastikan merah**

Run: `node --test tests/jadwal-layout-token.test.js`
Expected: FAIL — "tidak ada blok :root di @media (min-width: 1024px)".

- [ ] **Step 3: Tambahkan token & kelas di `src/index.css`**

Sisipkan setelah blok `@media (min-width: 640px)` yang sudah ada (sekitar baris 30):

```css
/* ──────────────────────────────────────────────────────────────
   Tata letak jadwal desktop — satu sumber lebar.
   Empat pembungkus (main, modal ringkas, header inner, bar agent)
   dulu menulis `max-w-lg` sendiri-sendiri; begitu kolom menyempit
   di 1024px, header langsung meleset dari kartu. Sekarang keempatnya
   memakai .jadwal-shell.
   ────────────────────────────────────────────────────────────── */
:root {
  --jadwal-col-w: 512px;
  --jadwal-rail-w: 0px;
  --jadwal-rail-gap: 24px;
}

/* iPad landscape: kolom sengaja MENYEMPIT saat layar melebar, supaya
   dua rail muat. Ini keputusan user, bukan kekeliruan. */
@media (min-width: 1024px) {
  :root { --jadwal-col-w: 420px; --jadwal-rail-w: 270px; }
}
@media (min-width: 1280px) {
  :root { --jadwal-col-w: 512px; --jadwal-rail-w: 320px; }
}
@media (min-width: 1440px) {
  :root { --jadwal-rail-w: 368px; }
}

.jadwal-shell {
  width: 100%;
  max-width: var(--jadwal-col-w);
  margin-left: auto;
  margin-right: auto;
}

/* Rail = fixed, BUKAN sticky: harus diam saat daftar digulir.
   overscroll-behavior menahan gulir rail supaya tidak menular ke daftar. */
.jadwal-rail {
  display: none;
  position: fixed;
  top: var(--filter-header-h);
  bottom: 24px;
  width: var(--jadwal-rail-w);
  overflow-y: auto;
  overscroll-behavior: contain;
  z-index: 30;
}
@media (min-width: 1024px) {
  .jadwal-rail { display: block; }
}
.jadwal-rail--left  { right: calc(50% + var(--jadwal-col-w) / 2 + var(--jadwal-rail-gap)); }
.jadwal-rail--right { left:  calc(50% + var(--jadwal-col-w) / 2 + var(--jadwal-rail-gap)); }

.jadwal-rail::-webkit-scrollbar { width: 6px; }
.jadwal-rail::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.13); border-radius: 3px; }
```

- [ ] **Step 4: Ganti empat `max-w-lg` jadi `.jadwal-shell`**

`src/App.tsx:968` — `className="max-w-lg mx-auto px-4 pb-8"` → `className="jadwal-shell px-4 pb-8"`
`src/components/FilterHeader.tsx:413` — `max-w-lg mx-auto` → `jadwal-shell` (sisa kelasnya dipertahankan persis)
`src/components/FloatingAgentBar.tsx:103` — `max-w-lg mx-auto` → `jadwal-shell`

**JANGAN disentuh:** `App.tsx:860`/`:878` (halaman Detail Paket) dan `App.tsx:1127` (modal
Tampilan Ringkas). Ketiganya tidak punya rail; menyempitkannya di 1024px hanya regresi.

- [ ] **Step 5: Jalankan tes, pastikan hijau**

Run: `node --test tests/jadwal-layout-token.test.js`
Expected: PASS (7 tes).

- [ ] **Step 6: Pastikan tes kartu yang ada tidak ikut merah**

Run: `node --test tests/package-card-animation.test.js tests/package-card-journey-header.test.js tests/package-card-brosur-preview.test.js`
Expected: PASS — Task 1 tidak menyentuh `PackageCard.tsx`.

- [ ] **Step 7: Commit**

```bash
git add src/index.css src/App.tsx src/components/FilterHeader.tsx src/components/FloatingAgentBar.tsx tests/jadwal-layout-token.test.js
git commit -m "feat(jadwal): lebar kolom & rail jadi satu token CSS"
```

---

### Task 2: Deteksi layar lebar

**Files:**
- Create: `src/lib/wideLayout.ts`, `src/hooks/useWideLayout.ts`
- Test: `tests/wide-layout.test.js`

**Interfaces:**
- Consumes: —
- Produces: `WIDE_MEDIA_QUERY: string`, `subscribeWide(mql, onChange): () => void`, `useWideLayout(): boolean`.

- [ ] **Step 1: Tulis tes yang gagal**

`tests/wide-layout.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { WIDE_MEDIA_QUERY, subscribeWide } from '../src/lib/wideLayout.ts';

/** MediaQueryList palsu — cukup untuk menguji langganan tanpa DOM. */
function fakeMql(matches = false) {
  const listeners = new Set();
  return {
    matches,
    addEventListener: (_t, fn) => listeners.add(fn),
    removeEventListener: (_t, fn) => listeners.delete(fn),
    emit(next) { this.matches = next; listeners.forEach(fn => fn({ matches: next })); },
    get listenerCount() { return listeners.size; },
  };
}

test('ambang lebar tepat 1024px — 1024 ikut dihitung lebar', () => {
  assert.equal(WIDE_MEDIA_QUERY, '(min-width: 1024px)');
});

test('perubahan media query meneruskan nilai baru', () => {
  const mql = fakeMql(false);
  const seen = [];
  subscribeWide(mql, () => seen.push(mql.matches));
  mql.emit(true);
  mql.emit(false);
  assert.deepEqual(seen, [true, false]);
});

test('berhenti berlangganan melepas listener', () => {
  const mql = fakeMql(false);
  const stop = subscribeWide(mql, () => {});
  assert.equal(mql.listenerCount, 1);
  stop();
  assert.equal(mql.listenerCount, 0);
});
```

- [ ] **Step 2: Jalankan, pastikan merah**

Run: `node --test tests/wide-layout.test.js`
Expected: FAIL — modul `src/lib/wideLayout.ts` tidak ada.

**Node tidak bisa mengimpor `.ts` langsung.** Karena itu tesnya TIDAK memakai `import` biasa;
pakai helper `loadTs()` di Step 2a yang mem-bundle lewat esbuild — pola yang sama dengan
`tests/fixtures/package-card-render.js`. Helper ini dipakai ulang di Task 3 dan Task 7.

- [ ] **Step 2a: Ganti baris impor dengan helper pemuat TS**

Pada `tests/wide-layout.test.js`, ganti baris `import { WIDE_MEDIA_QUERY, subscribeWide } ...` dengan:

```js
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

async function loadTs(rel) {
  const dir = mkdtempSync(join(tmpdir(), 'alhijaz-ts-'));
  const out = join(dir, 'mod.mjs');
  await build({ entryPoints: [join(ROOT, rel)], outfile: out, format: 'esm', platform: 'node', bundle: true });
  try { return await import(out); } finally { rmSync(dir, { recursive: true, force: true }); }
}

const { WIDE_MEDIA_QUERY, subscribeWide } = await loadTs('src/lib/wideLayout.ts');
```

- [ ] **Step 3: Tulis `src/lib/wideLayout.ts`**

```ts
/**
 * Ambang layar lebar untuk halaman jadwal.
 *
 * 1024px dipilih karena di situ kolom tengah menyempit ke 420px sehingga dua
 * rail muat (lihat --jadwal-col-w di src/index.css). Nilainya HARUS sama dengan
 * breakpoint pertama di CSS itu; kalau berbeda, rail tampil tapi tak pernah diisi.
 */
export const WIDE_MEDIA_QUERY = '(min-width: 1024px)';

type Mql = Pick<MediaQueryList, 'addEventListener' | 'removeEventListener'>;

/** Berlangganan perubahan media query. Mengembalikan fungsi pembatalan. */
export function subscribeWide(mql: Mql, onChange: () => void): () => void {
  const handler = () => onChange();
  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler);
}
```

- [ ] **Step 4: Tulis `src/hooks/useWideLayout.ts`**

```ts
import { useSyncExternalStore } from 'react';
import { WIDE_MEDIA_QUERY, subscribeWide } from '@/lib/wideLayout';

let cachedMql: MediaQueryList | null = null;
function mql(): MediaQueryList | null {
  if (typeof window === 'undefined' || !window.matchMedia) return null;
  if (!cachedMql) cachedMql = window.matchMedia(WIDE_MEDIA_QUERY);
  return cachedMql;
}

/**
 * true saat viewport ≥1024px. Aman di SSR (harness tes merender di node):
 * getServerSnapshot mengembalikan false, jadi HTML server = perilaku HP.
 */
export function useWideLayout(): boolean {
  return useSyncExternalStore(
    (onChange) => { const m = mql(); return m ? subscribeWide(m, onChange) : () => {}; },
    () => mql()?.matches ?? false,
    () => false,
  );
}
```

- [ ] **Step 5: Jalankan tes, pastikan hijau**

Run: `node --test tests/wide-layout.test.js`
Expected: PASS (3 tes).

- [ ] **Step 6: Commit**

```bash
git add src/lib/wideLayout.ts src/hooks/useWideLayout.ts tests/wide-layout.test.js
git commit -m "feat(jadwal): hook deteksi layar lebar (>=1024px)"
```

---

### Task 3: Ekstraksi helper paket

**Files:**
- Create: `src/lib/packageDetail.ts`
- Modify: `src/components/PackageCard.tsx:38-47` (hapus dua helper modul), `:264` (tiers), `:367-419` (extraHotels)
- Test: `tests/package-detail.test.js`

**Interfaces:**
- Consumes: `loadTs()` dari pola Task 2.
- Produces:
  - `tiersOf(harga: PackagePricing): string[]`
  - `extraHotelsOf(hotelInfo: unknown, allHotels: Record<string, unknown>): Array<{ city: string; name: string; star: string }>`
  - `hotelStarsOf(name?: string, stars?: string): string`
  - `hotelDistanceOf(name?: string, distance?: string): string`

- [ ] **Step 1: Tulis tes yang gagal**

`tests/package-detail.test.js` — pakai `loadTs()` seperti Task 2, lalu:

```js
test('tier "Hemat" selalu di depan, sisanya urut asli', async () => {
  assert.deepEqual(tiersOf({ UHUD: {}, HEMAT: {}, RAHMAH: {} }), ['HEMAT', 'UHUD', 'RAHMAH']);
  assert.deepEqual(tiersOf({ RAHMAH: {}, hemat: {} }), ['hemat', 'RAHMAH']);
});

test('hotel kota plus diambil dari tier aktif', async () => {
  const tierAktif = { cairo_hotel: 'STEIGENBERGER', cairo_bintang: '5' };
  const semua = { UHUD: tierAktif };
  assert.deepEqual(extraHotelsOf(tierAktif, semua), [{ city: 'Cairo', name: 'STEIGENBERGER', star: '5' }]);
});

test('kota plus kosong di tier aktif diambil dari tier lain — kota transit bukan per-tier', async () => {
  const tierAktif = {};
  const semua = { HEMAT: tierAktif, UHUD: { dubai_hotel: 'ROVE', dubai_bintang: '4' } };
  assert.deepEqual(extraHotelsOf(tierAktif, semua), [{ city: 'Dubai', name: 'ROVE', star: '4' }]);
});

test('tier aktif menang atas tier lain', async () => {
  const tierAktif = { dubai_hotel: 'HILTON', dubai_bintang: '5' };
  const semua = { HEMAT: tierAktif, UHUD: { dubai_hotel: 'ROVE', dubai_bintang: '4' } };
  assert.equal(extraHotelsOf(tierAktif, semua)[0].name, 'HILTON');
});

test('bintang dari payload menang; "0" dianggap kosong lalu jatuh ke metadata', async () => {
  assert.equal(hotelStarsOf('ANJUM', '4'), '4');
  assert.equal(hotelStarsOf('ANJUM', '0'), '5');
  assert.equal(hotelStarsOf('ANJUM', ''), '5');
});

test('jarak dari payload menang; kosong jatuh ke metadata', async () => {
  assert.equal(hotelDistanceOf('ANJUM', '±99m'), '±99m');
  assert.equal(hotelDistanceOf('ANJUM', ''), '±450m');
});

test('hotelInfo kosong = tidak ada kota plus (bukan lempar galat)', async () => {
  assert.deepEqual(extraHotelsOf(null, {}), []);
});
```

- [ ] **Step 2: Jalankan, pastikan merah**

Run: `node --test tests/package-detail.test.js`
Expected: FAIL — `src/lib/packageDetail.ts` tidak ada.

- [ ] **Step 3: Buat `src/lib/packageDetail.ts`**

Salin apa adanya dari `PackageCard.tsx` — daftar `potentialCities`, urutan, dan komentar fallback antar-tier dipertahankan. `hotelStarsOf`/`hotelDistanceOf` memakai `lookupHotelMetadata` dan `getDistance` yang sudah ada.

- [ ] **Step 4: Sambungkan `PackageCard.tsx`**

Hapus `hotelStars`/`hotelDistance` di baris 38–47, ganti impor dari `@/lib/packageDetail`, dan ganti isi `useMemo` `tiers` (`:264`) dan `extraHotels` (`:367`) jadi pemanggilan helper. Nama variabel lokal tidak berubah, jadi tak ada tempat lain yang perlu disentuh.

- [ ] **Step 5: Jalankan tes baru + tes kartu lama**

Run: `node --test tests/package-detail.test.js tests/package-card-animation.test.js tests/package-card-journey-header.test.js tests/package-card-brosur-preview.test.js`
Expected: PASS semua — pemindahan ini tanpa perubahan perilaku.

- [ ] **Step 6: Commit**

```bash
git add src/lib/packageDetail.ts src/components/PackageCard.tsx tests/package-detail.test.js
git commit -m "refactor(jadwal): helper tier & hotel plus keluar dari PackageCard"
```

---

### Task 4: Keadaan terpilih tanpa memuai

**Files:**
- Modify: `src/components/PackageCard.tsx` (props `:49-66`, root class `:1679-1686`, comparator `:2707-2715`)
- Modify: `src/App.tsx` (`handleToggleCard:777`, render kartu `:1018-1025`, Escape)
- Test: `tests/package-card-selected.test.js`

**Interfaces:**
- Consumes: `useWideLayout()` (Task 2).
- Produces: prop `isSelected?: boolean` pada `PackageCard`.

- [ ] **Step 1: Tulis tes yang gagal**

`tests/package-card-selected.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPackageCard, samplePackage } from './fixtures/package-card-render.js';

test('kartu terpilih memakai bingkai aktif yang sama dengan kartu terbuka', async () => {
  const { html } = await renderPackageCard({ package: samplePackage(), isSelected: true });
  assert.match(html, /border-emerald-100/);
});

test('terpilih TIDAK membuka wilayah muai — panel tetap aria-hidden', async () => {
  const { html } = await renderPackageCard({ package: samplePackage(), isSelected: true });
  const panel = html.slice(html.indexOf('data-expand-panel'));
  assert.match(panel.slice(0, 400), /aria-hidden="true"/);
});

test('tanpa terpilih dan tanpa terbuka, bingkai netral', async () => {
  const { html } = await renderPackageCard({ package: samplePackage() });
  assert.match(html, /border-gray-100/);
  assert.doesNotMatch(html, /border-emerald-100/);
});
```

- [ ] **Step 2: Jalankan, pastikan merah**

Run: `node --test tests/package-card-selected.test.js`
Expected: FAIL — `border-emerald-100` tidak muncul; prop `isSelected` belum ada.

- [ ] **Step 3: Tambah prop & pakai di root**

Di `PackageCardProps` tambahkan:

```ts
  /** Layar lebar: kartu ditandai aktif tanpa memuai — detailnya tampil di rail. */
  isSelected?: boolean;
```

Tanda tangan komponen menerima `isSelected = false`. Di root class (`:1683`) ganti `${isExpanded` jadi `${(isExpanded || isSelected)`.

Alasan memakai bingkai emerald yang sudah ada, bukan oranye seperti mockup: "kartu ini sedang aktif" sudah punya bahasa visualnya sendiri di aplikasi ini. Menambah warna kedua untuk konsep yang sama justru merusak konsistensi.

- [ ] **Step 4: Tambahkan `isSelected` ke comparator**

Di `arePackageCardPropsEqual` (`:2707`) sisipkan `prev.isSelected === next.isSelected &&`.

**Ini gerbangnya.** Tanpa baris ini kartu tidak render ulang saat dipilih dan bingkainya tidak pernah muncul — gagal senyap, tanpa galat.

- [ ] **Step 5: Cabangkan `handleToggleCard` untuk layar lebar**

Di `src/App.tsx`, tambahkan `const isWide = useWideLayout();` dan di awal `handleToggleCard`:

```ts
    // Layar lebar: kartu tidak pernah memuai, jadi seluruh kompensasi gulir di
    // bawah ini tidak berlaku — memanggilnya justru menjangkar kartu yang tinggi-
    // nya tak berubah dan menggeser daftar tanpa sebab.
    if (isWide) { setInstantCollapseId(null); setExpandedCardId(prev => prev === id ? null : id); return; }
```

Lalu di render kartu (`:1020`): `isExpanded={!isWide && expandedCardId === pkg.jadwalId}` dan tambahkan `isSelected={isWide && expandedCardId === pkg.jadwalId}`.

- [ ] **Step 6: Escape membatalkan pilihan**

```ts
  useEffect(() => {
    if (!isWide || !expandedCardId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpandedCardId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isWide, expandedCardId]);
```

- [ ] **Step 7: Jalankan tes**

Run: `node --test tests/package-card-selected.test.js tests/package-card-animation.test.js tests/package-card-brosur-preview.test.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/PackageCard.tsx src/App.tsx tests/package-card-selected.test.js
git commit -m "feat(jadwal): layar lebar menandai kartu terpilih, bukan memuai"
```

---

### Task 5: Latar berbranding

**Files:**
- Modify: `src/index.css`, `src/App.tsx` (satu div sebelum header)

**Interfaces:**
- Consumes: breakpoint dari Task 1.
- Produces: kelas `.jadwal-backdrop`.

- [ ] **Step 1: Tambahkan kelas di `src/index.css`**

```css
/* Latar berbranding — hanya ≥1024px, di bawah itu latar halaman tak berubah.
   z-index -1 + pointer-events none: murni dekor, tak pernah menangkap klik. */
.jadwal-backdrop { display: none; }
@media (min-width: 1024px) {
  .jadwal-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    background:
      radial-gradient(1200px 600px at 82% -8%, rgba(192, 57, 43, 0.07), transparent 60%),
      linear-gradient(165deg, #F8F5F2 0%, #EFE7E0 100%);
  }
  .dark .jadwal-backdrop {
    background:
      radial-gradient(1200px 600px at 82% -8%, rgba(192, 38, 28, 0.10), transparent 60%),
      linear-gradient(165deg, #0B1120 0%, #131C2E 100%);
  }
}
```

Gradasi murni CSS, tanpa aset — nol permintaan jaringan, nol risiko gambar gagal muat, dan tetap terbaca "berbranding" lewat rona merah Alhijaz. Foto arsitektur bisa ditambahkan belakangan tanpa mengubah struktur.

- [ ] **Step 2: Render di `src/App.tsx`**

Sisipkan `<div className="jadwal-backdrop" aria-hidden="true" />` sebagai anak pertama pembungkus halaman publik (tepat sebelum `<FilterHeader ...>`).

- [ ] **Step 3: Verifikasi build**

Run: `npx vite build 2>&1 | tail -5`
Expected: build sukses.

- [ ] **Step 4: Commit**

```bash
git add src/index.css src/App.tsx
git commit -m "feat(jadwal): latar berbranding di layar >=1024px"
```

---

### Task 6: Kerangka rail + kepala bersama

**Files:**
- Create: `src/components/jadwal-rails/RailShell.tsx`
- Modify: `src/App.tsx`, `server.js` (registrasi `jadwal_rail_open`)

**Interfaces:**
- Consumes: `useWideLayout()`, kelas `.jadwal-rail*`.
- Produces: `<RailShell side="left"|"right" title={string} onClose={() => void} children />`.

- [ ] **Step 1: Tulis `RailShell.tsx`**

Frame `<aside className={"jadwal-rail jadwal-rail--" + side}>` berisi kepala (eyebrow `PAKET YANG DIBAHAS`, judul paket, tombol X memanggil `onClose`) lalu `children`. Varian gelap wajib pada kepala dan tombol.

- [ ] **Step 2: Render kedua rail di `App.tsx`**

Setelah `</main>`, hanya bila `isWide && selectedPkg`:

```tsx
{isWide && selectedPkg && (
  <>
    <RailShell side="left" title={selectedPkg.nama} onClose={() => setExpandedCardId(null)}>
      <ItineraryRail pkg={selectedPkg} />
    </RailShell>
    <RailShell side="right" title={selectedPkg.nama} onClose={() => setExpandedCardId(null)}>
      <DetailRail pkg={selectedPkg} agent={currentAgent} />
    </RailShell>
  </>
)}
```

dengan `const selectedPkg = filteredPackages.find(p => p.jadwalId === expandedCardId) ?? null;`

- [ ] **Step 3: Daftarkan event `jadwal_rail_open` di `server.js`**

Tambahkan ke `FEATURE_LABELS`, `ACTION_LABELS`, dan `VALID_PUBLIC_EVENTS`. Tanpa ini `trackPublicEvent` dibalas 400 dan event hilang tanpa jejak.

- [ ] **Step 4: Panggil `trackPublicEvent('jadwal_rail_open', ...)`** saat `selectedPkg` berubah dari null ke terisi. Halaman ini publik — `trackEvent` (agent-auth) akan gagal.

- [ ] **Step 5: Build & commit**

```bash
npx vite build 2>&1 | tail -3
git add src/components/jadwal-rails/RailShell.tsx src/App.tsx server.js
git commit -m "feat(jadwal): kerangka rail kiri & kanan di layar lebar"
```

---

### Task 7: Rail kiri — Itinerary + degradasi

**Files:**
- Create: `src/hooks/useItineraryContent.ts`, `src/components/jadwal-rails/ItineraryRail.tsx`
- Test: `tests/itinerary-degradasi.test.js`

**Interfaces:**
- Consumes: `GET /api/itinerary/:jadwalId` → `{ success, data: { days: ItineraryDayData[] } }`; `pkg.journeyOrder`; `getPackageJourneySteps` dari `@/utils/journey`.
- Produces: `useItineraryContent(jadwalId): { state: 'loading'|'ready'|'unavailable', days: ItineraryDayData[] }`, `nightsByCity(days): Array<{ city: string; nights: number }>`.

- [ ] **Step 1: Tulis tes degradasi yang gagal**

```js
test('404 memberi keadaan unavailable, bukan lempar galat', ...)
test('503 juga unavailable — sinkronisasi belum siap bukan kegagalan fatal', ...)
test('malam per kota dihitung dari location hari berurutan', ...)
test('hari perpindahan terakhir tidak dihitung sebagai malam', ...)
```

- [ ] **Step 2: Jalankan, pastikan merah.** Run: `node --test tests/itinerary-degradasi.test.js`

- [ ] **Step 3: Tulis hook** — `AbortController` per `jadwalId`, cache `Map<string, Result>` di level modul, 404/503/gagal jaringan → `'unavailable'`.

- [ ] **Step 4: Tulis `ItineraryRail.tsx`** — tiga cabang: skeleton, daftar hari (chip nomor `bg-gradient-burgundy`, judul, ringkasan aktivitas, accordion saat diklik), dan jalur degradasi (strip kota dari `getPackageJourneySteps` + tautan PDF bila `pkg.itineraryUrl` tidak kosong). **Tidak pernah kosong-melompong.**

- [ ] **Step 5: Tes hijau + build. Commit.**

```bash
git add src/hooks/useItineraryContent.ts src/components/jadwal-rails/ItineraryRail.tsx tests/itinerary-degradasi.test.js
git commit -m "feat(jadwal): rail kiri itinerary dengan jalur degradasi"
```

---

### Task 8: Rail kanan — tab Hotel/Biaya/Brosur + kaki aksi

**Files:**
- Create: `src/components/jadwal-rails/DetailRail.tsx`
- Modify: `server.js` (registrasi `jadwal_rail_tab`)

**Interfaces:**
- Consumes: `tiersOf`, `extraHotelsOf`, `hotelStarsOf`, `hotelDistanceOf` (Task 3); `minPriceInTier`, `cheapestTierOf`; `getTemperature`.
- Produces: `<DetailRail pkg agent />`.

- [ ] **Step 1: Tab strip** — `Hotel · Biaya · Brosur`, state lokal, tab aktif putih (gelap: slate).
- [ ] **Step 2: Tab Hotel** — kartu per kota (Mekkah, Madinah, lalu `extraHotelsOf`): chip kota, bintang, nama besar, jarak **ditulis penuh** ("±300 m ke pelataran Masjidil Haram"). Fase 1 tanpa foto.
- [ ] **Step 3: Tab Biaya** — pemilih tier bila `tiersOf(pkg.harga).length > 1`, tabel Quad/Triple/Double/Single/Infant, blok suhu di bawah.
- [ ] **Step 4: Tab Brosur** — pratinjau `pkg.brosurUrl` rasio 3:4.
- [ ] **Step 5: Kaki aksi menetap** — Kirim WhatsApp, Brosur, Tanya AI, baris agent.
- [ ] **Step 6: Daftarkan `jadwal_rail_tab` di `server.js`** (tiga tempat) lalu panggil `trackPublicEvent` saat tab berganti.
- [ ] **Step 7: Build, commit.**

---

### Task 9: Screenshot dari rail

**Files:**
- Modify: `src/components/PackageCard.tsx` (ekspos pemicu), `src/components/jadwal-rails/DetailRail.tsx`
- Modify: `tests/fixtures/export-wrap-probe.js`

- [ ] **Step 1:** Tambah tes probe: klon dari kartu berlebar 420px harus dinormalkan ke 512px sebelum bedah CSS berjalan.
- [ ] **Step 2:** Jalankan, pastikan merah.
- [ ] **Step 3:** Di `handleScreenshot`, setelah `cloneNode(true)`, paksa `clone.style.width = '512px'` sebelum klon dimasukkan ke dokumen. Klon `modern-screenshot` mewarisi lebar piksel sumber; tanpa ini baris teks pecah di 1024–1279.
- [ ] **Step 4:** Tombol Screenshot di rail memaksa kartu ke keadaan muai tanpa animasi, menunggu `document.fonts.ready` + dua rAF, mengkloning, lalu mengembalikan keadaan.
- [ ] **Step 5:** Tes hijau. Commit.

---

### Task 10 (Fase 2, terpisah): Foto hotel lewat endpoint publik

Hanya dikerjakan setelah Task 1–9 hijau dan Fase 1 sudah bisa dirilis sendiri.

- [ ] **Step 1:** Tambah `GET /api/public/hotels?names=` di `server.js` dengan `dbLoadShedGuard`, tanpa `authMiddleware`, hanya kolom `name, city, stars, distance_label, walk_label, area, description, media`.
- [ ] **Step 2:** Cocokkan nama lewat `normalizeHotelName` yang sudah ada.
- [ ] **Step 3:** Tampilkan foto di tab Hotel; hotel yang tidak ada di direktori tetap tampil tanpa foto (tanpa placeholder palsu).
- [ ] **Step 4:** Tes + commit.

---

## Checklist manual (dijalankan user)

- [ ] 1024, 1280, 1440 — kolom, header, dan bar agent sejajar di ketiganya
- [ ] iPad landscape asli
- [ ] Mode gelap di ketiga lebar
- [ ] Laptop 1280×720 — rail menggulir sendiri, daftar tidak ikut tergulir
- [ ] Di bawah 1024 perilaku persis seperti sebelum perubahan
- [ ] Paket tanpa itinerary — rail kiri jatuh ke strip kota, tidak kosong
- [ ] Screenshot & Simpan dari rail di 1024 dan 1440 — teks tidak pecah
