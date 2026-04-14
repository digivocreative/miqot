# Flag Overlay pada Card Paket Jadwal

## Context

Card paket jadwal saat ini tidak menampilkan informasi visual tentang negara tujuan. Folder `/public/flags/` sudah berisi gambar bendera (PNG 600x401px) untuk Saudi, Turki, UAE, Mesir, dan China, tetapi belum digunakan di card. Fitur ini menambahkan bendera negara sebagai background overlay di card untuk memberikan identitas visual yang langsung terlihat.

## Visual Approach

**Side bleed dengan gradient fade** di sisi kanan card:

- Gambar bendera diposisikan `position: absolute` di sisi kanan card
- Full-height, lebar ~120px
- Opacity ~15%
- Gradient overlay dari putih (kiri) ke transparan (kanan) supaya konten teks tetap terbaca
- `pointer-events: none` agar tidak mengganggu interaksi
- `z-index: 0` dengan konten card di `z-index: 1`

### Multi-flag (2+ negara)

Untuk paket multi-destination (misal Cairo + Turki), bendera ditampilkan split vertikal:
- Bendera pertama di separuh atas
- Bendera kedua di separuh bawah
- Masing-masing tetap dengan opacity dan gradient yang sama

## Aturan Tampil Bendera

| Jenis Paket | Flag yang Muncul |
|---|---|
| Reguler (Saudi saja) | `saudi.png` |
| Plus Turki | `turki.png` |
| Plus Cairo | `mesir.png` |
| Plus Haikou/Hainan | `china.png` |
| Plus Dubai/Abu Dhabi | `uae.png` |
| Multi-destination | Semua flag negara tambahan (split vertikal) |

**Aturan kunci**: Bendera Saudi TIDAK ditampilkan untuk paket non-reguler. Hanya paket reguler (tanpa Plus) yang menampilkan bendera Saudi.

## Deteksi Negara

Berdasarkan **hotel data** dari field `PackageHotels` pada setiap tier:

| Hotel field | Negara | File |
|---|---|---|
| `cairo_hotel` | Mesir | `mesir.png` |
| `istanbul_hotel` / `bursa_hotel` / `cappadocia_hotel` / `ankara_hotel` | Turki | `turki.png` |
| `dubai_hotel` | UAE | `uae.png` |
| `haikou_hotel` | China | `china.png` |
| Tidak ada extra hotel | Saudi (reguler) | `saudi.png` |

Deteksi dilakukan dari hotel data tier pertama yang tersedia. Pattern ini konsisten dengan yang sudah digunakan di `ComparePage.tsx` dan `KalkulasiPage.tsx`.

## Implementasi

Card wrapper di `PackageCard.tsx:1503-1519` sudah memiliki `relative overflow-hidden`, dan seluruh konten card (variants + expanded) dibungkus dalam `<div className="relative z-10">`. Flag overlay cukup ditambahkan **sekali** di dalam card wrapper, sebelum div konten z-10. Ini otomatis berlaku untuk semua variant dan state (collapsed + expanded).

### Dark mode

Card background: `bg-white dark:bg-slate-800`. Gradient harus adaptive:
- Light: `linear-gradient(to right, white, transparent)`
- Dark: `linear-gradient(to right, rgb(30,41,59), transparent)` (slate-800)

Gunakan Tailwind `dark:` variant atau conditional className.

## Scope

### File yang dimodifikasi

- **`src/components/PackageCard.tsx`** — Tambahkan flag overlay element di card wrapper + utility function `getCountryFlags()` untuk deteksi negara dari hotel data (menggunakan `hotelInfo` yang sudah di-resolve dari `cheapestTier` di line 311)

### Asset yang digunakan

- `/public/flags/saudi.png`
- `/public/flags/turki.png`
- `/public/flags/mesir.png`
- `/public/flags/china.png`
- `/public/flags/uae.png`

### Tidak termasuk

- Perubahan pada CompactCard (scope terpisah)
- Perubahan pada halaman lain (KalkulasiPage, ComparePage sudah punya emoji sendiri)

## Verifikasi

1. Jalankan dev server (`npm run dev`)
2. Buka halaman utama dengan daftar paket
3. Verifikasi:
   - Paket reguler menampilkan bendera Saudi
   - Paket Plus Turki menampilkan bendera Turki (tanpa Saudi)
   - Paket Plus Cairo menampilkan bendera Mesir (tanpa Saudi)
   - Paket multi-destination menampilkan split bendera
   - Bendera tidak mengganggu keterbacaan teks
   - Overlay konsisten di semua 5 layout variant
   - Dark mode tetap berfungsi baik
4. Test di mobile viewport untuk memastikan flag tidak overflow
