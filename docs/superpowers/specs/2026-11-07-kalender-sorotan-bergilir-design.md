# Spec: Sorotan Bergilir di Kalender Dashboard

**Tanggal:** 2026-11-07
**Status:** Disetujui di chat (brainstorm + iterasi mockup Opsi A); user meminta langsung lanjut implementasi.
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
| Arah | **Opsi A, Sorotan Bergilir**: satu gelembung gelap yang singgah dari tanggal ke tanggal. |
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

### 4.2 Urutan singgah

Daftar *tanggal sorotan* = tanggal di bulan berjalan, `>= hari ini (WIB)`, yang punya minimal satu event
dengan detail tampil (`hasDisplayableDetail`, aturan yang sama dengan titik di grid). Diurutkan:
1. **Hari ini** (bila berjadwal).
2. Tanggal yang punya **jamaah Anda** (berangkat atau manasik, lihat 5.4), kronologis.
3. Sisanya, kronologis.

- Pindah otomatis setiap **3 detik** (`SPOTLIGHT_DWELL_MS = 3000`), paling banyak **6 tanggal**
  (`SPOTLIGHT_AUTO_STOPS = 6`). Setelah singgah ke-6 selesai (atau daftar habis lebih dulu), gelembung pamit.
- Tombol ‹ › menjangkau **semua** tanggal di daftar (bukan cuma 6). Penomoran gelembung `n/total` memakai total
  seluruh daftar (mis. "2/11").
- ‹ › mengikuti **urutan sorotan yang sama** (bukan urutan kalender), jadi `n/total` selalu naik saat
  berganti otomatis. ‹ di posisi pertama dan › di posisi terakhir nonaktif (tidak berputar balik).
- Hanya tanggal yang **punya titik di kalender** yang disinggahi. Tanggal jamaah Anda yang tidak punya event
  kalender sama sekali (sumber `umroh_schedules` vs `calendar_events` kadang tidak sepakat) **tidak** disinggahi:
  gelembung harus selalu menunjuk sebuah titik. Tanggal jamaah Anda hanya menaikkan prioritas tanggal yang
  memang berjadwal.

### 4.3 Interaksi

| Aksi agent | Hasil |
|---|---|
| Menyentuh/menahan gelembung (pointer down) atau kursor di atasnya | Garis waktu berhenti; lanjut saat dilepas/kursor keluar. |
| Ketuk ‹ › | Pindah ke tanggal sebelum/sesudahnya. **Mode otomatis berhenti** (garis waktu disembunyikan); gelembung tetap sampai ditutup. |
| Ketuk **Detail** atau badan gelembung | Bottom sheet tanggal itu terbuka (sama dengan mengetuk tanggalnya); gelembung pamit. |
| Ketuk tanggal mana pun di grid | Perilaku lama (buka sheet bila berjadwal); gelembung pamit. |
| Ketuk di luar gelembung | Gelembung pamit. |
| Bagian kalender turun ke <20% terlihat (gulir lewat) | Gelembung pamit. |
| Ganti bulan di header kalender | Gelembung pamit. |
| Escape | Gelembung pamit; `preventDefault()` di listener `document` supaya pintasan Escape App tidak ikut jalan. |
| Ketuk **Sorot lagi** | Putaran otomatis baru dari awal daftar. |

Gelembung yang sudah pamit tidak muncul lagi otomatis hari itu. Tombol kecil **"Sorot lagi"** muncul di baris
legenda (kanan) bila: bulan berjalan sedang tampil, daftar tanggal sorotan tidak kosong, dan gelembung sedang
tidak tampil. Tombol ini tidak bergantung pada gerbang harian.

### 4.4 Desktop (pointer halus)

Pada perangkat `(hover: hover) and (pointer: fine)`: mengarahkan kursor ke tanggal berjadwal mana pun (bulan
mana pun, termasuk tanggal lewat) menampilkan gelembung tanggal itu dalam **mode diam**: tanpa garis waktu dan
tanpa navigasi ‹ ›, tombol Detail tetap ada. Hilang 150 ms setelah kursor meninggalkan tanggal dan gelembung.
Bila putaran otomatis sedang jalan, hover menghentikannya dan mengambil alih.

### 4.5 Gerak

| Momen | Gerak |
|---|---|
| Masuk | Tumbuh dari ekor: skala 0,94 → 1 + opacity 0 → 1, 220 ms ease-out. |
| Pindah tanggal | Gelembung meluncur ke posisi baru (spring ±350 ms, tanpa pantulan); isi berganti silang 120 ms. |
| Singgah | Garis waktu (2 px, hijau) terisi linear 3 detik. |
| Pamit | Opacity → 0 sambil turun 4 px, 180 ms. |
| `prefers-reduced-motion` | Tanpa skala/luncur; hanya ganti silang 120 ms. **Tidak berganti otomatis**: tampil di tanggal pertama, garis waktu disembunyikan, sisanya lewat ‹ ›. Gerbang harian tetap berlaku. |

## 5. Isi gelembung

Acuan visual: papan A2 & A3. Lebar 244 px (menyusut bila kartu lebih sempit, sisa margin 8 px kiri-kanan),
sudut 14, latar slate-900; di mode gelap slate-950 + garis tepi slate-700. Bayangan 0/10/28 28% (gelap: 50%).

### 5.1 Baris atas
`SEN, 9 NOV` (hari 3 huruf + tanggal + bulan 3 huruf, huruf besar) + lencana:
- `HARI INI` (selalu hijau, sama dengan lingkaran hari ini),
- `BESOK` (H-1),
- `H-n` untuk n ≥ 2,
- tanggal lewat (hanya mungkin di hover desktop): tanpa lencana.
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
`‹ 2/11 ›` (tombol 22 px; target sentuh diperbesar dengan pola `touch-hit` yang sudah ada) + `Detail ›` hijau.
Mode diam (hover desktop) → hanya `Detail ›`.

## 6. Arsitektur

### 6.1 Berkas
- `src/lib/calendarEvents.ts` (baru): pindahan tipe `EventDetail`/`CalendarEvent` dan helper murni
  `displayPax`, `hasDisplayableDetail`, `parsePaket` dari `UpcomingSchedule.tsx`, supaya dipakai bersama.
  Pemanggilan di komponen tetap bernama sama (tes penjaga sumber `tests/upcoming-schedule-*.test.js`
  mencocokkan teks seperti `{displayPax(detail)}` dan `formatCalendarPrimaryPerson(detail.tour_leader)`).
- `src/lib/calendarSpotlight.ts` (baru, murni, tanpa DOM): konstanta, `buildSpotlightDates(...)` (urutan 4.2),
  `buildSpotlightContent(...)` (model isi 5.x), gerbang harian (6.3).
- `src/components/calendar/CalendarSpotlight.tsx` (baru): render gelembung + timer + navigasi + penempatan.
- `src/components/UpcomingSchedule.tsx`: pembungkus `relative`, atribut `data-cal-day` di sel, cincin sorotan
  di sel aktif, pemicu IntersectionObserver, tombol "Sorot lagi", hover desktop, penghubung ke sheet.
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
Satu event fitur: `trackEvent('feature', 'view_calendar_spotlight', { trigger: 'auto' | 'replay', stops: <total>,
mine: <boolean> })` saat gelembung tampil di awal putaran. Ketuk Detail memakai event yang sudah ada
`open_calendar_day` dengan meta tambahan `source: 'spotlight'`. Daftarkan label `view_calendar_spotlight:
'Kalender: Sorotan Tanggal'` di `FEATURE_LABELS` (server.js). Meta tanpa PII.

### 6.5 Aksesibilitas
- Gelembung `role="group"` dengan `aria-label` berisi tanggal; tidak merebut fokus, tidak memakai `aria-live`
  (pergantian otomatis tidak diumumkan).
- Tombol ‹ › dan Detail dapat difokus dengan Tab dan punya `aria-label` ("Tanggal sebelumnya", dst.).
- Fokus di dalam gelembung juga menjeda garis waktu.

## 7. Batasan teknis

- **Kelas Tailwind baru vs CSS lama di service worker**: properti yang menentukan *keterlihatan & posisi*
  (top/left/width gelembung, posisi ekor, lebar garis waktu) ditulis lewat `style` inline. Warna latar/teks
  memakai kelas yang sudah ada di build lama bila memungkinkan; cek dengan `git grep` sebelum memakai kelas baru.
- framer-motion `^12.43` sudah terpasang; tidak ada dependensi baru.
- Hari ini dihitung WIB untuk sorotan; grid lama tetap memakai jam lokal (tidak diubah).
- Tidak mengubah perilaku `inert`/fokus sheet yang sudah ada; gelembung pamit sebelum sheet mana pun terbuka.

## 8. Keputusan builder (dari builder check, bukan dari user)
- ‹ › mengikuti urutan sorotan, bukan urutan kalender (4.2).
- Yang diamati IntersectionObserver = bagian kalender (header–legenda), bukan seluruh kartu (4.1).
- Tanggal jamaah Anda tanpa event kalender tidak disinggahi; baris jamaah Anda hanya untuk jenis yang ada di
  tanggal itu (4.2, 5.4).
- Penempatan memperhitungkan viewport (6.2). Tanggal lewat di hover desktop tanpa lencana (5.1).
- Nama TL dipotong maksimal 3 kata (sheet memakai 2) supaya gelar seperti "Ust." tidak memakan nama.

## 9. Diserahkan ke builder
- Pembagian komponen internal dan nama state.
- Teknik timer (motion value framer `animate()` dengan `pause()/play()` atau rAF sendiri) asal bisa dijeda.
- Penanganan teks kepanjangan: `truncate` satu baris untuk baris info; judul boleh membungkus.
- Detail ikon (lucide yang sudah dipakai: `PlaneTakeoff`, `PlaneLanding`, `Clock`, `User`, `IdCard`,
  `ChevronLeft/Right`, `RotateCcw`).

## 10. Verifikasi
- Tes unit `tests/calendar-spotlight.test.js` (urutan, batas otomatis, isi per jenis, jamaah Anda, TL, lencana,
  gerbang harian dengan storage normal & melempar).
- `npx tsc --noEmit` (bandingkan dengan baseline error lama), `npm run build`, tes penjaga
  `tests/upcoming-schedule-*.test.js` dan `tests/manasik-sessions.test.js` tetap hijau.
- Cek visual di `localhost` bila sesi agent tersedia; selebihnya checklist manual untuk user (e2e oleh user).
