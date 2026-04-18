# Filter "UMROH CUTI 5 HARI" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambahkan filter "UMROH CUTI 5 HARI" ke dropdown jadwal — menampilkan paket yang berangkat Jumat malam/Sabtu dan pulang Sabtu/Minggu/Senin dini hari, sehingga jamaah cukup ambil cuti 5 hari kerja.

**Architecture:** Tambah satu `FilterMode` baru dengan helper function `matchesCuti5Hari(pkg)` di [src/utils/filter-logic.ts](src/utils/filter-logic.ts). Tambah opsi dropdown di [src/components/FilterHeader.tsx](src/components/FilterHeader.tsx) dengan dropdown sort (urutkan) muncul. URL slug: `/cuti-5-hari`. Tidak ada test framework di repo — verifikasi lewat skrip standalone + manual browser check.

**Tech Stack:** TypeScript, React, Vite. Tidak ada framework testing — repo mengikuti pola verifikasi manual + skrip standalone (contoh: [explore.mjs](explore.mjs), [parse.mjs](parse.mjs)).

**Spec:** [docs/superpowers/specs/2026-04-18-filter-umroh-cuti-5-hari-design.md](docs/superpowers/specs/2026-04-18-filter-umroh-cuti-5-hari-design.md)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| [src/utils/filter-logic.ts](src/utils/filter-logic.ts) | Modify | Tambah `FilterMode` value, slug mapping, helper `matchesCuti5Hari`, dan case di `filterPackages` |
| [src/components/FilterHeader.tsx](src/components/FilterHeader.tsx) | Modify | Tambah opsi dropdown & update `showSortDropdown` |
| `scripts/verify-cuti-5-hari.mjs` | Create (temp) | Skrip standalone untuk verifikasi helper logic; dihapus setelah verifikasi |

---

## Task 1: Tambah FilterMode & slug mapping

**Files:**
- Modify: [src/utils/filter-logic.ts:13-22](src/utils/filter-logic.ts#L13-L22) (type `FilterMode`)
- Modify: [src/utils/filter-logic.ts:94-104](src/utils/filter-logic.ts#L94-L104) (`FILTER_MODE_SLUGS`)

- [ ] **Step 1: Tambah value baru ke union `FilterMode`**

Ubah [src/utils/filter-logic.ts:13-22](src/utils/filter-logic.ts#L13-L22) dari:

```ts
export type FilterMode = 
  | 'AVAILABLE'      // Filter paket dengan kursi tersedia
  | 'LIBURAN_SEKOLAH' // Filter keberangkatan Juni-Juli 2026
  | 'PROMO'          // Filter paket promo
  | 'UMROH REGULER'  // Hanya Mekkah & Madinah
  | 'UMROH MUSIM DINGIN' // Keberangkatan Desember-Januari
  | 'BINTANG 5'      // Semua hotel bintang 5
  | 'DURASI PERJALANAN' // Filter berdasarkan durasi
  | 'DATA PER-BULAN' // Filter berdasarkan bulan keberangkatan
  | 'SEMUA DATA';    // Tampilkan semua data
```

menjadi:

```ts
export type FilterMode = 
  | 'AVAILABLE'      // Filter paket dengan kursi tersedia
  | 'LIBURAN_SEKOLAH' // Filter keberangkatan Juni-Juli 2026
  | 'UMROH CUTI 5 HARI' // Berangkat Jumat malam/Sabtu, pulang Sabtu/Minggu/Senin dini hari
  | 'PROMO'          // Filter paket promo
  | 'UMROH REGULER'  // Hanya Mekkah & Madinah
  | 'UMROH MUSIM DINGIN' // Keberangkatan Desember-Januari
  | 'BINTANG 5'      // Semua hotel bintang 5
  | 'DURASI PERJALANAN' // Filter berdasarkan durasi
  | 'DATA PER-BULAN' // Filter berdasarkan bulan keberangkatan
  | 'SEMUA DATA';    // Tampilkan semua data
```

- [ ] **Step 2: Tambah slug mapping**

Ubah `FILTER_MODE_SLUGS` di [src/utils/filter-logic.ts:94-104](src/utils/filter-logic.ts#L94-L104) dari:

```ts
export const FILTER_MODE_SLUGS: Record<FilterMode, string> = {
  'AVAILABLE': '',
  'LIBURAN_SEKOLAH': 'liburan-sekolah',
  'PROMO': 'umroh-promo',
  'UMROH REGULER': 'umroh-reguler',
  'UMROH MUSIM DINGIN': 'umroh-musim-dingin',
  'BINTANG 5': 'bintang-5',
  'DURASI PERJALANAN': 'durasi-perjalanan',
  'DATA PER-BULAN': 'data-per-bulan',
  'SEMUA DATA': 'semua-data',
};
```

menjadi:

```ts
export const FILTER_MODE_SLUGS: Record<FilterMode, string> = {
  'AVAILABLE': '',
  'LIBURAN_SEKOLAH': 'liburan-sekolah',
  'UMROH CUTI 5 HARI': 'cuti-5-hari',
  'PROMO': 'umroh-promo',
  'UMROH REGULER': 'umroh-reguler',
  'UMROH MUSIM DINGIN': 'umroh-musim-dingin',
  'BINTANG 5': 'bintang-5',
  'DURASI PERJALANAN': 'durasi-perjalanan',
  'DATA PER-BULAN': 'data-per-bulan',
  'SEMUA DATA': 'semua-data',
};
```

- [ ] **Step 3: Verify TypeScript compiles (no case yet — expect error)**

Run: `npx tsc --noEmit`

Expected: mungkin error di switch `filterPackages` karena case baru belum ditangani. Lanjut ke Task 2 untuk tambah case-nya. (Catatan: karena TS switch tidak pakai `exhaustive` check, error mungkin tidak muncul. Yang penting tidak ada error baru di luar yang diharapkan.)

---

## Task 2: Tambah helper `matchesCuti5Hari` & case filter

**Files:**
- Modify: [src/utils/filter-logic.ts](src/utils/filter-logic.ts) (tambah helper + case)

- [ ] **Step 1: Tambah helper `parseLocalDate` dan `matchesCuti5Hari`**

Tambahkan di [src/utils/filter-logic.ts](src/utils/filter-logic.ts) di bagian "Helper Functions" (setelah fungsi `extractUniqueDurations`, sebelum `getMonthKey`). Cari baris yang ada komentar `/** Format date to month key (YYYY-MM) */` — insert block berikut **sebelum** komentar itu:

```ts
/**
 * Parse a YYYY-MM-DD string as a local date (not UTC).
 * Important: new Date('YYYY-MM-DD') is parsed as UTC midnight by JS,
 * which makes .getDay() shift by one day in negative timezones.
 */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Check if a package qualifies for "UMROH CUTI 5 HARI":
 * - Departure: Friday >= 18:00, OR any time Saturday
 * - Return (landing in Indonesia): Saturday any time, OR Sunday any time, OR Monday < 06:00
 * Day codes: 0=Sun, 1=Mon, 5=Fri, 6=Sat
 */
function matchesCuti5Hari(pkg: UmrohPackage): boolean {
  const depDay = parseLocalDate(pkg.keberangkatan.tgl).getDay();
  const depHour = parseInt(pkg.keberangkatan.jam.split('.')[0], 10);

  const retDay = parseLocalDate(pkg.kepulangan.tgl).getDay();
  const retHour = parseInt(pkg.kepulangan.jam.split('.')[0], 10);

  const depOk = (depDay === 5 && depHour >= 18) || depDay === 6;
  const retOk = retDay === 6 || retDay === 0 || (retDay === 1 && retHour < 6);

  return depOk && retOk;
}
```

- [ ] **Step 2: Tambah case di switch `filterPackages`**

Di [src/utils/filter-logic.ts](src/utils/filter-logic.ts) dalam fungsi `filterPackages`, sisipkan case baru **setelah** case `'LIBURAN_SEKOLAH'` (baris ~331) dan **sebelum** case `'PROMO'`:

```ts
    case 'UMROH CUTI 5 HARI':
      return data.filter(matchesCuti5Hari);
```

Jadi urutan switch jadi: `SEMUA DATA`, `AVAILABLE`, `LIBURAN_SEKOLAH`, `UMROH CUTI 5 HARI`, `PROMO`, ...

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: tidak ada error terkait filter-logic.ts. Error preexisting di file lain boleh ada (jangan tambah error baru).

---

## Task 3: Buat skrip verifikasi standalone

**Files:**
- Create: `scripts/verify-cuti-5-hari.mjs`

Karena repo belum punya test framework, kita buat skrip standalone kecil untuk verifikasi logic. File ini sementara dan akan dihapus setelah verifikasi sukses.

- [ ] **Step 1: Buat skrip verifikasi**

Buat [scripts/verify-cuti-5-hari.mjs](scripts/verify-cuti-5-hari.mjs):

```js
// Standalone verification for matchesCuti5Hari logic.
// Replicates the helper inline — if the logic is right here and
// the copy in filter-logic.ts is identical, we're good.

function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function matchesCuti5Hari(pkg) {
  const depDay = parseLocalDate(pkg.keberangkatan.tgl).getDay();
  const depHour = parseInt(pkg.keberangkatan.jam.split('.')[0], 10);
  const retDay = parseLocalDate(pkg.kepulangan.tgl).getDay();
  const retHour = parseInt(pkg.kepulangan.jam.split('.')[0], 10);
  const depOk = (depDay === 5 && depHour >= 18) || depDay === 6;
  const retOk = retDay === 6 || retDay === 0 || (retDay === 1 && retHour < 6);
  return depOk && retOk;
}

const mk = (depTgl, depJam, retTgl, retJam) => ({
  keberangkatan: { tgl: depTgl, jam: depJam },
  kepulangan: { tgl: retTgl, jam: retJam },
});

// 2026 calendar reference:
// 2026-06-05 Fri, 2026-06-06 Sat, 2026-06-07 Sun, 2026-06-08 Mon
// 2026-06-12 Fri, 2026-06-13 Sat, 2026-06-14 Sun, 2026-06-15 Mon

const cases = [
  // [label, pkg, expected]
  ['Fri 18:00 -> Sat', mk('2026-06-05', '18.00', '2026-06-13', '14.00'), true],
  ['Fri 19:30 -> Sun', mk('2026-06-05', '19.30', '2026-06-14', '10.00'), true],
  ['Fri 17:59 -> Sat', mk('2026-06-05', '17.59', '2026-06-13', '14.00'), false],
  ['Fri 08:00 -> Sat', mk('2026-06-05', '08.00', '2026-06-13', '10.00'), false],
  ['Sat any -> Sat', mk('2026-06-06', '03.00', '2026-06-13', '23.00'), true],
  ['Sat any -> Sun', mk('2026-06-06', '23.00', '2026-06-14', '06.00'), true],
  ['Sat -> Mon 05:59', mk('2026-06-06', '10.00', '2026-06-15', '05.59'), true],
  ['Sat -> Mon 06:00', mk('2026-06-06', '10.00', '2026-06-15', '06.00'), false],
  ['Sat -> Mon 12:00', mk('2026-06-06', '10.00', '2026-06-15', '12.00'), false],
  ['Thu -> Sun', mk('2026-06-04', '20.00', '2026-06-14', '10.00'), false],
  ['Sat -> Fri', mk('2026-06-06', '10.00', '2026-06-12', '10.00'), false],
];

let pass = 0, fail = 0;
for (const [label, pkg, expected] of cases) {
  const got = matchesCuti5Hari(pkg);
  const ok = got === expected;
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  expected=${expected} got=${got}`);
}
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run skrip verifikasi**

Run: `node scripts/verify-cuti-5-hari.mjs`

Expected: **semua 11 test PASS**, output baris terakhir `11/11 passed`, exit code 0. (Skrip ini standalone — mereplikasi logic, jadi jika logic di Task 2 sama persis dengan skrip ini, passing di sini = percaya pada implementasi.)

Kalau ada FAIL: baca baris FAIL, periksa apakah asumsi kalender 2026 di atas benar (cek dengan `node -e "console.log(new Date(2026, 5, 5).getDay())"` — harus output `5` untuk Jumat).

- [ ] **Step 3: Commit Task 1–3**

```bash
git add src/utils/filter-logic.ts scripts/verify-cuti-5-hari.mjs
git commit -m "$(cat <<'EOF'
Add CUTI 5 HARI filter logic and slug mapping

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Tambah opsi dropdown di FilterHeader

**Files:**
- Modify: [src/components/FilterHeader.tsx:60-70](src/components/FilterHeader.tsx#L60-L70) (`FILTER_MODE_OPTIONS`)
- Modify: [src/components/FilterHeader.tsx:154](src/components/FilterHeader.tsx#L154) (`showSortDropdown`)

- [ ] **Step 1: Tambah opsi ke `FILTER_MODE_OPTIONS`**

Ubah [src/components/FilterHeader.tsx:60-70](src/components/FilterHeader.tsx#L60-L70) dari:

```ts
const FILTER_MODE_OPTIONS: { value: FilterMode; label: string }[] = [
  { value: 'AVAILABLE', label: 'SEAT TERSEDIA' },
  { value: 'LIBURAN_SEKOLAH', label: 'LIBURAN SEKOLAH' },
  { value: 'PROMO', label: 'UMROH PROMO' },
  { value: 'UMROH REGULER', label: 'UMROH REGULER' },
  { value: 'UMROH MUSIM DINGIN', label: 'UMROH MUSIM DINGIN' },
  { value: 'BINTANG 5', label: 'BINTANG 5' },
  { value: 'DURASI PERJALANAN', label: 'DURASI PERJALANAN' },
  { value: 'DATA PER-BULAN', label: 'DATA PER-BULAN' },
  { value: 'SEMUA DATA', label: 'SEMUA DATA' },
];
```

menjadi:

```ts
const FILTER_MODE_OPTIONS: { value: FilterMode; label: string }[] = [
  { value: 'AVAILABLE', label: 'SEAT TERSEDIA' },
  { value: 'LIBURAN_SEKOLAH', label: 'LIBURAN SEKOLAH' },
  { value: 'UMROH CUTI 5 HARI', label: 'UMROH CUTI 5 HARI' },
  { value: 'PROMO', label: 'UMROH PROMO' },
  { value: 'UMROH REGULER', label: 'UMROH REGULER' },
  { value: 'UMROH MUSIM DINGIN', label: 'UMROH MUSIM DINGIN' },
  { value: 'BINTANG 5', label: 'BINTANG 5' },
  { value: 'DURASI PERJALANAN', label: 'DURASI PERJALANAN' },
  { value: 'DATA PER-BULAN', label: 'DATA PER-BULAN' },
  { value: 'SEMUA DATA', label: 'SEMUA DATA' },
];
```

- [ ] **Step 2: Update `showSortDropdown` untuk ikut tampilkan dropdown sort**

Ubah [src/components/FilterHeader.tsx:154](src/components/FilterHeader.tsx#L154) dari:

```ts
  const showSortDropdown = filterMode === 'AVAILABLE' || filterMode === 'LIBURAN_SEKOLAH' || filterMode === 'PROMO' || filterMode === 'UMROH REGULER' || filterMode === 'UMROH MUSIM DINGIN' || filterMode === 'BINTANG 5';
```

menjadi:

```ts
  const showSortDropdown = filterMode === 'AVAILABLE' || filterMode === 'LIBURAN_SEKOLAH' || filterMode === 'UMROH CUTI 5 HARI' || filterMode === 'PROMO' || filterMode === 'UMROH REGULER' || filterMode === 'UMROH MUSIM DINGIN' || filterMode === 'BINTANG 5';
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: tidak ada error baru.

---

## Task 5: Verifikasi manual via browser

**Files:** —

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

Expected: Vite dev server berjalan, URL seperti `http://localhost:5173/` muncul.

- [ ] **Step 2: Cek dropdown**

Buka browser ke URL dev server. Klik dropdown filter jadwal.

Expected:
- Opsi "UMROH CUTI 5 HARI" muncul di posisi ke-3 (setelah "LIBURAN SEKOLAH", sebelum "UMROH PROMO").

- [ ] **Step 3: Pilih filter & cek hasil**

Pilih "UMROH CUTI 5 HARI".

Expected:
- Dropdown kedua "- Urutkan -" muncul di sebelah kanan.
- URL berubah mengandung `cuti-5-hari` (misalnya `/cuti-5-hari` atau `/{agent}/cuti-5-hari`).
- Daftar paket yang muncul: keberangkatannya Sabtu (atau Jumat setelah jam 18:00), kepulangannya Sabtu/Minggu/Senin dini hari.

Buka satu paket untuk verifikasi manual:
- Lihat tanggal berangkat — harus Jumat (jam ≥ 18:00) atau Sabtu.
- Lihat tanggal pulang — harus Sabtu, Minggu, atau Senin (jika Senin jamnya < 06:00).

Jika ada paket yang tampak salah, catat `jadwalId`-nya dan tanggal/jamnya untuk debugging.

- [ ] **Step 4: Cek sort order**

Di dropdown "- Urutkan -", pilih "Tanggal Terdekat".

Expected: Paket terurut dari tanggal berangkat terdekat ke terjauh.

- [ ] **Step 5: Cek URL deep-link**

Buka tab baru, ketik URL `http://localhost:5173/cuti-5-hari` secara langsung.

Expected: Halaman load dengan filter "UMROH CUTI 5 HARI" sudah aktif.

- [ ] **Step 6: Stop dev server**

Tekan `Ctrl+C` di terminal yang menjalankan dev server.

---

## Task 6: Cleanup & commit final

**Files:**
- Delete: `scripts/verify-cuti-5-hari.mjs`
- Modify: (final state dari task 4)

- [ ] **Step 1: Hapus skrip verifikasi**

Run: `rm scripts/verify-cuti-5-hari.mjs`

- [ ] **Step 2: Commit perubahan FilterHeader + cleanup**

```bash
git add src/components/FilterHeader.tsx scripts/verify-cuti-5-hari.mjs
git commit -m "$(cat <<'EOF'
Wire UMROH CUTI 5 HARI option into FilterHeader

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Verify git log**

Run: `git log --oneline -3`

Expected: dua commit baru — "Wire UMROH CUTI 5 HARI option into FilterHeader" dan "Add CUTI 5 HARI filter logic and slug mapping".

---

## Done

Filter "UMROH CUTI 5 HARI" sudah live:
- Type `FilterMode` & slug mapping sudah di-extend.
- Helper `matchesCuti5Hari` + case di `filterPackages` sudah ada.
- Dropdown di FilterHeader menampilkan opsi baru dengan sort dropdown.
- URL deep-link `/cuti-5-hari` berfungsi.
- Logic sudah divalidasi lewat skrip standalone (11 test case) + manual browser check.
