# Teras Quote Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agen bisa meng-quote kiriman Teras lain (ala Threads): kiriman baru berisi teks + media sendiri dengan kartu preview kiriman asli tertanam.

**Architecture:** Kolom `quoted_post_id` di `community_posts` + join saat baca. Server memperkaya respons feed/detail dengan `quoted_post` dan `quote_count`; FE menambah tombol Quote di action row, komponen `QuotedPostCard`, dan mode quote pada composer yang sudah ada.

**Tech Stack:** Express + Supabase JS (server.js), React + TypeScript + Tailwind + framer-motion + lucide-react (TerasPage.tsx).

**Spec:** `docs/superpowers/specs/2026-07-19-teras-quote-design.md`

## Global Constraints

- Repo TIDAK punya test framework. Verifikasi per task: `node --check server.js` untuk server, `npx tsc --noEmit` untuk FE; verifikasi akhir `npx vite build` + uji manual di dev (protokol di Task 7).
- DDL TIDAK PERNAH dijalankan tooling. DB lokal = produksi. Migrasi hanya dibuat sebagai file; user menjalankannya sendiri via Supabase SQL Editor.
- `server.js` dan `src/components/TerasPage.tsx` mengandung WIP user yang belum di-commit (fitur media komentar). JANGAN commit kedua file itu. Hanya commit file BARU (migrasi, dokumen). Perubahan pada file shared dibiarkan di working tree; dilaporkan ke user di akhir.
- Pesan error/copy berbahasa Indonesia, mengikuti gaya yang sudah ada ("Kiriman yang dikutip tidak ditemukan", "Migrasi quote Teras belum diterapkan", "Kiriman sudah dihapus").
- Cek `git branch --show-current` = `main` sebelum setiap commit.

---

### Task 1: Migrasi SQL

**Files:**
- Create: `migrations/20260722000000_community_post_quote.sql`

**Interfaces:**
- Produces: kolom `community_posts.quoted_post_id UUID NULL REFERENCES community_posts(id)`; index partial `idx_community_posts_quoted`.

- [ ] **Step 1: Tulis file migrasi**

```sql
ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS quoted_post_id UUID REFERENCES community_posts(id);

CREATE INDEX IF NOT EXISTS idx_community_posts_quoted
  ON community_posts (quoted_post_id)
  WHERE quoted_post_id IS NOT NULL AND deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
```

Tanpa `ON DELETE` khusus: penghapusan kiriman Teras adalah soft-delete (`deleted_at`), baris tetap ada; placeholder dirender dari status itu.

- [ ] **Step 2: Commit (hanya file migrasi)**

```bash
git branch --show-current   # harus main
git add migrations/20260722000000_community_post_quote.sql
git commit -m "feat(teras): migrasi kolom quoted_post_id untuk fitur Quote" -- migrations/20260722000000_community_post_quote.sql
```

JANGAN menjalankan SQL ini terhadap database. User yang menjalankannya via Supabase SQL Editor (Task 7).

---

### Task 2: Server — helper quote + POST /api/community/posts

**Files:**
- Modify: `server.js` — helper baru setelah `isCommunityMediaSchemaMissing` (±baris 3993), dan handler `POST /api/community/posts` (±baris 4579–4712). JANGAN commit file ini (WIP user).

**Interfaces:**
- Consumes: `isCommunityUuid`, `isCommunityMediaSchemaMissing`, `normalizeStoredCommunityMedia`, `communityAuthorProfile` (sudah ada).
- Produces:
  - `isCommunityQuoteSchemaMissing(error) => boolean`
  - `communityQuotedPostPayload(row) => { available: false } | { available: true, id, body, media, created_at, is_system, author }` — row boleh `undefined`/soft-deleted → `{ available: false }`.
  - `POST /api/community/posts` menerima `quoted_post_id?: string`; respons 201 bertambah `quote_count: 0` dan `quoted_post`.

- [ ] **Step 1: Tambah dua helper setelah `isCommunityMediaSchemaMissing` (setelah baris 3993)**

```js
function isCommunityQuoteSchemaMissing(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || error?.details || '');
  if (!['42703', 'PGRST204'].includes(code)) return false;
  return /quoted_post_id/i.test(message)
    && /does not exist|could not find|schema cache/i.test(message);
}

function communityQuotedPostPayload(row) {
  if (!row || row.deleted_at) return { available: false };
  return {
    available: true,
    id: row.id,
    body: row.body,
    media: normalizeStoredCommunityMedia(row.media, row.photo_url),
    created_at: row.created_at,
    is_system: !!row.is_system,
    author: communityAuthorProfile(row.agent),
  };
}
```

- [ ] **Step 2: Validasi + muat kiriman yang di-quote di handler POST**

Sisipkan setelah blok validasi `clientId` (setelah baris ~4593, sebelum `const mediaPrefixes = ...`):

```js
    const quotedPostIdRaw = req.body?.quoted_post_id;
    let quotedPostId = null;
    let quotedPostRow = null;
    if (quotedPostIdRaw !== undefined && quotedPostIdRaw !== null) {
      if (!isCommunityUuid(quotedPostIdRaw)) {
        return res.status(400).json({ error: 'Kiriman yang dikutip tidak valid' });
      }
      const buildQuotedQuery = includeMedia => supabase
        .from('community_posts')
        .select(`id, body, photo_url, ${includeMedia ? 'media, ' : ''}is_system, created_at, deleted_at, agent:agents!community_posts_agent_id_fkey(name, slug, photo)`)
        .eq('id', quotedPostIdRaw)
        .maybeSingle();
      let { data: quotedRow, error: quotedError } = await buildQuotedQuery(true);
      if (isCommunityMediaSchemaMissing(quotedError)) {
        ({ data: quotedRow, error: quotedError } = await buildQuotedQuery(false));
      }
      if (quotedError) throw quotedError;
      if (!quotedRow || quotedRow.deleted_at) {
        return res.status(400).json({ error: 'Kiriman yang dikutip tidak ditemukan' });
      }
      quotedPostId = quotedPostIdRaw;
      quotedPostRow = quotedRow;
    }
```

- [ ] **Step 3: Sertakan kolom di payload insert + fallback skema**

Ubah `basePostPayload` (baris ~4621):

```js
    const basePostPayload = {
      ...(clientId ? { id: clientId } : {}),
      agent_id: agent.id,
      body,
      photo_url: photoUrl,
      is_system: false,
      ...(quotedPostId ? { quoted_post_id: quotedPostId } : {}),
    };
```

Di dalam loop retry insert, setelah blok `if (includeMediaColumn && isCommunityMediaSchemaMissing(insertError)) {...}` (baris ~4646–4652), tambahkan:

```js
      if (quotedPostId && isCommunityQuoteSchemaMissing(insertError)) {
        return res.status(503).json({ error: 'Migrasi quote Teras belum diterapkan' });
      }
```

(Tanpa `quoted_post_id` di payload, error ini tak mungkin muncul — tidak perlu retry-tanpa-kolom.)

- [ ] **Step 4: Perkaya respons 201**

Pada objek `data` respons (baris ~4696–4706), tambahkan dua field:

```js
      quote_count: 0,
      quoted_post: quotedPostId ? communityQuotedPostPayload(quotedPostRow) : null,
```

- [ ] **Step 5: Verifikasi sintaks**

Run: `node --check server.js`
Expected: tanpa output (exit 0).

---

### Task 3: Server — GET feed & GET posts/:id

**Files:**
- Modify: `server.js` — `GET /api/community/feed` (±baris 4391–4501) dan `GET /api/community/posts/:id` (±baris 4503–4577). JANGAN commit file ini.

**Interfaces:**
- Consumes: `isCommunityQuoteSchemaMissing`, `communityQuotedPostPayload` (Task 2).
- Produces: setiap kiriman pada respons feed/detail bertambah `quote_count: number` dan `quoted_post: null | { available: false } | { available: true, ... }`. Fallback: skema belum dimigrasi → semua `quoted_post: null`, `quote_count: 0`, feed tetap jalan.

- [ ] **Step 1: Feed — select + fallback dua-kolom**

Ganti signature `buildPostsQuery` (baris ~4404–4421) menjadi dua parameter dan sisipkan kolom quote:

```js
    const buildPostsQuery = (includeMedia, includeQuote) => {
      let query = supabase
        .from('community_posts')
        .select(`id, body, photo_url, ${includeMedia ? 'media, ' : ''}${includeQuote ? 'quoted_post_id, ' : ''}is_system, created_at, agent_id, agent:agents!community_posts_agent_id_fkey(name, slug, photo)`)
        .is('deleted_at', null);
      if (before?.postId) {
        query = query.or(
          `created_at.lt.${before.createdAt},and(created_at.eq.${before.createdAt},id.lt.${before.postId})`,
        );
      } else if (before) {
        // Keep accepting the original timestamp-only cursor for older clients.
        query = query.lt('created_at', before.createdAt);
      }
      return query
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(20);
    };
```

Ganti blok fetch (baris ~4423–4427) dengan loop fallback:

```js
    let includeMedia = true;
    let includeQuote = true;
    let posts = null;
    let postsError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      ({ data: posts, error: postsError } = await buildPostsQuery(includeMedia, includeQuote));
      if (includeMedia && isCommunityMediaSchemaMissing(postsError)) {
        includeMedia = false;
        continue;
      }
      if (includeQuote && isCommunityQuoteSchemaMissing(postsError)) {
        includeQuote = false;
        continue;
      }
      break;
    }
    if (postsError) throw postsError;
```

- [ ] **Step 2: Feed — muat kiriman yang di-quote + hitung quote_count**

Sisipkan setelah blok penghitungan `commentCounts` (setelah baris ~4473), sebelum `const data = ...`:

```js
    const quotedIds = includeQuote
      ? [...new Set((posts || []).map(post => post.quoted_post_id).filter(Boolean))]
      : [];
    let quotedRows = [];
    if (quotedIds.length > 0) {
      const buildQuotedQuery = withMedia => supabase
        .from('community_posts')
        .select(`id, body, photo_url, ${withMedia ? 'media, ' : ''}is_system, created_at, deleted_at, agent:agents!community_posts_agent_id_fkey(name, slug, photo)`)
        .in('id', quotedIds);
      let { data: rows, error: quotedError } = await buildQuotedQuery(true);
      if (isCommunityMediaSchemaMissing(quotedError)) {
        ({ data: rows, error: quotedError } = await buildQuotedQuery(false));
      }
      if (quotedError) throw quotedError;
      quotedRows = rows || [];
    }
    const quotedById = new Map(quotedRows.map(row => [row.id, row]));

    const quoteCounts = new Map(postIds.map(postId => [postId, 0]));
    if (includeQuote && postIds.length > 0) {
      const { data: quoteRows, error: quoteCountError } = await supabase
        .from('community_posts')
        .select('quoted_post_id')
        .in('quoted_post_id', postIds)
        .is('deleted_at', null);
      if (quoteCountError) throw quoteCountError;
      for (const row of quoteRows || []) {
        if (quoteCounts.has(row.quoted_post_id)) {
          quoteCounts.set(row.quoted_post_id, quoteCounts.get(row.quoted_post_id) + 1);
        }
      }
    }
```

- [ ] **Step 3: Feed — tambah field di mapping respons**

Di objek yang dikembalikan `const data = (posts || []).map(post => {...})` (baris ~4477–4490), tambahkan:

```js
        quote_count: quoteCounts.get(post.id) || 0,
        quoted_post: includeQuote && post.quoted_post_id
          ? communityQuotedPostPayload(quotedById.get(post.quoted_post_id))
          : null,
```

(`quotedById.get(...)` yang `undefined` — kiriman asli hard-deleted — menghasilkan `{ available: false }` dari helper.)

- [ ] **Step 4: Detail — pola sama untuk satu kiriman**

Ganti `buildPostQuery` (baris ~4513–4518):

```js
    const buildPostQuery = (includeMedia, includeQuote) => supabase
      .from('community_posts')
      .select(`id, body, photo_url, ${includeMedia ? 'media, ' : ''}${includeQuote ? 'quoted_post_id, ' : ''}is_system, created_at, agent_id, agent:agents!community_posts_agent_id_fkey(name, slug, photo)`)
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
```

Ganti blok fetch (baris ~4520–4525) dengan loop fallback:

```js
    let includeMedia = true;
    let includeQuote = true;
    let post = null;
    let postError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      ({ data: post, error: postError } = await buildPostQuery(includeMedia, includeQuote));
      if (includeMedia && isCommunityMediaSchemaMissing(postError)) {
        includeMedia = false;
        continue;
      }
      if (includeQuote && isCommunityQuoteSchemaMissing(postError)) {
        includeQuote = false;
        continue;
      }
      break;
    }
    if (postError) throw postError;
    if (!post) return res.status(404).json({ error: 'Kiriman tidak ditemukan' });
```

Sisipkan sebelum `const media = normalizeStoredCommunityMedia(...)` (baris ~4555):

```js
    let quotedPost = null;
    if (includeQuote && post.quoted_post_id) {
      const buildQuotedQuery = withMedia => supabase
        .from('community_posts')
        .select(`id, body, photo_url, ${withMedia ? 'media, ' : ''}is_system, created_at, deleted_at, agent:agents!community_posts_agent_id_fkey(name, slug, photo)`)
        .eq('id', post.quoted_post_id)
        .maybeSingle();
      let { data: quotedRow, error: quotedError } = await buildQuotedQuery(true);
      if (isCommunityMediaSchemaMissing(quotedError)) {
        ({ data: quotedRow, error: quotedError } = await buildQuotedQuery(false));
      }
      if (quotedError) throw quotedError;
      quotedPost = communityQuotedPostPayload(quotedRow);
    }

    let quoteCount = 0;
    if (includeQuote) {
      const { data: quoteRows, error: quoteCountError } = await supabase
        .from('community_posts')
        .select('quoted_post_id')
        .eq('quoted_post_id', post.id)
        .is('deleted_at', null);
      if (quoteCountError) throw quoteCountError;
      quoteCount = (quoteRows || []).length;
    }
```

Di objek `data` respons detail (baris ~4558–4571), tambahkan:

```js
        quote_count: quoteCount,
        quoted_post: post.quoted_post_id ? quotedPost : null,
```

- [ ] **Step 5: Verifikasi sintaks**

Run: `node --check server.js`
Expected: tanpa output (exit 0).

---

### Task 4: FE — tipe + komponen QuotedPostCard

**Files:**
- Modify: `src/components/TerasPage.tsx` — import lucide (±baris 14–33), interface (±baris 59–77), komponen baru setelah `PostSkeleton`/sebelum `PostImage` (±baris 427). JANGAN commit file ini.

**Interfaces:**
- Consumes: `AgentAvatar` (props `{name, photo, size: 'post'|'comment'}`), `timeAgo(iso)`, `Sparkles`/`Play` dari lucide, tipe `CommunityMedia`, `CommunityAuthor`.
- Produces:
  - `interface QuotedPostPreview { available: boolean; id?: string; body?: string; media?: CommunityMedia[]; created_at?: string; is_system?: boolean; author?: CommunityAuthor }`
  - `CommunityPost` bertambah `quote_count?: number; quoted_post?: QuotedPostPreview | null;`
  - `function QuotedPostCard({ quoted, interactive?, onOpenPost?, onOpenMedia? })` — `onOpenMedia(index, trigger)` bentuknya sama dengan `PostMediaRail.onOpen`.

- [ ] **Step 1: Import ikon `Quote`**

Di blok import lucide-react, tambahkan `Quote,` setelah `Play,` (urut alfabet):

```tsx
  Play,
  Quote,
  Send,
```

- [ ] **Step 2: Tambah tipe**

Setelah `interface CommunityMedia {...}` (baris ~74–77), tambahkan:

```tsx
interface QuotedPostPreview {
  available: boolean;
  id?: string;
  body?: string;
  media?: CommunityMedia[];
  created_at?: string;
  is_system?: boolean;
  author?: CommunityAuthor;
}
```

Di `interface CommunityPost` (baris ~59–72), tambahkan sebelum `is_own`:

```tsx
  quote_count?: number;
  quoted_post?: QuotedPostPreview | null;
```

(Opsional agar respons server lama tanpa field ini tetap valid.)

- [ ] **Step 3: Komponen `QuotedPostCard`**

Sisipkan setelah komponen `PostSkeleton` (setelah baris ~427):

```tsx
function QuotedPostCard({
  quoted,
  interactive = false,
  onOpenPost,
  onOpenMedia,
}: {
  quoted: QuotedPostPreview;
  interactive?: boolean;
  onOpenPost?: () => void;
  onOpenMedia?: (index: number, trigger: HTMLElement) => void;
}) {
  if (!quoted.available || !quoted.id) {
    return (
      <div className="mt-2 rounded-2xl border border-gray-200/80 bg-gray-50 px-3.5 py-3 text-[13px] font-medium text-gray-400 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-500">
        Kiriman sudah dihapus
      </div>
    );
  }

  const authorName = quoted.author?.name || (quoted.is_system ? 'Miqot' : 'Agent');
  const media = quoted.media || [];

  return (
    <div
      role={interactive ? 'link' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `Buka kiriman ${authorName} yang dikutip` : undefined}
      onClick={interactive ? event => {
        event.stopPropagation();
        onOpenPost?.();
      } : undefined}
      onKeyDown={interactive ? event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          onOpenPost?.();
        }
      } : undefined}
      className={`mt-2 min-w-0 rounded-2xl border border-gray-200/80 px-3.5 py-3 dark:border-slate-700/60 ${
        interactive
          ? 'cursor-pointer transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 dark:hover:bg-slate-900'
          : ''
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        {quoted.is_system ? (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-white">
            <Sparkles size={12} />
          </div>
        ) : (
          <AgentAvatar name={authorName} photo={quoted.author?.photo} size="comment" />
        )}
        <p className="min-w-0 truncate text-[13px] font-bold text-gray-900 dark:text-white">{authorName}</p>
        {quoted.created_at && (
          <time dateTime={quoted.created_at} className="shrink-0 text-[11px] font-medium text-gray-500 dark:text-slate-400">
            {timeAgo(quoted.created_at)}
          </time>
        )}
      </div>

      {quoted.body && (
        <p className="mt-1.5 line-clamp-4 whitespace-pre-wrap break-words text-[14px] leading-[1.5] text-gray-800 dark:text-slate-200">
          {quoted.body}
        </p>
      )}

      {media.length > 0 && (
        <div className="mt-2 flex snap-x gap-1.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {media.map((item, index) => (
            <button
              key={`${item.type}:${item.url}`}
              type="button"
              disabled={!interactive}
              onClick={event => {
                event.stopPropagation();
                onOpenMedia?.(index, event.currentTarget);
              }}
              aria-label={`Lihat ${item.type === 'video' ? 'video' : 'foto'} ${index + 1} kiriman ${authorName}`}
              className="relative h-32 shrink-0 snap-start overflow-hidden rounded-xl border border-gray-100 bg-gray-100 dark:border-slate-700 dark:bg-slate-950"
            >
              {item.type === 'video' ? (
                <>
                  <video
                    src={item.url}
                    preload="metadata"
                    muted
                    playsInline
                    aria-hidden="true"
                    className="h-full w-auto min-w-[6rem] max-w-[60vw] bg-black object-contain"
                  />
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white">
                      <Play size={14} fill="currentColor" />
                    </span>
                  </span>
                </>
              ) : (
                <img
                  src={item.url}
                  alt={`Foto ${index + 1} kiriman ${authorName}`}
                  loading="lazy"
                  className="h-full w-auto min-w-[6rem] max-w-[60vw] object-cover"
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

Catatan: kartu quote TIDAK merender quote di dalamnya (satu tingkat, sesuai spec) — `QuotedPostPreview` memang tidak punya field quote.

- [ ] **Step 4: Verifikasi tipe**

Run: `npx tsc --noEmit`
Expected: exit 0. (Komponen belum dipakai — TS mengizinkan deklarasi tak terpakai; hanya eslint yang protes, dan eslint belum dikonfigurasi.)

---

### Task 5: FE — tombol Quote di action row + render kartu di feed/detail

**Files:**
- Modify: `src/components/TerasPage.tsx` — dalam render post: setelah blok `PostMediaRail` (±baris 2647–2655) dan setelah tombol Komentari (±baris 2711–2744). JANGAN commit file ini.

**Interfaces:**
- Consumes: `QuotedPostCard` (Task 4), `openPostDetail(postId)`, `openMediaViewer(media, index, authorName, trigger)`, `openQuoteComposer(post)` (didefinisikan Task 6 — untuk urutan kompilasi, Task ini dan Task 6 diverifikasi bersama; kerjakan Task 6 langsung setelah Task 5 sebelum `tsc`).
- Produces: tombol Quote (aria-label "Quote") dengan badge `post.quote_count`, kartu quote interaktif di feed dan detail.

- [ ] **Step 1: Render kartu quote setelah media rail**

Setelah blok `{postMedia.length > 0 && (...)}` (baris ~2647–2655), tambahkan:

```tsx
                    {post.quoted_post && (
                      <QuotedPostCard
                        quoted={post.quoted_post}
                        interactive
                        onOpenPost={() => {
                          const quotedId = post.quoted_post?.id;
                          if (quotedId) openPostDetail(quotedId);
                        }}
                        onOpenMedia={(index, trigger) => {
                          const quoted = post.quoted_post;
                          if (!quoted?.media?.length) return;
                          const quotedAuthor = quoted.author?.name || (quoted.is_system ? 'Miqot' : 'Agent');
                          openMediaViewer(quoted.media, index, quotedAuthor, trigger);
                        }}
                      />
                    )}
```

(`handlePostAreaClick` mengabaikan klik pada `button`, dan kartu memakai `stopPropagation` — klik kartu membuka kiriman yang dikutip, bukan kiriman quote-nya.)

- [ ] **Step 2: Tombol Quote setelah tombol Komentari**

Setelah `motion.button` Komentari (setelah baris ~2744, masih dalam div action row), tambahkan:

```tsx
                      <motion.button
                        type="button"
                        onClick={() => openQuoteComposer(post)}
                        aria-label="Quote"
                        title="Quote"
                        whileTap={reduceMotion ? undefined : { scale: 0.9 }}
                        transition={{ type: 'spring', stiffness: 520, damping: 26 }}
                        className="flex min-h-11 items-center gap-1.5 rounded-full px-2 text-[12.5px] font-semibold text-gray-500 transition-colors active:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 dark:text-slate-400 dark:active:bg-slate-900"
                      >
                        <Quote size={19} />
                        <AnimatePresence mode="popLayout" initial={false}>
                          {(post.quote_count || 0) > 0 && (
                            <motion.span
                              key={post.quote_count}
                              className="tabular-nums"
                              initial={reduceMotion ? false : { y: 9, opacity: 0 }}
                              animate={{ y: 0, opacity: 1 }}
                              exit={reduceMotion ? { opacity: 0 } : { y: -9, opacity: 0 }}
                              transition={{ duration: 0.16, ease: 'easeOut' }}
                            >
                              {post.quote_count}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </motion.button>
```

Tombol tampil juga untuk kiriman sistem (keputusan spec: semua kiriman bisa di-quote).

- [ ] **Step 3: Lanjut langsung ke Task 6**

`openQuoteComposer` belum ada — `tsc` akan gagal sampai Task 6 Step 1 selesai. Jangan jalankan verifikasi dulu.

---

### Task 6: FE — mode quote pada composer

**Files:**
- Modify: `src/components/TerasPage.tsx` — state composer (±baris 733–737), `resetComposer` (±baris 1179–1190), `openComposer` (±baris 1269), `handleCreatePost` (±baris 1481–1577), JSX composer (judul ±baris 2014, setelah blok media ±baris 2096–2140). JANGAN commit file ini.

**Interfaces:**
- Consumes: `QuotedPostPreview`, `QuotedPostCard` (Task 4), `normalizePostMedia(post)` (sudah ada, baris ~313).
- Produces: `openQuoteComposer(post: CommunityPost)` (dipakai Task 5); body POST bertambah `quoted_post_id`; sukses kirim menaikkan `quote_count` kiriman yang dikutip di state feed.

- [ ] **Step 1: State + `openQuoteComposer` + reset**

Setelah `const [composerError, setComposerError] = useState<string | null>(null);` (baris ~737), tambahkan:

```tsx
  const [composerQuote, setComposerQuote] = useState<QuotedPostPreview | null>(null);
```

Setelah fungsi `openComposer` (setelah baris ~1276), tambahkan:

```tsx
  const openQuoteComposer = (post: CommunityPost) => {
    composerRequestIdRef.current = null;
    setComposerQuote({
      available: true,
      id: post.id,
      body: post.body,
      media: normalizePostMedia(post),
      created_at: post.created_at,
      is_system: post.is_system,
      author: post.author,
    });
    openComposer(false);
  };
```

Di `resetComposer` (baris ~1179–1190), setelah `setComposerMedia([]);` tambahkan:

```tsx
    setComposerQuote(null);
```

(Quote atas kiriman quote hanya membawa `post.id` kiriman quote itu sendiri — previewnya satu tingkat, otomatis sesuai spec.)

- [ ] **Step 2: Kirim `quoted_post_id` + bump `quote_count`**

Di `handleCreatePost`, dalam `body: JSON.stringify({...})` (baris ~1540–1545), tambahkan:

```tsx
            ...(composerQuote?.id ? { quoted_post_id: composerQuote.id } : {}),
```

Ganti baris `setPosts(current => [createdPost, ...current.filter(post => post.id !== createdPost.id)]);` (baris ~1554) menjadi:

```tsx
      const quotedId = composerQuote?.id;
      setPosts(current => [createdPost, ...current.filter(post => post.id !== createdPost.id)]
        .map(post => post.id === quotedId
          ? { ...post, quote_count: (post.quote_count || 0) + 1 }
          : post));
```

- [ ] **Step 3: JSX composer — judul + kartu preview**

Ganti isi judul (baris ~2014):

```tsx
              <h2 id="teras-composer-title" className="text-center text-sm font-bold text-gray-900 dark:text-white">{composerQuote ? 'Quote Kiriman' : 'Buat Kiriman'}</h2>
```

Setelah blok `{composerMedia.length > 0 && (...)}` berakhir (setelah baris ~2140, masih di kolom konten composer), tambahkan:

```tsx
                  {composerQuote && <QuotedPostCard quoted={composerQuote} />}
```

(Non-interaktif di composer; batal quote = tutup composer, sesuai spec.)

- [ ] **Step 4: Verifikasi tipe (mencakup Task 5)**

Run: `npx tsc --noEmit`
Expected: exit 0.

---

### Task 7: Verifikasi menyeluruh + serah terima migrasi

**Files:**
- Tidak ada file baru. Verifikasi + laporan ke user.

- [ ] **Step 1: Verifikasi build**

Run:
```bash
node --check server.js
npx tsc --noEmit
npx vite build
```
Expected: semua exit 0.

- [ ] **Step 2: Uji manual di dev (gunakan skill `verify`/`run` bila tersedia)**

Protokol (login sebagai agen dengan akses Teras):
1. Feed termuat normal SEBELUM migrasi diterapkan (fallback: tanpa tombol error, `quoted_post` null semua).
2. Klik Quote pada sebuah kiriman → composer terbuka dengan kartu preview; kirim → jika migrasi belum diterapkan, muncul error "Migrasi quote Teras belum diterapkan" (expected).
3. Setelah user menjalankan migrasi: quote dari feed dan dari detail; quote dengan media; quote kiriman sistem; quote atas kiriman quote (preview hanya satu tingkat); badge angka quote naik pada kiriman yang dikutip.
4. Hapus kiriman yang di-quote (akun penulis) → kartu berubah jadi "Kiriman sudah dihapus".
5. Klik kartu quote → navigasi ke detail kiriman asli; klik media di kartu → media viewer terbuka.

- [ ] **Step 3: Laporan akhir ke user**

Sampaikan:
- SQL migrasi `migrations/20260722000000_community_post_quote.sql` harus dijalankan user via Supabase SQL Editor (tempel isi file).
- `server.js` dan `TerasPage.tsx` sengaja TIDAK di-commit karena bercampur WIP media komentar milik user — user memutuskan cara stage/commit (selektif atau sekaligus).
- Sebelum migrasi dijalankan, feed aman; hanya submit quote yang ditolak 503.
