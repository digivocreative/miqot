# Teras — Utas di Composer: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agen bisa menumpuk hingga 5 kotak teks di composer Teras dan menerbitkannya sekaligus sebagai satu rantai kiriman, ala "New thread" di Threads.

**Architecture:** Segmen lanjutan adalah baris `community_posts` biasa dengan `parent_post_id` (segmen sebelumnya) dan `root_post_id` (segmen 1). Feed, profil, teaser, dan lonceng menyaring `parent_post_id IS NULL` sehingga satu utas = satu baris di linimasa. `POST /api/community/posts` diperluas dengan `segments[]` (bentuk lama tetap sah, dinormalisasi jadi utas 1 segmen), insert berurutan, dan rollback hard-delete kalau ada yang gagal. Karena `id` kiriman dipasok klien (`client_id`), seluruh rantai `parent_post_id` diketahui sebelum insert pertama dan pengiriman ulang idempoten.

**Tech Stack:** Node/Express (`server.js`, satu berkas besar, ESM), Supabase JS client (bukan SQL mentah), React + TypeScript + Vite (`src/components/TerasPage.tsx`), tes `node:test` + Playwright.

**Spec:** `docs/superpowers/specs/2026-07-20-teras-utas-composer-design.md`

## Global Constraints

- **DDL hanya dijalankan user** lewat Supabase SQL Editor. Tidak ada tooling di repo yang boleh menyentuh skema (tidak ada `exec_sql`, psql, atau DB URL). DB lokal = produksi.
- **`node server.js` tidak hot-reload.** Setelah mengubah `server.js`, restart. Endpoint baru yang tampak 404 biasanya server basi — bedakan 404 dari 401 lewat `curl` sebelum menyimpulkan.
- **Batas:** maks **5** segmen per utas; tiap segmen **1–500** karakter; media **10 item per segmen**; quote dan link preview **hanya di segmen pertama**.
- **Utas 1 segmen = kiriman biasa** — `parent_post_id` dan `root_post_id` keduanya `NULL`. Tidak ada penanda tambahan.
- **Pola degradasi skema wajib** mengikuti yang sudah ada (`isCommunityMediaSchemaMissing`, `isCommunityQuoteSchemaMissing`, `isCommunityLinkPreviewSchemaMissing`): baca boleh mundur ke tanpa-kolom; **tulis utas ≥2 segmen → 503**; tulis kiriman 1 segmen tetap harus berhasil.
- **Pesan galat berbahasa Indonesia**, mengikuti gaya endpoint sekitarnya. Pesan bentuk-lama `'Isi posting wajib 1–500 karakter'` **tidak boleh berubah** — ia sudah dipakai klien dan tes.
- **ESM.** `package.json` punya `"type": "module"`; pakai `import`, bukan `require`.
- **Commit tiap task.** Stage selektif (`git add <path>`) — user punya WIP lain di working tree. Verifikasi `git branch --show-current` = `main` sebelum tiap commit.
- **Verifikasi FE:** `npx tsc --noEmit`. Tes: `node --test tests/<file>`. (`eslint` v10 belum dikonfigurasi — bukan gerbang.)

## File Structure

| Berkas | Tanggung jawab |
|---|---|
| `migrations/20260726000000_community_post_thread.sql` (baru) | DDL kolom + indeks; dijalankan user |
| `lib/community-thread-compose.js` (baru) | Helper murni: normalisasi `segments`, susun rantai, kumpul mention lintas-segmen |
| `tests/community-thread-compose.test.js` (baru) | Tes helper murni |
| `tests/community-thread-feed-guard.test.js` (baru) | Penjaga sumber: 6 query wajib menyaring `parent_post_id` |
| `server.js` (ubah) | Filter feed, `createCommunityPostRow`, handler `segments[]`, `thread_count`, rantai di detail, hapus utas |
| `src/components/teras/ComposerSegment.tsx` (baru) | Render satu segmen composer |
| `src/components/TerasPage.tsx` (ubah) | State segmen larik, submit batch, rantai di halaman detail |
| `src/components/TerasCard.tsx` (ubah) | Label "Utas · N kiriman" |
| `tests/teras-page.browser.test.js` (ubah) | Kontrak UI composer utas |

**Urutan wajib:** Task 1 (migrasi) dijalankan user sebelum Task 5 diuji manual. Task 2 → 4 → 5 berurutan (5 memakai helper dari 2 dan 4). Task 3, 6, 7 hanya bergantung pada Task 1. Task 8 → 9 → 10 di frontend.

---

### Task 1: Migrasi SQL

**Files:**
- Create: `migrations/20260726000000_community_post_thread.sql`

**Interfaces:**
- Produces: kolom `community_posts.parent_post_id`, `community_posts.root_post_id`; indeks `idx_community_posts_parent`, `idx_community_posts_root`, `idx_community_posts_feed_roots`. Semua task berikutnya memakai nama-nama ini persis.

Berkas ini **tidak dijalankan oleh siapa pun di sesi ini** — ia dokumen yang user tempel sendiri ke Supabase SQL Editor. Nama berkas dan isinya sengaja identik dengan "BAGIAN A" pada `docs/superpowers/plans/2026-07-20-teras-komentar-kiriman-penuh.md`, supaya spec komentar nanti mewarisi kolom ini alih-alih membuat migrasi tandingan.

- [ ] **Step 1: Tulis berkas migrasi**

```sql
-- Teras: utas di composer. Segmen lanjutan sebuah utas adalah baris
-- community_posts biasa dengan parent_post_id + root_post_id terisi.
--
-- Aditif dan aman dijalankan SEBELUM kode baru mendarat: kode lama tidak
-- pernah menulis maupun membaca kolom ini.
--
-- CATATAN: berkas ini sengaja identik dengan "BAGIAN A" pada plan
-- 2026-07-20-teras-komentar-kiriman-penuh.md. Kalau salah satu sudah
-- dijalankan, yang lain jadi no-op (semua IF NOT EXISTS).

BEGIN;

ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS parent_post_id UUID REFERENCES community_posts(id),
  ADD COLUMN IF NOT EXISTS root_post_id   UUID REFERENCES community_posts(id);

-- Segmen/balasan langsung sebuah kiriman, terurut waktu.
CREATE INDEX IF NOT EXISTS idx_community_posts_parent
  ON community_posts (parent_post_id, created_at)
  WHERE parent_post_id IS NOT NULL AND deleted_at IS NULL;

-- Ambil seluruh utas dalam satu query datar.
CREATE INDEX IF NOT EXISTS idx_community_posts_root
  ON community_posts (root_post_id, created_at)
  WHERE root_post_id IS NOT NULL AND deleted_at IS NULL;

-- Feed utama kini selalu menyaring segmen lanjutan; indeks feed lama tidak
-- lagi cocok dengan predikatnya.
CREATE INDEX IF NOT EXISTS idx_community_posts_feed_roots
  ON community_posts (created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND parent_post_id IS NULL;

COMMIT;

-- PostgREST menyimpan cache skema; tanpa ini kolom baru dibalas
-- PGRST204 "could not find column ... in schema cache".
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Commit**

```bash
git branch --show-current   # harus: main
git add migrations/20260726000000_community_post_thread.sql
git commit -m "feat(teras): migrasi kolom utas (parent_post_id, root_post_id)"
```

- [ ] **Step 3: Minta user menjalankannya**

Sampaikan ke user, jangan dijalankan sendiri:

> Migrasi `migrations/20260726000000_community_post_thread.sql` siap. Tolong tempel isinya ke Supabase SQL Editor dan jalankan. Aditif — aman dijalankan sekarang, kode lama tidak terpengaruh.

---

### Task 2: Helper murni `community-thread-compose`

**Files:**
- Create: `lib/community-thread-compose.js`
- Test: `tests/community-thread-compose.test.js`

**Interfaces:**
- Consumes: `extractCommunityMentions(body, slugIterable, authorSlug, limit)` dari `lib/community-mentions.js` (sudah ada).
- Produces:
  - `MAX_THREAD_SEGMENTS` = `5`
  - `MAX_SEGMENT_BODY_CHARS` = `500`
  - `normalizeThreadSegments(payload)` → `{ segments, error }`. `segments`: `Array<{ clientId: string|null, body: string, media: unknown, photoUrl: unknown }>`. `error`: `string|null` (pesan siap-kirim berbahasa Indonesia).
  - `buildThreadChain(segments)` → `Array<{ clientId, body, media, photoUrl, parentPostId: string|null, rootPostId: string|null }>`
  - `collectThreadMentions(segments, memberSlugs, authorSlug, limit)` → `Array<{ slug: string, postId: string }>`

Helper ini **murni** — tanpa DB, tanpa `supabase`, tanpa `fetch`. Semua validasi bentuk hidup di sini supaya bisa diuji tanpa server. Normalisasi media **tidak** di sini: ia butuh `communityMediaPublicPrefixes()` dan `agent.slug` yang hanya ada di `server.js`; helper cuma meneruskan payload media apa adanya.

- [ ] **Step 1: Tulis tes yang gagal**

Buat `tests/community-thread-compose.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_THREAD_SEGMENTS,
  buildThreadChain,
  collectThreadMentions,
  normalizeThreadSegments,
} from '../lib/community-thread-compose.js';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const ID_C = '33333333-3333-4333-8333-333333333333';

test('bentuk lama tanpa segments jadi utas satu segmen', () => {
  const { segments, error } = normalizeThreadSegments({
    body: '  Halo Teras  ',
    client_id: ID_A,
    media: [{ type: 'image', url: 'https://cdn.test/a.jpg' }],
  });
  assert.equal(error, null);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].body, 'Halo Teras', 'body di-trim');
  assert.equal(segments[0].clientId, ID_A);
  assert.deepEqual(segments[0].media, [{ type: 'image', url: 'https://cdn.test/a.jpg' }]);
});

test('bentuk lama tanpa client_id tetap sah', () => {
  const { segments, error } = normalizeThreadSegments({ body: 'Halo' });
  assert.equal(error, null);
  assert.equal(segments[0].clientId, null);
});

test('pesan galat bentuk lama tidak berubah', () => {
  assert.equal(
    normalizeThreadSegments({ body: '   ' }).error,
    'Isi posting wajib 1–500 karakter',
    'klien dan tes lama bergantung pada teks persis ini',
  );
  assert.equal(
    normalizeThreadSegments({ body: 'a'.repeat(501) }).error,
    'Isi posting wajib 1–500 karakter',
  );
});

test('segments[] berisi dua kiriman diterima', () => {
  const { segments, error } = normalizeThreadSegments({
    segments: [
      { client_id: ID_A, body: 'Ini konten pertama.' },
      { client_id: ID_B, body: 'Ini konten kedua.', media: [] },
    ],
  });
  assert.equal(error, null);
  assert.deepEqual(segments.map(s => s.body), ['Ini konten pertama.', 'Ini konten kedua.']);
  assert.deepEqual(segments.map(s => s.clientId), [ID_A, ID_B]);
});

test('utas lebih dari 5 segmen ditolak', () => {
  const segments = Array.from({ length: MAX_THREAD_SEGMENTS + 1 }, (_, i) => ({
    client_id: `${i}1111111-1111-4111-8111-111111111111`,
    body: `Segmen ${i}`,
  }));
  assert.equal(
    normalizeThreadSegments({ segments }).error,
    'Utas maksimal 5 kiriman',
  );
});

test('segments kosong ditolak', () => {
  assert.equal(
    normalizeThreadSegments({ segments: [] }).error,
    'Utas wajib berisi minimal 1 kiriman',
  );
});

test('galat panjang di utas menyebut nomor segmennya', () => {
  const { error } = normalizeThreadSegments({
    segments: [
      { client_id: ID_A, body: 'Oke' },
      { client_id: ID_B, body: '   ' },
    ],
  });
  assert.equal(error, 'Isi kiriman ke-2 wajib 1–500 karakter');
});

test('utas wajib punya client_id di tiap segmen', () => {
  const { error } = normalizeThreadSegments({
    segments: [{ body: 'Satu' }, { body: 'Dua' }],
  });
  assert.equal(
    error,
    'Setiap kiriman dalam utas wajib punya ID',
    'rantai parent_post_id harus diketahui sebelum insert pertama',
  );
});

test('client_id bukan UUID ditolak', () => {
  assert.equal(
    normalizeThreadSegments({ segments: [{ client_id: 'bukan-uuid', body: 'Satu' }, { client_id: ID_B, body: 'Dua' }] }).error,
    'ID kiriman tidak valid',
  );
});

test('client_id kembar dalam satu utas ditolak', () => {
  assert.equal(
    normalizeThreadSegments({ segments: [{ client_id: ID_A, body: 'Satu' }, { client_id: ID_A, body: 'Dua' }] }).error,
    'ID kiriman kembar dalam satu utas',
  );
});

test('quote atau link preview di segmen selain pertama ditolak', () => {
  const message = 'Kutipan dan pratinjau tautan hanya boleh di kiriman pertama';
  assert.equal(
    normalizeThreadSegments({ segments: [{ client_id: ID_A, body: 'Satu' }, { client_id: ID_B, body: 'Dua', quoted_post_id: ID_C }] }).error,
    message,
  );
  assert.equal(
    normalizeThreadSegments({ segments: [{ client_id: ID_A, body: 'Satu' }, { client_id: ID_B, body: 'Dua', link_preview: { url: 'https://a.test' } }] }).error,
    message,
  );
});

test('buildThreadChain merantai parent dan root', () => {
  const { segments } = normalizeThreadSegments({
    segments: [
      { client_id: ID_A, body: 'Satu' },
      { client_id: ID_B, body: 'Dua' },
      { client_id: ID_C, body: 'Tiga' },
    ],
  });
  const chain = buildThreadChain(segments);
  assert.deepEqual(
    chain.map(row => [row.clientId, row.parentPostId, row.rootPostId]),
    [
      [ID_A, null, null],
      [ID_B, ID_A, ID_A],
      [ID_C, ID_B, ID_A],
    ],
    'segmen 1 tak terbedakan dari kiriman biasa; root selalu segmen 1',
  );
});

test('buildThreadChain untuk satu segmen tidak memakai kolom utas', () => {
  const { segments } = normalizeThreadSegments({ body: 'Halo' });
  const [row] = buildThreadChain(segments);
  assert.equal(row.parentPostId, null);
  assert.equal(row.rootPostId, null);
});

test('mention yang sama di dua segmen jadi satu, menunjuk segmen pertama', () => {
  const mentions = collectThreadMentions(
    [
      { postId: ID_A, body: 'halo @budi' },
      { postId: ID_B, body: 'sekali lagi @budi dan @siti' },
    ],
    ['budi', 'siti'],
    'nikita',
    10,
  );
  assert.deepEqual(mentions, [
    { slug: 'budi', postId: ID_A },
    { slug: 'siti', postId: ID_B },
  ]);
});

test('batas mention dihitung untuk seluruh utas, bukan per segmen', () => {
  const mentions = collectThreadMentions(
    [
      { postId: ID_A, body: '@a @b' },
      { postId: ID_B, body: '@c @d' },
    ],
    ['a', 'b', 'c', 'd'],
    'nikita',
    3,
  );
  assert.deepEqual(
    mentions.map(m => m.slug),
    ['a', 'b', 'c'],
    'utas 5 segmen tidak boleh jadi jalan pintas menyebut 5x lipat orang',
  );
});

test('penulis tidak menyebut dirinya sendiri', () => {
  const mentions = collectThreadMentions(
    [{ postId: ID_A, body: 'catatan untuk @nikita' }],
    ['nikita', 'budi'],
    'nikita',
    10,
  );
  assert.deepEqual(mentions, []);
});
```

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `node --test tests/community-thread-compose.test.js`
Expected: FAIL — `Cannot find module '../lib/community-thread-compose.js'`

- [ ] **Step 3: Tulis implementasinya**

Buat `lib/community-thread-compose.js`:

```js
// Helper murni untuk utas Teras (beberapa kiriman sekali kirim).
// Tanpa DB: semua validasi bentuk hidup di sini supaya bisa diuji tanpa server.
// Normalisasi media sengaja TIDAK di sini — ia butuh prefix URL publik dan
// slug agen yang hanya ada di server.js.

import { extractCommunityMentions } from './community-mentions.js';

export const MAX_THREAD_SEGMENTS = 5;
export const MAX_SEGMENT_BODY_CHARS = 500;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

function readSegment(raw) {
  const body = typeof raw?.body === 'string' ? raw.body.trim() : '';
  return {
    clientId: raw?.client_id === undefined ? null : raw.client_id,
    body,
    length: Array.from(body).length,
    media: raw?.media,
    photoUrl: raw?.photo_url,
    hasQuote: raw?.quoted_post_id !== undefined && raw?.quoted_post_id !== null,
    hasLinkPreview: raw?.link_preview !== undefined && raw?.link_preview !== null,
  };
}

function fail(error) {
  return { segments: null, error };
}

/**
 * Menerima bentuk lama `{ body, media, photo_url, client_id }` maupun bentuk
 * baru `{ segments: [...] }` dan mengembalikan daftar segmen tervalidasi.
 * Bentuk lama sengaja mempertahankan pesan galatnya yang persis, karena klien
 * dan tes yang sudah ada bergantung padanya.
 */
export function normalizeThreadSegments(payload) {
  const isLegacy = payload?.segments === undefined;
  const rawSegments = isLegacy ? [payload] : payload.segments;

  if (!Array.isArray(rawSegments)) return fail('Format utas tidak valid');
  if (rawSegments.length === 0) return fail('Utas wajib berisi minimal 1 kiriman');
  if (rawSegments.length > MAX_THREAD_SEGMENTS) {
    return fail(`Utas maksimal ${MAX_THREAD_SEGMENTS} kiriman`);
  }

  const segments = rawSegments.map(readSegment);
  const isThread = segments.length > 1;

  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    if (segment.length < 1 || segment.length > MAX_SEGMENT_BODY_CHARS) {
      return fail(isThread
        ? `Isi kiriman ke-${i + 1} wajib 1–${MAX_SEGMENT_BODY_CHARS} karakter`
        : `Isi posting wajib 1–${MAX_SEGMENT_BODY_CHARS} karakter`);
    }
    // Rantai parent_post_id harus diketahui sebelum insert pertama, jadi utas
    // wajib membawa id dari klien. Kiriman tunggal boleh tanpa id (bentuk lama).
    if (segment.clientId === null) {
      if (isThread) return fail('Setiap kiriman dalam utas wajib punya ID');
    } else if (!isUuid(segment.clientId)) {
      return fail('ID kiriman tidak valid');
    }
    if (i > 0 && (segment.hasQuote || segment.hasLinkPreview)) {
      return fail('Kutipan dan pratinjau tautan hanya boleh di kiriman pertama');
    }
  }

  const ids = segments.map(segment => segment.clientId).filter(Boolean);
  if (new Set(ids).size !== ids.length) return fail('ID kiriman kembar dalam satu utas');

  return {
    segments: segments.map(segment => ({
      clientId: segment.clientId,
      body: segment.body,
      media: segment.media,
      photoUrl: segment.photoUrl,
    })),
    error: null,
  };
}

/**
 * Menyusun rantai insert. Segmen 1 sengaja tetap `null/null` supaya utas satu
 * segmen tak terbedakan dari kiriman biasa.
 */
export function buildThreadChain(segments) {
  const rootId = segments.length > 1 ? segments[0].clientId : null;
  return segments.map((segment, index) => ({
    ...segment,
    parentPostId: index === 0 ? null : segments[index - 1].clientId,
    rootPostId: index === 0 ? null : rootId,
  }));
}

/**
 * Kumpulkan sebutan dari seluruh utas. Tiap orang muncul sekali, memetakan ke
 * segmen tempat ia PERTAMA disebut, dan `limit` berlaku untuk daftar gabungan.
 * @param {Array<{postId: string, body: string}>} segments
 */
export function collectThreadMentions(segments, memberSlugs, authorSlug, limit) {
  const seen = new Set();
  const out = [];
  for (const segment of segments) {
    const slugs = extractCommunityMentions(segment.body, memberSlugs, authorSlug, limit);
    for (const slug of slugs) {
      if (seen.has(slug)) continue;
      seen.add(slug);
      out.push({ slug, postId: segment.postId });
      if (out.length >= limit) return out;
    }
  }
  return out;
}
```

- [ ] **Step 4: Jalankan tes, pastikan lulus**

Run: `node --test tests/community-thread-compose.test.js`
Expected: PASS, 15 tes lulus, 0 gagal

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # harus: main
git add lib/community-thread-compose.js tests/community-thread-compose.test.js
git commit -m "feat(teras): helper murni penyusun utas composer"
```

---

### Task 3: Saring segmen lanjutan dari 6 query daftar

**Files:**
- Modify: `server.js` (6 titik, lihat tabel di bawah)
- Test: `tests/community-thread-feed-guard.test.js` (baru)

**Interfaces:**
- Consumes: kolom `parent_post_id` dari Task 1.
- Produces: `isCommunityThreadSchemaMissing(error)` — dipakai Task 4, 5, dan 6.

Enam query harus menyaring segmen lanjutan. Nomor barisnya bergeser saat mengedit; cari lewat fungsi pembungkusnya:

| Fungsi / endpoint | Sekitar baris | Peran |
|---|---|---|
| `buildPostsQuery` di `GET /api/community/feed` | 5011 | linimasa utama **dan** profil agen (query sama + `agent_id`) |
| `loadCommunityTeaserSharedData` — `latestResult` | 4441 | teaser 12 terbaru |
| `loadCommunityTeaserSharedData` — `todayResult` | 4448 | hitung "kiriman hari ini" |
| `GET /api/community/teaser` — `unreadQuery` | 4520 | hitung belum-dibaca |
| `loadCommunityFeedHead` | 4571 | pill "kiriman baru" |
| `loadTerasNotificationSources` — `broadcastQuery` | 4820 | sumber broadcast `@semua` di lonceng |

Yang **tidak** disaring, dan jangan diubah: `buildQuotedQuery` (3 tempat — mengutip satu segmen itu sah), `buildPostQuery` di `GET /api/community/posts/:id` (membuka segmen mana pun harus berhasil), `loadTerasSharePreview` (OG card per segmen), `loadActiveCommunityPost`, DELETE, dan `communityMediaUrlStillReferenced`.

Degradasi skema: query di atas dipanggil sebelum migrasi mungkin dijalankan. Filter dipasang lewat pembungkus yang bisa dimatikan, memakai pola `includeMedia`/`includeQuote` yang sudah ada di berkas ini.

- [ ] **Step 1: Tulis penjaga sumber yang gagal**

Buat `tests/community-thread-feed-guard.test.js`:

```js
// Penjaga sumber, bukan tes perilaku: memastikan setiap query yang menampilkan
// DAFTAR kiriman menyaring segmen lanjutan utas. Kalau tidak, satu utas 5
// segmen akan mengubur kiriman agen lain di linimasa — regresi yang tidak
// menimbulkan error, cuma feed yang pelan-pelan salah.
//
// Saat spec "komentar jadi kiriman penuh" mendarat dan melonggarkan query
// profil, PERBARUI daftar ini — jangan hapus tesnya.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');

/** Ambil isi fungsi/blok mulai dari sebuah penanda sampai n baris berikutnya. */
function sliceAfter(marker, lines = 30) {
  const index = source.indexOf(marker);
  assert.notEqual(index, -1, `penanda tidak ditemukan di server.js: ${marker}`);
  return source.slice(index).split('\n').slice(0, lines).join('\n');
}

const GUARDED = [
  ['const buildPostsQuery = ', 'linimasa utama & profil agen'],
  ['function loadCommunityFeedHead', 'head feed (pill kiriman baru)'],
  ['const broadcastQuery = ', 'sumber broadcast @semua di lonceng'],
];

for (const [marker, label] of GUARDED) {
  test(`${label} menyaring segmen lanjutan utas`, () => {
    assert.match(
      sliceAfter(marker, 30),
      /parent_post_id/,
      `${label} harus menyaring parent_post_id IS NULL`,
    );
  });
}

test('teaser (12 terbaru + hitung hari ini) menyaring segmen lanjutan', () => {
  const block = sliceAfter('const [latestResult, todayResult] = await Promise.all(', 24);
  const matches = block.match(/parent_post_id/g) || [];
  assert.equal(matches.length, 2, 'kedua query teaser harus disaring, bukan salah satu');
});

test('hitung belum-dibaca menyaring segmen lanjutan', () => {
  assert.match(sliceAfter('let unreadQuery = supabase', 12), /parent_post_id/);
});

test('lookup kutipan TIDAK disaring', () => {
  const block = sliceAfter('const buildQuotedQuery = includeMedia =>', 12);
  assert.doesNotMatch(
    block,
    /parent_post_id/,
    'mengutip satu segmen utas itu sah — jangan disaring',
  );
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `node --test tests/community-thread-feed-guard.test.js`
Expected: FAIL — 6 tes pertama gagal (`parent_post_id` belum ada), tes terakhir lulus.

- [ ] **Step 3: Tambahkan penjaga skema utas**

Di `server.js`, tepat setelah `isCommunityLinkPreviewSchemaMissing` (sekitar baris 4162), tambahkan:

```js
function isCommunityThreadSchemaMissing(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || error?.details || '');
  if (!['42703', 'PGRST204'].includes(code)) return false;
  return /parent_post_id|root_post_id/i.test(message)
    && /does not exist|could not find|schema cache/i.test(message);
}
```

- [ ] **Step 4: Saring linimasa utama & profil**

Di `buildPostsQuery`, tambahkan parameter `includeThread` dan filternya. Ubah tanda tangannya dan baris `.is('deleted_at', null)`:

```js
    const buildPostsQuery = (includeMedia, includeQuote, includeLinkPreview, includeThread) => {
      let query = supabase
        .from('community_posts')
        .select(`id, body, photo_url, ${includeMedia ? 'media, ' : ''}${includeQuote ? 'quoted_post_id, ' : ''}${includeLinkPreview ? 'link_preview, ' : ''}is_system, created_at, agent_id, agent:agents!community_posts_agent_id_fkey(name, slug, photo)`)
        .is('deleted_at', null);
      // Segmen lanjutan sebuah utas tidak pernah muncul di daftar — baik di
      // linimasa maupun di profil. Utas tampil sebagai satu unit lewat kartu
      // segmen pertamanya.
      if (includeThread) query = query.is('parent_post_id', null);
      if (profileMember) {
```

Lalu di loop percobaannya, tambahkan `includeThread` sebagai state dan cabang degradasinya:

```js
    let includeMedia = true;
    let includeQuote = true;
    let includeLinkPreview = true;
    let includeThread = true;
    let posts = null;
    let postsError = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      ({ data: posts, error: postsError } = await buildPostsQuery(includeMedia, includeQuote, includeLinkPreview, includeThread));
      if (includeMedia && isCommunityMediaSchemaMissing(postsError)) {
        includeMedia = false;
        continue;
      }
      if (includeQuote && isCommunityQuoteSchemaMissing(postsError)) {
        includeQuote = false;
        continue;
      }
      if (includeLinkPreview && isCommunityLinkPreviewSchemaMissing(postsError)) {
        includeLinkPreview = false;
        continue;
      }
      if (includeThread && isCommunityThreadSchemaMissing(postsError)) {
        includeThread = false;
        continue;
      }
      break;
    }
```

Perhatikan `attempt < 5` — batas loop naik dari 4 karena sekarang ada 4 kemungkinan mundur.

- [ ] **Step 5: Saring lima query sisanya**

Kelima query ini tidak punya loop degradasi. Pakai pembungkus kecil yang mencoba sekali dengan filter, lalu mundur sekali tanpa filter. Tambahkan helper ini tepat di bawah `isCommunityThreadSchemaMissing`:

```js
// Jalankan query daftar dengan filter "bukan segmen lanjutan". Kalau migrasi
// utas belum diterapkan, ulangi tanpa filter — sebelum migrasi tidak ada utas,
// jadi hasilnya identik.
async function runCommunityRootQuery(build) {
  const result = await build(true);
  if (isCommunityThreadSchemaMissing(result.error)) return build(false);
  return result;
}
```

Terapkan di masing-masing:

**`loadCommunityTeaserSharedData`** — ganti blok `Promise.all` yang ada:

```js
  const [latestResult, todayResult] = await Promise.all([
    runCommunityRootQuery(withThread => {
      let query = supabase
        .from('community_posts')
        .select('id, body, created_at, agent_id, agent:agents!community_posts_agent_id_fkey(name, photo)')
        .is('deleted_at', null);
      if (withThread) query = query.is('parent_post_id', null);
      return query
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(12);
    }),
    runCommunityRootQuery(withThread => {
      let query = supabase
        .from('community_posts')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .gte('created_at', startOfTodayWib);
      if (withThread) query = query.is('parent_post_id', null);
      return query;
    }),
  ]);
```

**`GET /api/community/teaser`** — ganti `unreadQuery` dan pemanggilannya:

```js
    const { count: unreadCount, error: unreadError } = await runCommunityRootQuery(withThread => {
      let unreadQuery = supabase
        .from('community_posts')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .neq('agent_id', agent.id);
      if (withThread) unreadQuery = unreadQuery.is('parent_post_id', null);
      if (readState?.last_seen_at) {
        unreadQuery = unreadQuery.gt('created_at', readState.last_seen_at);
      }
      return unreadQuery;
    });
    if (unreadError) throw unreadError;
```

**`loadCommunityFeedHead`** — ganti query-nya:

```js
  const { data, error } = await runCommunityRootQuery(withThread => {
    let query = supabase
      .from('community_posts')
      .select('id, created_at')
      .is('deleted_at', null);
    if (withThread) query = query.is('parent_post_id', null);
    return query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
  });
  if (error) throw error;
```

**`loadTerasNotificationSources`** — `broadcastQuery` dipakai belakangan (`.gt('created_at', since)` di bawahnya), jadi filternya dipasang langsung, bukan lewat pembungkus. Ganti deklarasinya:

```js
  // Broadcast @semua dari agent lain. Penulisnya sendiri tidak diberi tahu, dan
  // kiriman terhapus hilang dari lonceng seperti sumber lain. Segmen lanjutan
  // utas tidak pernah jadi sumber lonceng — @semua hanya dihormati di segmen 1.
  const broadcastQuery = supabase
    .from('community_posts')
    .select('id, body, created_at, author:agents!community_posts_agent_id_fkey(name, photo)')
    .eq('mentions_everyone', true)
    .neq('agent_id', agent.id)
    .is('deleted_at', null)
    .is('parent_post_id', null)
    .order('created_at', { ascending: false })
    .limit(limit);
```

Ini satu-satunya dari enam yang **tidak** punya jalan mundur. Aman: `mentions_everyone` sendiri kolom hasil migrasi sebelumnya, dan sebelum migrasi utas tidak ada baris ber-`parent_post_id`. Kalau query ini gagal karena kolom belum ada, lonceng ikut gagal — jadi migrasi Task 1 wajib dijalankan sebelum deploy Task 3. Sampaikan ini ke user saat commit.

- [ ] **Step 6: Jalankan penjaga, pastikan lulus**

Run: `node --test tests/community-thread-feed-guard.test.js`
Expected: PASS, 7 tes lulus

- [ ] **Step 7: Pastikan tes Teras lain tidak rusak**

Run: `node --test tests/community-access.test.js tests/community-notifications.test.js tests/community-profile-feed.test.js`
Expected: PASS semua

- [ ] **Step 8: Commit**

```bash
git branch --show-current   # harus: main
git add server.js tests/community-thread-feed-guard.test.js
git commit -m "feat(teras): saring segmen lanjutan utas dari feed, teaser, dan lonceng"
```

---

### Task 4: Ekstrak `createCommunityPostRow`

**Files:**
- Modify: `server.js` — `POST /api/community/posts` (sekitar baris 5440–5540)

**Interfaces:**
- Consumes: `isCommunityThreadSchemaMissing` dari Task 3.
- Produces:
  ```js
  async function createCommunityPostRow({
    clientId, agentId, body, media, photoUrl, quotedPostId, mentionsEveryone,
    linkPreview, parentPostId = null, rootPostId = null,
  })
  // → { post, error, threadSchemaMissing }
  ```
  `post` berisi `id, body, photo_url, media?, is_system, created_at`. `threadSchemaMissing` `true` bila insert gagal semata karena kolom utas belum ada. Task 5 memanggil fungsi ini berulang.

**Task ini murni refactor — perilaku tidak boleh berubah sama sekali.** Ia dipisah dari Task 5 supaya reviewer bisa memastikan itu sebelum logika utas masuk.

- [ ] **Step 1: Tulis fungsi baru**

Tambahkan tepat sebelum `app.post('/api/community/posts', ...)`:

```js
// Satu insert kiriman, lengkap dengan degradasi skema yang sudah lama ada di
// endpoint ini (kolom media, kolom `type` usang, link preview) dan penanganan
// 23505 idempoten untuk retry ber-client_id yang sama. Dipanggil berulang oleh
// pembuat utas, jadi ia tidak boleh menyentuh `res` maupun melempar.
async function createCommunityPostRow({
  clientId,
  agentId,
  body,
  media,
  photoUrl,
  quotedPostId = null,
  mentionsEveryone = false,
  linkPreview = null,
  parentPostId = null,
  rootPostId = null,
}) {
  const basePostPayload = {
    ...(clientId ? { id: clientId } : {}),
    agent_id: agentId,
    body,
    photo_url: photoUrl,
    is_system: false,
    ...(quotedPostId ? { quoted_post_id: quotedPostId } : {}),
    ...(mentionsEveryone ? { mentions_everyone: true } : {}),
  };
  const isThreadSegment = !!parentPostId;

  let includeMediaColumn = true;
  let includeObsoleteType = false;
  let includeLinkPreview = !!linkPreview;
  // Kiriman biasa tidak butuh kolom utas sama sekali, jadi ia boleh mundur
  // tanpa kolom itu. Segmen lanjutan tidak boleh — utas separuh jadi lebih
  // buruk daripada penolakan yang jelas.
  let includeThread = isThreadSegment || !!rootPostId;
  let createdPost = null;
  let insertError = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const postPayload = {
      ...basePostPayload,
      ...(includeMediaColumn ? { media } : {}),
      ...(includeObsoleteType ? { type: media.length > 0 ? 'foto' : 'tips' } : {}),
      ...(includeLinkPreview ? { link_preview: linkPreview } : {}),
      ...(includeThread ? { parent_post_id: parentPostId, root_post_id: rootPostId } : {}),
    };
    const insertResult = await supabase
      .from('community_posts')
      .insert(postPayload)
      .select(`id, body, photo_url, ${includeMediaColumn ? 'media, ' : ''}is_system, created_at`)
      .single();
    createdPost = insertResult.data;
    insertError = insertResult.error;
    if (!insertError) break;
    if (includeMediaColumn && isCommunityMediaSchemaMissing(insertError)) {
      includeMediaColumn = false;
      continue;
    }
    if (includeLinkPreview && isCommunityLinkPreviewSchemaMissing(insertError)) {
      includeLinkPreview = false;
      continue;
    }
    if (includeThread && isCommunityThreadSchemaMissing(insertError)) {
      if (isThreadSegment) return { post: null, error: insertError, threadSchemaMissing: true };
      includeThread = false;
      continue;
    }
    // Compatibility for installations that already ran the pre-final Teras
    // draft, where `type` was NOT NULL. Keep that obsolete value server-side.
    if (
      !includeObsoleteType
      && insertError?.code === '23502'
      && /column "type"/i.test(insertError.message || '')
    ) {
      includeObsoleteType = true;
      continue;
    }
    break;
  }

  if (insertError?.code === '23505' && clientId) {
    const loadExistingPost = includeMedia => supabase
      .from('community_posts')
      .select(`id, body, photo_url, ${includeMedia ? 'media, ' : ''}is_system, created_at`)
      .eq('id', clientId)
      .eq('agent_id', agentId)
      .is('deleted_at', null)
      .maybeSingle();
    let { data: existingPost, error: existingError } = await loadExistingPost(true);
    if (isCommunityMediaSchemaMissing(existingError)) {
      ({ data: existingPost, error: existingError } = await loadExistingPost(false));
    }
    if (existingError) return { post: null, error: existingError, threadSchemaMissing: false };
    const existingMedia = normalizeStoredCommunityMedia(existingPost?.media, existingPost?.photo_url);
    if (
      existingPost
      && existingPost.body === body
      && existingPost.photo_url === photoUrl
      && communityMediaEquals(existingMedia, media)
    ) {
      return { post: existingPost, error: null, threadSchemaMissing: false };
    }
    return { post: null, error: { code: 'DUPLICATE_CLIENT_ID' }, threadSchemaMissing: false };
  }

  return { post: createdPost, error: insertError, threadSchemaMissing: false };
}
```

- [ ] **Step 2: Panggil dari handler yang ada**

Di `POST /api/community/posts`, ganti seluruh blok dari `const basePostPayload = {` sampai `if (insertError) throw insertError;` dengan:

```js
    const { post: createdPost, error: insertError } = await createCommunityPostRow({
      clientId,
      agentId: agent.id,
      body,
      media,
      photoUrl,
      quotedPostId,
      mentionsEveryone,
      linkPreview,
    });
    if (insertError?.code === 'DUPLICATE_CLIENT_ID') {
      return res.status(409).json({ error: 'ID kiriman sudah digunakan' });
    }
    if (insertError) throw insertError;
```

Perhatikan: `includeLinkPreview` dulu dipakai lagi di payload balasan (`link_preview: includeLinkPreview ? linkPreview : null`). Ganti jadi `link_preview: linkPreview` — bila kolomnya tak ada, `linkPreview` toh tak tersimpan, dan mengembalikannya di respons pembuatan tidak merusak apa pun. Kalau ingin persis seperti dulu, baca dari `createdPost.link_preview` — tapi `select` tidak mengambil kolom itu, jadi jangan.

- [ ] **Step 3: Verifikasi tidak ada perubahan perilaku**

Restart server dan buat kiriman biasa lewat UI (teks saja, lalu teks + 1 foto, lalu teks + kutipan). Ketiganya harus berhasil seperti sebelumnya.

```bash
node --test tests/community-access.test.js tests/community-notifications.test.js
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git branch --show-current   # harus: main
git add server.js
git commit -m "refactor(teras): ekstrak createCommunityPostRow dari handler kiriman"
```

---

### Task 5: Terima `segments[]` di endpoint kiriman

**Files:**
- Modify: `server.js` — `POST /api/community/posts`, dan `recordCommunityMentions` (sekitar baris 4041)

**Interfaces:**
- Consumes: `normalizeThreadSegments`, `buildThreadChain`, `collectThreadMentions`, `MAX_THREAD_SEGMENTS` (Task 2); `createCommunityPostRow` (Task 4); `isCommunityThreadSchemaMissing` (Task 3).
- Produces: respons 201 dengan field baru `thread_count` (jumlah **seluruh** segmen; `0` untuk kiriman biasa). Task 8 dan 9 memakainya.

- [ ] **Step 1: Impor helper**

Di bagian impor `server.js`, dekat impor `lib/community-mentions.js` yang sudah ada:

```js
import {
  buildThreadChain,
  collectThreadMentions,
  normalizeThreadSegments,
} from './lib/community-thread-compose.js';
```

`MAX_THREAD_SEGMENTS` sengaja **tidak** diimpor: batasnya sudah ditegakkan di dalam `normalizeThreadSegments`, dan impor yang tak terpakai cuma jadi kebohongan kecil tentang siapa memeriksa apa.

- [ ] **Step 2: Buat `recordCommunityMentions` sanggup melayani banyak kiriman**

Ganti tanda tangan dan awal `recordCommunityMentions` (baris ~4041). Yang berubah hanya: sumber sebutan jadi lintas-segmen, query idempotensi jadi `.in(...)`, dan tautan notifikasi memakai `postId` per orang. Sisanya sama persis.

```js
// `segments`: [{ postId, body }] — satu elemen untuk kiriman/komentar biasa,
// banyak untuk utas. Utas diperlakukan sebagai SATU peristiwa: orang yang
// disebut di beberapa segmen hanya diberi tahu sekali.
async function recordCommunityMentions({ segments, authorAgent, commentId = null }) {
  try {
    const members = await loadCommunityMembers();
    if (!members.length) return;
    const bySlug = new Map(members.map(m => [String(m.slug).toLowerCase(), m]));
    const mentions = collectThreadMentions(
      segments,
      bySlug.keys(),
      authorAgent.slug,
      COMMUNITY_MENTION_LIMIT,
    );
    if (!mentions.length) return;

    const postIds = [...new Set(segments.map(segment => segment.postId))];
    const rows = mentions
      .map(mention => ({ member: bySlug.get(mention.slug), postId: mention.postId }))
      .filter(entry => entry.member)
      .map(entry => ({
        mentioned_agent_id: entry.member.id,
        author_agent_id: authorAgent.id,
        post_id: entry.postId,
        comment_id: commentId,
      }));
    if (!rows.length) return;

    // Idempotent: a retried POST (same client_id) must not duplicate rows or
    // re-notify. This is a read-then-insert rather than an upsert on purpose —
    // the unique guards are partial indexes (post-level vs comment-level), and
    // Postgres cannot infer those from an `on_conflict` column list, so an
    // upsert here fails with 42P10 and no mention is ever recorded.
    const recordedQuery = supabase
      .from('community_mentions')
      .select('mentioned_agent_id')
      .in('post_id', postIds);
    const { data: recorded, error: recordedError } = await (commentId
      ? recordedQuery.eq('comment_id', commentId)
      : recordedQuery.is('comment_id', null));
```

Sisa fungsinya tetap, kecuali blok notifikasi Telegram di ujung — `snippet` dan `link` sekarang per-orang. Ganti dari `const notified = ...` sampai akhir loop:

```js
    const notified = new Set(fresh.map(row => row.mentioned_agent_id));
    const authorName = authorAgent.name || 'Seseorang';
    const bodyByPostId = new Map(segments.map(segment => [segment.postId, segment.body]));
    for (const mention of mentions) {
      const member = bySlug.get(mention.slug);
      if (!member || !notified.has(member.id)) continue;
      if (!member.telegram_chat_id) continue;
      const prefs = member.notification_prefs || {};
      if (prefs.community_mentions === false) continue;
      const snippet = communityMentionSnippet(bodyByPostId.get(mention.postId) || '');
      const link = `${communityPublicOrigin()}/dashboard/teras/post/${mention.postId}`;
      const text = `🔔 <b>${escapeHtml(authorName)}</b> menyebut kamu di Teras`
        + (snippet ? `\n\n${escapeHtml(snippet)}` : '')
        + `\n\n${link}`;
      sendTelegramMessageDirect(member.telegram_chat_id, text).catch(() => {});
    }
```

Perbarui **dua** pemanggil yang ada (kiriman ~5534, komentar ~5794) ke bentuk baru:

```js
    await recordCommunityMentions({
      segments: [{ postId: createdPost.id, body: createdPost.body }],
      authorAgent: agent,
    });
```

dan untuk komentar, pertahankan `commentId`-nya:

```js
    await recordCommunityMentions({
      segments: [{ postId, body }],
      authorAgent: agent,
      commentId: createdComment.id,
    });
```

(Nama variabel `postId`/`body`/`createdComment` di sana sudah ada; jangan ganti.)

- [ ] **Step 3: Naikkan batas JSON rute**

```js
app.post('/api/community/posts', authMiddleware, express.json({ limit: '96kb' }), async (req, res) => {
```

5 segmen berisi metadata media melewati 32kb. Catatan repo: parser global 10mb tidak menolong batas per-route yang lebih kecil, tapi menaikkannya aman.

- [ ] **Step 4: Ganti validasi body tunggal dengan normalisasi segmen**

Di awal handler, ganti blok `const body = ...` sampai `}` penutup pemeriksaan `clientId`:

```js
    const { segments: rawSegments, error: segmentError } = normalizeThreadSegments(req.body);
    if (segmentError) return res.status(400).json({ error: segmentError });

    // Segmen pertama memegang identitas utas: quote, link preview, dan @semua
    // hanya dinilai dari sini.
    const body = rawSegments[0].body;
    const clientId = rawSegments[0].clientId || undefined;
    const isThread = rawSegments.length > 1;
```

Semua kode di bawahnya yang membaca `body` dan `clientId` (kuota `@semua`, quote, link preview) tetap bekerja apa adanya.

- [ ] **Step 5: Normalisasi media tiap segmen**

Ganti blok normalisasi media tunggal (`const hasMediaPayload = ...` sampai `const requiresMediaSchema = ...`) dengan loop. Perhatikan `photo_url` bentuk lama hanya berlaku untuk segmen pertama:

```js
    const mediaPrefixes = communityMediaPublicPrefixes();
    if (!mediaPrefixes.length) throw new Error('Public URL media Teras tidak tersedia');

    const segmentMedia = [];
    for (let i = 0; i < rawSegments.length; i += 1) {
      const segment = rawSegments[i];
      let media;
      if (segment.media !== undefined) {
        media = normalizeCommunityMediaInput(segment.media, mediaPrefixes, agent.slug);
        if (!media) {
          return res.status(400).json({
            error: isThread
              ? `Media kiriman ke-${i + 1} tidak valid atau melebihi ${COMMUNITY_MAX_MEDIA_ITEMS} item`
              : `Media kiriman tidak valid atau melebihi ${COMMUNITY_MAX_MEDIA_ITEMS} item`,
          });
        }
      } else if (segment.photoUrl !== undefined) {
        if (typeof segment.photoUrl !== 'string') {
          return res.status(400).json({ error: 'URL foto tidak valid' });
        }
        media = normalizeCommunityMediaInput(
          [{ type: 'image', url: segment.photoUrl }],
          mediaPrefixes,
          agent.slug,
        );
        if (!media) return res.status(400).json({ error: 'URL foto tidak valid' });
      } else {
        media = [];
      }
      segmentMedia.push(media);
    }
    const media = segmentMedia[0];
    const photoUrl = media.find(item => item.type === 'image')?.url || null;
```

Hapus baris `const requiresMediaSchema = ...` — ia sudah tidak dipakai sejak degradasi pindah ke `createCommunityPostRow`. (Kalau `grep -n requiresMediaSchema server.js` masih menemukan pemakaian lain, biarkan.)

- [ ] **Step 6: Insert berurutan + rollback**

Ganti pemanggilan tunggal `createCommunityPostRow` dari Task 4 dengan loop rantai:

```js
    const chain = buildThreadChain(rawSegments);
    const insertedIds = [];
    let createdPost = null;
    let failure = null;

    for (let i = 0; i < chain.length; i += 1) {
      const link = chain[i];
      const segmentMediaList = segmentMedia[i];
      const { post, error, threadSchemaMissing } = await createCommunityPostRow({
        clientId: link.clientId || undefined,
        agentId: agent.id,
        body: link.body,
        media: segmentMediaList,
        photoUrl: segmentMediaList.find(item => item.type === 'image')?.url || null,
        // Kutipan, link preview, dan @semua adalah milik utas, bukan segmen.
        quotedPostId: i === 0 ? quotedPostId : null,
        mentionsEveryone: i === 0 ? mentionsEveryone : false,
        linkPreview: i === 0 ? linkPreview : null,
        parentPostId: link.parentPostId,
        rootPostId: link.rootPostId,
      });
      if (error) {
        failure = { error, threadSchemaMissing };
        break;
      }
      insertedIds.push(post.id);
      if (i === 0) createdPost = post;
    }

    if (failure) {
      // Semua-atau-tidak-sama-sekali. Aman dihapus permanen: utas ini berumur
      // detik, belum bisa direaksi atau dikomentari siapa pun.
      if (insertedIds.length > 0) {
        const { error: rollbackError } = await supabase
          .from('community_posts')
          .delete()
          .in('id', insertedIds);
        if (rollbackError) {
          // Satu-satunya jalan menuju keadaan tak konsisten. Harus berisik.
          console.error(
            '[community] ROLLBACK UTAS GAGAL — baris yatim perlu dibersihkan manual:',
            insertedIds.join(', '),
            rollbackError.message,
          );
        }
      }
      if (failure.threadSchemaMissing) {
        return res.status(503).json({ error: 'Migrasi utas Teras belum diterapkan' });
      }
      if (failure.error?.code === 'DUPLICATE_CLIENT_ID') {
        return res.status(409).json({ error: 'ID kiriman sudah digunakan' });
      }
      throw failure.error;
    }
```

- [ ] **Step 7: Mention dan pill sekali per utas**

Ganti pemanggilan `recordCommunityMentions` di handler ini dengan versi utas, dan pastikan `bumpCommunityFeedHead` hanya menerima segmen pertama:

```js
    // Pill "kiriman baru" menghitung baris feed, dan feed hanya menampilkan
    // segmen pertama — jadi satu utas menaikkan head sekali.
    bumpCommunityFeedHead(createdPost);

    await recordCommunityMentions({
      segments: chain.map((link, i) => ({
        postId: insertedIds[i],
        body: link.body,
      })),
      authorAgent: agent,
    });
```

- [ ] **Step 8: Sertakan `thread_count` di respons**

Di objek `data` respons, tambahkan satu field:

```js
      thread_count: chain.length > 1 ? chain.length : 0,
```

- [ ] **Step 9: Verifikasi manual**

Restart server (tidak ada hot-reload), lalu:

```bash
# Ganti <TOKEN> dengan JWT dev yang sah.
curl -s -X POST http://localhost:3000/api/community/posts \
  -H 'Content-Type: application/json' -H "Authorization: Bearer <TOKEN>" \
  -d '{"segments":[{"client_id":"11111111-1111-4111-8111-111111111111","body":"Ini konten pertama."},{"client_id":"22222222-2222-4222-8222-222222222222","body":"Ini konten kedua."}]}'
```
Expected: `201` dengan `"thread_count": 2` dan `data.id` = `1111...`.

```bash
curl -s -X POST http://localhost:3000/api/community/posts \
  -H 'Content-Type: application/json' -H "Authorization: Bearer <TOKEN>" \
  -d '{"body":"Kiriman biasa lewat bentuk lama"}'
```
Expected: `201`, `"thread_count": 0` — bentuk lama tidak rusak.

Kalau salah satu membalas 404, servernya basi, bukan rutenya hilang. Bandingkan dengan `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/community/posts -X POST` (tanpa token) — `401` berarti rute hidup.

- [ ] **Step 10: Jalankan tes**

```bash
node --test tests/community-thread-compose.test.js tests/community-thread-feed-guard.test.js tests/community-notifications.test.js tests/community-mentions.test.js
```
Expected: PASS semua

- [ ] **Step 11: Commit**

```bash
git branch --show-current   # harus: main
git add server.js
git commit -m "feat(teras): endpoint kiriman menerima utas (segments[]) dengan rollback"
```

---

### Task 6: `thread_count` di feed dan rantai di halaman detail

**Files:**
- Modify: `server.js` — `GET /api/community/feed` (sekitar 5121–5160), `GET /api/community/posts/:id` (sekitar 5189–5300)

**Interfaces:**
- Consumes: `isCommunityThreadSchemaMissing` (Task 3).
- Produces: field `thread_count: number` pada tiap item feed; field `thread: Array<Post>|null` pada respons detail. Task 9 dan 10 memakainya.

- [ ] **Step 1: Hitung segmen di feed**

Di `GET /api/community/feed`, tepat setelah blok `quoteCounts` yang sudah ada, tambahkan blok sebangun:

```js
    // Jumlah segmen lanjutan tiap utas. Pola yang sama dengan quoteCounts di
    // atas: satu query untuk seluruh halaman, dihitung di aplikasi — tanpa N+1
    // dan tanpa kolom denormalisasi yang bisa basi.
    const threadCounts = new Map(postIds.map(postId => [postId, 0]));
    if (includeThread && postIds.length > 0) {
      const { data: threadRows, error: threadCountError } = await supabase
        .from('community_posts')
        .select('root_post_id')
        .in('root_post_id', postIds)
        .is('deleted_at', null);
      if (threadCountError && !isCommunityThreadSchemaMissing(threadCountError)) {
        throw threadCountError;
      }
      for (const row of threadRows || []) {
        if (threadCounts.has(row.root_post_id)) {
          threadCounts.set(row.root_post_id, threadCounts.get(row.root_post_id) + 1);
        }
      }
    }
```

Di objek yang dikembalikan `posts.map(...)`, tambahkan field. **Perhatikan aritmetikanya:** query menghitung segmen *lanjutan*, jadi total = `count + 1`, dan `0` berarti bukan utas.

```js
        thread_count: threadCounts.get(post.id) ? threadCounts.get(post.id) + 1 : 0,
```

- [ ] **Step 2: Muat rantai di halaman detail**

Di `GET /api/community/posts/:id`, setelah `post` berhasil dimuat dan sebelum respons disusun, tambahkan:

```js
    // Membuka segmen mana pun memberi rantai yang sama. `root_post_id` segmen
    // pertama bernilai NULL, jadi akarnya adalah dirinya sendiri.
    let thread = null;
    const threadRootId = post.root_post_id || post.id;
    const { data: threadRows, error: threadError } = await supabase
      .from('community_posts')
      .select(`id, body, photo_url, media, is_system, created_at, agent_id, agent:agents!community_posts_agent_id_fkey(name, slug, photo)`)
      .or(`id.eq.${threadRootId},root_post_id.eq.${threadRootId}`)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (threadError && !isCommunityThreadSchemaMissing(threadError) && !isCommunityMediaSchemaMissing(threadError)) {
      throw threadError;
    }
    if ((threadRows || []).length > 1) {
      thread = threadRows.map(row => ({
        id: row.id,
        body: row.body,
        media: normalizeStoredCommunityMedia(row.media, row.photo_url),
        created_at: row.created_at,
        agent_id: row.agent_id,
        author: communityAuthorProfile(row.agent),
      }));
    }
```

Agar `post.root_post_id` tersedia, tambahkan kolomnya ke `buildPostQuery` di belakang cabang `includeThread` yang sama polanya dengan `includeQuote`:

```js
    const buildPostQuery = (includeMedia, includeQuote, includeLinkPreview, includeThread) => applyPostIdFilter(
      supabase
        .from('community_posts')
        .select(`id, body, photo_url, ${includeMedia ? 'media, ' : ''}${includeQuote ? 'quoted_post_id, ' : ''}${includeLinkPreview ? 'link_preview, ' : ''}${includeThread ? 'root_post_id, ' : ''}is_system, created_at, agent_id, agent:agents!community_posts_agent_id_fkey(name, slug, photo)`)
        .is('deleted_at', null),
    ).maybeSingle();
```

dan tambahkan `includeThread` ke loop degradasinya persis seperti Task 3 Step 4 (state `let includeThread = true;`, cabang `isCommunityThreadSchemaMissing`, batas loop `attempt < 5`).

Sertakan `thread` di objek respons detail:

```js
      thread,
```

- [ ] **Step 3: Verifikasi manual**

Restart server.

```bash
curl -s "http://localhost:3000/api/community/feed" -H "Authorization: Bearer <TOKEN>" \
  | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; print([(p['id'][:8], p['thread_count']) for p in d][:5])"
```
Expected: utas dari Task 5 muncul **sekali** dengan `thread_count == 2`; kiriman biasa `0`.

```bash
curl -s "http://localhost:3000/api/community/posts/22222222-2222-4222-8222-222222222222" \
  -H "Authorization: Bearer <TOKEN>" \
  | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; print(len(d['thread']), [t['body'] for t in d['thread']])"
```
Expected: `2 ['Ini konten pertama.', 'Ini konten kedua.']` — membuka segmen **kedua** tetap memberi rantai penuh terurut.

- [ ] **Step 4: Commit**

```bash
git branch --show-current   # harus: main
git add server.js
git commit -m "feat(teras): thread_count di feed dan rantai utas di halaman detail"
```

---

### Task 7: Hapus segmen 1 = hapus seluruh utas

**Files:**
- Modify: `server.js` — `DELETE /api/community/posts/:id` (sekitar baris 5820–5850)

**Interfaces:**
- Consumes: `isCommunityThreadSchemaMissing` (Task 3).

Tanpa ini, menghapus segmen 1 meninggalkan segmen sisanya yatim: tak muncul di feed (mereka punya `parent_post_id`) tapi masih hidup di tautan langsung dan di halaman detail.

- [ ] **Step 1: Ambil kolom utas saat memuat kiriman**

Ganti query pencari di handler DELETE:

```js
    const loadPostForDelete = withThread => supabase
      .from('community_posts')
      .select(`id, agent_id, deleted_at${withThread ? ', parent_post_id, root_post_id' : ''}`)
      .eq('id', req.params.id)
      .maybeSingle();
    let { data: post, error: findError } = await loadPostForDelete(true);
    if (isCommunityThreadSchemaMissing(findError)) {
      ({ data: post, error: findError } = await loadPostForDelete(false));
    }
    if (findError) throw findError;
```

- [ ] **Step 2: Perluas soft delete ke seluruh rantai**

Ganti blok `update`:

```js
    // Menghapus segmen pertama menghapus seluruh utas: sisa segmen akan jadi
    // yatim — tak muncul di feed tapi masih hidup di tautan langsung. Segmen
    // tengah dihapus sendirian; rantai tidak disusun ulang, segmen yang hilang
    // cuma tak dirender.
    const deletesWholeThread = post.parent_post_id === null || post.parent_post_id === undefined;
    const patch = {
      deleted_at: new Date().toISOString(),
      deleted_by: agent.id,
    };
    let deleteError;
    if (deletesWholeThread) {
      ({ error: deleteError } = await supabase
        .from('community_posts')
        .update(patch)
        .or(`id.eq.${post.id},root_post_id.eq.${post.id}`)
        .is('deleted_at', null));
      if (isCommunityThreadSchemaMissing(deleteError)) {
        ({ error: deleteError } = await supabase
          .from('community_posts')
          .update(patch)
          .eq('id', post.id)
          .is('deleted_at', null));
      }
    } else {
      ({ error: deleteError } = await supabase
        .from('community_posts')
        .update(patch)
        .eq('id', post.id)
        .is('deleted_at', null));
    }
    if (deleteError) throw deleteError;
```

- [ ] **Step 3: Verifikasi manual**

Restart server. Buat utas 2 segmen (perintah `curl` di Task 5 Step 9 dengan UUID baru), lalu hapus segmen pertamanya:

```bash
curl -s -X DELETE "http://localhost:3000/api/community/posts/<ID_SEGMEN_1>" -H "Authorization: Bearer <TOKEN>"
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:3000/api/community/posts/<ID_SEGMEN_2>" -H "Authorization: Bearer <TOKEN>"
```
Expected: `404` — segmen kedua ikut terhapus, bukan jadi yatim.

- [ ] **Step 4: Commit**

```bash
git branch --show-current   # harus: main
git add server.js
git commit -m "feat(teras): hapus segmen pertama menghapus seluruh utas"
```

---

### Task 8: Composer bersegmen di frontend

**Files:**
- Create: `src/components/teras/ComposerSegment.tsx`
- Modify: `src/components/TerasPage.tsx`

**Interfaces:**
- Consumes: `POST /api/community/posts` dengan `segments[]` (Task 5).
- Produces: — (perubahan UI; Task 10 mengujinya)

`TerasPage.tsx` sudah 4235 baris, jadi render satu segmen dipindah ke berkas sendiri. Orkestrasi (buka/tutup, fokus, unggah, popover mention, submit) tetap di `TerasPage.tsx` supaya `AbortController` dan pembersihan object-URL yang sudah ada tidak terpecah dua.

- [ ] **Step 1: Buat komponen segmen**

Buat `src/components/teras/ComposerSegment.tsx`. Salin markup textarea + toolbar + petak media dari blok composer `TerasPage.tsx` (sekitar baris 2900–2975) apa adanya, lalu bungkus dengan tanda tangan ini:

```tsx
import type { ReactNode } from 'react';

export interface ComposerSegmentValue {
  key: string;
  id: string;
  body: string;
}

interface ComposerSegmentProps {
  index: number;
  total: number;
  value: ComposerSegmentValue;
  maxChars: number;
  disabled: boolean;
  /** Toolbar + petak media dirender induk: keduanya butuh state unggah. */
  toolbar: ReactNode;
  mediaGrid: ReactNode;
  onChange: (index: number, body: string) => void;
  onRemove: (index: number) => void;
  textareaRef?: (element: HTMLTextAreaElement | null) => void;
}

export default function ComposerSegment({
  index, total, value, maxChars, disabled, toolbar, mediaGrid, onChange, onRemove, textareaRef,
}: ComposerSegmentProps) {
  const length = Array.from(value.body.trim()).length;
  const isThread = total > 1;
  return (
    <div className="relative flex gap-3">
      {/* Garis penyambung antar-avatar, seperti utas di Threads. */}
      {isThread && index < total - 1 && (
        <span aria-hidden="true" className="absolute left-[18px] top-11 bottom-0 w-px bg-gray-200 dark:bg-gray-700" />
      )}
      <div className="flex-1 min-w-0">
        {isThread && (
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">{index + 1}/{total}</span>
            {index > 0 && (
              <button
                type="button"
                onClick={() => onRemove(index)}
                disabled={disabled}
                aria-label={`Hapus kiriman ke-${index + 1}`}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={value.body}
          onChange={event => onChange(index, event.target.value)}
          disabled={disabled}
          maxLength={maxChars * 2}
          placeholder={index === 0 ? 'Apa yang ingin dibagikan?' : 'Tambahkan ke utas…'}
          className="w-full resize-none bg-transparent outline-none"
          rows={index === 0 ? 3 : 2}
        />
        {mediaGrid}
        <div className="flex items-center justify-between">
          {toolbar}
          <span className={length > maxChars ? 'text-red-500 text-xs' : 'text-gray-400 text-xs'}>
            {length}/{maxChars}
          </span>
        </div>
      </div>
    </div>
  );
}
```

`placeholder` segmen pertama **wajib** tetap `'Apa yang ingin dibagikan?'` — tes browser mencarinya lewat `COMPOSER_PLACEHOLDER`.

- [ ] **Step 2: Ganti state skalar jadi larik**

Di `TerasPage.tsx` (~baris 1092), ganti `composerBody` dan `composerMedia`:

```tsx
interface ComposerSegmentState {
  key: string;
  id: string;
  body: string;
  media: ComposerMedia[];
}

const MAX_THREAD_SEGMENTS = 5;

function blankComposerSegment(): ComposerSegmentState {
  const id = window.crypto.randomUUID();
  // `key` untuk React, `id` untuk server. `id` dibuat SEKARANG, bukan saat
  // submit — itu yang membuat kirim-ulang setelah rollback idempoten.
  return { key: id, id, body: '', media: [] };
}

const [composerSegments, setComposerSegments] = useState<ComposerSegmentState[]>(
  () => [blankComposerSegment()],
);
```

`composerQuote` dan `composerLinkPreview` **tetap skalar** — keduanya milik segmen pertama.

Perbarui setiap pembacaan lama:
- `composerBody` → `composerSegments[0].body` (deteksi URL link preview, kuota `@semua`, ketergantungan `useEffect`).
- `composerMedia` → `composerSegments[index].media`; `composerMediaRef.current` jadi `ComposerMedia[]` gabungan seluruh segmen (dipakai untuk `URL.revokeObjectURL` saat batal) — pembersihannya harus menyapu semua segmen, bukan satu.
- `composerBodyLength`/`composerCanSubmit` (~2830):

```tsx
  const composerFirstLength = Array.from(composerSegments[0].body.trim()).length;
  const composerOverLimitIndex = composerSegments.findIndex(
    segment => Array.from(segment.body.trim()).length > MAX_COMMUNITY_BODY_CHARS,
  );
  // Segmen bermedia tanpa teks tidak dibuang diam-diam: kiriman Teras selalu
  // wajib berteks, dan membuang media yang sudah diunggah itu kehilangan senyap.
  const composerMediaWithoutTextIndex = composerSegments.findIndex(
    segment => segment.body.trim().length === 0 && segment.media.length > 0,
  );
  const composerCanSubmit = composerFirstLength >= 1
    && composerOverLimitIndex === -1
    && composerMediaWithoutTextIndex === -1
    && !composerBusy;
```

Tampilkan pesan saat `composerMediaWithoutTextIndex !== -1`:
`Segmen ${composerMediaWithoutTextIndex + 1} perlu teks`.

- [ ] **Step 3: Render segmen + tombol "Tambah ke utas"**

Di JSX composer, ganti blok textarea tunggal dengan:

```tsx
{composerSegments.map((segment, index) => (
  <ComposerSegment
    key={segment.key}
    index={index}
    total={composerSegments.length}
    value={segment}
    maxChars={MAX_COMMUNITY_BODY_CHARS}
    disabled={composerBusy}
    toolbar={renderComposerToolbar(index)}
    mediaGrid={renderComposerMedia(index)}
    onChange={handleSegmentChange}
    onRemove={handleSegmentRemove}
    textareaRef={index === 0 ? node => { composerTextareaRef.current = node; } : undefined}
  />
))}
<button
  type="button"
  onClick={handleSegmentAdd}
  disabled={composerBusy || composerSegments.length >= MAX_THREAD_SEGMENTS}
  className="flex items-center gap-2 text-sm text-gray-500 disabled:opacity-50"
>
  <span aria-hidden="true">＋</span>
  {composerSegments.length >= MAX_THREAD_SEGMENTS
    ? `Maksimum ${MAX_THREAD_SEGMENTS} kiriman per utas`
    : 'Tambah ke utas'}
</button>
```

dengan handler:

```tsx
const handleSegmentChange = useCallback((index: number, body: string) => {
  setComposerSegments(current => current.map((segment, i) => (
    i === index ? { ...segment, body } : segment
  )));
}, []);

const handleSegmentAdd = useCallback(() => {
  setComposerSegments(current => (
    current.length >= MAX_THREAD_SEGMENTS ? current : [...current, blankComposerSegment()]
  ));
}, []);

const handleSegmentRemove = useCallback((index: number) => {
  setComposerSegments(current => {
    if (index === 0 || current.length <= 1) return current;
    current[index].media.forEach(item => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    return current.filter((_, i) => i !== index);
  });
}, []);
```

(Nama field pratinjau — `previewUrl` di atas — harus disamakan dengan yang sudah dipakai `resetComposer` sekarang; periksa antarmuka `ComposerMedia` di ~baris 142 dan pakai nama yang ada di sana.)

- [ ] **Step 4: Kunci popover mention per segmen**

Popover mention berkunci `context = 'composer'` (~baris 1114). Ganti jadi `` `composer:${index}` `` di titik buka, pilih, dan tutup. Tanpa ini, menyebut orang di segmen 2 menyisipkan teks ke segmen 1.

- [ ] **Step 5: Perluas konfirmasi buang**

Konfirmasi sudah ada di ~baris 1726 (`'Buang draft kiriman ini?'`), tapi hanya memeriksa satu segmen. Ganti:

```tsx
  const hasComposerContent = composerSegments.some(
    segment => segment.body.trim() || segment.media.length > 0,
  );
  const discardMessage = composerSegments.length > 1
    ? 'Buang utas ini?'
    : 'Buang draft kiriman ini?';
  if (hasComposerContent && !window.confirm(discardMessage)) return;
```

Perbarui daftar dependensi `useCallback`-nya: `[composerSegments, composerBusy, resetComposer]`.

`resetComposer` harus mengembalikan `composerSegments` ke `[blankComposerSegment()]` — bukan larik kosong, karena render mengasumsikan `composerSegments[0]` ada.

- [ ] **Step 6: Kirim sebagai `segments[]`**

Di `handleCreatePost` (~2110), unggah media **semua** segmen lalu susun payload. Ganti pemanggilan `requestJson` ke `/api/community/posts`:

```tsx
      // Segmen benar-benar kosong (tanpa teks DAN tanpa media) dibuang; segmen
      // bermedia tanpa teks sudah dicegah oleh composerCanSubmit.
      const sendable = composerSegments.filter(
        segment => segment.body.trim() || segment.media.length > 0,
      );
      const segmentsPayload = sendable.map((segment, index) => {
        const uploaded = uploadedBySegmentKey.get(segment.key) || [];
        const legacyPhotoUrl = uploaded.find(item => item.type === 'image')?.url;
        return {
          client_id: segment.id,
          body: segment.body.trim(),
          ...(uploaded.length > 0 ? { media: uploaded } : {}),
          ...(index === 0 && legacyPhotoUrl ? { photo_url: legacyPhotoUrl } : {}),
        };
      });

      const created = await requestJson<CommunityPost>(
        '/api/community/posts',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            segments: segmentsPayload,
            ...(composerQuote?.id ? { quoted_post_id: composerQuote.id } : {}),
            ...(composerLinkPreview && segmentsPayload[0].media === undefined && !composerQuote
              ? { link_preview: composerLinkPreview }
              : {}),
          }),
          signal: controller.signal,
        },
        'Gagal membuat kiriman',
      );
```

`uploadedBySegmentKey` dibangun dengan `mapWithConcurrency` yang sudah ada, tapi atas daftar **datar** seluruh media semua segmen — supaya batas konkurensi 2 berlaku untuk keseluruhan, bukan per segmen. Letakkan tepat sebelum `segmentsPayload`, menggantikan pemanggilan `mapWithConcurrency(mediaSnapshot, ...)` yang lama:

```tsx
      // Datar dulu, supaya batas konkurensi berlaku untuk seluruh utas.
      const flatMedia = sendable.flatMap(segment => (
        segment.media.map(item => ({ segmentKey: segment.key, item }))
      ));

      const setItemStatus = (
        segmentKey: string,
        itemId: string,
        patch: Partial<ComposerMedia>,
      ) => {
        setComposerSegments(current => current.map(segment => (
          segment.key !== segmentKey ? segment : {
            ...segment,
            media: segment.media.map(mediaItem => (
              mediaItem.id === itemId ? { ...mediaItem, ...patch } : mediaItem
            )),
          }
        )));
      };

      const uploadedFlat = await mapWithConcurrency(flatMedia, 2, async ({ segmentKey, item }) => {
        if (item.url) return { segmentKey, media: { type: item.type, url: item.url } satisfies CommunityMedia };

        setItemStatus(segmentKey, item.id, { status: 'uploading' });
        const upload = await requestJson<never>(
          '/api/community/media',
          {
            method: 'POST',
            headers: {
              'Content-Type': item.uploadBlob.type,
              'X-Upload-ID': item.uploadId,
              ...getAuthHeaders(),
            },
            body: item.uploadBlob,
            signal: controller.signal,
          },
          `Gagal mengunggah ${item.type === 'video' ? 'video' : 'foto'}`,
          MEDIA_UPLOAD_TIMEOUT_MS,
        );
        if (typeof upload.url !== 'string' || !upload.url) throw new Error('URL media tidak tersedia');
        setItemStatus(segmentKey, item.id, { status: 'ready', url: upload.url, error: undefined });
        return { segmentKey, media: { type: item.type, url: upload.url } satisfies CommunityMedia };
      });

      const uploadedBySegmentKey = new Map<string, CommunityMedia[]>();
      for (const entry of uploadedFlat) {
        const list = uploadedBySegmentKey.get(entry.segmentKey) || [];
        list.push(entry.media);
        uploadedBySegmentKey.set(entry.segmentKey, list);
      }
```

Blok `catch` di bawahnya juga menyentuh `setComposerMedia` untuk menandai item yang tergantung di status `uploading`. Ubah jadi menyapu semua segmen:

```tsx
      setComposerSegments(current => current.map(segment => ({
        ...segment,
        media: segment.media.map(item => (
          item.status === 'uploading' ? { ...item, status: 'ready' as const, error: message } : item
        )),
      })));
```

Field `mentions` di payload lama boleh dihapus: server mengekstrak sebutan dari `body` sendiri dan tidak pernah membaca field itu.

Setelah sukses, `created.data` tetap segmen pertama — logika `setPosts([createdPost, ...])` yang ada tidak berubah. `hasEveryoneMention(body)` jadi `hasEveryoneMention(segmentsPayload[0].body)`.

- [ ] **Step 7: Verifikasi tipe**

Run: `npx tsc --noEmit`
Expected: exit 0, tanpa keluaran

- [ ] **Step 8: Verifikasi di UI**

Jalankan app, buka Teras, buat utas 2 segmen dengan teks. Harus: satu kartu baru di feed, dan `POST /api/community/posts` di tab Network membawa `segments` berisi 2 elemen.

- [ ] **Step 9: Commit**

```bash
git branch --show-current   # harus: main
git add src/components/teras/ComposerSegment.tsx src/components/TerasPage.tsx
git commit -m "feat(teras): composer bersegmen untuk membuat utas"
```

---

### Task 9: Label "Utas · N kiriman" di kartu feed

**Files:**
- Modify: `src/components/TerasCard.tsx`
- Modify: `src/components/TerasPage.tsx` (tipe `CommunityPost`)

**Interfaces:**
- Consumes: `thread_count` dari Task 5 dan Task 6.

- [ ] **Step 1: Tambahkan field ke tipe**

Di antarmuka `CommunityPost` (`TerasPage.tsx`), tambahkan:

```tsx
  /** Total segmen utas ini; 0 berarti kiriman biasa. */
  thread_count?: number;
```

- [ ] **Step 2: Render label**

Di `TerasCard.tsx`, di bawah isi kiriman dan sebelum baris reaksi:

```tsx
{(post.thread_count || 0) > 1 && (
  <button
    type="button"
    onClick={onOpenDetail}
    className="mt-2 text-sm font-medium text-teal-600 hover:underline dark:text-teal-400"
  >
    Utas · {post.thread_count} kiriman
  </button>
)}
```

Pakai nama prop pembuka detail yang sudah ada di `TerasCard` (cari prop yang dipanggil saat kartu diklik); jangan tambahkan prop baru kalau sudah ada.

- [ ] **Step 3: Verifikasi**

Run: `npx tsc --noEmit`
Expected: exit 0

Muat ulang feed: utas dari Task 5 menampilkan "Utas · 2 kiriman"; kiriman biasa tidak menampilkan apa pun.

- [ ] **Step 4: Commit**

```bash
git branch --show-current   # harus: main
git add src/components/TerasCard.tsx src/components/TerasPage.tsx
git commit -m "feat(teras): label utas di kartu feed"
```

---

### Task 10: Rantai di halaman detail + tes browser

**Files:**
- Modify: `src/components/TerasPage.tsx` (tampilan detail)
- Modify: `tests/teras-page.browser.test.js`

**Interfaces:**
- Consumes: field `thread` dari Task 6; composer bersegmen dari Task 8.

- [ ] **Step 1: Render rantai di detail**

Tambahkan field ke tipe respons detail di `TerasPage.tsx`:

```tsx
  /** Seluruh segmen utas, terurut waktu. null bila kiriman biasa. */
  thread?: CommunityPost[] | null;
```

Di tampilan detail, ganti render kartu tunggal dengan rantai. Pakai komponen kartu yang **sudah** dipakai detail — jangan buat render tandingan, supaya reaksi, media, kutipan, dan menu hapus ikut apa adanya:

```tsx
{(() => {
  const chain = detailPost.thread && detailPost.thread.length > 1
    ? detailPost.thread
    : [detailPost];
  return chain.map((segment, index) => (
    <div key={segment.id} className="relative">
      {index < chain.length - 1 && (
        <span
          aria-hidden="true"
          className="absolute left-[18px] top-11 bottom-0 w-px bg-gray-200 dark:bg-gray-700"
        />
      )}
      <div className={segment.id === detailPostId ? 'rounded-xl ring-2 ring-teal-400/40' : undefined}>
        <TerasCard post={segment} {...existingDetailCardProps} />
      </div>
    </div>
  ));
})()}
```

`{...existingDetailCardProps}` bukan literal — salin prop yang sudah diberikan `TerasCard` di tampilan detail sekarang (handler reaksi, hapus, kutip, buka profil). Kalau salah satunya menerima `post.id`, ia otomatis benar per segmen.

Sorotan `ring-2 ring-teal-400/40` menandai segmen yang tautannya diklik. Ia dilepas setelah 1,5 detik:

```tsx
const [highlightSegmentId, setHighlightSegmentId] = useState<string | null>(null);
useEffect(() => {
  if (!detailPostId) return undefined;
  setHighlightSegmentId(detailPostId);
  const timer = window.setTimeout(() => setHighlightSegmentId(null), 1500);
  return () => window.clearTimeout(timer);
}, [detailPostId]);
```

(Pakai `highlightSegmentId` — bukan `detailPostId` — di perbandingan `className` di atas.)

Kolom komentar tetap **satu**, dirender di bawah rantai, dan tetap menempel ke segmen pertama. Ganti id sasaran komentar dari `detailPostId` jadi `chain[0].id` di titik kirim komentar dan pemuatan daftarnya — kalau tidak, membuka segmen ke-3 akan menempelkan komentar ke segmen ke-3.

- [ ] **Step 2: Tulis tes browser yang gagal**

Tambahkan ke `tests/teras-page.browser.test.js`, di dalam `describe` yang sudah ada:

```js
test('composer mengirim utas sebagai segments[]', async () => {
  const app = await openApp();
  try {
    const { page, api } = app;
    await page.getByRole('button', { name: COMPOSER_TRIGGER, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Buat Kiriman' });
    await dialog.waitFor();

    await dialog.getByPlaceholder(COMPOSER_PLACEHOLDER).fill('Ini konten pertama.');
    await dialog.getByRole('button', { name: 'Tambah ke utas' }).click();
    await dialog.getByPlaceholder('Tambahkan ke utas…').fill('Ini konten kedua.');
    await dialog.getByRole('button', { name: 'Kirim kiriman' }).click();
    await dialog.waitFor({ state: 'detached', timeout: 10_000 });

    const [request] = matchingRequests(api, 'POST', '/api/community/posts');
    assert.ok(request, 'kiriman harus terkirim');
    assert.equal(request.body.segments.length, 2);
    assert.deepEqual(
      request.body.segments.map(segment => segment.body),
      ['Ini konten pertama.', 'Ini konten kedua.'],
    );
    assert.ok(
      request.body.segments.every(segment => typeof segment.client_id === 'string'),
      'tiap segmen wajib membawa client_id supaya rantai diketahui sebelum insert',
    );
    assert.notEqual(
      request.body.segments[0].client_id,
      request.body.segments[1].client_id,
    );
  } finally {
    await app.close();
  }
});

test('tombol tambah berhenti di 5 segmen', async () => {
  const app = await openApp();
  try {
    const { page } = app;
    await page.getByRole('button', { name: COMPOSER_TRIGGER, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Buat Kiriman' });
    await dialog.waitFor();
    await dialog.getByPlaceholder(COMPOSER_PLACEHOLDER).fill('Satu');
    for (let i = 0; i < 4; i += 1) {
      await dialog.getByRole('button', { name: 'Tambah ke utas' }).click();
    }
    await dialog.getByRole('button', { name: 'Maksimum 5 kiriman per utas' }).waitFor();
    assert.equal(
      await dialog.getByPlaceholder('Tambahkan ke utas…').count(),
      4,
      '1 segmen awal + 4 tambahan = 5',
    );
  } finally {
    await app.close();
  }
});

test('kiriman satu segmen tetap mengirim satu elemen segments', async () => {
  const app = await openApp();
  try {
    const { page, api } = app;
    await submitTextPost(page, 'Kiriman biasa');
    const [request] = matchingRequests(api, 'POST', '/api/community/posts');
    assert.equal(request.body.segments.length, 1);
    assert.equal(request.body.segments[0].body, 'Kiriman biasa');
  } finally {
    await app.close();
  }
});
```

- [ ] **Step 3: Jalankan tes browser**

Run: `node --test tests/teras-page.browser.test.js`
Expected: PASS — termasuk tiga tes baru dan seluruh tes lama.

Kalau tes lama gagal karena `createCommunityApi` membalas respons `POST /api/community/posts` tanpa `thread_count`, tambahkan `thread_count: 0` di respons palsu itu — bukan mengubah komponen.

- [ ] **Step 4: Verifikasi penuh**

```bash
npx tsc --noEmit
node --test tests/community-thread-compose.test.js tests/community-thread-feed-guard.test.js tests/community-notifications.test.js tests/community-mentions.test.js tests/community-profile-feed.test.js tests/teras-page.browser.test.js
```
Expected: exit 0 dan PASS semua

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # harus: main
git add src/components/TerasPage.tsx tests/teras-page.browser.test.js
git commit -m "feat(teras): rantai utas di halaman detail + tes browser composer"
```

---

## Catatan penutup untuk pelaksana

- Urutan penerapan di produksi: **migrasi (Task 1) dulu**, baru deploy kode. Task 3 memasang satu filter tanpa jalan mundur (`broadcastQuery`), jadi lonceng akan gagal kalau kode mendarat lebih dulu.
- Kalau `console.error('[community] ROLLBACK UTAS GAGAL ...')` pernah muncul di log, id yang tercatat di situ adalah baris yatim yang perlu dihapus manual. Itu satu-satunya keadaan tak konsisten yang mungkin.
- Spec komentar-jadi-kiriman-penuh akan menyentuh query yang sama. `tests/community-thread-feed-guard.test.js` sengaja dibuat agar gagal saat itu terjadi — **perbarui daftarnya, jangan hapus tesnya**.
