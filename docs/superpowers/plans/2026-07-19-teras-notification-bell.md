# Bell Notifikasi Teras — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pindahkan indikator `@sebutan` dari baris composer Teras ke bell notifikasi di header dashboard, dan perluas isinya jadi tiga jenis event (sebutan, komentar di postinganku, reaksi di postinganku).

**Architecture:** Notifikasi **diturunkan** dari tabel yang sudah ada (`community_mentions`, `community_post_comments`, `community_post_reactions`) lewat tiga query paralel yang digabung oleh modul murni `lib/community-notifications.js`. Tidak ada tabel baru dan tidak ada DDL. Status baca memakai watermark tunggal per agent yang disimpan di `agents.notification_prefs.teras_notif_seen_at` (kolom jsonb yang sudah ada). Di klien, satu hook di `DashboardLayout` memegang polling dan mengumpani komponen bell yang dirender di dua header.

**Tech Stack:** Node 20 ESM + Express (`server.js`), Supabase JS client (PostgREST), React 18 + TypeScript + Vite, Tailwind, lucide-react, `node:test`, Playwright.

Spec: `docs/superpowers/specs/2026-07-19-teras-notification-bell-design.md`

## Global Constraints

- **Tanpa DDL.** Tidak boleh ada `CREATE TABLE` / `ALTER TABLE` / file migrasi baru. DB lokal menunjuk ke produksi dan DDL hanya bisa dijalankan pemilik proyek lewat Supabase SQL Editor.
- **Jangan menulis ke DB produksi saat menguji.** Verifikasi memakai tes murni + Playwright dengan `page.route` yang me-mock `**/api/**`. Dilarang menjalankan skrip yang membuat post/komentar/reaksi sungguhan.
- **Repo memakai ESM** (`"type": "module"`): `import`/`export`, bukan `require`.
- **Bahasa UI Indonesia.** Teks persis: judul panel `Notifikasi`, kosong `Belum ada notifikasi.`, memuat `Memuat…` (ellipsis satu karakter), galat `Gagal memuat notifikasi.`, label tombol `Notifikasi`.
- **Warna aksen** `emerald` (badge `bg-emerald-500`, teks putih), konsisten dengan popover mention yang digantikan.
- **Batas:** daftar maksimum **30** item, badge di-cap **99** di server dan ditampilkan `9+` di UI bila > 9.
- **Kunci watermark:** `teras_notif_seen_at`, nilai ISO string.
- **Jangan menyentuh** jalur *menulis* mention: `extractCommunityMentions`, `recordCommunityMentions`, autocomplete, pill, nudge Telegram.
- **Verifikasi FE:** `npx tsc --noEmit` dan `npx vite build`. Jangan jalankan `npm run lint` (eslint v10 belum dikonfigurasi di repo ini; selalu gagal karena config, bukan karena kode).
- **Nomor baris dalam plan ini bisa bergeser** — pemilik proyek sedang mengedit `TerasPage.tsx` di sesi lain. Selalu cari lewat string anchor yang dikutip, bukan lewat nomor baris.
- **Sebelum tiap `git commit`:** jalankan `git branch --show-current` dan pastikan hasilnya `main`. Selalu `git add` file spesifik, jangan `git add -A` — ada perubahan tak-terkait milik pemilik proyek di working tree.

---

## File Structure

| File | Tanggung jawab |
|---|---|
| `lib/community-notifications.js` (baru) | Modul murni: grup reaksi, gabung 3 sumber, tandai unread, hitung badge. Tanpa I/O. |
| `tests/community-notifications.test.js` (baru) | Tes `node:test` untuk modul murni di atas. |
| `server.js` (ubah) | Tiga endpoint baru `/api/community/notifications*`, dua helper watermark, dan (di tugas terakhir) penghapusan trio `/api/community/mentions*`. |
| `src/lib/communityNotifications.ts` (baru) | Tipe item bersama, `formatNotificationText`, dan `timeAgo` yang dipindah dari `TerasPage.tsx`. |
| `src/hooks/useTerasNotifications.ts` (baru) | Polling head, muat daftar, kirim seen, state badge/panel. |
| `src/components/NotificationBell.tsx` (baru) | Tombol + badge + panel dropdown. Presentational. |
| `src/components/DashboardLayout.tsx` (ubah) | Memanggil hook sekali, merender bell di dua header di kiri toggle tema. |
| `src/components/TerasPage.tsx` (ubah) | Menghapus state, polling, dan JSX inbox mention; mengimpor `timeAgo` dari lokasi barunya. |
| `tests/teras-notification-bell.browser.test.js` (baru) | Tes Playwright: badge, buka panel, navigasi ke detail post. |

---

## Task 1: Modul murni `lib/community-notifications.js`

**Files:**
- Create: `lib/community-notifications.js`
- Test: `tests/community-notifications.test.js`

**Interfaces:**
- Consumes: tidak ada.
- Produces:
  - `NOTIFICATION_LIMIT = 30`, `NOTIFICATION_BADGE_CAP = 99`
  - `groupReactionRows(rows) -> Array<{ post_id, created_at, actor, actor_count, snippet }>`
  - `mergeNotifications({ mentions, comments, reactions }, seenAt, limit = NOTIFICATION_LIMIT) -> Array<Item>`
  - `countUnreadNotifications({ mentions, comments, reactions }) -> number`

Bentuk baris masukan (server yang menormalkan dari DB sebelum memanggil):

```js
// mention: { id, post_id, comment_id, created_at, actor: { name, photo }, snippet }
// comment: { id, post_id, created_at, actor: { name, photo }, snippet }
// reaction: { post_id, agent_id, created_at, actor: { name, photo }, snippet }
```

Bentuk `Item` keluaran:

```js
// { id, type: 'mention'|'comment'|'reaction', post_id, actor, actor_count, snippet, created_at, unread }
```

- [ ] **Step 1: Tulis tes yang gagal**

Buat `tests/community-notifications.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  groupReactionRows,
  mergeNotifications,
  countUnreadNotifications,
} from '../lib/community-notifications.js';

const actor = (name) => ({ name, photo: `https://cdn.test/${name}.jpg` });

test('groups reactions per post, newest actor wins, unique actors counted', () => {
  const grouped = groupReactionRows([
    { post_id: 'p1', agent_id: 'a1', created_at: '2026-07-19T10:00:00Z', actor: actor('Rina'), snippet: 'Post satu' },
    { post_id: 'p1', agent_id: 'a2', created_at: '2026-07-19T12:00:00Z', actor: actor('Budi'), snippet: 'Post satu' },
    { post_id: 'p1', agent_id: 'a2', created_at: '2026-07-19T11:00:00Z', actor: actor('Budi'), snippet: 'Post satu' },
    { post_id: 'p2', agent_id: 'a3', created_at: '2026-07-19T09:00:00Z', actor: actor('Sari'), snippet: 'Post dua' },
  ]);

  assert.equal(grouped.length, 2);
  const p1 = grouped.find(row => row.post_id === 'p1');
  assert.equal(p1.created_at, '2026-07-19T12:00:00Z');
  assert.equal(p1.actor.name, 'Budi', 'aktor terbaru yang ditampilkan');
  assert.equal(p1.actor_count, 2, 'agent yang sama tidak dihitung dua kali');
});

test('merges three sources, newest first, and flags unread against the watermark', () => {
  const items = mergeNotifications({
    mentions: [{ id: 'm1', post_id: 'p1', comment_id: null, created_at: '2026-07-19T08:00:00Z', actor: actor('Rina'), snippet: 'halo @bagas' }],
    comments: [{ id: 'c1', post_id: 'p2', created_at: '2026-07-19T12:00:00Z', actor: actor('Budi'), snippet: 'mantap' }],
    reactions: [{ post_id: 'p3', agent_id: 'a3', created_at: '2026-07-19T10:00:00Z', actor: actor('Sari'), snippet: 'Post tiga' }],
  }, '2026-07-19T09:00:00Z');

  assert.deepEqual(items.map(i => i.type), ['comment', 'reaction', 'mention']);
  assert.deepEqual(items.map(i => i.unread), [true, true, false]);
  assert.deepEqual(items.map(i => i.id), ['comment:c1', 'reaction:p3', 'mention:m1']);
  assert.equal(items[1].actor_count, 1);
});

test('treats every item as unread when the watermark is missing', () => {
  const items = mergeNotifications({
    mentions: [{ id: 'm1', post_id: 'p1', comment_id: 'k1', created_at: '2020-01-01T00:00:00Z', actor: actor('Rina'), snippet: 'lama' }],
    comments: [],
    reactions: [],
  }, null);

  assert.deepEqual(items.map(i => i.unread), [true]);
});

test('caps the merged list at the limit, keeping the newest', () => {
  const comments = Array.from({ length: 40 }, (_, i) => ({
    id: `c${i}`,
    post_id: 'p1',
    created_at: `2026-07-19T${String(i % 24).padStart(2, '0')}:00:00Z`,
    actor: actor('Budi'),
    snippet: `komentar ${i}`,
  }));

  const items = mergeNotifications({ mentions: [], comments, reactions: [] }, null, 30);
  assert.equal(items.length, 30);
  assert.equal(items[0].created_at, '2026-07-19T23:00:00Z');
});

test('counts unread with reactions grouped per post and caps at 99', () => {
  assert.equal(countUnreadNotifications({
    mentions: [{ id: 'm1' }],
    comments: [{ id: 'c1' }, { id: 'c2' }],
    reactions: [
      { post_id: 'p1', agent_id: 'a1', created_at: '2026-07-19T10:00:00Z', actor: actor('Rina'), snippet: 'x' },
      { post_id: 'p1', agent_id: 'a2', created_at: '2026-07-19T11:00:00Z', actor: actor('Budi'), snippet: 'x' },
    ],
  }), 4, '1 mention + 2 komentar + 1 post yang direaksi');

  const many = Array.from({ length: 150 }, (_, i) => ({ id: `c${i}` }));
  assert.equal(countUnreadNotifications({ mentions: [], comments: many, reactions: [] }), 99);
});

test('tolerates missing sources', () => {
  assert.deepEqual(mergeNotifications({}, null), []);
  assert.equal(countUnreadNotifications({}), 0);
});
```

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `node --test tests/community-notifications.test.js`
Expected: FAIL — `Cannot find module '.../lib/community-notifications.js'`

- [ ] **Step 3: Tulis implementasi minimal**

Buat `lib/community-notifications.js`:

```js
/**
 * Pure helpers for the Teras notification bell.
 *
 * Notifications are derived, not fanned out: the server reads three existing
 * tables (mentions, comments on my posts, reactions on my posts) and hands the
 * raw rows to these helpers, which merge them into one feed. Keeping the merge
 * rules here means they are testable without a database — and swapping the
 * derived model for a fan-out table later would not change this contract.
 */

export const NOTIFICATION_LIMIT = 30;
export const NOTIFICATION_BADGE_CAP = 99;

function toTime(value) {
  const time = new Date(value || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/**
 * Collapse reaction rows into one entry per post: newest actor is the face,
 * distinct actors are the count. A single post reacted to by five agents is
 * one notification, not five.
 */
export function groupReactionRows(rows) {
  const byPost = new Map();
  for (const row of rows || []) {
    if (!row?.post_id) continue;
    const existing = byPost.get(row.post_id);
    if (!existing) {
      byPost.set(row.post_id, {
        post_id: row.post_id,
        created_at: row.created_at,
        actor: row.actor || null,
        snippet: row.snippet || '',
        actors: new Set(row.agent_id ? [row.agent_id] : []),
      });
      continue;
    }
    if (row.agent_id) existing.actors.add(row.agent_id);
    if (toTime(row.created_at) > toTime(existing.created_at)) {
      existing.created_at = row.created_at;
      existing.actor = row.actor || existing.actor;
    }
  }
  return [...byPost.values()].map(entry => ({
    post_id: entry.post_id,
    created_at: entry.created_at,
    actor: entry.actor,
    actor_count: Math.max(1, entry.actors.size),
    snippet: entry.snippet,
  }));
}

/**
 * @param {{mentions?: object[], comments?: object[], reactions?: object[]}} sources
 * @param {string|null} seenAt  watermark; rows newer than this are unread
 * @param {number} [limit=NOTIFICATION_LIMIT]
 */
export function mergeNotifications(sources, seenAt, limit = NOTIFICATION_LIMIT) {
  const seenTime = seenAt ? toTime(seenAt) : 0;
  const items = [];

  for (const row of sources?.mentions || []) {
    items.push({
      id: `mention:${row.id}`,
      type: 'mention',
      post_id: row.post_id,
      comment_id: row.comment_id || null,
      actor: row.actor || null,
      actor_count: 1,
      snippet: row.snippet || '',
      created_at: row.created_at,
      unread: toTime(row.created_at) > seenTime,
    });
  }

  for (const row of sources?.comments || []) {
    items.push({
      id: `comment:${row.id}`,
      type: 'comment',
      post_id: row.post_id,
      comment_id: row.id,
      actor: row.actor || null,
      actor_count: 1,
      snippet: row.snippet || '',
      created_at: row.created_at,
      unread: toTime(row.created_at) > seenTime,
    });
  }

  for (const row of groupReactionRows(sources?.reactions)) {
    items.push({
      id: `reaction:${row.post_id}`,
      type: 'reaction',
      post_id: row.post_id,
      comment_id: null,
      actor: row.actor,
      actor_count: row.actor_count,
      snippet: row.snippet,
      created_at: row.created_at,
      unread: toTime(row.created_at) > seenTime,
    });
  }

  items.sort((a, b) => toTime(b.created_at) - toTime(a.created_at));
  return items.slice(0, limit);
}

/**
 * Badge count. The caller has already filtered each source to rows newer than
 * the watermark, so everything passed in counts — reactions after grouping.
 */
export function countUnreadNotifications(sources) {
  const total = (sources?.mentions || []).length
    + (sources?.comments || []).length
    + groupReactionRows(sources?.reactions).length;
  return Math.min(NOTIFICATION_BADGE_CAP, Math.max(0, total));
}
```

- [ ] **Step 4: Jalankan tes, pastikan lulus**

Run: `node --test tests/community-notifications.test.js`
Expected: PASS, 6 tes lulus.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # harus: main
git add lib/community-notifications.js tests/community-notifications.test.js
git commit -m "feat(teras): helper murni penggabung notifikasi"
```

---

## Task 2: Endpoint `/api/community/notifications*`

**Files:**
- Modify: `server.js` — sisipkan tepat **sebelum** baris `app.get('/api/community/feed/head'`, dan tambahkan import.

**Interfaces:**
- Consumes: `mergeNotifications`, `countUnreadNotifications`, `NOTIFICATION_LIMIT` dari Task 1; helper `server.js` yang sudah ada: `getAgentById`, `requireCommunityAccess`, `dbLoadShedGuard`, `authMiddleware`, `communityAuthorProfile`, `communityMentionSnippet`, `isCommunityMentionSchemaMissing`, `supabase`.
- Produces: tiga endpoint HTTP yang dipakai Task 4.

Tidak ada tes otomatis di tugas ini — jalur ini murni I/O Supabase; logikanya sudah diuji di Task 1 dan perilaku ujung-ke-ujungnya diuji di Task 7. Verifikasinya: server menyala tanpa galat.

- [ ] **Step 1: Tambahkan import modul murni**

Cari blok import `./lib/community-mentions.js` di `server.js` dan tambahkan setelahnya:

```js
import {
  mergeNotifications,
  countUnreadNotifications,
  NOTIFICATION_LIMIT,
} from './lib/community-notifications.js';
```

- [ ] **Step 2: Tambahkan helper watermark + pembaca sumber**

Sisipkan tepat sebelum `app.get('/api/community/feed/head'`:

```js
const TERAS_NOTIF_SEEN_KEY = 'teras_notif_seen_at';
// Head polling reads at most this many rows per source; the badge caps at 99
// anyway, so a bigger window would only cost bandwidth.
const NOTIFICATION_SCAN_LIMIT = 120;

// Read the watermark straight from the row, not from the TTL agent cache —
// a stale cache here would make the badge reappear right after it was cleared.
async function readTerasNotifSeenAt(agentId) {
  const { data, error } = await supabase
    .from('agents')
    .select('notification_prefs')
    .eq('id', agentId)
    .single();
  if (error) throw error;
  const value = (data?.notification_prefs || {})[TERAS_NOTIF_SEEN_KEY];
  return typeof value === 'string' && value ? value : null;
}

async function writeTerasNotifSeenAt(agentId, iso) {
  const { data, error } = await supabase
    .from('agents')
    .select('notification_prefs')
    .eq('id', agentId)
    .single();
  if (error) throw error;
  const merged = { ...(data?.notification_prefs || {}), [TERAS_NOTIF_SEEN_KEY]: iso };
  const { error: updateError } = await supabase
    .from('agents')
    .update({ notification_prefs: merged })
    .eq('id', agentId);
  if (updateError) throw updateError;
}

// Fetch the three sources in parallel. `since` narrows every source to rows
// newer than the watermark (badge path); pass null to fetch the latest N
// regardless (list path). Mentions tolerate a missing table so the bell still
// works on an environment where the mention migration was never applied.
async function loadTerasNotificationSources(agent, { since, limit }) {
  const mentionQuery = supabase
    .from('community_mentions')
    .select(`id, post_id, comment_id, created_at,
      author:agents!community_mentions_author_agent_id_fkey(name, photo),
      post:community_posts!community_mentions_post_id_fkey(body, deleted_at),
      comment:community_post_comments!community_mentions_comment_id_fkey(body, deleted_at)`)
    .eq('mentioned_agent_id', agent.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  const commentQuery = supabase
    .from('community_post_comments')
    .select(`id, post_id, created_at, body,
      author:agents(name, photo),
      post:community_posts!inner(agent_id, deleted_at)`)
    .eq('post.agent_id', agent.id)
    .neq('agent_id', agent.id)
    .is('deleted_at', null)
    .is('post.deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  const reactionQuery = supabase
    .from('community_post_reactions')
    .select(`post_id, agent_id, created_at,
      author:agents(name, photo),
      post:community_posts!inner(agent_id, body, deleted_at)`)
    .eq('post.agent_id', agent.id)
    .neq('agent_id', agent.id)
    .is('post.deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (since) {
    mentionQuery.gt('created_at', since);
    commentQuery.gt('created_at', since);
    reactionQuery.gt('created_at', since);
  }

  const [mentionResult, commentResult, reactionResult] = await Promise.all([
    mentionQuery, commentQuery, reactionQuery,
  ]);

  if (mentionResult.error && !isCommunityMentionSchemaMissing(mentionResult.error)) {
    throw mentionResult.error;
  }
  if (commentResult.error) throw commentResult.error;
  if (reactionResult.error) throw reactionResult.error;

  const mentions = (mentionResult.error ? [] : (mentionResult.data || []))
    .map(row => {
      const source = row.comment_id ? row.comment : row.post;
      if (!source || source.deleted_at) return null; // hide mentions on deleted content
      return {
        id: row.id,
        post_id: row.post_id,
        comment_id: row.comment_id,
        created_at: row.created_at,
        actor: communityAuthorProfile(row.author),
        snippet: communityMentionSnippet(source.body, 140),
      };
    })
    .filter(Boolean);

  const comments = (commentResult.data || []).map(row => ({
    id: row.id,
    post_id: row.post_id,
    created_at: row.created_at,
    actor: communityAuthorProfile(row.author),
    snippet: communityMentionSnippet(row.body, 140),
  }));

  const reactions = (reactionResult.data || []).map(row => ({
    post_id: row.post_id,
    agent_id: row.agent_id,
    created_at: row.created_at,
    actor: communityAuthorProfile(row.author),
    snippet: communityMentionSnippet(row.post?.body, 140),
  }));

  return { mentions, comments, reactions };
}
```

- [ ] **Step 3: Tambahkan tiga endpoint**

Sisipkan tepat setelah helper di Step 2:

```js
app.get('/api/community/notifications/head', dbLoadShedGuard, authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentById(req.user.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (!requireCommunityAccess(agent, res)) return;

    const seenAt = await readTerasNotifSeenAt(agent.id);
    const sources = await loadTerasNotificationSources(agent, {
      since: seenAt,
      limit: NOTIFICATION_SCAN_LIMIT,
    });
    res.json({ success: true, data: { unread_count: countUnreadNotifications(sources) } });
  } catch (err) {
    console.error('[community] notifications head error:', err);
    res.status(500).json({ error: 'Gagal memeriksa notifikasi' });
  }
});

app.get('/api/community/notifications', dbLoadShedGuard, authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentById(req.user.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (!requireCommunityAccess(agent, res)) return;

    const seenAt = await readTerasNotifSeenAt(agent.id);
    const sources = await loadTerasNotificationSources(agent, {
      since: null,
      limit: NOTIFICATION_LIMIT,
    });
    res.json({
      success: true,
      data: { items: mergeNotifications(sources, seenAt, NOTIFICATION_LIMIT), seen_at: seenAt },
    });
  } catch (err) {
    console.error('[community] notifications list error:', err);
    res.status(500).json({ error: 'Gagal memuat notifikasi' });
  }
});

app.post('/api/community/notifications/seen', authMiddleware, express.json({ limit: '1kb' }), async (req, res) => {
  try {
    const agent = await getAgentById(req.user.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (!requireCommunityAccess(agent, res)) return;
    await writeTerasNotifSeenAt(agent.id, new Date().toISOString());
    res.json({ success: true });
  } catch (err) {
    console.error('[community] notifications seen error:', err);
    res.status(500).json({ error: 'Gagal memperbarui notifikasi' });
  }
});
```

- [ ] **Step 4: Verifikasi server memuat tanpa galat**

Run: `node --check server.js`
Expected: keluar tanpa output (sintaks valid).

Run: `node --test tests/community-mentions.test.js tests/community-access.test.js`
Expected: PASS — jalur mention lama tidak tersenggol.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # harus: main
git add server.js
git commit -m "feat(teras): endpoint notifikasi turunan (sebutan + komentar + reaksi)"
```

---

## Task 3: Lib klien `src/lib/communityNotifications.ts`

**Files:**
- Create: `src/lib/communityNotifications.ts`
- Modify: `src/components/TerasPage.tsx` — hapus definisi lokal `timeAgo`, impor dari lib baru.

**Interfaces:**
- Consumes: bentuk item dari Task 2.
- Produces:
  - `type TerasNotificationType = 'mention' | 'comment' | 'reaction'`
  - `interface TerasNotification { id; type; post_id; comment_id: string | null; actor: { name: string; photo?: string | null } | null; actor_count: number; snippet: string; created_at: string; unread: boolean }`
  - `formatNotificationText(item: TerasNotification): string`
  - `timeAgo(iso: string): string`

- [ ] **Step 1: Buat lib klien**

Buat `src/lib/communityNotifications.ts`:

```ts
export type TerasNotificationType = 'mention' | 'comment' | 'reaction';

export interface TerasNotificationActor {
  name: string;
  photo?: string | null;
}

export interface TerasNotification {
  id: string;
  type: TerasNotificationType;
  post_id: string;
  comment_id: string | null;
  actor: TerasNotificationActor | null;
  actor_count: number;
  snippet: string;
  created_at: string;
  unread: boolean;
}

/**
 * The sentence shown next to the avatar. The actor name is included here (not
 * bolded separately) so the panel stays one text node per item — the bell is a
 * glanceable list, not a rich feed.
 */
export function formatNotificationText(item: TerasNotification): string {
  const actor = item.actor?.name?.trim() || 'Seseorang';
  if (item.type === 'mention') {
    return item.comment_id ? `${actor} membalas menyebutmu` : `${actor} menyebutmu`;
  }
  if (item.type === 'comment') {
    return `${actor} berkomentar di postinganmu`;
  }
  const others = Math.max(0, item.actor_count - 1);
  return others > 0
    ? `${actor} & ${others} lainnya menyukai postinganmu`
    : `${actor} menyukai postinganmu`;
}

/** Relative Indonesian timestamp; moved here from TerasPage so the bell can share it. */
export function timeAgo(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const elapsed = Math.max(0, Date.now() - date.getTime());
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (elapsed < minute) return 'Baru saja';
  if (elapsed < hour) return `${Math.floor(elapsed / minute)} menit`;
  if (elapsed < day) return `${Math.floor(elapsed / hour)} jam`;
  if (elapsed <= 7 * day) return `${Math.floor(elapsed / day)} hari`;

  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date).replace(/\./g, '');
}
```

- [ ] **Step 2: Pindahkan `timeAgo` di TerasPage ke impor**

Di `src/components/TerasPage.tsx`, hapus seluruh definisi fungsi yang diawali baris `function timeAgo(iso: string): string {` sampai kurung tutupnya (fungsi ini persis sama dengan yang baru saja dipindah), lalu tambahkan impor di dekat impor `src/lib` lainnya:

```ts
import { timeAgo } from '../lib/communityNotifications';
```

- [ ] **Step 3: Verifikasi tipe & build**

Run: `npx tsc --noEmit`
Expected: keluar tanpa galat (khususnya tidak ada `Cannot find name 'timeAgo'`).

- [ ] **Step 4: Commit**

```bash
git branch --show-current   # harus: main
git add src/lib/communityNotifications.ts src/components/TerasPage.tsx
git commit -m "refactor(teras): lib klien notifikasi + pindahkan timeAgo"
```

---

## Task 4: Hook `useTerasNotifications`

**Files:**
- Create: `src/hooks/useTerasNotifications.ts`

**Interfaces:**
- Consumes: `TerasNotification` dari Task 3; endpoint dari Task 2; `getAuthHeaders` dari `../components/LoginPage`.
- Produces:

```ts
useTerasNotifications(enabled: boolean): {
  unread: number;
  open: boolean;
  items: TerasNotification[];
  loading: boolean;
  error: string | null;
  openPanel: () => void;
  closePanel: () => void;
}
```

- [ ] **Step 1: Tulis hook**

Buat `src/hooks/useTerasNotifications.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';

import { getAuthHeaders } from '../components/LoginPage';
import type { TerasNotification } from '../lib/communityNotifications';

const HEAD_POLL_INTERVAL_MS = 30_000;

interface Envelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

async function getJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url, { headers: getAuthHeaders() });
  const payload = (await response.json()) as Envelope<T>;
  if (!response.ok || payload.success === false) return null;
  return payload.data ?? null;
}

/**
 * Owns the bell's state. Called ONCE from DashboardLayout — the bell renders in
 * two mutually exclusive headers, and polling from the component would double
 * the request rate the day both are ever on screen together.
 */
export function useTerasNotifications(enabled: boolean) {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<TerasNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openRef = useRef(false);

  const checkHead = useCallback(async () => {
    if (!enabled || document.visibilityState !== 'visible') return;
    try {
      const data = await getJson<{ unread_count: number }>('/api/community/notifications/head');
      if (typeof data?.unread_count === 'number' && !openRef.current) setUnread(data.unread_count);
    } catch {
      /* silent — the badge keeps its last value until the next poll */
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void checkHead();
    const interval = window.setInterval(() => { void checkHead(); }, HEAD_POLL_INTERVAL_MS);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void checkHead();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [enabled, checkHead]);

  const closePanel = useCallback(() => {
    openRef.current = false;
    setOpen(false);
  }, []);

  const openPanel = useCallback(async () => {
    openRef.current = true;
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const data = await getJson<{ items: TerasNotification[] }>('/api/community/notifications');
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setError('Gagal memuat notifikasi.');
    } finally {
      setLoading(false);
    }
    // Opening the panel clears the badge; the server stamps the watermark. A
    // failed stamp is not rolled back — the next head poll corrects it.
    setUnread(0);
    void fetch('/api/community/notifications/seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: '{}',
    }).catch(() => {});
  }, []);

  return {
    unread,
    open,
    items,
    loading,
    error,
    openPanel: useCallback(() => { void openPanel(); }, [openPanel]),
    closePanel,
  };
}
```

- [ ] **Step 2: Verifikasi tipe**

Run: `npx tsc --noEmit`
Expected: keluar tanpa galat.

- [ ] **Step 3: Commit**

```bash
git branch --show-current   # harus: main
git add src/hooks/useTerasNotifications.ts
git commit -m "feat(teras): hook state bell notifikasi"
```

---

## Task 5: Komponen `NotificationBell`

**Files:**
- Create: `src/components/NotificationBell.tsx`

**Interfaces:**
- Consumes: `TerasNotification`, `formatNotificationText`, `timeAgo` (Task 3); `handleAgentPhotoError` dari `../lib/agent-photo`.
- Produces:

```ts
<NotificationBell
  compact={boolean}          // header sub-halaman saat tab Teras aktif
  unread={number}
  open={boolean}
  items={TerasNotification[]}
  loading={boolean}
  error={string | null}
  onOpen={() => void}
  onClose={() => void}
  onOpenPost={(postId: string) => void}
/>
```

- [ ] **Step 1: Tulis komponen**

Buat `src/components/NotificationBell.tsx`:

```tsx
import { AtSign, Bell, Heart, MessageCircle, X } from 'lucide-react';
import { useEffect } from 'react';

import { handleAgentPhotoError } from '../lib/agent-photo';
import { formatNotificationText, timeAgo, type TerasNotification } from '../lib/communityNotifications';

const TYPE_ICON = {
  mention: AtSign,
  comment: MessageCircle,
  reaction: Heart,
} as const;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('') || '?';
}

function ActorAvatar({ name, photo }: { name: string; photo?: string | null }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-100 text-[9px] font-bold text-emerald-700 ring-1 ring-black/[0.06] dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-white/10">
      {photo ? (
        <img
          src={photo}
          alt=""
          className="h-full w-full object-cover"
          onError={event => handleAgentPhotoError(event.currentTarget, name, 28)}
        />
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
    </span>
  );
}

export default function NotificationBell({
  compact,
  unread,
  open,
  items,
  loading,
  error,
  onOpen,
  onClose,
  onOpenPost,
}: {
  compact?: boolean;
  unread: number;
  open: boolean;
  items: TerasNotification[];
  loading: boolean;
  error: string | null;
  onOpen: () => void;
  onClose: () => void;
  onOpenPost: (postId: string) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => (open ? onClose() : onOpen())}
        aria-label="Notifikasi"
        aria-expanded={open}
        title="Notifikasi"
        className={`relative flex shrink-0 items-center justify-center bg-gray-100/80 text-gray-500 transition-colors hover:bg-gray-200 active:scale-95 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700 ${compact ? 'h-8 w-8 rounded-lg' : 'h-9 w-9 rounded-xl'}`}
      >
        <Bell size={compact ? 14 : 16} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold leading-none text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={onClose}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="dialog"
            aria-label="Notifikasi"
            className="absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-gray-200 bg-white text-left shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5 dark:border-slate-800">
              <p className="text-[13px] font-bold text-gray-900 dark:text-white">Notifikasi</p>
              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup"
                className="text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto overscroll-contain">
              {loading ? (
                <p className="px-4 py-6 text-center text-[12px] text-gray-400 dark:text-slate-500">Memuat…</p>
              ) : error ? (
                <p className="px-4 py-6 text-center text-[12px] text-gray-400 dark:text-slate-500">{error}</p>
              ) : items.length === 0 ? (
                <p className="px-4 py-6 text-center text-[12px] text-gray-400 dark:text-slate-500">Belum ada notifikasi.</p>
              ) : (
                items.map(item => {
                  const TypeIcon = TYPE_ICON[item.type];
                  const actorName = item.actor?.name || 'Seseorang';
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => { onClose(); onOpenPost(item.post_id); }}
                      className={`flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/60 ${item.unread ? 'bg-emerald-50/60 dark:bg-emerald-900/15' : ''}`}
                    >
                      <span className="relative">
                        <ActorAvatar name={actorName} photo={item.actor?.photo} />
                        <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-emerald-600 ring-1 ring-gray-200 dark:bg-slate-900 dark:text-emerald-400 dark:ring-slate-700">
                          <TypeIcon size={9} strokeWidth={2.4} />
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] leading-snug text-gray-700 dark:text-slate-200">
                          {formatNotificationText(item)}
                        </span>
                        <span className="mt-0.5 block truncate text-[11.5px] text-gray-500 dark:text-slate-400">{item.snippet}</span>
                        <span className="mt-0.5 block text-[10.5px] text-gray-400 dark:text-slate-500">{timeAgo(item.created_at)}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verifikasi tipe & build**

Run: `npx tsc --noEmit && npx vite build`
Expected: keduanya sukses.

- [ ] **Step 3: Commit**

```bash
git branch --show-current   # harus: main
git add src/components/NotificationBell.tsx
git commit -m "feat(teras): komponen bell notifikasi"
```

---

## Task 6: Pasang bell di dua header DashboardLayout

**Files:**
- Modify: `src/components/DashboardLayout.tsx`

**Interfaces:**
- Consumes: `useTerasNotifications` (Task 4), `NotificationBell` (Task 5), `terasEnabled` dan `navigatePath` yang sudah ada di file ini.
- Produces: bell yang tampil di seluruh halaman dashboard.

- [ ] **Step 1: Impor hook dan komponen**

Tambahkan di blok impor `src/components/DashboardLayout.tsx`:

```tsx
import NotificationBell from './NotificationBell';
import { useTerasNotifications } from '../hooks/useTerasNotifications';
```

- [ ] **Step 2: Panggil hook sekali**

Cari baris `const terasEnabled = isCommunityEnabledForAgent(agentData.slug);` dan sisipkan **tepat di bawahnya**:

```tsx
const notifications = useTerasNotifications(terasEnabled);
const openNotificationPost = (postId: string) => {
  navigatePath(`/dashboard/teras/post/${encodeURIComponent(postId)}`);
};
```

`navigatePath` sudah didefinisikan di file ini (`const navigatePath = useCallback((path, opts?) => …`) dan dipakai handler lain — jangan menambah mekanisme navigasi baru.

Catatan React: hook harus dipanggil sebelum semua `return` awal, termasuk `if (activeTab === 'teras' && !terasEnabled) …`. Pastikan sisipan berada di atas cabang-cabang itu.

- [ ] **Step 3: Render di header sub-halaman**

Cari komentar `{/* Dark mode toggle */}` dan sisipkan **tepat sebelumnya**:

```tsx
{terasEnabled && (
  <NotificationBell
    compact={compactHeader}
    unread={notifications.unread}
    open={notifications.open}
    items={notifications.items}
    loading={notifications.loading}
    error={notifications.error}
    onOpen={notifications.openPanel}
    onClose={notifications.closePanel}
    onOpenPost={openNotificationPost}
  />
)}
```

- [ ] **Step 4: Render di header home/card-grid**

Di blok `{/* Header with avatar */}` (bagian `── Home / Card Grid ──`), cari `<div className="flex items-center gap-1">` yang membungkus tombol tema + logout, dan sisipkan blok yang sama seperti Step 3 **sebagai anak pertama**, tetapi dengan `compact={false}`:

```tsx
{terasEnabled && (
  <NotificationBell
    compact={false}
    unread={notifications.unread}
    open={notifications.open}
    items={notifications.items}
    loading={notifications.loading}
    error={notifications.error}
    onOpen={notifications.openPanel}
    onClose={notifications.closePanel}
    onOpenPost={openNotificationPost}
  />
)}
```

- [ ] **Step 5: Verifikasi tipe & build**

Run: `npx tsc --noEmit && npx vite build`
Expected: keduanya sukses.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # harus: main
git add src/components/DashboardLayout.tsx
git commit -m "feat(teras): bell notifikasi di header dashboard"
```

---

## Task 7: Hapus inbox mention lama + tes end-to-end

**Files:**
- Modify: `src/components/TerasPage.tsx` — hapus state, polling, dan JSX inbox mention.
- Modify: `server.js` — hapus tiga endpoint `/api/community/mentions*`.
- Create: `tests/teras-notification-bell.browser.test.js`

**Interfaces:**
- Consumes: seluruh hasil Task 1–6.
- Produces: tidak ada API baru.

- [ ] **Step 1: Tulis tes Playwright yang gagal**

Buat `tests/teras-notification-bell.browser.test.js`. Pola boot (vite server, browser, `page.route('**/api/**')`, `localStorage.auth_session`) disalin dari `tests/teras-page.browser.test.js` — buka file itu dan tiru bagian `before`/`after` serta helper `makeAgent`/`makePost` apa adanya, lalu tambahkan:

```js
const NOTIFICATIONS = [
  {
    id: 'comment:c1',
    type: 'comment',
    post_id: 'post-1',
    comment_id: 'c1',
    actor: { name: 'Rina Test', photo: null },
    actor_count: 1,
    snippet: 'mantap kak',
    created_at: new Date(Date.now() - 60_000).toISOString(),
    unread: true,
  },
  {
    id: 'reaction:post-2',
    type: 'reaction',
    post_id: 'post-2',
    comment_id: null,
    actor: { name: 'Budi Test', photo: null },
    actor_count: 3,
    snippet: 'Kiriman kedua',
    created_at: new Date(Date.now() - 120_000).toISOString(),
    unread: true,
  },
];

test('bell menampilkan badge, membuka panel, dan membuka detail post', async () => {
  const page = await browser.newPage();
  // Mock: head → 2 unread, list → NOTIFICATIONS, seen → ok.
  // (Gunakan handler page.route yang sama dengan teras-page.browser.test.js,
  //  ditambah tiga cabang berikut sebelum cabang fallback.)
  //   '/api/community/notifications/head' → { success: true, data: { unread_count: 2 } }
  //   '/api/community/notifications'      → { success: true, data: { items: NOTIFICATIONS, seen_at: null } }
  //   '/api/community/notifications/seen' → { success: true }
  await page.goto(`${appOrigin}/dashboard/teras`, { waitUntil: 'networkidle' });

  const bell = page.getByRole('button', { name: 'Notifikasi' }).first();
  await assert.doesNotReject(bell.waitFor({ state: 'visible', timeout: 5_000 }));
  assert.match(await bell.innerText(), /2/, 'badge menampilkan jumlah unread');

  await bell.click();
  const panel = page.getByRole('dialog', { name: 'Notifikasi' });
  await panel.waitFor({ state: 'visible', timeout: 5_000 });
  assert.match(await panel.innerText(), /Rina Test berkomentar di postinganmu/);
  assert.match(await panel.innerText(), /Budi Test & 2 lainnya menyukai postinganmu/);

  await panel.getByText('Rina Test berkomentar di postinganmu').click();
  await page.waitForURL(/\/dashboard\/teras\/post\/post-1$/, { timeout: 5_000 });

  assert.equal(
    await page.getByRole('button', { name: 'Sebutan untukmu' }).count(),
    0,
    'tombol @ lama sudah tidak ada',
  );

  await page.close();
});
```

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `node --test tests/teras-notification-bell.browser.test.js`
Expected: FAIL — assertion `Sebutan untukmu` masih ditemukan (tombol lama belum dihapus), atau bell belum muncul.

- [ ] **Step 3: Hapus inbox mention dari TerasPage**

Di `src/components/TerasPage.tsx`, hapus semuanya berikut (cari lewat string, bukan nomor baris):

1. Deklarasi state: `const [mentionUnread, setMentionUnread] = useState(0);`, `const [mentionInboxOpen, setMentionInboxOpen] = useState(false);`, `const [mentionInbox, setMentionInbox] = useState<MentionInboxItem[]>([]);`, `const [mentionInboxLoading, setMentionInboxLoading] = useState(false);`
2. Seluruh blok berkomentar `// Unread @mention badge — same light-polling contract as the feed head.`: `checkMentionUnread`, `useEffect` polling-nya, dan konstanta `MENTION_HEAD_POLL_INTERVAL_MS`.
3. Seluruh `const openMentionInbox = useCallback(async () => { … }, []);`
4. Tipe `MentionInboxItem` (jika tidak lagi dirujuk di file ini).
5. Blok JSX `<div className="relative shrink-0">` yang berisi tombol `aria-label="Sebutan untukmu"` beserta popover `role="dialog"` di bawahnya — sampai `</div>` penutupnya, sehingga baris composer hanya berisi avatar + kotak tulis.
6. Impor `AtSign` dari `lucide-react` jika tidak dipakai lagi di file ini (periksa dengan `grep -n "AtSign" src/components/TerasPage.tsx` setelah menghapus).

Jangan sentuh apa pun yang berkaitan dengan menulis mention: `mentionState`, `mentionMembers`, `mentionItems`, `applyMention`, `handleMentionKeyDown`, `MentionPopover`, `postMentions`, `commentMentions`.

- [ ] **Step 4: Hapus endpoint mention lama di server**

Di `server.js`, hapus tiga blok utuh: `app.get('/api/community/mentions/head', …)`, `app.get('/api/community/mentions', …)`, dan `app.post('/api/community/mentions/seen', …)`.

Biarkan tetap ada: tabel `community_mentions`, `recordCommunityMentions`, `isCommunityMentionSchemaMissing`, `communityMentionSnippet`, `communityAuthorProfile`, dan nudge Telegram — semuanya masih dipakai.

Run: `node --check server.js`
Expected: keluar tanpa output.

- [ ] **Step 5: Jalankan seluruh verifikasi**

```bash
node --test tests/community-notifications.test.js tests/community-mentions.test.js tests/community-access.test.js
node --test tests/teras-notification-bell.browser.test.js
node --test tests/teras-page.browser.test.js
npx tsc --noEmit
npx vite build
```

Expected: semua PASS / sukses. `tests/teras-page.browser.test.js` ikut dijalankan karena Task 3 dan Step 3 menyentuh `TerasPage.tsx`; kalau ada tes di sana yang menegaskan keberadaan tombol `Sebutan untukmu`, perbarui tes itu untuk mencerminkan bahwa tombolnya kini di header.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # harus: main
git add src/components/TerasPage.tsx server.js tests/teras-notification-bell.browser.test.js
git commit -m "feat(teras): pindahkan notifikasi sebutan ke bell header"
```

---

## Catatan penutup

- Uji manual (opsional, oleh pemilik proyek): buka `/dashboard` di beberapa tab non-Teras, pastikan bell muncul di kiri toggle tema di kedua header, badge terisi, panel membuka, dan klik item membawa ke `/dashboard/teras/post/<id>`. DB lokal = produksi, jadi jangan membuat komentar/reaksi percobaan tanpa persetujuan.
- Ping Telegram untuk komentar & reaksi sengaja **tidak** dikerjakan di sini (lihat "Di luar lingkup" pada spec).
