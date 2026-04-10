# Spesifikasi Integrasi API Alhijaz

> Dokumen ini berisi daftar field data yang dibutuhkan dari API internal Alhijaz untuk sinkronisasi data jamaah umrah dan haji.
> Disusun berdasarkan kebutuhan sistem dashboard Alhijaz yang sudah berjalan.

---

## Daftar Isi

- [1. Jamaah Umrah](#1-jamaah-umrah)
  - [1.1 Identitas & Biodata](#11-identitas--biodata)
  - [1.2 Paket & Keuangan](#12-paket--keuangan)
  - [1.3 Jadwal & Operasional](#13-jadwal--operasional)
  - [1.4 Checklist Perlengkapan](#14-checklist-perlengkapan)
  - [1.5 Checklist Dokumen](#15-checklist-dokumen)
- [2. Jamaah Haji](#2-jamaah-haji)
  - [2.1 Identitas & Biodata](#21-identitas--biodata)
  - [2.2 Paket & Status](#22-paket--status)
  - [2.3 Operasional](#23-operasional)
  - [2.4 Dokumen](#24-dokumen)
- [3. Field Tambahan (Rekomendasi)](#3-field-tambahan-rekomendasi)
- [4. Ketentuan Teknis API](#4-ketentuan-teknis-api)
  - [4.1 Format Data](#41-format-data)
  - [4.2 Unique Key](#42-unique-key)
  - [4.3 Endpoint yang Dibutuhkan](#43-endpoint-yang-dibutuhkan)
  - [4.4 Filtering & Pagination](#44-filtering--pagination)
  - [4.5 Webhook (Opsional)](#45-webhook-opsional)
- [5. Contoh Response](#5-contoh-response)
  - [5.1 Response Jamaah Umrah](#51-response-jamaah-umrah)
  - [5.2 Response Jamaah Haji](#52-response-jamaah-haji)

---

## 1. Jamaah Umrah

### 1.1 Identitas & Biodata

| Field | Tipe | Wajib | Keterangan |
|-------|------|:-----:|------------|
| `id_umroh` | `string` | Ya | ID unik booking umrah (e.g. `"AIW0024460"`) |
| `nama` | `string` | Ya | Nama lengkap jamaah sesuai paspor |
| `jk` | `string` | Ya | Jenis kelamin: `"L"` atau `"P"` |
| `tgl_lahir` | `string (date)` | Ya | Tanggal lahir, format `YYYY-MM-DD` |
| `wa` | `string` | Tidak | Nomor WhatsApp aktif (format: `"6281234567890"`) |
| `no_paspor` | `string` | Tidak | Nomor paspor |
| `paspor_expired` | `string (date)` | Tidak | Masa berlaku paspor, format `YYYY-MM-DD` |

### 1.2 Paket & Keuangan

| Field | Tipe | Wajib | Keterangan |
|-------|------|:-----:|------------|
| `paket` | `string` | Ya | Nama paket (e.g. `"HEMAT"`, `"UHUD"`, `"RAHMAH"`) |
| `harga_paket` | `integer` | Ya | Total harga paket dalam Rupiah |
| `bayar` | `integer` | Ya | Jumlah yang sudah dibayar dalam Rupiah |
| `sisa` | `integer` | Ya | Sisa pembayaran dalam Rupiah |
| `status_bayar` | `string` | Ya | Status: `"LUNAS"` / `"CICILAN"` / `"BELUM BAYAR"` |
| `tgl_daftar` | `string (date)` | Ya | Tanggal pendaftaran, format `YYYY-MM-DD` |

### 1.3 Jadwal & Operasional

| Field | Tipe | Wajib | Keterangan |
|-------|------|:-----:|------------|
| `tgl_berangkat` | `string (date)` | Ya | Tanggal keberangkatan, format `YYYY-MM-DD` |
| `hijriah_year` | `string` | Ya | Tahun Hijriah keberangkatan (e.g. `"1447"`) |
| `staf` | `string` | Tidak | Nama staff penanggung jawab |
| `marketing` | `string` | Tidak | Nama marketing yang menangani |

### 1.4 Checklist Perlengkapan

Dikirim sebagai JSON object dengan key boolean:

| Key | Keterangan |
|-----|------------|
| `batik` | Batik seragam |
| `bergo` | Bergo / kerudung |
| `buku_doa` | Buku doa & manasik |
| `ikhram` | Kain ihram (laki-laki) |
| `koper` | Koper |
| `mukena` | Mukena (perempuan) |
| `sabuk` | Sabuk / money belt |
| `syal` | Syal |
| `tas_paspor` | Tas paspor / pouch |

**Format:**

```json
{
  "batik": true,
  "bergo": false,
  "buku_doa": true,
  "ikhram": false,
  "koper": true,
  "mukena": false,
  "sabuk": true,
  "syal": true,
  "tas_paspor": true
}
```

### 1.5 Checklist Dokumen

Dikirim sebagai JSON object dengan key boolean:

| Key | Keterangan |
|-----|------------|
| `paspor` | Paspor sudah siap |
| `vaksin` | Vaksin meningitis |
| `buku_nikah` | Buku nikah (jika muhrim) |
| `akta_lahir` | Akta lahir |
| `ktp` | KTP |
| `kk` | Kartu Keluarga |
| `foto` | Pas foto |
| `pernyataan` | Surat pernyataan |

**Format:** sama seperti perlengkapan (JSON object boolean).

---

## 2. Jamaah Haji

### 2.1 Identitas & Biodata

| Field | Tipe | Wajib | Keterangan |
|-------|------|:-----:|------------|
| `id_haji` | `string` | Ya | ID unik booking haji (e.g. `"HAJ2025001"`) |
| `id_jamaah` | `string` | Ya | ID unik jamaah (e.g. `"JM050706"`) |
| `nama` | `string` | Ya | Nama lengkap jamaah sesuai paspor |
| `jk` | `string` | Ya | Jenis kelamin: `"L"` atau `"P"` |
| `alamat` | `string` | Tidak | Alamat lengkap |
| `telp` | `string` | Tidak | Nomor telepon (format: `"6281234567890"`) |

### 2.2 Paket & Status

| Field | Tipe | Wajib | Keterangan |
|-------|------|:-----:|------------|
| `paket` | `string` | Ya | Nama/jenis paket haji |
| `jenis` | `string` | Ya | Kategori haji |
| `status_bayar` | `string` | Ya | Status: `"LUNAS"` / `"CICILAN"` / `"BELUM BAYAR"` |
| `status_berangkat` | `string` | Ya | Status keberangkatan |
| `thn_hijriyah` | `string` | Ya | Tahun Hijriah keberangkatan (e.g. `"1447"`) |
| `thn_masehi` | `string` | Ya | Tahun Masehi keberangkatan (e.g. `"2025"`) |

### 2.3 Operasional

| Field | Tipe | Wajib | Keterangan |
|-------|------|:-----:|------------|
| `perwakilan` | `string` | Tidak | Nama perwakilan / operator |
| `marketing` | `string` | Tidak | Nama marketing |
| `staff` | `string` | Tidak | Nama staff penanggung jawab |

### 2.4 Dokumen

| Field | Tipe | Wajib | Keterangan |
|-------|------|:-----:|------------|
| `bpih_url` | `string (url)` | Tidak | URL dokumen BPIH |
| `surat_pernyataan_url` | `string (url)` | Tidak | URL surat pernyataan |

---

## 3. Field Tambahan (Rekomendasi)

Field berikut belum ada di sistem saat ini, tetapi sangat direkomendasikan untuk disediakan oleh API:

| Field | Tipe | Konteks | Keterangan |
|-------|------|---------|------------|
| `nik` | `string` | Umrah & Haji | NIK KTP jamaah |
| `tempat_lahir` | `string` | Umrah & Haji | Tempat lahir |
| `status_visa` | `string` | Umrah | Status pengajuan visa |
| `nomor_porsi` | `string` | Haji | Nomor porsi haji dari Kemenag |
| `riwayat_pembayaran` | `array` | Umrah & Haji | Daftar riwayat pembayaran (lihat format di bawah) |
| `foto_url` | `string (url)` | Umrah & Haji | URL foto jamaah |
| `emergency_contact` | `object` | Umrah & Haji | Kontak darurat (nama, hubungan, telp) |

**Format `riwayat_pembayaran`:**

```json
[
  {
    "tanggal": "2025-01-15",
    "jumlah": 5000000,
    "metode": "transfer",
    "keterangan": "DP awal"
  },
  {
    "tanggal": "2025-03-01",
    "jumlah": 10000000,
    "metode": "transfer",
    "keterangan": "Cicilan 1"
  }
]
```

**Format `emergency_contact`:**

```json
{
  "nama": "Ahmad",
  "hubungan": "Suami",
  "telp": "6281234567890"
}
```

---

## 4. Ketentuan Teknis API

### 4.1 Format Data

| Aspek | Ketentuan |
|-------|-----------|
| Format response | JSON |
| Encoding | UTF-8 |
| Format tanggal | ISO 8601: `YYYY-MM-DD` |
| Format datetime | ISO 8601: `YYYY-MM-DDTHH:mm:ssZ` (UTC) |
| Format nomor telepon | Internasional tanpa `+`: `"6281234567890"` |
| Format mata uang | Integer dalam Rupiah (tanpa desimal) |
| Null handling | Field kosong dikirim sebagai `null`, bukan string kosong |

### 4.2 Unique Key

Setiap record harus memiliki identifier unik yang stabil:

| Entitas | Unique Key Saat Ini | Rekomendasi |
|---------|---------------------|-------------|
| Jamaah Umrah | Composite: `(id_umroh, nama)` | Single unique `id` per jamaah |
| Jamaah Haji | Composite: `(id_haji, id_jamaah)` | Single unique `id` per jamaah |

> **Catatan:** Composite key rentan terhadap masalah jika nama jamaah dikoreksi. Idealnya setiap jamaah punya satu `id` unik yang tidak berubah.

### 4.3 Endpoint yang Dibutuhkan

#### Umrah

| Method | Endpoint | Keterangan |
|--------|----------|------------|
| `GET` | `/api/v1/umrah/jamaah` | List semua jamaah umrah (with pagination) |
| `GET` | `/api/v1/umrah/jamaah/:id` | Detail satu jamaah umrah |
| `GET` | `/api/v1/umrah/bookings` | List semua booking umrah |
| `GET` | `/api/v1/umrah/bookings/:id_umroh` | Detail satu booking + daftar jamaah |

#### Haji

| Method | Endpoint | Keterangan |
|--------|----------|------------|
| `GET` | `/api/v1/haji/jamaah` | List semua jamaah haji (with pagination) |
| `GET` | `/api/v1/haji/jamaah/:id` | Detail satu jamaah haji |
| `GET` | `/api/v1/haji/bookings` | List semua booking haji |
| `GET` | `/api/v1/haji/bookings/:id_haji` | Detail satu booking + daftar jamaah |

#### Sync

| Method | Endpoint | Keterangan |
|--------|----------|------------|
| `GET` | `/api/v1/sync/changes` | Data yang berubah sejak timestamp tertentu |

### 4.4 Filtering & Pagination

Setiap list endpoint harus mendukung:

```
# Pagination
?page=1&per_page=50

# Filter berdasarkan tanggal
?tgl_berangkat_from=2025-10-01&tgl_berangkat_to=2025-12-31

# Filter berdasarkan tahun hijriah
?hijriah_year=1447

# Filter berdasarkan perubahan (untuk incremental sync)
?updated_since=2025-04-10T00:00:00Z

# Sorting
?sort_by=tgl_berangkat&sort_order=desc
```

**Response pagination:**

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "per_page": 50,
    "total_items": 1234,
    "total_pages": 25
  }
}
```

### 4.5 Webhook (Opsional)

Untuk menghindari polling berulang, sangat direkomendasikan menyediakan webhook:

| Event | Keterangan |
|-------|------------|
| `jamaah.created` | Jamaah baru didaftarkan |
| `jamaah.updated` | Data jamaah diubah (biodata, pembayaran, dokumen) |
| `jamaah.deleted` | Jamaah dibatalkan |
| `pembayaran.received` | Pembayaran baru diterima |
| `dokumen.updated` | Checklist dokumen diperbarui |
| `perlengkapan.updated` | Checklist perlengkapan diperbarui |

**Format webhook payload:**

```json
{
  "event": "jamaah.updated",
  "timestamp": "2025-04-10T08:30:00Z",
  "data": {
    "id": "...",
    "id_umroh": "AIW0024460",
    "changed_fields": ["bayar", "sisa", "status_bayar"]
  }
}
```

---

## 5. Contoh Response

### 5.1 Response Jamaah Umrah

```json
{
  "data": {
    "id": "JM-U-00001",
    "id_umroh": "AIW0024460",
    "nama": "AHMAD BIN ABDULLAH",
    "jk": "L",
    "tgl_lahir": "1985-03-15",
    "wa": "6281234567890",
    "no_paspor": "A1234567",
    "paspor_expired": "2030-03-15",
    "paket": "UHUD",
    "harga_paket": 35000000,
    "bayar": 20000000,
    "sisa": 15000000,
    "status_bayar": "CICILAN",
    "tgl_daftar": "2025-01-10",
    "tgl_berangkat": "2025-10-15",
    "hijriah_year": "1447",
    "staf": "Ustad Fauzi",
    "marketing": "Rizky",
    "perlengkapan": {
      "batik": true,
      "bergo": false,
      "buku_doa": true,
      "ikhram": true,
      "koper": true,
      "mukena": false,
      "sabuk": true,
      "syal": false,
      "tas_paspor": true
    },
    "dokumen": {
      "paspor": true,
      "vaksin": true,
      "buku_nikah": false,
      "akta_lahir": true,
      "ktp": true,
      "kk": true,
      "foto": true,
      "pernyataan": false
    }
  }
}
```

### 5.2 Response Jamaah Haji

```json
{
  "data": {
    "id": "JM-H-00001",
    "id_haji": "HAJ2025001",
    "id_jamaah": "JM050706",
    "nama": "FATIMAH BINTI IBRAHIM",
    "jk": "P",
    "alamat": "Jl. Merdeka No. 10, Jakarta Selatan",
    "telp": "6289876543210",
    "paket": "REGULER",
    "jenis": "REGULER",
    "status_bayar": "LUNAS",
    "status_berangkat": "TERDAFTAR",
    "thn_hijriyah": "1447",
    "thn_masehi": "2025",
    "perwakilan": "Jakarta Selatan",
    "marketing": "Andi",
    "staff": "Ustad Hamid",
    "bpih_url": "https://internal.alhijaz.co.id/docs/bpih/HAJ2025001.pdf",
    "surat_pernyataan_url": "https://internal.alhijaz.co.id/docs/sp/HAJ2025001.pdf"
  }
}
```

---

> **Dokumen ini dibuat pada 10 April 2026.**
> Silakan disesuaikan berdasarkan diskusi lebih lanjut dengan tim dev internal.
