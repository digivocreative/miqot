# Kalender: baris hantu dari penomoran ulang kloter

Tanggal: 2026-08-14

## Gejala

Tab **Manasik** pada sheet detail tanggal di kartu kalender `/dashboard` menampilkan
kloter yang tampak kembar. Contoh yang dilaporkan, 23 Agustus 2026:

| Kloter | Paket | Pesawat | Berangkat | PAX |
|---|---|---|---|---|
| 33 | UMRAH HEMAT 9HR | GARUDA ~ GA 980 | 5 Sep 2026 | 40 |
| 35 | UMRAH HEMAT 9HR | GARUDA ~ GA 980 | 5 Sep 2026 | 40 |
| 36 | PROMO PLUS DUBAI+DESERT SAFARI 11 HARI | EMIRATES ~ EK 357 | 7 Sep 2026 | 44 |
| 37 | PROMO PLUS DUBAI+DESERT SAFARI 11 HARI | EMIRATES ~ EK 357 | 7 Sep 2026 | 44 |

Bukan bug render. `UpcomingSchedule.tsx` merender apa adanya dari
`/api/calendar/events`, yang merender apa adanya dari tabel `calendar_events`.
Keempat baris memang ada di basis data.

## Bukti

Kloter 33 dan 35 menunjuk `jadwal_id` yang sama (`JBU1567`); 36 dan 37 sama-sama
`JBU1560`. Riwayat `synced_at` menunjukkan sistem hulu menomori ulang kloternya:

| jadwal | 24–27 Jul | 5 Agu | 14 Agu (terbaru) |
|---|---|---|---|
| JBU1567 (Umrah Hemat, berangkat 5 Sep) | KLOTER 36 | KLOTER 35 | **KLOTER 33** |
| JBU1560 (Promo Plus Dubai, berangkat 7 Sep) | KLOTER 37 | — | **KLOTER 36** |

Angka PAX yang kembar persis bukan kebetulan: `pax_terisi` adalah kursi terisi
nasional per *jadwal*, jadi dua salinan jadwal yang sama pasti seangka.

Skala pada rentang sync (`event_date >= 2026-07-01`, 732 baris):

- 140 kombinasi (tanggal, tipe, `jadwal_id`) memuat lebih dari satu baris →
  **446 baris berlebih**.
- Per tipe: manasik 104, keberangkatan 170, kepulangan 172.
- Kasus terparah: kepulangan 13 Sep untuk JBU1567 punya **tiga** salinan
  (grup 36, 35, 33) — satu per penomoran.

Dampaknya melebar ke luar kartu kalender. Ringkasan mingguan Telegram menghitung
`manasikCount` dan `keberangkatanCount` dari jumlah baris
(`telegram-notifier.js:1937`), dan `lib/bani-tools.js` membaca tabel yang sama.

## Akar masalah

Dua lapis, keduanya harus ditutup.

### Lapis 1 — identitas baris ikut nomor kloter

`calendar-api.js:246`:

```js
const rowKey = detail.jadwal_id || detail.group_number || `row${idx + 1}`;
const id = `${event.date}_${event.type}_${rowKey}`;
```

Hasil scrape halaman publik tidak punya kolom `jadwal_id` sama sekali
(`lib/calendar-public-source.js:376`) — kolom itu baru diisi belakangan oleh
`enrichCalendarPaxJamaah` (`calendar-api.js:707`), yang tidak menyentuh `id`.
Jadi kunci baris selalu jatuh ke **nomor GROUP**. Begitu hulu mengubah nomor,
`upsert` tidak menimpa apa pun; ia mencetak baris baru dan meninggalkan yang lama.

### Lapis 2 — penyapu digantung pada syarat yang kronis salah

Stale-delete ada di `calendar-api.js:518-568` dengan konfirmasi dua-langkah:
sebuah id baru boleh dihapus bila sudah tercatat hilang pada run sebelumnya,
lewat record `calendar_stale_candidates` di tabel `calendar_insights`.

Record itu **tidak pernah ada di produksi**. Akibatnya `staleCandidates.ids`
selalu himpunan kosong, `staleIds` selalu kosong, dan nol baris pernah dihapus
sejak mekanisme ini diperkenalkan (commit `94fe664`).

Penyebabnya ada di gerbang yang membungkusnya. Catatan `calendar_sync_health`:

```
last_degraded_reasons: ["page_fallback", "detail_fallback"]
last_events_succeeded: 167 / last_events_total: 167
last_primary_probe_error: "HTTP 403"
```

Seluruh 167 event berhasil diambil detailnya — nol kegagalan. Yang membuat
snapshot tercap *degraded* adalah **rutenya**: origin utama membalas 403, jadi
sync berjalan lewat origin fallback (IP). Isi yang disajikan sama dan lolos
`validatePublicCalendarSnapshot`, tetapi `degradedSnapshot` memperlakukan
"lewat rute cadangan" sebagai "data tak layak dipercaya", lalu mengunci penyapu
sekaligus mencegah kandidat stale ditulis. Selama 403 bertahan, penyapu tak akan
pernah jalan.

## Arah yang dicoret: mengunci `id` ke `jadwal_id`

Terlihat menggoda — `jadwal_id` stabil terhadap penomoran ulang — dan **salah**.

Uji pada satu snapshot yang sama menemukan 7 kombinasi (tanggal, tipe,
`jadwal_id`) yang memuat dua baris dengan `synced_at` identik, contoh:

```
2026-12-21 | keberangkatan | JBU1542 -> grp69 pax40 | grp70 pax45
```

Itu dua kloter berbeda yang sah-sah saja memetakan ke satu jadwal. Mengunci `id`
ke `jadwal_id` akan melebur keduanya menjadi satu dan menghilangkan satu kloter
asli secara diam-diam.

Sebaliknya, `group_number` tidak pernah menunjuk lebih dari satu jadwal di
(tanggal, tipe) yang sama — 0 kasus. Jadi `group_number` **unik dalam satu
snapshot** dan hanya bermasalah **lintas waktu**. Kesimpulannya: kuncinya tidak
salah; penyapunya yang lumpuh. Skema `id` tidak diubah.

## Rancangan

Seluruh perubahan di `syncCalendar` (`calendar-api.js:328`). Tidak ada perubahan
skema, tidak ada migrasi SQL.

### Jalur 1 — stale-delete berlingkup per-event

`resolvePublicEventRows` (`calendar-api.js:167`) sudah memegang semua yang perlu
diketahui tentang satu event. Ia menambahkan dua nilai ke hasilnya:

- `eventKey` — `${event.date}_${event.type}`
- `authoritative` — `!failedKey && fallbackUsed === 0 && emptyDetails === 0 && rows.length > 0`

Perhatikan `detailUsesFallback` **tidak** ikut menentukan `authoritative`. Itu
soal rute, bukan mutu data.

Setelah seluruh upsert sukses, untuk tiap event key yang `authoritative`: setiap
baris basis data pada (tanggal, tipe) itu yang tidak ada di himpunan id segar
adalah hantu dan langsung dihapus — **tanpa konfirmasi dua-langkah**. Buktinya
lokal dan langsung: daftar grup lengkap untuk tanggal dan tipe itu baru saja
dibaca dari sumber. Jalur ini menangkap penomoran ulang, perpindahan tanggal,
dan pembatalan kloter.

Id berawalan `_DEMO_` tetap kebal, sama seperti perilaku sekarang.

### Jalur 2 — stale-delete global untuk event key yang lenyap

Hanya untuk event key yang **sama sekali tidak muncul** di snapshot. Buktinya
diganti: bukan lagi "id tidak ada di `freshIds`", melainkan "`tanggal_tipe`
tidak ada di daftar event halaman":

```js
const snapshotKeys = new Set(filtered.map(e => `${e.date}_${e.type}`));
const globalStale = existingRows.filter(r => !snapshotKeys.has(`${r.event_date}_${r.event_type}`));
```

Perbedaannya penting. Dengan aturan lama, satu event yang gagal diambil
detailnya membuat seluruh barisnya tampak hantu — itulah sebabnya
`failedEventKeys.size > 0` harus memblokir semuanya. Dengan aturan baru,
kegagalan detail sama sekali tidak relevan terhadap pertanyaan "apakah event ini
masih ada", sehingga gerbangnya bisa dilepas tanpa mengorbankan keamanan.

Konfirmasi dua-langkah via `calendar_stale_candidates` **dipertahankan** di jalur
ini, karena bukti "absen dari daftar" lebih lemah daripada bukti per-event.

`existingRows` (`calendar-api.js:461`) perlu ikut mengambil `event_date` dan
`event_type`, bukan hanya `id, raw_data`.

### Pemisahan rute vs mutu data

`degradedSnapshot` yang sekarang mencampur dua hal berbeda. Dipisah menjadi:

- **Rute** — `page_fallback`, `detail_fallback`. Tidak memblokir penghapusan apa
  pun. Origin fallback menyajikan isi yang sama lewat IP.
- **Mutu data** — dinilai **per event** lewat `authoritative`, bukan global. Satu
  event yang direkonstruksi dari `umroh_schedules` hanya menonaktifkan
  penghapusan untuk dirinya sendiri.

`degradedReasons` pada nilai balik sync tetap melaporkan alasan rute seperti
sekarang; yang berubah hanya kuasanya memblokir penghapusan.

### Pagar keamanan

- Jalur per-event: himpunan segar wajib berisi minimal satu baris (sudah
  tercakup `authoritative`).
- Jalur global: pagar rasio `CALENDAR_PUBLIC_MAX_STALE_DELETE_RATIO` (25%) tetap,
  **tapi dihitung hanya atas himpunan stale global**. Penghapusan per-event
  sengaja tidak masuk hitungan — bila ikut, backlog 62% akan menggagalkan sync
  dan mengunci pembersihan lagi, persis seperti bug aslinya.
- Ops alert bila satu run menghapus lebih dari 50 baris, agar drain pertama
  terlihat dan lonjakan tak wajar di kemudian hari ketahuan. Alert ini
  informatif; ia **tidak** memblokir penghapusan dan tidak menggagalkan sync.
- Tiap penghapusan dicatat ke log beserta event key dan jumlahnya.

### Kerugian bila terjadi salah hapus

Baris `calendar_events` adalah turunan penuh dari hasil scrape; sync berikutnya
menciptakannya ulang. Satu-satunya yang hilang permanen adalah nama MUTAWIF yang
dipertahankan dari baris lama (`calendar-api.js:485`) ketika sumber mengirim
placeholder. Itu risiko yang diterima.

## Eksekusi dan verifikasi

Tidak ada `DELETE` manual ke produksi. Kode sync yang sudah diperbaiki yang
membersihkan — jalur yang membersihkan sama persis dengan jalur yang menjaganya
tetap bersih, sehingga drain pertama sekaligus menjadi buktinya.

1. Deploy (restart `server.js`). Sync otomatis jalan 60 detik setelah start
   (`server.js:25078`), lalu tiap 12 jam.
2. Run pertama membersihkan **455 baris** lewat jalur per-event, termasuk seluruh
   duplikat yang terlihat di dashboard.
3. **19 baris** sisa pada 6 event key yang lenyap masuk jalur global. Run pertama
   mencatatnya sebagai kandidat — `calendar_stale_candidates` akhirnya lahir —
   dan run kedua menghapusnya (12 jam berikutnya, atau langsung bila server
   di-restart sekali lagi setelah run pertama selesai).
4. Verifikasi: hitung kombinasi (tanggal, tipe, `jadwal_id`) yang memuat lebih
   dari satu baris. Target turun dari **140 menjadi 7**. Sisa 7 itu justru yang
   benar — kloter kembar sah pada JBU1542.

Perbaikan ini melepas ketergantungan penyapu pada origin utama. HTTP 403 boleh
berlanjut tanpa mematikan pembersihan.

### Angka yang divalidasi sebelum implementasi

Simulasi aturan "per event key, pertahankan hanya baris dari snapshot terbaru"
atas data produksi:

- 171 event key; 165 tersentuh sync terakhir, 6 tidak (19 baris).
- Dipertahankan 277, dihapus 455 dari 732. Angka 455 lebih besar daripada 446
  "baris berlebih" di bagian Bukti karena keduanya mengukur hal berbeda: 446
  menghitung kelebihan pada kombinasi (tanggal, tipe, `jadwal_id`), sedangkan 455
  mencakup pula baris basi yang bukan duplikat menurut ukuran itu — misalnya
  baris yang jadwalnya pindah tanggal sehingga tak punya pasangan sejadwal.
- Dari 10 baris terhapus yang `jadwal_id`-nya tak punya pengganti segar di
  (tanggal, tipe) yang sama: **8 pindah tanggal** (JBU1560 manasik 22→23 Agu,
  JBU1537 manasik 12→13 Sep, dan seterusnya) dan **2 milik JBU1568**, jadwal yang
  sudah tidak ada lagi di `umroh_schedules` alias dibatalkan hulu. Semuanya benar
  untuk dihapus.
- Tidak ada event key lampau yang tertinggal (0 dari 6 key yang tak tersentuh
  berada di masa lalu), yang menegaskan sumber masih menyajikan event lampau.
  Karena itu "key absen dari snapshot" adalah sinyal nyata, bukan sekadar sumber
  memangkas riwayat.

## Pengujian

Di `tests/calendar-public-sync.test.js`, memakai harness fake Supabase yang sudah
ada (`existingCalendarIds`, `staleCandidates`, `deletedIds`, `deleteAttempts`):

1. **Penomoran ulang bersih dalam satu run** — baris lama grup 35, snapshot
   mengembalikan grup 33 pada (tanggal, tipe) yang sama → 35 terhapus, 33
   bertahan, satu run saja. Pemetaan langsung dari keluhan yang dilaporkan.
2. **Rute fallback tidak memblokir** — `page_fallback` dan `detail_fallback`
   aktif, penghapusan per-event tetap berjalan.
3. **Event ber-schedule-fallback tidak menghapus apa pun**, sementara event lain
   pada run yang sama tetap dibersihkan.
4. **Detail gagal → baris event itu selamat**, dan tidak dianggap hantu oleh
   jalur global.
5. **Dua kloter satu jadwal sama-sama selamat** (grup 69 dan 70 → JBU1542).
   Penjaga regresi terhadap jebakan peleburan yang dicoret di atas.
6. **Jalur global tetap dua-langkah** — run pertama mencatat, run kedua menghapus.
7. **Rasio 25% hanya menghitung stale global** — penghapusan per-event masif
   tidak menggagalkan sync.

Tiga tes yang sudah ada memaku perilaku yang justru merupakan bugnya:

- `syncCalendar deletes a stale row only after two complete primary snapshots`
  (`tests/calendar-public-sync.test.js:717`) — memakai baris basi pada event key
  yang **sama** dengan baris segar, yaitu kasus per-event, yang kini tuntas dalam
  satu run. Kasus dua-langkah yang sesungguhnya dipindahkan ke fixture baru
  dengan event key yang benar-benar absen dari snapshot.
- `syncCalendar skips stale-delete when the public page uses the fallback origin`
  (`tests/calendar-public-sync.test.js:752`)
- `syncCalendar skips stale-delete when modal details use the fallback origin`
  (`tests/calendar-public-sync.test.js:822`)

Ketiganya ditulis ulang untuk menegaskan invarian baru — rute cadangan tidak
memblokir, mutu data per-event yang memblokir — bukan dilonggarkan sampai hijau.
Hasil tulis ulang dibuktikan lewat uji mutasi.

Perhatian khusus pada dua tes rute: bila hanya dibiarkan apa adanya, keduanya
tetap **hijau** setelah perbaikan, tetapi karena alasan yang salah — bukan lagi
karena rute memblokir, melainkan karena konfirmasi dua-langkah jalur global belum
terpenuhi pada run pertama. Itu persis pola penjaga yang basi diam-diam, jadi
keduanya wajib ditulis ulang memakai baris hantu di event key yang segar.
