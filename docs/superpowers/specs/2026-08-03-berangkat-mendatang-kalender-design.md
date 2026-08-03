# Berangkat Mendatang di kartu kalender dashboard

Tanggal: 2026-08-03
Status: disetujui, siap diimplementasikan

## Masalah

Kartu kalender di `/dashboard` ([src/components/UpcomingSchedule.tsx](../../../src/components/UpcomingSchedule.tsx))
tidak memberi tahu apa pun tentang keberangkatan sampai penggunanya menekan
sebuah tanggal. Informasi yang dicari — paket apa yang berangkat dalam waktu
dekat dan berapa jamaah kita di dalamnya — sudah ada di halaman Statistik
sebagai kartu "Berangkat Mendatang", satu tab jauhnya.

## Ruang lingkup

Menambahkan section "Berangkat Mendatang" di dalam kartu kalender dashboard,
di bawah legend. Tidak mengubah grid kalender, bottom sheet tanggal, maupun
kartu Berangkat Mendatang di Statistik.

## Keputusan desain

| Keputusan | Pilihan | Alasan |
|---|---|---|
| Jendela waktu | Tetap 60 hari ke depan | Sama dengan Statistik; menjawab "apa yang akan datang". Tidak ikut navigasi bulan kalender. |
| Struktur | Section di bawah legend, preview 3 paket | Terbaca tanpa tap, tinggi kartu bertambah ±150px saja. |
| Sumber data | Endpoint ringan baru | `/api/laporan/stats` ~12 query dan ada di belakang `dbLoadShedGuard`. |
| Interaksi | Bottom sheet di kartu yang sama | Pola sheet sudah ada di komponen ini; pengguna tidak keluar dari dashboard. |

### Perbedaan skop yang harus dijaga

Angka di grid kalender adalah **pax kloter nasional** (`pax_terisi`), sedangkan
angka di section baru adalah **jamaah milik agen ini** (`agent_id`-scoped).
Untuk kloter yang sama, dua angka itu berbeda dan memang seharusnya berbeda.
Karena itu section diberi judul dan sub-baris ringkasannya sendiri
("119 jamaah · 23 paket · 60 hari ke depan"), bukan disatukan ke dalam grid.

## Arsitektur

### 1. Endpoint baru — `GET /api/calendar/berangkat-mendatang`

Di `server.js`, `authMiddleware` saja (tanpa `dbLoadShedGuard` — payloadnya kecil
dan query-nya sedikit).

```
todayStr  = getWIBDateStr()
windowEnd = todayStr + 60 hari

1. supabase.from('jamaah')
     .select('nama, paket, jk, tgl_berangkat, sisa, bayar, wa, id_jadwal:raw_data->>id_jadwal')
     .eq('agent_id', agentId)
     .gte('tgl_berangkat', todayStr)
     .lte('tgl_berangkat', windowEnd)        ← batas atas; bebQ di /stats tidak punya ini
     .order('tgl_berangkat').order('nama')
   dibungkus excludeBelumDP() dan fetchAllRows()
2. getScheduleDetailMap()                     ← sudah ber-cache (SCHEDULE_CACHE_TTL_MS)
3. calendar_events (jadwal_id, tour_leader) untuk id_jadwal yang terpakai
4. buildBerangkatMendatang(enrichedRows, todayStr)   ← lib/laporan-stats.js
```

Response:

```json
{ "success": true,
  "data": { "berangkatBulanIni": [...], "berangkatBulan": "60 hari ke depan" } }
```

Aturan yang harus ditiru persis dari `/api/laporan/stats` supaya angka dua
layar tidak pernah berbeda:

- `excludeBelumDP` = `.or('bayar.gt.0,sisa.eq.0,sisa.is.null')` — prospek yang
  belum bayar sepeser pun tidak ikut dihitung.
- **Tanpa** filter `hijriah_year`. Daftar ini operasional dan melintasi batas
  tahun Hijriah (13 Jun 2026 = 1447H, 18 Jun 2026 = 1448H).
- Ambil `event_date` paling awal per `jadwal_id` saat memetakan `tour_leader`.
- Kegagalan query `calendar_events` di-`console.warn` lalu diteruskan tanpa
  tour leader — bukan melempar error.

Cache: pakai `statsCacheGet`/`statsCacheSet` dengan kunci
`berangkat:${agentId}`, sama seperti endpoint stats.

### 2. Logika bersama — `lib/berangkat-groups.js` + `.d.ts` (baru)

Mengikuti konvensi yang sudah ada di repo ini (`lib/teras-linkify.js` +
`lib/teras-linkify.d.ts`, di-import dari `src/components/` sebagai
`../../lib/teras-linkify.js`). ESM JavaScript polos supaya bisa diuji langsung
oleh berkas di `tests/`, dengan `.d.ts` tulisan tangan sebagai tipenya.

Dipindahkan apa adanya dari `StatistikPage.tsx`, tanpa perubahan perilaku:

- `SAUDI_DESTINATION_FLAG`, `EXTRA_DESTINATION_FLAGS`, `getDestinationFlags`
- `buildBerangkatGroups`
- `cleanTourLeader` (salinan milik StatistikPage; salinan di `FlightStatusCard.tsx`
  dan `FlightSharePage.tsx` **tidak** disentuh — di luar ruang lingkup)
- `fmtTglLong`, `fmtTgl`, `fmtHariLagi`

`.d.ts` mengekspor tipe `BerangkatItem`, `BerangkatGroup`, `DestinationFlag`.

`StatistikPage.tsx` meng-import dari modul ini dan salinan lokalnya dihapus.

### 3. Komponen bersama — `src/components/berangkat/BerangkatGroupViews.tsx` (baru)

Dipindahkan apa adanya dari `StatistikPage.tsx`:

- `DestinationFlags`
- `BerangkatGroupSummaryRow`
- `BerangkatGroupDetail`
- `BerangkatRow`, `GroupMeta` (dipakai oleh `BerangkatGroupDetail`)

`WaIcon` ikut pindah karena `BerangkatRow` memakainya. Salinan `WaIcon` di
komponen lain tidak disentuh.

Dua layar memakai satu komponen. Kalau tampilan baris berubah, berubah di
kedua tempat sekaligus.

### 4. `UpcomingSchedule.tsx`

State baru, terpisah penuh dari state kalender:

```ts
const [berangkat, setBerangkat] = useState<BerangkatResponse | null>(null);
const [berangkatLoading, setBerangkatLoading] = useState(true);
const [showAllGroups, setShowAllGroups] = useState(false);
const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
```

Fetch sekali saat mount, **tidak** ikut `currentMonth`. Grid kalender tetap
render duluan; section menyusul dengan skeleton 3 baris.

Render section:

- `berangkatLoading` → skeleton 3 baris
- selesai, `groups.length === 0` → section tidak dirender sama sekali
- ada isi → sub-header + `groups.slice(0, 3)` + tombol "Lihat lainnya" bila
  `groups.length > 3`

Sub-header: label `BERANGKAT MENDATANG` + sub-baris + ikon `Plane` biru di kanan.
Sub-baris disusun persis seperti di Statistik:
`${berangkatBulanIni.length} jamaah · ${groups.length} paket · ${berangkatBulan}`
— jadi jumlah jamaah dihitung per orang, jumlah paket per grup.

### 5. Bottom sheet

Komponen ini sudah punya satu bottom sheet (untuk tanggal kalender). Sheet baru
memakai markup dan animasi yang sama (`framer-motion`, `y: '100%'` → `0`,
`max-h-[70vh]`), tetapi **state-nya terpisah** — sheet tanggal dan sheet
berangkat tidak boleh saling menutup.

- tap baris → sheet "Detail Keberangkatan" berisi `BerangkatGroupDetail`
- tap "Lihat lainnya" → sheet "Berangkat Mendatang" berisi seluruh grup
- dari sheet daftar, tap baris → berpindah ke sheet detail

`document.body.style.overflow` sudah dikunci oleh `selectedDay`; kunci itu
harus diperluas agar juga berlaku saat salah satu sheet baru terbuka, dan
dilepas hanya ketika semuanya tertutup.

## Penanganan galat

| Keadaan | Perilaku |
|---|---|
| Endpoint gagal / non-2xx | Section tidak dirender. Kalender tetap normal. Tidak ada pesan galat. |
| Agen belum pernah sync | `berangkatBulanIni` kosong → section tidak dirender. |
| `calendar_events` gagal | Tour leader kosong di sheet detail (`-`), sisanya tetap tampil. |
| Paket tanpa `jadwal_id` | `buildBerangkatGroups` memakai kunci gabungan `paket|tgl|kode` — sudah tertangani. |

Section yang hilang diam-diam adalah perilaku yang dipilih: kartu ini widget
dashboard, bukan halaman laporan. Galat sinkronisasi sudah punya tempatnya
sendiri di Statistik.

## Pengujian

Uji unit untuk yang murni logika (`lib/laporan-stats.js` sudah punya berkas uji
padanannya — ikuti pola yang ada):

- `buildBerangkatGroups`: pengelompokan per `jadwal_id`; fallback kunci
  gabungan saat `jadwal_id` null; urutan berdasarkan tanggal lalu nama paket
- `getDestinationFlags`: satu negara, banyak negara, tanpa kecocokan → Saudi

Verifikasi cepat (bukan e2e — pemilik repo yang menjalankan uji menyeluruh):

- `node --check server.js`
- `npx tsc --noEmit` — catatan: proyek ini sudah punya ~6 galat tsc bawaan;
  yang dinilai adalah tidak bertambahnya galat baru
- `npm run build`

## Catatan penerapan

`server.js` **tidak** hot-reload. Endpoint baru tidak akan ada (404 senyap)
sampai server di-deploy ulang. Bedakan 404 dari 401 dengan `curl` saat
memeriksa.
