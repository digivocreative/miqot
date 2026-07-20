# Teras — Komentar Jadi Kiriman Penuh: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Melebur `community_post_comments` ke `community_posts` lewat kolom induk, sehingga komentar bisa direaksi, dibalas berjenjang, dan dikutip seperti balasan di Threads.

**Architecture:** Balasan adalah baris `community_posts` dengan `parent_post_id` (induk langsung) dan `root_post_id` (akar thread, didenormalisasi agar satu thread terambil dalam satu query datar). Feed utama menyaring `parent_post_id IS NULL`; profil tidak. Logika bentuk thread ditarik ke helper murni `lib/community-thread.js` agar bisa diuji `node --test`.

**Tech Stack:** Node/Express (`server.js`, satu berkas besar), Supabase JS client (bukan SQL mentah), React + TypeScript + Vite (`src/components/TerasPage.tsx`), tes `node:test`.

## Global Constraints

- **DDL hanya dijalankan user** lewat Supabase SQL Editor. Tidak ada tooling di repo yang boleh menyentuh skema (tidak ada `exec_sql`, psql, atau DB URL). DB lokal = produksi.
- **`node server.js` tidak hot-reload.** Setelah mengubah `server.js`, server harus direstart; endpoint baru yang tampak 404 biasanya server basi. Bedakan 404 dari 401 lewat `curl` sebelum menyimpulkan.
- **Batas karakter:** kiriman induk 500, balasan 300 (`MAX_COMMUNITY_COMMENT_CHARS`). Jangan disamakan.
- **Cuplikan balasan:** maksimum 2 per komentar, indentasi berhenti di tingkat itu.
- **`comment_count` = jumlah balasan langsung**, bukan seluruh subtree.
- **Pola degradasi skema** wajib mengikuti yang sudah ada (`isCommunityMediaSchemaMissing`, `isCommunityQuoteSchemaMissing`, `isCommunityLinkPreviewSchemaMissing`): baca boleh mundur ke tanpa-kolom, tulis balasan → 503.
- **Pesan galat berbahasa Indonesia**, mengikuti gaya endpoint sekitarnya.
- **Commit tiap task.** Stage berkas secara selektif (`git add <path>`) — user punya WIP lain di working tree. Verifikasi `git branch --show-current` = `main` sebelum tiap commit.
- Verifikasi akhir tiap task yang menyentuh FE: `npx tsc --noEmit`. Tes: `node --test tests/<file>`. (`eslint` v10 belum dikonfigurasi — bukan gerbang.)

## File Structure

| Berkas | Tanggung jawab |
|---|---|
| `migrations/20260726000000_community_post_thread.sql` (baru) | DDL + backfill, dalam 3 bagian berlabel yang dijalankan user pada urutan tertentu |
| `lib/community-thread.js` (baru) | Helper murni: akar thread, rantai leluhur, pengelompokan cuplikan balasan |
| `tests/community-thread.test.js` (baru) | Tes helper murni |
| `tests/community-thread-feed-guard.test.js` (baru) | Guard sumber: memastikan 5 query kritis menyaring balasan |
| `server.js` (ubah) | Filter feed, endpoint balasan, ancestors, sumber notifikasi |
| `src/components/teras/CommentThread.tsx` (baru) | Render komentar + baris aksi + cuplikan balasan |
| `src/components/TerasPage.tsx` (ubah) | State thread, penargetan balasan, memakai `CommentThread` |
| `tests/community-notifications.test.js` (ubah) | Sumber `comment` kini kiriman |
| `tests/community-profile-feed.test.js` (ubah) | Profil memuat balasan |

---

### Task 1: Migrasi SQL

**Files:**
- Create: `migrations/20260726000000_community_post_thread.sql`

**Interfaces:**
- Produces: kolom `community_posts.parent_post_id`, `community_posts.root_post_id`; indeks `idx_community_posts_parent`, `idx_community_posts_root`, `idx_community_posts_feed_roots`. Semua task berikutnya bergantung pada nama-nama ini.

Berkas ini **tidak dijalankan oleh siapa pun di sesi ini** — ia dokumen yang user tempel sendiri ke Supabase SQL Editor. Karena itu urutan bagian A/B/C dan peringatannya harus tertulis di dalam berkas, bukan hanya di plan.

- [ ] **Step 1: Tulis berkas migrasi**

```sql
-- Teras: komentar dilebur menjadi kiriman penuh.
-- Balasan = baris community_posts dengan parent_post_id terisi.
--
-- URUTAN WAJIB (jangan ditukar):
--   1. Jalankan BAGIAN A.
--   2. Jalankan BAGIAN B (backfill).
--   3. Deploy kode baru + restart server.
--   4. Jalankan BAGIAN B lagi (menangkap komentar yang lahir di celah).
--   5. Jalankan BAGIAN C (pemindahan FK mention).
--   6. Nanti setelah yakin: RENAME tabel komentar lama (lihat catatan di bawah).

-- ── BAGIAN A ────────────────────────────────────────────────────────────────
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

-- ── BAGIAN B (idempoten, jalankan dua kali: sebelum & sesudah deploy) ───────
INSERT INTO community_posts
  (id, agent_id, body, media, is_system, created_at, deleted_at,
   parent_post_id, root_post_id)
SELECT c.id, c.agent_id, c.body, c.media, false, c.created_at, c.deleted_at,
       c.post_id, c.post_id
FROM community_post_comments c
ON CONFLICT (id) DO NOTHING;

-- Verifikasi: kedua angka harus sama.
-- SELECT (SELECT count(*) FROM community_post_comments) AS komentar_lama,
--        (SELECT count(*) FROM community_posts WHERE parent_post_id IS NOT NULL) AS balasan_baru;

-- ── BAGIAN C (paling akhir; lihat alasannya) ────────────────────────────────
-- comment_id sekarang menunjuk kiriman balasan, bukan baris tabel komentar.
-- ADD CONSTRAINT memvalidasi SELURUH baris yang ada, jadi ia hanya lolos
-- setelah semua komentar tersalin (Bagian B, dua kali). Menjalankannya sebelum
-- deploy juga berbahaya: kode lama masih menulis komentar ke tabel lama, dan
-- baris mention barunya akan menunjuk id yang belum ada di community_posts.
ALTER TABLE community_mentions
  DROP CONSTRAINT IF EXISTS community_mentions_comment_id_fkey;
ALTER TABLE community_mentions
  ADD CONSTRAINT community_mentions_comment_id_fkey
  FOREIGN KEY (comment_id) REFERENCES community_posts(id) ON DELETE CASCADE;

NOTIFY pgrst, 'reload schema';

-- ── LANGKAH 6, nanti setelah yakin (JANGAN sekarang) ────────────────────────
-- Tabel lama di-rename, bukan di-DROP: itu jaring pengaman rollback.
-- ALTER TABLE community_post_comments RENAME TO community_post_comments_legacy;
```

- [ ] **Step 2: Commit**

```bash
git add migrations/20260726000000_community_post_thread.sql
git commit -m "feat(teras): migrasi kolom thread untuk komentar jadi kiriman"
```

---

### Task 2: Helper murni `lib/community-thread.js`

**Files:**
- Create: `lib/community-thread.js`
- Test: `tests/community-thread.test.js`

**Interfaces:**
- Produces:
  - `resolveRootPostId(parent)` → `string` — `parent.root_post_id ?? parent.id`
  - `buildAncestorChain(rows, postId)` → `Array<{ available: true, id, body, created_at, author } | { available: false }>` — urut dari akar ke induk terdekat, **tidak** memuat `postId` itu sendiri
  - `groupRepliesWithPreview(children, grandchildren, options)` → `Map<string, { reply_count: number, preview_replies: object[] }>`

- [ ] **Step 1: Tulis tes yang gagal**

`tests/community-thread.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveRootPostId,
  buildAncestorChain,
  groupRepliesWithPreview,
} from '../lib/community-thread.js';

const reply = (id, parent, root, extra = {}) => ({
  id,
  parent_post_id: parent,
  root_post_id: root,
  body: `isi ${id}`,
  created_at: extra.created_at || `2026-07-20T10:00:0${id.length}Z`,
  deleted_at: extra.deleted_at || null,
  author: { name: `Agen ${id}`, slug: id, photo: null },
});

test('resolveRootPostId: membalas kiriman induk memakai id induk itu', () => {
  assert.equal(resolveRootPostId({ id: 'p1', root_post_id: null }), 'p1');
});

test('resolveRootPostId: membalas balasan mewarisi akar thread', () => {
  assert.equal(resolveRootPostId({ id: 'c1', root_post_id: 'p1' }), 'p1');
});

test('buildAncestorChain: kiriman induk tidak punya leluhur', () => {
  const rows = [reply('p1', null, null)];
  assert.deepEqual(buildAncestorChain(rows, 'p1'), []);
});

test('buildAncestorChain: thread tiga tingkat berurutan dari akar', () => {
  const rows = [reply('p1', null, null), reply('c1', 'p1', 'p1'), reply('g1', 'c1', 'p1')];
  const chain = buildAncestorChain(rows, 'g1');
  assert.deepEqual(chain.map(node => node.id), ['p1', 'c1']);
  assert.ok(chain.every(node => node.available === true));
});

test('buildAncestorChain: leluhur terhapus jadi placeholder, rantai tidak putus', () => {
  const rows = [
    reply('p1', null, null),
    reply('c1', 'p1', 'p1', { deleted_at: '2026-07-20T11:00:00Z' }),
    reply('g1', 'c1', 'p1'),
  ];
  const chain = buildAncestorChain(rows, 'g1');
  assert.equal(chain.length, 2);
  assert.equal(chain[0].available, true);
  assert.deepEqual(chain[1], { available: false });
});

test('buildAncestorChain: leluhur yang barisnya hilang juga jadi placeholder', () => {
  const rows = [reply('g1', 'c1', 'p1')];
  assert.deepEqual(buildAncestorChain(rows, 'g1'), [{ available: false }]);
});

test('groupRepliesWithPreview: balasan >2 memicu sisa hitungan', () => {
  const children = [reply('c1', 'p1', 'p1')];
  const grandchildren = [
    reply('g1', 'c1', 'p1', { created_at: '2026-07-20T10:00:01Z' }),
    reply('g2', 'c1', 'p1', { created_at: '2026-07-20T10:00:02Z' }),
    reply('g3', 'c1', 'p1', { created_at: '2026-07-20T10:00:03Z' }),
  ];
  const grouped = groupRepliesWithPreview(children, grandchildren, { previewLimit: 2 });
  const entry = grouped.get('c1');
  assert.equal(entry.reply_count, 3);
  assert.deepEqual(entry.preview_replies.map(row => row.id), ['g2', 'g3']);
});

test('groupRepliesWithPreview: balasan terhapus tidak dihitung', () => {
  const children = [reply('c1', 'p1', 'p1')];
  const grandchildren = [
    reply('g1', 'c1', 'p1'),
    reply('g2', 'c1', 'p1', { deleted_at: '2026-07-20T11:00:00Z' }),
  ];
  const grouped = groupRepliesWithPreview(children, grandchildren, { previewLimit: 2 });
  assert.equal(grouped.get('c1').reply_count, 1);
  assert.deepEqual(grouped.get('c1').preview_replies.map(row => row.id), ['g1']);
});

test('groupRepliesWithPreview: komentar tanpa balasan tetap punya entri kosong', () => {
  const grouped = groupRepliesWithPreview([reply('c1', 'p1', 'p1')], [], { previewLimit: 2 });
  assert.deepEqual(grouped.get('c1'), { reply_count: 0, preview_replies: [] });
});

test('groupRepliesWithPreview: cucu milik komentar lain diabaikan', () => {
  const grouped = groupRepliesWithPreview(
    [reply('c1', 'p1', 'p1')],
    [reply('gX', 'c9', 'p1')],
    { previewLimit: 2 },
  );
  assert.equal(grouped.get('c1').reply_count, 0);
});
```

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `node --test tests/community-thread.test.js`
Expected: FAIL — `Cannot find module '../lib/community-thread.js'`

- [ ] **Step 3: Tulis implementasi**

`lib/community-thread.js`:

```js
/**
 * Bentuk thread Teras. Dipakai server.js untuk menyusun respons komentar dan
 * halaman detail; sengaja murni (tanpa Supabase) supaya bisa diuji langsung.
 *
 * Balasan adalah baris community_posts dengan parent_post_id terisi.
 * root_post_id didenormalisasi saat insert agar satu thread terambil dalam
 * satu query datar, tanpa CTE rekursif.
 */

/** Akar thread untuk balasan atas `parent`. Kiriman induk jadi akarnya sendiri. */
export function resolveRootPostId(parent) {
  if (!parent?.id) throw new Error('resolveRootPostId: induk tanpa id');
  return parent.root_post_id || parent.id;
}

/**
 * Rantai leluhur `postId`, urut dari akar ke induk terdekat, tanpa memuat
 * `postId` sendiri. Leluhur yang terhapus atau barisnya tidak ada dikirim
 * sebagai `{ available: false }` — bukan dibuang dan bukan 404 — supaya
 * menghapus satu kiriman tidak mematikan thread di bawahnya.
 */
export function buildAncestorChain(rows, postId) {
  const byId = new Map((rows || []).filter(row => row?.id).map(row => [row.id, row]));
  const chain = [];
  const seen = new Set([postId]);

  let cursor = byId.get(postId)?.parent_post_id || null;
  while (cursor) {
    if (seen.has(cursor)) break; // cincin mustahil, tapi jangan menggantung
    seen.add(cursor);
    const row = byId.get(cursor);
    if (!row || row.deleted_at) {
      chain.push({ available: false });
      cursor = row?.parent_post_id || null;
      continue;
    }
    chain.push({
      available: true,
      id: row.id,
      body: row.body,
      created_at: row.created_at,
      author: row.author || null,
    });
    cursor = row.parent_post_id || null;
  }

  return chain.reverse();
}

/**
 * Untuk tiap komentar di `children`, hitung jumlah balasannya dan ambil
 * `previewLimit` balasan TERBARU (urut lama→baru, sesuai urutan tampil).
 * Balasan terhapus tidak dihitung dan tidak ditampilkan.
 */
export function groupRepliesWithPreview(children, grandchildren, options = {}) {
  const previewLimit = Number.isInteger(options.previewLimit) ? options.previewLimit : 2;
  const grouped = new Map();
  for (const child of children || []) {
    if (child?.id) grouped.set(child.id, { reply_count: 0, preview_replies: [] });
  }

  const buckets = new Map();
  for (const row of grandchildren || []) {
    if (!row?.id || row.deleted_at) continue;
    const parentId = row.parent_post_id;
    if (!grouped.has(parentId)) continue;
    if (!buckets.has(parentId)) buckets.set(parentId, []);
    buckets.get(parentId).push(row);
  }

  for (const [parentId, rows] of buckets) {
    rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))
      || String(a.id).localeCompare(String(b.id)));
    grouped.set(parentId, {
      reply_count: rows.length,
      preview_replies: previewLimit > 0 ? rows.slice(-previewLimit) : [],
    });
  }

  return grouped;
}
```

- [ ] **Step 4: Jalankan tes, pastikan lulus**

Run: `node --test tests/community-thread.test.js`
Expected: PASS, 10 tes.

- [ ] **Step 5: Commit**

```bash
git add lib/community-thread.js tests/community-thread.test.js
git commit -m "feat(teras): helper murni bentuk thread komentar"
```

---

### Task 3: Filter kebocoran balasan + guard skema

Ini task paling rawan di seluruh plan: satu query terlewat = balasan bocor ke feed atau badge.

**Files:**
- Modify: `server.js` — 5 lokasi (lihat tabel)
- Test: `tests/community-thread-feed-guard.test.js` (baru)

**Interfaces:**
- Consumes: kolom `parent_post_id` (Task 1)
- Produces: `isCommunityThreadSchemaMissing(error)` — dipakai Task 4–6 untuk degradasi skema

| # | Lokasi | Perubahan |
|---|---|---|
| 1 | `loadCommunityFeedHead()` (~`server.js:4564`) | tambah `.is('parent_post_id', null)` |
| 2 | `loadCommunityTeaserSharedData()` (~`4431`), **kedua** query (latest 12 + hitung hari ini) | tambah `.is('parent_post_id', null)` |
| 3 | `GET /api/community/feed` → `buildPostsQuery` (~`5009`) | `.is('parent_post_id', null)` **hanya kalau `!profileMember`** |
| 4 | Ringkasan kiriman terbaru untuk MCP (~`19340`, fungsi yang memakai `selectPost`) | tambah `.is('parent_post_id', null)` |
| 5 | Broadcast `@semua` — jalur yang memakai `mentions_everyone` di `POST /api/community/posts` | balasan tidak boleh menyiarkan; lihat Step 4 |

- [ ] **Step 1: Tulis guard test yang gagal**

`tests/community-thread-feed-guard.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

function sliceBetween(startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  assert.ok(start !== -1, `penanda tidak ditemukan: ${startMarker}`);
  const end = src.indexOf(endMarker, start);
  assert.ok(end !== -1, `penanda akhir tidak ditemukan: ${endMarker}`);
  return src.slice(start, end);
}

// Balasan adalah baris community_posts. Setiap query "kiriman terbaru" yang
// lupa menyaringnya akan membocorkan balasan ke feed, pil kiriman baru, atau
// badge belum-dibaca. Guard ini menjaga kelimanya sekaligus.

test('feed head hanya melihat kiriman induk', () => {
  const section = sliceBetween('async function loadCommunityFeedHead()', 'function bumpCommunityFeedHead');
  assert.match(section, /\.is\('parent_post_id', null\)/);
});

test('teaser (kiriman terbaru + hitungan hari ini) hanya melihat kiriman induk', () => {
  const section = sliceBetween('async function loadCommunityTeaserSharedData()', 'const latestPosts =');
  const matches = section.match(/\.is\('parent_post_id', null\)/g) || [];
  assert.equal(matches.length, 2, 'kedua query teaser harus menyaring balasan');
});

test('feed menyaring balasan hanya di mode linimasa, bukan mode profil', () => {
  const section = sliceBetween('const buildPostsQuery = (includeMedia', 'let includeMedia = true;');
  assert.match(section, /if \(!profileMember\)[\s\S]{0,120}\.is\('parent_post_id', null\)/);
});

test('ringkasan kiriman terbaru untuk MCP hanya melihat kiriman induk', () => {
  const section = sliceBetween('const selectPost = ', '.order(\'created_at\', { ascending: true })');
  assert.match(section, /\.is\('parent_post_id', null\)/);
});

test('guard skema thread tersedia dan mengenali kolom hilang', () => {
  assert.match(src, /function isCommunityThreadSchemaMissing/);
  assert.match(src, /parent_post_id[\s\S]{0,200}root_post_id/);
});
```

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `node --test tests/community-thread-feed-guard.test.js`
Expected: FAIL pada kelima tes (belum ada filter maupun guard).

- [ ] **Step 3: Tambahkan guard skema**

Cari definisi `isCommunityQuoteSchemaMissing` di `server.js` dan tambahkan tepat di bawahnya, meniru bentuknya:

```js
// Kolom thread (parent_post_id/root_post_id) belum ada di lingkungan yang
// migrasi 20260726000000 belum dijalankan. Baca boleh mundur ke tanpa-kolom;
// menulis balasan tidak boleh — lihat POST /posts/:id/comments.
function isCommunityThreadSchemaMissing(error) {
  if (!error) return false;
  const text = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`;
  return error.code === '42703'
    && (text.includes('parent_post_id') || text.includes('root_post_id'));
}
```

Catatan: kalau `isCommunityQuoteSchemaMissing` di repo memakai bentuk lain (misal mencocokkan `PGRST204` juga), **ikuti bentuk itu** dan hanya ganti nama kolomnya. Konsistensi dengan tetangganya lebih penting daripada kode di plan ini.

- [ ] **Step 4: Terapkan kelima filter**

Lokasi 1 — `loadCommunityFeedHead()`:

```js
  const { data, error } = await supabase
    .from('community_posts')
    .select('id, created_at')
    .is('deleted_at', null)
    .is('parent_post_id', null)
    .order('created_at', { ascending: false })
```

Lokasi 2 — `loadCommunityTeaserSharedData()`, **dua** query di `Promise.all`; tambahkan `.is('parent_post_id', null)` tepat setelah `.is('deleted_at', null)` di masing-masing.

Lokasi 3 — `buildPostsQuery` di `GET /api/community/feed`. Blok `if (profileMember)` yang sudah ada diubah jadi if/else supaya niatnya terbaca:

```js
      if (profileMember) {
        // Mode profil: balasan ikut tampil (dengan konteks induknya), jadi
        // sengaja TIDAK menyaring parent_post_id di sini.
        query = query.eq('agent_id', profileMember.id);
      } else {
        query = query.is('parent_post_id', null);
      }
```

Lokasi 4 — fungsi ringkasan MCP (~`server.js:19340`), di dalam `selectPost`, tambahkan `.is('parent_post_id', null)` setelah filter `deleted_at`.

Lokasi 5 — broadcast. Di `POST /api/community/posts`, jalur `mentions_everyone` tidak perlu diubah: endpoint itu hanya membuat kiriman induk (Task 4 melarang `parent_post_id` dari klien), dan balasan lahir lewat `/comments` yang tidak pernah menyetel `mentions_everyone`. Tambahkan komentar satu baris di dekat penyetelan `mentions_everyone` supaya invarian ini tidak hilang:

```js
    // Balasan tidak pernah lewat sini (lihat POST /posts/:id/comments), jadi
    // @semua otomatis terbatas pada kiriman induk.
```

- [ ] **Step 5: Jalankan guard test, pastikan lulus**

Run: `node --test tests/community-thread-feed-guard.test.js`
Expected: PASS, 5 tes.

Kalau sebuah `sliceBetween` gagal menemukan penanda, **perbaiki penandanya di tes agar cocok dengan `server.js` yang sebenarnya** — jangan mengubah `server.js` supaya cocok dengan tes.

- [ ] **Step 6: Pastikan tidak ada regresi**

Run: `node --test tests/community-access.test.js tests/community-profile-feed.test.js`
Expected: PASS (profil belum berubah perilakunya di task ini).

- [ ] **Step 7: Commit**

```bash
git add server.js tests/community-thread-feed-guard.test.js
git commit -m "feat(teras): saring balasan dari feed, pil, teaser, dan ringkasan MCP"
```

---

### Task 4: Menulis balasan sebagai kiriman

**Files:**
- Modify: `server.js` — `POST /api/community/posts/:id/comments` (~`5713`), `DELETE /api/community/comments/:id` (~`5854`), `POST /api/community/posts` (~`5353`)

**Interfaces:**
- Consumes: `resolveRootPostId` (Task 2), `isCommunityThreadSchemaMissing` (Task 3)
- Produces: baris balasan di `community_posts`; bentuk respons 201 `{ id, body, media, created_at, author, is_own, reply_count: 0, preview_replies: [] }` — dipakai Task 5 dan FE

- [ ] **Step 1: Impor helper**

Di blok impor `server.js`, sejajar dengan impor `lib/community-*.js` yang sudah ada:

```js
import { resolveRootPostId } from './lib/community-thread.js';
```

- [ ] **Step 2: Ganti insert komentar menjadi insert kiriman**

Di `POST /api/community/posts/:id/comments`, blok `for (let attempt = 0; attempt < 2; attempt += 1)` yang meng-insert ke `community_post_comments` diganti. Yang **tetap**: validasi 1–300 karakter, penanganan media, `client_id`, penanganan `23505` idempoten, `recordCommunityMentions`. Yang berubah hanya tabel dan kolom tujuan:

```js
    const rootPostId = resolveRootPostId(post);

    let includeMediaColumn = true;
    let createdComment = null;
    let error = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const insertResult = await supabase
        .from('community_posts')
        .insert({
          ...(clientId ? { id: clientId } : {}),
          agent_id: agent.id,
          body,
          is_system: false,
          parent_post_id: post.id,
          root_post_id: rootPostId,
          ...(includeMediaColumn ? { media } : {}),
        })
        .select(`id, body, ${includeMediaColumn ? 'media, ' : ''}created_at`)
        .single();
      createdComment = insertResult.data;
      error = insertResult.error;
      if (isCommunityThreadSchemaMissing(error)) {
        return res.status(503).json({ error: 'Migrasi thread Teras belum diterapkan' });
      }
      if (includeMediaColumn && isCommunityMediaSchemaMissing(error)) {
        if (media.length > 0) {
          return res.status(503).json({ error: 'Migrasi media komentar Teras belum diterapkan' });
        }
        includeMediaColumn = false;
        continue;
      }
      break;
    }
```

Blok pemulihan `23505` di bawahnya juga berpindah tabel: `.from('community_post_comments')` → `.from('community_posts')`, dan filternya `.eq('id', clientId).eq('parent_post_id', post.id).eq('agent_id', agent.id).is('deleted_at', null)`.

`post` di sini berasal dari `loadActiveCommunityPost(req.params.id)` yang sudah ada — pastikan select-nya ikut mengambil `root_post_id`; kalau belum, tambahkan kolom itu ke select di dalam `loadActiveCommunityPost` dengan fallback `isCommunityThreadSchemaMissing` (baca boleh mundur: kalau kolom belum ada, `resolveRootPostId` jatuh ke `post.id`, dan insert-nya toh akan 503).

Respons 201 ditambah dua field:

```js
    const data = {
      id: createdComment.id,
      body: createdComment.body,
      media: normalizeStoredCommunityMedia(createdComment.media),
      created_at: createdComment.created_at,
      author: communityAuthorProfile(agent),
      is_own: true,
      reply_count: 0,
      preview_replies: [],
    };
```

- [ ] **Step 3: `POST /api/community/posts` menolak kolom thread dari klien**

Tepat setelah validasi `quoted_post_id` yang sudah ada:

```js
    // Balasan hanya lahir lewat POST /posts/:id/comments — satu jalan masuk,
    // satu tempat validasi induk.
    if (req.body?.parent_post_id !== undefined || req.body?.root_post_id !== undefined) {
      return res.status(400).json({ error: 'Balasan harus lewat endpoint komentar' });
    }
```

- [ ] **Step 4: `DELETE /api/community/comments/:id` jadi alias**

Isi handler diganti agar menghapus baris `community_posts` (soft delete `deleted_at`), dengan syarat kepemilikan yang sama seperti sebelumnya **dan** `parent_post_id IS NOT NULL` — supaya endpoint komentar tidak bisa dipakai menghapus kiriman induk. Pertahankan status dan pesan galat yang sudah ada agar klien lama tidak pecah.

- [ ] **Step 5: Verifikasi manual**

Restart server (`node server.js` tidak hot-reload), lalu dengan token dev yang biasa dipakai:

```bash
curl -s -X POST localhost:3000/api/community/posts/<POST_ID>/comments \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"body":"balasan uji"}' | head -c 400
```

Expected: `201` dengan `reply_count: 0`. Kalau `404`, cek dulu server sudah direstart dan bedakan dari `401`.

Balas balasan itu sendiri (kirim ke id balasan) — harus 201 juga, dan barisnya punya `root_post_id` sama dengan post induk asli.

- [ ] **Step 6: Commit**

```bash
git add server.js
git commit -m "feat(teras): balasan ditulis sebagai kiriman dengan induk dan akar"
```

---

### Task 5: Membaca balasan + cuplikan

**Files:**
- Modify: `server.js` — `GET /api/community/posts/:id/comments` (~`5673`), penghitung `comment_count` di feed (~`5064`) dan detail (~`5224`)

**Interfaces:**
- Consumes: `groupRepliesWithPreview` (Task 2)
- Produces: tiap komentar pada respons `GET /comments` kini punya `reply_count: number` dan `preview_replies: Array<{ id, body, media, created_at, author, is_own }>`

- [ ] **Step 1: Tambahkan impor**

```js
import { groupRepliesWithPreview, resolveRootPostId } from './lib/community-thread.js';
```

(Gabungkan dengan impor Task 4, jangan dua baris impor dari modul yang sama.)

- [ ] **Step 2: Ganti sumber daftar komentar**

`loadCommentRows` di `GET /comments` beralih ke `community_posts`, menyaring `parent_post_id = post.id`:

```js
    const loadCommentRows = includeMedia => supabase
      .from('community_posts')
      .select(`id, agent_id, body, ${includeMedia ? 'media, ' : ''}created_at, parent_post_id, agent:agents!community_posts_agent_id_fkey(name, slug, photo)`)
      .eq('parent_post_id', post.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(100);
```

- [ ] **Step 3: Ambil cucu dan kelompokkan**

Setelah daftar komentar didapat, satu query tambahan mengambil cucu lewat `root_post_id` thread:

```js
    const childIds = (comments || []).map(row => row.id);
    let grandchildren = [];
    if (childIds.length > 0) {
      const loadGrandchildren = includeMedia => supabase
        .from('community_posts')
        .select(`id, agent_id, body, ${includeMedia ? 'media, ' : ''}created_at, parent_post_id, agent:agents!community_posts_agent_id_fkey(name, slug, photo)`)
        .in('parent_post_id', childIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(500);
      let { data: rows, error: grandchildError } = await loadGrandchildren(true);
      if (isCommunityMediaSchemaMissing(grandchildError)) {
        ({ data: rows, error: grandchildError } = await loadGrandchildren(false));
      }
      if (isCommunityThreadSchemaMissing(grandchildError)) {
        rows = [];
        grandchildError = null;
      }
      if (grandchildError) throw grandchildError;
      grandchildren = rows || [];
    }

    const replyGroups = groupRepliesWithPreview(comments || [], grandchildren, { previewLimit: 2 });
```

Lalu bentuk responsnya:

```js
    const toCommentPayload = row => ({
      id: row.id,
      body: row.body,
      media: normalizeStoredCommunityMedia(row.media),
      created_at: row.created_at,
      author: communityAuthorProfile(row.agent),
      is_own: row.agent_id === agent.id,
    });

    const data = (comments || []).map(comment => {
      const group = replyGroups.get(comment.id) || { reply_count: 0, preview_replies: [] };
      return {
        ...toCommentPayload(comment),
        reply_count: group.reply_count,
        preview_replies: group.preview_replies.map(toCommentPayload),
      };
    });
```

- [ ] **Step 4: Pindahkan penghitung `comment_count`**

Di `GET /api/community/feed` (~`5064`) query hitung komentar berpindah tabel dan kolom:

```js
        supabase
          .from('community_posts')
          .select('parent_post_id')
          .in('parent_post_id', postIds)
          .is('deleted_at', null),
```

…dan pengelompokannya memakai `row.parent_post_id` sebagai kunci, bukan `row.post_id`. Lakukan perubahan setara di `GET /api/community/posts/:id` (~`5224`), yang cukup `.eq('parent_post_id', post.id)`.

- [ ] **Step 5: Verifikasi manual**

Restart server, lalu:

```bash
curl -s localhost:3000/api/community/posts/<POST_ID>/comments \
  -H "Authorization: Bearer $TOKEN" | head -c 600
```

Expected: tiap komentar punya `reply_count` dan `preview_replies`; komentar yang tadi Anda balas (Task 4 Step 5) menunjukkan `reply_count: 1`. Buat 3 balasan pada satu komentar → `reply_count: 3` dengan `preview_replies` berisi 2 **terbaru**, urut lama→baru.

- [ ] **Step 6: Commit**

```bash
git add server.js
git commit -m "feat(teras): baca balasan berjenjang dengan cuplikan dua tingkat"
```

---

### Task 6: Rantai leluhur di halaman detail

**Files:**
- Modify: `server.js` — `GET /api/community/posts/:id` (~`5166`)

**Interfaces:**
- Consumes: `buildAncestorChain` (Task 2)
- Produces: field `ancestors` pada respons detail — `[]` untuk kiriman induk; untuk balasan, urut akar→induk terdekat, anggota terhapus berbentuk `{ available: false }`

- [ ] **Step 1: Tambahkan `parent_post_id, root_post_id` ke select detail**

`buildPostQuery` di endpoint detail ikut pola degradasi yang sudah ada: tambahkan flag `includeThread` sejajar `includeQuote`, dan tambahkan cabang `if (includeThread && isCommunityThreadSchemaMissing(postError)) { includeThread = false; continue; }` di loop percobaan. Naikkan batas loop dari 4 ke 5.

- [ ] **Step 2: Muat leluhur**

Setelah `post` didapat:

```js
    let ancestors = [];
    if (includeThread && post.parent_post_id) {
      // Satu query datar untuk seluruh thread; rantai disusun di memori.
      const rootId = post.root_post_id || post.parent_post_id;
      const { data: threadRows, error: threadError } = await supabase
        .from('community_posts')
        .select('id, body, created_at, deleted_at, parent_post_id, agent:agents!community_posts_agent_id_fkey(name, slug, photo)')
        .or(`id.eq.${rootId},root_post_id.eq.${rootId}`)
        .limit(500);
      if (threadError) throw threadError;
      ancestors = buildAncestorChain(
        (threadRows || []).map(row => ({ ...row, author: communityAuthorProfile(row.agent) })),
        post.id,
      );
    }
```

- [ ] **Step 3: Jangan 404-kan balasan yang induknya terhapus**

`loadActiveCommunityPost` menyaring `deleted_at IS NULL` pada kiriman **yang diminta** — itu benar dan tidak diubah. Yang penting: rantai leluhur di atas tidak menyaring `deleted_at`, sehingga leluhur terhapus jadi placeholder. Pastikan tidak ada `if (!ancestors.length) return 404` yang tidak sengaja ditambahkan.

- [ ] **Step 4: Sertakan di respons**

Tambahkan ke objek `data` di `res.json`, setelah `link_preview`:

```js
        parent_post_id: includeThread ? (post.parent_post_id || null) : null,
        ancestors,
```

- [ ] **Step 5: Verifikasi manual**

```bash
curl -s localhost:3000/api/community/posts/<ID_BALASAN> \
  -H "Authorization: Bearer $TOKEN" | head -c 500
```

Expected: `ancestors` berisi 1 entri (kiriman induk) untuk balasan tingkat 1; 2 entri untuk balasan atas balasan. Hapus kiriman induknya lalu ulangi — entri pertama jadi `{"available":false}` dan permintaan **tetap** 200.

- [ ] **Step 6: Commit**

```bash
git add server.js
git commit -m "feat(teras): rantai leluhur pada detail balasan"
```

---

### Task 7: Sumber notifikasi pindah ke kiriman

**Files:**
- Modify: `server.js` — `loadTerasNotificationSources` (~`4783`)
- Modify: `tests/community-notifications.test.js`

**Interfaces:**
- Consumes: `parent_post_id` (Task 1)
- Produces: tidak ada API baru; bentuk notifikasi tidak berubah (`lib/community-notifications.js` tidak disentuh)

- [ ] **Step 1: Pindahkan `commentQuery`**

```js
  // Balasan atas kiriman saya. Balasan kini baris community_posts, jadi
  // relasi induknya dicek lewat parent_post_id — termasuk balasan atas
  // balasan saya sendiri, yang memang layak diberitahukan.
  const commentQuery = supabase
    .from('community_posts')
    .select(`id, parent_post_id, created_at, body,
      author:agents!community_posts_agent_id_fkey(name, photo),
      parent:community_posts!community_posts_parent_post_id_fkey!inner(agent_id, deleted_at)`)
    .eq('parent.agent_id', agent.id)
    .neq('agent_id', agent.id)
    .not('parent_post_id', 'is', null)
    .is('deleted_at', null)
    .is('parent.deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
```

Nama constraint FK yang di-embed (`community_posts_parent_post_id_fkey`) berasal dari `ADD COLUMN … REFERENCES` di Task 1; kalau PostgREST menolaknya, jalankan
`SELECT conname FROM pg_constraint WHERE conrelid = 'community_posts'::regclass AND contype='f';`
di Supabase SQL Editor (minta user), lalu pakai nama yang sebenarnya.

- [ ] **Step 2: Sesuaikan pemakaian hasil**

`mergeNotifications` menerima baris komentar dengan field `post_id`. Baris baru memakai `parent_post_id`, jadi petakan sebelum dikirim:

```js
  const commentRows = (commentResult.data || []).map(row => ({ ...row, post_id: row.parent_post_id }));
```

Gunakan `commentRows` di tempat `commentResult.data` sebelumnya dipakai. Ini menjaga `lib/community-notifications.js` dan tesnya tidak perlu berubah bentuk.

- [ ] **Step 3: Pindahkan embed mention**

Di `mentionQuery`, relasi `comment:community_post_comments!community_mentions_comment_id_fkey(...)` menunjuk tabel lama. Setelah Bagian C migrasi dijalankan, FK-nya menunjuk `community_posts`:

```js
      comment:community_posts!community_mentions_comment_id_fkey(body, deleted_at)`)
```

Karena Bagian C dijalankan **setelah** deploy, bungkus dengan degradasi: kalau query mention gagal, sumber mention sudah ditoleransi kosong oleh kode yang ada (lihat komentar "Mentions tolerate a missing table"). Pastikan penanganan galat itu juga menangkap galat relasi ini, bukan hanya tabel hilang.

- [ ] **Step 4: Perbarui tes notifikasi**

Di `tests/community-notifications.test.js`, tambahkan satu tes yang mengunci perilaku baru:

```js
test('balasan atas balasan tetap jadi notifikasi comment biasa', () => {
  const merged = mergeNotifications({
    mentions: [],
    comments: [{ id: 'g1', post_id: 'c1', created_at: '2026-07-20T10:00:00Z', body: 'balas lagi', author: actor('Nikita') }],
    reactions: [],
    broadcasts: [],
  });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].type, 'comment');
  assert.equal(merged[0].comment_id, 'g1');
  assert.equal(merged[0].post_id, 'c1');
});
```

- [ ] **Step 5: Jalankan tes**

Run: `node --test tests/community-notifications.test.js`
Expected: PASS, termasuk tes baru.

- [ ] **Step 6: Verifikasi manual**

Dari akun B, balas kiriman akun A → lonceng akun A bertambah. Dari akun B, balas *balasan* akun A → lonceng akun A juga bertambah.

- [ ] **Step 7: Commit**

```bash
git add server.js tests/community-notifications.test.js
git commit -m "feat(teras): notifikasi balasan bersumber dari kiriman"
```

---

### Task 8: Komponen `CommentThread`

**Files:**
- Create: `src/components/teras/CommentThread.tsx`
- Modify: `src/components/TerasPage.tsx` — tipe (~`120`), blok render komentar (~`3914`)

**Interfaces:**
- Produces: komponen `CommentThread` dengan props di bawah; Task 9 dan 10 memakainya

- [ ] **Step 1: Perluas tipe di `TerasPage.tsx`**

```ts
interface CommunityComment {
  id: string;
  body: string;
  media?: CommunityMedia[];
  created_at: string;
  author: CommunityAuthor;
  is_own: boolean;
  reply_count?: number;
  preview_replies?: CommunityComment[];
}
```

Ekspor tipe `CommunityComment`, `CommunityAuthor`, `CommunityMedia`, dan `ReactionType` (tambahkan `export` pada deklarasinya) supaya `CommentThread.tsx` bisa mengimpornya tanpa menduplikasi definisi.

- [ ] **Step 2: Buat komponen**

`src/components/teras/CommentThread.tsx` — komponen presentasional murni: tidak memegang state fetch, tidak memanggil API.

```tsx
import type { CommunityComment, ReactionType } from '../TerasPage';

interface CommentThreadProps {
  comments: CommunityComment[];
  /** Reaksi saya per id komentar. */
  myReactions: Record<string, ReactionType | null>;
  /** Jumlah reaksi per id komentar. */
  reactionCounts: Record<string, number>;
  onReact: (commentId: string, reaction: ReactionType | null) => void;
  onReply: (commentId: string, authorName: string) => void;
  onQuote: (commentId: string) => void;
  onDelete: (commentId: string) => void;
  onOpenThread: (commentId: string) => void;
  /** Komentar yang sedang jadi sasaran kolom balas, untuk penanda visual. */
  replyTargetId: string | null;
  renderBody: (comment: CommunityComment) => React.ReactNode;
  renderMedia: (comment: CommunityComment) => React.ReactNode;
  formatTime: (iso: string) => string;
}

export default function CommentThread(props: CommentThreadProps) {
  // ...
}
```

Isi render: **pindahkan** blok JSX komentar yang sudah ada di `TerasPage.tsx` (`commentPanel.comments.map(comment => { … })`, ~baris 3914) ke sini apa adanya, lalu tambahkan:

1. **Baris aksi** di bawah isi komentar — reaksi, balas (dengan `reply_count` bila > 0), kutip. Ikon lebih kecil dari baris aksi kiriman induk supaya hierarki visual tidak rata; ikuti kelas ukuran `size="comment"` yang sudah dipakai `AgentAvatar`.
2. **Cuplikan balasan** — `comment.preview_replies` dirender dengan indentasi satu tingkat, memakai baris komentar yang sama tanpa baris aksi cuplikan (indentasi berhenti di sini).
3. **Tautan sisa** — bila `reply_count > preview_replies.length`, tampilkan tombol teks `Lihat ${reply_count - preview_replies.length} balasan lainnya` yang memanggil `onOpenThread(comment.id)`.

Jangan menyalin logika pemformatan waktu, render body ber-mention, atau render media — semuanya masuk lewat props `formatTime`/`renderBody`/`renderMedia` dari `TerasPage`.

- [ ] **Step 3: Pakai di `TerasPage.tsx`**

Ganti blok render lama dengan `<CommentThread … />`, meneruskan handler yang sudah ada (`onDelete` memakai fungsi hapus komentar yang sekarang) dan handler baru yang untuk sementara boleh kosong (`onReact`, `onReply`, `onQuote`, `onOpenThread` diisi di Task 9).

- [ ] **Step 4: Verifikasi tipe & build**

Run: `npx tsc --noEmit`
Expected: tanpa galat.

Run: `npm run build`
Expected: build sukses.

- [ ] **Step 5: Commit**

```bash
git add src/components/teras/CommentThread.tsx src/components/TerasPage.tsx
git commit -m "refactor(teras): pisahkan render komentar ke CommentThread"
```

---

### Task 9: Aksi komentar — reaksi, balas bersasaran, kutip

**Files:**
- Modify: `src/components/TerasPage.tsx`
- Modify: `src/components/teras/CommentThread.tsx`

**Interfaces:**
- Consumes: `CommentThread` (Task 8), endpoint reaksi/quote yang sudah ada (`POST /posts/:id/reaction`, `POST /posts` dengan `quoted_post_id`), `POST /posts/:id/comments` (Task 4)

- [ ] **Step 1: Reaksi komentar**

Komentar adalah kiriman, jadi endpoint reaksi yang ada langsung berlaku: `POST /api/community/posts/<id komentar>/reaction`. Gunakan ulang fungsi reaksi kiriman yang sudah ada di `TerasPage`; kalau ia terikat ke state `posts`, ekstrak bagian pemanggilan API-nya jadi fungsi kecil yang menerima id, lalu simpan hasilnya di state komentar.

- [ ] **Step 2: Penargetan kolom balas**

Tambahkan state:

```ts
const [replyTarget, setReplyTarget] = useState<{ postId: string; commentId: string; authorName: string } | null>(null);
```

`onReply(commentId, authorName)` menyetelnya. Saat terisi:
- placeholder kolom bawah jadi `Balas ke ${authorName}...`
- muncul chip di atas kolom: `Membalas ke ${authorName}` + tombol ✕ yang memanggil `setReplyTarget(null)`
- pengiriman diarahkan ke `POST /api/community/posts/${replyTarget.commentId}/comments`, bukan ke id kiriman induk

Setelah terkirim, `setReplyTarget(null)` dan sisipkan hasilnya ke `preview_replies` komentar sasaran secara optimistic, naikkan `reply_count`-nya. Gunakan `client_id` yang sudah ada agar retry tetap idempoten.

- [ ] **Step 3: Kutip komentar**

`onQuote(commentId)` membuka composer quote yang sudah ada dengan `quoted_post_id = commentId`. Tidak ada perubahan server: quote atas balasan menghasilkan kiriman induk baru.

- [ ] **Step 4: Buka thread**

`onOpenThread(commentId)` memakai mekanisme navigasi detail yang sudah ada (`postId` yang menggerakkan tampilan detail), diarahkan ke id komentar.

- [ ] **Step 5: Verifikasi manual di aplikasi**

Restart server, `npm run dev`, lalu pada satu kiriman:
1. Reaksi sebuah komentar → jumlah naik, bertahan setelah reload.
2. Balas komentar → chip muncul, balasan tampil sebagai cuplikan di bawah komentar itu **tanpa pindah halaman**.
3. Tambah balasan ketiga → muncul "Lihat 1 balasan lainnya".
4. Kutip komentar → kiriman baru di feed dengan kartu komentar tersebut.

- [ ] **Step 6: Verifikasi tipe & build**

Run: `npx tsc --noEmit && npm run build`
Expected: keduanya sukses.

- [ ] **Step 7: Commit**

```bash
git add src/components/TerasPage.tsx src/components/teras/CommentThread.tsx
git commit -m "feat(teras): reaksi, balas bersasaran, dan kutip pada komentar"
```

---

### Task 10: Halaman thread + balasan di profil

**Files:**
- Modify: `src/components/TerasPage.tsx`
- Modify: `tests/community-profile-feed.test.js`

**Interfaces:**
- Consumes: `ancestors` dari `GET /posts/:id` (Task 6), `parent_post_id` pada item feed profil

- [ ] **Step 1: Render rantai leluhur di tampilan detail**

Saat detail memuat balasan (`ancestors.length > 0`), tampilkan di atas kiriman utama: tiap leluhur `available: true` jadi baris kecil yang bisa diklik menuju detailnya; leluhur `available: false` jadi placeholder redup `Kiriman sudah dihapus`, memakai gaya yang sama dengan placeholder quote yang sudah ada.

- [ ] **Step 2: Baris "Membalas ke @X" di profil**

Feed mode profil kini memuat balasan. Item yang punya `parent_post_id` mendapat baris kecil di atas isinya, `Membalas ke @<slug penulis induk>`, yang membuka kiriman induk. Slug penulis induk perlu tersedia — kalau respons feed profil belum memuatnya, tambahkan di `server.js` pada mode profil saja: satu query `.in('id', parentIds)` yang mengembalikan `{ id, author: { name, slug } }`, dipetakan ke field `parent_author` per item. Item tanpa induk tidak berubah.

- [ ] **Step 3: Perbarui tes profil**

Di `tests/community-profile-feed.test.js`, tambahkan tes yang mengunci: mode profil tidak menyaring balasan, dan item balasan membawa konteks induk. Ikuti gaya berkas itu (kalau ia guard sumber, tambahkan asersi sumber; kalau ia menguji helper, tambahkan kasus helper).

- [ ] **Step 4: Jalankan tes**

Run: `node --test tests/community-profile-feed.test.js tests/community-thread-feed-guard.test.js`
Expected: PASS.

- [ ] **Step 5: Verifikasi manual**

1. Buka profil agen yang baru membalas → balasannya muncul dengan baris "Membalas ke @…".
2. Buka feed utama → balasan itu **tidak** muncul.
3. Klik komentar → halaman thread terbuka dengan leluhur di atas.
4. Hapus kiriman induknya, buka lagi thread balasannya → leluhur jadi "Kiriman sudah dihapus", halaman tetap terbuka (bukan 404).

- [ ] **Step 6: Commit**

```bash
git add src/components/TerasPage.tsx server.js tests/community-profile-feed.test.js
git commit -m "feat(teras): halaman thread dan balasan di profil"
```

---

### Task 11: Verifikasi menyeluruh & catatan pasca-deploy

**Files:**
- Modify: `docs/superpowers/specs/2026-07-20-teras-komentar-kiriman-penuh-design.md` (tambah catatan status)

- [ ] **Step 1: Seluruh tes**

Run: `node --test tests/`
Expected: PASS. Kalau ada tes lama yang gagal karena menyentuh komentar, perbaiki tesnya hanya bila perilaku barunya memang disengaja — jangan melonggarkan asersi untuk menutupi regresi.

- [ ] **Step 2: Tipe & build**

Run: `npx tsc --noEmit && npm run build`
Expected: keduanya sukses.

- [ ] **Step 3: Checklist kebocoran, diverifikasi di aplikasi**

Semua harus benar **setelah** balasan dibuat:
- [ ] Feed utama tidak memuat balasan
- [ ] Pil "kiriman baru" tidak muncul karena balasan
- [ ] Badge Teras di dashboard tidak menghitung balasan
- [ ] Ringkasan MCP "kiriman terbaru" bukan potongan balasan
- [ ] Profil penulis **memuat** balasan

- [ ] **Step 4: Pastikan pembersih media tidak perlu diubah sekarang**

`purgeDeletedCommunityMedia` memindai `community_posts` **dan**
`community_post_comments`. Balasan baru hidup di `community_posts`, jadi
medianya sudah ikut tersapu tanpa perubahan kode; tabel lama tetap dipindai
selama masa transisi. Jangan hapus entri tabel lama dari daftar itu sekarang —
baru setelah langkah 6 migrasi (rename). Konfirmasi dengan membaca fungsi itu
(~`server.js:5966`) dan tidak mengubahnya.

- [ ] **Step 5: Ingatkan user soal langkah SQL yang tersisa**

Setelah deploy, user masih perlu menjalankan **Bagian B (ulangi)** lalu **Bagian C**. Sampaikan ini eksplisit — jangan diasumsikan sudah dilakukan. Langkah 6 (rename tabel lama) sengaja ditunda sampai user yakin.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-07-20-teras-komentar-kiriman-penuh-design.md
git commit -m "docs(teras): status implementasi thread komentar"
```
