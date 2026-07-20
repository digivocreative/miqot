# Pengaturan Notifikasi Teras — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Memberi setiap agen kendali per-jenis-peristiwa atas notifikasi Teras di dua kanal — lonceng dan Telegram — lewat matriks 4×2 yang dibuka dari ikon gerigi di header.

**Architecture:** Semua preferensi menumpang kolom `agents.notification_prefs` (jsonb) yang sudah ada, jadi tidak ada DDL. Keputusan logis (default, normalisasi, penggabungan pesan) hidup di dua lib murni yang diuji tanpa DB; server hanya menjalankan efek sampingnya. Telegram untuk komentar & reaksi dikirim oleh sapuan cron per menit yang membaca dua query global dan memakai watermark per agen — bukan tabel antrian, bukan timer di memori.

**Tech Stack:** Node 20 + Express 5 + Supabase JS, React 18 + TypeScript + Tailwind + framer-motion, `node:test` + `node:assert/strict`, Playwright untuk tes browser.

## Global Constraints

- Spec sumber: `docs/superpowers/specs/2026-07-20-teras-notification-settings-design.md`. Mockup: `~/Downloads/teras.pen`.
- **Tanpa DDL.** Tidak boleh ada tabel/kolom baru. Semua kunci masuk `agents.notification_prefs`.
- **Kunci Telegram untuk sebutan tetap `community_mentions`** — jangan diganti jadi `teras_tg_mention`. Kunci ini sudah dibaca di `server.js:4104` dan sudah pernah diubah agen.
- Default: empat kunci lonceng `true`; `community_mentions` `true`; `teras_tg_comment`, `teras_tg_reaction`, `teras_tg_broadcast` `false`.
- Bahasa UI dan pesan Telegram: Indonesia.
- Jalankan tes dengan `node --test tests/<berkas>.test.js` (repo tidak punya skrip `npm test`).
- Verifikasi front-end: `npx tsc --noEmit` dan `npm run build` (eslint v10 belum dikonfigurasi di repo ini — jangan andalkan `npm run lint`).
- `server.js` **tidak** hot-reload. Setiap perubahan server butuh restart proses sebelum diuji lewat curl, kalau tidak Anda akan melihat 404 palsu.
- Commit tiap task selesai. Cek `git branch --show-current` sebelum setiap commit — target `main`.

---

### Task 1: Lib preferensi (murni)

Sumber tunggal kebenaran untuk nama kunci, default, normalisasi, dan penyaringan input. Semua task lain mengimpor dari sini alih-alih menuliskan nama kunci sebagai literal.

**Files:**
- Create: `lib/teras-notification-prefs.js`
- Test: `tests/teras-notification-prefs.test.js`

**Interfaces:**
- Consumes: —
- Produces:
  - `TERAS_BELL_KEYS: { mention: string, comment: string, reaction: string, broadcast: string }`
  - `TERAS_TELEGRAM_KEYS: { mention: string, comment: string, reaction: string, broadcast: string }`
  - `TERAS_TG_SENT_AT_KEY: string`
  - `DEFAULT_TERAS_NOTIFICATION_PREFS: Record<string, boolean>`
  - `normalizeTerasNotificationPrefs(raw?: object) => Record<string, boolean>`
  - `filterTerasPrefUpdates(raw?: object) => Record<string, boolean>`
  - `bellSourceFlags(prefs?: object) => { mentions: boolean, comments: boolean, reactions: boolean, broadcasts: boolean }`
  - `telegramSourceFlags(prefs?: object) => { mentions: boolean, comments: boolean, reactions: boolean, broadcasts: boolean }`
  - `enabledTelegramKeysTurnedOn(previous?: object, updates?: object) => string[]`

- [ ] **Step 1: Tulis tes yang gagal**

Buat `tests/teras-notification-prefs.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TERAS_NOTIFICATION_PREFS,
  TERAS_TELEGRAM_KEYS,
  normalizeTerasNotificationPrefs,
  filterTerasPrefUpdates,
  bellSourceFlags,
  telegramSourceFlags,
  enabledTelegramKeysTurnedOn,
} from '../lib/teras-notification-prefs.js';

test('kunci Telegram untuk sebutan memakai nama lama community_mentions', () => {
  assert.equal(TERAS_TELEGRAM_KEYS.mention, 'community_mentions');
});

test('default: lonceng semua menyala, Telegram hanya sebutan', () => {
  assert.deepEqual(DEFAULT_TERAS_NOTIFICATION_PREFS, {
    teras_bell_mention: true,
    teras_bell_comment: true,
    teras_bell_reaction: true,
    teras_bell_broadcast: true,
    community_mentions: true,
    teras_tg_comment: false,
    teras_tg_reaction: false,
    teras_tg_broadcast: false,
  });
});

test('agen tanpa kunci apa pun mendapat perilaku hari ini', () => {
  const prefs = normalizeTerasNotificationPrefs({});
  assert.deepEqual(bellSourceFlags(prefs), {
    mentions: true, comments: true, reactions: true, broadcasts: true,
  });
  assert.deepEqual(telegramSourceFlags(prefs), {
    mentions: true, comments: false, reactions: false, broadcasts: false,
  });
});

test('pilihan community_mentions:false yang tersimpan tetap dihormati', () => {
  const prefs = normalizeTerasNotificationPrefs({ community_mentions: false });
  assert.equal(prefs.community_mentions, false);
  assert.equal(telegramSourceFlags(prefs).mentions, false);
});

test('kunci milik notifikasi lain tidak ikut terbawa', () => {
  const prefs = normalizeTerasNotificationPrefs({ paspor: false, teras_bell_reaction: false });
  assert.equal(prefs.paspor, undefined, 'hanya kunci Teras yang dikembalikan');
  assert.equal(prefs.teras_bell_reaction, false);
});

test('filter menolak kunci asing dan nilai non-boolean', () => {
  const filtered = filterTerasPrefUpdates({
    teras_bell_reaction: false,
    community_mentions: 'ya',
    paspor: false,
    teras_tg_comment: true,
  });
  assert.deepEqual(filtered, { teras_bell_reaction: false, teras_tg_comment: true });
});

test('mendeteksi saklar Telegram yang baru dinyalakan', () => {
  const turnedOn = enabledTelegramKeysTurnedOn(
    { community_mentions: true, teras_tg_comment: false, teras_tg_reaction: false },
    { teras_tg_comment: true, teras_tg_reaction: false },
  );
  assert.deepEqual(turnedOn, ['teras_tg_comment']);
});

test('saklar Telegram yang sudah menyala tidak dihitung baru', () => {
  assert.deepEqual(
    enabledTelegramKeysTurnedOn({ teras_tg_comment: true }, { teras_tg_comment: true }),
    [],
  );
});
```

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `node --test tests/teras-notification-prefs.test.js`
Expected: FAIL — `Cannot find module '../lib/teras-notification-prefs.js'`

- [ ] **Step 3: Tulis implementasinya**

Buat `lib/teras-notification-prefs.js`:

```js
/**
 * Preferensi notifikasi Teras: matriks 4 jenis peristiwa × 2 kanal.
 *
 * Semuanya menumpang kolom `agents.notification_prefs` yang sudah ada, bersama
 * preferensi notifikasi lain (paspor, pelunasan, dst). Karena itu setiap fungsi
 * di sini hanya menyentuh kunci Teras dan mengabaikan sisanya — menulis balik
 * seluruh objek tanpa filter akan menabrak preferensi milik fitur lain.
 */

export const TERAS_BELL_KEYS = {
  mention: 'teras_bell_mention',
  comment: 'teras_bell_comment',
  reaction: 'teras_bell_reaction',
  broadcast: 'teras_bell_broadcast',
};

/**
 * Sebutan memakai kunci lama `community_mentions`, bukan `teras_tg_mention`.
 * Kunci itu sudah dipakai sebagai gerbang Telegram untuk @mention jauh sebelum
 * matriks ini ada, dan agen sudah pernah mengubahnya. Menyeragamkan namanya
 * berarti diam-diam mereset pilihan mereka.
 */
export const TERAS_TELEGRAM_KEYS = {
  mention: 'community_mentions',
  comment: 'teras_tg_comment',
  reaction: 'teras_tg_reaction',
  broadcast: 'teras_tg_broadcast',
};

/** Watermark pengiriman digest Telegram, per agen. */
export const TERAS_TG_SENT_AT_KEY = 'teras_tg_sent_at';

export const DEFAULT_TERAS_NOTIFICATION_PREFS = {
  [TERAS_BELL_KEYS.mention]: true,
  [TERAS_BELL_KEYS.comment]: true,
  [TERAS_BELL_KEYS.reaction]: true,
  [TERAS_BELL_KEYS.broadcast]: true,
  [TERAS_TELEGRAM_KEYS.mention]: true,
  [TERAS_TELEGRAM_KEYS.comment]: false,
  [TERAS_TELEGRAM_KEYS.reaction]: false,
  [TERAS_TELEGRAM_KEYS.broadcast]: false,
};

const TERAS_PREF_KEY_LIST = Object.keys(DEFAULT_TERAS_NOTIFICATION_PREFS);

/** Hanya kunci Teras, default terisi. Kunci fitur lain sengaja dibuang. */
export function normalizeTerasNotificationPrefs(raw = {}) {
  const source = raw || {};
  const merged = {};
  for (const key of TERAS_PREF_KEY_LIST) {
    merged[key] = typeof source[key] === 'boolean'
      ? source[key]
      : DEFAULT_TERAS_NOTIFICATION_PREFS[key];
  }
  return merged;
}

/** Badan PUT dari klien: buang kunci asing dan nilai yang bukan boolean. */
export function filterTerasPrefUpdates(raw = {}) {
  const filtered = {};
  for (const [key, value] of Object.entries(raw || {})) {
    if (TERAS_PREF_KEY_LIST.includes(key) && typeof value === 'boolean') {
      filtered[key] = value;
    }
  }
  return filtered;
}

function flagsFor(keys, prefs) {
  const normalized = normalizeTerasNotificationPrefs(prefs);
  return {
    mentions: normalized[keys.mention],
    comments: normalized[keys.comment],
    reactions: normalized[keys.reaction],
    broadcasts: normalized[keys.broadcast],
  };
}

/** Sumber mana yang boleh di-query untuk lonceng. */
export function bellSourceFlags(prefs) {
  return flagsFor(TERAS_BELL_KEYS, prefs);
}

/** Sumber mana yang boleh dikirim ke Telegram. */
export function telegramSourceFlags(prefs) {
  return flagsFor(TERAS_TELEGRAM_KEYS, prefs);
}

/**
 * Saklar Telegram yang berubah mati→nyala pada satu PUT. Pemanggil memakai ini
 * untuk memajukan watermark ke "sekarang", supaya agen yang baru menyalakan
 * sebuah kanal tidak langsung dibanjiri riwayat sehari ke belakang.
 */
export function enabledTelegramKeysTurnedOn(previous = {}, updates = {}) {
  const before = normalizeTerasNotificationPrefs(previous);
  const telegramKeys = Object.values(TERAS_TELEGRAM_KEYS);
  return Object.entries(updates || {})
    .filter(([key, value]) => value === true && telegramKeys.includes(key) && before[key] === false)
    .map(([key]) => key);
}
```

- [ ] **Step 4: Jalankan tes, pastikan lulus**

Run: `node --test tests/teras-notification-prefs.test.js`
Expected: PASS — 8 tes lulus, 0 gagal

- [ ] **Step 5: Commit**

```bash
git add lib/teras-notification-prefs.js tests/teras-notification-prefs.test.js
git commit -m "feat(teras): lib preferensi notifikasi (matriks lonceng x telegram)"
```

---

### Task 2: Endpoint baca/tulis preferensi

**Files:**
- Modify: `server.js` — tambahkan dua route tepat **sebelum** `app.get('/api/community/notifications/head', ...)` (sekitar `server.js:4890`), dan tambahkan import di blok import `./lib/community-notifications.js` (sekitar `server.js:73`)

**Interfaces:**
- Consumes: `normalizeTerasNotificationPrefs`, `filterTerasPrefUpdates`, `enabledTelegramKeysTurnedOn`, `TERAS_TG_SENT_AT_KEY` dari Task 1
- Produces:
  - `GET /api/community/notification-prefs` → `{ success: true, data: { prefs: Record<string,boolean>, telegram_connected: boolean } }`
  - `PUT /api/community/notification-prefs` → badan `Record<string, boolean>` → `{ success: true, data: { prefs, telegram_connected } }`

- [ ] **Step 1: Tambahkan import**

Di `server.js`, tepat setelah blok import dari `./lib/community-notifications.js`, tambahkan:

```js
import {
  DEFAULT_TERAS_NOTIFICATION_PREFS,
  TERAS_TG_SENT_AT_KEY,
  bellSourceFlags,
  enabledTelegramKeysTurnedOn,
  filterTerasPrefUpdates,
  normalizeTerasNotificationPrefs,
  telegramSourceFlags,
} from './lib/teras-notification-prefs.js';
```

`bellSourceFlags` dan `telegramSourceFlags` belum dipakai sampai Task 3 dan 6 — biarkan ada, keduanya dipakai sebelum plan ini selesai.

- [ ] **Step 2: Tambahkan kedua route**

Sisipkan tepat sebelum `app.get('/api/community/notifications/head', ...)`:

```js
app.get('/api/community/notification-prefs', dbLoadShedGuard, authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentById(req.user.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (!requireCommunityAccess(agent, res)) return;

    const { data, error } = await supabase
      .from('agents')
      .select('notification_prefs, telegram_chat_id')
      .eq('id', agent.id)
      .single();
    if (error) throw error;

    res.json({
      success: true,
      data: {
        prefs: normalizeTerasNotificationPrefs(data?.notification_prefs || {}),
        telegram_connected: !!data?.telegram_chat_id,
      },
    });
  } catch (err) {
    console.error('[community] notification prefs get error:', err);
    res.status(500).json({ error: 'Gagal memuat pengaturan notifikasi' });
  }
});

app.put('/api/community/notification-prefs', authMiddleware, express.json({ limit: '2kb' }), async (req, res) => {
  try {
    const agent = await getAgentById(req.user.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (!requireCommunityAccess(agent, res)) return;

    const updates = filterTerasPrefUpdates(req.body);
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Tidak ada preferensi valid yang diupdate' });
    }

    const { data: existing, error: fetchErr } = await supabase
      .from('agents')
      .select('notification_prefs, telegram_chat_id')
      .eq('id', agent.id)
      .single();
    if (fetchErr) throw fetchErr;

    const stored = existing?.notification_prefs || {};
    // Menyalakan sebuah kanal Telegram memajukan watermark ke sekarang: tanpa
    // ini, sapuan berikutnya akan mengirim seluruh riwayat 24 jam terakhir ke
    // agen yang baru saja mengaktifkannya.
    const turnedOn = enabledTelegramKeysTurnedOn(stored, updates);
    const merged = {
      ...stored,
      ...updates,
      ...(turnedOn.length > 0 ? { [TERAS_TG_SENT_AT_KEY]: new Date().toISOString() } : {}),
    };

    const { error: updateErr } = await supabase
      .from('agents')
      .update({ notification_prefs: merged })
      .eq('id', agent.id);
    if (updateErr) throw updateErr;

    invalidateAgentCache();
    res.json({
      success: true,
      data: {
        prefs: normalizeTerasNotificationPrefs(merged),
        telegram_connected: !!existing?.telegram_chat_id,
      },
    });
  } catch (err) {
    console.error('[community] notification prefs update error:', err);
    res.status(500).json({ error: 'Gagal menyimpan pengaturan notifikasi' });
  }
});
```

Catatan penting: `merged` sengaja menyebar `stored` **apa adanya** (bukan hasil normalisasi), supaya preferensi non-Teras seperti `paspor` dan watermark `teras_notif_seen_at` tidak terhapus. Yang dinormalisasi hanya nilai yang dikembalikan ke klien.

- [ ] **Step 3: Restart server dan verifikasi dua route lewat curl**

`server.js` tidak hot-reload — hentikan proses lama, jalankan `node server.js`, lalu:

```bash
TOKEN="<JWT dev, lihat resep di memori proyek 'Teras community'>"
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/community/notification-prefs | head -c 400
```

Expected: JSON `{"success":true,"data":{"prefs":{"teras_bell_mention":true,...},"telegram_connected":<bool>}}`

Kalau menerima 404, server lama masih jalan. Kalau 401, tokennya yang salah — bedakan keduanya sebelum menyalahkan kode.

- [ ] **Step 4: Verifikasi PUT menolak kunci asing dan menyimpan yang sah**

```bash
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"paspor":false}' http://localhost:3000/api/community/notification-prefs
```

Expected: HTTP 400 `{"error":"Tidak ada preferensi valid yang diupdate"}`

```bash
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"teras_bell_reaction":false}' http://localhost:3000/api/community/notification-prefs
```

Expected: `{"success":true,...,"teras_bell_reaction":false,...}`. Kembalikan ke `true` setelah pengujian — **basis data lokal ini adalah produksi**, jadi jangan tinggalkan agen sungguhan dengan preferensi hasil uji coba.

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "feat(teras): endpoint baca/tulis preferensi notifikasi"
```

---

### Task 3: Kolom lonceng menyaring sumber

Sumber yang dimatikan tidak di-query sama sekali, dan jalur badge (`/head`) serta daftar (`/notifications`) memakai gating yang identik — kalau menyimpang, badge dan isi panel akan bertentangan.

**Files:**
- Modify: `server.js` — `readTerasNotifSeenAt` (`server.js:4752`), `loadTerasNotificationSources` (`server.js:4782`), route `/head` (`server.js:4890`), route `/notifications` (`server.js:4908`)
- Test: `tests/teras-notification-prefs.test.js` (tambahan)

**Interfaces:**
- Consumes: `bellSourceFlags` dari Task 1
- Produces:
  - `readTerasNotifState(agentId) => Promise<{ seenAt: string|null, prefs: object }>` — menggantikan `readTerasNotifSeenAt` sebagai pembaca gabungan (satu query, bukan dua)
  - `loadTerasNotificationSources(agent, { since, limit, prefs })` — parameter `prefs` baru

- [ ] **Step 1: Tulis tes yang gagal**

Tambahkan di akhir `tests/teras-notification-prefs.test.js`:

```js
test('sumber yang dimatikan hilang dari gating lonceng', () => {
  const prefs = normalizeTerasNotificationPrefs({
    teras_bell_reaction: false,
    teras_bell_broadcast: false,
  });
  assert.deepEqual(bellSourceFlags(prefs), {
    mentions: true, comments: true, reactions: false, broadcasts: false,
  });
});

test('gating lonceng tidak terpengaruh saklar Telegram', () => {
  const prefs = normalizeTerasNotificationPrefs({ teras_tg_reaction: true, community_mentions: false });
  assert.equal(bellSourceFlags(prefs).reactions, true);
  assert.equal(bellSourceFlags(prefs).mentions, true);
});
```

- [ ] **Step 2: Jalankan tes**

Run: `node --test tests/teras-notification-prefs.test.js`
Expected: PASS — kedua tes ini **lulus langsung**, karena `bellSourceFlags` sudah dibuat di Task 1.

Ini memang bukan siklus merah-hijau: gating yang sesungguhnya terjadi di level query Supabase, yang tidak bisa diuji tanpa basis data. Nilai kedua tes ini adalah mengunci kontrak keputusannya sebelum server dipasangi gating — kalau nanti ada yang mengubah arti sebuah flag, tes inilah yang memerah. Pembuktian bahwa server benar-benar menyaring dilakukan lewat curl di Step 7.

- [ ] **Step 3: Ganti `readTerasNotifSeenAt` jadi pembaca gabungan**

Di `server.js`, ganti seluruh fungsi `readTerasNotifSeenAt` (baris ~4752–4762) dengan:

```js
// Baca watermark dan preferensi sekaligus. Keduanya ada di baris agen yang
// sama, jadi dua query terpisah hanya menggandakan beban tanpa manfaat.
// Sengaja tidak lewat cache agen ber-TTL: cache basi di sini membuat badge
// muncul lagi tepat setelah dibersihkan.
async function readTerasNotifState(agentId) {
  const { data, error } = await supabase
    .from('agents')
    .select('notification_prefs')
    .eq('id', agentId)
    .single();
  if (error) throw error;
  const prefs = data?.notification_prefs || {};
  const value = prefs[TERAS_NOTIF_SEEN_KEY];
  return {
    seenAt: typeof value === 'string' && value ? value : null,
    prefs,
  };
}
```

- [ ] **Step 4: Perbarui pemanggil `readTerasNotifSeenAt` di route `/seen`**

Route `/seen` (`server.js:4951`) memakai `readTerasNotifSeenAt` untuk `previousSeenAt`. Ganti barisnya:

```js
    const { seenAt: previousSeenAt } = await readTerasNotifState(agent.id);
```

- [ ] **Step 5: Pasang gating di `loadTerasNotificationSources`**

Ubah tanda tangan fungsi (`server.js:4782`) dan bungkus tiap query:

```js
async function loadTerasNotificationSources(agent, { since, limit, prefs }) {
  const flags = bellSourceFlags(prefs);

  const mentionQuery = !flags.mentions ? null : supabase
    .from('community_mentions')
```

Lakukan hal yang sama untuk tiga query lain: `commentQuery` dijaga `flags.comments`, `reactionQuery` dijaga `flags.reactions`, `broadcastQuery` dijaga `flags.broadcasts`. Lalu blok `if (since)` dan `Promise.all` harus tahan terhadap query bernilai `null`:

```js
  if (since) {
    mentionQuery?.gt('created_at', since);
    commentQuery?.gt('created_at', since);
    reactionQuery?.gt('created_at', since);
    broadcastQuery?.gt('created_at', since);
  }

  const empty = { data: [], error: null };
  const [mentionResult, commentResult, reactionResult, broadcastResult] = await Promise.all([
    mentionQuery ?? empty,
    commentQuery ?? empty,
    reactionQuery ?? empty,
    broadcastQuery ?? empty,
  ]);
```

Sisa fungsi tidak berubah: `mentionResult.data || []` sudah aman terhadap `data: []`.

- [ ] **Step 6: Teruskan prefs dari kedua route**

Di route `/head` (`server.js:4890`), ganti dua baris:

```js
    const { seenAt, prefs } = await readTerasNotifState(agent.id);
    const sources = await loadTerasNotificationSources(agent, {
      since: seenAt,
      limit: NOTIFICATION_SCAN_LIMIT,
      prefs,
    });
```

Di route `/notifications` (`server.js:4908`), ganti dua baris yang setara:

```js
    const { seenAt, prefs } = await readTerasNotifState(agent.id);
    const sources = await loadTerasNotificationSources(agent, {
      since: null,
      limit: NOTIFICATION_LIMIT,
      prefs,
    });
```

- [ ] **Step 7: Verifikasi manual gating**

Restart server. Matikan reaksi, lalu bandingkan kedua jalur:

```bash
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"teras_bell_reaction":false}' http://localhost:3000/api/community/notification-prefs > /dev/null
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/community/notifications \
  | grep -o '"type":"[a-z]*"' | sort | uniq -c
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/community/notifications/head
```

Expected: tidak ada satu pun `"type":"reaction"` di daftar, dan `unread_count` tidak menghitung reaksi. Kembalikan `teras_bell_reaction` ke `true` sesudahnya.

- [ ] **Step 8: Jalankan seluruh tes notifikasi**

Run: `node --test tests/community-notifications.test.js tests/teras-notification-prefs.test.js`
Expected: PASS semua — helper murni `mergeNotifications` tidak berubah kontraknya, jadi tes lama harus tetap hijau.

- [ ] **Step 9: Commit**

```bash
git add server.js tests/teras-notification-prefs.test.js
git commit -m "feat(teras): kolom lonceng menyaring sumber notifikasi"
```

---

### Task 4: Front-end — gerigi & bottom sheet

**Files:**
- Create: `src/hooks/useTerasNotificationPrefs.ts`
- Create: `src/components/TerasNotificationSettings.tsx`
- Modify: `src/components/DashboardLayout.tsx` — import (sekitar `:18`), pemanggilan hook (sekitar `:590`), header sub-halaman (sekitar `:795`), header beranda (sekitar `:1107`)

**Interfaces:**
- Consumes: `GET/PUT /api/community/notification-prefs` dari Task 2
- Produces:
  - `useTerasNotificationPrefs(enabled: boolean) => { prefs, telegramConnected, open, loading, error, openSheet, closeSheet, toggle }`
  - `<TerasNotificationSettings size={'compact'|'header'|'home'} ... />`

- [ ] **Step 1: Buat hook**

Buat `src/hooks/useTerasNotificationPrefs.ts`:

```ts
import { useCallback, useState } from 'react';

import { getAuthHeaders } from '../components/LoginPage';

export type TerasPrefKey =
  | 'teras_bell_mention' | 'teras_bell_comment' | 'teras_bell_reaction' | 'teras_bell_broadcast'
  | 'community_mentions' | 'teras_tg_comment' | 'teras_tg_reaction' | 'teras_tg_broadcast';

export type TerasPrefs = Record<TerasPrefKey, boolean>;

const DEFAULT_PREFS: TerasPrefs = {
  teras_bell_mention: true,
  teras_bell_comment: true,
  teras_bell_reaction: true,
  teras_bell_broadcast: true,
  community_mentions: true,
  teras_tg_comment: false,
  teras_tg_reaction: false,
  teras_tg_broadcast: false,
};

interface PrefsPayload {
  success?: boolean;
  data?: { prefs: TerasPrefs; telegram_connected: boolean };
  error?: string;
}

/**
 * Menyimpan optimistis per saklar: nilainya berubah seketika, dan dikembalikan
 * ke posisi semula bila PUT gagal. Tidak ada tombol "Simpan" — satu saklar satu
 * permintaan.
 */
export function useTerasNotificationPrefs(enabled: boolean) {
  const [prefs, setPrefs] = useState<TerasPrefs>(DEFAULT_PREFS);
  const [telegramConnected, setTelegramConnected] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openSheet = useCallback(async () => {
    if (!enabled) return;
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/community/notification-prefs', { headers: getAuthHeaders() });
      const payload = (await response.json()) as PrefsPayload;
      if (!response.ok || payload.success === false || !payload.data) {
        throw new Error(payload.error ?? `Request failed: ${response.status}`);
      }
      setPrefs(payload.data.prefs);
      setTelegramConnected(payload.data.telegram_connected);
    } catch {
      setError('Gagal memuat pengaturan.');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  const closeSheet = useCallback(() => {
    setOpen(false);
    setError(null);
  }, []);

  const toggle = useCallback(async (key: TerasPrefKey) => {
    const previous = prefs[key];
    setPrefs(current => ({ ...current, [key]: !previous }));
    setError(null);
    try {
      const response = await fetch('/api/community/notification-prefs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ [key]: !previous }),
      });
      const payload = (await response.json()) as PrefsPayload;
      if (!response.ok || payload.success === false || !payload.data) {
        throw new Error(payload.error ?? `Request failed: ${response.status}`);
      }
      setPrefs(payload.data.prefs);
    } catch {
      setPrefs(current => ({ ...current, [key]: previous }));
      setError('Gagal menyimpan. Coba lagi.');
    }
  }, [prefs]);

  return { prefs, telegramConnected, open, loading, error, openSheet, closeSheet, toggle };
}
```

- [ ] **Step 2: Buat komponen**

Buat `src/components/TerasNotificationSettings.tsx`. Ukuran tombol gerigi meniru `NotificationBell.tsx:48-52` persis, supaya selalu serasi dengan lonceng dan toggle tema di sebelahnya:

```tsx
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AtSign, Heart, Megaphone, MessageCircle, Bell, Send, Settings, Timer, X } from 'lucide-react';
import { createPortal } from 'react-dom';

import type { TerasPrefKey, TerasPrefs } from '../hooks/useTerasNotificationPrefs';

// Sama persis dengan SIZE_CLASSES di NotificationBell.tsx — gerigi berdiri di
// antara lonceng dan toggle tema, jadi ketiganya harus seukuran di tiap header.
const SIZE_CLASSES: Record<'compact' | 'header' | 'home', { button: string; icon: number }> = {
  compact: { button: 'h-8 w-8 rounded-lg', icon: 14 },
  header: { button: 'h-11 w-11 rounded-xl', icon: 16 },
  home: { button: 'w-9 h-9 rounded-xl', icon: 16 },
};

const ROWS: { icon: typeof AtSign; title: string; caption: string; bell: TerasPrefKey; telegram: TerasPrefKey }[] = [
  { icon: AtSign, title: 'Sebutan (@nama)', caption: 'Saat kamu disebut', bell: 'teras_bell_mention', telegram: 'community_mentions' },
  { icon: MessageCircle, title: 'Balasan & komentar', caption: 'Di kiriman kamu', bell: 'teras_bell_comment', telegram: 'teras_tg_comment' },
  { icon: Heart, title: 'Reaksi', caption: 'Suka di kiriman kamu', bell: 'teras_bell_reaction', telegram: 'teras_tg_reaction' },
  { icon: Megaphone, title: 'Pengumuman @semua', caption: 'Dari agen lain', bell: 'teras_bell_broadcast', telegram: 'teras_tg_broadcast' },
];

function Switch({ checked, disabled, label, onToggle }: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`flex h-[26px] w-11 shrink-0 items-center rounded-full p-[3px] transition-colors disabled:opacity-40 ${
        checked ? 'justify-end bg-emerald-500' : 'justify-start bg-gray-200 dark:bg-slate-600'
      }`}
    >
      <span className="h-5 w-5 rounded-full bg-white shadow-sm" />
    </button>
  );
}

export default function TerasNotificationSettings({
  size, prefs, telegramConnected, open, loading, error, onOpen, onClose, onToggle,
}: {
  size: 'compact' | 'header' | 'home';
  prefs: TerasPrefs;
  telegramConnected: boolean;
  open: boolean;
  loading: boolean;
  error: string | null;
  onOpen: () => void;
  onClose: () => void;
  onToggle: (key: TerasPrefKey) => void;
}) {
  const reduceMotion = useReducedMotion();
  const sizing = SIZE_CLASSES[size];

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        aria-label="Pengaturan notifikasi Teras"
        title="Pengaturan notifikasi Teras"
        className={`flex shrink-0 items-center justify-center transition-colors active:scale-95 ${sizing.button} ${
          open
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
            : 'bg-gray-100/80 text-gray-500 hover:bg-gray-200 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700'
        }`}
      >
        <Settings size={sizing.icon} />
      </button>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && (
            <>
              <motion.div
                key="teras-prefs-scrim"
                className="fixed inset-0 z-40 bg-slate-900/40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
              />
              <motion.div
                key="teras-prefs-sheet"
                role="dialog"
                aria-modal="true"
                aria-label="Pengaturan notifikasi Teras"
                className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl border-t border-gray-100 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
                initial={reduceMotion ? { opacity: 0 } : { y: '100%' }}
                animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { y: '100%' }}
                transition={{ type: 'tween', duration: 0.22 }}
              >
                <div className="flex justify-center pb-0.5 pt-2">
                  <span className="h-1 w-9 rounded-full bg-gray-200 dark:bg-slate-600" />
                </div>

                <div className="flex items-center justify-between px-4 pb-3 pt-2.5">
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white">Notifikasi Teras</h2>
                  <button type="button" onClick={onClose} aria-label="Tutup" className="text-gray-400 dark:text-slate-500">
                    <X size={17} />
                  </button>
                </div>

                <div className="flex items-center gap-1.5 px-4 pb-2">
                  <span className="flex-1" />
                  <span className="flex w-[50px] justify-center text-gray-500 dark:text-slate-400"><Bell size={14} /></span>
                  <span className="flex w-[50px] justify-center text-[10px] font-semibold text-gray-500 dark:text-slate-400">Telegram</span>
                </div>

                <div className="border-t border-gray-100 px-4 py-0.5 dark:border-slate-700">
                  {loading && <p className="py-6 text-center text-[13px] text-gray-400">Memuat…</p>}
                  {!loading && ROWS.map(row => {
                    const Icon = row.icon;
                    return (
                      <div key={row.bell} className="flex items-center gap-1.5 py-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400">
                          <Icon size={16} />
                        </span>
                        <span className="min-w-0 flex-1 pl-1">
                          <span className="block truncate text-[14px] font-semibold text-gray-900 dark:text-white">{row.title}</span>
                          <span className="block truncate text-[11px] text-gray-400 dark:text-slate-500">{row.caption}</span>
                        </span>
                        <span className="flex w-[50px] justify-center">
                          <Switch checked={prefs[row.bell]} label={`${row.title} di lonceng`} onToggle={() => onToggle(row.bell)} />
                        </span>
                        <span className={`flex w-[50px] justify-center ${telegramConnected ? '' : 'opacity-40'}`}>
                          <Switch
                            checked={prefs[row.telegram]}
                            disabled={!telegramConnected}
                            label={`${row.title} ke Telegram`}
                            onToggle={() => onToggle(row.telegram)}
                          />
                        </span>
                      </div>
                    );
                  })}
                </div>

                {!telegramConnected && (
                  <a
                    href="/dashboard/telegram"
                    className="flex items-center gap-2.5 border-t border-gray-100 bg-emerald-50 px-4 py-3 dark:border-slate-700 dark:bg-emerald-900/20"
                  >
                    <Send size={15} className="text-sky-500" />
                    <span className="flex-1 text-[12px] font-medium text-gray-600 dark:text-slate-300">Telegram belum tersambung</span>
                    <span className="text-[12px] font-bold text-emerald-700 dark:text-emerald-300">Sambungkan</span>
                  </a>
                )}

                {error && (
                  <p role="alert" className="border-t border-gray-100 px-4 py-2 text-[12px] font-medium text-red-500 dark:border-slate-700">{error}</p>
                )}

                <div className="flex items-start gap-2 border-t border-gray-100 bg-gray-50 px-4 pb-[max(1.4rem,env(safe-area-inset-bottom))] pt-3 dark:border-slate-700 dark:bg-slate-950">
                  <Timer size={13} className="mt-0.5 shrink-0 text-gray-400 dark:text-slate-500" />
                  <p className="text-[11px] leading-[1.4] text-gray-400 dark:text-slate-500">
                    Komentar &amp; reaksi dikirim terkumpul tiap 10 menit.
                  </p>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
```

- [ ] **Step 3: Pasang di `DashboardLayout.tsx`**

Tambahkan import di dekat baris 18:

```tsx
import TerasNotificationSettings from './TerasNotificationSettings';
import { useTerasNotificationPrefs } from '../hooks/useTerasNotificationPrefs';
```

Tepat setelah `const notifications = useTerasNotifications(terasEnabled);` (baris ~590):

```tsx
  const notifPrefs = useTerasNotificationPrefs(terasEnabled);
```

Di **kedua** header, sisipkan tepat setelah `<NotificationBell ... />` dan sebelum tombol toggle tema. Keduanya berbeda hanya pada `size`, tapi ditulis lengkap di sini supaya tidak ada yang perlu ditebak.

Header sub-halaman (`src/components/DashboardLayout.tsx:795`):

```tsx
            {terasEnabled && (
              <TerasNotificationSettings
                size={compactHeader ? 'compact' : 'header'}
                prefs={notifPrefs.prefs}
                telegramConnected={notifPrefs.telegramConnected}
                open={notifPrefs.open}
                loading={notifPrefs.loading}
                error={notifPrefs.error}
                onOpen={notifPrefs.openSheet}
                onClose={notifPrefs.closeSheet}
                onToggle={notifPrefs.toggle}
              />
            )}
```

Header beranda (`src/components/DashboardLayout.tsx:1107`) — `size="home"`, bukan ternary, karena header ini tidak punya keadaan compact:

```tsx
            {terasEnabled && (
              <TerasNotificationSettings
                size="home"
                prefs={notifPrefs.prefs}
                telegramConnected={notifPrefs.telegramConnected}
                open={notifPrefs.open}
                loading={notifPrefs.loading}
                error={notifPrefs.error}
                onOpen={notifPrefs.openSheet}
                onClose={notifPrefs.closeSheet}
                onToggle={notifPrefs.toggle}
              />
            )}
```

Hook-nya dipanggil **sekali** di `DashboardLayout`, bukan di dalam komponen — persis alasan yang sama dengan `useTerasNotifications`: gerigi tampil di dua header yang saling eksklusif, dan memindahkan state ke komponen akan menggandakan permintaan pada hari keduanya pernah tampil bersamaan.

- [ ] **Step 4: Verifikasi tipe dan build**

Run: `npx tsc --noEmit`
Expected: keluar tanpa error

Run: `npm run build`
Expected: `built in …` tanpa error

- [ ] **Step 5: Verifikasi di browser**

Jalankan `npm run dev`, buka `/dashboard/teras`, dan periksa satu per satu:
- gerigi muncul di antara lonceng dan bulan/matahari, seukuran keduanya;
- mengetuknya membuka bottom sheet dengan 4 baris dan 8 saklar;
- di lebar 360px (DevTools → responsive), judul dan keterangan tiap baris tetap satu baris, tidak terpotong;
- bila akun uji belum menyambungkan Telegram, kolom kanan redup dan tidak bisa diketuk, serta strip "Sambungkan" muncul;
- mematikan lalu menyalakan sebuah saklar bertahan setelah sheet ditutup dan dibuka lagi.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useTerasNotificationPrefs.ts src/components/TerasNotificationSettings.tsx src/components/DashboardLayout.tsx
git commit -m "feat(teras): bottom sheet pengaturan notifikasi di header"
```

---

### Task 5: Lib digest Telegram (murni)

Semua aturan penggabungan hidup di sini supaya bisa diuji tanpa cron dan tanpa Telegram.

**Files:**
- Create: `lib/teras-telegram-digest.js`
- Test: `tests/teras-telegram-digest.test.js`

**Interfaces:**
- Consumes: `telegramSourceFlags` dari Task 1
- Produces:
  - `TERAS_DIGEST_WINDOW_MS: number` (600000)
  - `TERAS_DIGEST_LOOKBACK_MS: number` (86400000)
  - `buildTerasDigestMessages(input) => { agent_id, chat_id, post_id, type, text }[]`
    dengan `input = { comments, reactions, mentions, owners, origin }`:
    - `comments: { id, post_id, created_at, owner_agent_id, actor_agent_id, actor_name }[]`
    - `reactions: { post_id, created_at, owner_agent_id, actor_agent_id, actor_name }[]`
    - `mentions: { comment_id, mentioned_agent_id }[]`
    - `owners: { id, chat_id, prefs, sent_at }[]`
    - `origin: string`

- [ ] **Step 1: Tulis tes yang gagal**

Buat `tests/teras-telegram-digest.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTerasDigestMessages } from '../lib/teras-telegram-digest.js';

const ORIGIN = 'https://app.test';

function owner(overrides = {}) {
  return {
    id: 'owner-1',
    chat_id: '12345',
    prefs: { teras_tg_comment: true, teras_tg_reaction: true },
    sent_at: '2026-07-20T00:00:00Z',
    ...overrides,
  };
}

function reaction(overrides = {}) {
  return {
    post_id: 'p1',
    created_at: '2026-07-20T10:00:00Z',
    owner_agent_id: 'owner-1',
    actor_agent_id: 'a1',
    actor_name: 'Rina',
    ...overrides,
  };
}

function comment(overrides = {}) {
  return {
    id: 'c1',
    post_id: 'p1',
    created_at: '2026-07-20T10:00:00Z',
    owner_agent_id: 'owner-1',
    actor_agent_id: 'a1',
    actor_name: 'Rina',
    ...overrides,
  };
}

test('15 reaksi pada satu kiriman jadi satu pesan', () => {
  const reactions = Array.from({ length: 15 }, (_, i) => reaction({
    actor_agent_id: `a${i}`,
    actor_name: `Agen ${i}`,
    created_at: `2026-07-20T10:${String(i).padStart(2, '0')}:00Z`,
  }));
  const messages = buildTerasDigestMessages({ comments: [], reactions, mentions: [], owners: [owner()], origin: ORIGIN });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'reaction');
  assert.match(messages[0].text, /14 lainnya/);
  assert.match(messages[0].text, /Agen 14/, 'aktor terbaru yang jadi wajah');
  assert.match(messages[0].text, /https:\/\/app\.test\/dashboard\/teras\/post\/p1/);
});

test('reaksi pada dua kiriman jadi dua pesan', () => {
  const messages = buildTerasDigestMessages({
    comments: [],
    reactions: [reaction(), reaction({ post_id: 'p2', actor_agent_id: 'a2' })],
    mentions: [],
    owners: [owner()],
    origin: ORIGIN,
  });
  assert.deepEqual(messages.map(m => m.post_id).sort(), ['p1', 'p2']);
});

test('komentar yang juga sebutan tidak dikirim ulang', () => {
  const messages = buildTerasDigestMessages({
    comments: [comment()],
    reactions: [],
    mentions: [{ comment_id: 'c1', mentioned_agent_id: 'owner-1' }],
    owners: [owner()],
    origin: ORIGIN,
  });
  assert.deepEqual(messages, []);
});

test('sebutan untuk orang lain tidak membatalkan komentar milik pemilik', () => {
  const messages = buildTerasDigestMessages({
    comments: [comment()],
    reactions: [],
    mentions: [{ comment_id: 'c1', mentioned_agent_id: 'orang-lain' }],
    owners: [owner()],
    origin: ORIGIN,
  });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'comment');
});

test('baris lebih tua dari watermark diabaikan', () => {
  const messages = buildTerasDigestMessages({
    comments: [],
    reactions: [reaction({ created_at: '2026-07-19T23:00:00Z' })],
    mentions: [],
    owners: [owner({ sent_at: '2026-07-20T00:00:00Z' })],
    origin: ORIGIN,
  });
  assert.deepEqual(messages, []);
});

test('aksi dari diri sendiri tidak menghasilkan pesan', () => {
  const messages = buildTerasDigestMessages({
    comments: [comment({ actor_agent_id: 'owner-1' })],
    reactions: [reaction({ actor_agent_id: 'owner-1' })],
    mentions: [],
    owners: [owner()],
    origin: ORIGIN,
  });
  assert.deepEqual(messages, []);
});

test('saklar kanal yang mati membungkam jenisnya saja', () => {
  const messages = buildTerasDigestMessages({
    comments: [comment()],
    reactions: [reaction()],
    mentions: [],
    owners: [owner({ prefs: { teras_tg_comment: true, teras_tg_reaction: false } })],
    origin: ORIGIN,
  });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'comment');
});

test('pemilik tanpa chat_id dilewati', () => {
  const messages = buildTerasDigestMessages({
    comments: [],
    reactions: [reaction()],
    mentions: [],
    owners: [owner({ chat_id: null })],
    origin: ORIGIN,
  });
  assert.deepEqual(messages, []);
});

test('tiga balasan pada satu kiriman jadi satu pesan berjumlah', () => {
  const messages = buildTerasDigestMessages({
    comments: [
      comment({ id: 'c1', actor_agent_id: 'a1' }),
      comment({ id: 'c2', actor_agent_id: 'a2' }),
      comment({ id: 'c3', actor_agent_id: 'a3' }),
    ],
    reactions: [],
    mentions: [],
    owners: [owner()],
    origin: ORIGIN,
  });
  assert.equal(messages.length, 1);
  assert.match(messages[0].text, /3 balasan baru/);
});
```

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `node --test tests/teras-telegram-digest.test.js`
Expected: FAIL — `Cannot find module '../lib/teras-telegram-digest.js'`

- [ ] **Step 3: Tulis implementasinya**

Buat `lib/teras-telegram-digest.js`:

```js
/**
 * Penggabungan pesan digest Telegram untuk Teras.
 *
 * Telegram memakai jalan yang sama dengan lonceng: satu kiriman yang diramaikan
 * 15 reaksi menghasilkan SATU pesan, bukan 15. Aturannya ditaruh di sini —
 * murni, tanpa DB dan tanpa jaringan — supaya bisa diuji sepenuhnya dan tidak
 * menyimpang dari aturan lonceng di lib/community-notifications.js.
 */

import { telegramSourceFlags } from './teras-notification-prefs.js';

/** Jeda kumpul. Angka tebakan tanpa data pendukung — satu tempat untuk diubah. */
export const TERAS_DIGEST_WINDOW_MS = 10 * 60 * 1000;

/** Lantai pengambilan: baris lebih tua dari ini tidak pernah dikirim susulan. */
export const TERAS_DIGEST_LOOKBACK_MS = 24 * 60 * 60 * 1000;

function toTime(value) {
  const time = new Date(value || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function groupByOwnerAndPost(rows, ownerById, isEnabled) {
  const groups = new Map();
  for (const row of rows || []) {
    const owner = ownerById.get(row?.owner_agent_id);
    if (!owner || !owner.chat_id) continue;
    if (!isEnabled(owner)) continue;
    if (!row.post_id) continue;
    // Aksi sendiri tidak memberi tahu diri sendiri.
    if (row.actor_agent_id === owner.id) continue;
    // Watermark: apa pun yang sudah tercakup pengiriman sebelumnya dilewati.
    if (owner.sent_at && toTime(row.created_at) <= toTime(owner.sent_at)) continue;

    const key = `${owner.id}:${row.post_id}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        owner,
        post_id: row.post_id,
        created_at: row.created_at,
        actor_name: row.actor_name || 'Seseorang',
        actors: new Set(row.actor_agent_id ? [row.actor_agent_id] : []),
        count: 1,
      });
      continue;
    }
    existing.count += 1;
    if (row.actor_agent_id) existing.actors.add(row.actor_agent_id);
    if (toTime(row.created_at) > toTime(existing.created_at)) {
      existing.created_at = row.created_at;
      existing.actor_name = row.actor_name || existing.actor_name;
    }
  }
  return [...groups.values()];
}

/**
 * Satu balasan yang sekaligus menyebut pemilik kiriman sudah dikirim instan
 * lewat jalur mention. Yang personal lebih spesifik, jadi sisi komentarnya yang
 * dibuang — aturan yang sama dengan lonceng.
 */
function dropCommentsAlreadySentAsMentions(comments, mentions) {
  const sent = new Set(
    (mentions || [])
      .filter(row => row?.comment_id && row?.mentioned_agent_id)
      .map(row => `${row.mentioned_agent_id}:${row.comment_id}`),
  );
  return (comments || []).filter(row => !sent.has(`${row.owner_agent_id}:${row.id}`));
}

export function buildTerasDigestMessages({ comments, reactions, mentions, owners, origin }) {
  const ownerById = new Map((owners || []).map(row => [row.id, row]));
  const postUrl = postId => `${origin}/dashboard/teras/post/${postId}`;
  const messages = [];

  const commentGroups = groupByOwnerAndPost(
    dropCommentsAlreadySentAsMentions(comments, mentions),
    ownerById,
    owner => telegramSourceFlags(owner.prefs).comments,
  );
  for (const group of commentGroups) {
    const label = group.count === 1
      ? `<b>${escapeHtml(group.actor_name)}</b> membalas kiriman kamu`
      : `<b>${group.count} balasan baru</b> di kiriman kamu`;
    messages.push({
      agent_id: group.owner.id,
      chat_id: group.owner.chat_id,
      post_id: group.post_id,
      type: 'comment',
      text: `💬 ${label}\n\n${postUrl(group.post_id)}`,
    });
  }

  const reactionGroups = groupByOwnerAndPost(
    reactions,
    ownerById,
    owner => telegramSourceFlags(owner.prefs).reactions,
  );
  for (const group of reactionGroups) {
    const others = Math.max(0, group.actors.size - 1);
    const who = others > 0
      ? `<b>${escapeHtml(group.actor_name)}</b> dan ${others} lainnya`
      : `<b>${escapeHtml(group.actor_name)}</b>`;
    messages.push({
      agent_id: group.owner.id,
      chat_id: group.owner.chat_id,
      post_id: group.post_id,
      type: 'reaction',
      text: `❤️ ${who} menyukai kiriman kamu\n\n${postUrl(group.post_id)}`,
    });
  }

  return messages;
}
```

- [ ] **Step 4: Jalankan tes, pastikan lulus**

Run: `node --test tests/teras-telegram-digest.test.js`
Expected: PASS — 9 tes lulus, 0 gagal

- [ ] **Step 5: Commit**

```bash
git add lib/teras-telegram-digest.js tests/teras-telegram-digest.test.js
git commit -m "feat(teras): lib penggabungan pesan digest telegram"
```

---

### Task 6: Sapuan cron per menit

**Files:**
- Modify: `server.js` — tambahkan blok sapuan setelah blok cron custom-domain (`server.js:6395`)

**Interfaces:**
- Consumes: `buildTerasDigestMessages`, `TERAS_DIGEST_WINDOW_MS`, `TERAS_DIGEST_LOOKBACK_MS` (Task 5); `TERAS_TG_SENT_AT_KEY` (Task 1)
- Produces: `runTerasTelegramDigestSweep() => Promise<{ sent: number, owners: number }>` — dikembalikan agar bisa dipanggil manual saat verifikasi

- [ ] **Step 1: Tambahkan import**

Di `server.js`, dekat import `./lib/teras-notification-prefs.js` dari Task 2:

```js
import {
  TERAS_DIGEST_LOOKBACK_MS,
  TERAS_DIGEST_WINDOW_MS,
  buildTerasDigestMessages,
} from './lib/teras-telegram-digest.js';
```

- [ ] **Step 2: Tulis fungsi sapuan dan cron-nya**

Sisipkan setelah blok `if (shouldRunBackgroundJobs()) cron.schedule('* * * * *', ...)` yang sudah ada (`server.js:6395`):

```js
let terasDigestSweepRunning = false;

/**
 * Sapuan digest Telegram Teras.
 *
 * Dua query GLOBAL per menit untuk seluruh sistem, bukan satu query per agen —
 * inilah sebabnya fitur ini tidak butuh tabel antrian. Watermark disimpan di
 * baris agen, jadi restart dan deploy tidak menduplikasi maupun menghilangkan
 * pesan; timer di memori akan bocor pada keduanya.
 */
async function runTerasTelegramDigestSweep() {
  const now = Date.now();
  const cutoffIso = new Date(now - TERAS_DIGEST_WINDOW_MS).toISOString();
  const floorIso = new Date(now - TERAS_DIGEST_LOOKBACK_MS).toISOString();

  const [commentResult, reactionResult] = await Promise.all([
    supabase
      .from('community_post_comments')
      .select('id, post_id, agent_id, created_at, author:agents(name), post:community_posts!inner(agent_id, deleted_at)')
      .gte('created_at', floorIso)
      .lte('created_at', cutoffIso)
      .is('deleted_at', null)
      .is('post.deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(500),
    supabase
      .from('community_post_reactions')
      .select('post_id, agent_id, created_at, author:agents(name), post:community_posts!inner(agent_id, deleted_at)')
      .gte('created_at', floorIso)
      .lte('created_at', cutoffIso)
      .is('post.deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(500),
  ]);

  if (commentResult.error) throw commentResult.error;
  if (reactionResult.error) throw reactionResult.error;

  const comments = (commentResult.data || []).map(row => ({
    id: row.id,
    post_id: row.post_id,
    created_at: row.created_at,
    owner_agent_id: row.post?.agent_id,
    actor_agent_id: row.agent_id,
    actor_name: row.author?.name || null,
  }));
  const reactions = (reactionResult.data || []).map(row => ({
    post_id: row.post_id,
    created_at: row.created_at,
    owner_agent_id: row.post?.agent_id,
    actor_agent_id: row.agent_id,
    actor_name: row.author?.name || null,
  }));

  const ownerIds = [...new Set([...comments, ...reactions].map(row => row.owner_agent_id).filter(Boolean))];
  if (ownerIds.length === 0) return { sent: 0, owners: 0 };

  const { data: ownerRows, error: ownerError } = await supabase
    .from('agents')
    .select('id, telegram_chat_id, notification_prefs')
    .in('id', ownerIds)
    .not('telegram_chat_id', 'is', null);
  if (ownerError) throw ownerError;

  const owners = (ownerRows || []).map(row => ({
    id: row.id,
    chat_id: row.telegram_chat_id,
    prefs: row.notification_prefs || {},
    sent_at: (row.notification_prefs || {})[TERAS_TG_SENT_AT_KEY] || null,
  }));
  if (owners.length === 0) return { sent: 0, owners: 0 };

  // Balasan yang juga menyebut pemilik kiriman sudah terkirim instan lewat
  // jalur mention; ambil sebutan pada jendela yang sama untuk membuangnya.
  let mentions = [];
  const mentionResult = await supabase
    .from('community_mentions')
    .select('comment_id, mentioned_agent_id')
    .gte('created_at', floorIso)
    .lte('created_at', cutoffIso)
    .in('mentioned_agent_id', owners.map(owner => owner.id))
    .limit(500);
  if (mentionResult.error) {
    if (!isCommunityMentionSchemaMissing(mentionResult.error)) throw mentionResult.error;
  } else {
    mentions = mentionResult.data || [];
  }

  const messages = buildTerasDigestMessages({
    comments, reactions, mentions, owners, origin: communityPublicOrigin(),
  });
  if (messages.length === 0) return { sent: 0, owners: owners.length };

  const deliveredOwners = new Set();
  for (const message of messages) {
    // Isolasi per pesan: satu chat_id yang memblokir bot tidak boleh
    // membatalkan pengiriman ke agen lain. Ini persis kegagalan yang dulu
    // membekukan retensi analytics.
    try {
      await sendTelegramMessageDirect(message.chat_id, message.text);
      deliveredOwners.add(message.agent_id);
    } catch (err) {
      console.warn('[teras-digest] gagal kirim ke', message.agent_id, err.message);
    }
  }

  for (const ownerId of deliveredOwners) {
    try {
      const { data: fresh, error: freshError } = await supabase
        .from('agents')
        .select('notification_prefs')
        .eq('id', ownerId)
        .single();
      if (freshError) throw freshError;
      const merged = { ...(fresh?.notification_prefs || {}), [TERAS_TG_SENT_AT_KEY]: cutoffIso };
      const { error: updateError } = await supabase
        .from('agents')
        .update({ notification_prefs: merged })
        .eq('id', ownerId);
      if (updateError) throw updateError;
    } catch (err) {
      console.warn('[teras-digest] gagal memajukan watermark', ownerId, err.message);
    }
  }

  return { sent: messages.length, owners: owners.length };
}

if (shouldRunBackgroundJobs()) cron.schedule('* * * * *', async () => {
  if (terasDigestSweepRunning) return;
  if (isDbDegraded()) return; // shed: jangan tembak DB saat restart
  terasDigestSweepRunning = true;
  try {
    const result = await runTerasTelegramDigestSweep();
    if (result.sent > 0) console.log(`[teras-digest] terkirim ${result.sent} pesan`);
  } catch (err) {
    console.error('[teras-digest] sweep error:', err.message);
  } finally {
    terasDigestSweepRunning = false;
  }
});
```

Watermark sengaja hanya dimajukan untuk pemilik yang **benar-benar** menerima pesan. Memajukannya untuk semua akan menelan peristiwa yang gagal terkirim.

- [ ] **Step 3: Verifikasi sapuan tidak meledak saat kosong**

Restart server dengan latar aktif:

```bash
ENABLE_BACKGROUND_JOBS=true node server.js 2>&1 | grep -i "teras-digest"
```

Expected: tidak ada baris `sweep error` dalam 2 menit pertama. Kalau ada, baca pesannya — kesalahan nama kolom pada `select` akan muncul di sini, bukan sebagai kegagalan senyap.

- [ ] **Step 4: Verifikasi jalur bahagia dengan data sungguhan**

Dengan akun uji yang Telegram-nya tersambung: nyalakan `teras_tg_reaction`, minta agen lain menyukai salah satu kiriman akun uji, lalu tunggu 11 menit (jendela 10 menit + satu tik cron).

Expected: satu pesan Telegram `❤️ <Nama> menyukai kiriman kamu` berisi tautan ke kiriman itu. Sukai lagi dari akun ketiga dalam jendela yang sama, dan pastikan pesan berikutnya berbunyi "dan 1 lainnya" — bukan dua pesan terpisah.

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "feat(teras): sapuan cron digest telegram untuk komentar & reaksi"
```

---

### Task 7: `@semua` instan ke Telegram

**Files:**
- Modify: `server.js` — fungsi baru dekat `recordCommunityMentions` (`server.js:4041`), pemanggilan di route pembuatan kiriman (`server.js:5534`)

**Interfaces:**
- Consumes: `telegramSourceFlags` dari Task 1
- Produces: `notifyCommunityBroadcastTelegram({ post, authorAgent }) => Promise<void>`

- [ ] **Step 1: Tulis fungsi fan-out**

Sisipkan tepat setelah fungsi `communityMentionSnippet` (`server.js:4116`):

```js
/**
 * Broadcast @semua dikirim instan — satu peristiwa tunggal, tidak ada yang perlu
 * digabung, dan menundanya membatalkan alasan @semua dipakai.
 *
 * Penulisnya sendiri tidak diberi tahu. Kegagalan satu chat_id tidak boleh
 * menggagalkan pembuatan kiriman, jadi seluruh badan fungsi ini menelan error.
 */
async function notifyCommunityBroadcastTelegram({ post, authorAgent }) {
  try {
    const { data: members, error } = await supabase
      .from('agents')
      .select('id, telegram_chat_id, notification_prefs')
      .not('telegram_chat_id', 'is', null)
      .neq('id', authorAgent.id);
    if (error) throw error;

    const authorName = authorAgent.name || 'Seseorang';
    const snippet = communityMentionSnippet(post.body);
    const link = `${communityPublicOrigin()}/dashboard/teras/post/${post.id}`;
    const text = `📢 <b>${escapeHtml(authorName)}</b> mengirim pengumuman untuk semua agent`
      + (snippet ? `\n\n${escapeHtml(snippet)}` : '')
      + `\n\n${link}`;

    for (const member of members || []) {
      if (!telegramSourceFlags(member.notification_prefs).broadcasts) continue;
      sendTelegramMessageDirect(member.telegram_chat_id, text).catch(() => {});
    }
  } catch (err) {
    console.error('[community] broadcast telegram error:', err.message);
  }
}
```

- [ ] **Step 2: Panggil dari route pembuatan kiriman**

Di route `POST /api/community/posts`, tepat **setelah** blok `await recordCommunityMentions({...})` (`server.js:5534`):

```js
    if (mentionsEveryone) {
      await notifyCommunityBroadcastTelegram({ post: createdPost, authorAgent: agent });
    }
```

Posisinya penting: blok ini berada setelah `if (insertError) throw insertError;`, jadi notifikasi hanya memancar ketika kiriman benar-benar tersimpan. Notifikasi yang dipancarkan sebelum jalur gagal akan terkirim berulang saat ada percobaan ulang — kegagalan yang sama pernah membuat notifikasi pembayaran berkedip berulang.

- [ ] **Step 3: Verifikasi gerbang preferensi**

Restart server. Dengan akun uji A (Telegram tersambung, `teras_tg_broadcast` masih default `false`), kirim `@semua` dari akun B.

Expected: **tidak ada** pesan Telegram ke A — default mati harus benar-benar mati.

Lalu nyalakan `teras_tg_broadcast` untuk A dan ulangi:

```bash
curl -s -X PUT -H "Authorization: Bearer $TOKEN_A" -H 'Content-Type: application/json' \
  -d '{"teras_tg_broadcast":true}' http://localhost:3000/api/community/notification-prefs
```

Expected: A menerima `📢 <Nama B> mengirim pengumuman untuk semua agent` beserta cuplikan dan tautan; B (penulisnya) tidak menerima apa pun.

- [ ] **Step 4: Jalankan seluruh tes terkait**

Run: `node --test tests/community-notifications.test.js tests/teras-notification-prefs.test.js tests/teras-telegram-digest.test.js`
Expected: PASS semua

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "feat(teras): broadcast @semua instan ke telegram"
```

---

### Task 8: Kontrak UI & verifikasi manual sebelum rilis

Unit test tidak bisa membuktikan pesan Telegram sungguhan sampai dengan format yang benar. Task ini menutup celah itu secara eksplisit alih-alih mengaku selesai berdasarkan test suite.

**Files:**
- Modify: `tests/teras-page.browser.test.js`
- Modify: `docs/superpowers/specs/2026-07-20-teras-notification-settings-design.md` (tandai bagian "Verifikasi manual" sebagai sudah dijalankan, dengan tanggal)

**Interfaces:**
- Consumes: komponen dari Task 4, endpoint dari Task 2
- Produces: —

- [ ] **Step 1: Tambahkan tes kontrak UI**

Tambahkan di `tests/teras-page.browser.test.js`, mengikuti pola `describe`/`test` yang sudah ada di berkas itu (rute API di-stub lewat `page.route`, lihat contoh stub yang sudah ada di berkas tersebut):

```js
test('gerigi membuka sheet dan meredupkan kolom Telegram saat belum tersambung', async () => {
  const page = await browser.newPage();
  await page.route('**/api/community/notification-prefs', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      data: {
        prefs: {
          teras_bell_mention: true, teras_bell_comment: true,
          teras_bell_reaction: true, teras_bell_broadcast: true,
          community_mentions: true, teras_tg_comment: false,
          teras_tg_reaction: false, teras_tg_broadcast: false,
        },
        telegram_connected: false,
      },
    }),
  }));

  await page.goto(`${appOrigin}/dashboard/teras`);
  await page.getByRole('button', { name: 'Pengaturan notifikasi Teras' }).click();

  const sheet = page.getByRole('dialog', { name: 'Pengaturan notifikasi Teras' });
  await sheet.waitFor();
  await assert.doesNotReject(sheet.getByText('Telegram belum tersambung').waitFor());

  const tgSwitch = sheet.getByRole('switch', { name: 'Reaksi ke Telegram' });
  assert.equal(await tgSwitch.isDisabled(), true, 'kolom Telegram tidak bisa diketuk sebelum tersambung');

  const bellSwitch = sheet.getByRole('switch', { name: 'Reaksi di lonceng' });
  assert.equal(await bellSwitch.isDisabled(), false);
  await page.close();
});

test('saklar kembali ke posisi semula saat penyimpanan gagal', async () => {
  const page = await browser.newPage();
  await page.route('**/api/community/notification-prefs', route => {
    if (route.request().method() === 'PUT') {
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          prefs: {
            teras_bell_mention: true, teras_bell_comment: true,
            teras_bell_reaction: true, teras_bell_broadcast: true,
            community_mentions: true, teras_tg_comment: false,
            teras_tg_reaction: false, teras_tg_broadcast: false,
          },
          telegram_connected: true,
        },
      }),
    });
  });

  await page.goto(`${appOrigin}/dashboard/teras`);
  await page.getByRole('button', { name: 'Pengaturan notifikasi Teras' }).click();

  const bellSwitch = page.getByRole('switch', { name: 'Reaksi di lonceng' });
  await bellSwitch.click();
  await page.getByRole('alert').waitFor();
  assert.equal(await bellSwitch.getAttribute('aria-checked'), 'true', 'saklar kembali menyala setelah PUT gagal');
  await page.close();
});
```

- [ ] **Step 2: Jalankan tes browser**

Run: `node --test tests/teras-page.browser.test.js`
Expected: PASS semua, termasuk dua tes baru. Tes ini menyalakan Vite dan Chromium — jalannya lebih lama dari tes lain, itu wajar.

- [ ] **Step 3: Jalankan seluruh berkas tes yang tersentuh**

Run: `node --test tests/teras-notification-prefs.test.js tests/teras-telegram-digest.test.js tests/community-notifications.test.js tests/teras-page.browser.test.js`
Expected: PASS semua. Laporkan angka sesungguhnya (lulus/gagal) — jangan mengklaim hijau tanpa menempelkan keluarannya.

- [ ] **Step 4: Verifikasi manual Telegram, keempat jalur**

Tidak ada satu pun yang tercakup unit test. Kerjakan dengan akun uji yang Telegram-nya tersambung, dan centang satu per satu:

1. **Sebutan** — agen lain menyebut `@nama` Anda → pesan instan, format lama tidak berubah.
2. **`@semua`** — agen lain mengirim pengumuman → pesan instan `📢`, penulisnya sendiri tidak menerima.
3. **Komentar terkumpul** — tiga balasan pada satu kiriman Anda dalam 10 menit → **satu** pesan "3 balasan baru", bukan tiga.
4. **Reaksi terkumpul** — dua agen menyukai kiriman yang sama → **satu** pesan "dan 1 lainnya".

Lalu matikan keempat saklar Telegram dan ulangi keempatnya: tidak boleh ada pesan sama sekali.

- [ ] **Step 5: Perbarui spec dan commit**

Di `docs/superpowers/specs/2026-07-20-teras-notification-settings-design.md`, pada bagian "Verifikasi manual yang wajib", tambahkan satu baris tanggal pelaksanaan dan hasilnya.

```bash
git add tests/teras-page.browser.test.js docs/superpowers/specs/2026-07-20-teras-notification-settings-design.md
git commit -m "test(teras): kontrak UI pengaturan notifikasi + catatan verifikasi manual"
```

---

## Catatan rilis

Kolom Telegram default mati untuk komentar, reaksi, dan `@semua`. Tanpa pengumuman ke para agen, fitur ini akan nyaris tidak terpakai — itu konsekuensi sadar dari keputusan "nol kejutan saat rilis", bukan kelalaian. Sertakan pengumuman singkat saat rilis.
