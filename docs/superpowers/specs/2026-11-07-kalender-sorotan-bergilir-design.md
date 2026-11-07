# Spec: Sorotan Agenda di Kalender Dashboard

**Tanggal:** 2026-11-07
**Status:** Disetujui di chat (brainstorm + iterasi mockup Opsi A); user meminta langsung lanjut implementasi.
**Revisi 2026-11-07 (dari user, saat implementasi):** gelembung **tidak bergilir**. Cukup satu gelembung di
**hari ini** bila ada agenda; bila hari ini kosong, di **tanggal berjadwal terdekat berikutnya**. Tampilan wajib
mengikuti design system, dan warnanya **harus beda dari latar kalender** (tidak boleh menyatu saat terbuka). Bagian yang terdampak (2, 4.2–4.5, 5, 6, 8) sudah ditulis ulang di bawah;
mockup Beskem.pen masih menggambarkan versi bergilir.
**Mockup:** Pencil `Beskem.pen` (`~/.pencil/documents/bc2ca188-3652-45c8-932c-4588bfb09a8c/Beskem.pen`)
— papan **Rencana**, **Opsi A — Sorotan Bergilir**, **A1 Alur Giliran**, **A2 Anatomi**, **A3 Isi per Jenis**,
**A4 Interaksi & Gerak**, **A5 Mode Gelap**. Nama/angka di mockup karangan.

## 1. Maksud

Kartu kalender di Dashboard (`src/components/UpcomingSchedule.tsx`) hanya menampilkan titik warna per tanggal.
Isi tanggal baru terlihat setelah agent mengetuk tanggal (bottom sheet). User ingin, saat agent menggulir
sampai kalender, muncul gelembung info yang **menarik dan informatif** di tanggal-tanggal berjadwal, tanpa
agent harus mengetuk satu per satu.

Sukses = agent yang menggulir ke kalender langsung tahu "hari ini ada apa" dan "jamaah saya kapan", lalu bisa
melompat ke detail satu tanggal dengan satu ketukan.

## 2. Keputusan dari user (jangan diubah)

| Hal | Keputusan |
|---|---|
| Arah | Gelembung info dari Opsi A, tetapi **satu tanggal saja**: hari ini bila ada agenda, kalau tidak tanggal berjadwal terdekat berikutnya. **Tidak bergilir.** |
| Tampilan | **Sesuai design system** dan **warnanya beda dari latar kalender** supaya tidak menyatu: pola tooltip yang sudah ada (`AvailabilityCoachMark`) — warna dibalik terhadap kartu. |
| Jamaah agent | **Teks saja**, mis. "3 jamaah Anda berangkat · Kloter 12". **Tanpa avatar/inisial.** |
| Tour leader | **Nama TL wajib** tampil. |
| Tanggal Hijriah | **Tidak ditampilkan.** |
| Foto TL | **Dibatalkan.** Tidak ada foto apa pun di gelembung. |

## 3. Non-goal & anti-goal

- Tidak mengganti bottom sheet tanggal; ketuk tanggal tetap membuka sheet seperti sekarang.
- Tidak menambah endpoint, kolom DB, atau migrasi. Semua data sudah dimuat kartu kalender.
- Tidak berjalan di bulan selain bulan berjalan (WIB).
- **Anti-goal:** gelembung yang mengganggu: muncul berulang tiap kali dashboard dibuka, menghalangi gulir,
  mencuri fokus, atau menutup sheet/overlay lain. Kalau agent mengetuk di luar, gelembung harus langsung pergi.
- **Anti-goal:** mencampur angka. `pax` di kalender = kursi terisi kloter **nasional**; "jamaah Anda" = jamaah
  **milik agent**. Keduanya tidak pernah dijumlah, dibandingkan, atau ditulis dengan kata yang sama
  (lihat memori proyek Berangkat Mendatang).

## 4. Perilaku

### 4.1 Pemicu

Putaran otomatis dimulai bila SEMUA terpenuhi:
1. Bulan yang tampil di kalender = bulan berjalan menurut **WIB** (`wibTodayKey()` dari `lib/manasik-sessions.js`).
2. Data bulan itu sudah termuat (bukan skeleton, bukan galat) **dan** fetch `berangkat-mendatang` sudah selesai
   (berhasil atau gagal; kalau gagal, gelembung jalan tanpa baris "jamaah Anda").
3. Ada ≥1 tanggal berjadwal hari ini atau sesudahnya di bulan itu (lihat 4.2).
4. **Bagian kalender** (header bulan sampai legenda, BUKAN seluruh kartu yang juga memuat daftar Berangkat
   Mendatang) **≥60% terlihat** di viewport (IntersectionObserver, root = viewport; Dashboard memakai gulir jendela).
5. Belum diputar hari ini (WIB) di perangkat ini (gerbang `localStorage`, lihat 6.3).
6. Tidak ada sheet kalender yang terbuka.

Gerbang hari ini ditandai **saat gelembung benar-benar tampil**, bukan saat syarat terpenuhi.

### 4.2 Tanggal yang disorot

Satu tanggal, `pickSpotlightDate()`: tanggal paling awal di bulan berjalan yang `>= hari ini (WIB)` dan punya
minimal satu event dengan detail tampil (`hasDisplayableDetail`, aturan yang sama dengan titik di grid). Jadi
hari ini bila ada agenda, selain itu agenda terdekat berikutnya. Bila agenda bulan berjalan sudah habis, tidak ada
gelembung (tidak melompat ke bulan berikutnya, karena gelembung harus menunjuk titik yang terlihat).

Tidak ada pergantian otomatis, garis waktu, maupun navigasi ‹ ›. Gelembung tetap tampil sampai ditutup.

### 4.3 Interaksi

| Aksi agent | Hasil |
|---|---|
| Ketuk **Lihat detail** | Bottom sheet tanggal itu terbuka (sama dengan mengetuk tanggalnya); gelembung pamit. |
| Ketuk **×** | Gelembung pamit. |
| Ketuk tanggal mana pun di grid | Perilaku lama (buka sheet bila berjadwal); gelembung pamit. |
| Ketuk di luar gelembung | Gelembung pamit. |
| Bagian kalender turun ke <20% terlihat (gulir lewat) | Gelembung pamit. |
| Ganti bulan di header kalender | Gelembung pamit. |
| Escape | Gelembung pamit; `preventDefault()` di listener `document` supaya pintasan Escape App tidak ikut jalan. |
| Ketuk **Sorot lagi** | Gelembung muncul lagi di tanggal yang sama. |

Gelembung yang sudah pamit tidak muncul lagi otomatis hari itu. Tombol kecil **"Sorot lagi"** muncul di baris
legenda (kanan) bila bulan berjalan sedang tampil, ada tanggal untuk disorot, dan gelembung sedang tidak tampil.
Tombol ini tidak bergantung pada gerbang harian.

### 4.4 Desktop

Tidak ada perilaku hover khusus (dibuang bersama versi bergilir).

### 4.5 Gerak

Durasi kontrol design system: masuk opacity 0 → 1 + skala 0,96 → 1, keluar kebalikannya, **150 ms ease-out**,
bertumbuh dari ekor. `prefers-reduced-motion`: hanya opacity.

## 5. Isi gelembung

Kulit = pola tooltip yang sudah ada di aplikasi (`src/components/AvailabilityCoachMark.tsx`): warna **dibalik**
terhadap kartu — kartu terang → `bg-slate-900 text-white`, kartu gelap → `dark:bg-slate-50 dark:text-slate-900`;
`rounded-xl`; ekor 12 px `rounded-[2px]` polos tanpa garis tepi; bayangan `drop-shadow` di pembungkus (bukan
box-shadow/ring). Kulit popover putih/slate-800 (`docs/DESIGN-SYSTEM.md`, Custom Dropdown) sempat dicoba dan
ditolak user karena menyatu dengan kartu kalender. Lebar 244 px (menyusut bila kartu lebih sempit, margin 8 px).
Tipografi:
- tanggal `text-[10px] font-bold uppercase tracking-wide`; lencana `text-[9px] font-bold uppercase tracking-wide`
  solid putih-di-atas-warna (HARI INI emerald; BESOK/H-n warna jenis);
- judul satu jenis `text-sm font-bold`, judul campuran `text-xs font-bold`; baris info `text-[10px]–[11px] font-medium`;
- baris jamaah Anda: pil solid `bg-emerald-500`/`bg-violet-500` teks putih `text-[11px] font-semibold`;
- kaki: tombol penuh **"Lihat detail ›"** ber-`border-t`, warna teks mewarisi teks utama gelembung;
- tombol **×** (`aria-label="Tutup"`) di kanan baris tanggal.
Warna yang menentukan keterbacaan hanya memakai kelas yang sudah ada di build lama (lihat §7).

### 5.1 Baris atas
`SEN, 9 NOV` (hari 3 huruf + tanggal + bulan 3 huruf, huruf besar) + lencana:
- `HARI INI` (selalu hijau, sama dengan lingkaran hari ini),
- `BESOK` (H-1),
- `H-n` untuk n ≥ 2,
- tanggal lewat: tanpa lencana (tidak terjadi di jalur normal).
Warna `BESOK`/`H-n` ikut jenis event pertama di tanggal itu (urutan berangkat → pulang → manasik):
hijau / biru / ungu.

### 5.2 Satu jenis vs campuran
- **Satu jenis**: judul besar 16 px + baris info dengan ikon (warna ikon = warna jenis).
- **Campuran** (≥2 jenis di tanggal yang sama): satu blok per jenis, urutan berangkat → pulang → manasik, tiap blok
  = titik warna + judul 13 px + baris info tanpa ikon.

### 5.3 Isi per jenis

Semua angka dari `details` yang lolos `hasDisplayableDetail`. "n kloter" = jumlah detail tersebut.

**Berangkat** — judul `n kloter berangkat`.
- Maskapai: nama dari `pesawat` (format sumber `"SAUDIA ~ SV 827"`, bagian sebelum `~`/`-`), title-case,
  unik, paling banyak 2 lalu `+n`. Bila hanya 1 kloter: nama + kode penerbangan (`Saudia SV 827`).
- Jam & pax: `Take off 06:45–22:10 · 412 pax` (rentang jam min–maks dari `jam`; satu jam bila sama/hanya satu;
  pax = jumlah `displayPax`). Jam kosong → hanya `412 pax`.
- TL: lihat 5.5.
- Varian campuran (≤2 kloter): satu baris `SV 817 06:45 · GA 980 10:20 · 230 pax`; >2 kloter: maskapai `+n` · pax.

**Pulang** — judul `n kloter pulang tiba`.
- `Saudia SV 826 · tiba 16:20 · T3` (1 kloter; terminal dari `airportTerminalLabel(detail, 'kepulangan')`,
  disingkat bila panjang). >1 kloter: maskapai `+n` · rentang jam tiba.
- TL (5.5).
- Satu kloter dengan `staff`: `Dijemput staff <nama>` (`formatCalendarPrimaryPerson(detail.staff)`).
- **Tidak ada baris jamaah Anda** (data jamaah agent yang pulang tidak tersedia).

**Manasik** — judul `Manasik 08:00` (jam paling awal; tanpa jam → `Manasik`).
- `Untuk keberangkatan 14 Nov` dari tanggal yang ditempel di `paket` (`parsePaket`); bila >1 tanggal berbeda,
  gabung maksimal 2 (`14 & 21 Nov`), sisanya `+n`.
- TL (5.5).

### 5.4 Jamaah Anda
Kotak berwarna di bawah isi, satu baris per jenis, teks saja:
- **Berangkat**: jumlah `count` grup `berangkatGroups` yang `realDateKey(tgl_berangkat)` = tanggal ini →
  `3 jamaah Anda berangkat`. Nomor kloter ditempel bila grup itu bisa dicocokkan ke detail kalender lewat
  `jadwal_id` yang punya `group_number`: `· Kloter 12`; dua kloter → `· Kloter 12 & 14`; lebih → tanpa nomor.
  Warna hijau.
- **Manasik**: jumlah `count` sesi `manasikSessions` dengan `manasik_tgl` = tanggal ini →
  `5 jamaah Anda ikut manasik`. Warna ungu.
- Baris hanya ditulis untuk jenis yang **ada di kalender tanggal itu** (baris manasik hanya bila tanggal itu
  punya event manasik; baris berangkat hanya bila punya event keberangkatan), supaya gelembung tidak menyebut
  jadwal yang tidak terlihat di titik/isi gelembung.
- Tidak ada keduanya → kotak tidak dirender.
Latar kotak mengikuti warna baris pertama.

### 5.5 Tour leader
Per jenis: kumpulkan nama TL unik dari `details` (`formatCalendarPrimaryPerson(detail.tour_leader, 3)`).
- Yang disebut: TL dari kloter jamaah Anda (detail yang `jadwal_id`-nya cocok dengan grup agent) bila ada;
  selain itu TL detail pertama.
- Sisanya `+n` (jumlah TL unik lain). Baris: `TL Ust. Ridwan Hakim +2`.
- Tidak ada TL sama sekali → baris dihilangkan.

### 5.6 Kaki
Tombol **Lihat detail ›** selebar gelembung (lihat §5).

## 6. Arsitektur

### 6.1 Berkas
- `src/lib/calendarEvents.ts` (baru): pindahan tipe `EventDetail`/`CalendarEvent` dan helper murni
  `displayPax`, `hasDisplayableDetail`, `parsePaket` dari `UpcomingSchedule.tsx`, supaya dipakai bersama.
  Pemanggilan di komponen tetap bernama sama (tes penjaga sumber `tests/upcoming-schedule-*.test.js`
  mencocokkan teks seperti `{displayPax(detail)}` dan `formatCalendarPrimaryPerson(detail.tour_leader)`).
- `src/lib/calendarSpotlight.ts` (baru, murni, tanpa DOM): `pickSpotlightDate(...)` (4.2), `buildSpotlightMine`,
  `buildSpotlightContent(...)` (model isi 5.x), `computeBubblePosition`, gerbang harian (6.3).
- `src/components/calendar/CalendarSpotlight.tsx` (baru): render gelembung + penempatan + penutupan.
- `src/components/UpcomingSchedule.tsx`: pembungkus `relative`, atribut `data-cal-day` di sel, cincin sorotan
  di sel aktif, pemicu IntersectionObserver, tombol "Sorot lagi", penghubung ke sheet.
- `server.js`: label `FEATURE_LABELS.view_calendar_spotlight`.
- `tests/calendar-spotlight.test.js` (baru): uji fungsi murni, di-bundle dengan esbuild seperti
  `tests/jadwal-availability-hint.test.js`.

### 6.2 Penempatan
Kartu memakai `overflow-hidden` (sudut membulat), jadi gelembung **tidak** boleh ada di dalam kartu.
Struktur: `div.relative` (pembungkus baru) → [kartu yang sudah ada (`cardRef`) , lapisan gelembung
`absolute z-30`]. Gelembung ikut tergulir bersama kartu tanpa portal. Sheet (z-50) tetap di atasnya.

Posisi dihitung dari `getBoundingClientRect()` sel `[data-cal-day="d"]` relatif ke pembungkus:
- `left = clamp(cx − w/2, 8, W − w − 8)`; ekor di `cx − left`, dijepit 16..w−16.
- Ruang yang dihitung = irisan pembungkus **dan viewport** (bagian yang benar-benar terlihat).
  **Bawah** bila ruang terlihat di bawah sel ≥ tinggi gelembung + 12, atau ruang terlihat di atas lebih kecil dari
  ruang bawah; selain itu **atas**. Posisi dihitung ulang juga saat jendela digulir (listener `scroll` pasif,
  di-throttle per frame) selama gelembung tampil. Ekor menempel ke angka tanggal (bawah: di bawah titik; atas: di atas angka).
- Tinggi diukur setelah render (useLayoutEffect) sebelum gelembung terlihat; dihitung ulang saat tanggal aktif
  berganti dan saat pembungkus berubah ukuran (ResizeObserver).
- Sel aktif mendapat cincin hijau (hari ini: halo hijau muda di luar lingkaran yang sudah terisi).

### 6.3 Gerbang harian
`localStorage['calendar-spotlight-v1'] = 'YYYY-MM-DD'` (WIB) tanggal terakhir tampil. Boleh mulai otomatis bila
nilainya ≠ hari ini. Akses dibungkus try/catch; bila storage melempar, pakai cadangan di memori modul (pola
`src/lib/availability-hint.ts`). Fungsi gerbang menerima storage sebagai argumen agar teruji tanpa DOM.

### 6.4 Analitik
Satu event fitur: `trackEvent('feature', 'view_calendar_spotlight', { trigger: 'auto' | 'replay', today: <boolean>,
mine: <boolean> })` saat gelembung tampil. Ketuk Detail memakai event yang sudah ada
`open_calendar_day` dengan meta tambahan `source: 'spotlight'`. Daftarkan label `view_calendar_spotlight:
'Kalender: Sorotan Tanggal'` di `FEATURE_LABELS` (server.js). Meta tanpa PII.

### 6.5 Aksesibilitas
- Gelembung `role="group"` dengan `aria-label` berisi tanggal; tidak merebut fokus, tidak memakai `aria-live`
  (pergantian otomatis tidak diumumkan).
- Tombol × (`aria-label="Tutup"`) dan Lihat detail dapat difokus dengan Tab.
- Fokus di dalam gelembung juga menjeda garis waktu.

## 7. Batasan teknis

- **Kelas Tailwind baru vs CSS lama di service worker**: properti yang menentukan *keterlihatan & posisi*
  (top/left/width gelembung, posisi ekor, lebar garis waktu) ditulis lewat `style` inline. Warna latar/teks
  memakai kelas yang sudah ada di build lama bila memungkinkan; cek dengan `git grep` sebelum memakai kelas baru.
- framer-motion `^12.43` sudah terpasang; tidak ada dependensi baru.
- Hari ini dihitung WIB untuk sorotan; grid lama tetap memakai jam lokal (tidak diubah).
- Tidak mengubah perilaku `inert`/fokus sheet yang sudah ada; gelembung pamit sebelum sheet mana pun terbuka.

## 8. Keputusan builder (bukan dari user)
- Yang diamati IntersectionObserver = bagian kalender (header–legenda), bukan seluruh kartu (4.1).
- Bila agenda bulan berjalan habis, tidak ada gelembung; tidak melompat ke bulan berikutnya (4.2).
- Gelembung tetap tampil sampai ditutup (tanpa batas waktu), karena tidak ada lagi pergantian otomatis (4.2).
- Gerbang sekali-sehari dan tombol "Sorot lagi" dipertahankan dari versi bergilir (4.3).
- Hover desktop dibuang: user meminta gelembung hanya di satu tanggal (4.4).
- Baris jamaah Anda hanya untuk jenis yang ada di tanggal itu (5.4). Penempatan memperhitungkan viewport (6.2).
- Nama TL dipotong maksimal 3 kata (sheet memakai 2) supaya gelar seperti "Ust." tidak memakan nama.

## 9. Diserahkan ke builder
- Pembagian komponen internal dan nama state.
- Penanganan teks kepanjangan: `truncate` satu baris untuk baris info; judul boleh membungkus.
- Detail ikon (lucide yang sudah dipakai: `PlaneTakeoff`, `PlaneLanding`, `Clock`, `User`, `IdCard`,
  `ChevronRight`, `X`, `RotateCcw`).

## 10. Verifikasi
- Tes unit `tests/calendar-spotlight.test.js` (tanggal yang disorot, isi per jenis, jamaah Anda, TL, lencana, posisi,
  gerbang harian dengan storage normal & melempar).
- `npx tsc --noEmit` (bandingkan dengan baseline error lama), `npm run build`, tes penjaga
  `tests/upcoming-schedule-*.test.js` dan `tests/manasik-sessions.test.js` tetap hijau.
- Cek visual di `localhost` bila sesi agent tersedia; selebihnya checklist manual untuk user (e2e oleh user).
