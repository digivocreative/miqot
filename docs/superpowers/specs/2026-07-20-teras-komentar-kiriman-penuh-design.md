# Teras — Komentar Jadi Kiriman Penuh (thread ala Threads)

**Tanggal:** 2026-07-20
**Status:** Disetujui user (5 keputusan produk dikonfirmasi satu per satu)

## Tujuan

Komentar di Teras bisa direaksi, dibalas, dan dikutip — sama seperti balasan di
Threads. Konsekuensinya komentar berhenti menjadi entitas kelas dua: ia dilebur
menjadi kiriman penuh di `community_posts`, sehingga seluruh mesin yang sudah
ada (reaksi, quote, media, lapor, halaman detail) berlaku untuknya tanpa
duplikasi kode.

## Keputusan produk (dikonfirmasi user)

1. **Thread penuh.** Komentar punya halaman sendiri; membuka komentar =
   membuka kiriman. Bukan sekadar label "membalas" atau nested satu tingkat.
2. **Balasan = kiriman penuh, tapi tidak masuk feed utama.** Balasan muncul di
   profil publik penulisnya dan di thread, tidak di linimasa global. Feed Teras
   adalah satu linimasa kronologis untuk semua agen; tanpa filter ini, satu
   diskusi ramai akan mengubur kiriman lain hari itu. Secara data keduanya
   identik — bedanya hanya filter `parent_post_id IS NULL` di query feed, jadi
   keputusan ini bisa dibalik kapan saja tanpa migrasi.
3. **Cuplikan satu tingkat.** Di bawah tiap balasan ditampilkan maks 2 balasan
   terbaru + "Lihat N balasan lainnya". Tidak ada indentasi tingkat ketiga,
   sedalam apa pun threadnya.
4. **Batas balasan tetap 300 karakter** (kiriman induk tetap 500), supaya
   balasan tetap terasa ringkas meski kini bisa dikutip orang lain.
5. **Membalas komentar tidak memindahkan halaman.** Kolom balas di bawah
   berganti sasaran ("Membalas ke Nikita Sari ✕"). Halaman thread tetap
   tersedia lewat klik pada komentarnya.

## Arsitektur

Pendekatan terpilih: **peleburan `community_post_comments` ke `community_posts`
lewat kolom induk**. Alternatif "komentar tetap tabel sendiri + halaman detail"
ditolak user: ia menuntut duplikat tabel reaksi, kolom quote kedua, dan cabang
render terpisah untuk selamanya. Peleburan memindahkan biaya sekali di muka
(migrasi) dan setelah itu setiap fitur kiriman berlaku otomatis untuk balasan.

Blast radius terukur: `community_post_comments` hanya disebut di 12 tempat
`server.js` + 3 skrip. Frontend murni lewat API, jadi tidak ada akses tabel
langsung yang perlu dikejar.

### 1. Database

Dua kolom baru di `community_posts`:

- `parent_post_id` — kiriman yang dibalas langsung. `NULL` = kiriman induk.
- `root_post_id` — akar thread, disalin dari induk saat insert. `NULL` untuk
  kiriman induk. Didenormalisasi supaya satu thread bisa diambil dengan satu
  query datar, tanpa CTE rekursif.

Fitur yang ikut **tanpa kode baru**, karena tabelnya sudah menunjuk ke
`community_posts`:

| Fitur | Alasan |
|---|---|
| Reaksi di komentar | `community_post_reactions.post_id` → `community_posts` |
| Quote komentar | `community_posts.quoted_post_id` → `community_posts` |
| Media di balasan | kolom `media` sudah ada di `community_posts` |
| Lapor komentar | `community_post_reports.post_id` |

Reaksi balasan otomatis memakai tiga jenis yang sama (`suka`/`selamat`/`aamiin`).
Quote atas balasan menghasilkan kiriman induk baru (`parent_post_id IS NULL`),
jadi wajar muncul di feed.

`CHECK (char_length(body) BETWEEN 1 AND 2000)` pada `community_posts` lebih
longgar dari batas komentar, jadi backfill tidak akan ditolak.

#### Urutan migrasi — tidak boleh ditukar

DDL **dijalankan user** lewat Supabase SQL Editor. Tidak ada tooling di repo ini
yang boleh menyentuh skema (tidak ada `exec_sql`/psql/DB URL), dan DB lokal =
produksi.

**Langkah 1 — SQL bagian A** (`migrations/20260726000000_community_post_thread.sql`).
Aditif; kode lama tidak terpengaruh.

```sql
BEGIN;

ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS parent_post_id UUID REFERENCES community_posts(id),
  ADD COLUMN IF NOT EXISTS root_post_id   UUID REFERENCES community_posts(id);

-- Balasan langsung sebuah kiriman, terurut waktu.
CREATE INDEX IF NOT EXISTS idx_community_posts_parent
  ON community_posts (parent_post_id, created_at)
  WHERE parent_post_id IS NOT NULL AND deleted_at IS NULL;

-- Ambil seluruh thread dalam satu query.
CREATE INDEX IF NOT EXISTS idx_community_posts_root
  ON community_posts (root_post_id, created_at)
  WHERE root_post_id IS NOT NULL AND deleted_at IS NULL;

-- Feed utama kini selalu menyaring balasan; indeks feed lama tidak lagi cocok.
CREATE INDEX IF NOT EXISTS idx_community_posts_feed_roots
  ON community_posts (created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND parent_post_id IS NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
```

**Langkah 2 — SQL bagian B** (backfill, idempoten):

```sql
INSERT INTO community_posts
  (id, agent_id, body, media, is_system, created_at, deleted_at,
   parent_post_id, root_post_id)
SELECT c.id, c.agent_id, c.body, c.media, false, c.created_at, c.deleted_at,
       c.post_id, c.post_id
FROM community_post_comments c
ON CONFLICT (id) DO NOTHING;
```

`id` dipertahankan supaya tautan notifikasi yang sudah beredar dan baris
`community_mentions` lama tetap sah.

**Langkah 3 — deploy kode baru.** Mulai saat ini balasan ditulis ke
`community_posts`. `node server.js` tidak hot-reload; server wajib direstart.

**Langkah 4 — ulangi SQL bagian B.** Menangkap komentar yang lahir di celah
antara langkah 2 dan 3.

**Langkah 5 — SQL bagian C** (pemindahan FK mention). Sengaja paling akhir:

```sql
-- comment_id sekarang menunjuk kiriman balasan, bukan baris tabel komentar.
ALTER TABLE community_mentions
  DROP CONSTRAINT IF EXISTS community_mentions_comment_id_fkey;
ALTER TABLE community_mentions
  ADD CONSTRAINT community_mentions_comment_id_fkey
  FOREIGN KEY (comment_id) REFERENCES community_posts(id) ON DELETE CASCADE;

NOTIFY pgrst, 'reload schema';
```

Urutannya kritis dan sempat salah di draf spec ini: `ADD CONSTRAINT`
memvalidasi seluruh baris yang ada, jadi ia hanya lolos setelah semua komentar
tersalin (langkah 2 & 4). Menjalankannya sebelum langkah 3 juga berbahaya —
kode lama masih menulis komentar ke tabel lama, dan baris mention barunya akan
menunjuk id yang belum ada di `community_posts` sehingga insert mention gagal.

**Langkah 6 — nanti, setelah yakin:**
`ALTER TABLE community_post_comments RENAME TO community_post_comments_legacy;`
Tidak di-`DROP`; itu jaring pengaman rollback. Pembersih media baru berhenti
memindai tabel lama setelah langkah ini.

Verifikasi antar-langkah:

```sql
SELECT (SELECT count(*) FROM community_post_comments)                        AS komentar_lama,
       (SELECT count(*) FROM community_posts WHERE parent_post_id IS NOT NULL) AS balasan_baru;
```

### 2. Server (`server.js`)

#### Query yang WAJIB menyaring `parent_post_id IS NULL`

Checklist eksplisit; satu saja terlewat berarti balasan bocor ke tempat yang
salah.

| Lokasi | Akibat kalau lupa |
|---|---|
| `GET /api/community/feed` (mode feed, `?agent` kosong) | balasan membanjiri linimasa |
| `GET /api/community/feed/head` | pil "kiriman baru" berkedip tiap ada balasan |
| `GET /api/community/teaser` (hitungan belum dibaca) | badge Teras menghitung balasan |
| Ringkasan kiriman terbaru untuk MCP (~`server.js:19340`) | "kiriman terbaru" bisa berupa potongan balasan |
| Broadcast `@semua` | siaran hanya boleh dari kiriman induk |

**Yang justru tidak boleh difilter:** mode profil (`?agent=slug`) — di sanalah
balasan ikut tampil (keputusan 2), disertai konteks induknya.

#### Endpoint

**`POST /api/community/posts/:id/comments`** — URL dipertahankan agar perubahan
FE minimal. Sekarang meng-insert baris `community_posts`:

- `parent_post_id = :id`, `root_post_id = resolveRootPostId(induk)`
- validasi 1–300 karakter tetap; media tetap; `client_id` (idempotensi) tetap
- `is_system` selalu `false`; `quoted_post_id` tidak diterima di jalur ini
- induk harus ada dan `deleted_at IS NULL`
- respons tetap berbentuk komentar (`id`, `body`, `media`, `created_at`,
  `author`, `is_own`) plus `reply_count: 0` dan `preview_replies: []`

**`GET /api/community/posts/:id/comments`** — balasan langsung, masing-masing
plus `reply_count` dan `preview_replies` (maks 2 terbaru). Satu query tambahan
mengambil cucu lewat `root_post_id`, pengelompokan dilakukan di memori oleh
`groupRepliesWithPreview`.

**`GET /api/community/posts/:id`** — untuk balasan, respons menyertakan
`ancestors[]` (rantai ke atas sampai akar). Leluhur terhapus dikirim sebagai
`{ available: false }`, **bukan** 404 — kalau tidak, menghapus satu kiriman
induk akan mematikan seluruh thread di bawahnya.

**`DELETE /api/community/comments/:id`** — tetap ada sebagai alias yang
mendelegasikan ke jalur hapus kiriman, supaya klien lama tidak pecah.

**`POST /api/community/posts`** — menolak `parent_post_id`/`root_post_id` dari
klien. Balasan hanya lahir lewat endpoint `/comments`: satu jalan masuk, satu
tempat validasi.

#### Hitungan

`comment_count` = jumlah balasan **langsung** (`parent_post_id = post.id`),
bukan seluruh subtree. Untuk kiriman induk yang sudah ada, angkanya identik
dengan sebelum migrasi — tidak ada lompatan angka yang membingungkan.

#### Notifikasi

Sumber tipe `comment` pindah dari `community_post_comments` ke
`community_posts WHERE parent_post_id IN (kiriman saya)`. Efek sampingnya
diinginkan: reaksi dan balasan atas *balasan* saya kini juga memberi notifikasi.
Dedupe mention-vs-comment di `lib/community-notifications.js` tidak berubah,
karena `comment_id` sekarang berisi id kiriman balasan.

#### Pembersih media

`purgeDeletedCommunityMedia` memindai dua tabel sampai langkah 6, lalu cukup
`community_posts` saja.

### 3. Frontend

Tampilan detail sudah digerakkan oleh `postId`, jadi halaman thread sebuah
balasan = tampilan detail yang sama dengan id balasan. Tidak ada rute baru.

**Baris aksi pada komentar** (sebelumnya hanya ikon hapus), ukuran lebih kecil
dari kiriman induk supaya hierarki visual tidak rata:
reaksi · balas (dengan jumlah) · kutip. Ikon hapus tetap di kanan atas.

**Membalas komentar** mengarahkan ulang kolom bawah: chip
"Membalas ke <Nama> ✕" muncul di atas kolom, placeholder ikut berubah, ✕
mengembalikan sasaran ke kiriman induk. Halaman tidak pindah. Balasan yang
terkirim langsung muncul sebagai cuplikan di bawah komentar tersebut
(optimistic, memakai `client_id` yang sudah ada).

**Cuplikan balasan:** maks 2 balasan terbaru dengan indentasi satu tingkat,
lalu "Lihat N balasan lainnya" → halaman thread komentar itu.

**Halaman thread balasan:** leluhur ditampilkan di atas sebagai rantai kecil
yang bisa diklik; leluhur terhapus jadi placeholder redup "Kiriman sudah
dihapus", konsisten dengan perilaku quote yang sudah ada.

**Profil:** balasan muncul dengan baris "Membalas ke @X" di atas isi; klik baris
itu menuju kiriman induk.

**Struktur berkas.** `TerasPage.tsx` sudah 4.235 baris. Rendering komentar,
cuplikan balasan, dan baris aksinya dipindah ke berkas baru
`src/components/teras/CommentThread.tsx`, menerima data dan callback lewat props
tanpa memegang state fetch sendiri. Pemindahan ini terkurung pada bagian yang
memang sedang disentuh — bukan refactor umum `TerasPage`.

### 4. Logika murni & pengujian

Tes di repo ini menguji helper murni, bukan endpoint. Karena itu logika bentuk
thread ditarik ke `lib/community-thread.js` (pola yang sama dengan
`community-notifications.js` dan `community-mentions.js`, yang juga dipakai dua
sisi):

- `resolveRootPostId(parent)` → `parent.root_post_id ?? parent.id`. Satu tempat,
  supaya dua jalur tulis tidak bisa berbeda.
- `buildAncestorChain(rows, postId)` → rantai leluhur; leluhur hilang atau
  terhapus menjadi `{ available: false }`.
- `groupRepliesWithPreview(children, grandchildren, { previewLimit: 2 })` →
  `reply_count` + `preview_replies` per balasan.

`tests/community-thread.test.js` (baru) menutup: akar tanpa induk; thread tiga
tingkat; induk terhapus di tengah rantai; balasan >2 memicu "lihat lainnya";
balasan terhapus tidak ikut dihitung.

Tes yang **diperbarui** karena perilakunya memang berubah:
`community-notifications.test.js` (sumber `comment` kini kiriman) dan
`community-profile-feed.test.js` (profil memuat balasan).

Verifikasi akhir: `node --test tests/`, `npx tsc --noEmit`, `npm run build`.
(`eslint` v10 belum dikonfigurasi di repo ini, jadi bukan gerbang.)

## Risiko & penangkal

| Risiko | Penangkal |
|---|---|
| Satu query lupa `parent_post_id IS NULL` → balasan bocor ke feed/badge | Tabel checklist 5 lokasi di §2 jadi item terpisah di rencana implementasi, masing-masing diverifikasi manual setelah deploy |
| Komentar lahir di celah langkah 2–3 dan hilang | Langkah 4 mengulang backfill; idempoten lewat `ON CONFLICT DO NOTHING` |
| Kolom belum dimigrasi saat kode baru jalan | Pola `isCommunity…SchemaMissing` yang sudah dipakai media/quote/link-preview: baca degradasi ke tanpa-kolom; tulis balasan → 503 "Migrasi thread Teras belum diterapkan" |
| DB lokal = produksi | Semua DDL ditempel user di Supabase SQL Editor; tidak ada tooling yang menyentuh skema |
| Menghapus kiriman induk mematikan thread di bawahnya | `GET /posts/:id` mengembalikan leluhur terhapus sebagai placeholder, bukan 404 |
| Server tidak direstart setelah deploy → 404 senyap pada endpoint baru | Verifikasi pakai `curl`, dan bedakan 404 dari 401 sebelum menyimpulkan |

## Di luar lingkup

- Menampilkan balasan di feed utama (dapat diaktifkan nanti dengan melepas satu
  filter; tidak ada migrasi tambahan).
- Indentasi lebih dari satu tingkat pada satu halaman.
- Notifikasi jenis baru selain yang sudah ada.
- Refactor `TerasPage.tsx` di luar pemindahan `CommentThread.tsx`.
