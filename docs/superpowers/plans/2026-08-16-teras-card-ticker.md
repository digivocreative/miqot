# Kartu Teras "Ticker Hidup" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kartu Teras di dashboard merotasi 3 kiriman terbaru (animasi halus, waktu relatif, thumbnail) alih-alih 1 cuplikan statis.

**Architecture:** Server memperluas payload `/api/community/teaser` dengan `latest_posts` (maks 3) — dibentuk helper pure baru `lib/community-teaser.js` dari 12 baris yang memang sudah di-query; field `latest` lama tetap dikirim. Klien memindahkan normalisasi ke `src/lib/terasTeaser.ts` (bentuk internal: `posts[]`, fallback `[latest]`), lalu `TerasCard.tsx` merender ticker framer-motion dengan pause hover/tab-hidden/reduced-motion.

**Tech Stack:** Express + Supabase (server.js), React + framer-motion v12 + Tailwind (FE), node:test + esbuild `importTsModule` (tes).

## Global Constraints

- Commit langsung di `main`; cek `git branch --show-current` sebelum tiap commit; `git add` per berkas (ada WIP user di `TerasPage.tsx` & `SnippetSheet.tsx` — JANGAN ikut ter-stage).
- JANGAN jalankan `npm run lint` (rusak repo-wide). Gate FE = `npm run build`, BUKAN tsc-clean (~6 error tsc pre-existing).
- Unit test = `node --test tests/<file>`. Suite penuh/e2e dijalankan user, bukan sesi ini.
- Thumbnail teaser = kolom `photo_url` SAJA (selalu ada di skema; dipelihara server saat create/edit/purge). Jangan select kolom `media` — kolom itu butuh deteksi skema (`isCommunityMediaSchemaMissing`).
- Waktu relatif memakai `timeAgo` yang sudah ada di `src/lib/communityNotifications.ts` ("Baru saja" / "N menit" / "N jam" / "N hari" / tanggal) — jangan bikin helper baru.
- Kompat mundur dua arah: server lama + FE baru → fallback `[latest]` statis; server baru + FE lama → `latest` masih dikirim.
- Copy UI bahasa Indonesia. Interval ticker 4500 ms, transisi 0.3 s fade + translateY ±10 px.
- `setInterval`, BUKAN requestAnimationFrame (rAF suspended di browser pane).

---

### Task 1: Helper pure `buildCommunityTeaserPosts`

**Files:**
- Create: `lib/community-teaser.js`
- Test: `tests/community-teaser-posts.test.js`

**Interfaces:**
- Consumes: `extractCommunityMentions(body, allowedSlugs, authorSlug, limit)` dari `lib/community-mentions.js` (sudah ada).
- Produces: `buildCommunityTeaserPosts(rows, { authorProfile, memberBySlug, limit = 3, snippetLength = 120, mentionLimit = 10 })` → `Array<{ author: {name, photo}, body_snippet, mentions: [{slug, name}], created_at, thumb }>`. Task 2 memanggilnya dari server.js.

- [ ] **Step 1: Tulis tes yang gagal**

```js
// tests/community-teaser-posts.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCommunityTeaserPosts } from '../lib/community-teaser.js';

// Replika kontrak communityAuthorProfile di server.js (PostgREST kadang
// membungkus relasi jadi array).
const authorProfile = value => {
  const author = Array.isArray(value) ? value[0] : value;
  return { name: author?.name ?? null, slug: author?.slug ?? null, photo: author?.photo ?? null };
};

const members = new Map([
  ['bagas', { slug: 'bagas', name: 'Bagas P' }],
  ['nikita', { slug: 'nikita', name: 'Nikita' }],
]);

const row = (over = {}) => ({
  id: 'p1',
  body: 'Halo semua',
  photo_url: null,
  created_at: '2026-08-16T03:00:00.000Z',
  agent: { name: 'Ibu Sari', photo: 'https://cdn/a.jpg' },
  ...over,
});

test('memetakan maksimal limit kiriman dengan author, snippet, waktu, dan thumb', () => {
  const rows = [1, 2, 3, 4, 5].map(n => row({ id: `p${n}`, body: `Kiriman ${n}` }));
  const posts = buildCommunityTeaserPosts(rows, { authorProfile, memberBySlug: members });
  assert.equal(posts.length, 3);
  assert.deepEqual(posts[0], {
    author: { name: 'Ibu Sari', photo: 'https://cdn/a.jpg' },
    body_snippet: 'Kiriman 1',
    mentions: [],
    created_at: '2026-08-16T03:00:00.000Z',
    thumb: null,
  });
});

test('snippet dipotong 120 unicode-safe dan mention diresolusi terhadap snippet', () => {
  const emoji = '🕋'.repeat(130);
  const posts = buildCommunityTeaserPosts(
    [row({ body: emoji }), row({ body: 'Cek jadwal ya @bagas dan @tidakada' })],
    { authorProfile, memberBySlug: members },
  );
  assert.equal(Array.from(posts[0].body_snippet).length, 120);
  assert.deepEqual(posts[1].mentions, [{ slug: 'bagas', name: 'Bagas P' }]);
});

test('thumb dari photo_url (trim), null bila kosong', () => {
  const posts = buildCommunityTeaserPosts(
    [row({ photo_url: '  https://cdn/x.jpg  ' }), row({ photo_url: '   ' }), row({})],
    { authorProfile, memberBySlug: members },
  );
  assert.equal(posts[0].thumb, 'https://cdn/x.jpg');
  assert.equal(posts[1].thumb, null);
  assert.equal(posts[2].thumb, null);
});

test('agent array-wrapped dan input aneh tidak meledak', () => {
  const posts = buildCommunityTeaserPosts(
    [row({ agent: [{ name: 'Wrap', photo: null }] }), null, 'bukan-objek'],
    { authorProfile, memberBySlug: members },
  );
  assert.equal(posts.length, 1);
  assert.equal(posts[0].author.name, 'Wrap');
  assert.deepEqual(buildCommunityTeaserPosts(undefined, { authorProfile, memberBySlug: members }), []);
});
```

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `node --test tests/community-teaser-posts.test.js`
Expected: FAIL — `Cannot find module .../lib/community-teaser.js`

- [ ] **Step 3: Implementasi minimal**

```js
// lib/community-teaser.js
import { extractCommunityMentions } from './community-mentions.js';

/**
 * Bentuk daftar kiriman ringkas untuk ticker Jendela Teras di dashboard.
 * `rows` = kiriman terbaru terurut desc dengan kolom body, photo_url,
 * created_at, dan relasi agent. Mention diresolusi terhadap SNIPPET (bukan
 * body penuh) supaya payload cocok persis dengan yang dirender kartu.
 * Thumb sengaja hanya photo_url: kolom itu dipelihara server sebagai gambar
 * pertama kiriman (create/edit/purge), sedangkan kolom media butuh deteksi
 * skema yang tidak layak untuk teaser.
 */
export function buildCommunityTeaserPosts(rows, {
  authorProfile,
  memberBySlug,
  limit = 3,
  snippetLength = 120,
  mentionLimit = 10,
}) {
  const posts = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== 'object') continue;
    const author = authorProfile(row.agent);
    const snippet = Array.from(String(row.body || '')).slice(0, snippetLength).join('');
    const mentions = extractCommunityMentions(snippet, memberBySlug.keys(), null, mentionLimit)
      .map(slug => ({ slug, name: memberBySlug.get(slug).name }));
    const photoUrl = typeof row.photo_url === 'string' ? row.photo_url.trim() : '';
    posts.push({
      author: { name: author.name, photo: author.photo },
      body_snippet: snippet,
      mentions,
      created_at: row.created_at,
      thumb: photoUrl || null,
    });
    if (posts.length >= limit) break;
  }
  return posts;
}
```

- [ ] **Step 4: Jalankan tes, pastikan lolos**

Run: `node --test tests/community-teaser-posts.test.js`
Expected: PASS (4 tes)

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # harus main
git add lib/community-teaser.js tests/community-teaser-posts.test.js
git commit -m "feat(teras): helper pure kiriman teaser untuk ticker dashboard"
```

---

### Task 2: Server — payload teaser `latest_posts`

**Files:**
- Modify: `server.js` — import baru di blok import lib community (dekat `import { extractCommunityMentions }`), dan fungsi `loadCommunityTeaserSharedData()` (±baris 5270–5350).

**Interfaces:**
- Consumes: `buildCommunityTeaserPosts` (Task 1), `communityAuthorProfile`, `loadCommunityMembers`, `COMMUNITY_MENTION_LIMIT`, `runCommunityRootQuery` (semua sudah ada di server.js).
- Produces: payload teaser `data.latest_posts` (maks 3, bentuk Task 1) + `data.latest` lama tetap. Task 3 menormalkan bentuk ini di klien.

- [ ] **Step 1: Tambah import**

Di server.js, dekat import lib community lain (`grep -n "from './lib/community-" server.js` untuk menemukan bloknya):

```js
import { buildCommunityTeaserPosts } from './lib/community-teaser.js';
```

- [ ] **Step 2: Perluas select + rakit latest_posts**

Di `loadCommunityTeaserSharedData()`:

a. Select query kiriman terbaru ditambah `photo_url` (JANGAN `media`):

```js
        .select('id, body, photo_url, created_at, agent_id, agent:agents!community_posts_agent_id_fkey(name, photo)')
```

b. Ganti blok mulai `const latestPosts = latestResult.data || [];` sampai sebelum `communityTeaserSharedCache = {` dengan (loop `recentAvatars` dipertahankan apa adanya, hanya nama variabel sumbernya ikut jadi `latestRows`):

```js
  const latestRows = latestResult.data || [];
  const recentAvatars = [];
  const recentAgentIds = new Set();
  for (const post of latestRows) {
    if (recentAgentIds.has(post.agent_id)) continue;
    recentAgentIds.add(post.agent_id);
    const author = communityAuthorProfile(post.agent);
    recentAvatars.push({ name: author.name, photo: author.photo });
    if (recentAvatars.length === 3) break;
  }

  let latestPosts = [];
  if (latestRows.length > 0) {
    const members = await loadCommunityMembers();
    const memberBySlug = new Map(
      members.filter(m => m.slug && m.name).map(m => [String(m.slug).toLowerCase(), m]),
    );
    latestPosts = buildCommunityTeaserPosts(latestRows, {
      authorProfile: communityAuthorProfile,
      memberBySlug,
      limit: 3,
      snippetLength: 120,
      mentionLimit: COMMUNITY_MENTION_LIMIT,
    });
  }
  const firstPost = latestPosts[0] || null;

  const data = {
    // `latest` dipertahankan untuk klien lama; klien baru membaca `latest_posts`
    // dan fallback ke `latest` bila server belum di-deploy.
    latest: firstPost ? {
      author: firstPost.author,
      body_snippet: firstPost.body_snippet,
      mentions: firstPost.mentions,
      created_at: firstPost.created_at,
    } : null,
    latest_posts: latestPosts,
    today_count: Number(todayResult.count) || 0,
    recent_avatars: recentAvatars,
  };
```

Catatan: blok lama `latestSnippet`/`latestMentions`/`latestAuthor`/`latestPost` DIHAPUS — perannya diambil builder (perilaku `latest` identik: snippet 120 `Array.from`, mention diresolusi terhadap snippet, `null` saat feed kosong).

- [ ] **Step 3: Verifikasi sintaks + tes cepat**

Run: `node --check server.js && node --test tests/community-teaser-posts.test.js tests/community-access.test.js`
Expected: check lolos, tes PASS (community-access ikut dijalankan sebagai smoke bahwa lib community lain tak terganggu)

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add server.js
git commit -m "feat(teras): teaser kirim latest_posts (3 kiriman + thumb) untuk ticker"
```

---

### Task 3: Klien — `src/lib/terasTeaser.ts` (normalisasi + fallback)

**Files:**
- Create: `src/lib/terasTeaser.ts`
- Test: `tests/teras-teaser-normalize.test.js`

**Interfaces:**
- Consumes: type `MentionMember` dari `src/lib/communityMentions` (type-only — terhapus saat transform esbuild, modul tetap bebas-import).
- Produces: `normalizeTeaserData(value: unknown): TerasTeaserData` dengan `TerasTeaserData = { posts: TeaserPost[], today_count, recent_avatars: TeaserAvatar[], unread_count }`, `TeaserPost = { author: TeaserAvatar, body_snippet, mentions: MentionMember[], created_at, thumb: string | null }`, `TeaserAvatar = { name: string | null, photo: string | null }`, konstanta `TERAS_TEASER_MAX_POSTS = 3`. Task 4 mengimpor semua ini.

- [ ] **Step 1: Tulis tes yang gagal**

```js
// tests/teras-teaser-normalize.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { transformSync } from 'esbuild';

async function importTsModule(path) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'esm', sourcemap: false });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

const modulePromise = importTsModule('src/lib/terasTeaser.ts');

const post = (over = {}) => ({
  author: { name: 'Ibu Sari', photo: 'https://cdn/a.jpg' },
  body_snippet: 'Halo semua',
  mentions: [],
  created_at: '2026-08-16T03:00:00.000Z',
  thumb: null,
  ...over,
});

test('payload baru: latest_posts jadi posts, entri sampah disaring, dipotong 3', async () => {
  const { normalizeTeaserData } = await modulePromise;
  const data = normalizeTeaserData({
    latest: post(),
    latest_posts: [
      post({ thumb: 'https://cdn/x.jpg', mentions: [{ slug: 'bagas', name: 'Bagas P' }, { slug: 7 }] }),
      'sampah',
      post({ body_snippet: 'Kedua' }),
      post(), post(),
    ],
    today_count: 12,
    recent_avatars: [{ name: 'A', photo: null }],
    unread_count: 4,
  });
  assert.equal(data.posts.length, 3);
  assert.equal(data.posts[0].thumb, 'https://cdn/x.jpg');
  assert.deepEqual(data.posts[0].mentions, [{ slug: 'bagas', name: 'Bagas P', photo: null }]);
  assert.equal(data.posts[1].body_snippet, 'Kedua');
  assert.equal(data.today_count, 12);
  assert.equal(data.unread_count, 4);
});

test('payload server lama: fallback [latest], thumb null', async () => {
  const { normalizeTeaserData } = await modulePromise;
  const data = normalizeTeaserData({
    latest: post({ body_snippet: 'Dari server lama' }),
    today_count: 1,
    recent_avatars: [],
    unread_count: 0,
  });
  assert.equal(data.posts.length, 1);
  assert.equal(data.posts[0].body_snippet, 'Dari server lama');
  assert.equal(data.posts[0].thumb, null);
});

test('feed kosong dan angka aneh dijinakkan', async () => {
  const { normalizeTeaserData } = await modulePromise;
  const data = normalizeTeaserData({ latest: null, latest_posts: [], today_count: -3, unread_count: 'x' });
  assert.deepEqual(data.posts, []);
  assert.equal(data.today_count, 0);
  assert.equal(data.unread_count, 0);
  assert.deepEqual(data.recent_avatars, []);
});

test('root bukan objek → throw', async () => {
  const { normalizeTeaserData } = await modulePromise;
  assert.throws(() => normalizeTeaserData(null));
  assert.throws(() => normalizeTeaserData([]));
});
```

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `node --test tests/teras-teaser-normalize.test.js`
Expected: FAIL — file `src/lib/terasTeaser.ts` belum ada (ENOENT)

- [ ] **Step 3: Implementasi**

```ts
// src/lib/terasTeaser.ts
import type { MentionMember } from './communityMentions';

export interface TeaserAvatar {
  name: string | null;
  photo: string | null;
}

export interface TeaserPost {
  author: TeaserAvatar;
  body_snippet: string;
  mentions: MentionMember[];
  created_at: string;
  thumb: string | null;
}

export interface TerasTeaserData {
  posts: TeaserPost[];
  today_count: number;
  recent_avatars: TeaserAvatar[];
  unread_count: number;
}

export const TERAS_TEASER_MAX_POSTS = 3;

function normalizeAvatar(value: unknown): TeaserAvatar {
  const source = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as {
    name?: unknown; photo?: unknown;
  };
  return {
    name: typeof source.name === 'string' ? source.name : null,
    photo: typeof source.photo === 'string' ? source.photo : null,
  };
}

function normalizePost(value: unknown): TeaserPost | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as {
    author?: unknown; body_snippet?: unknown; mentions?: unknown; created_at?: unknown; thumb?: unknown;
  };
  return {
    author: normalizeAvatar(source.author),
    body_snippet: typeof source.body_snippet === 'string' ? source.body_snippet : '',
    mentions: Array.isArray(source.mentions)
      ? (source.mentions as Array<{ slug?: unknown; name?: unknown }>)
        .filter(mention => typeof mention?.slug === 'string' && typeof mention?.name === 'string')
        .map(mention => ({ slug: mention.slug as string, name: mention.name as string, photo: null }))
      : [],
    created_at: typeof source.created_at === 'string' ? source.created_at : '',
    thumb: typeof source.thumb === 'string' && source.thumb ? source.thumb : null,
  };
}

/**
 * Normalisasi payload /api/community/teaser. Server baru mengirim
 * `latest_posts` (maks 3); server lama hanya `latest` — dua-duanya diterima
 * supaya urutan deploy FE/server bebas.
 */
export function normalizeTeaserData(value: unknown): TerasTeaserData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Data Jendela Teras tidak valid');
  }
  const source = value as {
    latest?: unknown; latest_posts?: unknown; today_count?: unknown;
    recent_avatars?: unknown; unread_count?: unknown;
  };
  const fromList = Array.isArray(source.latest_posts)
    ? source.latest_posts.map(normalizePost).filter((post): post is TeaserPost => post !== null)
    : [];
  const posts = (fromList.length > 0
    ? fromList
    : [normalizePost(source.latest)].filter((post): post is TeaserPost => post !== null)
  ).slice(0, TERAS_TEASER_MAX_POSTS);
  const recentAvatars = Array.isArray(source.recent_avatars)
    ? source.recent_avatars.slice(0, 3).map(normalizeAvatar)
    : [];
  return {
    posts,
    today_count: Math.max(0, Number(source.today_count) || 0),
    recent_avatars: recentAvatars,
    unread_count: Math.max(0, Number(source.unread_count) || 0),
  };
}
```

- [ ] **Step 4: Jalankan tes, pastikan lolos**

Run: `node --test tests/teras-teaser-normalize.test.js`
Expected: PASS (4 tes)

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/lib/terasTeaser.ts tests/teras-teaser-normalize.test.js
git commit -m "feat(teras): normalisasi teaser pindah ke lib + dukung latest_posts"
```

---

### Task 4: `TerasCard.tsx` — UI ticker

**Files:**
- Modify: `src/components/TerasCard.tsx` (tulis ulang — interface & `normalizeTeaserData` lokal dihapus, diganti impor dari Task 3)

**Interfaces:**
- Consumes: `normalizeTeaserData`, types dari `../lib/terasTeaser`; `timeAgo` dari `../lib/communityNotifications`; `AnimatePresence`, `motion` dari `framer-motion`; `MentionText`, `handleAgentPhotoError`, `getAuthHeaders` (sudah dipakai file ini).
- Produces: komponen default `TerasCard({ onOpen })` — kontrak props tidak berubah, `DashboardLayout.tsx` tidak perlu disentuh.

- [ ] **Step 1: Tulis ulang komponen**

Isi lengkap file baru:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AtSign, ChevronRight, Coffee, MessagesSquare } from 'lucide-react';
import { handleAgentPhotoError } from '../lib/agent-photo';
import { MentionText } from './MentionText';
import { timeAgo } from '../lib/communityNotifications';
import {
  normalizeTeaserData,
  type TeaserAvatar as TeaserAvatarData,
  type TerasTeaserData,
} from '../lib/terasTeaser';
import { getAuthHeaders } from './LoginPage';

const TICKER_INTERVAL_MS = 4500;

type TerasCardState =
  | { status: 'loading' }
  | { status: 'data'; data: TerasTeaserData }
  | { status: 'error' };

function initials(name: string | null): string {
  return String(name || 'Agent')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0))
    .join('')
    .toUpperCase() || 'A';
}

function TeaserAvatar({
  avatar,
  size,
  className = '',
}: {
  avatar: TeaserAvatarData;
  size: 'recent' | 'latest';
  className?: string;
}) {
  const [fallback, setFallback] = useState(!avatar.photo);

  useEffect(() => {
    setFallback(!avatar.photo);
  }, [avatar.photo]);

  const sizeClass = size === 'recent'
    ? 'h-[18px] w-[18px] text-[7px]'
    : 'h-5 w-5 text-[8px]';
  const imageSize = size === 'recent' ? 36 : 40;

  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-teal-100 font-extrabold text-teal-700 dark:bg-teal-900/40 dark:text-teal-300 ${sizeClass} ${className}`}
    >
      {avatar.photo && !fallback ? (
        <img
          src={avatar.photo}
          alt={avatar.name || 'Agent'}
          className="h-full w-full object-cover"
          onError={event => handleAgentPhotoError(
            event.currentTarget,
            avatar.name,
            imageSize,
            () => setFallback(true),
          )}
        />
      ) : (
        <span aria-hidden="true">{initials(avatar.name)}</span>
      )}
    </span>
  );
}

export default function TerasCard({ onOpen }: { onOpen: () => void }) {
  const [state, setState] = useState<TerasCardState>({ status: 'loading' });
  const [frame, setFrame] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [tabHidden, setTabHidden] = useState(
    () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
  );
  // Dibaca sekali per mount saja — preferensi OS praktis tak berubah mid-sesi,
  // dan rotasi yang tiba-tiba hidup/mati malah mengagetkan.
  const reducedMotion = useMemo(
    () => typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  useEffect(() => {
    const controller = new AbortController();

    const loadTeaser = async () => {
      try {
        const response = await fetch('/api/community/teaser', {
          headers: getAuthHeaders(),
          signal: controller.signal,
        });
        const rawBody = await response.text();
        let payload: unknown;
        try {
          payload = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          throw new Error('Respons Jendela Teras tidak valid');
        }
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
          throw new Error('Respons Jendela Teras tidak valid');
        }
        const envelope = payload as { success?: boolean; data?: unknown; error?: string };
        if (!response.ok || envelope.success === false || typeof envelope.error === 'string') {
          throw new Error(envelope.error || 'Gagal memuat Jendela Teras');
        }
        const data = normalizeTeaserData(envelope.data);
        if (!controller.signal.aborted) setState({ status: 'data', data });
      } catch {
        if (controller.signal.aborted) return;
        setState({ status: 'error' });
      }
    };

    void loadTeaser();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const onVisibility = () => setTabHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const data = state.status === 'data' ? state.data : null;
  const posts = data?.posts ?? [];
  const unreadCount = data?.unread_count || 0;
  const rotating = posts.length > 1 && !reducedMotion;
  const activeIndex = posts.length > 0 ? frame % posts.length : 0;
  const activePost = posts[activeIndex] ?? null;

  useEffect(() => {
    if (!rotating || hovering || tabHidden) return;
    const id = window.setInterval(() => setFrame(prev => prev + 1), TICKER_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [rotating, hovering, tabHidden]);

  const mentionBySlug = useMemo(
    () => new Map((activePost?.mentions || []).map(member => [member.slug.toLowerCase(), member])),
    [activePost],
  );
  const hasMention = mentionBySlug.size > 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      aria-label="Teras"
      aria-busy={state.status === 'loading'}
      className="group min-h-[88px] w-full rounded-2xl border border-teal-200/70 bg-gradient-to-br from-teal-50 via-white to-cyan-100/70 p-3 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:border-teal-800/40 dark:from-teal-950/40 dark:via-slate-800 dark:to-slate-800 dark:focus-visible:ring-offset-slate-950"
    >
      {state.status === 'loading' ? (
        <div className="animate-pulse" aria-label="Memuat Jendela Teras" aria-busy="true">
          <div className="flex h-9 items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-teal-200/70 dark:bg-teal-900/50" />
            <div className="h-3.5 w-20 rounded bg-gray-200 dark:bg-slate-700" />
            <div className="ml-auto h-[18px] w-16 rounded-full bg-gray-200 dark:bg-slate-700" />
          </div>
          <div className="mt-2 h-[26px] rounded bg-gray-200/80 dark:bg-slate-700/80" />
          <div className="mt-1.5 h-2.5 w-28 rounded bg-gray-200/60 dark:bg-slate-700/60" />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-cyan-600 text-white shadow-lg shadow-teal-500/30 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-3 dark:from-teal-500 dark:to-cyan-700 dark:shadow-teal-900/40">
              <MessagesSquare size={17} className="animate-icon-breathe" />
            </span>
            <span className="text-sm font-extrabold text-gray-900 dark:text-white">Teras</span>
            {unreadCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-extrabold text-white shadow-md shadow-red-500/30">
                {!reducedMotion && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/90" aria-hidden="true" />}
                {unreadCount > 9 ? '9+' : unreadCount} baru
              </span>
            )}
            <span className="flex-1" />
            {!!data?.recent_avatars.length && (
              <span className="flex flex-none items-center" aria-label="Agent terbaru">
                {data.recent_avatars.slice(0, 3).map((avatar, index) => (
                  <TeaserAvatar
                    key={`${avatar.name || 'agent'}-${index}`}
                    avatar={avatar}
                    size="recent"
                    className={`${index > 0 ? '-ml-1.5' : ''} border-2 border-white dark:border-slate-800`}
                  />
                ))}
              </span>
            )}
            <ChevronRight size={16} className="shrink-0 text-gray-400 dark:text-slate-500" />
          </div>

          {activePost ? (
            <>
              {/* aria-live off: pergantian frame tiap 4,5 dtk jangan membanjiri
                  screen reader; isi lengkap tetap terbaca di halaman Teras. */}
              <div className="relative mt-2 h-[26px] overflow-hidden" aria-live="off">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={activeIndex}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    className="absolute inset-0 flex min-w-0 items-center gap-2"
                  >
                    <TeaserAvatar avatar={activePost.author} size="latest" />
                    {/* Preview yang memuat @mention dibedakan: penanda @ + latar
                        emerald tipis, karena pill mention-nya bisa terpotong ellipsis. */}
                    {hasMention && (
                      <AtSign
                        size={13}
                        className="shrink-0 text-emerald-600 dark:text-emerald-400"
                        aria-label="Ada sebutan"
                      />
                    )}
                    <p
                      className={`min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] ${
                        hasMention
                          ? 'rounded-md bg-emerald-50/80 px-1.5 py-0.5 text-emerald-900/80 dark:bg-emerald-500/10 dark:text-emerald-100/80'
                          : 'text-gray-500 dark:text-slate-400'
                      }`}
                    >
                      <b className={`font-bold ${hasMention ? 'text-emerald-950 dark:text-white' : 'text-gray-900 dark:text-white'}`}>
                        {activePost.author.name || 'Agent'}
                      </b>
                      &nbsp;
                      <MentionText body={activePost.body_snippet} memberBySlug={mentionBySlug} />
                    </p>
                    {activePost.thumb && (
                      <img
                        src={activePost.thumb}
                        alt=""
                        loading="lazy"
                        className="h-[26px] w-[26px] flex-none rounded-md border border-white/70 object-cover dark:border-slate-700"
                        onError={event => { event.currentTarget.style.display = 'none'; }}
                      />
                    )}
                    <span className="flex-none text-[11px] font-semibold text-gray-400 dark:text-slate-500">
                      {timeAgo(activePost.created_at)}
                    </span>
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="mt-1.5 flex h-2.5 items-center justify-between">
                <span className="text-[10px] font-semibold leading-none text-gray-400 dark:text-slate-500">
                  {data?.today_count ?? 0} kiriman hari ini
                </span>
                {rotating && (
                  <span className="flex items-center gap-1" aria-hidden="true">
                    {posts.map((post, index) => (
                      <span
                        key={post.created_at + index}
                        className={`h-1 w-1 rounded-full transition-colors duration-300 ${
                          index === activeIndex
                            ? 'bg-teal-500 dark:bg-teal-400'
                            : 'bg-teal-200 dark:bg-teal-800'
                        }`}
                      />
                    ))}
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="mt-2 flex min-w-0 items-center gap-2">
              <Coffee size={17} className="shrink-0 text-teal-600 dark:text-teal-400" />
              <p className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-gray-500 dark:text-slate-400">
                Teras masih sepi hari ini. <b className="font-bold text-teal-600 dark:text-teal-400">Jadilah yang pertama berbagi.</b>
              </p>
            </div>
          )}
        </>
      )}
    </button>
  );
}
```

- [ ] **Step 2: Verifikasi build**

Run: `npm run build`
Expected: exit 0 (gate FE; JANGAN pakai tsc/lint)

- [ ] **Step 3: Jalankan kedua tes unit lagi**

Run: `node --test tests/community-teaser-posts.test.js tests/teras-teaser-normalize.test.js`
Expected: PASS (8 tes)

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add src/components/TerasCard.tsx
git commit -m "feat(teras): kartu dashboard jadi ticker 3 kiriman terbaru"
```

---

### Task 5: Verifikasi akhir + checklist manual

- [ ] **Step 1: Sapu bersih**

Run: `node --check server.js && node --test tests/community-teaser-posts.test.js tests/teras-teaser-normalize.test.js tests/community-access.test.js`
Expected: semua PASS. `git status` — HANYA `TerasPage.tsx` + `SnippetSheet.tsx` (WIP user) yang tersisa modified.

- [ ] **Step 2: Susun checklist manual untuk user (dimasukkan ke laporan akhir, bukan dieksekusi)**

- Dashboard: ticker berganti tiap ±4,5 dtk; kursor di atas kartu menghentikan rotasi; pindah tab menghentikan rotasi.
- macOS "Reduce motion" aktif → kartu statis (kiriman terbaru), titik indikator hilang, titik denyut badge hilang.
- Kiriman bergambar → thumbnail 26px muncul; kiriman ber-@mention → penanda emerald.
- Dark mode: kartu, titik, thumbnail, footer terbaca.
- Prod belum deploy server: kartu tetap jalan (1 kiriman statis + "N kiriman hari ini").
- Deploy: `deploy.sh` + restart `server.js` agar `latest_posts` terkirim.
