# Teras `@semua` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@semua` di kiriman Teras memberi tahu seluruh agent lewat lonceng — admin tanpa batas, agent biasa satu kali per hari kalender WIB.

**Architecture:** Token `@semua` ditandai pada kirimannya (`community_posts.mentions_everyone`), bukan di-fan-out jadi 71 baris `community_mentions`. Lonceng menambah sumber keempat: kiriman ber-tanda dari agent lain. Semua aturan murni (parsing token, batas hari WIB, kuota) hidup di satu modul `lib/community-broadcast.js` yang di-import server maupun frontend, seperti `lib/teras-share.js`.

**Tech Stack:** Node 22 + Express 5 + Supabase JS, React 18 + TypeScript + Vite, `node:test`, Playwright (browser test).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-20-teras-mention-semua-design.md`. Kalau rencana ini bertentangan dengan spec, spec yang menang.
- **Hanya di kiriman.** Di komentar `@semua` tetap teks biasa: tidak ada pill, tidak ada item picker, tidak ada notifikasi.
- **Kanal notifikasi: lonceng saja.** Jangan pernah memanggil `sendTelegramMessageDirect` untuk broadcast.
- Regex token final (pakai persis, jangan ditulis ulang): `/(?<![A-Za-z0-9_.@])@semua(?![A-Za-z0-9_-])/i`
- Pesan galat kuota persis: `Jatah @semua hari ini sudah dipakai. Coba lagi besok.`
- Pesan 503 pra-migrasi persis: `Migrasi @semua Teras belum diterapkan`
- Zona waktu kuota: `Asia/Jakarta` (UTC+7, tanpa DST).
- **DDL tidak boleh dijalankan oleh implementor.** File migrasi hanya di-commit; user yang menempelkannya ke Supabase SQL Editor. Tidak ada `exec_sql`, `psql`, atau URL database di repo ini.
- Database lokal = **produksi**. Dilarang menulis data uji ke Supabase. Semua test memakai helper murni atau mock rute Playwright.
- Verifikasi FE: `npx tsc --noEmit` (abaikan galat lama di `src/lib/rahmahJuliPrepDb.ts` dan `src/components/HajiPlus*`) lalu `npm run build:spa`. `npm run lint` tidak dipakai (eslint v10 belum dikonfigurasi).
- Commit di branch `main`. Sebelum tiap commit jalankan `git branch --show-current` dan pastikan `main` (branch bisa berpindah karena pekerjaan paralel user).

## Struktur berkas

| Berkas | Tanggung jawab |
|---|---|
| `lib/community-broadcast.js` (baru) | Semua aturan murni: deteksi token, awal hari WIB, kuota, label picker. Dipakai server + FE. |
| `lib/community-broadcast.d.ts` (baru) | Tipe untuk konsumen TypeScript (pola `lib/teras-share.d.ts`). |
| `migrations/20260725000000_community_broadcast.sql` (baru) | Kolom + dua index. Dijalankan manual. |
| `lib/agent-slug.js` | Tambah `semua` ke slug terlarang. |
| `lib/community-notifications.js` | Sumber `broadcasts` di `mergeNotifications` + `countUnreadNotifications`. |
| `server.js` | Guard skema, penegakan kuota di `POST /api/community/posts`, endpoint kuota, query sumber broadcast. |
| `src/components/MentionAutocomplete.tsx` | Item khusus `@semua` di picker. |
| `src/components/TerasPage.tsx` | Ambil kuota, sisipkan item, kirim, render pill. |
| `src/lib/communityNotifications.ts` | Tipe + kalimat notifikasi `broadcast`. |
| `src/components/NotificationBell.tsx` | Ikon untuk tipe `broadcast`. |
| `tests/community-broadcast.test.js` (baru) | Test helper murni + guard sumber. |
| `tests/community-notifications.test.js` | Test merge/hitung broadcast. |
| `tests/teras-page.browser.test.js` | Test picker `@semua`. |

---

### Task 1: Helper murni broadcast + slug terlarang

**Files:**
- Create: `lib/community-broadcast.js`
- Create: `lib/community-broadcast.d.ts`
- Modify: `lib/agent-slug.js:11-21`
- Test: `tests/community-broadcast.test.js` (baru)

**Interfaces:**
- Consumes: —
- Produces:
  - `EVERYONE_TOKEN: 'semua'`
  - `hasEveryoneMention(body: string): boolean`
  - `jakartaDayStartIso(now: Date | string | number): string`
  - `resolveBroadcastQuota({ role, usedToday }): { unlimited: boolean, allowed: boolean, remaining: number }`
  - `broadcastQuotaLabel(quota): string`

- [ ] **Step 1: Write the failing test**

Buat `tests/community-broadcast.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVERYONE_TOKEN,
  hasEveryoneMention,
  jakartaDayStartIso,
  resolveBroadcastQuota,
  broadcastQuotaLabel,
} from '../lib/community-broadcast.js';
import { isReservedAgentSlug } from '../lib/agent-slug.js';

test('@semua dikenali hanya pada batas kata yang benar', () => {
  assert.equal(EVERYONE_TOKEN, 'semua');
  assert.equal(hasEveryoneMention('Halo @semua, besok kumpul'), true);
  assert.equal(hasEveryoneMention('@semua'), true);
  assert.equal(hasEveryoneMention('(@Semua) mohon perhatiannya'), true);
  assert.equal(hasEveryoneMention('Selesai @semua.'), true);
  // Bukan broadcast: kata lain yang kebetulan berawalan sama.
  assert.equal(hasEveryoneMention('@semuanya hadir ya'), false);
  assert.equal(hasEveryoneMention('kirim ke bagas@semua.com'), false);
  assert.equal(hasEveryoneMention('email: a.b@semua'), false);
  assert.equal(hasEveryoneMention('@semua-agent'), false);
  assert.equal(hasEveryoneMention(''), false);
  assert.equal(hasEveryoneMention(null), false);
});

test('awal hari WIB dihitung dari waktu yang disuntikkan, bukan jam sistem', () => {
  // 2026-07-20 07:00 WIB = 2026-07-20T00:00:00Z
  assert.equal(jakartaDayStartIso('2026-07-20T00:00:00.000Z'), '2026-07-19T17:00:00.000Z');
  // 23:59 WIB dan 00:01 WIB berada di dua hari kuota yang berbeda.
  assert.equal(jakartaDayStartIso('2026-07-20T16:59:00.000Z'), '2026-07-19T17:00:00.000Z');
  assert.equal(jakartaDayStartIso('2026-07-20T17:01:00.000Z'), '2026-07-20T17:00:00.000Z');
});

test('kuota: admin tanpa batas, agent satu kali sehari', () => {
  assert.deepEqual(resolveBroadcastQuota({ role: 'admin', usedToday: 5 }),
    { unlimited: true, allowed: true, remaining: Infinity });
  assert.deepEqual(resolveBroadcastQuota({ role: 'agent', usedToday: 0 }),
    { unlimited: false, allowed: true, remaining: 1 });
  assert.deepEqual(resolveBroadcastQuota({ role: 'agent', usedToday: 1 }),
    { unlimited: false, allowed: false, remaining: 0 });
  // Hitungan aneh dari DB tidak boleh membuat sisa jatah negatif.
  assert.deepEqual(resolveBroadcastQuota({ role: 'agent', usedToday: 4 }),
    { unlimited: false, allowed: false, remaining: 0 });
  // Peran tak dikenal diperlakukan seperti agent biasa, bukan admin.
  assert.equal(resolveBroadcastQuota({ role: undefined, usedToday: 1 }).allowed, false);
});

test('label picker menjelaskan aturan sebelum tombol kirim ditekan', () => {
  assert.equal(broadcastQuotaLabel({ unlimited: true, allowed: true, remaining: Infinity }), 'tanpa batas');
  assert.equal(broadcastQuotaLabel({ unlimited: false, allowed: true, remaining: 1 }), '1× sehari');
  assert.equal(broadcastQuotaLabel({ unlimited: false, allowed: false, remaining: 0 }), 'jatah hari ini habis');
});

test('slug "semua" tidak boleh diklaim agent', () => {
  assert.equal(isReservedAgentSlug('semua'), true);
  assert.equal(isReservedAgentSlug('SEMUA'), true);
  assert.equal(isReservedAgentSlug('semuanya'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/community-broadcast.test.js`
Expected: FAIL — `Cannot find module '../lib/community-broadcast.js'`

- [ ] **Step 3: Write minimal implementation**

Buat `lib/community-broadcast.js`:

```js
/**
 * Aturan murni untuk mention `@semua` di Teras.
 *
 * `@semua` bukan anggota: ia token khusus yang menandai kirimannya
 * (`community_posts.mentions_everyone`) alih-alih menulis satu baris mention
 * per agent. Modul ini di-import server DAN komposer, seperti
 * lib/teras-share.js, supaya penulisan dan penegakan aturan tak bisa menyimpang.
 */

export const EVERYONE_TOKEN = 'semua';

// `@` tidak boleh didahului alfanumerik/`.`/`_`/`@` (menyingkirkan email dan
// tengah kata) dan tidak boleh diikuti karakter slug (menyingkirkan
// `@semuanya`, `@semua-agent`). Batas kiri sama persis dengan mention biasa
// di lib/community-mentions.js.
const EVERYONE_RE = /(?<![A-Za-z0-9_.@])@semua(?![A-Za-z0-9_-])/i;

/** True bila body memuat token broadcast `@semua`. */
export function hasEveryoneMention(body) {
  if (typeof body !== 'string' || !body) return false;
  return EVERYONE_RE.test(body);
}

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000; // WIB = UTC+7, tanpa DST

/**
 * Awal hari kalender Asia/Jakarta untuk `now`, dikembalikan sebagai ISO UTC —
 * bentuk yang bisa langsung dipakai sebagai batas `created_at >= ...`.
 * Waktu selalu disuntikkan pemanggil supaya bisa diuji tanpa jam sistem.
 */
export function jakartaDayStartIso(now) {
  const ms = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (Number.isNaN(ms)) throw new TypeError('jakartaDayStartIso: waktu tidak valid');
  const shifted = ms + JAKARTA_OFFSET_MS;
  const dayStartShifted = Math.floor(shifted / 86400000) * 86400000;
  return new Date(dayStartShifted - JAKARTA_OFFSET_MS).toISOString();
}

/** Jatah broadcast harian: admin tanpa batas, selain itu satu per hari WIB. */
export const BROADCAST_DAILY_LIMIT = 1;

export function resolveBroadcastQuota({ role, usedToday } = {}) {
  if (role === 'admin') return { unlimited: true, allowed: true, remaining: Infinity };
  const used = Number.isFinite(usedToday) ? Math.max(0, usedToday) : 0;
  const remaining = Math.max(0, BROADCAST_DAILY_LIMIT - used);
  return { unlimited: false, allowed: remaining > 0, remaining };
}

/** Sublabel item `@semua` di picker mention. */
export function broadcastQuotaLabel(quota) {
  if (quota?.unlimited) return 'tanpa batas';
  return quota?.allowed ? '1× sehari' : 'jatah hari ini habis';
}
```

Buat `lib/community-broadcast.d.ts`:

```ts
export const EVERYONE_TOKEN: string;
export const BROADCAST_DAILY_LIMIT: number;
export interface BroadcastQuota {
  unlimited: boolean;
  allowed: boolean;
  remaining: number;
}
export function hasEveryoneMention(body: string | null | undefined): boolean;
export function jakartaDayStartIso(now: Date | string | number): string;
export function resolveBroadcastQuota(input: { role?: string | null; usedToday?: number }): BroadcastQuota;
export function broadcastQuotaLabel(quota: BroadcastQuota): string;
```

Ubah `lib/agent-slug.js` — tambahkan `'semua',` ke `RESERVED_EXACT` tepat setelah `'teras',`, dan perbarui komentar blok di atasnya dengan kalimat:

```js
 * `semua` dipakai sebagai token broadcast Teras (`@semua`), jadi tidak boleh
 * menjadi slug agent — kalau tidak, mention personal dan broadcast bertabrakan.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/community-broadcast.test.js`
Expected: PASS, 5 test.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # harus "main"
git add lib/community-broadcast.js lib/community-broadcast.d.ts lib/agent-slug.js tests/community-broadcast.test.js
git commit -m "feat(teras): helper murni untuk mention @semua"
```

---

### Task 2: Migrasi + guard skema

**Files:**
- Create: `migrations/20260725000000_community_broadcast.sql`
- Modify: `server.js` (tambahkan fungsi setelah `isCommunityQuoteSchemaMissing`, sekitar baris 4155)
- Test: `tests/community-broadcast.test.js` (tambah test guard sumber)

**Interfaces:**
- Consumes: —
- Produces: `isCommunityBroadcastSchemaMissing(error): boolean` di `server.js` (dipakai Task 3 dan Task 4)

- [ ] **Step 1: Write the failing test**

Tambahkan di akhir `tests/community-broadcast.test.js`:

```js
import { readFileSync } from 'node:fs';

test('migrasi broadcast additive dan punya index untuk kuota serta lonceng', () => {
  const sql = readFileSync(new URL('../migrations/20260725000000_community_broadcast.sql', import.meta.url), 'utf8');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS mentions_everyone BOOLEAN NOT NULL DEFAULT false/i);
  assert.match(sql, /community_posts_broadcast_quota_idx/);
  assert.match(sql, /community_posts_broadcast_feed_idx/);
  // Additive saja: kolom lama tidak boleh disentuh.
  assert.doesNotMatch(sql, /DROP\s+(COLUMN|TABLE)/i);
  assert.match(sql, /NOTIFY pgrst, 'reload schema'/);
});

test('server memakai guard skema broadcast, bukan menembakkan galat mentah', () => {
  const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(source, /function isCommunityBroadcastSchemaMissing\(error\)/,
    'guard skema broadcast harus ada');
  assert.match(source, /Migrasi @semua Teras belum diterapkan/,
    'pesan 503 pra-migrasi harus persis seperti spec');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/community-broadcast.test.js`
Expected: FAIL — `ENOENT ... 20260725000000_community_broadcast.sql`

- [ ] **Step 3: Write minimal implementation**

Buat `migrations/20260725000000_community_broadcast.sql`:

```sql
BEGIN;

-- Teras `@semua`: satu tanda di kirimannya, bukan fan-out satu baris mention
-- per agent. Lonceng menurunkan notifikasi dari tanda ini, jadi agent yang baru
-- bergabung pun ikut melihat broadcast lama tanpa backfill.
ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS mentions_everyone BOOLEAN NOT NULL DEFAULT false;

-- Cek kuota harian: kiriman ber-@semua milik satu agent, terbaru dulu.
CREATE INDEX IF NOT EXISTS community_posts_broadcast_quota_idx
  ON community_posts (agent_id, created_at DESC)
  WHERE mentions_everyone;

-- Sumber lonceng: broadcast terbaru lintas agent.
CREATE INDEX IF NOT EXISTS community_posts_broadcast_feed_idx
  ON community_posts (created_at DESC)
  WHERE mentions_everyone;

COMMIT;

NOTIFY pgrst, 'reload schema';
```

Di `server.js`, tepat setelah fungsi `isCommunityQuoteSchemaMissing` (sekitar baris 4155), tambahkan:

```js
function isCommunityBroadcastSchemaMissing(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || error?.details || '');
  if (!['42703', 'PGRST204'].includes(code)) return false;
  return /mentions_everyone/i.test(message)
    && /does not exist|could not find|schema cache/i.test(message);
}
```

Pesan 503 belum muncul di sumber pada langkah ini; ia ditambahkan di Task 3. Supaya Task 2 hijau sendiri, tambahkan konstanta di dekat guard tersebut dan pakai di Task 3:

```js
const COMMUNITY_BROADCAST_MIGRATION_ERROR = 'Migrasi @semua Teras belum diterapkan';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/community-broadcast.test.js`
Expected: PASS, 7 test.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # harus "main"
git add migrations/20260725000000_community_broadcast.sql server.js tests/community-broadcast.test.js
git commit -m "feat(teras): migrasi kolom mentions_everyone + guard skema"
```

---

### Task 3: Penegakan kuota di POST kiriman + endpoint kuota

**Files:**
- Modify: `server.js` — handler `app.post('/api/community/posts', ...)` (mulai baris 5261) dan tambahkan endpoint baru sebelum handler tersebut
- Test: `tests/community-broadcast.test.js` (tambah test guard sumber)

**Interfaces:**
- Consumes: `hasEveryoneMention`, `jakartaDayStartIso`, `resolveBroadcastQuota` (Task 1); `isCommunityBroadcastSchemaMissing`, `COMMUNITY_BROADCAST_MIGRATION_ERROR` (Task 2)
- Produces:
  - `loadBroadcastQuota(agent): Promise<{ unlimited, allowed, remaining, used_today, resets_at }>`
  - `GET /api/community/broadcast-quota` → `{ success: true, data: { unlimited, used_today, remaining, resets_at } }`
  - Kolom `mentions_everyone` ikut terkirim saat insert kiriman

- [ ] **Step 1: Write the failing test**

Tambahkan di `tests/community-broadcast.test.js`:

```js
test('POST kiriman menegakkan kuota @semua sebelum menyimpan', () => {
  const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const handlerStart = source.indexOf("app.post('/api/community/posts'");
  assert.ok(handlerStart > 0, 'handler POST kiriman harus ada');
  const handler = source.slice(handlerStart, handlerStart + 12000);

  assert.match(handler, /hasEveryoneMention\(body\)/,
    'token dibaca dari body server, bukan dari flag kiriman klien');
  assert.match(handler, /Jatah @semua hari ini sudah dipakai\. Coba lagi besok\./,
    'penolakan kuota memakai kalimat spec');
  assert.match(handler, /mentions_everyone/,
    'kolom tanda ikut disisipkan');

  const quotaCheck = handler.indexOf('Jatah @semua hari ini sudah dipakai');
  const insert = handler.indexOf('.from(\'community_posts\')\n        .insert(');
  assert.ok(quotaCheck > 0 && (insert === -1 || quotaCheck < insert),
    'kuota diperiksa sebelum insert, bukan sesudah');
});

test('endpoint kuota broadcast tersedia untuk komposer', () => {
  const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(source, /app\.get\('\/api\/community\/broadcast-quota'/);
  assert.match(source, /async function loadBroadcastQuota\(agent\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/community-broadcast.test.js`
Expected: FAIL — `token dibaca dari body server, bukan dari flag kiriman klien`

- [ ] **Step 3: Write minimal implementation**

Di `server.js`, tambahkan import pada blok import `lib/` yang sudah ada (dekat `import { isTerasShortCode, ... } from './lib/teras-share.js';`):

```js
import {
  hasEveryoneMention,
  jakartaDayStartIso,
  resolveBroadcastQuota,
} from './lib/community-broadcast.js';
```

Tambahkan pemuat kuota + endpoint, letakkan tepat sebelum `app.post('/api/community/posts', ...)`:

```js
/**
 * Berapa kali agent sudah broadcast hari ini (kalender WIB). Kiriman yang sudah
 * dihapus IKUT dihitung — kalau tidak, hapus-lalu-kirim-lagi jadi jatah tak
 * terbatas. Kolom yang belum dimigrasi diperlakukan sebagai "belum pernah",
 * jadi endpoint ini tidak pernah menggagalkan komposer.
 */
async function loadBroadcastQuota(agent) {
  const dayStart = jakartaDayStartIso(new Date());
  let usedToday = 0;
  if (agent.role !== 'admin') {
    const { count, error } = await supabase
      .from('community_posts')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', agent.id)
      .eq('mentions_everyone', true)
      .gte('created_at', dayStart);
    if (error && !isCommunityBroadcastSchemaMissing(error)) throw error;
    usedToday = error ? 0 : (count || 0);
  }
  const quota = resolveBroadcastQuota({ role: agent.role, usedToday });
  return {
    unlimited: quota.unlimited,
    allowed: quota.allowed,
    remaining: quota.unlimited ? null : quota.remaining,
    used_today: usedToday,
    // Jatah berikutnya terbuka pada tengah malam WIB setelah dayStart.
    resets_at: new Date(new Date(dayStart).getTime() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

app.get('/api/community/broadcast-quota', dbLoadShedGuard, authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentById(req.user.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (!requireCommunityAccess(agent, res)) return;
    const quota = await loadBroadcastQuota(agent);
    res.json({ success: true, data: quota });
  } catch (err) {
    console.error('[community] broadcast quota error:', err);
    res.status(500).json({ error: 'Gagal memeriksa jatah @semua' });
  }
});
```

Di dalam handler `app.post('/api/community/posts', ...)`, tepat **setelah** validasi panjang body dan `client_id` (setelah blok `if (clientId !== undefined && !isCommunityUuid(clientId))`), tambahkan:

```js
    // Broadcast @semua: token dibaca dari body oleh server — klien tidak
    // dipercaya menandai kirimannya sendiri. Kuota diperiksa SEBELUM insert
    // supaya penolakan tidak meninggalkan kiriman setengah jadi.
    const mentionsEveryone = hasEveryoneMention(body);
    if (mentionsEveryone) {
      const quota = await loadBroadcastQuota(agent);
      if (!quota.allowed) {
        return res.status(403).json({ error: 'Jatah @semua hari ini sudah dipakai. Coba lagi besok.' });
      }
    }
```

Pada `basePostPayload`, tambahkan tanda broadcast:

```js
      ...(mentionsEveryone ? { mentions_everyone: true } : {}),
```

Pada loop insert, tambahkan cabang 503 tepat setelah cabang quote:

```js
      if (mentionsEveryone && isCommunityBroadcastSchemaMissing(insertError)) {
        return res.status(503).json({ error: COMMUNITY_BROADCAST_MIGRATION_ERROR });
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/community-broadcast.test.js && node --check server.js`
Expected: PASS semua test, `node --check` tanpa keluaran.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # harus "main"
git add server.js tests/community-broadcast.test.js
git commit -m "feat(teras): kuota harian @semua dan endpoint sisa jatah"
```

---

### Task 4: Broadcast masuk lonceng

**Files:**
- Modify: `lib/community-notifications.js`
- Modify: `server.js` — `loadTerasNotificationSources` (baris 4767-4830)
- Modify: `src/lib/communityNotifications.ts`
- Modify: `src/components/NotificationBell.tsx:26-31`
- Test: `tests/community-notifications.test.js`

**Interfaces:**
- Consumes: kolom `mentions_everyone` (Task 2), `isCommunityBroadcastSchemaMissing` (Task 2)
- Produces: entri notifikasi bertipe `broadcast` dengan `id: 'broadcast:<post_id>'`

- [ ] **Step 1: Write the failing test**

Tambahkan di `tests/community-notifications.test.js`:

```js
test('broadcast @semua muncul di lonceng dan dihitung sekali', () => {
  const sources = {
    mentions: [],
    comments: [],
    reactions: [],
    broadcasts: [
      {
        post_id: 'post-b1',
        created_at: '2026-07-20T03:00:00.000Z',
        actor: { name: 'Bagas', photo: null },
        snippet: 'Besok kumpul jam 8 ya',
      },
    ],
  };
  const items = mergeNotifications(sources, '2026-07-20T02:00:00.000Z');
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'broadcast:post-b1');
  assert.equal(items[0].type, 'broadcast');
  assert.equal(items[0].post_id, 'post-b1');
  assert.equal(items[0].comment_id, null);
  assert.equal(items[0].actor_count, 1);
  assert.equal(items[0].snippet, 'Besok kumpul jam 8 ya');
  assert.equal(items[0].unread, true);
  assert.equal(countUnreadNotifications(sources), 1);
});

test('mention personal mengalahkan broadcast pada kiriman yang sama', () => {
  const sources = {
    mentions: [
      {
        id: 'm1',
        post_id: 'post-b1',
        comment_id: null,
        created_at: '2026-07-20T03:00:00.000Z',
        actor: { name: 'Bagas', photo: null },
        snippet: 'Halo @nikita @semua',
      },
    ],
    comments: [],
    reactions: [],
    broadcasts: [
      {
        post_id: 'post-b1',
        created_at: '2026-07-20T03:00:00.000Z',
        actor: { name: 'Bagas', photo: null },
        snippet: 'Halo @nikita @semua',
      },
    ],
  };
  const items = mergeNotifications(sources, null);
  assert.equal(items.length, 1, 'satu kiriman = satu notifikasi');
  assert.equal(items[0].type, 'mention');
  assert.equal(countUnreadNotifications(sources), 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/community-notifications.test.js`
Expected: FAIL — `items.length` 0, bukan 1.

- [ ] **Step 3: Write minimal implementation**

Di `lib/community-notifications.js`, tambahkan helper dedupe di bawah `dedupeCommentsAgainstMentions`:

```js
/**
 * Satu kiriman ber-`@semua` yang juga menyebut penerima secara personal
 * menghasilkan dua sumber untuk peristiwa yang sama. Yang personal lebih
 * spesifik, jadi broadcast-nya dibuang — bukan sebaliknya.
 */
function dedupeBroadcastsAgainstMentions(mentions, broadcasts) {
  const mentionedPostIds = new Set(
    (mentions || []).filter(row => !row?.comment_id).map(row => row?.post_id).filter(Boolean)
  );
  return (broadcasts || []).filter(row => row?.post_id && !mentionedPostIds.has(row.post_id));
}
```

Di `mergeNotifications`, tambahkan setelah blok reaksi:

```js
  for (const row of dedupeBroadcastsAgainstMentions(sources?.mentions, sources?.broadcasts)) {
    items.push({
      id: `broadcast:${row.post_id}`,
      type: 'broadcast',
      post_id: row.post_id,
      comment_id: null,
      actor: row.actor || null,
      actor_count: 1,
      snippet: row.snippet || '',
      created_at: row.created_at,
      unread: unreadAll || toTime(row.created_at) > seenTime,
    });
  }
```

Di `countUnreadNotifications`, tambahkan sukunya:

```js
    + dedupeBroadcastsAgainstMentions(sources?.mentions, sources?.broadcasts).length
```

Di `server.js` `loadTerasNotificationSources`, tambahkan query keempat setelah `reactionQuery`:

```js
  // Broadcast @semua dari agent lain. Penulisnya sendiri tidak diberi tahu, dan
  // kiriman terhapus hilang dari lonceng seperti sumber lain.
  const broadcastQuery = supabase
    .from('community_posts')
    .select('id, body, created_at, author:agents!community_posts_agent_id_fkey(name, photo)')
    .eq('mentions_everyone', true)
    .neq('agent_id', agent.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
```

Tambahkan `broadcastQuery.gt('created_at', since);` di dalam blok `if (since)`, lalu ikutkan di `Promise.all`:

```js
  const [mentionResult, commentResult, reactionResult, broadcastResult] = await Promise.all([
    mentionQuery, commentQuery, reactionQuery, broadcastQuery,
  ]);
```

Setelah pemeriksaan galat yang sudah ada, tambahkan:

```js
  if (broadcastResult.error && !isCommunityBroadcastSchemaMissing(broadcastResult.error)) {
    throw broadcastResult.error;
  }
  const broadcasts = (broadcastResult.error ? [] : (broadcastResult.data || [])).map(row => ({
    post_id: row.id,
    created_at: row.created_at,
    actor: communityAuthorProfile(row.author),
    snippet: communityMentionSnippet(row.body, 140),
  }));
```

Sertakan `broadcasts` pada objek yang dikembalikan fungsi ini (di sebelah `mentions`, `comments`, `reactions`).

Di `src/lib/communityNotifications.ts`, perluas tipe dan kalimatnya:

```ts
export type TerasNotificationType = 'mention' | 'comment' | 'reaction' | 'broadcast';
```

dan di `formatNotificationText`, sebelum cabang `comment`:

```ts
  if (item.type === 'broadcast') {
    return `${actor} menyebut semua agent`;
  }
```

Di `src/components/NotificationBell.tsx`, tambahkan `Megaphone` ke import `lucide-react` dan satu baris ke `TYPE_ICON`:

```ts
  broadcast: Megaphone,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/community-notifications.test.js && node --check server.js && npx tsc --noEmit`
Expected: test PASS; `tsc` hanya menyisakan galat lama di luar berkas Teras.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # harus "main"
git add lib/community-notifications.js server.js src/lib/communityNotifications.ts src/components/NotificationBell.tsx tests/community-notifications.test.js
git commit -m "feat(teras): broadcast @semua masuk lonceng notifikasi"
```

---

### Task 5: Komposer — item picker, pill, dan galat kuota

**Files:**
- Modify: `src/components/MentionAutocomplete.tsx`
- Modify: `src/components/TerasPage.tsx`
- Modify: `src/components/MentionText.tsx`
- Modify: `src/components/MentionHighlightLayer.tsx`
- Test: `tests/teras-page.browser.test.js` (Task 6)

**Interfaces:**
- Consumes: `hasEveryoneMention`, `broadcastQuotaLabel`, `resolveBroadcastQuota` (Task 1); `GET /api/community/broadcast-quota` (Task 3)
- Produces: item picker `@semua` hanya di komposer kiriman

- [ ] **Step 1: Tambah item khusus di picker**

Di `src/components/MentionAutocomplete.tsx`, tambahkan prop opsional dan render item khusus **di atas** daftar anggota. Sisipkan ke daftar prop komponen:

```tsx
  everyone,
}: {
  items: MentionMember[];
  activeIndex: number;
  onSelect: (member: MentionMember) => void;
  onHoverIndex: (index: number) => void;
  placement?: 'top' | 'bottom';
  /**
   * Item broadcast `@semua`. Hanya diisi komposer kiriman — kolom komentar
   * membiarkannya undefined karena di sana `@semua` tidak melakukan apa pun.
   */
  everyone?: { label: string; disabled: boolean; onSelect: () => void } | null;
```

Ganti baris `if (!items.length) return null;` menjadi:

```tsx
  if (!items.length && !everyone) return null;
```

dan render tepat sebelum `{items.map(...)}`:

```tsx
      {everyone && (
        <button
          type="button"
          role="option"
          aria-selected={false}
          aria-disabled={everyone.disabled}
          onMouseDown={event => {
            event.preventDefault();
            if (!everyone.disabled) everyone.onSelect();
          }}
          className={`flex w-full items-center gap-2.5 border-b border-gray-100 px-3 py-1.5 text-left transition-colors dark:border-slate-700 ${
            everyone.disabled ? 'opacity-50' : 'hover:bg-gray-50 dark:hover:bg-slate-800/60'
          }`}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
            @
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold text-gray-900 dark:text-white">
              @semua
            </span>
            <span className="block truncate text-[11.5px] text-gray-500 dark:text-slate-400">
              beri tahu semua agent · {everyone.label}
            </span>
          </span>
        </button>
      )}
```

- [ ] **Step 2: Ambil kuota dan sisipkan item di TerasPage**

Di `src/components/TerasPage.tsx`:

Import helper:

```tsx
import { broadcastQuotaLabel, hasEveryoneMention } from '../../lib/community-broadcast.js';
```

Tambahkan state dan pemuatannya di dekat `const [membersLoading, setMembersLoading] = useState(true);`:

```tsx
  // Jatah @semua hari ini. Hanya untuk label picker — server tetap otoritasnya.
  const [broadcastQuota, setBroadcastQuota] = useState<{ unlimited: boolean; allowed: boolean } | null>(null);
```

Tambahkan efek pemuat di sebelah efek pemuat `/members` yang sudah ada:

```tsx
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const payload = await fetchJson(
          '/api/community/broadcast-quota',
          { headers: getAuthHeaders(), signal: controller.signal },
          'Gagal memeriksa jatah',
        );
        if (payload?.data) {
          setBroadcastQuota({ unlimited: !!payload.data.unlimited, allowed: payload.data.remaining !== 0 });
        }
      } catch {
        /* senyap — tanpa label, item @semua tetap bisa dipakai dan server yang menolak */
      }
    })();
    return () => controller.abort();
  }, []);
```

Tambahkan penyisip token **sebelum** `everyoneOption` di urutan sumber —
`const` tidak ter-hoist, jadi `useMemo` di bawah ini akan melempar
`Cannot access 'applyEveryoneMention' before initialization` kalau urutannya
terbalik. Letakkan tepat setelah `applyMention`:

```tsx
  const applyEveryoneMention = useCallback(() => {
    setMentionState(state => {
      if (!state) return null;
      const element = getMentionTextarea(state.context);
      const currentValue = element ? element.value : '';
      const caret = element?.selectionStart ?? currentValue.length;
      const { text, caret: nextCaret } = applyMentionSelection(currentValue, state.start, caret, 'semua');
      composerRequestIdRef.current = null;
      setComposerBody(text);
      requestAnimationFrame(() => {
        const node = getMentionTextarea('composer');
        if (!node) return;
        node.focus();
        node.setSelectionRange(nextCaret, nextCaret);
        node.style.height = 'auto';
        node.style.height = `${node.scrollHeight}px`;
      });
      return null;
    });
  }, []);
```

Lalu bangun deskriptor item dan berikan **hanya** ke picker komposer:

```tsx
  const everyoneOption = useMemo(() => {
    const quota = broadcastQuota || { unlimited: false, allowed: true };
    const label = broadcastQuotaLabel({ unlimited: quota.unlimited, allowed: quota.allowed, remaining: quota.allowed ? 1 : 0 });
    return {
      label,
      disabled: !quota.unlimited && !quota.allowed,
      onSelect: () => applyEveryoneMention(),
    };
  }, [broadcastQuota, applyEveryoneMention]);
```

Pada `<MentionAutocomplete>` **komposer** (sekitar baris 2832) tambahkan prop:

```tsx
                        everyone={everyoneOption}
```

Picker komentar (sekitar baris 3940) **tidak** diberi prop ini.

Supaya item muncul saat mengetik `@sem`, ubah kondisi render picker komposer menjadi:

```tsx
                    {mentionState?.context === 'composer' && (mentionItems.length > 0 || 'semua'.startsWith(mentionState.query.toLowerCase())) && (
```

- [ ] **Step 3: Render pill `@semua`**

Di `src/components/MentionText.tsx` dan `src/components/MentionHighlightLayer.tsx`, `@semua` harus tampil seperti pill mention meski bukan anggota. Cara termurah tanpa menyentuh parser: pemanggil menambahkan entri sintetis ke peta anggota. Di `TerasPage.tsx`, ubah `memberBySlug`:

```tsx
  const memberBySlug = useMemo(() => {
    const map = new Map(mentionMembers.map(member => [member.slug.toLowerCase(), member]));
    // `@semua` bukan anggota, tapi harus tampil sebagai pill di isi kiriman.
    // Entri sintetis ini membuat parser mention yang sudah ada mengenalinya
    // tanpa aturan khusus di tiga tempat render.
    map.set('semua', { slug: 'semua', name: 'semua', photo: null });
    return map;
  }, [mentionMembers]);
```

Karena pill mention menautkan ke profil, cegah `@semua` menjadi tautan: di `MentionText.tsx` fungsi `renderMentionPill`, ubah baris pertama menjadi:

```tsx
  const className = 'font-semibold text-emerald-600 dark:text-emerald-400';
  // `@semua` bukan agent — tidak ada profil untuk dibuka.
  if (!onOpenProfile || segment.slug === 'semua') {
```

Galat 403 dari server tidak butuh kode baru: `submitComposer` sudah menangkap
kegagalan `fetchJson`, memanggil `setComposerError(message)` + toast, dan draf
tetap utuh (`server.js` mengirim `{ error: '...' }`, yang dijadikan pesan oleh
`errorMessage`). Cukup pastikan tidak ada cabang yang menelan status 403.

- [ ] **Step 4: Verifikasi**

Run: `npx tsc --noEmit && npm run build:spa`
Expected: tanpa galat baru pada berkas Teras; build sukses.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # harus "main"
git add src/components/MentionAutocomplete.tsx src/components/TerasPage.tsx src/components/MentionText.tsx
git commit -m "feat(teras): item @semua di komposer dan pill-nya"
```

---

### Task 6: Test browser picker `@semua`

**Files:**
- Modify: `tests/teras-page.browser.test.js`

**Interfaces:**
- Consumes: semua task sebelumnya
- Produces: —

- [ ] **Step 1: Write the failing test**

Di `createCommunityApi` (sekitar baris 98), tambahkan opsi `broadcastQuota = { unlimited: false, used_today: 0, remaining: 1, resets_at: '2026-07-21T17:00:00.000Z' }` pada daftar parameter, simpan ke `api.broadcastQuota = clone(broadcastQuota)`, dan tambahkan cabang rute:

```js
    if (record.method === 'GET' && record.pathname === '/api/community/broadcast-quota') {
      await responseJson(route, { success: true, data: clone(api.broadcastQuota) });
      return;
    }
```

Tambahkan test baru di akhir `describe`:

```js
  test('@semua tampil di komposer dengan label jatah, tidak di kolom balasan', { timeout: 30_000 }, async () => {
    const post = makePost({ id: 'broadcast-post', body: 'Uji broadcast', comment_count: 1 });
    const api = createCommunityApi({
      posts: [post],
      comments: { 'broadcast-post': [makeComment({ body: 'Balasan pertama' })] },
      members: [{ slug: 'bagas', name: 'Bagas', photo: null, phone: null }],
    });
    const app = await openApp({ api, viewport: { width: 670, height: 780 } });
    try {
      await app.page.getByRole('button', { name: COMPOSER_TRIGGER, exact: true }).click();
      const dialog = app.page.getByRole('dialog', { name: 'Buat Kiriman' });
      await dialog.waitFor();
      await dialog.getByPlaceholder(COMPOSER_PLACEHOLDER).type('@');

      const listbox = app.page.getByRole('listbox', { name: 'Sebut anggota' });
      await listbox.waitFor({ timeout: 10_000 });
      const first = listbox.getByRole('option').first();
      assert.match(await first.innerText(), /@semua/, 'item broadcast harus di posisi teratas');
      assert.match(await first.innerText(), /1× sehari/, 'label jatah harus terlihat sebelum kirim');
      assert.equal(await first.getAttribute('aria-disabled'), 'false');

      // Memilihnya menyisipkan token ke isi kiriman.
      await first.click();
      assert.match(await dialog.getByPlaceholder(COMPOSER_PLACEHOLDER).inputValue(), /@semua\s/);

      // Kolom balasan tidak menawarkan broadcast.
      await dialog.getByRole('button', { name: 'Tutup' }).click();
      const article = app.page.locator('article').filter({ hasText: 'Uji broadcast' });
      await article.getByRole('button', { name: 'Komentari', exact: true }).click();
      const commentInput = article.locator('textarea[id^="teras-comment-input-"]').first();
      await commentInput.waitFor();
      await commentInput.type('@');
      const commentListbox = app.page.getByRole('listbox', { name: 'Sebut anggota' });
      await commentListbox.waitFor({ timeout: 10_000 });
      assert.doesNotMatch(await commentListbox.innerText(), /@semua/,
        '@semua tidak berlaku di komentar, jadi tidak boleh ditawarkan di sana');
    } finally {
      await app.close();
    }
  });

  test('jatah habis menonaktifkan item @semua', { timeout: 30_000 }, async () => {
    const api = createCommunityApi({
      posts: [makePost({ id: 'quota-post', body: 'Uji jatah' })],
      members: [{ slug: 'bagas', name: 'Bagas', photo: null, phone: null }],
      broadcastQuota: { unlimited: false, used_today: 1, remaining: 0, resets_at: '2026-07-21T17:00:00.000Z' },
    });
    const app = await openApp({ api, viewport: { width: 670, height: 780 } });
    try {
      await app.page.getByRole('button', { name: COMPOSER_TRIGGER, exact: true }).click();
      const dialog = app.page.getByRole('dialog', { name: 'Buat Kiriman' });
      await dialog.waitFor();
      await dialog.getByPlaceholder(COMPOSER_PLACEHOLDER).type('@');
      const first = app.page.getByRole('listbox', { name: 'Sebut anggota' }).getByRole('option').first();
      await first.waitFor({ timeout: 10_000 });
      assert.match(await first.innerText(), /jatah hari ini habis/);
      assert.equal(await first.getAttribute('aria-disabled'), 'true');
    } finally {
      await app.close();
    }
  });
```

Catatan untuk implementor: nama tombol tutup komposer harus diambil dari sumber
`TerasPage.tsx` bila `'Tutup'` tidak cocok — jangan menebak, cari `aria-label`
tombol tutup dialog komposer dan pakai persis nilainya.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern "@semua tampil di komposer" tests/teras-page.browser.test.js`
Expected: FAIL — item pertama masih anggota biasa, bukan `@semua`.

- [ ] **Step 3: Perbaiki implementasi bila test menunjukkan celah**

Kalau test gagal karena perilaku (bukan selector), betulkan di `MentionAutocomplete.tsx` / `TerasPage.tsx` sesuai Task 5 — jangan melonggarkan assertion.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-name-pattern "@semua" tests/teras-page.browser.test.js`
Expected: PASS, 2 test.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # harus "main"
git add tests/teras-page.browser.test.js
git commit -m "test(teras): kontrak picker @semua di komposer"
```

---

## Verifikasi akhir (setelah semua task)

```bash
node --check server.js
node --test tests/community-broadcast.test.js tests/community-notifications.test.js tests/community-mentions.test.js
npx tsc --noEmit
npm run build:spa
node --test --test-name-pattern "@semua|daftar mention" tests/teras-page.browser.test.js
```

Catat baseline: 5 test lama sudah gagal sebelum pekerjaan ini
(`community media migration…`, `dashboard registers Teras at all eight integration points`,
`Teras Threads presentation…`, `Teras thread rail…`, `community mutations preserve idempotency keys`).
Kegagalan itu bukan regresi — jangan diperbaiki dalam rencana ini, cukup laporkan.

## Serah terima ke user

Setelah semua hijau, laporkan bahwa **migrasi harus dijalankan user**:
tempel isi `migrations/20260725000000_community_broadcast.sql` ke Supabase SQL
Editor. Sebelum itu dijalankan, kiriman ber-`@semua` dijawab 503 dan lonceng
tidak menampilkan broadcast — kiriman biasa tidak terpengaruh.
