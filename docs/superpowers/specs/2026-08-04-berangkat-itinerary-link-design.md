# Link itinerary yang bisa disalin di detail Berangkat Mendatang

Tanggal: 2026-08-04
Status: disetujui, siap diimplementasikan

## Masalah

Detail grup di kartu "Berangkat Mendatang"
([src/components/berangkat/BerangkatGroupViews.tsx](../../../src/components/berangkat/BerangkatGroupViews.tsx))
menampilkan tanggal berangkat, kode penerbangan, tour leader, manasik, dan
daftar jamaahnya — tapi tidak ada jalan dari situ ke itinerary paket. Padahal
justru di layar inilah agen sedang menyiapkan keberangkatan dan perlu
mengirimkan jadwal harian ke jamaahnya.

Halaman share publiknya sudah ada sejak 2026-07-30 (`/:slug/:jadwalId/itinerary`,
lihat [spec tampilan web itinerary](2026-07-30-itinerary-web-view-design.md)),
tapi satu-satunya tombol salin ada di dalam `ItineraryModal` — yang harus
dibuka dari kartu paket, bukan dari daftar keberangkatan.

## Ruang lingkup

Menambahkan satu baris aksi "Salin Link Itinerary" di header detail grup, di
kedua layar yang memakai komponen itu (kartu kalender `/dashboard` dan kartu
Statistik). Tidak mengubah baris jamaah, daftar ringkasan grup, maupun halaman
share itu sendiri.

## Keputusan desain

| Keputusan | Pilihan | Alasan |
|---|---|---|
| Ketersediaan itinerary | Dicek di server, ikut payload | Agen tidak boleh menyalin link yang di sisi jamaah berbunyi "Itinerary belum tersedia". Satu query ringan mengalahkan probe per grup di klien. |
| Aksi | Salin saja | Sesuai permintaan. Buka-tab dan `navigator.share` sengaja ditahan (YAGNI). |
| Saat itinerary belum ada | Chip abu "Itinerary belum ada" | Meniru pola `WA kosong` yang sudah ada di file yang sama — bedanya kentara tanpa perlu penjelasan. |
| URL mentah | **Ditampilkan** (revisi 2026-08-04) | Rancangan awal menyembunyikannya dengan alasan kepadatan; pengguna menolak tombol selebar penuh dan meminta URL-nya kelihatan. Agen jadi tahu persis apa yang akan dikirim ke jamaah sebelum menyalin. Skema `https://` dibuang dari **tampilan** saja — yang disalin tetap URL utuh. |

## Arsitektur

### 1. `itinerary_ready` — satu sumber di server

[lib/berangkat-enrich.js](../../../lib/berangkat-enrich.js) sudah menjadi satu
satunya pengaya baris untuk `/api/calendar/berangkat-mendatang` (dashboard) dan
`/api/laporan/stats` (Statistik). Sinyal ketersediaan ditaruh di sana supaya
kedua layar tak pernah menyimpang — alasan yang sama file itu dibuat.

- `loadEnrichedBerangkatRows()` menambah satu query, berdampingan dengan query
  `calendar_events` yang sudah ada:
  `supabase.from('itineraries').select('jadwal_id').in('jadwal_id', jadwalIds)`.
  Tabel `itineraries` adalah sumber yang sama yang dibaca halaman share lewat
  `/api/itinerary/:jadwalId`, jadi "ada barisnya" = "halaman share akan tampil".
- Gagal query = fail-soft seperti kalender: `itinerary_ready` jadi `false` untuk
  semua baris dan daftar keberangkatan tetap tampil. Daftar tanpa tombol salin
  lebih berguna daripada daftar yang hilang.
- `enrichBerangkatRows()` tetap murni: ia menerima `itineraryJadwalIds`
  (array/Set id) sebagai opsi dan menyetel `itinerary_ready` per baris, jadi
  bisa diuji tanpa mock Supabase.

### 2. Grup membawa identitasnya sendiri

`buildBerangkatGroups()` di
[lib/berangkat-groups.js](../../../lib/berangkat-groups.js) memakai `jadwal_id`
sebagai `key` **kalau ada**, dan jatuh ke kunci gabungan
`paket|tgl|kode_penerbangan` kalau tidak. Menebak `jadwal_id` dari `key` karena
itu akan menghasilkan URL sampah untuk grup tanpa jadwal.

Objek grup mendapat dua field eksplisit:

- `jadwal_id: item.jadwal_id || null`
- `itinerary_ready: !!item.itinerary_ready`

Keduanya diambil dari item pertama grup — semua item satu grup berbagi
`jadwal_id` yang sama menurut definisi kuncinya.

### 3. UI

`BerangkatGroupDetail` menerima prop opsional `agentSlug`. Di bawah grid meta
di header, satu baris:

- `agentSlug && group.jadwal_id && group.itinerary_ready` → kotak berisi URL
  share (kiri, `truncate`, `title` memuat URL utuh) + tombol **"Copy"** (kanan,
  `shrink-0`) yang berubah jadi **"Tersalin"** + ikon `Check` selama 2 detik.
- Selain itu → chip abu **"Itinerary belum ada"**.

Gaya tombolnya mengikuti tombol Chat WA di file yang sama (border tipis, teks
10px, `active:scale-95`), supaya keduanya terbaca sekeluarga.

Perilaku salin disalin dari `ItineraryModal`:

```
const url = `${window.location.origin}/${agentSlug}/${group.jadwal_id}/itinerary`;
try { await navigator.clipboard.writeText(url); }
catch { window.prompt('Salin link:', url); return; }   // clipboard ditolak / bukan secure context
```

Event analitiknya `trackEvent('action', 'copy_itinerary_link', { paket })` —
sudah terdaftar di `ACTION_LABELS` server.js, jadi tak ada perubahan di sisi
analitik.

### 4. Penyaluran `agentSlug`

`<UpcomingSchedule />` saat ini dirender tanpa props sama sekali dari
`DashboardLayout`. Prop `agentSlug` diturunkan:

```
DashboardLayout (agentData.slug)
  └─ UpcomingSchedule
       ├─ BerangkatGroupDetail
       └─ ItineraryModal
StatistikPage (sudah punya prop agentSlug)
  └─ BerangkatGroupDetail
```

Efek samping yang diperbaiki sekalian: tombol salin di dalam `ItineraryModal`
yang dibuka dari kartu kalender **saat ini mati** — `shareUrl` bernilai null
karena `agentSlug` tak pernah dioper. Sekali prop itu mengalir, tombol itu hidup
tanpa perubahan lain.

## Pengujian

- `tests/berangkat-groups.test.js` — grup mengekspos `jadwal_id` dan
  `itinerary_ready`; grup berkunci gabungan tetap `jadwal_id: null`.
- `tests/berangkat-enrich.test.js` (baru) — `enrichBerangkatRows()` menyetel
  `itinerary_ready` sesuai keanggotaan `itineraryJadwalIds`, dan `false` saat
  daftarnya kosong (jalur fail-soft).
- `npm run build` + `tests/laporan-stats.test.js` (uji whitebox teks-sumber yang
  gampang merah kalau kode berpindah file).
- Uji end-to-end di browser dijalankan pengguna.
