# Teras — Fitur Mention Antar-Agent

**Tanggal:** 2026-07-19
**Status:** Disetujui (Pendekatan A), siap implementasi

## Ringkasan

Di `/dashboard/teras`, seorang agent dapat me-mention agent lain (`@Nama`) baik
saat membuat **post baru** maupun saat **berkomentar**. Mention:

1. **Memberi notifikasi** ke yang disebut — badge in-app **dan** Telegram.
2. **Menyorot/menautkan** nama sebagai pill di dalam teks.
3. **Menarik keterlibatan** ke percakapan (gaya Threads).

Kandidat mention = **anggota Teras** (allowlist `COMMUNITY_AGENT_SLUGS`), dengan
**peserta thread** diprioritaskan di atas autocomplete.

Pill menampilkan **nama tampilan**, acuan internal disimpan sebagai **slug**
(stabil terhadap perubahan nama). Pill **non-klik** untuk MVP (tautan ke profil
= peningkatan nanti; Teras belum punya halaman profil).

## Pendekatan (A — terpilih)

Textarea composer tetap plain. `@` memicu popover autocomplete; memilih agent
menyisipkan token slug polos `@<slug> ` ke teks. Saat submit, klien mengirim
`body` + `mentions: string[]` (slug terpilih). Server mengambil kebenaran dari
**body** (bukan percaya array klien), mem-validasi, mencatat, dan memicu notif.
Saat render, `@<slug>` yang sah diubah jadi pill `@Nama` (nama di-lookup → selalu
terkini).

Ditolak: (B) contenteditable dengan pill live — menulis ulang 3 composer, risiko
regresi tinggi. (C) teks polos + array offset — pengelolaan offset di textarea
saat edit ribet, untung tipis.

## Data

### Endpoint kandidat
`GET /api/community/members` → `[{slug, name, photo}]` untuk semua anggota Teras
(resolve `COMMUNITY_AGENT_SLUGS` ke baris `agents`). Klien mengurutkan peserta
thread ke atas (irisan dengan author post + komentar yang sudah dimuat).

### Tabel `community_mentions` (migrasi baru — dijalankan user via Supabase SQL Editor)
| kolom | tipe | catatan |
|---|---|---|
| `id` | uuid pk default gen_random_uuid() | |
| `mentioned_agent_id` | uuid fk → agents | yang disebut |
| `author_agent_id` | uuid fk → agents | penyebut |
| `post_id` | uuid fk → community_posts | selalu terisi |
| `comment_id` | uuid fk → community_post_comments, null | null = mention di body post |
| `created_at` | timestamptz default now() | |
| `seen_at` | timestamptz null | dasar unread |

- Index: `(mentioned_agent_id, seen_at)`, `(mentioned_agent_id, created_at desc)`.
- Unik dedup: `UNIQUE (mentioned_agent_id, post_id, comment_id)` — satu target
  hanya sekali per post/komentar (comment_id null diperlakukan sbagai nilai;
  gunakan `COALESCE`/partial index bila perlu karena NULL tak unik di Postgres).
  Realisasi: dua unique partial index — satu `WHERE comment_id IS NULL`
  (post-level), satu `WHERE comment_id IS NOT NULL`.
- Rendering pill **tidak** bergantung tabel ini (di-parse dari body). Tabel murni
  untuk notifikasi/inbox.

Migrasi lewat runner `scripts/migrate-community-mentions.js` (idempoten, cetak SQL
untuk di-paste; pola sama `scripts/migrate-community-post-media.js`).

## Server

### Helper murni (unit-tested)
`extractCommunityMentions(body, allowedSlugs, authorSlug, limit=10)` di modul
`lib/community-mentions.js`:
- Regex `@<slug>` di batas kata (awal atau setelah whitespace).
- Iris dengan `allowedSlugs` (anggota Teras), buang `authorSlug` (no self-notify),
  dedup, potong ke `limit`.
- Return array slug sah, urut kemunculan.

### POST posts / POST comments
- Terima `body` + `mentions` (opsional). Panggil `extractCommunityMentions(body,
  memberSlugs, agent.slug)` — **body sumber kebenaran**; `mentions` klien hanya
  cross-check (irisan). Slug tak sah → dibiarkan teks biasa (tidak error).
- Setelah insert post/komentar sukses: resolve slug → agent_id, insert baris
  `community_mentions` (upsert `onConflict` untuk idempoten retry), lalu picu
  Telegram (best-effort, di luar jalur sukses response — kegagalan notif tak
  menggagalkan post).
- Fallback `isCommunityMentionSchemaMissing(error)` → lewati pencatatan mention
  diam-diam (post tetap sukses) bila tabel belum ada. Tidak 503 — mention adalah
  lapisan tambahan, bukan syarat post.

### Rendering (GET feed / detail / comments)
Tiap post & komentar sertakan `mentions: [{slug, name}]` diturunkan dari
`extractCommunityMentions(body, memberSlugs, null)` ∩ anggota (resolve nama).
Tidak perlu query tabel `community_mentions` untuk render.

### Inbox in-app
- `GET /api/community/mentions` → `[{id, post_id, comment_id, author:{name,photo},
  snippet, created_at, seen_at}]` untuk agent aktif (limit 50, terbaru dulu).
- `GET /api/community/mentions/head` → `{unread_count}` (seen_at null, cap 99).
  Cache in-memory TTL pendek sejalan pola `communityFeedHeadCache`.
- `POST /api/community/mentions/seen` → set `seen_at=now()` untuk mention agent
  (opsional body `{ids}` untuk selektif; default tandai semua).
- Semua di belakang `requireCommunityAccess` + fallback schema-missing (balikkan
  kosong / unread 0 bila tabel belum ada).

### Telegram
Saat mention sah: bila `mentioned_agent.telegram_chat_id` ada dan
`notification_prefs.community_mentions !== false` → kirim
"🔔 {Penulis} menyebut kamu di Teras — {snippet}" + tautan post. Reuse helper
Telegram yang ada. Best-effort try/catch.

### Prefs
Tambah kunci `community_mentions` (default **on**) ke `normalizeNotificationPrefs`.
Bisa dimatikan dari halaman preferensi notifikasi.

## Klien (TerasPage.tsx)

### `MentionAutocomplete`
Komponen reusable dipakai 3 tempat (composer post + 2 jalur komentar):
- Deteksi `@` di batas kata sampai caret → query.
- Popover dekat caret: nama + avatar + slug, filter query (cocokkan nama & slug),
  peserta thread di atas.
- Keyboard ↑/↓/Enter/Tab/Esc + klik.
- Pilih → ganti `@query` dengan `@<slug> `, catat slug ke state mention composer.

### State
- Post: `composerMentions: string[]`.
- Komentar: field `mentions` per `CommentPanelState` (sejalan `media` per-panel).
- Kirim bersama body saat submit.

### Rendering pill
Fungsi murni `renderCommunityBody(body, mentions)`: pecah teks pada `@<slug>` yang
ada di `mentions` server → pill `@Nama` (brand + semibold, non-underline,
non-klik). `@slug` tak dikenal → teks biasa. Dipakai di feed, detail, komentar,
dan kartu quote.

### Inbox UI
Badge unread pada entri Teras (poll `/mentions/head`, pola pill "kiriman baru").
Panel "Kamu disebut" — tiap baris buka post/komentar via `openPostDetail`;
membuka panel → `POST /mentions/seen`.

### Prefs UI
Toggle "Sebutan (mention) di Teras" di halaman preferensi notifikasi.

## Edge case & aturan

- Char counter menghitung `@slug` mentah (raw). Batas 500/300 tak berubah.
- Maks 10 mention sah per item.
- Tidak notif diri sendiri.
- Dedup: satu (target, post/comment) sekali walau slug ditulis dua kali.
- Retry idempoten (client_id + upsert onConflict) tak menggandakan mention.
- Non-anggota / slug tak dikenal → teks biasa, tanpa notif, tanpa error.
- Semua jalur mention degradasi anggun bila migrasi belum jalan (post/komentar
  tetap berhasil).

## Testing

- Unit `lib/community-mentions.js`: batas kata, dedup, self-exclude, limit,
  non-anggota difilter, slug berdempet tanda baca.
- Server: POST membuat baris mention + dedup + fallback schema-missing; GET
  menyertakan `mentions`; endpoint inbox unread/seen.
- Browser (`tests/teras-page.browser.test.js`): autocomplete muncul saat `@`,
  penyisipan token, pill ter-render di feed.

## Dependensi manual

Migrasi `community_mentions` **wajib dijalankan user** di Supabase SQL Editor
(mesin dev tak bisa DDL). Sampai itu, fitur aktif tetapi mention tidak tercatat/
dinotif (post & pill tetap jalan). Runner mencetak SQL siap-paste.
