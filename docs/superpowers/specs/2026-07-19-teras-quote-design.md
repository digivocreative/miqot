# Teras — Fitur Quote (seperti Threads)

**Tanggal:** 2026-07-19
**Status:** Disetujui user (posisi tombol, placeholder terhapus, dan media quote sudah dikonfirmasi)

## Tujuan

Agen bisa mengutip (quote) kiriman lain di feed Teras: membuat kiriman baru berisi
komentar sendiri (teks + media) dengan kartu preview kiriman aslinya tertanam di
bawahnya — perilaku yang sama dengan fitur Quote di Threads.

## Keputusan produk (sudah dikonfirmasi user)

1. **Posisi tombol:** ikon quote di action row setiap kiriman, setelah tombol
   Komentari, dengan badge jumlah quote. Berlaku juga untuk kiriman sistem.
2. **Kiriman yang di-quote dihapus:** kartu preview diganti placeholder redup
   "Kiriman sudah dihapus"; kiriman quote-nya sendiri tetap utuh.
3. **Media:** composer quote identik dengan composer biasa (teks 1–500 karakter +
   hingga 10 media); hanya ditambah kartu preview kiriman yang di-quote.
4. **Quote berantai:** mengutip kiriman quote diizinkan, tapi preview hanya
   dirender satu tingkat (kartu quote tidak menampilkan kartu quote di dalamnya).

## Arsitektur

Pendekatan terpilih: **kolom `quoted_post_id` pada `community_posts` + join saat
baca**. Data kiriman asli selalu segar dan status terhapus dicek live, sehingga
placeholder akurat. Alternatif snapshot JSONB ditolak (data basi, bertentangan
dengan keputusan placeholder); tabel relasi terpisah ditolak (berlebihan untuk
relasi 1-ke-1).

### 1. Database

Migrasi baru `migrations/20260722000000_community_post_quote.sql`, dijalankan
**oleh user** lewat Supabase SQL Editor (bukan oleh tooling):

```sql
ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS quoted_post_id UUID REFERENCES community_posts(id);

CREATE INDEX IF NOT EXISTS idx_community_posts_quoted
  ON community_posts (quoted_post_id)
  WHERE quoted_post_id IS NOT NULL AND deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
```

Tanpa `ON DELETE` khusus: penghapusan kiriman Teras bersifat soft-delete
(`deleted_at`), jadi barisnya tetap ada dan placeholder dirender dari status itu.

### 2. Server (`server.js`)

**`POST /api/community/posts`** — menerima field opsional `quoted_post_id`:

- Validasi UUID (`isCommunityUuid`); jika bukan → 400.
- Kiriman yang di-quote harus ada dan `deleted_at IS NULL`; jika tidak → 400
  "Kiriman yang dikutip tidak ditemukan".
- Insert menyertakan kolom `quoted_post_id`. Jika insert gagal karena kolom belum
  ada (pola `isCommunityMediaSchemaMissing` yang sama, versi quote):
  - permintaan **dengan** quote → 503 "Migrasi quote Teras belum diterapkan";
  - permintaan **tanpa** quote → retry tanpa kolom (tidak ada regresi).
- Respons 201 menyertakan `quoted_post` (bentuk sama dengan GET di bawah) dan
  `quote_count: 0` agar optimistic insert FE langsung lengkap.

**`GET /api/community/feed` dan `GET /api/community/posts/:id`** — per halaman:

- Select ditambah `quoted_post_id` (dengan fallback select tanpa kolom bila
  skema belum dimigrasi — feed tetap jalan, semua `quoted_post: null`).
- Satu query tambahan mengambil semua kiriman yang di-quote pada halaman itu
  (`.in('id', quotedIds)`, **tanpa** filter `deleted_at` supaya bisa membedakan
  terhapus vs tidak ada) beserta profil penulisnya.
- Satu query tambahan menghitung `quote_count`: jumlah kiriman aktif
  (`deleted_at IS NULL`) dengan `quoted_post_id IN (postIds)`.
- Bentuk respons per kiriman bertambah dua field:
  - `quote_count: number`
  - `quoted_post`: `null` (bukan quote), atau
    `{ available: true, id, body, media, created_at, author }`, atau
    `{ available: false }` (kiriman asli terhapus/tidak ditemukan).
  - `quoted_post` tidak memuat quote di dalamnya (satu tingkat saja).

Endpoint lain (`teaser`, `feed/head`, komentar, reaksi, report, delete) tidak
berubah.

### 3. Frontend (`src/components/TerasPage.tsx`)

**Tipe:**

- `CommunityPost` bertambah `quote_count: number` dan
  `quoted_post?: QuotedPostPreview | null`.
- `QuotedPostPreview`: `{ available: boolean; id?: string; body?: string;
  media?: CommunityMedia[]; created_at?: string; author?: CommunityAuthor }`.

**Tombol Quote:** tombol ketiga di action row (ikon `Quote` dari lucide-react),
gaya/ukuran/animasi sama dengan tombol Suka dan Komentari, badge `quote_count`
bila > 0. `aria-label`/`title`: "Quote". Klik → buka composer mode quote.

**Composer mode quote:** state baru `composerQuote: CommunityPost | null`.
Composer yang sudah ada dipakai ulang; saat mode quote, `QuotedPostCard`
(non-interaktif, tidak bisa dihapus terpisah — batal = tutup composer) dirender
di bawah textarea. Submit mengirim `quoted_post_id`. Optimistic insert memakai
data quoted post yang sudah ada di state feed.

**`QuotedPostCard`** (komponen baru, dipakai di feed, detail, dan composer):

- Kartu ber-border rounded kompak: avatar kecil + nama + waktu (timeAgo) di
  baris pertama, isi di-clamp ± 4 baris, lalu media rail versi ringkas (tinggi
  lebih kecil) bila ada media.
- Varian `available: false`: kartu redup dengan teks "Kiriman sudah dihapus".
- Di feed/detail: klik kartu → navigasi ke detail kiriman asli (mekanisme
  navigasi detail yang sudah ada). Di composer: tidak bisa diklik.
- Klik media di dalam kartu (feed/detail) membuka media viewer yang sudah ada.

**Penanganan error:** 503 "Migrasi quote Teras belum diterapkan" ditampilkan
sebagai error composer (pola pesan migrasi media yang sudah ada).

## Batasan & non-goals

- Tidak ada daftar "siapa saja yang meng-quote" (badge angka saja, tidak bisa
  diklik).
- Tidak ada repost tanpa komentar (hanya quote dengan teks wajib 1–500 karakter,
  mengikuti validasi body yang sudah ada).
- Tidak ada notifikasi ke penulis kiriman yang di-quote (di luar cakupan).

## Verifikasi

1. `npx tsc --noEmit` dan `npx vite build` (eslint v10 belum dikonfigurasi).
2. `node --check server.js`.
3. Uji alur di dev: quote dari feed dan dari detail, quote dengan media, quote
   kiriman sistem, quote atas quote (preview 1 tingkat), placeholder setelah
   kiriman asli dihapus, feed tetap jalan sebelum migrasi diterapkan.
4. DB lokal = produksi — DDL hanya lewat user di Supabase SQL Editor; tooling
   tidak menjalankan migrasi.
