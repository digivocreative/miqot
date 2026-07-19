# Spec: Link Preview di Teras

**Tanggal:** 2026-07-19
**Status:** Disetujui (siap masuk tahap rencana implementasi)

## Latar belakang

Saat ini bila agent menempel (paste) sebuah URL di composer Teras ("Buat Kiriman"),
URL hanya tampil sebagai teks biasa. Threads menampilkan kartu preview (judul,
deskripsi, gambar thumbnail, nama situs) begitu link ditempel. Kita ingin
pengalaman serupa di Teras.

Situs sumber (mis. detik.com) memblokir fetch dari browser (CORS), jadi metadata
Open Graph harus diambil oleh server melalui endpoint proxy.

## Keputusan desain (hasil brainstorming)

1. **Snapshot saat posting** — server mengambil OG tags saat composer mendeteksi
   URL, menampilkan kartu di composer, dan menyimpan snapshot (judul/gambar/url)
   ke kolom baru saat post dibuat. Feed merender dari snapshot tanpa fetch ulang.
2. **Teks URL tetap ada** di body + kartu muncul di bawahnya (ala Threads). URL
   tetap dihitung dalam batas 500 karakter.
3. **Link pertama saja** yang dibuatkan kartu (satu kartu per kiriman).
4. **Gambar di-hotlink langsung** dari situs sumber dengan `referrerpolicy="no-referrer"`
   (tanpa re-upload ke Bunny). Fallback ke kartu teks-saja bila gambar gagal dimuat.
5. **Prioritas media/quote** — bila kiriman punya media (foto/video) atau mengutip
   kiriman lain, kartu link preview TIDAK ditampilkan.

## Arsitektur

Mengikuti pola `media` dan `quoted_post` yang sudah ada di `community_posts`:
kolom JSONB, di-resolve server-side, dirender sebagai kartu di feed, dengan
graceful degradation bila kolom belum ada (pola `includeMedia`/`includeQuote`).

### Alur data

```
paste URL di composer
  → composer deteksi URL pertama (regex, debounce ~600ms)
  → GET /api/community/link-preview?url=… (proxy server, fetch OG)
  → kartu preview muncul di bawah textarea (tombol ✕ untuk buang)
  → user tekan "Post" → link_preview dikirim bersama body
  → server sanitasi ulang + simpan snapshot ke community_posts.link_preview
  → feed/detail render <LinkPreviewCard> dari snapshot (tanpa fetch ulang)
```

## Komponen

### 1. Modul murni `lib/community-link-preview.js` (+ `.d.ts`)

Logika yang bisa diuji tanpa jaringan (gaya `lib/community-mentions.js`):

- `parseOpenGraph(html, baseUrl)` → `{ url, canonical_url, title, description, image, site_name }`
  atau `null`. Prioritas: `og:*` → `twitter:*` → `<title>`/`<meta name="description">`.
  `og:image` relatif diresolve ke absolut terhadap `baseUrl`.
- `isSafePreviewUrl(url)` → boolean. Anti-SSRF (lihat bawah).
- `sanitizeLinkPreview(obj)` → objek bersih dengan field di-trim & dibatasi panjang
  (title ~200 char, description ~300 char, site_name ~100 char), hanya menerima
  `image` yang `https`, buang field tak dikenal. Kembalikan `null` bila tak ada
  field berguna (minimal harus ada `url` + salah satu dari title/image).
- `firstUrlInText(text)` → URL pertama dalam string, atau `null`.

### 2. Endpoint proxy `GET /api/community/link-preview`

`authMiddleware` + `requireCommunityAccess`. Query param `url`.

**Validasi & keamanan (anti-SSRF):**
- Hanya skema `http`/`https`.
- Resolve hostname; tolak IP privat/loopback/link-local: `127.*`, `10.*`,
  `172.16–31.*`, `192.168.*`, `169.254.*`, `::1`, `fc00::/7`. Tolak `localhost`
  dan hostname tanpa titik.
- Timeout ~5 dtk (`AbortController`).
- Batas body ~512KB (stream, potong bila lewat).
- Maks 3 redirect; setiap tujuan redirect divalidasi ulang anti-SSRF.
- Hanya proses `Content-Type: text/html`.
- `User-Agent` wajar (mis. bot preview).
- Rate limit ringan per-agent bila infrastruktur yang ada memungkinkan.

**Output:** JSON hasil `sanitizeLinkPreview(parseOpenGraph(...))`, atau `204`/`{ data: null }`
bila tak ada metadata berguna → composer diam (tak menampilkan kartu).

### 3. Migrasi DB

`migrations/20260724000000_community_link_preview.sql`:

```sql
ALTER TABLE community_posts ADD COLUMN link_preview jsonb;
```

Diterapkan oleh user dengan paste SQL di Supabase SQL Editor (sesuai konvensi
proyek: tidak ada exec_sql/psql/DB URL).

### 4. Server: `communityLinkPreviewPayload` + `isCommunityLinkPreviewSchemaMissing`

- `isCommunityLinkPreviewSchemaMissing(error)` — deteksi kolom `link_preview`
  belum ada (pola `isCommunityQuoteSchemaMissing`: kode `42703`/`PGRST204`
  + regex `link_preview`).
- `communityLinkPreviewPayload(row)` — kembalikan `row.link_preview` yang sudah
  di-sanitasi, atau `null`. Terapkan aturan prioritas: bila row punya media
  (`normalizeStoredCommunityMedia(...).length > 0`) atau `quoted_post_id` → `null`.

### 5. POST `/api/community/posts`

- Terima `req.body.link_preview` (opsional).
- **Sanitasi ulang** dengan `sanitizeLinkPreview` + `isSafePreviewUrl` (jangan
  percaya client). Pastikan `link_preview.url` benar-benar muncul di body teks;
  bila tidak → drop.
- **Aturan prioritas:** bila `media.length > 0` atau `quotedPostId` → paksa
  `linkPreview = null`.
- Insert pakai pola retry `includeLinkPreview` (mirip `includeMediaColumn`):
  bila `isCommunityLinkPreviewSchemaMissing` → ulangi insert tanpa kolom. Bila
  post memang menyertakan preview & kolom belum ada →
  `503 "Migrasi link preview Teras belum diterapkan"`.
- Sertakan `link_preview` di payload respons (via `communityLinkPreviewPayload`).

### 6. Feed & detail query

Tambah flag `includeLinkPreview` (deteksi schema-missing seperti `includeQuote`),
tambahkan `link_preview` ke `select`, dan sertakan hasil `communityLinkPreviewPayload(post)`
di payload tiap post (di GET feed dan GET detail).

### 7. Frontend `src/components/TerasPage.tsx`

**Tipe:**
```ts
interface LinkPreview {
  url: string;
  canonical_url?: string;
  title?: string;
  description?: string;
  image?: string;
  site_name?: string;
}
// CommunityPost: tambah `link_preview?: LinkPreview | null;`
```

**`<LinkPreviewCard>`** (mirip `QuotedPostCard`):
- `<a href={canonical_url || url} target="_blank" rel="noopener noreferrer nofollow">`.
- Gambar (bila `image`): `referrerpolicy="no-referrer"`, `loading="lazy"`,
  `onError` → sembunyikan gambar (kartu jadi teks-saja).
- Tampilkan `site_name` atau domain dari URL, judul (clamp 2 baris),
  deskripsi (clamp 2 baris).
- Render di feed/detail hanya bila `post.link_preview` ada **dan** post tak punya
  media/quote (aturan sudah dipaksa server, ini pertahanan ganda di klien).

**Composer:**
- State `linkPreview: LinkPreview | null`, `linkPreviewLoading: boolean`,
  `dismissedPreviewUrl: string | null`.
- Deteksi URL pertama di body via `firstUrlInText`; debounce ~600ms; fetch proxy.
- Tampilkan kartu di bawah textarea + tombol ✕. Menekan ✕ menyimpan URL ke
  `dismissedPreviewUrl` agar tak auto-muncul lagi sampai URL berubah/dihapus.
- Jangan fetch/tampilkan bila composer sudah punya media terpasang.
- Saat submit, kirim `link_preview` (bila ada & tak dibuang) ke POST.

## Testing

- `tests/community-link-preview.test.js` (node, unit murni):
  - `parseOpenGraph`: OG lengkap; twitter fallback; `<title>` fallback;
    `og:image` relatif → absolut; HTML tanpa metadata → `null`.
  - `isSafePreviewUrl`: tolak IP privat/loopback/localhost/non-http; terima URL publik.
  - `sanitizeLinkPreview`: potong field terlalu panjang; buang field tak dikenal;
    tolak image non-https; `null` bila tak ada field berguna.
  - `firstUrlInText`: ambil URL pertama; abaikan teks tanpa URL.
- Verifikasi FE: `tsc` + `vite build`.
- Endpoint proxy & rendering kartu diuji manual (butuh jaringan). Logika inti
  sudah tercakup unit test murni.

## Di luar cakupan (YAGNI)

- Re-upload gambar OG ke Bunny CDN.
- Preview untuk beberapa link dalam satu kiriman.
- Preview di komentar (hanya kiriman utama).
- Refresh/refetch metadata bila halaman sumber berubah (snapshot dibiarkan statis).
- Preview khusus untuk oEmbed (YouTube/Twitter embed) — cukup OG standar.
