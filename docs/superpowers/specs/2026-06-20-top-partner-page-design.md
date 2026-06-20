# Top Partner Page — Design Spec

Tanggal: 2026-06-20
Status: Disetujui untuk implementasi (pending review user)

## Tujuan

Halaman publik **`alhijaz.co/top-partner`** yang menampilkan **Top 20 Partner Alhijaz**
(nama, foto, tombol WhatsApp, dan sosmed Instagram/Facebook/TikTok/Website) dalam
layout **2 kolom, mobile-first**. Data di-cache di DB dan di-refresh **1× sehari via cron**
(bukan fetch realtime tiap page load). Urutan partner **diacak setiap reload** (bukan ranking tetap).

YouTube tidak ditampilkan. Tidak ada header terpisah, tombol back, label "acak",
disclaimer "bukan ranking", section title "Daftar Partner", atau teks "Partner Alhijaz"
di kartu partner.

## Sumber Data

**Endpoint** (publik, tanpa auth, JSON DataTables):
```
https://alhijazindowisata.com/jadwal/src/dataagen.php?sEcho=1&iColumns=10&iDisplayStart=0&iDisplayLength=-1
```
Mengembalikan `{ aaData: [...] }`, persis **20 baris** (sudah pre-filtered "top 20").
Tiap baris adalah array (`full[]`):

| idx | isi | catatan |
|-----|-----|---------|
| 0 | nama | bisa ada `/` (2 orang) & trailing `\t` → trim |
| 1 | nomor HP | format lokal `08…` → normalisasi `wa.me` (62…) |
| 2 | filename foto | → URL proxy (lihat Foto) |
| 3 | Facebook | URL / nama telanjang / `-` / kosong |
| 4 | Instagram | URL, kadang multi-baris / param igsh |
| 5 | YouTube | **DIABAIKAN** |
| 6 | TikTok | URL / `-` / nama telanjang / kadang link Maps |
| 7 | Website | URL, kadang multi-URL dipisah `\r\n` |
| 8 | id | id agen (tidak dipakai di UI) |

**Sanitasi** (penting — data kotor):
- Nama: `trim()`, normalisasi whitespace internal.
- HP: buang non-digit; `0…` → `62…`; `62…` biarkan; kosong/invalid → partner tetap tampil tapi WhatsApp disembunyikan.
- Sosmed/website: ambil **baris pertama** (`split(/[\r\n]/)[0].trim()`), terima **hanya jika** terlihat URL
  (`/^https?:\/\//i` atau diawali `www.` → prefix `https://`). Selain itu (mis. `-`, "Windy", link Maps di kolom TikTok) → anggap kosong/sembunyikan ikonnya.
- Foto kosong → tampilkan placeholder (inisial / fallback abu).

**Foto** — filename via image-resizer proxy:
```
https://alhijazindowisata.com/jadwal/_s.php?.max=350&.img=http://115.124.86.220/m/{file}
```
(terverifikasi: balas `image/webp`).

## Arsitektur

Mengikuti **pola `weather_cache`** (DB-backed cache + cron, endpoint murni baca) yang sudah ada di `server.js`.

### 1. Tabel cache (migration baru)
```sql
CREATE TABLE IF NOT EXISTS top_partners_cache (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE top_partners_cache ENABLE ROW LEVEL SECURITY;
NOTIFY pgrst, 'reload schema';
```
Satu baris `id='partners'`, `data` = array partner tersanitasi.

### 2. Cron harian (server.js, di dalam `shouldRunBackgroundJobs()`)
- Jadwal: `cron.schedule('0 4 * * *', …, { timezone: 'Asia/Jakarta' })` (04:00 WIB, low traffic).
- Startup: load dari DB; kalau kosong/basi (> 24 jam) fetch sekali.
- Single-flight (pola `weatherFetchInFlight`) supaya trigger dev + cron tidak balapan tulis.
- Alur `fetchTopPartnersOnce()`:
  1. `fetch` dataagen.php (timeout, UA + Referer header).
  2. Parse `aaData`, sanitasi tiap baris → objek `{ name, waLink, photo, instagram, facebook, tiktok, website }`.
  3. **Mirror foto ke Bunny CDN** (lihat Foto Hosting).
  4. `supabase.from('top_partners_cache').upsert({ id:'partners', data, synced_at })`.
  5. Fetch gagal total → DB & memory **tidak disentuh** (retry cron berikutnya), pola weather.

### 3. Foto Hosting — mirror ke Bunny CDN
Reuse helper Bunny yang sudah ada: `getBunnyEnabled()`, `bunnyFileExists(path)`, `bunnyUpload(path, buf, ct)`, `downloadFile(url)`.
- Path Bunny: `top-partner/{file}` (filename sudah unik & timestamped → foto berubah = filename baru, jadi `bunnyFileExists` aman sebagai dedup).
- Per partner: kalau `!bunnyFileExists(path)` → `downloadFile(proxyUrl)` lalu `bunnyUpload`. URL final = `https://{BUNNY_CDN_HOSTNAME}/top-partner/{file}`.
- Fallback: kalau Bunny disabled / upload gagal untuk satu foto → simpan URL proxy `_s.php` untuk partner itu (degradasi anggun, partner lain tetap pakai CDN).

### 4. Endpoint baca (server.js)
`GET /api/top-partner` (publik, tanpa auth) → baca memory/DB cache, balas `{ partners: [...], syncedAt }`.
TTL re-read DB ringan (pola weather `WEATHER_DB_READ_TTL_MS`). **Tidak** mengacak di server — urutan acak dilakukan klien.

### 5. Routing SPA
- `server.js`: tambah `'top-partner'` ke `RESERVED_SPA_SLUGS` (biar tidak diperlakukan sebagai slug agen / tidak inject `__AGENT_CONTEXT__`).
- `src/main.tsx`: tambah `'top-partner'` ke `knownFirstSegments`; deteksi `isTopPartner = segments.length===1 && segments[0]==='top-partner'`; lazy-load `TopPartnerPage`; render di blok `page`.

## Frontend — `src/components/TopPartnerPage.tsx`

Mobile-first, mengikuti `docs/DESIGN-SYSTEM.md` + token dari `.pen` (`top-20.pen`). Max width `max-w-lg`, latar `bg-gradient-to-b from-gray-50 to-gray-100` (+ dark mode).

Pada mount: `fetch('/api/top-partner')` → **shuffle** array (Fisher–Yates) sekali per mount → render. Reload = urutan baru.

### Hero (full-width, dari `.pen` `UMkAm` "Hero Card - Premium")
- Full-width, **tanpa margin atas/kiri/kanan**, `rounded-b-[20px]` (atas rata).
- Gradient burgundy: `#150207 → #26050A → #591018 → #871C20` (linear ~122°).
- Pattern islami subtle: gold (`#FDE68A`) eight-point-star + mihrab-arch, opacity rendah (~0.04–0.11); + copper/rose glow blur. Geometri SVG diekspor dari `.pen` saat implementasi.
- Top row: **logo putih Alhijaz** kiri (`src/logo-alhijaz-white.png`, ~96×29) ↔ **tag gold-outline "TOP 20"** kanan (border `#FDE68A`, gradient gelap, ikon `sparkles` + teks `TOP 20` 11/900 `#FDE68A`).
- Judul "Partner Pilihan Alhijaz" (`#FFFFFF`, ~28/800), tagline "Resmi. Responsif. Mudah dihubungi." (`#FFE4E6`, 14/600).
- Chip baris: ⚡ Fast Response · 🛡️ Verified Partner (ikon `#FDE68A`, teks putih 12/800).
- Logo Alhijaz **masuk ke hero** (memenuhi syarat "Logo masuk ke hero/card Partner Pilihan").

### Grid partner (dari `.pen` `Z5YWb` + kartu `K72Nqq`)
- **2 kolom** (`grid grid-cols-2 gap-2.5`), padding `px-4 pt-3.5 pb-5`.
- **Kartu partner** (clean / restrained — bukan "AI slop"):
  - `bg-white rounded-[15px] border border-gray-200 shadow-sm`, padding `p-2.5`, `space-y-2`.
  - **Foto** elemen utama: rasio ~ 156×148, `rounded-[11px] object-cover`, border tipis. Lazy-load + skeleton; `onError` → placeholder.
  - **Nama**: 13px/800 `#111827`, maksimal ~2 baris (`leading-[1.15]`).
  - **Social row**: ikon lucide 13px `#6B7280`, gap ~9 — **hanya** yang punya URL valid: Instagram, Facebook, TikTok (`music-2`), Website (`globe`). Tidak ada → row disembunyikan.
  - **WhatsApp**: aksi text+icon understated `text-emerald-700` (`message-circle` 13 + "WhatsApp" 11/800) — jelas tapi tidak dominan. Tap → `wa.me/62…?text=<salam>`.
- **Tanpa**: badge dekoratif berlebih, icon dalam kotak, teks "Partner Alhijaz" di kartu, section title.

### WhatsApp
`https://wa.me/{62…}?text=` + encode `Assalamualaikum, saya ingin info umroh Alhijaz 🙏`.

### State
- Loading: skeleton grid (mengikuti pola spinner emerald yang ada).
- Error / cache kosong: pesan ramah + tombol "Coba lagi".
- Dark mode: ikut kelas `dark` global (token slate seperti komponen lain).

## Unit & Batasan (isolation)

- `lib/topPartner.js` (+ `.d.ts`): **logika murni** — `sanitizePartnerRow(full)`, `normalizeWaNumber(raw)`, `firstValidUrl(s)`, `buildPhotoProxyUrl(file)`. Testable tanpa jaringan/DB.
- `server.js`: fetch+cron+endpoint (I/O), pakai `lib/topPartner.js` untuk transformasi.
- `TopPartnerPage.tsx`: presentasi + shuffle klien.
- Shuffle (Fisher–Yates) sebagai helper kecil yang bisa diuji.

## Testing
- Unit (`tests/`): sanitasi baris kotor (nama `/`+tab, HP `08…`→`62…`, sosmed `-`/nama telanjang/multi-URL/`www.`, foto kosong), `buildPhotoProxyUrl`, shuffle (panjang & isi sama, hanya urutan beda).
- Verifikasi FE: `tsc` + `vite build` (eslint v10 belum dikonfig — sesuai catatan project).
- Manual: render `/top-partner` di dev, cek 2 kolom, hero full-width, foto load, WhatsApp prefilled, reload = urutan beda.

## Out of scope (YAGNI)
Pagination/search/filter, halaman detail partner, SEO/OG khusus, dark-mode toggle baru,
caption AI, analitik klik. Bisa menyusul kalau diminta.
