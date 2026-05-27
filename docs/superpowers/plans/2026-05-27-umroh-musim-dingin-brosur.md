# Filter "UMROH MUSIM DINGIN" di Brosur Jadwal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambahkan opsi filter **"Umroh Musim Dingin"** ke dimensi **Tipe Paket** di halaman `/dashboard/ai-tools/brosur-jadwal` yang menampilkan paket dengan keberangkatan di **Desember atau Januari musim dingin terdekat**. Label brosur: **"MUSIM DINGIN"**.

**Architecture:** Pure frontend change di [src/components/BrochureSchedulePage.tsx](src/components/BrochureSchedulePage.tsx). Tambah konstanta tipe, helper `getMusimDinginWindow(today)` + `isMusimDinginPackage(pkg, window)`, perbarui `matchesPackageType` (3rd param window) + `brochureLabelForType` + `availableValues` + `filteredPackages` useMemo. Backend (`server.js`, `lib/brochure-schedule.js`) dan template (`BrochureScheduleTemplate.tsx`) tidak disentuh.

**Tech Stack:** TypeScript, React 18+, Vite. Tidak ada framework testing untuk filter UI — repo mengikuti pola verifikasi lewat skrip standalone (contoh: [explore.mjs](explore.mjs), [parse.mjs](parse.mjs)) + manual browser check.

**Spec:** [docs/superpowers/specs/2026-05-27-umroh-musim-dingin-brosur-design.md](docs/superpowers/specs/2026-05-27-umroh-musim-dingin-brosur-design.md)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| [src/components/BrochureSchedulePage.tsx](src/components/BrochureSchedulePage.tsx) | Modify | Tambah konstanta `TYPE_UMROH_MUSIM_DINGIN`, interface `MusimDinginWindow`, helper `getMusimDinginWindow` + `isMusimDinginPackage`, update `matchesPackageType` (3rd param) + `brochureLabelForType`, tambah `musimDinginWindow` useMemo, update `availableValues` + `filteredPackages` |
| `scripts/verify-musim-dingin.mjs` | Create (temp) | Skrip standalone untuk verifikasi date math (current vs next winter, year boundary). Dihapus setelah verifikasi |

---

## Task 1: Tambah konstanta, interface, dan pure helpers

**Files:**
- Modify: [src/components/BrochureSchedulePage.tsx:147-149](src/components/BrochureSchedulePage.tsx#L147-L149) (tambah konstanta + tipe + helpers)

- [ ] **Step 1: Baca file untuk konfirmasi konteks**

Buka [src/components/BrochureSchedulePage.tsx](src/components/BrochureSchedulePage.tsx) dan konfirmasi blok `TYPE_UMROH_SAJA`/`TYPE_UMROH_RAHMAH`/`TYPE_UMROH_PROMO` masih di sekitar baris 147-149.

- [ ] **Step 2: Tambah konstanta, interface, dan helper di module scope**

Sisipkan tepat **setelah** baris `const TYPE_UMROH_PROMO = 'UMROH PROMO';` (baris 149) — sebelum `function isRahmahPackage`:

```tsx
const TYPE_UMROH_MUSIM_DINGIN = 'UMROH MUSIM DINGIN';

interface MusimDinginWindow {
  yearOfDec: number;
}

// Pilih musim dingin terdekat relatif "today".
//   - Today di bulan Des  → window = Des(year)   + Jan(year+1)
//   - Today di bulan Jan  → window = Des(year-1) + Jan(year)        (current winter)
//   - Today Feb–Nov       → window = Des(year)   + Jan(year+1)      (next winter)
function getMusimDinginWindow(today: Date): MusimDinginWindow {
  const month = today.getUTCMonth(); // 0=Jan, 11=Des
  const year = today.getUTCFullYear();
  if (month === 11) return { yearOfDec: year };
  if (month === 0) return { yearOfDec: year - 1 };
  return { yearOfDec: year };
}

function isMusimDinginPackage(pkg: BrochurePackage, window: MusimDinginWindow): boolean {
  const iso = pkg.berangkat_tgl;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const dt = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(dt.getTime())) return false;
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth();
  return (y === window.yearOfDec && m === 11) || (y === window.yearOfDec + 1 && m === 0);
}
```

---

## Task 2: Skrip verifikasi date math

**Files:**
- Create: `scripts/verify-musim-dingin.mjs`

- [ ] **Step 1: Tulis skrip standalone**

Buat file baru `scripts/verify-musim-dingin.mjs`:

```mjs
// Standalone verifier untuk getMusimDinginWindow + isMusimDinginPackage.
// Duplikasi minor dari src/components/BrochureSchedulePage.tsx karena
// .tsx tidak runnable langsung dari Node tanpa bundler. Sinkronkan manual
// kalau logic berubah.

function getMusimDinginWindow(today) {
  const month = today.getUTCMonth();
  const year = today.getUTCFullYear();
  if (month === 11) return { yearOfDec: year };
  if (month === 0) return { yearOfDec: year - 1 };
  return { yearOfDec: year };
}

function isMusimDinginPackage(pkg, window) {
  const iso = pkg.berangkat_tgl;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const dt = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(dt.getTime())) return false;
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth();
  return (y === window.yearOfDec && m === 11) || (y === window.yearOfDec + 1 && m === 0);
}

const cases = [
  // [todayISO, expectedYearOfDec, label]
  ['2026-05-27', 2026, 'Mei → next winter (Des 2026 + Jan 2027)'],
  ['2026-11-30', 2026, 'November → next winter (Des 2026 + Jan 2027)'],
  ['2026-12-01', 2026, 'Awal Des → current winter (Des 2026 + Jan 2027)'],
  ['2026-12-31', 2026, 'Akhir Des → current winter (Des 2026 + Jan 2027)'],
  ['2027-01-01', 2026, 'Awal Jan → current winter (Des 2026 + Jan 2027)'],
  ['2027-01-31', 2026, 'Akhir Jan → current winter (Des 2026 + Jan 2027)'],
  ['2027-02-01', 2027, 'Feb → next winter (Des 2027 + Jan 2028)'],
];

let failures = 0;
for (const [todayISO, expected, label] of cases) {
  const today = new Date(`${todayISO}T00:00:00.000Z`);
  const win = getMusimDinginWindow(today);
  const ok = win.yearOfDec === expected;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${todayISO}  yearOfDec=${win.yearOfDec} (expected ${expected})  ${label}`);
  if (!ok) failures++;
}

const win = getMusimDinginWindow(new Date('2026-05-27T00:00:00.000Z'));
const pkgCases = [
  // [berangkat_tgl, expected]
  ['2026-12-15', true,  'Des 2026 → in window'],
  ['2027-01-10', true,  'Jan 2027 → in window'],
  ['2026-11-30', false, 'Nov 2026 → out (sebelum window)'],
  ['2027-02-01', false, 'Feb 2027 → out (setelah window)'],
  ['2027-12-15', false, 'Des 2027 → out (winter berikutnya, bukan terdekat)'],
  ['2025-12-15', false, 'Des 2025 → out (winter lalu)'],
  ['invalid',    false, 'invalid ISO → false'],
  ['2026-13-01', false, 'invalid bulan → false'],
];

for (const [tgl, expected, label] of pkgCases) {
  const got = isMusimDinginPackage({ berangkat_tgl: tgl }, win);
  const ok = got === expected;
  console.log(`${ok ? 'PASS' : 'FAIL'}  pkg ${tgl}  got=${got} (expected ${expected})  ${label}`);
  if (!ok) failures++;
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll passed.');
```

- [ ] **Step 2: Jalankan skrip dan verifikasi semua PASS**

```bash
node scripts/verify-musim-dingin.mjs
```

Expected output: setiap baris diawali `PASS`, ditutup dengan `All passed.`. Kalau ada `FAIL`, periksa logic helper di Task 1 sebelum lanjut.

---

## Task 3: Update `matchesPackageType` untuk handle Musim Dingin

**Files:**
- Modify: [src/components/BrochureSchedulePage.tsx:159-163](src/components/BrochureSchedulePage.tsx#L159-L163)

- [ ] **Step 1: Ubah signature dan body**

Ganti fungsi `matchesPackageType` saat ini:

```tsx
function matchesPackageType(pkg: BrochurePackage, type: string): boolean {
  if (type === TYPE_UMROH_RAHMAH) return isRahmahPackage(pkg);
  if (type === TYPE_UMROH_PROMO) return isPromoPackage(pkg);
  return derivePackageType(pkg.nama) === type;
}
```

menjadi:

```tsx
function matchesPackageType(pkg: BrochurePackage, type: string, musimDinginWindow: MusimDinginWindow): boolean {
  if (type === TYPE_UMROH_MUSIM_DINGIN) return isMusimDinginPackage(pkg, musimDinginWindow);
  if (type === TYPE_UMROH_RAHMAH) return isRahmahPackage(pkg);
  if (type === TYPE_UMROH_PROMO) return isPromoPackage(pkg);
  return derivePackageType(pkg.nama) === type;
}
```

Order branch tidak berpengaruh fungsional (branches eksklusif by nilai `type`). Menempatkan Musim Dingin di depan hanya untuk membaca: kategori seasonal dipisah dari kategori karakter paket.

---

## Task 4: Update `brochureLabelForType` untuk label brosur

**Files:**
- Modify: [src/components/BrochureSchedulePage.tsx:165-170](src/components/BrochureSchedulePage.tsx#L165-L170)

- [ ] **Step 1: Tambah mapping Musim Dingin**

Ganti:

```tsx
function brochureLabelForType(type: string, fallback: string): string {
  if (type === TYPE_UMROH_SAJA) return 'REGULER';
  if (type === TYPE_UMROH_RAHMAH) return 'RAHMAH';
  if (type === TYPE_UMROH_PROMO) return 'PROMO';
  return fallback || type;
}
```

menjadi:

```tsx
function brochureLabelForType(type: string, fallback: string): string {
  if (type === TYPE_UMROH_SAJA) return 'REGULER';
  if (type === TYPE_UMROH_RAHMAH) return 'RAHMAH';
  if (type === TYPE_UMROH_PROMO) return 'PROMO';
  if (type === TYPE_UMROH_MUSIM_DINGIN) return 'MUSIM DINGIN';
  return fallback || type;
}
```

---

## Task 5: Tambah `musimDinginWindow` useMemo di component

**Files:**
- Modify: [src/components/BrochureSchedulePage.tsx:266-269](src/components/BrochureSchedulePage.tsx#L266-L269) (tepat setelah `optionPackages` useMemo)

- [ ] **Step 1: Sisipkan useMemo baru**

Setelah blok `optionPackages` useMemo (baris 266-269), sebelum komentar `// Available right-side options...`, tambah:

```tsx
  // Musim Dingin window dihitung sekali per session (window tidak bergeser
  // mid-day untuk use case ini). Deps kosong intentional.
  const musimDinginWindow = useMemo(() => getMusimDinginWindow(new Date()), []);
```

Hasil akhir bagian itu (sekitar baris 266-272):

```tsx
  const optionPackages = useMemo<BrochurePackage[]>(
    () => availableOnly ? allPackages.filter(p => !p.soldOut) : allPackages,
    [availableOnly, allPackages],
  );

  // Musim Dingin window dihitung sekali per session (window tidak bergeser
  // mid-day untuk use case ini). Deps kosong intentional.
  const musimDinginWindow = useMemo(() => getMusimDinginWindow(new Date()), []);
```

---

## Task 6: Insert Musim Dingin di `availableValues` (tipe branch)

**Files:**
- Modify: [src/components/BrochureSchedulePage.tsx:282-291](src/components/BrochureSchedulePage.tsx#L282-L291)

- [ ] **Step 1: Tambah option di posisi paling atas**

Ganti blok `if (filterDim === 'tipe')` saat ini:

```tsx
    if (filterDim === 'tipe') {
      const present = new Set(optionPackages.map(p => derivePackageType(p.nama)));
      const ordered: Array<{ value: string; label: string }> = [];
      if (present.has(TYPE_UMROH_SAJA)) ordered.push({ value: TYPE_UMROH_SAJA, label: 'Umroh Saja' });
      if (optionPackages.some(isRahmahPackage)) ordered.push({ value: TYPE_UMROH_RAHMAH, label: 'Umroh Rahmah' });
      if (optionPackages.some(isPromoPackage)) ordered.push({ value: TYPE_UMROH_PROMO, label: 'Umroh Promo' });
      for (const t of PACKAGE_TYPES) {
        if (present.has(t.value)) ordered.push({ value: t.value, label: t.value.replace(/^PLUS /, 'Plus ') });
      }
      return ordered;
    }
```

menjadi:

```tsx
    if (filterDim === 'tipe') {
      const present = new Set(optionPackages.map(p => derivePackageType(p.nama)));
      const ordered: Array<{ value: string; label: string }> = [];
      if (optionPackages.some(p => isMusimDinginPackage(p, musimDinginWindow))) {
        ordered.push({ value: TYPE_UMROH_MUSIM_DINGIN, label: 'Umroh Musim Dingin' });
      }
      if (present.has(TYPE_UMROH_SAJA)) ordered.push({ value: TYPE_UMROH_SAJA, label: 'Umroh Saja' });
      if (optionPackages.some(isRahmahPackage)) ordered.push({ value: TYPE_UMROH_RAHMAH, label: 'Umroh Rahmah' });
      if (optionPackages.some(isPromoPackage)) ordered.push({ value: TYPE_UMROH_PROMO, label: 'Umroh Promo' });
      for (const t of PACKAGE_TYPES) {
        if (present.has(t.value)) ordered.push({ value: t.value, label: t.value.replace(/^PLUS /, 'Plus ') });
      }
      return ordered;
    }
```

- [ ] **Step 2: Tambah `musimDinginWindow` ke deps array**

Update deps `useMemo` `availableValues` di baris 298:

```tsx
  }, [filterDim, months, optionPackages, availableOnly, musimDinginWindow]);
```

---

## Task 7: Pass window ke `matchesPackageType` di `filteredPackages`

**Files:**
- Modify: [src/components/BrochureSchedulePage.tsx:395-402](src/components/BrochureSchedulePage.tsx#L395-L402)
- Modify: [src/components/BrochureSchedulePage.tsx:409](src/components/BrochureSchedulePage.tsx#L409) (deps array)

- [ ] **Step 1: Pass `musimDinginWindow` ke matchesPackageType call**

Ganti baris 399:

```tsx
        .filter(p => matchesPackageType(p, filterValue))
```

menjadi:

```tsx
        .filter(p => matchesPackageType(p, filterValue, musimDinginWindow))
```

- [ ] **Step 2: Tambah `musimDinginWindow` ke deps array useMemo**

Update deps baris 409:

```tsx
  }, [filterDim, filterValue, months, allPackages, availableValues, availableOnly, musimDinginWindow]);
```

---

## Task 8: Typecheck

**Files:** N/A

- [ ] **Step 1: Jalankan vite build untuk catch TS errors**

```bash
npm run build
```

Expected: build sukses tanpa error. Kalau ada TS error, periksa signature `matchesPackageType` di semua call site (Task 3 + Task 7) dan deps array (Task 6 step 2 + Task 7 step 2).

Build sukses signal: `✓ built in <time>` muncul di akhir.

---

## Task 9: Manual browser verification

**Files:** N/A

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

Buka URL yang tertampil (biasanya `http://localhost:5173`).

- [ ] **Step 2: Login dan navigate ke brosur jadwal**

Login dengan akun yang memiliki data paket umroh di Des 2026 atau Jan 2027. Navigate ke `/dashboard/ai-tools/brosur-jadwal`.

- [ ] **Step 3: Verifikasi dropdown**

Pilih dimensi **Tipe Paket** di dropdown kiri. Pada dropdown nilai (kanan), pastikan **Umroh Musim Dingin** muncul **paling atas**, di atas "Umroh Saja".

- [ ] **Step 4: Verifikasi filter result**

Pilih **Umroh Musim Dingin**. Pastikan:
- Hanya paket dengan `berangkat_tgl` di Des 2026 atau Jan 2027 yang tampil
- Paket disusun ascending by tanggal
- Setiap row menampilkan nomor tanggal + nama bulan (Des/Jan) — bukan hanya nomor

- [ ] **Step 5: Verifikasi label brosur**

Lihat title block brosur (preview area). Pastikan teks judul: **MUSIM DINGIN** (uppercase, generik, tanpa tahun).

- [ ] **Step 6: Verifikasi toggle "Tersedia saja"**

Klik tombol CircleCheck (toggle tersedia). Skenario:
- Kalau ada minimal 1 paket Musim Dingin tidak sold-out → opsi tetap di dropdown
- Kalau semua paket Musim Dingin sold-out → opsi auto-hide dari dropdown, filter pindah ke opsi pertama yang tersedia

- [ ] **Step 7: Verifikasi export**

Klik **Download** (atau Share di mobile). Pastikan:
- File ter-download dengan nama mengandung `musim-dingin` (e.g., `brosur-paket-umroh-musim-dingin.jpg`)
- Buka file, verifikasi judul "MUSIM DINGIN" terbaca jelas dan layout brosur normal
- Kalau >10 paket: ada beberapa gambar (`-gambar-1.jpg`, `-gambar-2.jpg`, dst)

---

## Task 10: Cleanup verification script & commit

**Files:**
- Delete: `scripts/verify-musim-dingin.mjs`
- Commit: changes to `src/components/BrochureSchedulePage.tsx`

- [ ] **Step 1: Hapus skrip verifikasi**

```bash
rm scripts/verify-musim-dingin.mjs
```

- [ ] **Step 2: Cek status git**

```bash
git status
git diff src/components/BrochureSchedulePage.tsx
```

Pastikan hanya `src/components/BrochureSchedulePage.tsx` yang berubah dan tidak ada residual file.

- [ ] **Step 3: Commit**

```bash
git add src/components/BrochureSchedulePage.tsx
git commit -m "$(cat <<'EOF'
feat(brosur): tambah filter "Umroh Musim Dingin" di brosur jadwal

Filter baru di dimensi Tipe Paket yang menampilkan paket berangkat di
Des/Jan musim dingin terdekat. Label brosur "MUSIM DINGIN" generik.
Cross-month sorting otomatis (showFullDate=true), auto-hide jika tidak
ada paket di window atau semua sold-out saat toggle Tersedia aktif.

Definisi Des-Jan diselaraskan dengan filter UMROH MUSIM DINGIN di
public landing page (src/utils/filter-logic.ts). Brosur menambahkan
nearest-winter logic agar tidak mix 2 tahun musim dingin dalam satu
brosur.

Spec: docs/superpowers/specs/2026-05-27-umroh-musim-dingin-brosur-design.md
Plan: docs/superpowers/plans/2026-05-27-umroh-musim-dingin-brosur.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Verifikasi commit**

```bash
git log -1 --stat
```

Expected: commit teratas adalah commit feature ini, dengan 1 file changed (`src/components/BrochureSchedulePage.tsx`), insertions/deletions reasonable (~40-60 baris additions).
