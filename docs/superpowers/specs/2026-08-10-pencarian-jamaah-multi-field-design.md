# Pencarian Jamaah multi-field (Umroh + Haji)

Tanggal: 2026-08-10
Status: disetujui, siap implementasi

## Masalah

Di `/dashboard/jamaah`, agent merasa kotak pencarian hanya bisa mencari nama.

Kenyataannya endpoint Umroh sudah mencari tiga kolom (`server.js` — `nama`,
`id_umroh`, `wa`) dan endpoint Haji sudah mencari enam. Yang gagal adalah
**pencocokan nomor telepon**, karena dicocokkan mentah dengan `ilike %input%`
sementara format simpanan tidak seragam.

Probe read-only ke produksi (2026-08-10):

| Tabel | Kolom | Total baris non-null | `62…` | `0…` | `8…` | lain |
|---|---|---|---|---|---|---|
| `jamaah` | `wa` | 5.428 | 5.185 | 196 | 1 | 46 |
| `jamaah_haji` | `telp` | 1.806 | 1.704 | 90 | 7 | 5 |

Seluruh nilai berupa **digit murni tanpa pemisah**. Jadi agent yang mengetik
`0812…` hanya menjangkau ~4% baris, dan yang mengetik `62812…` melewatkan
sisanya. Karena tidak ada pemisah di data, ini bisa dibereskan sepenuhnya di
sisi query — tanpa migrasi DB.

Selain itu beberapa kolom yang berguna belum pernah dicari sama sekali:
`jm_id` (kode jamaah — identitas baris di sistem), `no_paspor`, dan `paket`.

## Cakupan

Kedua tab pada halaman yang sama: **Umroh** dan **Haji**. Membiarkan salah satu
tertinggal membuat perilaku pencarian terasa tidak konsisten saat berpindah tab.

## Keputusan desain

### 1. Umroh menyaring di memori, Haji tetap di DB

Endpoint Umroh (`GET /api/laporan/jamaah`) **sudah** menarik seluruh baris agent
(`query.range(0, 4999)`) tanpa syarat, lalu menyaring di memori lewat
`filterUmrohRowsInMemory`. Filter `packageFilter` di fungsi itu bahkan sudah
menggabungkan `row.paket` dengan nama jadwal dari `scheduleMap` menjadi satu
haystack.

Menaruh pencarian di tempat yang sama berarti:

- nama jadwal (`jadwal_nama`, hasil enrich — **bukan** kolom DB) ikut tercari
  tanpa kerja tambahan;
- beban terburuk tidak bertambah, karena pengambilan penuh itu memang sudah
  terjadi di setiap request; yang hilang hanya penyempitan payload saat ada
  pencarian.

Konsekuensi yang harus dijaga: tanpa penyempitan di DB, pencarian hanya melihat
baris yang masuk plafon `range(0, 4999)`. Probe 2026-08-10 menunjukkan agent
terbesar punya **1.047 baris** (`hijriah_year >= 1447`), dari 61 agent dan 5.441
baris total — masih jauh di bawah plafon. Bila suatu saat ada agent yang
mendekati 5.000 baris, plafon itu harus dinaikkan atau pencarian dikembalikan ke
DB, karena hasil akan terpotong diam-diam.

Endpoint Haji (`GET /api/haji/jamaah`) dipaginasi di DB (`count: 'exact'` +
`.range(from, to)`). Mengubahnya ke penyaringan memori berarti membongkar
paginasinya — tidak sepadan, dan Haji tidak butuh enrich nama jadwal. Untuk Haji
cukup perluas `.or()`-nya.

Alternatif yang ditolak:

- **Dua-duanya di DB.** Paling kecil perubahannya, tapi nama jadwal tidak bisa
  dicari (hanya `paket`) — padahal nama jadwal itulah yang tampil di kartu
  jamaah, jadi agent akan mengetik apa yang dilihatnya dan tidak dapat hasil.
- **Kolom ternormalisasi + index trigram.** Paling cepat bila data tumbuh besar,
  tapi butuh SQL manual di Supabase SQL Editor dan tetap tidak menyelesaikan
  nama jadwal.

### 2. Aturan pencocokan nomor

Input dibersihkan menjadi digit saja (`+`, spasi, `-`, `.`, `()` dibuang), lalu
awalan `62` atau `0` dilepas menjadi **inti** nomor. Baris cocok bila digit
tersimpan mengandung inti tersebut.

Satu term ini menangani semua arah sekaligus: `0812345678` dan `62812345678`
sama-sama mengandung `812345678`, jadi tidak perlu membangun daftar varian.

Term nomor **hanya aktif** bila input murni karakter nomor **dan** intinya
≥ 4 digit. Tanpa ambang itu, mengetik `8` mencocokkan hampir semua baris dan
mengubur hasil nama.

Nomor asing (`971…`, `601…`) tidak punya bentuk kanonik Indonesia; nomor itu
tetap ditemukan lewat term teks, yang selalu ikut diterapkan.

### 3. Aturan pencocokan teks

Substring tanpa peduli besar-kecil huruf. Input multi-kata diperlakukan **apa
adanya sebagai satu potongan** — tidak dipecah per kata. Ini mempertahankan
perilaku pencarian nama yang sudah ada persis seperti sekarang.

Field per tab:

| Tab | Field teks | Field nomor |
|---|---|---|
| Umroh | `nama`, `id_umroh`, `jm_id`, `no_paspor`, `paket`, nama jadwal | `wa` |
| Haji | `nama`, `id_haji`, `id_jamaah`, `nomor_porsi`, `nomor_spph`, `no_paspor`, `paket`, `paket_detail` | `telp` |

### 4. Logika pencocokan tinggal di `lib/`, bukan `server.js`

`server.js` tidak bisa di-import di tes, sehingga logika di dalamnya hanya bisa
diuji lewat pencocokan teks sumber — rapuh dan bisa basi diam-diam tanpa
memerahkan tes. Semua keputusan pencocokan karena itu ditaruh di modul murni.

## Arsitektur

Modul baru **`lib/jamaah-search.js`**, murni, tanpa dependensi:

- `buildJamaahSearchNeedle(input)` → `{ text, phone } | null`
  - `text`: input yang sudah di-trim dan di-lowercase
  - `phone`: inti nomor, atau `null` bila input bukan karakter nomor murni atau
    intinya < 4 digit
  - mengembalikan `null` bila input kosong / hanya spasi
- `matchesUmrohJamaahSearch(row, needle, scheduleMap)` → boolean
  Dipanggil dari `filterUmrohRowsInMemory`.
- `buildJamaahSearchOrFilter(input, { textColumns, phoneColumns })` → string
  `.or()` PostgREST atau `null`. Memakai needle yang sama, plus escaping
  metakarakter `,()*%`.

Perubahan di `server.js`:

- **Umroh** — hapus blok `.or()` pencarian; oper `search` ke
  `filterUmrohRowsInMemory` sebagai `searchQuery`, diterapkan **sebelum**
  pengelompokan belum-DP sehingga paginasi grup tidak berubah.
- **Haji** — ganti `.or()` pencarian dengan pemanggilan
  `buildJamaahSearchOrFilter`. Escaping pindah ke lib; saat ini ada dua salinan
  `escapePostgrestFilterValue` (satu global, satu lokal di dalam handler haji).

Perubahan di `src/components/JamaahPage.tsx`: teks placeholder kedua tab diubah
dari `Cari jamaah...` menjadi teks yang menyebut kemampuan barunya. Kalau agent
tidak tahu bisa mencari pakai WA, fitur ini tidak akan terpakai.

## Kasus tepi

- Input hanya spasi dianggap tidak ada pencarian. Saat ini `if (search)` belum
  melakukan trim.
- 143 baris `wa` hanya 1 digit (data sampah). Ambang 4 digit membuatnya tidak
  pernah mengganggu hasil.
- Grup belum-DP yang hanya sebagian anggotanya cocok tetap menampilkan anggota
  yang cocok saja — perilaku sama seperti sekarang.
- `row.raw_data?.id_jadwal` boleh tidak ada; lookup `scheduleMap` menghasilkan
  string kosong dan tidak melempar.

## Pengujian

`tests/jamaah-search.test.js`, unit murni terhadap modul lib:

1. `0812345678`, `62812345678`, `+62 812-345-678`, dan `812345678` semuanya
   menemukan baris yang tersimpan sebagai `62812345678`.
2. Baris yang tersimpan sebagai `0812345678` ditemukan saat mengetik `62812…`.
3. Input pendek (`8`, `812`) tidak mengaktifkan term nomor.
4. Input bercampur huruf tidak mengaktifkan term nomor.
5. Cocok pada `jm_id`, `no_paspor`, `paket`, dan nama jadwal — tanpa peduli
   besar-kecil huruf.
6. Nama jadwal berasal dari `scheduleMap`, bukan dari kolom baris.
7. `buildJamaahSearchOrFilter` meng-escape `,()*%` dan menghasilkan kolom teks
   dan nomor yang benar.
8. Input kosong / hanya spasi menghasilkan `null` (tidak ada filter).
