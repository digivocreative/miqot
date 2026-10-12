# Spec: Banner Share Cuaca — tombol Share di widget "Cuaca Kota Tujuan"

**Tanggal:** 2026-10-12
**Status:** Disetujui per bagian di chat (brainstorm); menunggu tinjauan spec tertulis
**Mockup:** `~/Downloads/cuaca-share/cuaca-share.pen` — frame **C2** (acuan utama, Mekkah) dan **C3**
(kota tanpa foto, Hainan). Frame A, B, C = arah visual yang tidak dipilih.
**Area:** `src/components/CuacaWidget.tsx`, `src/components/ShareCuacaModal.tsx` (baru),
`src/components/cuaca-share/CuacaShareTemplate.tsx` (baru), `src/cuaca-share-entry.tsx` (baru),
`lib/cuaca-share-data.js` (baru, + `.d.ts`), `lib/weather-cities.js` (baru),
`lib/weather-seasonal-notes.js` (baru), `lib/cuaca-share-render.js` (baru),
`lib/cuaca-share-cache.mjs` (baru), `lib/headless-render.js` (baru, diangkat dari `lib/card-export.js`),
`server.js`, `src/components/DashboardLayout.tsx`, aset `public/cuaca-share/*.jpg`

## 1. Masalah

Agent sudah bisa membagikan banner "Kurs Hari Ini" bermerek dirinya. Widget "Cuaca Kota Tujuan"
punya data yang sama menariknya (suhu, kondisi, prakiraan 3 hari, catatan musim) tapi tidak bisa
dibagikan: agent harus screenshot layar sendiri, hasilnya tanpa identitas agent dan tidak rapi.

## 2. Keputusan yang diambil saat brainstorm

| Pertanyaan | Keputusan |
|---|---|
| Tujuan banner | Satu desain untuk calon jamaah **dan** jamaah yang akan berangkat: cuaca hari ini + prakiraan 3 hari + catatan musim. |
| Ukuran | **4:5, 1080×1350** saja (feed IG/FB, grup WA). Tidak ada pilihan ukuran. |
| Arah visual | **C2 · Seri Kurs + ornamen**: latar hijau tua Alhijaz seperti banner Kurs, judul "Cuaca Hari Ini", foto kota sebagai kartu, pola khatam (bintang-8) + roset bunga Kurs. |
| Situs di profil agent | `alhijaz.co/{slug}` (bukan field `website`). |
| Foto kota | Foto rombongan Alhijaz yang sudah ada (foto destinasi Bunny), dipotong agar badge logonya hilang. Hainan tanpa foto → panel pola (C3). |
| Saluran | **Tombol Share di dashboard saja.** Tanpa broadcast Telegram. |
| Cara membuat gambar | **Render di server dari komponen React yang sama** (pola `lib/card-export.js`): satu sumber desain untuk pratinjau dan berkas. |

**Di luar cakupan (sengaja):** broadcast Telegram harian, ukuran lain (Story/landscape), memilih
kota di dalam sheet, halaman share publik/OG, varian warna per kondisi cuaca, perubahan pada
banner Kurs.

## 3. Arsitektur

```
CuacaWidget (tab kota aktif) ──Share──▶ ShareCuacaModal
                                         ├─ pratinjau: <CuacaShareTemplate {...props}/> (diskalakan)
                                         └─ GET /api/weather/share-image?city=makkah ─▶ blob JPEG
                                                                                       ├ Download
                                                                                       ├ Bagikan (navigator.share)
                                                                                       └ Salin Caption (teks, tanpa server)

server: /api/weather/share-image
  req.user.id → getAgentById → identitas agent
  weatherMemory/weather_cache → data kota
  buildCuacaShareProps(weather, agent, {syncedAt}) ── lib/cuaca-share-data.js (murni)
  getOrCreateCuacaShareImage(...) ── lib/cuaca-share-cache.mjs (disk + in-flight dedupe)
      └ renderCuacaShareJpeg(props) ── lib/cuaca-share-render.js
            esbuild bundle src/cuaca-share-entry.tsx → Playwright Chromium → JPEG 1080×1350
```

Prinsip: **`CuacaShareTemplate` bodoh** — hanya menerima props jadi (string, angka, kunci ikon,
`src` gambar). Semua logika (ikon, label, tanggal lokal, catatan musim, subjudul, caption) ada di
`lib/cuaca-share-data.js`, dipakai klien (pratinjau, caption) dan server (render) sehingga
keduanya identik.

## 4. Komponen

### 4.1 `lib/weather-cities.js` (baru)
`WEATHER_CITIES` dipindah apa adanya dari `server.js` (key, name, country, flag, lat, lon, tz).
`server.js` mengimpornya. Ditambah tabel turunan yang dipakai banner:

| key | foto (`public/cuaca-share/`) | subjudul |
|---|---|---|
| makkah | `makkah.jpg` (Masjidil Haram) | umroh |
| madinah | `madinah.jpg` (Masjid Nabawi) | umroh |
| istanbul | `istanbul.jpg` (Blue Mosque) | wisata |
| cappadocia | `cappadocia.jpg` (balon udara) | wisata |
| dubai | `dubai.jpg` (Burj Khalifa) | wisata |
| hainan | — (panel pola) | wisata |

Subjudul: `umroh` → "Update cuaca kota tujuan umroh", `wisata` → "Update cuaca kota tujuan wisata".

### 4.2 `lib/weather-seasonal-notes.js` (baru)
`SEASONAL_NOTES` dipindah apa adanya dari `CuacaWidget.tsx`; widget mengimpornya. Satu sumber
teks untuk widget dan banner.

### 4.3 `lib/cuaca-share-data.js` (baru, murni, + `.d.ts`)
- `weatherIconKey({ weatherCode, icon })` → kunci ikon (`sun`, `cloud-sun`, `cloud`, `cloud-fog`,
  `cloud-drizzle`, `cloud-rain`, `snowflake`, `cloud-lightning`). Pakai `weatherCode` bila ada
  (ambang sama dengan `wmoMap`), jatuh ke pemetaan emoji untuk data cache lama.
- `uvLabelFull(label)` → "Sgt Tinggi" jadi "Sangat Tinggi"; lainnya apa adanya.
- `cityLocalDate(syncedAt, tz)` → `{ dateKey, monthIndex, label: 'Senin, 12 Okt 2026' }` pada zona
  waktu **kota**, bukan WIB.
- `buildCuacaShareProps(city, agent, { syncedAt })` → props lengkap template: kota, negara,
  subjudul, `photoKey` (atau `null`), suhu, kondisi + kunci ikon, terasa, min–maks, lembap, angin,
  UV, 3 prakiraan (hari, kunci ikon, min/maks), catatan musim (bulan lokal kota), tanggal, agent
  (`name`, `initials`, `photoUrl`, `siteLabel: 'alhijaz.co/{slug}'`).
- `buildCuacaCaption(props, agent)` → teks caption (lihat §6). Baris `wa.me/…` dihilangkan bila
  agent tidak punya nomor; nomor dinormalkan dengan aturan yang sama dengan `normalizeWaNumber`.

### 4.4 `src/components/cuaca-share/CuacaShareTemplate.tsx` (baru)
Kanvas tetap **1080×1350 CSS px**, mengikuti frame C2/C3:
1. Header: "Cuaca Hari Ini" (Inter 800, 76px) + subjudul (mint `#A7F3D0`); logo putih kanan atas.
2. Kartu foto 952×400, radius 32: foto kota (`object-fit: cover`) + gradasi bawah + pil
   `[pin] Mekkah  Arab Saudi`. Tanpa foto → latar pola khatam padat + ikon cuaca besar emas (C3).
3. Suhu besar (230px) + ikon & label kondisi emas `#F8DFA1` + garis emas "terasa X° · min–maks°".
4. Statistik sebaris: lembap, angin, UV + label.
5. Panel prakiraan: 3 hari (hari emas, ikon, min/maks) + pemisah + catatan musim.
6. Panel agent: avatar (foto atau inisial, cincin emas), nama + centang biru, `alhijaz.co/{slug}`,
   pil tanggal.
- Latar: gradasi hijau Kurs (`#0F6E56 → #0A5644 → #054233`) + lapisan ornamen **SVG inline**:
  pola khatam (tile 120, dua persegi r46, garis mint/emas) ber-mask radial yang paling kuat di kanan
  atas lalu memudar, roset bunga Kurs besar di kanan tengah (opacity .16) dan kecil di kiri bawah
  (.10). Tidak ada berkas gambar untuk ornamen.
- Ikon: `lucide-react` (SVG). **Tidak ada emoji** di banner (generator server tak punya font emoji).
- Teks panjang: nama agent satu baris — 34px untuk ≤22 karakter, 30px untuk 23–28, 26px untuk >28,
  lalu dipotong `…` bila masih melebihi lebar; label kondisi terpanjang
  ("Cerah berawan", "Badai petir") dan suhu minus harus muat tanpa patah baris.

### 4.5 `src/cuaca-share-entry.tsx` + `lib/cuaca-share-render.js` (baru)
Meniru `src/card-export-entry.tsx` + `lib/card-export.js`: props disuntik lewat
`window.CUACA_RENDER`, entry merender template ke `#banner`, menunggu `document.fonts.ready` +
semua `<img>`, lalu `window.__ready = true`. Render: viewport 1080×1350, `deviceScaleFactor: 1`,
element-screenshot **JPEG quality 88**.
- Foto kota dibaca dari `public/cuaca-share/{key}.jpg` dan disuntik sebagai data URI.
- Foto agent diambil di Node hanya dari host yang diizinkan (daftar sama dengan kartu nama),
  `https` saja, timeout 4 detik; gagal → inisial.
- `lib/headless-render.js` (baru): **satu antrean render** dan pembuat CSS font tersemat diangkat
  dari `lib/card-export.js` lalu dipakai keduanya — kartu nama dan banner cuaca tidak pernah
  merender bersamaan di VPS kecil. Perilaku kartu nama tidak berubah.

### 4.6 `lib/cuaca-share-cache.mjs` (baru)
Pola `lib/kurs-share-cache.mjs`, modul terpisah (Kurs tidak disentuh):
- Lokasi `data/cuaca-share-cache/YYYY-MM-DD/{slug}-{city}-{sha16}.jpg`.
- Kunci sha256 dari: `CUACA_SHARE_TEMPLATE_VERSION` (`'c2-v1'`), key kota, `syncedAt` cuaca,
  `name`, `phone`, `photo`, `slug` agent.
- TTL 2 hari, batas folder 256 MB (tertua dihapus dulu), permintaan identik yang sedang berjalan
  berbagi satu render.
- Dibersihkan bersama Kurs: saat startup dan cron 03:30 WIB yang sudah ada.

### 4.7 Endpoint `GET /api/weather/share-image?city={key}` (`server.js`)
- `authMiddleware`. Identitas agent dari `getAgentById(req.user.id)` — **tidak pernah** dari query.
- `city` wajib ada di `WEATHER_CITIES` → selain itu **400**.
- Data dari `weatherMemory` (muat ulang dari `weather_cache` bila basi, sama dengan
  `/api/weather/cities`); tidak memanggil Open-Meteo. Kota tanpa data → **404**; cuaca belum
  tersedia sama sekali → **503**.
- Sukses: `image/jpeg`, `Cache-Control: no-store`, `Content-Disposition: inline;
  filename="cuaca-{city}-{yyyymmdd}.jpg"`, `X-Cuaca-Image-Cache: HIT|MISS`.
- Gagal render → **500** + `Sentry.captureException`.
- Proxy Vite `/api/weather` sudah ada; tidak perlu entri baru.

### 4.8 Data cuaca (`fetchCityWeather` di `server.js`)
Tiap item `forecast` ditambah `weatherCode: daily.weather_code[i + 1]`. Data lama di cache tetap
jalan lewat pemetaan emoji di `weatherIconKey` sampai cron 3 jam berikutnya menimpanya.

### 4.9 `src/components/ShareCuacaModal.tsx` (baru) + `CuacaWidget.tsx`
- Header widget jadi `flex justify-between`: judul + **pil Share** (gaya sama dengan pil Share Kurs),
  tampil hanya bila kota aktif punya data.
- `CuacaWidget` menerima prop `agent` (`name`, `phone`, `photo`, `slug`) dari `DashboardLayout`
  (sumber sama dengan `ShareKursModal`).
- `ShareCuacaModal` (lazy) meniru `ShareKursModal`: judul "Bagikan Cuaca", pratinjau template
  diskalakan ke lebar layar, tombol **Download**, **Bagikan** (hanya perangkat sentuh dengan
  `navigator.share` berkas; pola tap-kedua iOS "Bagikan sekarang" dipakai ulang), **Salin Caption**.
- Saat dibuka: pratinjau langsung tampil; blob JPEG diambil di latar. Download/Bagikan nonaktif +
  label "Menyiapkan gambar…" sampai blob siap. Gagal → pesan "Gagal membuat gambar" + tombol
  **Coba lagi**; pratinjau dan Salin Caption tetap bisa dipakai.
- Nama berkas unduhan: `cuaca-{city}-{yyyymmdd}.jpg`.

### 4.10 Aset `public/cuaca-share/*.jpg`
Lima foto dibuat sekali oleh `scripts/prepare-cuaca-photos.mjs` dari foto destinasi Bunny
(`foto-destinasi/{masjidil-haram,masjid-nabawi,blue-mosque,balon-udara-cappadocia,burj-khalifa}.png`):
potong area badge logo di atas, rasio kartu ±2,38, JPEG ±150 KB, lalu di-commit. Berkas `.jpg` di
`public/` **tidak** cocok dengan `PRECACHE_GLOB_PATTERNS` (`assets/**/*.{js,css,png,svg,webp}`, ikon,
font) sehingga tidak masuk precache service worker.

## 5. Analytics

| Event | Kategori | Parameter |
|---|---|---|
| `open_share_cuaca` | feature | `city` |
| `download_share_cuaca` | action | `city` |
| `share_cuaca` | action | `city` |
| `copy_cuaca_caption` | action | `city` |

Wajib didaftarkan di `FEATURE_LABELS` / `ACTION_LABELS` di `server.js` (event tak terdaftar dibuang
diam-diam). Bukan `VALID_PUBLIC_EVENTS` — ini event agent login.

## 6. Caption

```
🌤️ Cuaca Mekkah hari ini — Senin, 12 Okt 2026
31°C Cerah (terasa 33°C) · 27–38°C
Oktober nyaman untuk siang — mulai cocok aktivitas di luar.

Info paket Umroh & Haji:
Bagas Pramudita
wa.me/62812xxxxxxx
alhijaz.co/bagas
```
Emoji di caption boleh (teks WA, bukan gambar). Baris `wa.me` hilang bila agent tak punya nomor.

## 7. Penanganan galat

| Kondisi | Perilaku |
|---|---|
| Kota aktif belum punya data | Pil Share tidak tampil |
| `city` tak dikenal | 400 |
| Kota tanpa data / cuaca belum tersedia | 404 / 503 → modal: "Gagal membuat gambar" + Coba lagi |
| Foto agent gagal diambil | Inisial (render tetap jalan) |
| Render Chromium gagal / timeout | 500 + Sentry → modal: "Gagal membuat gambar" + Coba lagi |
| Data cuaca basi (cron telat) | Tetap dirender; tanggal di banner = tanggal data, bukan hari ini |

## 8. Pengujian

**Otomatis (`node --test`):**
- `lib/cuaca-share-data.js`: kode cuaca → ikon (+ jalur emoji lama); "Sgt Tinggi" → "Sangat
  Tinggi"; subjudul umroh/wisata; `cityLocalDate` di zona kota (kasus 23.00 WIB = masih hari yang
  sama di Mekkah; pergantian bulan memilih catatan musim bulan lokal); Hainan → `photoKey` null;
  caption tanpa baris `wa.me` bila nomor kosong; `siteLabel` = `alhijaz.co/{slug}`.
- `lib/cuaca-share-cache.mjs`: kunci berubah saat `syncedAt` / foto agent berubah, sama untuk input
  sama; dedupe in-flight; pembersihan TTL & batas ukuran (meniru `tests/kurs-share-cache.test.js`).
- Validasi kota endpoint: tak dikenal → 400, tanpa data → 404 (fungsi validasi murni).
- Penjaga sumber: keempat event terdaftar di label server; `public/cuaca-share/*.jpg` tidak cocok
  pola precache; endpoint membaca identitas dari `req.user`, bukan `req.query`; `CuacaWidget`
  mengimpor `SEASONAL_NOTES` dari modul bersama (tidak ada salinan kedua).

**Uji render (manual, butuh Chromium):** `scripts/test-cuaca-image.mjs` (pola
`scripts/test-kurs-image.mjs`) menulis 3 JPEG ke `/tmp`: (1) Mekkah normal + foto agent;
(2) Hainan tanpa foto + agent tanpa foto; (3) nama agent sangat panjang + "Cerah berawan" + suhu
minus Cappadocia.

**Gerbang sebelum serah terima:** `node --check server.js`, typecheck berkas yang disentuh,
`vite build`, tes unit terkait, skrip render di atas.

**Checklist manual (user):** Share di keenam kota; Download di desktop; Bagikan di iPhone (termasuk
tap kedua); Salin Caption → tempel di WA; akun agent tanpa foto; event muncul di dashboard analytics.

## 9. Risiko & catatan

- **Wajah jamaah di foto.** Foto rombongan sudah tampil publik di itinerary; banner menyebarkannya
  lebih luas lewat agent. Diterima user (opsi A) — bila ada keberatan jamaah, ganti berkas di
  `public/cuaca-share/` tanpa ubah kode.
- **Beban server.** Render ±2–4 dtk (Chromium diluncurkan per render, satu antrean bersama kartu
  nama). Cache per agent×kota×sinkron cuaca membuat render ulang hanya terjadi setelah cron 3 jam
  atau saat profil agent berubah.
- **Deploy:** butuh `deploy.sh` + restart `server.js` (endpoint baru, cron pembersihan, label
  analytics). Server basi = pil Share tetap tampil tetapi gambar gagal (404 HTML/500).
