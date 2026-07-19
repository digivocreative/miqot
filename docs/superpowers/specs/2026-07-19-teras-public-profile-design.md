# Teras — Halaman Profil Agent (`/teras/<slug>`)

**Tanggal:** 2026-07-19
**Status:** Disetujui, siap implementasi

## Ringkasan

Pill mention `@Nama` di Teras saat ini tidak bisa diklik (lihat
`2026-07-19-teras-mention-design.md`: "tautan ke profil = peningkatan nanti;
Teras belum punya halaman profil"). Spec ini menambahkan halaman itu.

`/teras/<slug>` menampilkan profil seorang anggota Teras: foto, nama, `@slug`,
tombol WhatsApp, lalu daftar kiriman Teras miliknya. Halaman **ber-gate**:
hanya anggota Teras yang bisa membukanya. "Public" di sini berarti publik
antar-agent, bukan publik ke internet.

Tidak ada migrasi DDL. Tidak ada endpoint baru.

## Keputusan yang diambil

| Pertanyaan | Pilihan | Alasan |
|---|---|---|
| Tujuan pill mention | Profil Teras ber-gate | Isi Teras adalah konsumsi internal komunitas; halaman publik `alhijaz.co/<slug>` yang sudah ada adalah halaman jualan paket, bukan profil orangnya |
| Isi halaman | Header + daftar post | Menjawab "siapa dia & apa yang dia tulis" tanpa migrasi DDL |
| Titik masuk | Pill mention + nama/avatar penulis post + penulis komentar | Avatar yang tidak bisa diklik terasa rusak begitu halaman profil ada |
| Akses | Belum login → `/login` lalu balik; bukan anggota → "tidak tersedia" | Link `/teras/<slug>` pasti dilempar antar-agent lewat WhatsApp; jangan buntu |
| Bentuk URL | `/teras/<slug>`, dibedakan dari kode share by bentuk | URL terpendek; diskriminator sudah tersedia sebagai fungsi murni teruji |

Ditolak:
- Endpoint `/api/community/agents/:slug/posts` sendiri — menyalin ~150 baris
  hidrasi (reaksi, jumlah komentar, quote, `is_own`, kursor) dari `/feed`.
- `/teras/agent/<slug>` dan `/teras/@<slug>` — aman dari tabrakan, tapi URL
  lebih panjang / `@` sering rusak saat di-paste di sebagian aplikasi chat.
- Bio yang bisa diedit sendiri — butuh migrasi DDL (dijalankan manual oleh user
  di Supabase SQL Editor). Iterasi berikutnya.
- Memecah `TerasPage.tsx` (3.763 baris) — refactor tersendiri dengan risiko
  regresi besar yang tidak melayani tujuan sekarang.

## Tabrakan rute yang harus ditangani

`/teras/<code>` **sudah dipakai**: link share post Teras (`lib/teras-share.js`),
di mana `<code>` = 8 hex pertama dari UUID post, di-redirect ke
`/dashboard/teras/post/<code>`. Link ini sudah beredar di WhatsApp dan tidak
boleh rusak.

Pembeda: `isTerasShortCode(value)` (sudah ada, `/^[0-9a-f]{8}$/`).

- Segmen persis 8 karakter hex → **link share** (perilaku lama, tak berubah).
- Selain itu → **profil agent**.

Konsekuensi wajib: validasi slug agent harus **menolak slug berbentuk 8-hex**
(`server.js:2638` dan `server.js:3161`), kalau tidak agent dengan slug seperti
`abcdefab` tak akan pernah bisa dibuka profilnya. Slug 8-hex yang sudah
terlanjur ada (kalau ada) dicek saat implementasi; bila ditemukan, laporkan ke
user — jangan diam-diam mengganti slug orang.

Juga: `teras` ditambahkan ke `RESERVED_SPA_SLUGS` (`server.js:192`) dan
`RESERVED_SLUGS` (`server.js:2615`, `server.js:3161`) supaya tidak ada agent
yang mengklaim slug "teras" dan menabrak seluruh cabang rute ini.

## Server

### `GET /api/community/feed?agent=<slug>`

Satu query param baru pada endpoint yang sudah ada (`server.js:4682`):

- `agent` kosong/absen → perilaku lama persis (feed global).
- `agent` terisi → resolve slug ke anggota Teras via `loadCommunityMembers()`.
  - Slug bukan anggota Teras (atau tidak ada) → `404 { error: 'Agent tidak
    ditemukan di Teras' }`.
  - Anggota → tambahkan `.eq('agent_id', member.id)` di `buildPostsQuery`.
- Seluruh hidrasi sesudahnya (reaksi, `my_reaction`, jumlah komentar, quote,
  `quote_count`, `is_own`, kursor `created_at|id`) tidak disentuh.
- `dbLoadShedGuard` + `authMiddleware` + `requireCommunityAccess` tetap.

Cache `communityFeedHeadCache` / `/feed/head` **tidak** dipengaruhi — pil
"kiriman baru" memang dimatikan di mode profil.

### Data profil

Diambil klien dari `GET /api/community/members` yang sudah ada
(`server.js:4558`) → `{slug, name, photo}`. Tidak ada endpoint baru.

Nomor WhatsApp untuk tombol kontak: kolom `agents.phone` sudah ada, tapi belum
ikut di-select. Tambahkan `phone` ke `loadCommunityMembers()` (`server.js:4002`)
dan ke payload `/members`. Ini satu-satunya perubahan bentuk respons yang
diizinkan spec ini. Agent dengan `phone` kosong → tombol WhatsApp disembunyikan.
Autocomplete mention tidak terpengaruh (field tambahan, bukan perubahan bentuk
yang merusak).

## Klien

### `src/lib/terasRoutes.ts` (baru, murni)

```ts
parseTerasPath(pathname): { kind: 'share'; code: string }
                        | { kind: 'profile'; slug: string }
                        | null
terasProfilePath(slug): string   // "/teras/<slug>"
```

Memakai `isTerasShortCode` dari `lib/teras-share.js` sebagai pembeda. Semua
tempat yang perlu tahu bentuk URL memanggil modul ini — satu sumber kebenaran,
pola sama dengan `lib/kontenRoutes.js`.

### `src/main.tsx`

- Cabang `isTerasShare` yang ada dipecah lewat `parseTerasPath`:
  - `kind: 'share'` → perilaku lama (redirect ke `/dashboard/teras/post/<code>`).
  - `kind: 'profile'` → render `DashboardRouter` (bukan halaman berdiri
    sendiri). Gate sesi, tema, header, dan navigasi client-side ikut gratis —
    dan klik pill dari feed tidak me-reload halaman.
- Sesi kosong → simpan tujuan ke `sessionStorage` kunci `teras_share_next`
  (yang sudah ada), lalu `/login`.
- `LoginRouter`: allowlist tujuan dilonggarkan — terima `/dashboard/teras/post/…`
  (lama) **dan** path yang `parseTerasPath`-nya `kind: 'profile'`. Jangan
  terima string sembarang.

### `src/components/DashboardLayout.tsx`

- Parsing path: `/teras/<slug>` → tab `teras` + `profileSlug`.
- Tombol back di header → `/dashboard/teras`.
- `document.title` → nama agent (fallback "Teras").
- Gate `terasEnabled` (`isCommunityEnabledForAgent`) berlaku sama: agent yang
  bukan anggota Teras membuka `/teras/<slug>` → halaman "tidak tersedia".

### `src/components/TerasPage.tsx`

Prop baru `profileSlug?: string | null`. Saat terisi:

- Fetch feed dengan `?agent=<slug>`.
- Composer dan pil "kiriman baru" disembunyikan.
- Di atas daftar dirender header profil: foto besar, nama, `@slug`, tombol
  WhatsApp (bila nomor ada).
- Slug bukan anggota (404 dari server) → "Agent tidak ditemukan di Teras".
- Daftar kosong → "Belum ada kiriman".
- Kartu post, reaksi, komentar, quote, share: komponen yang sama persis dengan
  mode feed. Tidak ada duplikasi kartu.

### Tautan ke profil

Semua lewat `terasProfilePath(slug)` + helper navigasi pushState yang sudah ada
(supaya tombol back browser bekerja):

1. Segmen `mention` di renderer pill (`src/lib/communityMentions.ts` menghasilkan
   `{type:'mention', slug, name}`) — pill jadi tautan.
2. Nama + avatar penulis post.
3. Nama + avatar penulis komentar.

Author yang slug-nya kosong / post sistem (`is_system`) tidak jadi tautan.
Klik tautan di dalam kartu tidak boleh ikut memicu handler buka-post-detail
(hentikan propagasi).

## Uji

- `tests/teras-routes.test.js` (baru) — `parseTerasPath`: kode share 8-hex,
  slug biasa, slug campur angka-huruf 8 karakter non-hex, path kosong, path
  panjang, dan `terasProfilePath`.
- Uji server untuk `?agent=`: slug asing → 404, slug non-anggota → 404, slug
  anggota → hanya post milik agent itu, tanpa `agent` → feed global tak berubah.
- Uji validasi slug: slug 8-hex ditolak saat registrasi/ubah slug; `teras`
  ditolak sebagai slug.
- Uji browser mengikuti pola `tests/teras-page.browser.test.js`: klik pill
  mention → mendarat di profil; header profil tampil; composer tidak ada.
- Verifikasi akhir: `node --test`, `tsc`, `vite build`.

## Di luar cakupan

- Bio/tagline yang bisa diedit agent (butuh DDL).
- Statistik profil (jumlah post/komentar, bergabung sejak).
- Profil yang bisa dibuka tanpa login / OG meta untuk share ke luar.
- Memecah `TerasPage.tsx`.
