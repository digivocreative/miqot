# Filter "UMROH MUSIM DINGIN" di Brosur Jadwal

## Ringkasan

Menambahkan opsi filter baru pada dimensi **Tipe Paket** di halaman `/dashboard/ai-tools/brosur-jadwal` yang menampilkan paket umroh dengan keberangkatan di **bulan Desember atau Januari musim dingin terdekat**. Output brosur memakai label generik **"MUSIM DINGIN"**.

Definisi "Desember–Januari" diselaraskan dengan filter `UMROH MUSIM DINGIN` yang sudah ada di public landing page (`src/utils/filter-logic.ts:385`). Perbedaan: brosur menambahkan logic *nearest-winter* sehingga ketika `monthsAhead=24` rentang waktu mencakup dua musim dingin (mis. Des 2026/Jan 2027 dan Des 2027/Jan 2028), hanya satu musim dingin terdekat yang muncul. Public landing page tidak butuh ini karena scope tampilan-nya beda (jamaah browse semua tanggal yang tersedia).

## Kriteria Filter

Sebuah paket lolos filter **jika dan hanya jika** `pkg.berangkat_tgl` jatuh di **musim dingin terdekat** relatif terhadap hari ini, yang didefinisikan sebagai:

| Posisi "hari ini" | Musim dingin terdekat |
|---|---|
| Bulan Desember | Des tahun ini + Jan tahun depan |
| Bulan Januari | Des tahun lalu + Jan tahun ini (current winter) |
| Bulan Februari–November | Des tahun ini + Jan tahun depan (next winter) |

Asumsi: `pkg.berangkat_tgl` adalah string ISO `YYYY-MM-DD`. Parse sebagai UTC midnight (sama seperti seluruh kode brochure existing) untuk menghindari timezone drift.

## Perubahan Code

Semua perubahan berada di **`src/components/BrochureSchedulePage.tsx`**. Tidak ada perubahan pada `BrochureScheduleTemplate.tsx`, `lib/brochure-schedule.js`, atau `server.js`.

### 1. Konstanta tipe

Tambah konstanta sejajar dengan `TYPE_UMROH_SAJA`, `TYPE_UMROH_RAHMAH`, `TYPE_UMROH_PROMO`:

```tsx
const TYPE_UMROH_MUSIM_DINGIN = 'UMROH MUSIM DINGIN';
```

### 2. Helper `getMusimDinginWindow`

Helper murni di module scope (sebelum component):

```tsx
interface MusimDinginWindow {
  yearOfDec: number; // tahun bulan Desember dari musim dingin terdekat
}

function getMusimDinginWindow(today: Date): MusimDinginWindow {
  const month = today.getUTCMonth(); // 0=Jan, 11=Dec
  const year = today.getUTCFullYear();
  if (month === 11) return { yearOfDec: year };
  if (month === 0) return { yearOfDec: year - 1 };
  return { yearOfDec: year };
}
```

### 3. Helper `isMusimDinginPackage`

```tsx
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

### 4. Window memoization di component

Tambah di `BrochureSchedulePage` setelah deklarasi state, sebelum `allPackages`:

```tsx
const musimDinginWindow = useMemo(() => getMusimDinginWindow(new Date()), []);
```

Deps kosong; window tidak perlu re-compute mid-session.

### 5. Update `matchesPackageType`

Tambah branch untuk Musim Dingin. Karena helper butuh `musimDinginWindow`, fungsi `matchesPackageType` di-pass window sebagai parameter ketiga (atau dibikin closure di dalam component — pilih parameter agar tetap pure):

```tsx
function matchesPackageType(pkg: BrochurePackage, type: string, musimDinginWindow: MusimDinginWindow): boolean {
  if (type === TYPE_UMROH_RAHMAH) return isRahmahPackage(pkg);
  if (type === TYPE_UMROH_PROMO) return isPromoPackage(pkg);
  if (type === TYPE_UMROH_MUSIM_DINGIN) return isMusimDinginPackage(pkg, musimDinginWindow);
  return derivePackageType(pkg.nama) === type;
}
```

Semua call site (`availableValues` + `filteredPackages`) di-pass `musimDinginWindow`.

### 6. Update `brochureLabelForType`

```tsx
function brochureLabelForType(type: string, fallback: string): string {
  if (type === TYPE_UMROH_SAJA) return 'REGULER';
  if (type === TYPE_UMROH_RAHMAH) return 'RAHMAH';
  if (type === TYPE_UMROH_PROMO) return 'PROMO';
  if (type === TYPE_UMROH_MUSIM_DINGIN) return 'MUSIM DINGIN';
  return fallback || type;
}
```

### 7. Update `availableValues` (filterDim='tipe')

Sisipkan opsi Musim Dingin **paling atas** (di atas `Umroh Saja`):

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

`optionPackages` sudah menghormati toggle `availableOnly`, sehingga opsi auto-hide kalau seluruh paket Musim Dingin sold-out.

### 8. Update `filteredPackages` useMemo

Pass `musimDinginWindow` ke `matchesPackageType` call:

```tsx
if (filterDim === 'tipe') {
  const opt = availableValues.find(v => v.value === filterValue);
  const brochureLabel = brochureLabelForType(filterValue, opt?.label || filterValue);
  const matches = allPackages
    .filter(p => matchesPackageType(p, filterValue, musimDinginWindow))
    .sort((a, b) => String(a.berangkat_tgl).localeCompare(String(b.berangkat_tgl)));
  return { filterLabel: brochureLabel, filteredPackages: applyAvailability(matches), showFullDate: true };
}
```

Deps `useMemo` ditambah `musimDinginWindow`.

## UX

- **Posisi di dropdown**: paling atas, di atas "Umroh Saja". Memvisualisasikan bahwa ini kategori spesial (seasonal, bukan karakter paket).
- **Label dropdown**: "Umroh Musim Dingin" (title case, sama pola dengan "Umroh Saja", "Umroh Rahmah", "Umroh Promo")
- **Label di brosur**: "MUSIM DINGIN" (uppercase generik, tanpa tahun)
- **Auto-hide**: opsi tidak muncul kalau tidak ada paket di window, atau (saat `availableOnly`=true) kalau semua paket di window sold-out
- **Cross-month rendering**: `showFullDate=true` (otomatis aktif untuk `filterDim='tipe'`) → setiap row paket menampilkan tanggal + nama bulan, jadi user tetap jelas paket itu Des atau Jan
- **Multi-page export**: kalau >10 paket di musim dingin terdekat, brosur otomatis dipecah jadi beberapa gambar (logic existing di `splitPackagesIntoPages`)

## Verifikasi Manual

Tidak ada infrastruktur unit-test untuk filter di brosur jadwal (precedent: `matchesPackageType`, `isRahmahPackage`, `isPromoPackage` semuanya un-tested). Verifikasi dengan langkah berikut setelah implementasi:

1. Load `/dashboard/ai-tools/brosur-jadwal` dengan akun yang punya paket Des 2026 atau Jan 2027 di data
2. Pilih **Tipe Paket** di dropdown filter → opsi **Umroh Musim Dingin** muncul di **paling atas**
3. Pilih → list paket terisi hanya paket Des 2026 + Jan 2027, sorted by tanggal
4. Lihat preview brosur → judul **"MUSIM DINGIN"** muncul di title block (bukan nama bulan)
5. Toggle **Tersedia saja** (CircleCheck) → opsi auto-hide kalau semua winter packages sold-out
6. Generate brosur (Share/Download) → file `brosur-paket-umroh-musim-dingin.jpg` (atau `-gambar-N.jpg` kalau multi-page)

## Out of Scope

- Tidak menambah dimensi filter baru (`Musim/Periode`)
- Tidak menambah kategori seasonal lain (Akhir Tahun, Ramadan, Liburan Sekolah)
- Tidak refactor `src/utils/filter-logic.ts` untuk berbagi helper dengan brosur — public landing page tetap pakai logic bulan saja, brosur pakai logic nearest-winter. Duplikasi minor dapat diterima karena scope dan konteks beda
- Tidak mengubah backend (`/api/ai-tools/brosur-jadwal-bulan` tidak perlu tahu tentang Musim Dingin)
- Tidak mengubah format/layout brosur (`BrochureScheduleTemplate.tsx`)
