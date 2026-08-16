# Direktori Hotel v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Direktori Hotel di dashboard (Tools) — kategori-first (Mekkah/Madinah/Turki/Dubai), data dikelola admin lewat Panel Kelola, foto/video upload ke Bunny — **hanya terlihat oleh agent `nikita` dan `bagas`**.

**Architecture:** Satu tabel `hotels` dengan kolom `media` jsonb (pola Teras); semua akses via server.js (service role). Gate slug satu-titik-keputusan di `lib/hotel-access.js` (server) + `src/lib/hotelAccess.ts` (klien) — meniru gate Teras lama (commit `5a32b40^`). Kemampuan kelola = `role === 'admin'` (nikita & bagas **sudah** admin di DB — diverifikasi 2026-08-16, tidak perlu ubah role). FE: kartu di AIToolsPage + dua sub-page ai-tools (`hotel`, `hotel/kelola`).

**Tech Stack:** Express (ESM) + Supabase service-role, Bunny Storage (raw-binary upload ala `/api/community/media`), React + Tailwind (mobile-first, `docs/DESIGN-SYSTEM.md`), unit test `node:test`.

**Spec:** `docs/superpowers/specs/2026-08-16-direktori-hotel-v2-design.md`

## Global Constraints

- Gate fitur: slug `nikita` + `bagas` saja (lowercase-trim match); server **fail-closed** 403, FE menyembunyikan kartu & redirect.
- Admin actions (create/update/delete/upload): `adminOnly` (role `admin`) **plus** gate slug.
- Kategori tetap: `['mekkah','madinah','turki','dubai']`; jarak hanya mekkah (label "dari Masjidil Haram") & madinah ("dari Masjid Nabawi") — server memaksa `distance_label`/`walk_label` = null untuk turki/dubai.
- Media: foto ≤ 3MB (`image/jpeg|png|webp`), video ≤ 20MB (`video/mp4|quicktime|webm`), maks 30 item/hotel; cover = `media[0]`.
- Batas panjang: name ≤ 120, area ≤ 120, address ≤ 300, description ≤ 2000, agent_note ≤ 1000, facilities ≤ 20 item × 30 char, gmaps_url host ∈ {maps.app.goo.gl, goo.gl, maps.google.com, www.google.com, google.com}.
- ESM di mana-mana; komentar & copy UI bahasa Indonesia; ikuti `docs/DESIGN-SYSTEM.md` (header 14px putih, px-4, CTA emerald, aksen fitur teal, warning amber, danger red-600).
- Jangan jalankan suite test penuh (5 tes merah pre-existing sejak ec01280) — hanya `node --test tests/hotel-directory.test.js`; gate FE = `npm run build` (bukan tsc); server = `node --check server.js`.
- `git branch --show-current` sebelum tiap commit (harus `claude/competent-meitner-49e09e`).
- DDL TIDAK dijalankan Claude — file migrasi disiapkan, user paste di Supabase SQL Editor. Endpoint harus toleran pra-migrasi (503 "Migrasi direktori hotel belum diterapkan", deteksi kode `42P01`).
- `node server.js` tidak hot-reload — endpoint baru butuh restart (curl 404 = belum restart, 401 = sudah).
- Parser JSON path-scoped didaftarkan di blok server.js:510-533 — limit di `app.post(...)` inert (sudah menggigit 3×).

---

### Task 1: Helper murni `lib/hotel-directory.js` + unit test (TDD)

**Files:**
- Create: `lib/hotel-directory.js`
- Test: `tests/hotel-directory.test.js`

**Interfaces (Produces):**
```js
export const HOTEL_DIRECTORY_AGENT_SLUGS; // Set(['nikita','bagas'])
export const HOTEL_CITIES;                // ['mekkah','madinah','turki','dubai']
export const HOTEL_CITY_LABELS;           // { mekkah: 'Mekkah', ... }
export const HOTEL_CITY_LANDMARKS;        // { mekkah: 'Masjidil Haram', madinah: 'Masjid Nabawi' }
export const HOTEL_MAX_MEDIA_ITEMS;       // 30
export function isHotelDirectoryEnabledForAgent(agentOrSlug): boolean
export function requireHotelDirectoryAccess(agent, res): boolean   // 403 + return false
export function slugifyHotelName(name, existingSlugs?: Iterable<string>): string
export function normalizeHotelMediaInput(value, publicUrlPrefixes: string[]): {type,url}[] | null
export function buildHotelPayload(input, { mediaPrefixes }): { ok:true, data } | { ok:false, error }
export function hotelListItem(row): { id, slug, name, city, stars, distance_label, walk_label, area, cover, photo_count, video_count }
```

- [ ] **Step 1: Tulis test gagal** — `tests/hotel-directory.test.js` (node:test, assert/strict, deskripsi bahasa Indonesia). Cakupan minimal:
  - gate: `nikita`/`bagas` true (juga `' Nikita '` case+trim), `budi`/`''`/null false; `requireHotelDirectoryAccess` memanggil `res.status(403).json` (stub res) dan return false.
  - slugify: `'Makkah Towers'` → `'makkah-towers'`; nama non-alnum dibuang; tabrakan dengan existing → suffix `-2`, `-3`.
  - media normalize (prefix uji `['https://cdn.example.b-cdn.net/hotels/']`): item valid image/video lolos & field ekstra dibuang; ditolak (null): bukan array, > 30 item, type asing, URL beda origin, path di luar `/hotels/`, ada query string (`?x=1`) atau hash, ekstensi tak cocok type (`.mp4` pada image), URL duplikat.
  - payload builder: name kosong → error; city `'cairo'` → error; stars 0/6 → error, null boleh; turki/dubai → `distance_label`/`walk_label` DIPAKSA null meski dikirim; gmaps host `evil.com` → error, `maps.app.goo.gl` lolos, string kosong → null; facilities bukan array → error, > 20 item → error, item di-trim & yang kosong dibuang; field tak dikenal (mis. `role`) TIDAK ikut di `data` (whitelist); media tak valid → error.
  - `hotelListItem`: cover = url media[0], hitung photo_count/video_count benar, media tak ikut di output.
- [ ] **Step 2: Jalankan — pastikan gagal** — `node --test tests/hotel-directory.test.js` → FAIL (module not found).
- [ ] **Step 3: Implementasi `lib/hotel-directory.js`** — poin penting:
  - Header komentar meniru `lib/community-access.js`: satu titik keputusan; buka gate nanti = edit file ini + `src/lib/hotelAccess.ts`.
  - `slugifyHotelName`: lowercase, non-alnum → `-`, trim `-`, potong 60 char, dedup via suffix angka.
  - `normalizeHotelMediaInput`: cermin `normalizeCommunityMediaInput` (server.js:5236-5276) TANPA syarat slug pengunggah — hotel entitas bersama, media bisa diunggah nikita atau bagas; cukup origin+`/hotels/` prefix, tanpa query/hash, ekstensi sesuai type, dedup, maks 30.
  - `buildHotelPayload`: whitelist eksplisit `{ name, city, stars, distance_label, walk_label, area, address, gmaps_url, description, facilities, agent_note, media }`; validasi sesuai Global Constraints; kembalikan hanya field ter-whitelist (jebakan builder-payload-whitelist Teras edit).
- [ ] **Step 4: Test hijau** — `node --test tests/hotel-directory.test.js` → PASS semua.
- [ ] **Step 5: Commit** — `git add lib/hotel-directory.js tests/hotel-directory.test.js && git commit -m "feat(hotel): helper murni direktori hotel + unit test"`

### Task 2: Migrasi SQL `hotels`

**Files:**
- Create: `migrations/20260816000000_hotel_directory.sql`

- [ ] **Step 1: Tulis migrasi** (idempotent, RLS, NOTIFY — konvensi repo):

```sql
-- Direktori Hotel v2 (spec docs/superpowers/specs/2026-08-16-direktori-hotel-v2-design.md).
-- Terapkan manual di Supabase SQL Editor (proyek ini tidak punya exec_sql/psql).
BEGIN;

CREATE OR REPLACE FUNCTION hotel_media_is_valid(media jsonb) RETURNS boolean AS $$
  SELECT jsonb_typeof(media) = 'array'
    AND jsonb_array_length(media) <= 30
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(media) item
      WHERE jsonb_typeof(item) <> 'object'
         OR NOT (item ? 'type') OR NOT (item ? 'url')
         OR item->>'type' NOT IN ('image','video')
         OR jsonb_typeof(item->'url') <> 'string'
         OR btrim(item->>'url') = ''
    );
$$ LANGUAGE sql IMMUTABLE;

CREATE TABLE IF NOT EXISTS hotels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  city TEXT NOT NULL CHECK (city IN ('mekkah','madinah','turki','dubai')),
  stars SMALLINT CHECK (stars BETWEEN 1 AND 5),
  distance_label TEXT,
  walk_label TEXT,
  area TEXT,
  address TEXT,
  gmaps_url TEXT,
  description TEXT,
  facilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  agent_note TEXT,
  media JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (hotel_media_is_valid(media)),
  created_by UUID REFERENCES agents(id),
  updated_by UUID REFERENCES agents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hotels_city ON hotels (city, name);

ALTER TABLE hotels ENABLE ROW LEVEL SECURITY;

COMMIT;
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Commit** — `git add migrations/20260816000000_hotel_directory.sql && git commit -m "feat(hotel): migrasi tabel hotels (jalankan manual di Supabase)"`

### Task 3: Endpoint baca (`GET /api/hotels`, `GET /api/hotels/:slug`)

**Files:**
- Modify: `server.js` — import lib (~line 82 dekat community-access), parser JSON path-scoped (blok :510-533), endpoint dekat blok community (~:7350)

**Interfaces (Consumes):** Task 1 exports. **(Produces):** envelope `{ success, data }`; list item = `hotelListItem(row)`; detail = row utuh.

- [ ] **Step 1: Import & parser** — tambah di server.js:
  - `import { requireHotelDirectoryAccess, hotelListItem, buildHotelPayload, slugifyHotelName, normalizeHotelMediaInput, HOTEL_CITIES } from './lib/hotel-directory.js';`
  - Di blok parser (sebelum `app.use(express.json({ limit: '10mb' }))`): `app.use('/api/hotels', express.json({ limit: '96kb' }));` + komentar bahwa `/api/hotels/media` berbadan binary (Content-Type bukan JSON) sehingga parser ini melewatinya.
- [ ] **Step 2: Helper pra-migrasi** — fungsi kecil dekat endpoint: `hotelTableMissing(error)` → `error?.code === '42P01' || /hotels.*(not exist|schema cache)/i.test(error?.message||'')`; response 503 `{ error: 'Migrasi direktori hotel belum diterapkan' }`.
- [ ] **Step 3: Endpoint list & detail** (pola guard: `dbLoadShedGuard` dulu, lalu `authMiddleware`; gate slug pakai `req.user` langsung — JWT sudah memuat `slug`):

```js
app.get('/api/hotels', dbLoadShedGuard, authMiddleware, async (req, res) => {
  if (!requireHotelDirectoryAccess(req.user, res)) return;
  try {
    const { data, error } = await supabase.from('hotels')
      .select('id, slug, name, city, stars, distance_label, walk_label, area, media')
      .order('city').order('name');
    if (error) { if (hotelTableMissing(error)) return res.status(503).json({ error: 'Migrasi direktori hotel belum diterapkan' }); throw error; }
    res.json({ success: true, data: (data || []).map(hotelListItem) });
  } catch (err) { console.error('[hotel] list error:', err.message); res.status(500).json({ error: 'Gagal memuat direktori hotel' }); }
});
```
  Detail: `.eq('slug', req.params.slug).maybeSingle()` → 404 `{ error: 'Hotel tidak ditemukan' }` bila kosong; sukses `{ success:true, data: row }`.
- [ ] **Step 4: Verifikasi** — `node --check server.js` PASS; `node --test tests/hotel-directory.test.js` tetap PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(hotel): endpoint baca direktori hotel (gate nikita/bagas)"`

### Task 4: Endpoint admin (create/update/delete) + upload media

**Files:**
- Modify: `server.js` (blok yang sama dengan Task 3)

**Interfaces (Produces):**
- `POST /api/hotels` (adminOnly) body = input builder → 201 `{ success, data: row }`
- `PUT /api/hotels/:id` (adminOnly) → `{ success, data: row }`
- `DELETE /api/hotels/:id` (adminOnly) → `{ success: true }` (+ best-effort `bunnyDelete` file `hotels/`)
- `POST /api/hotels/media` (adminOnly) raw binary + header `X-Upload-ID` (uuid) & `Content-Type` → `{ success, url }`

- [ ] **Step 1: Konstanta & prefix media** — `const HOTEL_MEDIA_FOLDER = 'hotels';` + `hotelMediaPublicPrefixes()` cermin `communityMediaPublicPrefixes()` (server.js:5227-5234) dengan prefix `hotels/`; batas ukuran & mime **pakai ulang** `COMMUNITY_MEDIA_MIME_TYPES`/`COMMUNITY_IMAGE_MAX_BYTES`/`COMMUNITY_VIDEO_MAX_BYTES` (3MB/20MB — nilai sama per spec).
- [ ] **Step 2: Upload endpoint** — cermin `/api/community/media` (server.js:7350) dengan penyederhanaan: `authMiddleware` → cek `requireHotelDirectoryAccess(req.user)` + `adminOnly` → validasi `X-Upload-ID` uuid, mime dikenal (415), Content-Length (413) → body parser `express.raw({ type: () => true, limit: COMMUNITY_VIDEO_MAX_BYTES })` route-level → cek byte length + magic bytes `hasExpectedCommunityMediaSignature` → nama file `` `hotels/${req.user.slug}-${uploadId}-${contentHash}.${ext}` `` → `bunnyUpload` bila `getBunnyEnabled()` else fallback Supabase Storage bucket `agent-photos` (pola community) → `{ success:true, url }`. Tanpa rate-limiter khusus (hanya 2 admin terpercaya) — beri komentar alasannya.
- [ ] **Step 3: CRUD** — semua `dbLoadShedGuard, authMiddleware` + gate + `adminOnly`:
  - POST: `buildHotelPayload(req.body, { mediaPrefixes: hotelMediaPublicPrefixes() })` → bila `!ok` 400 `{ error }`; slug = `slugifyHotelName(data.name, existingSlugs)` (ambil `select('slug')`); insert + `created_by/updated_by = req.user.id`; balas 201 row.
  - PUT: builder sama; `updated_by = req.user.id`, `updated_at = new Date().toISOString()`; slug TIDAK berubah saat rename (stabil, dipakai URL) — beri komentar. 404 bila id tak ada.
  - DELETE: ambil row dulu (media), hapus row, lalu fire-and-forget loop `bunnyDelete(path)` untuk tiap media ber-prefix CDN `hotels/` (path = URL minus origin; try/catch per file, log saja). Balas `{ success:true }`.
- [ ] **Step 4: Verifikasi** — `node --check server.js`; unit test tetap hijau.
- [ ] **Step 5: Commit** — `git commit -m "feat(hotel): CRUD admin + upload media Bunny direktori hotel"`

### Task 5: Gate FE + kartu Tools + routing DashboardLayout

**Files:**
- Create: `src/lib/hotelAccess.ts`
- Modify: `src/components/AIToolsPage.tsx`, `src/components/DashboardLayout.tsx`

- [ ] **Step 1: `src/lib/hotelAccess.ts`** — cermin klien gate (pola `communityAccess.ts` versi `5a32b40^`):

```ts
const HOTEL_DIRECTORY_AGENT_SLUGS = new Set(['nikita', 'bagas']);
export function isHotelDirectoryEnabledForAgent(slug?: string | null): boolean {
  return HOTEL_DIRECTORY_AGENT_SLUGS.has(String(slug || '').trim().toLowerCase());
}
```
- [ ] **Step 2: AIToolsPage** — entry TOOLS `{ id:'hotel', name:'Direktori Hotel', desc:'Info, jarak & foto hotel Mekkah, Madinah, Turki, Dubai', icon: Building2, color:'teal', route:'hotel', active:true }` (color `teal` SUDAH ada di `iconStyles` — :96-125, aman dari crash :136); **sembunyikan total** untuk non-whitelist: render dari `TOOLS.filter(t => t.id !== 'hotel' || isHotelDirectoryEnabledForAgent(agentSlug))` (bukan `restrictedTo` yang hanya mendim).
- [ ] **Step 3: DashboardLayout** — 11 titik (laporan riset FE):
  1. lazy import `HotelPage`, `HotelKelolaPage` (~:101-110)
  2. `getAIToolsSubFromPath` (~:213): `if (segments.length >= 4 && segments[2] === 'hotel' && segments[3] === 'kelola') return 'hotel/kelola';`
  3. `AI_SUB_STYLES` (~:767): `'hotel': { icon: Building2, bg:'bg-teal-50', bgDark:'dark:bg-teal-900/20', border:'border-teal-100', borderDark:'dark:border-teal-800/40', color:'text-teal-600 dark:text-teal-400', label:'Direktori Hotel' }` + `'hotel/kelola'` (label `'Kelola Hotel'`, ikon `Settings2`)
  4. dispatch (~:1102, **sebelum** parent): `if (sub === 'hotel/kelola') return hotelEnabled && isAdmin ? <HotelKelolaPage agent={...} onNavigate={navigatePath} /> : <AIToolsPage .../>;` lalu `if (sub === 'hotel') return hotelEnabled ? <HotelPage agent={{ slug, name, role }} onNavigate={navigatePath} /> : <AIToolsPage .../>;` — fallback ke AIToolsPage = redirect senyap
  5. back button (~:740): `hotel/kelola` → pushState `/dashboard/ai-tools/hotel`
  6. mount `document.title` chain (~:555) + ternary `onNavigate` (~:1122) + `getCurrentDocumentTitle` (~:241): tambah `hotel`→'Direktori Hotel', `hotel/kelola`→'Kelola Hotel'
  7. `const hotelEnabled = isHotelDirectoryEnabledForAgent(agentData.slug);` dekat `terasEnabled` (~:630)
  8. import ikon lucide yang dipakai
- [ ] **Step 4: Stub pages** — buat `HotelPage.tsx`/`HotelKelolaPage.tsx` minimal (judul + "memuat…") supaya build hijau sebelum Task 6-7.
- [ ] **Step 5: Verifikasi** — `npm run build` PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(hotel): gate FE + kartu Tools + routing hotel & hotel/kelola"`

### Task 6: `HotelPage` — kategori → daftar → detail (versi agent)

**Files:**
- Create/Modify: `src/components/HotelPage.tsx` (satu file, 3 view internal via state — deep-link per-kota TIDAK dibuat v1)

**Interfaces (Consumes):** `GET /api/hotels` (list ringan), `GET /api/hotels/:slug` (detail); `getAuthHeaders` dari `./LoginPage`; `PlyrVideo` untuk video; `SegmentedControl` TIDAK dipakai di sini.

- [ ] **Step 1: Struktur & data** — `type View = { kind:'kategori' } | { kind:'list', city } | { kind:'detail', slug }`; fetch list sekali saat mount (envelope `{success,data}`), hitung jumlah per kota untuk kartu kategori; state `detail` di-fetch saat masuk view detail. Error handling: 503 → tampilkan pesan migrasi; lainnya → blok error merah standar DS.
- [ ] **Step 2: View Kategori** — grid 2×2 kartu foto (pakai cover hotel pertama kota itu bila ada; fallback gradient teal) + nama kota + "N hotel"; footer info "Data hotel dikurasi admin. Ada koreksi? Hubungi Nikita."; tombol "Kelola" (chip teal, hanya `agent.role === 'admin'`) → `onNavigate('/dashboard/ai-tools/hotel/kelola')`.
- [ ] **Step 3: View Daftar** — back in-page ke kategori; sub-judul "N hotel · jarak ke {landmark}" (mekkah/madinah); input cari "Cari..." (filter nama, in-memory); kartu hotel per mockup (cover 92px, bintang amber, pill jarak emerald soft / area, "N foto · N video", badge amber "Belum ada foto" bila media kosong).
- [ ] **Step 4: View Detail** — galeri: gambar utama (index state) + counter `1/N` + strip thumbnail (video pakai overlay play; render `PlyrVideo` saat item aktif bertipe video); chip kategori teal; nama 20px bold + bintang; banner jarak emerald (hanya bila `distance_label`); "TENTANG HOTEL" (description); chips fasilitas; "LOKASI" alamat + tombol outline "Buka di Google Maps" (`window.open(gmaps_url)`, hanya bila ada); kotak amber "Catatan Agent" ber-gembok + pill "internal" (hanya bila `agent_note`); daftar video (`VIDEO (N)`) `PlyrVideo` + tanpa caption. Semua className dari DESIGN-SYSTEM (kartu `rounded-2xl border-gray-100 … shadow-sm` + dark pair).
- [ ] **Step 5: Tracking** — mount-once `trackEvent('feature','open_hotel_directory')` (ref guard); saat buka detail `trackEvent('action','hotel_view',{ slug })`.
- [ ] **Step 6: Verifikasi** — `npm run build` PASS.
- [ ] **Step 7: Commit** — `git commit -m "feat(hotel): halaman direktori hotel versi agent"`

### Task 7: `HotelKelolaPage` — daftar kelola, form tambah/edit, upload, hapus

**Files:**
- Create/Modify: `src/components/HotelKelolaPage.tsx`

**Interfaces (Consumes):** CRUD + upload endpoint Task 4; `SegmentedControl` (kategori, accent `'teal'`); `INPUT_CLASS`/`LABEL_CLASS` disalin verbatim dari `UmrahRegisterPage.tsx:184-186`; modal konfirmasi pola `AgentManagementPage.tsx:859-885`.

- [ ] **Step 1: Daftar kelola** — fetch list (endpoint sama dgn agent); filter pill kategori (aktif emerald-500, pola Advanced Filter Panel); baris: thumb 52px, nama, kota, status pill (`✓ Lengkap` emerald bila ada media & description; `Belum ada foto` amber); aksi ikon pensil (abu) & trash (merah soft) 36px rounded-xl; tombol header "+ Tambah" (CTA emerald kecil).
- [ ] **Step 2: Form tambah/edit** (view internal): seksi INFO DASAR (nama* input, kategori* `SegmentedControl` 4 opsi, bintang = 5 ikon star toggle), LOKASI (jarak + keterangan otomatis landmark — **hanya render bila kategori mekkah/madinah**, area, alamat textarea, link Google Maps), KONTEN (deskripsi textarea, fasilitas chips: preset `['Wi-Fi','Restoran','AC','Lift','Laundry','Musholla','Kursi Roda']` + input tambah bebas, tiap chip ada ×; catatan agent textarea + helper "Internal — hanya terlihat sesama agent"), FOTO & VIDEO (area upload + daftar thumb: badge `Cover` di index 0, tombol × per item, tap thumb non-cover → "Jadikan Cover" memindah ke index 0). Simpan sticky bawah (CTA emerald) + Batal.
- [ ] **Step 2b: Upload klien** — salin pola Teras: `accept="image/*,video/mp4,video/quicktime,video/webm"`; cek ukuran (3MB/20MB) sebelum upload; resize foto canvas maks 1600px JPEG 0.85 (salin logika `resizeCommunityPhoto`, TerasPage.tsx:423-455); POST raw blob ke `/api/hotels/media` dengan `Content-Type: blob.type`, `X-Upload-ID: crypto.randomUUID()`, `...getAuthHeaders()`; hasil `{url}` masuk state media `{type,url}`.
- [ ] **Step 3: Simpan** — POST (baru) / PUT (edit) body whitelist builder; sukses → kembali ke daftar + refetch; galat → tampilkan `json.error` (jangan telan pesan validasi builder).
- [ ] **Step 4: Hapus** — modal konfirmasi centered (backdrop blur, ikon AlertTriangle merah, "Hapus {nama}?", body "Semua data, foto, dan video hotel ini akan terhapus permanen…", Batal + "Ya, Hapus" merah) → DELETE → refetch.
- [ ] **Step 5: Verifikasi** — `npm run build` PASS; `node --check server.js` (tak berubah, sanity).
- [ ] **Step 6: Commit** — `git commit -m "feat(hotel): panel kelola hotel untuk admin"`

### Task 8: Analytics label + verifikasi akhir + checklist manual

**Files:**
- Modify: `server.js` (`FEATURE_LABELS` ~:18327, `ACTION_LABELS` ~:18360)

- [ ] **Step 1: Label** — `FEATURE_LABELS`: `open_hotel_directory: 'Direktori Hotel'`; `ACTION_LABELS`: `hotel_view: 'Lihat Detail Hotel'`. Komentar: selama gate nikita/bagas (keduanya admin), event TIDAK terekam (trackEvent & server skip admin) — label disiapkan untuk saat gate dibuka.
- [ ] **Step 2: Verifikasi penuh** — `node --check server.js` && `node --test tests/hotel-directory.test.js` && `npm run build` — semua PASS.
- [ ] **Step 3: Commit** — `git commit -m "feat(hotel): label analytics direktori hotel"`
- [ ] **Step 4: Checklist manual untuk user (BUKAN dijalankan Claude)** — sampaikan di ringkasan akhir:
  1. Paste `migrations/20260816000000_hotel_directory.sql` di Supabase SQL Editor.
  2. Merge/checkout branch → `npm run build` → restart `node server.js`.
  3. Login `bagas`: kartu Direktori Hotel tampil di Tools; login agent lain: kartu TIDAK tampil & `/dashboard/ai-tools/hotel` mental ke Tools; curl `/api/hotels` dengan token agent lain → 403.
  4. Sebagai nikita: tambah hotel (Mekkah, isi jarak) → upload foto+video → set cover → simpan; edit; hapus (cek dialog); cek hotel Turki: field jarak hilang.
  5. Versi agent: pilih kategori → cari → detail (galeri, video play, Maps, catatan internal).
