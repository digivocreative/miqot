# Filter "UMROH CUTI 5 HARI"

## Ringkasan

Menambahkan filter baru di dropdown jadwal yang menampilkan paket umroh dengan jadwal keberangkatan dan kepulangan yang memaksimalkan weekend, sehingga jamaah cukup mengambil cuti kerja 5 hari (Senin–Jumat).

## Kriteria Filter

Sebuah paket lolos filter **jika dan hanya jika** kedua kondisi di bawah terpenuhi.

**Keberangkatan:**
- Hari Jumat dan jam keberangkatan ≥ 18:00, **ATAU**
- Hari Sabtu (jam bebas)

**Kepulangan** (tanggal/jam landing di Indonesia):
- Hari Sabtu (jam bebas), **ATAU**
- Hari Minggu (jam bebas), **ATAU**
- Hari Senin dan jam landing < 06:00

Asumsi: `pkg.keberangkatan.tgl` + `jam` adalah waktu take-off dari Indonesia, `pkg.kepulangan.tgl` + `jam` adalah waktu landing di Indonesia. Keduanya dalam zona waktu lokal Indonesia.

## Perubahan Code

### 1. `src/utils/filter-logic.ts`

- Tambah `'UMROH CUTI 5 HARI'` ke union type `FilterMode`.
- Tambah entry `'UMROH CUTI 5 HARI': 'cuti-5-hari'` ke `FILTER_MODE_SLUGS`.
- Tambah helper. Catatan penting: `new Date('YYYY-MM-DD')` diparse JS sebagai UTC midnight, yang membuat `.getDay()` bisa geser 1 hari di timezone negatif. Parse manual sebagai tanggal lokal:

  ```ts
  function parseLocalDate(dateStr: string): Date {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function matchesCuti5Hari(pkg: UmrohPackage): boolean {
    const depDay = parseLocalDate(pkg.keberangkatan.tgl).getDay(); // 0=Min, 5=Jum, 6=Sab
    const depHour = parseInt(pkg.keberangkatan.jam.split('.')[0], 10);

    const retDay = parseLocalDate(pkg.kepulangan.tgl).getDay();
    const retHour = parseInt(pkg.kepulangan.jam.split('.')[0], 10);

    const depOk = (depDay === 5 && depHour >= 18) || depDay === 6;
    const retOk = retDay === 6 || retDay === 0 || (retDay === 1 && retHour < 6);

    return depOk && retOk;
  }
  ```

- Tambah case di switch `filterPackages`:

  ```ts
  case 'UMROH CUTI 5 HARI':
    return data.filter(matchesCuti5Hari);
  ```

### 2. `src/components/FilterHeader.tsx`

- Tambah entry ke `FILTER_MODE_OPTIONS`, disisipkan **setelah** `LIBURAN_SEKOLAH`:

  ```ts
  { value: 'UMROH CUTI 5 HARI', label: 'UMROH CUTI 5 HARI' },
  ```

- Tambahkan `'UMROH CUTI 5 HARI'` ke kondisi `showSortDropdown` supaya dropdown "Urutkan" muncul:

  ```ts
  const showSortDropdown =
    filterMode === 'AVAILABLE' ||
    filterMode === 'LIBURAN_SEKOLAH' ||
    filterMode === 'PROMO' ||
    filterMode === 'UMROH REGULER' ||
    filterMode === 'UMROH MUSIM DINGIN' ||
    filterMode === 'BINTANG 5' ||
    filterMode === 'UMROH CUTI 5 HARI';
  ```

## UX

- **Label tampilan:** "UMROH CUTI 5 HARI"
- **Posisi dropdown:** setelah "LIBURAN SEKOLAH", sebelum "UMROH PROMO"
- **URL slug:** `/cuti-5-hari` (dan `/{agent}/cuti-5-hari`)
- **Dropdown sort:** tampil (Tanggal Terdekat/Terjauh, Harga Termurah/Tertinggi)
- **Secondary value:** tidak ada (sama seperti AVAILABLE/PROMO)

## Edge Cases

- **Paket berangkat Jumat jam 17.59** → tidak lolos (cutoff ketat pada 18:00).
- **Paket landing Senin jam 06:00 tepat** → tidak lolos (cutoff ketat < 06:00).
- **Paket pulang Senin siang** → tidak lolos.
- **Paket dengan `jam` yang tidak terparse** → `parseInt('xx.xx'.split('.')[0], 10)` → `NaN`; `NaN >= 18` → `false` dan `NaN < 6` → `false`. Artinya paket yang jamnya korup otomatis tidak lolos. Ini perilaku yang kita terima (fail-safe).
- **Filter tidak memfilter berdasarkan seat tersedia.** Konsisten dengan `LIBURAN_SEKOLAH`, `UMROH REGULER`, dll. — paket sold out tetap bisa muncul.

## Tidak Termasuk di Scope

- Tidak menggabungkan "CUTI 5 HARI" dengan filter lain (misal hanya yang PROMO + cuti 5 hari). Pola existing: satu mode filter saja yang aktif.
- Tidak menghitung hari libur nasional. Logika dasarnya Sen–Jum = hari kerja.
- Tidak mempertimbangkan tanggal manasik (pre-departure briefing). Kalau manasik jatuh di hari kerja, itu urusan terpisah.
