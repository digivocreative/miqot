# Teras — Utas di Composer (beberapa kiriman sekali kirim, ala Threads)

**Tanggal:** 2026-07-20
**Status:** Disetujui user (9 keputusan produk dikonfirmasi satu per satu)

## Tujuan

Saat membuat kiriman baru di Teras, agen bisa menumpuk beberapa kotak teks dalam
satu composer dan menerbitkannya sekaligus sebagai satu rantai — persis "New
thread" di Threads: tiap segmen punya toolbar medianya sendiri, ada tombol
"Tambah ke utas", penghitung `1/2`, tombol `✕` per segmen, dan satu tombol
Kirim untuk semuanya.

## Hubungan dengan spec "Komentar Jadi Kiriman Penuh"

Spec ini **berdiri sendiri dan didahulukan**, meski ia memakai kolom yang
pertama kali dirancang di `2026-07-20-teras-komentar-kiriman-penuh-design.md`
(yang sudah punya plan tapi belum diimplementasikan).

Alasannya: rantai satu penulis jauh lebih sederhana dari balasan antar-agen —
tidak ada notifikasi balasan, tidak ada mention lintas-agen yang rumit, tidak
ada cuplikan balasan berjenjang, penulisnya satu orang. Ia memaksa kolom thread
lahir lebih awal, dan spec komentar nanti tinggal menumpang.

**Kontrak antar-spec:** migrasi di sini memakai nama berkas dan DDL yang
**identik** dengan "BAGIAN A" pada plan komentar. Saat spec komentar dikerjakan,
Task 1-nya sudah selesai; ia lanjut dari BAGIAN B (backfill).

Satu titik yang akan disentuh dua kali: filter `parent_post_id IS NULL` pada
query profil agen. Spec ini memasangnya (utas tampil sebagai satu unit di
profil); spec komentar nanti melonggarkannya untuk balasan ke orang lain. Itu
kasus berbeda dan tidak bertabrakan — tapi `tests/community-thread-feed-guard.test.js`
harus ikut diperbarui saat itu, bukan dihapus.

## Keputusan produk (dikonfirmasi user)

1. **Rantai sekali kirim.** Composer bertumpuk, semua segmen terbit bersamaan.
   Bukan "tambahkan ke utas belakangan" — itu di luar cakupan.
2. **Feed hanya menampilkan segmen 1.** Kartu induk memuat label "Utas · N
   kiriman"; sisanya hidup di halaman detail. Feed Teras satu linimasa
   kronologis untuk semua agen — tanpa aturan ini, satu utas mengubur kiriman
   orang lain hari itu.
3. **Profil agen juga hanya segmen 1.** Konsisten dengan feed; profil penulis
   produktif tidak jadi tembok teks.
4. **Batas:** maks 5 segmen per utas; tiap segmen 1–500 karakter (sama seperti
   kiriman biasa); media 10 item per segmen (bukan per utas); quote dan link
   preview **hanya di segmen 1**.
5. **Semua-atau-tidak-sama-sekali.** Gagal di tengah → baris yang telanjur
   masuk dihapus permanen, balas 500.
6. **Halaman detail: rantai penuh, satu kolom komentar.** Komentar selalu nempel
   ke segmen 1, apa pun segmen yang diklik. Reaksi tetap per-segmen.
7. **Utas = satu peristiwa.** Pill "kiriman baru" naik sekali; mention dikumpul
   lintas-segmen, dedup per orang, satu notifikasi.
8. **Konfirmasi buang diperluas ke semua segmen.** Konfirmasi ini **sudah ada**
   (`'Buang draft kiriman ini?'`), tapi hanya memeriksa segmen tunggal; kalau
   dibiarkan, menutup utas 4 segmen membuangnya tanpa tanya selama segmen 1
   kebetulan kosong. Kondisinya jadi "ada segmen mana pun yang berisi teks atau
   media", dan teksnya jadi "Buang utas ini?" saat segmen >1.
9. **Hapus segmen 1 = hapus seluruh utas.** Hapus segmen tengah = hanya segmen
   itu.

## Arsitektur

Pendekatan terpilih: **perluas `POST /api/community/posts` yang ada dengan
`segments[]`, setelah menarik keluar dua helper.**

Dua alternatif ditolak:

- *Endpoint baru `POST /api/community/threads`.* Risiko regresi nol, tapi
  seluruh validasi (panjang, media, quote, link preview, tiga macam degradasi
  skema, idempotensi `client_id`, mention, pill) harus ada di dua tempat. Itu
  kelas bug yang sudah menggigit proyek ini (tiga titik batas media yang wajib
  sinkron di fitur media Teras), dan di sini duplikasinya jauh lebih besar.
- *Tambahkan loop langsung ke handler yang ada.* Handler itu sudah ~200 baris
  di berkas terpadat di repo; menambah loop insert + rollback di dalamnya
  membuatnya tak terpegang.

Yang membuat pendekatan terpilih layak: **`id` kiriman sudah dipasok klien**
(`client_id`, lihat penanganan `23505` di `server.js`). Klien membuat UUID tiap
segmen saat segmen itu lahir, jadi `parent_post_id` seluruh rantai diketahui
**sebelum** insert pertama, dan pengiriman ulang setelah rollback otomatis
idempoten tanpa mekanisme baru.

### 1. Database

Berkas: `migrations/20260726000000_community_post_thread.sql`

```sql
BEGIN;

ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS parent_post_id UUID REFERENCES community_posts(id),
  ADD COLUMN IF NOT EXISTS root_post_id   UUID REFERENCES community_posts(id);

-- Balasan/segmen langsung sebuah kiriman, terurut waktu.
CREATE INDEX IF NOT EXISTS idx_community_posts_parent
  ON community_posts (parent_post_id, created_at)
  WHERE parent_post_id IS NOT NULL AND deleted_at IS NULL;

-- Ambil seluruh utas dalam satu query datar.
CREATE INDEX IF NOT EXISTS idx_community_posts_root
  ON community_posts (root_post_id, created_at)
  WHERE root_post_id IS NOT NULL AND deleted_at IS NULL;

-- Feed utama kini selalu menyaring segmen lanjutan.
CREATE INDEX IF NOT EXISTS idx_community_posts_feed_roots
  ON community_posts (created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND parent_post_id IS NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
```

DDL **dijalankan user** lewat Supabase SQL Editor. Tidak ada tooling di repo ini
yang boleh menyentuh skema (tidak ada `exec_sql`, psql, atau DB URL), dan DB
lokal = produksi. Migrasi ini aditif dan aman dijalankan sebelum kode mendarat.

Konvensi utas satu penulis:

| Segmen | `parent_post_id` | `root_post_id` |
|---|---|---|
| 1 | `NULL` | `NULL` |
| n | id segmen n−1 | id segmen 1 |

**Utas 1 segmen = kiriman biasa.** Tidak ada baris penanda, tidak ada kolom
penghitung. Jumlah segmen dihitung dari `root_post_id` saat dibutuhkan.

### 2. Filter feed

`parent_post_id IS NULL` dipasang di **6 query** `server.js`:

| Lokasi | Fungsi |
|---|---|
| `buildPostsQuery` di `GET /api/community/feed` | linimasa utama **dan** profil agen (query yang sama + `agent_id`) |
| `loadCommunityTeaserSharedData` (12 terbaru) | teaser linimasa |
| `loadCommunityTeaserSharedData` (count hari ini) | statistik "N kiriman hari ini" |
| `GET /api/community/teaser` (count unread) | lencana belum-dibaca |
| `loadCommunityFeedHead` | pill "kiriman baru" |
| `loadTerasNotificationSources` | sumber broadcast `@semua` untuk lonceng |

Yang **tidak** difilter, dan alasannya: lookup kutipan (`buildQuotedQuery` di
feed, detail, dan create) — mengutip satu segmen itu sah; `GET
/api/community/posts/:id` — membuka segmen mana pun harus berhasil;
`loadTerasSharePreview` (OG card) — tiap segmen punya kode berbagi sendiri;
`loadActiveCommunityPost`, DELETE, dan pemeriksa referensi media — operasi
satu baris.

### 3. API

`POST /api/community/posts` menerima bentuk baru:

```jsonc
{
  "segments": [
    { "client_id": "<uuid>", "body": "Ini konten pertama.", "media": [] },
    { "client_id": "<uuid>", "body": "Ini konten kedua.",   "media": [] }
  ],
  "quoted_post_id": "...",   // hanya berlaku untuk segmen 0
  "link_preview": { }        // hanya berlaku untuk segmen 0
}
```

Bentuk lama `{ body, media, client_id }` tetap sah — dinormalisasi jadi
`segments` berisi satu elemen sebelum masuk jalur bersama. Tidak ada klien lama
yang perlu berubah, dan tidak ada cabang kode kedua.

Batas `express.json` rute ini naik **32kb → 96kb** (5 segmen berisi metadata
media bisa melewati 32kb). Catatan repo: parser global 10mb tidak menolong batas
per-route yang lebih kecil, tapi menaikkan batas per-route aman.

#### `lib/community-thread-compose.js` (murni, tanpa DB)

- `normalizeThreadSegments(input)` → `{ segments, error }`. Menerima bentuk lama
  maupun baru. Menolak: >5 segmen, segmen kosong, segmen >500 karakter, media
  >10, `client_id` bukan UUID atau kembar, quote/link di segmen selain 0.
- `buildThreadChain(segments)` → daftar baris siap-insert dengan
  `parent_post_id`/`root_post_id` terisi. Dihitung penuh sebelum insert pertama.
- `collectThreadMentions(segments, ...)` → sebutan unik lintas-segmen; tiap
  orang memetakan ke `postId` segmen tempat ia **pertama** disebut.
  `COMMUNITY_MENTION_LIMIT` diterapkan pada daftar gabungan, bukan per segmen —
  kalau tidak, utas 5 segmen jadi jalan pintas menyebut 5× lipat orang.

#### `createCommunityPostRow(row)` di `server.js`

Satu insert, membawa serta degradasi skema yang sudah ada (media, kolom `type`
usang, link preview) dan penanganan `23505` idempoten. Ditambah penjaga baru
bergaya sama, `isCommunityThreadSchemaMissing`: kalau `parent_post_id` belum
ada, kiriman 1 segmen tetap jalan seperti biasa; utas ≥2 segmen dibalas **503**
"Migrasi utas Teras belum diterapkan".

#### Alur handler

1. Normalisasi + validasi (murni). Gagal → 400; belum ada apa pun yang tersentuh.
2. `@semua` hanya dihormati di segmen 0; kuota broadcast dihitung per-utas.
3. Loop `createCommunityPostRow` berurutan.
4. Gagal di tengah → **hard delete** semua id yang sudah masuk, lalu 500. Aman:
   utas berumur detik, belum bisa direaksi atau dikomentari siapa pun.
5. Sukses → `recordCommunityMentions` sekali dengan daftar gabungan;
   `bumpCommunityFeedHead` sekali untuk segmen 0.
6. Balas 201 dengan payload segmen 0 seperti sekarang, plus `thread_count`.

`GET /api/community/posts/:id` menyertakan `thread: [...]` berisi seluruh rantai
terurut `created_at` bila ada, diambil satu query datar lewat `root_post_id`.

`DELETE /api/community/posts/:id`: bila sasaran adalah segmen 1 dari utas,
soft delete seluruh rantai dalam satu `update ... where root_post_id = X or id = X`.
Kalau tidak, sisa segmen jadi yatim — tak muncul di feed tapi masih hidup di
tautan langsung. Segmen tengah dihapus sendirian; rantai tidak disusun ulang,
segmen yang hilang cuma tak dirender, dan `parent_post_id` yang menunjuk baris
ter-soft-delete tetap sah karena baris fisiknya masih ada.

### 4. Frontend

`TerasPage.tsx` sudah 4235 baris, jadi segmen tidak ditambahkan begitu saja ke
sana.

**Berkas baru `src/components/teras/ComposerSegment.tsx`** — satu segmen:
avatar, nama, penghitung `1/2`, textarea auto-grow, baris toolbar (media, emoji,
mention), petak pratinjau media, sisa karakter, tombol `✕` (muncul hanya kalau
segmen >1). Props murni `{ index, total, value, onChange, onRemove, disabled, ... }`.
Tak ada fetch di dalamnya — unggah media dipicu lewat callback ke induk, supaya
`AbortController` dan pembersihan object-URL yang sudah ada tidak terpecah dua.

**`TerasPage.tsx`** — state skalar composer jadi larik:

```ts
interface ComposerSegment { key: string; id: string; body: string; media: ComposerMedia[]; }
const [composerSegments, setComposerSegments] = useState<ComposerSegment[]>([blank()]);
```

`id` dibuat saat segmen lahir, bukan saat submit — itu yang membuat pengiriman
ulang setelah rollback idempoten. `composerQuote` dan `composerLinkPreview`
tetap skalar (milik segmen 0).

Tiga penyesuaian yang mudah terlewat:

- **Popover mention** berkunci `context = 'composer'`; jadi `composer:<index>`.
  Kalau tidak, menyebut orang di segmen 2 menyisipkan teks ke segmen 1.
- **Deteksi URL link preview** hanya memindai segmen 0. URL di segmen lain tetap
  jadi tautan biru lewat linkify, cuma tak berkartu.
- **`composerMediaRef`** — pembersihan object-URL saat batal menyapu semua
  segmen, bukan satu.

Aturan interaksi:

- "Tambah ke utas" di bawah segmen terakhir; nonaktif di segmen ke-5 dengan
  keterangan "Maksimum 5 kiriman per utas".
- Segmen dihapus lewat `✕`; segmen 1 tak bisa dihapus.
- Saat kirim, segmen yang benar-benar kosong (tanpa teks **dan** tanpa media)
  dibuang otomatis.
- Segmen bermedia tapi tanpa teks **tidak** dibuang diam-diam: tombol Kirim
  nonaktif dengan pesan "Segmen n perlu teks". Kiriman Teras selalu wajib
  berteks (`body` 1–500) — aturan lama, tak berubah di sini — dan membuang
  media yang sudah diunggah tanpa memberi tahu itu kehilangan senyap.
- Tombol Post aktif kalau segmen 1 berisi. Labelnya tetap "Kirim" — jumlah sudah
  terbaca dari penghitung `n/5`.
- Konfirmasi tutup yang sudah ada (`TerasPage.tsx`, `'Buang draft kiriman ini?'`)
  diperluas: kondisinya memeriksa **semua** segmen, dan teksnya jadi
  "Buang utas ini?" saat segmen >1.

**Kartu feed** (`TerasCard.tsx`): di bawah isi, sebelum baris reaksi, label
`Utas · N kiriman` sebagai tombol yang membuka detail. Utas 1 segmen tak
menampilkan apa pun — kartu lama tak berubah.

Angkanya diambil di `GET /api/community/feed` dengan pola yang sudah dipakai
`quote_count`: satu query `select root_post_id where root_post_id in (<id akar
halaman ini>)`, dihitung di aplikasi. Tanpa N+1, tanpa kolom denormalisasi yang
bisa basi. Perhatikan aritmetikanya: query itu menghitung segmen **lanjutan**,
jadi label "Utas · N kiriman" memakai `count + 1`, dan label hanya muncul saat
`count > 0`.

**Halaman detail:** rantai bertumpuk dengan garis vertikal penyambung
antar-avatar; tiap segmen membawa baris reaksinya sendiri; satu kolom komentar
milik segmen 1 di bawah segmen terakhir. Membuka segmen mana pun memberi halaman
yang sama — hanya posisi gulir yang berbeda, segmen yang diklik disorot sesaat.

Berbagi dan OG card tak berubah: tiap segmen punya kode sendiri dan kartunya
menampilkan teks segmen itu, tapi membukanya mendarat di rantai penuh.

## Penanganan galat

| Keadaan | Balasan | Yang dilihat user |
|---|---|---|
| >5 segmen, segmen >500 karakter, media >10, quote/link di segmen ≠0 | 400 | Pesan spesifik di composer; isi utuh, tak ada yang terkirim |
| Kolom `parent_post_id` belum ada, utas ≥2 segmen | 503 | "Migrasi utas Teras belum diterapkan" |
| Insert gagal di tengah | rollback lalu 500 | "Gagal mengirim utas, coba lagi" — composer utuh; tekan Kirim lagi aman karena id segmen tak berubah |
| Rollback sendiri gagal | tetap 500 | `console.error` memuat daftar id yatim secara eksplisit, supaya bisa dibersihkan manual |

Baris terakhir adalah satu-satunya jalan menuju keadaan tak konsisten, dan ia
harus berisik, bukan diam.

Semua pesan berbahasa Indonesia, mengikuti gaya endpoint sekitarnya.

## Pengujian

- `tests/community-thread-compose.test.js` (baru) — inti fitur tanpa DB:
  normalisasi bentuk lama vs baru, tiap penolakan validasi, susunan
  `parent_post_id`/`root_post_id`, dedup mention lintas-segmen (orang yang sama
  di segmen 1 & 3 → satu notifikasi menunjuk segmen 1), `COMMUNITY_MENTION_LIMIT`
  pada daftar gabungan.
- `tests/community-thread-feed-guard.test.js` (baru) — penjaga sumber: membaca
  `server.js` dan memastikan 6 query di tabel §2 menyaring `parent_post_id`.
  Pagar ini menahan regresi diam-diam saat spec komentar mengubah query yang sama.
- `tests/teras-page.browser.test.js` (ubah) — tambah/hapus segmen, batas 5,
  konfirmasi buang, tombol Post nonaktif saat segmen 1 kosong.

Verifikasi akhir: `npx tsc --noEmit`; `node --test tests/community-thread-compose.test.js
tests/community-thread-feed-guard.test.js`; lalu **restart `node server.js`** — ia
tidak hot-reload, dan endpoint yang tampak 404 hampir selalu server basi.
Bedakan 404 dari 401 lewat `curl` sebelum menyimpulkan. `eslint` v10 belum
dikonfigurasi — bukan gerbang.

## Di luar cakupan (YAGNI)

- Menyusun ulang urutan segmen (drag).
- Menyimpan draf utas.
- Menambah segmen ke utas yang sudah terbit.
- Quote dan link preview per segmen.
- Backfill `community_post_comments` — itu milik spec komentar.
