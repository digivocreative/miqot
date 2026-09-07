# Rail Desktop Halaman Jadwal — Design

**Tanggal:** 2026-09-07
**Pemicu:** Feedback user — di tablet/desktop lebar, halaman jadwal publik "terkesan ada ruang
kosong di kanan/kiri"; ingin tidak sepi dan terlihat menarik & profesional **saat agent
menjelaskan paket ke calon jamaah**.
**Arah terpilih:** rail kiri = itinerary, rail kanan = detail bertab. Dipilih user dari mockup
di `AsoyCok.pen` (3 arah rail kanan × 3 arah rail kiri).

## Masalah

Halaman jadwal publik tidak punya desain desktop sama sekali — bukan rusak, memang belum
pernah dibuat.

- Header, daftar kartu, dan bar agent semuanya dikunci `max-w-lg` (512px): `src/App.tsx:878`,
  `src/components/FilterHeader.tsx:413`, `src/components/FloatingAgentBar.tsx:103`. Lebarnya
  sama persis dari HP 375px sampai monitor 4K.
- Di 1440px: **464px kosong di tiap sisi** — 64% layar abu-abu polos.
- Di seluruh `PackageCard.tsx` (2.719 baris) hanya ada satu kelas responsif: `sm:border-x`.

Masalah kedua muncul saat brainstorm: pada momen presentasi, kartu yang terbuka menumpuk
perjalanan, pratinjau brosur, hotel tambahan, rincian biaya, suhu, dan tombol aksi dalam satu
kolom 512px — agent harus menggulir ±3.000px padahal layarnya sanggup menampung sekaligus.

## Keputusan user (mengikat)

1. **Pola pakai:** satu paket dibahas dalam-dalam, bukan membandingkan beberapa paket.
2. **Saat idle** (belum ada kartu dipilih): latar berbranding. **Panel profil agent DITOLAK** —
   sisi kiri harus berisi informasi, bukan identitas.
3. **Rail kiri = itinerary.**
4. **Rail kanan = bertab.** Karena rute pindah ke kiri, tab "Rute" dihapus → **Hotel · Biaya ·
   Brosur**.
5. **Di 1024px kolom tengah dipersempit** supaya dua rail tetap muat (bukan menyembunyikan rail).
6. **Di layar lebar kartu TIDAK memuai** — hanya ditandai terpilih; seluruh detail ke rail.

## Tata letak

### Token lebar — satu sumber

`--jadwal-col-w` dan `--jadwal-rail-w` didefinisikan di `src/index.css` lewat media query:

| viewport      | kolom | rail | keterangan                    |
|---------------|-------|------|-------------------------------|
| `< 1024`      | 512   | —    | persis seperti sekarang       |
| `1024–1279`   | 420   | 270  | iPad landscape                |
| `1280–1439`   | 512   | 320  |                               |
| `≥ 1440`      | 512   | 368  |                               |

**Invarian:** empat tempat yang sekarang menulis `max-w-lg` sendiri-sendiri WAJIB memakai token
yang sama — `<main>` (`App.tsx:878`), modal detail Tampilan Ringkas (`App.tsx:1127`), header
inner (`FilterHeader.tsx:413`), dan `FloatingAgentBar.tsx:103`. Kalau satu terlewat, header atau
bar akan meleset dari kartu begitu kolom menyempit di 1024.

### Geometri rail

- `position: fixed` — **bukan sticky**: rail harus diam saat agent menggulir daftar.
- `top: var(--filter-header-h)`, `bottom: 24px`.
- Kiri: `right: calc(50% + var(--jadwal-col-w) / 2 + 24px)`, lebar `var(--jadwal-rail-w)`.
- Kanan: `left: calc(50% + var(--jadwal-col-w) / 2 + 24px)`, lebar sama.
- `overflow-y: auto` + `overscroll-behavior: contain` — di laptop tinggi 720px isi rail lebih
  tinggi dari ruang yang ada; rail menggulir sendiri tanpa menular ke daftar.
- Kolom tengah tetap di tengah halaman; rail duduk di selokan. Akibatnya **kartu tidak pernah
  bergeser karena interaksi** — hanya karena resize melewati breakpoint.

## Keadaan & interaksi

- Hook baru `useWideLayout()`: `matchMedia('(min-width: 1024px)')`, aman saat SSR (server
  mengembalikan `false`), berlangganan `change`.
- `App.tsx` tetap memakai `expandedCardId`; `handleToggleCard` tidak berubah. Di layar lebar
  `PackageCard` menerima `isExpanded={false}` dan prop baru `isSelected`.
- `isSelected` hanya mengubah bingkai (stroke oranye + shadow), **tidak mengubah tinggi kartu**.
- **`isSelected` wajib ditambahkan ke pembanding `memo` di `PackageCard.tsx:2709`.** Pembanding
  itu sekarang hanya menyamakan `isExpanded` dan kawan-kawan; kalau `isSelected` tidak masuk,
  kartu tidak akan render ulang saat dipilih dan bingkainya tidak pernah muncul — gagal senyap,
  tanpa galat.
- Rail dirender hanya bila `wide && expandedCardId`. Idle = latar saja, sesuai keputusan 2.
- Tombol X di kepala rail dan tombol `Escape` membatalkan pilihan.
- Efek samping yang menguntungkan: di ≥1024 wilayah muai tidak pernah terbuka, jadi animasi
  spring 0,55s, `anchorCardDuringToggle`, `contain-intrinsic-size`, dan `[overflow-anchor:none]`
  tidak pernah aktif di sana. Seluruh ranjau scroll iOS berada di bawah 1024 dan tidak tersentuh.

## Rail kiri — Itinerary

Isi, dari atas:

1. Kepala: eyebrow `RENCANA PERJALANAN`, judul `{n} Hari · {m} Kota`, tombol **Buka penuh** yang
   menuju rute share yang sudah ada (`/:slug/:jadwalId/itinerary`).
2. Chip malam per kota (mis. "Madinah 4 malam", "Makkah 4 malam"). Malam dihitung dari
   `data.days[].location` bila itinerary tersedia (jumlah hari berurutan per kota, dikurangi
   hari perpindahan terakhir); pada jalur degradasi dihitung dari `pkg.journeyOrder` dan durasi
   paket. Satu helper di `packageDetail.ts`, bukan dua perhitungan terpisah.
3. Daftar hari: chip nomor burgundy (`bg-gradient-burgundy`, gaya sama dengan
   `src/components/itinerary/DayRail.tsx`), judul hari, satu baris ringkasan aktivitas, dan
   thumbnail destinasi 38px bila tersedia.
4. Klik satu hari → aktivitas hari itu terbuka sebagai accordion di dalam rail.

**Data:** `GET /api/itinerary/:jadwalId` (`server.js:2873`) → `{ success, data }` dengan
`data.days[]` berbentuk `ItineraryDayData { dayNumber, title, location, activities }`
(`DayRail.tsx:76`). Foto memakai `destinationPhotoUrl` dari `lib/itinerary-destinasi.js` yang
sudah ada (Bunny, dedup global). **Tidak ada endpoint baru.**

### Degradasi — wajib

Endpoint itu **sah mengembalikan 404 dan 503**: 404 `"Itinerary belum tersedia"` saat paket
tidak punya sumber, 503 saat sinkronisasi belum siap (`server.js:2891`, `server.js:2907`). Jadi:

1. **Sukses** → daftar hari seperti di atas.
2. **404 / 503 / gagal jaringan** → jatuh ke `pkg.journeyOrder` yang selalu ada di payload
   paket: strip kota + malam per kota, tanpa rincian hari, plus tautan PDF `pkg.itineraryUrl`
   bila tidak kosong. **Rail kiri tidak pernah tampil kosong-melompong.**
3. **Sedang memuat** → skeleton setinggi ±9 baris hari, menahan tinggi supaya tidak melompat.

Cache per sesi: `Map<jadwalId, content | 'unavailable'>`. Pergantian pilihan cepat membatalkan
permintaan sebelumnya lewat `AbortController`.

## Rail kanan — Detail bertab

Tab: **Hotel · Biaya · Brosur**. Tombol aksi menetap di kaki rail, lintas tab.

- **Hotel** — satu kartu per kota (Mekkah, Madinah, lalu `extraHotels` untuk Cairo/Dubai/
  Istanbul dst.): chip kota, bintang, nama hotel besar, dan jarak **ditulis penuh** —
  "±300 m ke pelataran Masjidil Haram", bukan "±300m" seperti di kartu. Konvensi "pelataran"
  mengikuti label yang sudah dipakai Direktori Hotel.
- **Biaya** — tabel Quad/Triple/Double/Single/Infant untuk tier terpilih, pemilih tier bila
  paket punya lebih dari satu tier, dan blok suhu kota di bawahnya (data
  `src/data/temperatureData.ts` yang sudah dipakai kartu).
- **Brosur** — pratinjau brosur 3:4 dari `pkg.brosurUrl` dengan stempel identitas agent seperti
  perilaku sekarang.
- **Kaki rail (tetap):** Kirim ke WhatsApp, Brosur/Simpan, Tanya AI, dan baris khusus agent
  (Kalkulasi dll.) — yaitu semua tombol yang sekarang berada di dalam wilayah muai kartu.

### Foto hotel — dua fase

`src/data/hotelMetadata.ts` hanya menyimpan bintang dan jarak; **tidak ada foto**. Foto ada di
Direktori Hotel, tetapi seluruh `/api/hotels` memakai `authMiddleware` (`server.js:7610`),
sedangkan halaman jadwal dilihat jamaah tanpa login.

- **Fase 1 (wajib):** tab Hotel tampil **tanpa foto** — nama, bintang, jarak, dan kota disajikan
  besar dari data yang sudah ada di payload paket. Rail tetap jauh lebih berguna daripada kartu
  hari ini, dan tidak ada permukaan publik baru.
- **Fase 2 (tugas terpisah dalam rencana yang sama):** endpoint publik baca-saja
  `GET /api/public/hotels?names=` dengan `dbLoadShedGuard`, cache, dan subset kolom aman
  (`name, city, stars, distance_label, walk_label, area, description, media`). Pencocokan nama
  memakai `normalizeHotelName` yang sudah ada di `hotelMetadata.ts`. Setelah itu foto muncul di
  tab Hotel.

Fase 1 harus utuh dan bisa dirilis sendiri tanpa Fase 2.

## Latar berbranding

Hanya di `≥ 1024`. Di bawah itu latar persis seperti sekarang.

- Lapisan `fixed inset-0`, `z-index: -1`, `pointer-events: none`.
- Gradasi hangat + satu foto arsitektur beropasitas rendah (WebP dari Bunny, ±1600px), dengan
  warna solid sebagai fallback kalau gambar gagal dimuat.
- Varian gelap: gradasi gelap, opasitas foto lebih rendah lagi.

## Tombol aksi & ekspor screenshot — risiko utama

`handleScreenshot` mengkloning `cardRef.current` apa adanya (`PackageCard.tsx:686`), lalu
menjalankan bedah CSS panjang pada klon itu. Wilayah muai kartu dirender dengan
`height: isExpanded ? 'auto' : 0` (`PackageCard.tsx:1859`) dan blok brosur baru di-mount pada
commit yang sama dengan `isExpanded` (`PackageCard.tsx:178-182`).

Konsekuensinya, kalau kartu tidak pernah memuai di layar lebar: klon tidak berisi wilayah muai,
sehingga gambar ekspor kehilangan brosur, rincian biaya, dan perjalanan.

**Rencana:** tombol Screenshot di rail memaksa kartu ke keadaan muai **tanpa animasi** (jalur
`instantCollapse` yang sudah ada, arah sebaliknya), menunggu `document.fonts.ready` + dua rAF
seperti yang sudah dilakukan kode ekspor, mengkloning, lalu mengembalikan keadaan.

**Selain itu lebar klon dinormalkan ke 512px.** Catatan proyek mencatat klon `modern-screenshot`
mewarisi lebar/tinggi piksel elemen sumber; klon dari kolom 420px (1024–1279) akan memecah baris
teks. Ini tugas tersendiri dengan tesnya sendiri, bukan bagian dari tugas tata letak.

## Data & refactor terarah

**Koreksi 2026-09-07 (saat menyusun rencana):** sebagian besar helper ternyata SUDAH punya
rumah sendiri dan tinggal dipakai ulang — `cheapestTierOf`/`minPriceInTier` di
`src/lib/packagePricing.ts`, `getPackageJourneySteps`/`getLandingStepIndex`/`getLandingCityName`
di `src/utils/journey.ts`, `getTemperature` di `src/data/temperatureData.ts`, `getDistance` di
`src/data/hotelService.ts`, `lookupHotelMetadata` di `src/data/hotelMetadata.ts`. Yang benar-benar
masih terkurung di dalam `PackageCard.tsx` hanya empat.

`src/lib/packageDetail.ts` (baru, murni, tanpa React) — hanya empat fungsi:

- `tiersOf(pkg)` — daftar tier dengan "Hemat" di-hoist ke depan (`PackageCard.tsx:264`)
- `extraHotelsOf(pkg, activeTier)` — hotel kota plus/transit + fallback antar-tier
  (`PackageCard.tsx:367`)
- `hotelStarsOf(name, stars)` — helper modul di `PackageCard.tsx:38`
- `hotelDistanceOf(name, distance)` — helper modul di `PackageCard.tsx:44`

Dipindah apa adanya — **tanpa perubahan perilaku** — lalu dipakai bersama oleh kartu dan kedua
rail. Sisanya diimpor dari modul yang sudah ada, tidak dipindah lagi. Rail bukan salinan markup
kartu; presentasinya baru, datanya satu sumber. Pemindahan ini ditutup unit test lebih dulu,
sebelum rail memakainya.

Batasan: hanya fungsi yang benar-benar dipakai rail yang dipindah. Tidak ada refactor
`PackageCard.tsx` di luar itu.

## Mode gelap

Setiap permukaan baru wajib punya varian `dark:`. Tiga yang paling gampang terlewat:

1. Latar berbranding (gradasi dan opasitas foto).
2. Kepala rail dan chip nomor hari burgundy — kontrasnya berubah di latar gelap.
3. Tab aktif (putih di terang, harus jadi slate di gelap).

## Analytics

Halaman ini publik-by-slug, jadi **wajib `trackPublicEvent`**, bukan `trackEvent`.

- Event baru: `jadwal_rail_open` dan `jadwal_rail_tab` (nilai `hotel` / `biaya` / `brosur`).
- **Wajib didaftarkan di `server.js`: `FEATURE_LABELS`, `ACTION_LABELS`, dan
  `VALID_PUBLIC_EVENTS`.** Public event yang tidak masuk whitelist di-drop 400 secara senyap.
- Butuh restart `server.js` — tanpa itu event baru tidak aktif.
- Aksi yang sudah punya event (screenshot, share, brosur, tanya AI) memakai event yang sudah ada,
  tidak dibuat baru hanya karena tombolnya pindah tempat.

## Pengujian

- Unit murni untuk `src/lib/packageDetail.ts` — tidak butuh render.
- Harness SSR yang sudah ada (`tests/fixtures/package-card-render.js`): menegaskan wilayah muai
  tidak dirender terbuka saat `isExpanded={false}` + `isSelected`.
- Degradasi itinerary: 404 dan 503 → strip `journeyOrder` (unit, tanpa jaringan).
- `tests/fixtures/export-wrap-probe.js` diperluas untuk kasus klon-dari-kolom-420 yang
  dinormalkan ke 512.
- Manual (dijalankan user, sesuai preferensi): 1024 / 1280 / 1440 + iPad asli, mode terang dan
  gelap, dan layar pendek 1280×720.
- Baseline merah yang sudah ada jangan dikira regresi: 5 tes sejak `ec01280`, 12 tes Direktori
  Hotel, dan 3 subtes `brochure-export-consistency`.

## Di luar cakupan

- **Mode "Tampilan Ringkas" tidak diubah** — tetap memakai modal layar penuh seperti sekarang.
  Alasan: ringkas adalah mode memindai, modalnya sudah memenuhi layar, dan menambahkan model
  interaksi kedua dalam satu perubahan menaikkan risiko tanpa menjawab keluhan awal.
- Header tidak dirombak jadi satu baris (ditolak user); hanya lebarnya ikut token.
- Tidak ada mode banding paket.
- Perilaku di bawah 1024px tidak disentuh sama sekali.

## Risiko

1. **Ekspor screenshot** — paling besar; lihat bagian di atas. Diberi tugas dan tes tersendiri.
2. **Kolom 420px di 1024** — nama hotel makin terpotong; wajib diperiksa langsung di lebar itu.
3. **`--filter-header-h`** — rail fixed bergantung padanya; kalau salah ukur, rail tertimpa
   header. Sudah ada mekanisme pengukurannya di `FilterHeader.tsx`, tapi harus diuji ulang di
   lebar baru karena tinggi header bisa berubah saat kolom menyempit.
4. **Fase 2 endpoint publik** — permukaan publik baru; butuh load-shed guard dan cache, dan hanya
   boleh mengembalikan subset kolom yang aman.
