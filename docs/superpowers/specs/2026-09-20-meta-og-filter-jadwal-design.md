# Meta & kartu OG per filter — halaman Jadwal publik

Tanggal: 2026-09-20
Status: disetujui untuk implementasi

## Masalah

Setiap URL filter halaman Jadwal publik berbagi kartu share yang sama persis.
Penyuntiknya ada di SPA fallback (`server.js`, `app.get('{*path}')`) dan hanya
mengenal satu bentuk:

```
title        Jadwal Umroh Alhijaz | {nama agent}
description  Dapatkan info lengkap paket umrah Alhijaz Indowisata bersama {nama agent}. …
og:image     /og/{slug}.png      ← kartu profil agent
```

Akibatnya `/nikita/umroh-ramadhan`, `/nikita/landing-madinah`, dan
`/nikita/november-2026` tampil identik saat di-share ke WhatsApp. Agent yang
mengirim link "Umroh Ramadhan" ke jamaah tidak punya cara membuat preview-nya
menyebut Ramadhan.

## Keputusan produk (sudah dikonfirmasi user)

1. **Kartu TANPA data paket.** Tidak ada jumlah paket, harga, atau rentang
   tanggal di kartu. Kartu memuat label filternya saja.
2. **Tujuan = share WhatsApp/FB.** Sitemap, `robots.txt`, dan canonical per
   filter DI LUAR CAKUPAN.
3. **Cakupan URL = nilai konkret + mode telanjang.** `/umroh-ramadhan`,
   `/landing-madinah`, `/9-hari`, `/november-2026`, dan juga `/tipe-paket`,
   `/landing-di`, `/durasi-perjalanan`, `/data-per-bulan` yang belum memilih
   nilai. Flag query (`?promo`, `?tersedia`, `?urut=`) tidak memengaruhi kartu.
4. **Bentuk kartu = varian A**: eyebrow menyebut dimensi ("JENIS PAKET"),
   headline menyebut nilainya ("Umroh Ramadhan"). Bukan varian C (headline
   dimensi saja), karena C membuat `/umroh-ramadhan` dan `/plus-turki` tampil
   identik — persis keluhan yang mau diselesaikan.

Keputusan 1 penting karena ia MENGHAPUS kebutuhan server ikut menyaring paket.
Kartu berdata akan memaksa server menjalankan predikat filter yang sama dengan
klien; kalau meleset, kartu berbohong ("4 paket" di atas halaman berisi 5).

## Yang tersisa sebagai risiko

Server tetap harus menerjemahkan `/umroh-ramadhan` → `(TIPE PAKET, "UMROH
RAMADHAN")` untuk menulis labelnya. Kodek itu sekarang hidup di
`src/utils/filter-logic.ts` — TypeScript, mengimpor `@/types` dan
`@/services/data-service`, tidak bisa diimpor Node.

**Menyalin kodeknya tidak boleh.** Slug filter bertambah dari waktu ke waktu
(`umroh-ramadhan` baru lahir 2026-09-20); salinan yang tertinggal membuat slug
baru kehilangan kartunya tanpa satu tes pun gagal. Karena itu inti pekerjaan ini
adalah mengangkat kodek slug menjadi modul bersama, bukan menggambar kartu.

## Arsitektur

```
src/lib/packageType.js ──┐
                         ├──→ lib/filter-slug.js ──→ lib/filter-share-meta.js
   (sudah JS murni)      │     (BARU, JS murni)        (BARU, JS murni)
                         │            │                        │
                         │            │              ┌─────────┴─────────┐
                         │            │              ↓                   ↓
                         │            │        server.js           src/App.tsx
                         │            │        (SSR + rute OG)     (judul tab)
                         │            ↓
                         └──→ src/utils/filter-logic.ts
                               (re-export, pemanggil tidak berubah)
                                      │
                                      ↓
                          lib/og-generator.mjs → generateFilterOgPng()
```

### 1. `lib/filter-slug.js` — kodek slug bersama (BARU)

Dipindahkan apa adanya dari `src/utils/filter-logic.ts`:

- `FILTER_MODE_SLUGS`, `SLUG_TO_FILTER_MODE`, `LEGACY_FILTER_SLUGS`
- `FILTER_MODE_LABELS`, `filterModeLabel()`
- `getFilterSlug()`, `buildFilterSlug()`, `resolveFilterSlug()`,
  `getFilterModeFromSlug()`
- pembantu privat: `slugifyCity`, `landingSlug`, `landingFromSlug`,
  `monthSlug`, `monthFromSlug`, `durationSlug`, `durationFromSlug`
- `LANDING_FILTER_CODES`, `MONTH_NAMES_ID`

Dependensi yang ikut pindah kecil dan sudah JS murni:

- `packageTypeSlug` / `packageTypeFromSlug` / `packageTypeLabel` dari
  `src/lib/packageType.js` — impor langsung, tidak disalin.
- `airportCityName` dipakai hanya untuk dua kode (`JED`, `MED`). Modul ini
  menyalin **peta dua entri itu saja**, bukan seluruh `LANDING_AIRPORT_MAP`, dan
  sebuah tes mengunci bahwa peta lokal ini sejalan dengan `journey.ts`
  untuk `LANDING_FILTER_CODES`.

`src/utils/filter-logic.ts` mengimpor dari modul baru lalu **meneruskan
ekspornya**, jadi tidak ada satu pun pemanggil yang perlu diubah — termasuk
barrel `src/utils/index.ts` (`export * from './filter-logic'`) dan 15 pemanggil
`resolveFilterSlug`.

**Invarian yang tidak boleh goyah:** `src/main.tsx` memakai
`getFilterModeFromSlug` sebagai **gerbang negatif** — slug yang tidak dikenal
dibaca sebagai ID paket. Ekstraksi ini wajib perilaku-identik; pola yang
melonggar akan menelan `/nikita/JBU1574` dan mengubah halaman detail paket jadi
daftar jadwal.

Jaring pengaman sudah ada: `tests/jadwal-filter-url.test.js` membundel
`filter-logic.ts` lewat esbuild dan mengunci bolak-balik slug. Tes itu harus
tetap hijau **tanpa satu baris pun diubah**. Kalau ia perlu diubah, ekstraksinya
mengubah perilaku dan itu bug, bukan tes yang basi.

### 2. `lib/filter-share-meta.js` — teks kartu (BARU)

```js
buildFilterShareMeta({ filterSlug, agentName, agentSlug })
  → null                                   // bukan slug filter
  → { mode, dimensionLabel, valueLabel, title, description, ogImagePath }
```

Satu sumber untuk server (SSR) dan klien (judul tab). Bentuk teksnya:

| URL | dimensionLabel | valueLabel | title |
|---|---|---|---|
| `/nikita/umroh-ramadhan` | JENIS PAKET | Umroh Ramadhan | `Umroh Ramadhan — Jadwal Umroh Alhijaz \| Nikita Sari` |
| `/nikita/landing-madinah` | KOTA LANDING | Madinah | `Landing Madinah — Jadwal Umroh Alhijaz \| Nikita Sari` |
| `/nikita/9-hari` | DURASI PERJALANAN | 9 Hari | `Umroh 9 Hari — Jadwal Umroh Alhijaz \| Nikita Sari` |
| `/nikita/november-2026` | KEBERANGKATAN | November 2026 | `Keberangkatan November 2026 — Jadwal Umroh Alhijaz \| Nikita Sari` |
| `/nikita/tipe-paket` | JENIS PAKET | — | `Jenis Paket — Jadwal Umroh Alhijaz \| Nikita Sari` |

Tanpa `agentName` (link telanjang `alhijaz.co/umroh-ramadhan`) sufiksnya jadi
`— Jadwal Umroh Alhijaz Indowisata`.

Deskripsi mengikuti satu pola: sebut filternya, sebut agent bila ada, tutup
dengan ajakan WhatsApp — meneruskan nada deskripsi agent yang sekarang.

**Label dimensi TIDAK diambil dari `FILTER_MODE_LABELS`.** Label itu milik
dropdown: HURUF BESAR semua, dan sebagiannya jargon internal ("DATA PER-BULAN")
yang tidak pantas tayang di kartu share. Modul ini memakai tabelnya sendiri:

| mode | eyebrow kartu | dipakai di title |
|---|---|---|
| `TIPE PAKET` | `JENIS PAKET` | `{nilai}` |
| `LANDING DI` | `KOTA LANDING` | `Landing {nilai}` |
| `DURASI PERJALANAN` | `DURASI PERJALANAN` | `Umroh {nilai}` |
| `DATA PER-BULAN` | `KEBERANGKATAN` | `Keberangkatan {nilai}` |

Eyebrow selalu huruf besar (mengikuti kartu paket). Teks `title` memakai kapital
kalimat. Mode telanjang memakai bentuk Title Case dari eyebrow-nya sebagai
headline sekaligus judul — "Jenis Paket", "Kota Landing", "Durasi Perjalanan",
"Keberangkatan".

### 3. `generateFilterOgPng()` di `lib/og-generator.mjs`

Kartu ke-6 di modul ini. Memakai sasis `generatePackageOgPng` yang sudah matang:
kanvas 1200×630, gradien hijau, logo AIW putih kiri-atas, emblem Kabah kanan,
baris agent (foto bulat + nama) kiri-bawah, `alhijaz.co` kanan-bawah.

Isi yang berbeda:

- **Eyebrow** (emas, huruf besar, ber-letterspacing) = `dimensionLabel`.
- **Headline** (putih, besar) = `valueLabel`, atau `dimensionLabel` kalau mode
  telanjang. Memakai `wrapOgLines` dengan penurunan ukuran bertingkat, pola sama
  dengan nama paket yang panjang.
- **Tidak ada** chip, panel harga, maupun blok hotel.
- Pill kanan-atas = "JADWAL UMROH" (sejajar "PAKET UMROH" di kartu paket).

Semua teks wajib lewat `stripUnrenderableGlyphs` — emoji di nama agent membuat
Pango gagal fatal dan mematikan proses Express.

### 4. Rute `/og/filter/:slug/:filterSlug.png`

Mengikuti bentuk `/og/paket/:slug/:packageId.png`:

- validasi `slug` dan `filterSlug` dengan regex sempit sebelum menyentuh DB;
- `resolveSlug(slug)` → 404 kalau agent tidak ada;
- `resolveFilterSlug(filterSlug)` → 404 kalau bukan slug filter;
- `Cache-Control: public, max-age=3600, stale-while-revalidate=86400`.

Varian tanpa agent (`/og/filter/:filterSlug.png`) untuk link telanjang.

**Tanpa penanda versi `?v=`.** Kartu paket memerlukannya karena harga dan kursi
berubah; kartu filter tidak memuat data yang bisa basi.

### 5. Suntikan SSR

Cabang baru di SPA fallback `server.js`. Saat ini ia bercabang dua: `portalMeta`
atau default agent. Ditambah satu cabang di antaranya:

```
portalMeta            → kartu jamaah          (tidak berubah)
filterMeta  ← BARU    → kartu filter
default               → kartu agent           (tidak berubah)
```

`filterMeta` dihitung dari segmen path kedua (`/:slug/:filterSlug`), atau segmen
pertama di custom domain. Slug yang tidak dikenali `resolveFilterSlug`
mengembalikan `null` dan cabangnya dilewati — **fail-open ke kartu agent**,
bukan kartu kosong.

Urutannya penting: cek portal dulu. Path portal jamaah tidak akan pernah cocok
dengan slug filter, tapi urutan yang eksplisit mencegah pertanyaan itu muncul
lagi nanti.

### 6. Klien berhenti menimpa judul SSR

`src/App.tsx` (~baris 319) menyetel `document.title = 'Jadwal Umroh Alhijaz |
{agent}'` di tiap muat halaman. Tanpa disentuh, judul tab berkedip balik ke
generik sedetik setelah SSR menulis judul filter — dan tetap salah saat pengguna
berpindah filter tanpa reload.

Perbaikannya: bangun judul dari `buildFilterShareMeta` memakai filter yang
sedang aktif, dan jalankan efeknya saat filter berubah. Ini menjadikan judul tab
benar untuk navigasi di dalam SPA, yang SSR memang tidak bisa jangkau.

Efek meta paket tunggal yang sudah ada (`singlePackageId`) tetap menang — ia
lebih spesifik. Gerbang `if (!singlePackageId)` menjaga keduanya tidak berebut.

## Rencana uji

Semua modul baru murni, jadi bisa diuji `node --test` tanpa browser.

1. **`tests/filter-slug.test.js` (baru)** — kodeknya diuji langsung sebagai JS,
   tanpa bundling esbuild: bolak-balik semua bentuk slug, slug lama
   (`umroh-promo`, `bintang-5`), dan penolakan slug asing (`JBU1574`, string
   kosong, slug ngawur).
2. **`tests/jadwal-filter-url.test.js` (ada, TIDAK diubah)** — bukti ekstraksi
   tidak mengubah perilaku dari sisi pemanggil TypeScript.
3. **`tests/filter-share-meta.test.js` (baru)** — bentuk title/description untuk
   tiap dimensi, varian tanpa agent, dan `null` untuk slug bukan-filter.
4. **Paritas peta kota** — `LANDING_FILTER_CODES` di modul baru menghasilkan
   nama kota yang sama dengan `airportCityName` di `journey.ts`.
5. **Kartu benar-benar terbentuk** — panggil `generateFilterOgPng` dan pastikan
   ia mengembalikan PNG 1200×630 yang sah (dibaca ulang lewat `sharp`), termasuk
   untuk nama agent ber-emoji.
6. **Manual** — buka satu URL filter, periksa `<title>`, `og:title`,
   `og:description`, `og:image` di HTML yang dikirim server (bukan setelah JS
   jalan), dan lihat PNG-nya.

## Di luar cakupan

- `sitemap.xml`, `robots.txt`, canonical per filter.
- Flag query memengaruhi kartu.
- Kartu berisi data paket (jumlah, harga, tanggal).
- Halaman Brosur — dashboard, tidak di-share publik.
