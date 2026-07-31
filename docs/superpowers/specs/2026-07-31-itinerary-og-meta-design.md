# Itinerary Share — Meta Title, Description & og:image — Design

**Tanggal:** 2026-07-31
**Status:** menunggu review

## Konteks

Halaman share itinerary `/:slug/:packageId/itinerary` sudah live sejak 2026-07-30
([`SharePage.tsx`](../../../src/components/itinerary/SharePage.tsx), spec
[2026-07-30](2026-07-30-itinerary-web-view-design.md)). Rute SSR-nya di
[`server.js:21213`](../../../server.js) sudah menyuntik `<title>`, `description`,
`og:title`, `og:description`, dan `og:url`.

Yang belum ada: **`og:image`**. Dan `index.html` juga tidak punya `og:image` default.
Akibatnya setiap link itinerary yang dikirim agent ke WhatsApp muncul polos — kotak
teks tanpa gambar — padahal justru di situ link ini paling sering dibagikan.

Infrastruktur untuk memperbaikinya sudah matang. [`lib/og-generator.mjs`](../../../lib/og-generator.mjs)
merender string SVG jadi PNG 1200×630 lewat `sharp`, tanpa browser, dan sudah dipakai
tiga kartu di produksi: `generateFlightShareOgPng`, `generateTerasPostOgPng`,
`generatePortalJamaahOgPng`. Kartu itinerary tinggal menyusul pola yang sama.

## Tujuan

Link itinerary yang dibagikan ke WhatsApp langsung memberi tahu penerima **paket apa,
kapan berangkat, dan bentuk perjalanannya** — sebelum mereka mengklik apa pun.

## Non-tujuan

- Mengubah tampilan halaman itinerary itu sendiri. Halaman tidak disentuh.
- Menampilkan harga. Lihat D2.
- Membuat OG image untuk rute lain (`/:slug/:packageId`, jadwal, dsb).
- Mengubah `cityTheme.ts`. Lihat D4.

## Keputusan

**D1 — Konten utama, agent sebagai pelengkap.**
Isi perjalanan jadi bintang utama; identitas agent hadir kecil di baris bawah (foto
bulat + nama + peran), sama seperti pola kartu penerbangan. Bukan kartu profil agent.

**D2 — Tanpa harga.**
Preview OG di-cache lama oleh WhatsApp/Facebook dan gambarnya ikut terforward keluar
chat. Harga basi di kartu yang beredar lebih merugikan daripada untungnya. Harga tetap
tersedia di halaman paket.

**D3 — Arah visual: "Strip Ringkasan" + emblem Ka'bah.**
Latar burgundy penuh (gradien `#4A0805` → `#8A0F0A`, sama dengan hero halamannya),
judul paket besar di kiri, bar segmen kota proporsional sebagai elemen struktural,
dan emblem Ka'bah samar di kanan sebagai kehangatan.

Dua alternatif ditolak: **kartu putih dengan garis waktu "HARI 1 → HARI 10"** — paling
konsisten dengan kartu penerbangan tapi terlalu padat, judul paket terpaksa mengecil
dan label harinya hilang saat thumbnail WhatsApp mengecil; dan **foto lanskap dengan
scrim** — paling menarik mata tapi fotonya seragam untuk semua paket sehingga justru
kurang memberi tahu, dan menambah ketergantungan aset berlisensi.

**D4 — Palet kota versi terang, terpisah dari `cityTheme.ts`.**
`CITY_HEX` di [`cityTheme.ts`](../../../src/components/itinerary/cityTheme.ts) dikalibrasi
untuk kontras ≥4.5:1 **di atas putih**. Dipakai apa adanya di kartu burgundy gelap semuanya
gagal — dan **Turki `#8A0F0A` identik dengan warna latar**, akan hilang total.

Peta baru khusus kartu gelap, didefinisikan di `og-generator.mjs` (jangan ubah
`cityTheme.ts` — halaman web tetap butuh versi gelapnya):

| Kota | Web (di atas putih) | Kartu OG (di atas burgundy) |
|---|---|---|
| Madinah | `#1F5F4B` | `#3FA985` |
| Mekkah | `#2A5C9A` | `#6BA3E8` |
| Dubai | `#8A6D12` | `#E0B93C` |
| Turki | `#8A0F0A` | `#F2827E` |
| Mesir | `#6B3FA0` | `#B08BE0` |
| Transit | `#556072` | `#9AA6B5` |

**D5 — Emblem, bukan foto.**
Aset `public/img-brosur/kabah.png` (657×644, PNG beralfa) adalah ilustrasi potongan
Ka'bah, bukan foto lanskap. Dipakai sebagai emblem tunggal di kanan dengan halo emas
radial di belakangnya, bukan sebagai latar. Tidak perlu aset baru dan tidak ada
persoalan lisensi.

Percobaan menempel foto sebagai persegi bertepi di sudut kanan **gagal secara visual**:
tepi rect tidak pernah menyatu dengan latar gradien dan meninggalkan jahitan yang
terlihat, baik pada tepi vertikal maupun horizontal. Kalau suatu saat foto asli mau
dipakai, satu-satunya cara yang bersih adalah *full-bleed* seluruh kanvas dengan
opasitas rendah plus scrim — bukan potongan.

**D6 — Nama paket dinormalkan ke Title Case.**
`jadwal_nama` datang HURUF BESAR SEMUA dari sumber (`PAKET A`, `UMROH ... BY SAUDIA`).
Judul 60px huruf besar semua memakan ruang jauh lebih banyak dan lebih lambat dibaca.
Dinormalkan untuk kartu **dan** untuk `<title>`/`og:title`. Halaman itinerary sendiri
tidak disentuh (non-tujuan) — perbedaan kecil ini diterima.

`toTitleCase` yang ada di [`portal-jamaah/utils/formatText.ts`](../../../src/components/portal-jamaah/utils/formatText.ts)
**tidak boleh dipakai langsung**: ia akan merusak `SV` → `Sv` dan `9H` → `9h`. Butuh
varian sadar-nama-paket. Lihat "Helper baru".

**D7 — Judul mendahulukan paket, agent pindah ke deskripsi.**
Judul sekarang `Itinerary {nama} | {agent} — Alhijaz Indowisata` sering >100 karakter,
dan yang terpotong justru nama agent-nya. Format baru menaruh yang terpenting di depan.

## Arsitektur

Tiga berkas disentuh, satu berkas baru:

| Berkas | Perubahan |
|---|---|
| `lib/format-package-name.js` | **Baru.** `formatPackageTitle()`. |
| `lib/og-generator.mjs` | `generateItineraryOgPng()` + peta warna kota gelap. |
| `server.js` | Rute `GET /og/itinerary/:slug/:packageId.png`; perluas rute SSR itinerary. |

Tidak ada perubahan skema database dan tidak ada migrasi.

### Helper baru: `lib/format-package-name.js`

```js
export function formatPackageTitle(raw)
```

Aturan, deterministik:

1. Kalau string mengandung huruf kecil, kembalikan apa adanya — itu nama tulisan
   manusia, jangan diutak-atik.
2. Kalau seluruhnya huruf besar, pecah per spasi lalu per token:
   - mengandung angka → biarkan (`1447`, `9H`, `12D`)
   - panjang ≤3 dan seluruhnya A–Z → biarkan huruf besar (`SV`, `GA`, `EK`, `TL`, `VIP`)
   - ada di daftar kata sambung `{BY, DAN, DI, KE, DARI}` → huruf kecil semua
   - selain itu → huruf pertama besar, sisanya kecil
3. Token pertama tidak pernah dikecilkan seluruhnya.

Contoh: `UMROH PLUS TURKI 12 HARI BY SV` → `Umroh Plus Turki 12 Hari by SV`.

Ditaruh di `lib/` karena dipakai server (`og-generator.mjs` dan `server.js`). Catatan:
berkas di `lib/` boleh diimpor frontend juga — `lib/teras-linkify.js` sudah begitu.

### `generateItineraryOgPng()`

Tanda tangan mengikuti kartu-kartu yang ada:

```js
export async function generateItineraryOgPng({
  paketName, departDate, airline, dayCount, segments, agentName, agentPhotoBuffer,
})
```

`segments` berbentuk `[{ key: CityKey, nights: number }]` — hasil
`computeNightSegments()` dari [`lib/itinerary-view.js:73`](../../../lib/itinerary-view.js)
setelah segmen `home` dibuang, persis seperti yang dilakukan `JourneyStrip`. Memakai
helper yang sama menjamin angka malam di kartu dan di halaman tidak pernah berbeda.

Semua teks bebas wajib lewat `escapeXml()` — bukan kosmetik: emoji yang lolos ke SVG
`<text>` membuat Pango gagal fatal dan **mematikan proses Express**, bukan melempar
exception. Sudah didokumentasikan di kepala `og-generator.mjs`.

#### Geometri (1200×630)

Kanvas 1200×630, margin kiri/kanan 56.

- **Latar**: gradien linear 145° `#4A0805` → `#8A0F0A`. Lingkaran emas `#D4AF37`
  opasitas 0.07, pusat (1160, 50) r 260; lingkaran `#FB7185` opasitas 0.07, pusat
  (70, 660) r 230.
- **Emblem**: halo radial `#F0DDA8` → transparan, kotak 356×356 di (806, 78), opasitas
  0.20. Di atasnya `kabah.png` diskalakan ke 364 lebar di (812, 74), opasitas 0.52.
- **Header**: logo `src/new-logo/new-logo-alhijaz-white.png` lebar 190, dikomposit di
  (56, 46) — logo yang sama dengan hero halamannya, bukan `src/logo-alhijaz-white.png`.
  Badge `ITINERARY` rata kanan: rect r9 di (1004, 48) ukuran 140×35, garis `#FFFFFF66`
  1.5px, teks 14px weight 800 letter-spacing 3 `#FFFFFFCC` baseline y=71.
- **Blok teks**, disusun **dari bawah ke atas** supaya judul 1 baris dan 2 baris
  sama-sama seimbang:
  - chips: atas y=336, tinggi 37
  - judul baris terakhir: baseline y=306; baris ke-i: `306 − 68×(n−i)`
  - eyebrow: baseline = baseline baris judul pertama − 66
- **Eyebrow**: `RENCANA PERJALANAN HARI PER HARI`, 15px weight 800, spasi huruf 3.4,
  `#D4AF37`.
- **Judul**: 60px weight 800, `line-height` 68, spasi huruf −1.4, putih. Dibungkus
  `wrapOgLines(nama, 60, 748, 2)` — helper yang sudah ada di `og-generator.mjs`.
  Lebar 748 (bukan 1088) supaya tidak menabrak emblem.
- **Chips**: tiga kapsul `#FFFFFF26` r10, padding 9/14, gap 10 — tanggal, maskapai,
  `{n} hari · {m} malam`. Ikon lucide dirender sebagai path SVG inline.
- **Strip segmen** (y 426, tinggi 16): kapsul r8, lebar proporsional terhadap malam,
  gap 8, total lebar 1088. Di bawahnya (baseline y≈478) label per segmen: titik 11px,
  nama kota 19px weight 700 putih, `{n} malam` 17px weight 500 `#FFFFFF99`.
- **Baris bawah** (y 528–584): avatar bulat 56px (garis emas 2px, monogram inisial
  kalau foto gagal) + nama agent 19px weight 700 + `KONSULTAN UMROH & HAJI PLUS`
  12px weight 700 `#F0DDA8`. Di kanan `alhijaz.co` 18px weight 700 `#FFFFFFB3`.

Komposit `sharp` dilakukan setelah SVG: logo, avatar, emblem. Tidak ada yang menimpa
teks, jadi urutan komposit bebas.

Opasitas emblem diterapkan lewat trik alfa standar — `sharp(kabah).resize(364)` lalu
`.composite([{ input: <svg><rect fill="#ffffff85"/></svg>, blend: 'dest-in' }])`.
`sharp` tidak punya properti opacity pada composite.

Keluaran PNG, konsisten dengan tiga kartu lain.

### Rute `GET /og/itinerary/:slug/:packageId.png`

Didaftarkan di `server.js` bersebelahan dengan `/og/flight/:code.png` — **sebelum**
middleware static, supaya setiap permintaan bot tidak membakar `stat` filesystem.

1. Validasi: slug `^[a-z0-9-]{1,64}$`, packageId `^[A-Za-z0-9-]{3,32}$`. Gagal → 404.
2. `resolveSlug(slug)` → 404 kalau tidak dikenal. Redirect slug diabaikan (bot
   mengikuti `og:image` apa adanya; SSR sudah memakai slug kanonik).
3. Ambil `jadwal_nama, berangkat_tgl, maskapai` dari `umroh_schedules`.
4. `getItineraryContext(packageId)` → `days`. Kosong → **404** (lihat fallback).
5. `computeNightSegments(days)`, buang `home`.
6. `loadAgentPhotoBuffer(agent.photo, agent.slug)`.
7. `Cache-Control: public, max-age=3600`, sama dengan kartu lain.

Gagal render → 500 `text/plain`, dicatat `console.error`, sama seperti rute OG lain.

### Perluasan rute SSR itinerary

[`server.js:21213`](../../../server.js). Query sekarang hanya mengambil `jadwal_nama`;
diperluas ke `jadwal_nama, berangkat_tgl, maskapai, itinerary_source_sha256`.

Tag yang ditambahkan: `og:image` + `og:image:width` 1200 + `og:image:height` 630 +
`og:image:type` `image/png`, `og:type` `article`, `link rel=canonical`,
`twitter:card` `summary_large_image`, `twitter:title`, `twitter:description`,
`twitter:image`.

> **Jebakan:** `index.html` **tidak punya** `og:image`, jadi pola `.replace(/og:image/…)`
> akan gagal diam-diam dan tag tidak pernah muncul. Tag-tag ini harus **disisipkan**
> sebelum `</head>`, mengikuti cara `renderBioPageHtml()` di
> [`server.js:21107`](../../../server.js), bukan di-replace seperti empat tag yang
> sudah ada di rute ini.

### Cache & invalidasi

Bot menyimpan preview per-URL. Kalau itinerary di-resync dan kartunya berubah, URL
yang sama akan tetap menampilkan gambar lama sampai cache bot kedaluwarsa — bisa
berminggu-minggu.

Karena itu `og:image` diberi query versi:

```
{origin}/og/itinerary/{slug}/{packageId}.png?v={itinerary_source_sha256 8 karakter}
```

`itinerary_source_sha256` sudah ada di `umroh_schedules` dan sudah jadi penanda
kebasian di pipeline sync itinerary. Kalau kolomnya kosong, `?v=` dihilangkan.

## Copy

Dengan `nama = formatPackageTitle(jadwal_nama)`:

**Title** (`<title>`, `og:title`, `twitter:title`):

```
Itinerary {nama} — Alhijaz Indowisata
```

**Description** (`description`, `og:description`, `twitter:description`), disusun
bertahap dan dipotong dari belakang kalau melewati 160 karakter:

```
Rencana perjalanan hari per hari: {segmen}. Berangkat {tgl} dengan {maskapai}. Bersama {agent} — Alhijaz Indowisata.
```

- `{segmen}` = `Madinah 3, Mekkah 4, Dubai 2 malam`
- `{tgl}` = `12 Maret 2027` (`toLocaleDateString('id-ID')`, sudah dipakai `SharePage`)

Urutan pembuangan kalau >160 karakter: klausa maskapai dulu, lalu klausa segmen,
lalu `— Alhijaz Indowisata`. Klausa agent tidak pernah dibuang — itu satu-satunya
tempat nama agent muncul di teks meta setelah D7.

Kalau segmen tidak tersedia, klausa segmen diganti `{n} hari perjalanan`.

## Fallback berjenjang

| Kondisi | Kartu | Meta |
|---|---|---|
| Itinerary terparsing, segmen valid | Kartu penuh | Deskripsi penuh |
| `computeNightSegments` → `null` | Strip diganti satu baris `Rencana perjalanan {n} hari` di posisi yang sama | Klausa segmen diganti `{n} hari perjalanan` |
| Itinerary belum terparsing | Rute PNG 404 | **`og:image` tidak disuntik sama sekali** |
| Jadwal tak ditemukan | Rute PNG 404 | `nama` jatuh ke `packageId` (perilaku sekarang) |
| Foto agent gagal dimuat | Monogram inisial | — |

Kasus kedua nyata, bukan teoretis: `computeNightSegments` mengembalikan `null` kalau
>30% lokasi harian tak dikenali, atau kalau hari <2.

Kasus ketiga sengaja tidak menyuntik `og:image`: link tanpa gambar lebih baik daripada
link dengan gambar rusak, dan halamannya sendiri memang menampilkan "Itinerary belum
tersedia".

## Rawan

1. **Warna Turki.** Kalau `CITY_HEX` dipakai langsung, segmen Turki hilang di latar
   burgundy. Peta gelap D4 wajib.
2. **Emoji di `jadwal_nama` atau nama agent** mematikan proses Express, bukan melempar
   exception. `escapeXml()` sudah jadi choke point — jangan menulis teks bebas ke SVG
   tanpa melewatinya.
3. **`.replace()` untuk `og:image`** gagal diam-diam karena tagnya tidak ada di
   `index.html`. Harus disisipkan.
4. **`toTitleCase` portal-jamaah** merusak kode maskapai. Pakai `formatPackageTitle`.
5. **`server.js` tidak hot-reload.** Rute baru butuh restart; kalau tidak, `/og/itinerary/…`
   akan 404 diam-diam dan mudah salah didiagnosis sebagai bug validasi. Bedakan 404
   rute-tidak-ada dari 404 data-tidak-ada lewat `curl -i`.
6. **Urutan pendaftaran rute.** `/og/itinerary/...` harus sebelum static, seperti tiga
   rute `/og/*` lainnya.

## Verifikasi

Cepat dan deterministik (uji end-to-end diserahkan ke user):

- `node --check server.js`, `node --check lib/og-generator.mjs`, `node --check lib/format-package-name.js`
- Unit test `formatPackageTitle`: huruf besar semua, campuran, token angka, kode maskapai, kata sambung
- Unit test perakitan deskripsi: batas 160 karakter dan urutan pembuangan klausa
- Skrip sekali jalan yang memanggil `generateItineraryOgPng()` dengan data contoh dan
  menulis PNG ke scratchpad — periksa mata untuk 1 baris judul, 2 baris judul, 2 segmen,
  5 segmen, tanpa segmen, tanpa foto agent
- `npm run build`

Checklist manual untuk user:

- Buka `/{slug}/{packageId}/itinerary` lalu lihat sumbernya — pastikan `og:image`,
  `canonical`, dan `twitter:*` ada dan absolut
- Tempel URL-nya di Facebook Sharing Debugger dan kirim ke satu chat WhatsApp
- Buka `/og/itinerary/{slug}/{packageId}.png` langsung di browser
- Cek jadwal yang itinerary-nya belum terparsing: pastikan tidak ada `og:image`
