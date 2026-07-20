# Teras — Mention `@semua` (broadcast ke seluruh agent)

**Tanggal:** 2026-07-20
**Status:** Disetujui, siap implementasi

## Ringkasan

Seorang agent dapat menulis `@semua` di **kiriman** Teras untuk memberi tahu
seluruh agent sekaligus. Notifikasi muncul di **lonceng Teras** saja (tanpa
Telegram). Kuota: **admin tanpa batas**, agent biasa **satu kiriman ber-`@semua`
per hari kalender WIB**.

`@semua` bukan anggota: ia token khusus yang ditandai pada kirimannya, bukan
di-fan-out menjadi 71 baris mention. Lonceng menurunkan notifikasi dari tanda itu.

## Keputusan yang sudah dikunci

| Pertanyaan | Keputusan |
|---|---|
| Boleh dipakai di mana | **Kiriman saja.** Di komentar `@semua` = teks biasa, tanpa pill, tanpa notifikasi. |
| Jatah habis | **Tolak kirim** (kiriman tidak tersimpan) + pesan jelas. |
| Definisi "sehari" | **Hari kalender Asia/Jakarta**, reset tengah malam WIB. |
| Kanal notifikasi | **Lonceng saja.** Tidak ada DM Telegram. |
| Penyimpanan | **Tanda di kiriman** (`community_posts.mentions_everyone`), tanpa fan-out. |
| Saran di picker | Item teratas untuk **semua agent**, dengan label sisa jatah. |
| Kiriman dihapus | **Jatah tetap terpakai** — kalau tidak, hapus-lalu-kirim-lagi jadi celah tak terbatas. |
| Admin | Tanpa batas sama sekali (bukan "10× sehari"). |

## Token dan parsing

`@semua` dikenali dengan batas kata yang sama seperti mention biasa, ditambah
larangan karakter slug sesudahnya:

```
/(?<![A-Za-z0-9_.@])@semua(?![A-Za-z0-9_-])/i
```

Konsekuensi yang harus diuji: `@semuanya` **tidak** cocok, `bagas@semua.com`
**tidak** cocok, `(@Semua)` **cocok** (case-insensitive), `@semua.` **cocok**.

Helper murni dua sisi — server dan klien harus sepakat, sama seperti
`extractCommunityMentions`:

Satu modul dipakai kedua sisi — server **dan** komposer meng-import file yang
sama, pola `lib/teras-linkify.js` / `lib/teras-share.js` (bukan sepasang kembar
yang bisa menyimpang):

- `lib/community-broadcast.js` + `lib/community-broadcast.d.ts`:
  - `EVERYONE_TOKEN = 'semua'`
  - `hasEveryoneMention(body): boolean`
  - `jakartaDayStartIso(now): string` — awal hari WIB dalam ISO UTC
  - `resolveBroadcastQuota({ role, usedToday }): { unlimited, allowed, remaining }`
  - `broadcastQuotaLabel(quota): string` — teks sublabel picker

Slug `semua` ditambahkan ke daftar terlarang di `lib/agent-slug.js` supaya tidak
ada agent yang bisa memilikinya di kemudian hari.

`@semua` dan mention personal boleh berdampingan dalam satu kiriman; keduanya
diproses independen (mention personal tetap dibatasi 10 slug).

## Data

Migrasi additive `migrations/20260725000000_community_broadcast.sql`
(**dijalankan manual oleh user via Supabase SQL Editor** — tidak ada pipeline
migrasi otomatis di repo ini):

```sql
ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS mentions_everyone BOOLEAN NOT NULL DEFAULT false;

-- Cek kuota harian: kiriman ber-@semua milik satu agent pada rentang waktu.
CREATE INDEX IF NOT EXISTS community_posts_broadcast_quota_idx
  ON community_posts (agent_id, created_at DESC)
  WHERE mentions_everyone;

-- Sumber notifikasi lonceng: broadcast terbaru lintas agent.
CREATE INDEX IF NOT EXISTS community_posts_broadcast_feed_idx
  ON community_posts (created_at DESC)
  WHERE mentions_everyone;
```

Pra-migrasi: `POST /api/community/posts` yang body-nya mengandung `@semua`
dijawab **503 "Migrasi @semua Teras belum diterapkan"** lewat guard
`isCommunityBroadcastSchemaMissing(error)` (pola `isCommunityQuoteSchemaMissing`).
Kiriman tanpa `@semua` tetap normal. Query notifikasi menganggap kolom yang
belum ada sebagai "tidak ada broadcast", bukan galat.

## Aturan kuota (server penegak)

Saat `POST /api/community/posts` dan body mengandung `@semua`:

1. `role === 'admin'` → lolos, tanpa hitungan.
2. Selain itu: hitung kiriman milik agent dengan `mentions_everyone = true` dan
   `created_at >= jakartaDayStartIso(now)`. **Termasuk yang `deleted_at` terisi.**
3. `usedToday >= 1` → **403** `{ error: 'Jatah @semua hari ini sudah dipakai. Coba lagi besok.' }`,
   kiriman tidak dibuat.
4. Lolos → kiriman disimpan dengan `mentions_everyone = true`.

Pemeriksaan kuota dan insert tidak atomik; dua kiriman bersamaan dari agent yang
sama secara teori bisa lolos berdua. Diterima: dampaknya satu notifikasi ekstra,
bukan kerusakan data, dan idempotency key komposer sudah menutup kasus
retry-ganda yang realistis.

Endpoint status untuk komposer:

```
GET /api/community/broadcast-quota
→ { success: true, data: { unlimited: boolean, used_today: number, remaining: number, resets_at: ISO } }
```

Klien hanya memakainya untuk label; server tetap otoritas.

## Notifikasi lonceng

`loadTerasNotificationSources` mendapat sumber keempat:

```js
supabase.from('community_posts')
  .select('id, body, created_at, author:agents!community_posts_agent_id_fkey(name, photo)')
  .eq('mentions_everyone', true)
  .neq('agent_id', agent.id)      // penulis tidak dapat notifikasi sendiri
  .is('deleted_at', null)          // kiriman terhapus hilang dari lonceng
  .order('created_at', { ascending: false })
  .limit(limit)
```

`mergeNotifications` menambah entri bertipe `broadcast`:

- `id: 'broadcast:<post_id>'`, `post_id`, `comment_id: null`, `actor`,
  `actor_count: 1`, `snippet` (cuplikan body, 140 char), `created_at`, `unread`
  memakai watermark yang sama.
- **Dedupe:** kalau kiriman yang sama juga menyebut penerima secara personal
  (baris mention level-post), entri broadcast dibuang — yang personal lebih
  spesifik dan menang. Pola sama seperti `dedupeCommentsAgainstMentions`.
- `countUnreadNotifications` ikut menghitung broadcast setelah dedupe.

Teks di panel lonceng: **"<Nama> menyebut semua agent"** + cuplikan, menautkan
ke `/dashboard/teras/post/<id>` seperti notifikasi mention.

## UI komposer

- Picker mention menampilkan item khusus paling atas: **"@semua — beri tahu
  semua agent"** dengan sublabel:
  - admin → `tanpa batas`
  - agent, jatah tersisa → `1× sehari`
  - agent, jatah habis → `jatah hari ini habis` (item tetap tampil tapi
    dinonaktifkan, supaya aturannya terlihat, bukan misterius)
- Item ini muncul saat query kosong atau cocok dengan awalan `sem`, dan **hanya
  di komposer kiriman** — bukan di kolom komentar.
- Memilihnya menyisipkan `@semua ` seperti mention biasa.
- `@semua` dirender sebagai pill di isi kiriman (`MentionText`,
  `MentionHighlightLayer`) dengan label `@semua`, non-tautan.
- Penolakan 403 dari server ditampilkan sebagai galat komposer memakai mekanisme
  error yang sudah ada; draf tidak hilang.

## Test

**Murni (`node:test`, tanpa DB/browser)**
- `hasEveryoneMention`: `@semuanya`, `bagas@semua.com`, `@Semua`, `(@semua)`,
  `@semua.`, body kosong.
- `jakartaDayStartIso`: tengah malam WIB, batas 23:59 → 00:01, input DST-free
  (WIB tanpa DST) dengan waktu tetap yang disuntikkan, bukan `Date.now()`.
- `resolveBroadcastQuota`: admin unlimited, agent 0 → allowed, agent 1 → ditolak.
- Merge lonceng: broadcast masuk, penulis tidak dapat, dedupe vs mention personal,
  `countUnreadNotifications` tidak menghitung ganda.

**Server (`tests/community-*.test.js`, guard sumber)**
- Route `POST /api/community/posts` memanggil pengecekan kuota sebelum insert.
- Guard 503 pra-migrasi terpasang untuk jalur broadcast.

**Browser (`tests/teras-page.browser.test.js`)**
- Item `@semua` tampil paling atas di picker komposer dengan label jatah yang benar.
- Item tidak muncul di picker kolom komentar.
- Jatah habis → item dinonaktifkan.

## Di luar cakupan

- DM Telegram untuk broadcast.
- Preferensi opt-out per agent untuk `@semua`.
- `@semua` di komentar.
- Kuota per-peran selain admin/agent.
