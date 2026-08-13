# Itinerary PDF "versi kita" — desain

Tanggal: 2026-08-13
Status: disetujui (brainstorming + 3 putaran mockup di Pencil)

## 1. Masalah

Agent hanya punya satu dokumen itinerary untuk dikirim ke calon jamaah: **PDF kantor**
(`paket.itineraryUrl`). Dokumen itu dibuat untuk arsip internal — tata letaknya padat,
tanggalnya kadang salah, terminal kedatangannya menyesatkan, dan tidak memuat apa pun
yang kita tahu sendiri (foto rombongan, koreksi tanggal, hotel, harga, kontak agent).

Sementara itu kita sudah punya **tampilan web itinerary** di `/:slug/:jadwalId/itinerary`
yang jauh lebih baik — tapi hanya hidup sebagai halaman. Yang tidak bisa dilakukan
halaman: dikirim sebagai lampiran WhatsApp, dibuka tanpa sinyal, atau disimpan jamaah.

Fitur ini menerbitkan tampilan web itu sebagai PDF.

## 2. Keputusan yang mengunci desain

| # | Keputusan | Alasan |
|---|---|---|
| D-1 | Pemegang utama = **calon jamaah (prospek)**, alat jualan agent | dipilih user; bukan bekal perjalanan H-7 |
| D-2 | Harga masuk, **ringkas**: "mulai dari" per tier, satu blok | prospek selalu bertanya; Quotation tetap dokumen resmi per-pax |
| D-3 | Halaman **400 × 800 px (≈106 × 212 mm)**, potret | separuh lebar A4. Di layar HP 390 pt: A4 mengecil 0,70×, A5 0,93×, ukuran ini **membesar 1,3×** → teks 8pt tampil ~10pt tanpa zoom |
| D-4 | Struktur = **cetakan tampilan web apa adanya** | permintaan user; juga menghapus risiko dua desain yang saling menyimpang |
| D-5 | Foto destinasi menempel **di dalam baris aktivitasnya**, bukan galeri terpisah | sama seperti `DestinasiPhoto` di `DayRail` |
| D-6 | Nama dokumen **"Rencana Perjalanan"**; PDF kantor tetap "Itinerary PDF" | dua tombol bernama sama membingungkan |
| D-7 | Tombol unduh mengikuti tab aktif di `ItineraryModal` | tab Itinerary → PDF kita, tab Preview PDF → PDF kantor. Tanpa tombol ketiga di footer yang sudah sempit |
| D-8 | Sisa seat **tidak** dimuat | basi dalam hitungan hari begitu PDF di-forward di WA |

Ditolak eksplisit di sepanjang brainstorming: A4 (terlalu lebar), A5 (masih terlalu
lebar), tata letak dua kolom / grid kartu (mustahil di lebar 352 px area isi), dan
transkrip jam versi "majalah" satu halaman.

## 3. Bentuk dokumen

Lebar isi 376 px (halaman 400 − kartu `mx-3` 12 px di tiap sisi). Halaman web adalah
375 px dengan isi 351 px, jadi **seluruh nilai piksel web dipakai langsung tanpa
penskalaan**: teks aktivitas 13,5 px, rail di x=61,5, kolom jam 44 px, kartu
`cornerRadius 16` border `#EAE2D8`, panel momen `#FBF6E6`.

Urutan halaman:

1. **Sampul** — hero burgundy `linear-gradient(145deg,#4A0805,#8A0F0A)` + pola geometri
   islami (rub el hizb, stroke putih 4,5%), logo, badge `ITINERARY`, nama paket 17px
   bold, tiga pil (tanggal berangkat · maskapai · jumlah hari). Lalu kartu Hari 1.
2. **Hari 2 … N** — satu kartu per hari, mengalir. Header berjalan (versi ramping hero)
   di tiap halaman lanjutan, kaki bernomor `n / total`.
3. **Penutup** — kartu Penerbangan, kartu Hotel, kartu **Harga** (baru), kartu
   **agent + QR** (baru), lalu catatan "Jadwal dapat berubah menyesuaikan kondisi di
   lapangan."

Paket 9 hari (JBU1504) menghasilkan **±8 halaman**. Itu konsekuensi wajar dari D-3:
di HP orang menggeser, bukan mengecilkan.

## 4. Isi & sumber data

| Blok | Sumber | Catatan |
|---|---|---|
| Nama paket, maskapai, tanggal | `UmrohPackage` | |
| Hari, judul, lokasi, aktivitas | `itineraries.content` via `/api/itinerary/:id` | |
| Tanggal per hari | `itineraryDayDates()` | ditambatkan ke `dayNumber`, **bukan** indeks array |
| Koreksi Terminal 3→2 | `rewriteHomeArrivalTerminal()` | wajib dijalankan sebelum semua turunan |
| Klasifikasi momen + ikon + badge | `classifyActivity()`, `activityIconName()` | `TITIK KUMPUL`/`TAKE OFF`/`LANDING`/`TRANSIT`/`PERJALANAN BUS`/`KERETA CEPAT` |
| Penebalan nama tempat | `splitImportantPlaces()` | dirender sebagai `<Text>` bersarang |
| Foto per aktivitas | `destinationPhotosForDays()` | dedup global: satu foto sekali per itinerary |
| Bendera negara | `cityKeysInOrder()` + `CITY_FLAG` | PNG di `public/flags/` |
| Ringkasan malam per kota | `computeNightSegments()` | **boleh null** — lihat T-1 |
| Hotel + bintang | `paket.hotel` via `tierHotelInfo` | |
| Penerbangan | `paket.keberangkatan/kepulangan` + `extractArrivalTimes()` | lihat T-2, T-3 |
| Harga | `listPackageTiers()` + `tierStartingPrice()` | lihat T-4 |
| Agent | `AGENTS_DATA[slug]` | |
| QR | `qrcode` (sudah ada di dependencies) | menuju `/:slug/:jadwalId/itinerary` |

Semua modul di atas **sudah ada dan sudah teruji**. Tidak ada logika parsing baru.

## 5. Empat temuan dari data sungguhan (JBU1504) & keputusannya

Diverifikasi dengan menjalankan aplikasi dan membuka halaman share aslinya.

**T-1 — "Ringkasan Perjalanan" bisa tidak ada.**
`computeNightSegments()` mengembalikan `null` untuk JBU1504 (>30% lokasi harian tak
terpetakan) sehingga `JourneyStrip` tidak dirender sama sekali di web.
→ **Keputusan:** PDF ikut fail-closed. Blok ringkasan hanya muncul bila segmennya ada;
tidak ada placeholder, tidak ada teks pengganti. Sampul tetap utuh tanpanya.

**T-2 — Jam pulang menampilkan `JED 16.00 → CGK 16:00`.**
`pulang_jam` di jadwal ternyata berisi jam **tiba** di Jakarta, bukan jam berangkat dari
Jeddah; jam tiba sendiri diambil dari itinerary. Hasilnya dua angka identik, sudah
tampil begitu di web hari ini.
→ **Keputusan:** di PDF, jam tiba **disembunyikan bila sama dengan jam berangkat**.
Aturan ini murni tampilan (fail-closed: lebih baik hilang daripada salah) dan tidak
mengubah data. Perbaikan di sisi web dan di hulu jadwal dicatat sebagai tugas terpisah.

**T-3 — Pemisah jam tidak konsisten.**
`15.50` (dari jadwal, memakai titik) bersebelahan dengan `21:15` (dari itinerary,
memakai titik dua) di satu baris kartu penerbangan.
→ **Keputusan:** normalisasi ke `HH:MM` di PDF via helper murni. Hanya mengganti
pemisah — tidak menambah/membuang digit, dan string yang tak berpola dibiarkan apa
adanya.

**T-4 — Tier bisa cuma satu.**
JBU1504 hanya menjual `HEMAT`. Kartu hotel di web juga tidak pernah menampilkan jarak
(hanya nama + bintang), meski `mekkah_jarak`/`madinah_jarak` ada di tipe.
→ **Keputusan:** blok harga merender 1..n tier apa adanya; dengan satu tier ia jadi satu
baris "mulai dari" plus baris kecil tipe kamar lain. Jarak hotel **tidak** dimasukkan —
mengikuti desain kartu hotel yang ada (D-4).

## 6. Arsitektur

Modul baru — tiga berkas, masing-masing satu tanggung jawab:

```
lib/itinerary-pdf.js            logika murni, tanpa dependensi, bisa diuji di node
src/components/ItineraryDocument.tsx   dokumen @react-pdf/renderer (render saja)
src/utils/itineraryPdfBlob.ts   perakit: ambil foto → kanvas → JPEG → pdf().toBlob()
```

`lib/itinerary-pdf.js` berisi dan hanya berisi:

- `normalizeJam(raw)` — `"15.50"` → `"15:50"`; `""`/tak berpola → apa adanya (T-3)
- `flightLegView(paket, arrivals)` — dua leg siap render; `jamTiba` `null` bila sama
  dengan `jam` setelah normalisasi (T-2)
- `priceRows(paket)` — `[{tier, mulaiDari, kamar:[{label, harga}]}]`, terurut termurah
  dulu; `[]` bila tak ada tier terjual (T-4)
- `canRenderItineraryPdf(content, paket)` — gerbang fail-closed: `false` bila `days`
  kosong **atau** `itineraryDayDates()` mengembalikan semua `null`

Tidak ada di modul ini: pemilihan foto, klasifikasi aktivitas, penebalan tempat — semua
sudah punya rumahnya sendiri dan dipakai ulang.

## 7. Foto: pipeline webp → kanvas → JPEG

`@react-pdf/renderer` **tidak bisa membaca WebP**, sedangkan derivatif yang dipakai web
(`/foto-destinasi/web/*.webp`, 40–120 KB) semuanya WebP. Master PNG-nya ada
(`/foto-destinasi/*.png`) tapi 300–700 KB per berkas — sepuluh foto berarti PDF ~5 MB.

→ Ambil **derivatif webp**, gambar ke `<canvas>`, ekspor `image/jpeg` kualitas 0,82 pada
lebar maksimum 800 px. Ini pola yang sudah dipakai foto agent di
`generateQuotationPdfBlob` (react-pdf juga tak bisa membaca JPEG progresif). Bunny sudah
mengirim `access-control-allow-origin: *`, jadi kanvas tidak ter-taint.

Foto yang gagal dimuat **dilewati diam-diam** — satu foto hilang tidak boleh
menggagalkan seluruh dokumen.

## 8. Paginasi & jebakan react-pdf

- Kartu hari memakai `wrap` (boleh terpotong antar halaman) karena kartu hari yang
  panjang — Hari 3 dan Hari 6 JBU1504 — melebihi satu halaman. Blok foto memakai
  `wrap={false}` supaya gambar tidak pernah terbelah.
- Header berjalan & kaki bernomor memakai `fixed` pada `<View>`, dengan
  `render={({pageNumber, totalPages}) => ...}` untuk nomor halaman.
- Emoji **tidak** ter-render; `★` aman (Inter punya glyph-nya) — dipakai untuk bintang
  hotel. Bendera negara memakai `<Image>` PNG, bukan emoji.
- Font: cukup **Inter Regular + Bold** yang sudah di-self-host di `/fonts/`. Hero web
  memakai bold sans, bukan serif — jadi Calistoga tidak diperlukan.
- `Font.registerHyphenationCallback(w => [w])` wajib, sama seperti dokumen lain.

## 9. Titik pemicu

`ItineraryModal` (sisi agent) — tombol unduh di footer mengikuti tab aktif (D-7):

- tab **Itinerary** → `generateItineraryPdfBlob()` → share sheet / unduh
- tab **Preview PDF** → perilaku lama, PDF kantor

Nama berkas: `rencana-perjalanan-<jadwalId>.pdf`.

Halaman share publik menyusul di iterasi berikutnya — bukan bagian rilis ini.

## 10. Pengujian

Unit (node, cepat, deterministik) di `tests/itinerary-pdf.test.js`:

- `normalizeJam`: `"15.50"`→`"15:50"`, `"21:15"`→`"21:15"`, `""`→`""`, `"-"`→`"-"`
- `flightLegView`: jam tiba sama → `jamTiba` `null` (T-2); beda → tetap tampil
- `priceRows`: satu tier, banyak tier terurut, tier `N/A` dibuang
- `canRenderItineraryPdf`: `days` kosong → `false`; penomoran hari tak sepakat dengan
  jadwal → `false`

Verifikasi manual (daftar untuk user, tidak dijalankan otomatis): buka modal itinerary
JBU1504 → unduh dari tab Itinerary → periksa 8 halaman, foto muncul, tidak ada halaman
yatim, nomor halaman benar.

## 11. Di luar lingkup

- Tombol di halaman share publik
- Perbaikan `pulang_jam` di hulu jadwal (T-2) dan di kartu penerbangan web
- Jarak hotel (T-4)
- Cetak fisik: ukuran 400×800 bukan standar kertas; muat 2-up di A4 landscape bila perlu
