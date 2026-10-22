# Spec: Menu "Calon Haji 2027" di Dashboard

**Tanggal:** 2026-10-22
**Status:** Disetujui per bagian di chat (brainstorm + mockup); menunggu tinjauan spec tertulis
**Mockup:** Pencil `Haji2027.pen` (`~/.pencil/documents/0a1b254c-ce75-4aa9-83cc-686310093cc2/Haji2027.pen`)
— frame **01 · Dashboard Home**, **02 · Haji 2027 — Semua**, **03 · Haji 2027 — Cadangan + Filter Sheet**.
Mockup = acuan tata letak; nama/angka di frame 03 sebagian karangan.
**Sumber data:** PDF kantor "LAMPIRAN ESTIMASI" (contoh: `~/Downloads/LAMPIRAN ESIMASI 20 OCT.pdf`,
40 halaman, header "DATA JEMAAH — 19 OKTOBER 2026 · PIHK: PT. ALHIJAZ INDOWISATA · PIN: 3245 · Jumlah jemaah: 1416").

## 1. Masalah

Kantor berkala mengirim PDF daftar calon jamaah Haji Khusus 2027 milik PIHK Alhijaz. Tiap jamaah
berstatus **NON CADANGAN** (berhak pelunasan) atau **CADANGAN** (waiting list; naik bila jamaah
non-cadangan gagal pelunasan). Agent perlu melihat daftar ini untuk mengecek status jamaahnya.
Sekarang PDF itu hanya beredar sebagai berkas; tidak ada di Dashboard.

## 2. Keputusan dari brainstorm

| Pertanyaan | Keputusan |
|---|---|
| Siapa yang melihat | **Semua agent** (login) melihat **seluruh** daftar. Tidak dicocokkan ke agent pemilik. |
| Kegunaan utama | Agent mencari jamaahnya sendiri dan melihat statusnya. |
| Cara data masuk | User mengirim PDF baru ke Claude; Claude menjalankan skrip impor. **Tidak ada tombol unggah** di Dashboard. |
| Frekuensi update | Tidak tentu (mingguan–bulanan). Biasanya yang berubah hanya status cadangan. |
| Update baru | **Menimpa** data lama. Tanpa riwayat, tanpa tanda "naik status". |
| NIK | **Tampil utuh**, tidak disamarkan. |
| Bentuk menu | Kartu **lebar penuh (3 kolom)** di grid Dashboard, **pendek** (±64px vs kartu biasa 96px), di bawah baris Brosur · Tools · Hotel. |
| Nama menu | **"Calon Haji 2027"** (kartu + judul header halaman). |
| Ikon | Ka'bah — pakai ulang `src/components/bio/KaabaIcon.tsx`. |
| Judul/keterangan di halaman | **Tidak ada** judul besar "Calon Jamaah Haji 2027" maupun keterangan. Tidak ada baris "1.416 jamaah · urut …". |
| Ringkasan angka | Tiga ubin **Semua · Berhak Lunas · Cadangan** dengan jumlahnya, **sekaligus berfungsi sebagai tab** penyaring. |
| Bentuk daftar | **Tabel ringkas**, bukan kartu. Kolom: **No · Nama (baris 2: kab/kota · usia) · Status**. |
| Label status | **"Berhak Lunas"** (hijau, titik + teks) dan **"Cadangan"** (kuning). **Tanpa** nomor antrean cadangan. |
| Penulisan kota | Buang awalan "Kota " ("Kota Jakarta Timur" → "Jakarta Timur"). "Kab." tetap (Kota Bekasi ≠ Kab. Bekasi). |
| Tanda lunas | Jamaah dengan STATUS JEMAAH `LUNAS` diberi lencana kecil gelap **"✓ LUNAS"** di bawah label status, baik Berhak Lunas maupun Cadangan (8 orang di PDF contoh). |
| JKN "BELUM TERDAFTAR" | Masuk pil filter **"Tidak Ada"** (bersama `-`). |
| Detail | Ketuk baris → panel detail di bawahnya: No. Porsi, NIK, Tahap, Keterangan, JKN, Status Jemaah, Kab/Kota (lengkap), Provinsi. |
| Cari | Satu kotak: nama, no. porsi, atau NIK. |
| Filter | **Bottom sheet**: Provinsi, Kab/Kota, Kepesertaan JKN (Semua / Aktif / Belum Aktif / Tidak Ada). Tombol "Reset" + "Tampilkan N jamaah". Filter aktif ditandai angka kecil di pojok tombol filter + tombol hijau. |

## 3. Tujuan, non-tujuan, anti-tujuan

**Tujuan**
- Agent menemukan jamaah tertentu dalam beberapa detik (cari nama/porsi/NIK) dan langsung tahu: Berhak Lunas atau Cadangan.
- Daftar padat: ±14 baris terlihat dalam satu layar HP.
- Impor PDF baru oleh Claude cepat dan aman (jumlah baris tervalidasi terhadap header PDF).

**Non-tujuan**
- Mencocokkan ke data `jamaah_haji` / ke agent pemilik.
- Riwayat versi, diff antar-PDF, notifikasi perubahan status.
- UI unggah PDF, halaman admin.
- Musim selain 2027 (lihat §6 untuk ruang ke depan).

**Anti-tujuan** (gagal walau "jalan")
- Halaman memuat judul/keterangan/angka/tanggal yang sudah ditolak user.
- Impor yang diam-diam memotong baris atau salah membaca status (agent salah memberi tahu jamaah "berhak lunas").
- Data setengah-terimpor terlihat agent (daftar lama terhapus, daftar baru gagal masuk).

## 4. Data

### 4.1 Kolom PDF → kolom tabel

Satu baris PDF = satu jamaah. Kolom PDF (urut): No, TAHAP, NO PORSI, NIK, NAMA, KETERANGAN,
STATUS CADANGAN, KEPESERTAAN JKN, STATUS JEMAAH, USIA, PIN, PIHK, KAB/KOTA, PROVINSI.

| Kolom tabel | Dari PDF | Catatan |
|---|---|---|
| `no_urut` int | No | Urutan tampil = urutan PDF. |
| `tahap` int | TAHAP | Di PDF contoh semuanya 1. |
| `no_porsi` text | NO PORSI | 10 digit. |
| `nik` text | NIK | Biasanya 16 digit; **ada yang 15 dan 17** (baris 3: 15 digit; baris 679: 17 digit) — simpan apa adanya, jangan validasi panjang. |
| `nama` text | NAMA | Bisa terbungkus 2 baris di PDF → gabung dengan spasi. |
| `keterangan` text | KETERANGAN | `URUT PORSI` / `CADANGAN` / `LANSIA` (2 baris). Nilai lain → impor berhenti. |
| `status_cadangan` text | STATUS CADANGAN | `NON CADANGAN` / `CADANGAN`. **Sumber kebenaran** untuk Berhak Lunas vs Cadangan. |
| `kepesertaan_jkn` text null | KEPESERTAAN JKN | `AKTIF`, `TERDAFTAR, BELUM AKTIF` (terbungkus 2 baris di PDF; 81 baris), `BELUM TERDAFTAR` (19 baris), atau `-` → simpan `null`. Nilai mentah disimpan apa adanya; pil filter "Tidak Ada" = `null` + `BELUM TERDAFTAR`, "Belum Aktif" = `TERDAFTAR, BELUM AKTIF`. Nilai JKN di luar daftar ini → impor berhenti sebagai mencurigakan. |
| `status_jemaah` text | STATUS JEMAAH | `AKTIF` / `LUNAS` (nilai lain mungkin muncul — simpan apa adanya). |
| `usia` int | USIA | |
| `kab_kota` text | KAB/KOTA | Bisa terbungkus ("KOTA JAKARTA" + "TIMUR"). |
| `provinsi` text | PROVINSI | Bisa terbungkus ("SUMATERA" + "SELATAN"). **Normalisasi** huruf berspasi `B A N T E N` → `BANTEN`. |

PIN dan PIHK sama untuk semua baris (3245 / PT. ALHIJAZ INDOWISATA) — tidak perlu disimpan per baris.

Hitungan PDF contoh (dari ekstraksi teks kasar, perlu dikonfirmasi parser): 155 NON CADANGAN, 1.261 CADANGAN (hasil prototipe parser pdf-parse); JKN 81 "terdaftar, belum aktif", 19 "belum terdaftar"; STATUS JEMAAH `LUNAS` di 3 baris non-cadangan + 5 baris cadangan.

### 4.2 Penyimpanan

- Tabel baru, tidak di-scope per agent. Nama tabel/kolom final diserahkan ke pembangun; usulan: `calon_haji` dengan kolom `musim int` (= 2027) supaya musim berikutnya tidak butuh tabel baru. *(Keputusan Claude.)*
- Metadata impor (tanggal data dari header PDF, jumlah, waktu impor) disimpan — **tidak ditampilkan** di halaman, hanya untuk jejak dan validasi.
- File migrasi baru di `migrations/`. **DDL dijalankan user sendiri di Supabase SQL Editor** — Claude menyiapkan SQL-nya, bukan menjalankannya.
- DB lokal = produksi. Impor harus hati-hati: validasi dulu, tulis kemudian.

### 4.3 Impor

- Skrip Node di `scripts/` (mis. `scripts/import-calon-haji.mjs <path-pdf>`), memakai `pdf-parse` yang sudah ada di `package.json`.
- Logika parsing dipisah ke modul `lib/` yang murni (input teks → array baris) supaya bisa dites unit dengan fixture.
- **Wajib:** jumlah baris hasil parse == "Jumlah jemaah" di header PDF, dan `no_urut` berurutan 1..N tanpa lubang; kalau tidak, batal tanpa menulis apa pun.
- Mode `--dry-run` (default) mencetak ringkasan: jumlah per status_cadangan, per JKN, contoh 3 baris pertama/terakhir, baris yang mencurigakan. Penulisan hanya dengan flag eksplisit.
- Penggantian data harus **tidak memperlihatkan keadaan setengah jadi** ke agent (mis. tulis batch baru dengan id impor baru lalu hapus yang lama, atau fungsi SQL dalam satu transaksi). Mekanismenya diserahkan ke pembangun.

## 5. Tampilan

### 5.1 Kartu menu (frame 01)
- Kartu lebar penuh di grid Dashboard (`col-span-3`), tinggi ±64px, horizontal: kotak ikon gradasi biru langit (sky-400 → sky-700) berisi Ka'bah putih, teks "Calon Haji 2027" + subjudul "Cek status berhak lunas & cadangan", chevron kanan.
- Diletakkan setelah baris Brosur · Tools · Hotel. Terbuka untuk semua agent (tanpa gate).
- Gaya mengikuti `renderMenuCard` (`src/components/DashboardLayout.tsx`) — gradien lembut, border, shadow-sm, dark mode.

### 5.2 Halaman (frame 02)
- URL `/dashboard/calon-haji-2027` (tab baru di `DashboardLayout`: `TabId`, `SLUG_TO_TAB`/`TAB_TO_SLUG`, `TAB_TITLES`, lazy import, render branch).
- Header sub-halaman standar (tombol kembali + ikon Ka'bah + "Calon Haji 2027").
- **Ubin tab** (3 kolom): Semua (1.416) · Berhak Lunas (155, titik hijau) · Cadangan (1.261, titik kuning). Ubin aktif = latar gelap (slate-800) teks putih. Angka = jumlah total per status, **tidak** ikut filter lain.
- **Kotak cari** gaya command bar `HajiPage` (ikon cari, input "Cari nama, no. porsi, atau NIK…", tombol filter di kanan).
- **Tabel** dalam satu kartu putih membulat:
  - Baris header abu-abu: NO · NAMA · STATUS (huruf 9px kapital).
  - Baris ±38px: No (abu), Nama (tebal 11px, satu baris, dipotong "…"), di bawahnya "Jakarta Timur · 47 th" (9px abu), Status (titik + teks berwarna); bila STATUS JEMAAH `LUNAS`, lencana kecil gelap "✓ LUNAS" di bawahnya (lihat baris 9 frame 02, baris 174 frame 03). Lencana tidak memengaruhi tab/hitungan. *(Bentuk lencana = keputusan Claude.)*
  - Baris terbuka: latar hijau muda, panel detail 2 kolom (label 8px hijau kapital, nilai 11px).
  - Hanya satu baris terbuka sekaligus (keputusan Claude, mengikuti `HajiPage`).
  - "Tampilkan lebih banyak" di kaki tabel (muat bertahap, mis. 50 baris per langkah). *(Keputusan Claude.)*
- Status kosong: hasil cari/filter nihil → pesan singkat + tombol reset.

### 5.3 Filter bottom sheet (frame 03)
- Tombol filter membuka sheet dari bawah dengan scrim gelap; pegangan, judul "Filter", tombol tutup.
- Provinsi (dropdown), Kab/Kota (dropdown, opsinya mengikuti provinsi terpilih), Kepesertaan JKN (4 pil: Semua / Aktif / Belum Aktif / Tidak Ada — pemetaan di §4.1).
- "Reset" + "Tampilkan N jamaah" (N dihitung langsung dari filter sementara; filter berlaku saat tombol diketuk).
- Filter aktif → tombol filter hijau + lencana angka jumlah filter aktif.
- Overlay wajib ikut aturan lapisan Escape/back (`useBackToClose` — lihat pola sheet lain).

### 5.4 Umum
- Mobile-first, `max-w-lg` seperti halaman Dashboard lain. Dark mode wajib.
- Nama ditampilkan sesuai data (kapital). Kab/kota & provinsi ditampilkan title case.
- Cari & filter di klien (±1.400 baris kecil): satu fetch berisi seluruh data.

## 6. Backend

- `GET` endpoint baru (mis. `/api/calon-haji`), butuh login agent (pola `getAuthHeaders`), mengembalikan seluruh baris musim 2027 + jumlah per status.
- Namespace API baru **wajib** didaftarkan di proxy `vite.config.ts` di atas catch-all `/api`.
- Event analytics `open_calon_haji` (atau setara) saat halaman mount — **wajib** terdaftar di `FEATURE_LABELS` (`server.js`) agar tidak di-drop diam-diam.

## 7. Verifikasi

- **Fixture tes = sintetis** (repo publik — data jamaah asli, NIK, dll. **tidak boleh** di-commit). Fixture meniru keanehan PDF; tes jumlah penuh terhadap PDF asli hanya jalan lokal dan di-skip bila berkas tidak ada. *(Keputusan Claude.)*
- Tes unit parser: jumlah 1.416, hitungan per status_cadangan, nama/kab-kota/provinsi terbungkus tergabung benar, `B A N T E N` → `BANTEN`, NIK 15 digit lolos, JKN `-` → null, JKN dua baris tergabung.
- Claude cek cepat: tes unit terkait, `node --check`, build. **User menjalankan e2e / suite penuh** sendiri.
- Checklist manual untuk user di akhir (kartu menu, tab, cari, sheet filter, detail, dark mode).
- Deploy: perubahan `server.js` butuh `deploy.sh` + restart.

## 8. Diserahkan ke pembangun

Nama tabel/kolom/endpoint/berkas final, mekanisme penggantian atomik, ukuran langkah "Tampilkan lebih banyak",
detail warna dark mode, teks status kosong, urutan opsi dropdown (usul: alfabetis), title-casing.
