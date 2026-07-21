# Reaksi Emoji ala WhatsApp untuk Teras — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ganti tombol Heart tunggal pada komentar & kiriman Teras dengan picker emoji ala WhatsApp (ikon smile-plus → bilah 7 emoji), tampilkan gugus emoji + total, dan panel "siapa bereaksi apa".

**Architecture:** Satu registri reaksi bersama (`lib/community-reactions.js` + `.d.ts`) menjadi sumber tunggal untuk server (`server.js`) DAN frontend (React/TS) — pola yang sudah dipakai proyek (`lib/categoryOps.js` + `.d.ts`, `lib/teras-linkify.js` dipakai FE). Backend tabel `community_post_reactions` tetap (satu reaksi per agen per target); hanya CHECK-nya diperluas. UI baru: `ReactionPicker`, `ReactionSummary`, `ReactionListSheet`, plus endpoint `GET …/reactions`.

**Tech Stack:** Node/Express (`server.js`, ESM), Supabase JS, React 18 + TypeScript, Tailwind, framer-motion, lucide-react, Vite.

## Global Constraints

- **Set emoji terurut (7):** `suka`=👍 "Suka", `cinta`=❤️ "Cinta", `aamiin`=🤲 "Aamiin", `selamat`=🎉 "Barakallah", `senang`=😊 "Senang", `masyaallah`=😮 "Masyaallah", `semangat`=🔥 "Semangat". Urutan ini dipakai di picker dan sebagai tie-break jumlah.
- **Kunci lama dipertahankan** (`suka`,`aamiin`,`selamat`) — enum hanya bertambah, tak pernah dihapus. Tidak ada migrasi baris data.
- **Satu reaksi per agen per target** (PK `(post_id,agag_id)`), tidak berubah.
- **Komentar = kiriman** (baris `community_posts`), satu jalur backend melayani keduanya.
- **Urutan rilis WAJIB:** migrasi DB (perluas CHECK) diterapkan di Supabase **sebelum** deploy kode. Kalau tidak, POST reaksi emoji baru ditolak constraint (400/DB error).
- **DDL manual:** tak ada exec_sql/psql/URL DB — user menempel SQL di Supabase SQL Editor.
- **Verifikasi:** implementasi + verifikasi cepat oleh agen (node --check, `node --test`, `npx tsc --noEmit`, `npm run build:spa`); tes e2e/manual dijalankan user (lihat catatan di bawah).

**Catatan testing:** Codebase memakai `node:test` untuk pure-logic di `lib/*.js` (mis. `tests/community-access.test.js`) dan **tidak** punya runner unit untuk komponen React. Maka: Task registri (`lib/community-reactions.js`) memakai TDD `node:test`. Komponen React & wiring diverifikasi dengan `npx tsc --noEmit` + `npm run build:spa` (bukan test unit komponen) dan checklist manual untuk user — sesuai preferensi tercatat.

---

### Task 1: Registri reaksi bersama (`lib/community-reactions.js` + `.d.ts`)

Sumber tunggal set reaksi untuk server & FE. Pure, tanpa dependensi.

**Files:**
- Create: `lib/community-reactions.js`
- Create: `lib/community-reactions.d.ts`
- Test: `tests/community-reactions.test.js`

**Interfaces:**
- Consumes: —
- Produces:
  - `COMMUNITY_REACTIONS: { key, emoji, label }[]` (7, terurut)
  - `COMMUNITY_REACTION_TYPES: string[]` (kunci saja)
  - `REACTION_EMOJI: Record<key,string>`, `REACTION_LABEL: Record<key,string>`
  - `emptyReactionCounts(): Record<key, number>` (semua 0)
  - `sumReactions(counts): number`
  - `topReactionEmojis(counts, limit=3): string[]` (emoji count>0, urut desc jumlah lalu urutan definisi, maks `limit`)
  - Tipe: `ReactionType`, `ReactionCounts = Record<ReactionType, number>`, `CommunityReaction`

- [ ] **Step 1: Tulis test yang gagal**

Create `tests/community-reactions.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMUNITY_REACTIONS,
  COMMUNITY_REACTION_TYPES,
  emptyReactionCounts,
  sumReactions,
  topReactionEmojis,
} from '../lib/community-reactions.js';

test('registri memuat 7 reaksi terurut dengan kunci lama dipertahankan', () => {
  assert.equal(COMMUNITY_REACTIONS.length, 7);
  assert.deepEqual(
    COMMUNITY_REACTION_TYPES,
    ['suka', 'cinta', 'aamiin', 'selamat', 'senang', 'masyaallah', 'semangat'],
  );
  // kunci lama tetap ada (baris DB lama = subset)
  for (const k of ['suka', 'aamiin', 'selamat']) {
    assert.ok(COMMUNITY_REACTION_TYPES.includes(k));
  }
});

test('emptyReactionCounts menginisialisasi semua kunci ke 0', () => {
  const counts = emptyReactionCounts();
  assert.deepEqual(Object.keys(counts).sort(), [...COMMUNITY_REACTION_TYPES].sort());
  assert.ok(Object.values(counts).every(v => v === 0));
});

test('sumReactions menjumlah semua kunci dan tahan input null', () => {
  assert.equal(sumReactions({ suka: 5, cinta: 3, aamiin: 2, selamat: 0, senang: 1, masyaallah: 0, semangat: 0 }), 11);
  assert.equal(sumReactions(null), 0);
  assert.equal(sumReactions(undefined), 0);
});

test('topReactionEmojis urut desc jumlah, tie = urutan definisi, hormati limit', () => {
  const counts = { suka: 5, cinta: 3, aamiin: 2, selamat: 1, senang: 1, masyaallah: 0, semangat: 0 };
  assert.deepEqual(topReactionEmojis(counts, 3), ['👍', '❤️', '🤲']);
  // tie antara selamat(1) & senang(1): selamat lebih dulu didefinisikan
  assert.deepEqual(topReactionEmojis({ selamat: 1, senang: 1 }, 2), ['🎉', '😊']);
  assert.deepEqual(topReactionEmojis(emptyReactionCounts(), 3), []);
});
```

- [ ] **Step 2: Jalankan test — pastikan GAGAL**

Run: `node --test tests/community-reactions.test.js`
Expected: FAIL — `Cannot find module '../lib/community-reactions.js'`.

- [ ] **Step 3: Implementasi `lib/community-reactions.js`**

```js
// Sumber tunggal set reaksi Teras — dipakai server.js DAN frontend (via .d.ts).
// Enum HANYA bertambah (jangan hapus kunci lama: baris DB lama tersimpan sebagai
// 'suka'/'selamat'/'aamiin'). Urutan array = urutan tampil di picker + tie-break jumlah.
export const COMMUNITY_REACTIONS = [
  { key: 'suka', emoji: '👍', label: 'Suka' },
  { key: 'cinta', emoji: '❤️', label: 'Cinta' },
  { key: 'aamiin', emoji: '🤲', label: 'Aamiin' },
  { key: 'selamat', emoji: '🎉', label: 'Barakallah' },
  { key: 'senang', emoji: '😊', label: 'Senang' },
  { key: 'masyaallah', emoji: '😮', label: 'Masyaallah' },
  { key: 'semangat', emoji: '🔥', label: 'Semangat' },
];

export const COMMUNITY_REACTION_TYPES = COMMUNITY_REACTIONS.map(r => r.key);
export const REACTION_EMOJI = Object.fromEntries(COMMUNITY_REACTIONS.map(r => [r.key, r.emoji]));
export const REACTION_LABEL = Object.fromEntries(COMMUNITY_REACTIONS.map(r => [r.key, r.label]));

export function emptyReactionCounts() {
  const counts = {};
  for (const { key } of COMMUNITY_REACTIONS) counts[key] = 0;
  return counts;
}

export function sumReactions(counts) {
  if (!counts) return 0;
  let total = 0;
  for (const { key } of COMMUNITY_REACTIONS) total += counts[key] || 0;
  return total;
}

// Emoji distinct dengan count>0, urut jumlah desc; tie mempertahankan urutan
// definisi (filter menjaga urutan + Array.sort stabil). Maks `limit` emoji.
export function topReactionEmojis(counts, limit = 3) {
  if (!counts) return [];
  return COMMUNITY_REACTIONS
    .filter(r => (counts[r.key] || 0) > 0)
    .sort((a, b) => (counts[b.key] || 0) - (counts[a.key] || 0))
    .slice(0, limit)
    .map(r => r.emoji);
}
```

- [ ] **Step 4: Implementasi `lib/community-reactions.d.ts`**

```ts
export type ReactionType =
  | 'suka' | 'cinta' | 'aamiin' | 'selamat' | 'senang' | 'masyaallah' | 'semangat';

export interface CommunityReaction {
  key: ReactionType;
  emoji: string;
  label: string;
}

export type ReactionCounts = Record<ReactionType, number>;

export const COMMUNITY_REACTIONS: CommunityReaction[];
export const COMMUNITY_REACTION_TYPES: ReactionType[];
export const REACTION_EMOJI: Record<ReactionType, string>;
export const REACTION_LABEL: Record<ReactionType, string>;
export function emptyReactionCounts(): ReactionCounts;
export function sumReactions(counts: ReactionCounts | null | undefined): number;
export function topReactionEmojis(counts: ReactionCounts | null | undefined, limit?: number): string[];
```

- [ ] **Step 5: Jalankan test — pastikan LULUS**

Run: `node --test tests/community-reactions.test.js`
Expected: PASS (4 test).

- [ ] **Step 6: Commit**

```bash
git add lib/community-reactions.js lib/community-reactions.d.ts tests/community-reactions.test.js
git commit -m "feat(teras): registri reaksi bersama (7 emoji) + helper hitung"
```

---

### Task 2: Server memakai registri (perluas enum, ganti literal count)

**Files:**
- Modify: `server.js` — hapus `const COMMUNITY_REACTION_TYPES` lokal (baris ~3995), impor dari registri, ganti 6 literal `{ suka: 0, selamat: 0, aamiin: 0 }`.

**Interfaces:**
- Consumes: `COMMUNITY_REACTION_TYPES`, `emptyReactionCounts` dari Task 1.
- Produces: server menerima & menghitung 7 kunci reaksi.

- [ ] **Step 1: Tambah impor registri**

Di blok impor atas `server.js` (dekat baris 63, `import { requireCommunityAccess … } from './lib/community-access.js';`), tambahkan:
```js
import { COMMUNITY_REACTION_TYPES, emptyReactionCounts } from './lib/community-reactions.js';
```

- [ ] **Step 2: Hapus konstanta lokal**

Hapus baris ~3995:
```js
const COMMUNITY_REACTION_TYPES = ['suka', 'selamat', 'aamiin'];
```
(Sekarang datang dari impor. Semua pemakaian `COMMUNITY_REACTION_TYPES.includes(...)` tetap bekerja.)

- [ ] **Step 3: Ganti semua literal count**

Ganti tiap literal `{ suka: 0, selamat: 0, aamiin: 0 }` dengan `emptyReactionCounts()`. Verifikasi lokasi dulu:
```bash
grep -n "{ suka: 0, selamat: 0, aamiin: 0 }" server.js
```
Ganti di **semua** baris hasil (saat ditulis: 4413, 5881, 6408, 6664, 6704, 6852). Contoh:
```js
// 4413
const reactionCounts = new Map(postIds.map(id => [id, emptyReactionCounts()]));
// 5881
const reactions = emptyReactionCounts();
// 6408, 6852
reactions: emptyReactionCounts(),
// 6664
const commentReactionCounts = new Map(reactionTargetIds.map(id => [id, emptyReactionCounts()]));
// 6704
reactions: commentReactionCounts.get(row.id) || emptyReactionCounts(),
```
Setelah ganti, pastikan tidak ada sisa:
```bash
grep -n "{ suka: 0, selamat: 0, aamiin: 0 }" server.js   # harus kosong
```

- [ ] **Step 4: Verifikasi sintaks + test community lama**

Run: `node --check server.js && node --test tests/community-access.test.js`
Expected: no syntax error; test community-access tetap PASS.

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "feat(teras): server pakai registri reaksi (7 kunci) + emptyReactionCounts"
```

---

### Task 3: Migrasi DB (perluas CHECK) — berkas dokumentasi

Berkas migrasi untuk dokumentasi & histori; **dijalankan manual** oleh user di Supabase.

**Files:**
- Create: `migrations/20260727000000_community_reaction_emoji.sql`

**Interfaces:**
- Consumes: —
- Produces: constraint DB menerima 7 nilai reaksi.

- [ ] **Step 1: Tulis berkas migrasi**

```sql
-- Perluas set reaksi Teras dari 3 -> 7 nilai (picker emoji ala WhatsApp).
-- Enum hanya bertambah; baris lama ('suka'/'selamat'/'aamiin') tetap valid.
-- JALANKAN DI SUPABASE SQL EDITOR SEBELUM DEPLOY KODE.
-- Catatan: constraint inline auto-bernama community_post_reactions_reaction_check.
-- Jika di dashboard namanya berbeda, sesuaikan nama pada DROP CONSTRAINT.
ALTER TABLE community_post_reactions
  DROP CONSTRAINT community_post_reactions_reaction_check,
  ADD CONSTRAINT community_post_reactions_reaction_check
    CHECK (reaction IN ('suka','selamat','aamiin','cinta','senang','masyaallah','semangat'));
```

- [ ] **Step 2: Commit**

```bash
git add migrations/20260727000000_community_reaction_emoji.sql
git commit -m "docs(teras): migrasi perluas CHECK reaksi jadi 7 nilai (dijalankan manual)"
```

- [ ] **Step 3: Serahkan ke user (checklist, bukan dijalankan agen)**

Tambahkan ke checklist manual Task 11: user menempel isi berkas ini ke Supabase SQL Editor dan mengonfirmasi tak ada error, **sebelum** deploy.

---

### Task 4: Endpoint `GET /api/community/posts/:id/reactions`

Daftar agen yang bereaksi pada satu target (post/komentar), untuk panel "siapa bereaksi apa".

**Files:**
- Modify: `server.js` — tambah handler baru tepat setelah endpoint POST reaction (setelah baris ~6550).

**Interfaces:**
- Consumes: `isCommunityUuid`, `loadActiveCommunityPost`, `getAgentById`, `requireCommunityAccess`, `communityAuthorProfile`, `COMMUNITY_REACTION_TYPES`, `supabase`.
- Produces: `GET …/reactions` → `{ data: { reactions: [{ agent:{name,slug,photo}, reaction, created_at }], truncated: boolean } }`.

- [ ] **Step 1: Tambah handler**

Sisipkan setelah handler `app.post('/api/community/posts/:id/reaction', …)` (setelah baris ~6550), sebelum `app.get('…/comments', …)`:
```js
app.get('/api/community/posts/:id/reactions', authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentById(req.user.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (!requireCommunityAccess(agent, res)) return;

    if (!isCommunityUuid(req.params.id)) {
      return res.status(404).json({ error: 'Postingan tidak ditemukan' });
    }
    const post = await loadActiveCommunityPost(req.params.id);
    if (!post) return res.status(404).json({ error: 'Postingan tidak ditemukan' });

    const LIMIT = 200;
    const { data, error, count } = await supabase
      .from('community_post_reactions')
      .select('reaction, created_at, agent:agents(name, slug, photo)', { count: 'exact' })
      .eq('post_id', post.id)
      .order('created_at', { ascending: true })
      .limit(LIMIT);
    if (error) throw error;

    const reactions = (data || [])
      .filter(row => COMMUNITY_REACTION_TYPES.includes(row.reaction))
      .map(row => ({
        agent: communityAuthorProfile(row.agent),
        reaction: row.reaction,
        created_at: row.created_at,
      }));
    const truncated = typeof count === 'number' && count > LIMIT;
    if (truncated) {
      console.warn(`[community] reaction list truncated: db count=${count} cap=${LIMIT} at GET /api/community/posts/${post.id}/reactions`);
    }

    res.json({ data: { reactions, truncated } });
  } catch (err) {
    console.error('[community] reaction list error:', err);
    res.status(500).json({ error: 'Gagal memuat daftar reaksi' });
  }
});
```

- [ ] **Step 2: Verifikasi sintaks**

Run: `node --check server.js`
Expected: no syntax error.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat(teras): endpoint GET daftar reaktor per target (panel siapa-bereaksi-apa)"
```

- [ ] **Step 4: Tambahkan curl ke checklist manual (Task 11)**

```
curl -s -H "Authorization: Bearer <JWT>" \
  http://localhost:<port>/api/community/posts/<postId>/reactions | jq
# harap: { "data": { "reactions": [...], "truncated": false } }
```

---

### Task 5: FE adopsi tipe registri (tanpa ubah perilaku UI)

Refactor tipe: FE memakai `ReactionType`/`ReactionCounts` dari registri, ganti literal fallback & penjumlahan. UI masih Heart (belum diganti) — build harus identik secara perilaku.

**Files:**
- Modify: `src/components/TerasPage.tsx` — hapus `export type ReactionType` (63) & `interface ReactionCounts` (79-83), impor dari registri; ganti literal & sum.
- Modify: `src/components/teras/CommentThread.tsx` — impor `ReactionType` dari registri (bukan dari `../TerasPage`).

**Interfaces:**
- Consumes: `ReactionType`, `ReactionCounts`, `emptyReactionCounts`, `sumReactions` dari Task 1.
- Produces: tipe reaksi FE bersumber tunggal; perilaku UI tidak berubah.

- [ ] **Step 1: Impor registri di `TerasPage.tsx`**

Dekat impor lain (mis. setelah baris 61 `import { broadcastQuotaLabel … } from '../../lib/community-broadcast.js';`):
```ts
import {
  emptyReactionCounts,
  sumReactions,
} from '../../lib/community-reactions.js';
import type { ReactionType, ReactionCounts } from '../../lib/community-reactions.js';
```

- [ ] **Step 2: Hapus definisi tipe lokal**

- Hapus baris 63: `export type ReactionType = 'suka' | 'selamat' | 'aamiin';`
- Hapus `interface ReactionCounts { suka:number; selamat:number; aamiin:number; }` (79-83).

Karena `ReactionType` sebelumnya di-`export` dan diimpor `CommentThread.tsx`, tambahkan re-export agar impor lama tetap ada ATAU ubah impor CommentThread (Step 6). Pilih re-export supaya minim churn:
```ts
export type { ReactionType } from '../../lib/community-reactions.js';
```

- [ ] **Step 3: Ganti literal fallback jadi `emptyReactionCounts()`**

Verifikasi lokasi: `grep -n "{ suka: 0, selamat: 0, aamiin: 0 }" src/components/TerasPage.tsx`
Ganti di baris 495, 3319, 3330:
```ts
// 495
const reactions = comment.reactions ?? emptyReactionCounts();
// 3319
const previousReactions = snapshot.reactions ?? emptyReactionCounts();
// 3330
const reactions = { ...(comment.reactions ?? emptyReactionCounts()) };
```

- [ ] **Step 4: Ganti penjumlahan total jadi `sumReactions()`**

```ts
// 497 (buildCommentReactionMaps)
reactionCounts[comment.id] = sumReactions(reactions);
// 4247 (kartu kiriman)
const totalReactions = sumReactions(post.reactions);
```

- [ ] **Step 5: Ganti impor `ReactionType` di `CommentThread.tsx`**

Baris 5:
```ts
import type { CommunityComment } from '../TerasPage';
import type { ReactionType } from '../../lib/community-reactions.js';
```
(Pisahkan: `CommunityComment` tetap dari `../TerasPage`, `ReactionType` dari registri.)

- [ ] **Step 6: Typecheck + build**

Run: `npx tsc --noEmit && npm run build:spa`
Expected: tsc lolos (0 error), build sukses. Jika ada error `reactions[previousReaction]` indexing — pastikan tipe `ReactionCounts = Record<ReactionType, number>` sudah dari registri (mendukung index by `ReactionType`).

- [ ] **Step 7: Commit**

```bash
git add src/components/TerasPage.tsx src/components/teras/CommentThread.tsx
git commit -m "refactor(teras): FE pakai tipe reaksi dari registri bersama"
```

---

### Task 6: Komponen `ReactionPicker`

Trigger smile-plus + bilah 7 emoji; buka saat klik/tap; tutup saat pilih/klik-luar/Esc.

**Files:**
- Create: `src/components/teras/ReactionPicker.tsx`

**Interfaces:**
- Consumes: `COMMUNITY_REACTIONS`, `REACTION_EMOJI`, `REACTION_LABEL`, `ReactionType` dari registri.
- Produces: `export function ReactionPicker(props: { myReaction: ReactionType | null; onPick: (r: ReactionType | null) => void; disabled?: boolean; size?: 'post' | 'comment' })`.

- [ ] **Step 1: Implementasi komponen**

```tsx
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { SmilePlus } from 'lucide-react';
import { COMMUNITY_REACTIONS, REACTION_EMOJI, REACTION_LABEL } from '../../../lib/community-reactions.js';
import type { ReactionType } from '../../../lib/community-reactions.js';

interface ReactionPickerProps {
  myReaction: ReactionType | null;
  onPick: (reaction: ReactionType | null) => void;
  disabled?: boolean;
  size?: 'post' | 'comment';
}

export function ReactionPicker({ myReaction, onPick, disabled, size = 'comment' }: ReactionPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onDocDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const iconPx = size === 'post' ? 19 : 15;
  const active = myReaction != null;

  const handlePick = (key: ReactionType) => {
    onPick(key === myReaction ? null : key);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="Pilih reaksi"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.94 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            style={{ transformOrigin: 'bottom left' }}
            className="absolute bottom-full left-0 z-30 mb-2 flex gap-0.5 rounded-full border border-gray-200 bg-white px-2 py-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-800"
          >
            {COMMUNITY_REACTIONS.map(({ key, emoji, label }) => (
              <button
                key={key}
                type="button"
                role="menuitem"
                aria-label={label}
                title={label}
                onClick={() => handlePick(key as ReactionType)}
                className={`flex min-h-11 min-w-11 items-center justify-center rounded-full text-2xl leading-none transition-transform hover:-translate-y-1 hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${
                  key === myReaction ? 'bg-emerald-500/15' : ''
                }`}
              >
                <span aria-hidden="true">{emoji}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={active ? `Reaksi kamu: ${REACTION_LABEL[myReaction]}` : 'Beri reaksi'}
        title={active ? REACTION_LABEL[myReaction] : 'Beri reaksi'}
        onClick={() => setOpen(value => !value)}
        whileTap={reduceMotion ? undefined : { scale: 0.86 }}
        transition={{ type: 'spring', stiffness: 520, damping: 26 }}
        className={`flex min-h-11 select-none touch-manipulation items-center gap-1.5 rounded-full px-2 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${
          size === 'post' ? 'text-[12.5px]' : 'text-[11px]'
        } ${active ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400'}`}
      >
        {active ? (
          <span aria-hidden="true" className="leading-none" style={{ fontSize: iconPx }}>{REACTION_EMOJI[myReaction]}</span>
        ) : (
          <SmilePlus size={iconPx} />
        )}
      </motion.button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 error. (Komponen belum dipakai; tsc tetap mengecek berkasnya.)

- [ ] **Step 3: Commit**

```bash
git add src/components/teras/ReactionPicker.tsx
git commit -m "feat(teras): komponen ReactionPicker (smile-plus + bilah 7 emoji, klik-buka)"
```

---

### Task 7: Komponen `ReactionSummary`

Gugus emoji terpakai + total; klik → buka daftar.

**Files:**
- Create: `src/components/teras/ReactionSummary.tsx`

**Interfaces:**
- Consumes: `topReactionEmojis`, `sumReactions`, `ReactionCounts` dari registri.
- Produces: `export function ReactionSummary(props: { counts: ReactionCounts; onOpenList: () => void; size?: 'post' | 'comment' })`. Render `null` bila total 0.

- [ ] **Step 1: Implementasi komponen**

```tsx
import { topReactionEmojis, sumReactions } from '../../../lib/community-reactions.js';
import type { ReactionCounts } from '../../../lib/community-reactions.js';

interface ReactionSummaryProps {
  counts: ReactionCounts;
  onOpenList: () => void;
  size?: 'post' | 'comment';
}

export function ReactionSummary({ counts, onOpenList, size = 'comment' }: ReactionSummaryProps) {
  const total = sumReactions(counts);
  if (total === 0) return null;
  const emojis = topReactionEmojis(counts, 3);
  const emojiPx = size === 'post' ? 15 : 13;

  return (
    <button
      type="button"
      onClick={onOpenList}
      aria-label={`${total} reaksi — lihat siapa saja`}
      className={`flex min-h-11 items-center gap-1 rounded-full px-2 font-semibold text-gray-600 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 dark:text-slate-300 dark:hover:bg-slate-800 ${
        size === 'post' ? 'text-[12.5px]' : 'text-[11px]'
      }`}
    >
      <span aria-hidden="true" className="flex">
        {emojis.map((emoji, index) => (
          <span key={index} className="leading-none" style={{ marginLeft: index === 0 ? 0 : -4, fontSize: emojiPx }}>{emoji}</span>
        ))}
      </span>
      <span className="tabular-nums">{total}</span>
    </button>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 error.

- [ ] **Step 3: Commit**

```bash
git add src/components/teras/ReactionSummary.tsx
git commit -m "feat(teras): komponen ReactionSummary (gugus emoji + total)"
```

---

### Task 8: Komponen `ReactionListSheet`

Panel modal daftar reaktor, dikelompokkan per emoji dengan tab. Mengambil data lewat prop `load` (dekopel dari plumbing auth `TerasPage`).

**Files:**
- Create: `src/components/teras/ReactionListSheet.tsx`

**Interfaces:**
- Consumes: `COMMUNITY_REACTIONS`, `REACTION_EMOJI`, `REACTION_LABEL`, `ReactionType` dari registri; `AgentAvatar`; `terasProfilePath`, `isModifiedClick` dari `../../lib/terasRoutes`.
- Produces:
  - `export interface ReactionListEntry { agent: { name: string | null; slug: string | null; photo: string | null }; reaction: ReactionType }`
  - `export function ReactionListSheet(props: { load: () => Promise<{ reactions: ReactionListEntry[]; truncated: boolean }>; onClose: () => void; onOpenProfile: (slug: string) => void })`

- [ ] **Step 1: Implementasi komponen**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, X } from 'lucide-react';
import { COMMUNITY_REACTIONS, REACTION_EMOJI, REACTION_LABEL } from '../../../lib/community-reactions.js';
import type { ReactionType } from '../../../lib/community-reactions.js';
import { AgentAvatar } from './AgentAvatar';
import { isModifiedClick, terasProfilePath } from '../../lib/terasRoutes';

export interface ReactionListEntry {
  agent: { name: string | null; slug: string | null; photo: string | null };
  reaction: ReactionType;
}

interface ReactionListSheetProps {
  load: () => Promise<{ reactions: ReactionListEntry[]; truncated: boolean }>;
  onClose: () => void;
  onOpenProfile: (slug: string) => void;
}

export function ReactionListSheet({ load, onClose, onOpenProfile }: ReactionListSheetProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [entries, setEntries] = useState<ReactionListEntry[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [tab, setTab] = useState<ReactionType | 'all'>('all');

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    load()
      .then(result => {
        if (!alive) return;
        setEntries(result.reactions);
        setTruncated(result.truncated);
        setStatus('ready');
      })
      .catch(() => { if (alive) setStatus('error'); });
    return () => { alive = false; };
  }, [load]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const countByReaction = useMemo(() => {
    const map = new Map<ReactionType, number>();
    for (const entry of entries) map.set(entry.reaction, (map.get(entry.reaction) || 0) + 1);
    return map;
  }, [entries]);

  const visible = tab === 'all' ? entries : entries.filter(entry => entry.reaction === tab);
  const activeTabs = COMMUNITY_REACTIONS.filter(reaction => (countByReaction.get(reaction.key as ReactionType) || 0) > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Daftar reaksi"
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="flex max-h-[70vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-slate-800">
          <h2 className="text-sm font-bold text-gray-800 dark:text-slate-100">Reaksi</h2>
          <button type="button" onClick={onClose} aria-label="Tutup" className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>

        {status === 'ready' && entries.length > 0 && (
          <div className="flex gap-1 overflow-x-auto border-b border-gray-100 px-3 py-2 dark:border-slate-800 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => setTab('all')}
              className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold ${tab === 'all' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-slate-400'}`}
            >
              Semua {entries.length}
            </button>
            {activeTabs.map(reaction => {
              const key = reaction.key as ReactionType;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  aria-label={REACTION_LABEL[key]}
                  className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold ${tab === key ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-slate-400'}`}
                >
                  <span aria-hidden="true">{reaction.emoji}</span> {countByReaction.get(key)}
                </button>
              );
            })}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {status === 'loading' && (
            <div className="flex items-center justify-center py-10 text-gray-400"><Loader2 size={20} className="animate-spin" /></div>
          )}
          {status === 'error' && (
            <p className="px-3 py-8 text-center text-[13px] text-gray-500 dark:text-slate-400">Gagal memuat daftar reaksi.</p>
          )}
          {status === 'ready' && entries.length === 0 && (
            <p className="px-3 py-8 text-center text-[13px] text-gray-500 dark:text-slate-400">Belum ada reaksi.</p>
          )}
          {status === 'ready' && visible.map((entry, index) => {
            const name = entry.agent.name || 'Agent';
            const slug = entry.agent.slug;
            return (
              <div key={`${slug ?? 'x'}-${index}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                {slug ? (
                  <a
                    href={terasProfilePath(slug)}
                    onClick={event => { if (isModifiedClick(event)) return; event.preventDefault(); onOpenProfile(slug); }}
                    className="flex min-w-0 items-center gap-3"
                  >
                    <AgentAvatar name={name} photo={entry.agent.photo} size="comment" />
                    <span className="min-w-0 truncate text-[13px] font-semibold text-gray-800 hover:underline dark:text-slate-200">{name}</span>
                  </a>
                ) : (
                  <div className="flex min-w-0 items-center gap-3">
                    <AgentAvatar name={name} photo={entry.agent.photo} size="comment" />
                    <span className="min-w-0 truncate text-[13px] font-semibold text-gray-800 dark:text-slate-200">{name}</span>
                  </div>
                )}
                <span className="ml-auto text-lg leading-none" aria-label={REACTION_LABEL[entry.reaction]}>{REACTION_EMOJI[entry.reaction]}</span>
              </div>
            );
          })}
          {status === 'ready' && truncated && (
            <p className="px-3 py-3 text-center text-[11px] text-gray-400 dark:text-slate-500">Menampilkan 200 reaksi pertama.</p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 2: Verifikasi `AgentAvatar` menerima `size="comment"`**

Run: `grep -n "size" src/components/teras/AgentAvatar.tsx | head`
Expected: prop `size` mendukung `'comment'` (dipakai `CommentThread.tsx`). Jika nilainya beda, sesuaikan.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 error.

- [ ] **Step 4: Commit**

```bash
git add src/components/teras/ReactionListSheet.tsx
git commit -m "feat(teras): komponen ReactionListSheet (panel siapa-bereaksi-apa, tab per-emoji)"
```

---

### Task 9: Sambungkan ke KOMENTAR

Ganti Heart komentar dengan `ReactionPicker` + `ReactionSummary`; ubah peta count jadi penuh; buka `ReactionListSheet`.

**Files:**
- Modify: `src/components/teras/CommentThread.tsx` — ganti blok Heart (~294–345), ubah tipe prop count, tambah `onOpenReactionList`.
- Modify: `src/components/TerasPage.tsx` — `buildCommentReactionMaps` kembalikan `ReactionCounts` penuh; state `reactionListPostId`; render sheet; teruskan prop baru ke `CommentThread`.

**Interfaces:**
- Consumes: `ReactionPicker`, `ReactionSummary`, `ReactionListSheet`, `ReactionListEntry`, `ReactionCounts`, `sendReactionUpdate` (ada), `handleCommentReact` (ada), `requestJson`, `getAuthHeaders`.
- Produces: baris komentar memakai picker+summary; sheet muncul saat gugus diklik.

- [ ] **Step 1: `buildCommentReactionMaps` kembalikan counts penuh (`TerasPage.tsx`)**

Ganti fungsi (488–504) agar `reactionCounts` bertipe `Record<string, ReactionCounts>`:
```ts
function buildCommentReactionMaps(comments: CommunityComment[]): {
  myReactions: Record<string, ReactionType | null>;
  reactionCounts: Record<string, ReactionCounts>;
} {
  const myReactions: Record<string, ReactionType | null> = {};
  const reactionCounts: Record<string, ReactionCounts> = {};
  const apply = (comment: CommunityComment) => {
    myReactions[comment.id] = comment.my_reaction ?? null;
    reactionCounts[comment.id] = comment.reactions ?? emptyReactionCounts();
  };
  for (const comment of comments) {
    apply(comment);
    (comment.preview_replies ?? []).forEach(apply);
  }
  return { myReactions, reactionCounts };
}
```

- [ ] **Step 2: State sheet + helper load (`TerasPage.tsx`)**

Tambah impor:
```ts
import { ReactionListSheet } from './teras/ReactionListSheet';
import type { ReactionListEntry } from './teras/ReactionListSheet';
```
Tambah state (dekat state Teras lain, mis. dekat baris 1349):
```ts
const [reactionListPostId, setReactionListPostId] = useState<string | null>(null);
```
Tambah helper `loadReactionList` (dekat `sendReactionUpdate`, ~2568):
```ts
const loadReactionList = useCallback((id: string) => async () => {
  const payload = await requestJson<{ reactions: ReactionListEntry[]; truncated: boolean }>(
    `/api/community/posts/${encodeURIComponent(id)}/reactions`,
    { headers: getAuthHeaders() },
    'Gagal memuat daftar reaksi',
  );
  return payload.data ?? { reactions: [], truncated: false };
}, []);
```

- [ ] **Step 3: Render sheet sekali di root Teras (`TerasPage.tsx`)**

Dekat overlay lain (mis. dekat media viewer), tambahkan:
```tsx
{reactionListPostId && (
  <ReactionListSheet
    load={loadReactionList(reactionListPostId)}
    onClose={() => setReactionListPostId(null)}
    onOpenProfile={slug => { setReactionListPostId(null); openProfile(slug); }}
  />
)}
```

- [ ] **Step 4: Ubah prop `CommentThread` (`TerasPage.tsx`, ~4735)**

```tsx
<CommentThread
  comments={commentPanel.comments}
  myReactions={commentReactionMaps?.myReactions ?? {}}
  reactionCounts={commentReactionMaps?.reactionCounts ?? {}}
  onReact={(commentId, reaction) => handleCommentReact(commentTargetId, commentId, reaction)}
  onOpenReactionList={commentId => setReactionListPostId(commentId)}
  /* ...prop lain tetap... */
```

- [ ] **Step 5: Ubah tipe prop & baris aksi (`CommentThread.tsx`)**

Impor komponen (atas berkas):
```ts
import { ReactionPicker } from './ReactionPicker';
import { ReactionSummary } from './ReactionSummary';
import type { ReactionCounts } from '../../lib/community-reactions.js';
```
Ubah interface props (13–20):
```ts
myReactions: Record<string, ReactionType | null>;
/** Hitungan reaksi penuh per id komentar (untuk gugus emoji). */
reactionCounts: Record<string, ReactionCounts>;
onReact: (commentId: string, reaction: ReactionType | null) => void;
onOpenReactionList: (commentId: string) => void;
```
Ubah `CommentRowActions` (42–50):
```ts
interface CommentRowActions {
  myReaction: ReactionType | null;
  reactionCounts: ReactionCounts;
  replyCount: number;
  isReplyTarget: boolean;
  onReact: (reaction: ReactionType | null) => void;
  onOpenReactionList: () => void;
  onReply: () => void;
  onQuote: () => void;
}
```
Di tempat `actions` dibangun (sekitar 105–112, yang kini set `reactionCount`): ganti jadi `reactionCounts` penuh + teruskan `onOpenReactionList`:
```ts
reactionCounts: reactionCounts[comment.id] ?? emptyReactionCounts(),
onReact: reaction => onReact(comment.id, reaction),
onOpenReactionList: () => onOpenReactionList(comment.id),
```
Tambah impor `emptyReactionCounts`:
```ts
import { emptyReactionCounts } from '../../lib/community-reactions.js';
```
Ambil `onOpenReactionList` di daftar destrukturisasi props utama komponen.

- [ ] **Step 6: Ganti blok Heart komentar (`CommentThread.tsx`, ~294–345)**

Hapus `justLiked`/`handleReactClick`/`likePopped` (190–201) dan seluruh `<motion.button aria-label="Suka komentar" …>…</motion.button>` beserta `<AnimatePresence>` hitungannya. Ganti blok `{actions && ( … )}` jadi:
```tsx
{actions && (
  <div className="relative -ml-1.5 mt-0.5 flex items-center gap-0.5">
    <ReactionPicker
      size="comment"
      myReaction={actions.myReaction}
      onPick={actions.onReact}
    />
    <ReactionSummary
      size="comment"
      counts={actions.reactionCounts}
      onOpenList={actions.onOpenReactionList}
    />
    {/* tombol Balas & Kutip yang sudah ada tetap di sini */}
  </div>
)}
```
Pertahankan tombol Balas/Kutip yang selama ini berdampingan dengan Heart (jangan dihapus).

- [ ] **Step 7: Typecheck + build**

Run: `npx tsc --noEmit && npm run build:spa`
Expected: 0 error, build sukses.

- [ ] **Step 8: Commit**

```bash
git add src/components/teras/CommentThread.tsx src/components/TerasPage.tsx
git commit -m "feat(teras): reaksi emoji + panel reaktor pada komentar"
```

---

### Task 10: Sambungkan ke KIRIMAN (post)

Ganti Heart kartu kiriman dengan `ReactionPicker` + `ReactionSummary`; buka sheet.

**Files:**
- Modify: `src/components/TerasPage.tsx` — blok tombol Heart kiriman (~4566–4618); `updateReaction`/`handleLikeClick` jadi generik.

**Interfaces:**
- Consumes: `ReactionPicker`, `ReactionSummary`, `updateReaction`, `setReactionListPostId` (Task 9).
- Produces: kartu kiriman memakai picker+summary; sheet muncul saat gugus diklik.

- [ ] **Step 1: Generalisasi handler reaksi kiriman**

Ubah `updateReaction` (2578) & `handleLikeClick` (2613) agar menerima `ReactionType`:
```ts
const updateReaction = async (postId: string, nextReaction: ReactionType | null) => {
  // ...isi sama; baris `reactions[previousReaction]`/`reactions[nextReaction]`
  // sudah valid karena ReactionCounts = Record<ReactionType, number>.
};

const handlePostReact = (post: CommunityPost, nextReaction: ReactionType | null) => {
  setLikePopId(current => nextReaction ? post.id : (current === post.id ? null : current));
  void updateReaction(post.id, nextReaction);
};
```
Hapus `handleLikeClick` lama (yang meng-hardcode `'suka'`). Cari pemakaian lain: `grep -n "handleLikeClick" src/components/TerasPage.tsx` — hanya di tombol kiriman (Step 2).

- [ ] **Step 2: Ganti blok Heart kiriman (`TerasPage.tsx`, ~4566–4618)**

Ganti `<div className="relative -ml-2 mt-1 flex items-center gap-1">` yang berisi `<motion.button aria-label="Suka" …>` (seluruh tombol Heart + AnimatePresence total) menjadi:
```tsx
<div className="relative -ml-2 mt-1 flex items-center gap-1">
  <ReactionPicker
    size="post"
    disabled={reactionIsBusy}
    myReaction={post.my_reaction}
    onPick={reaction => { if (!reactionIsBusy) handlePostReact(post, reaction); }}
  />
  <ReactionSummary
    size="post"
    counts={post.reactions}
    onOpenList={() => setReactionListPostId(post.id)}
  />
  {/* tombol Komentari & lainnya yang sudah ada tetap di sini */}
```
Pertahankan tombol Komentari/Kutip/menu yang berdampingan. `totalReactions`, `likePopped` yang tak lagi dipakai boleh dihapus (cek `grep -n "totalReactions\|likePopped" src/components/TerasPage.tsx` dan bersihkan yang jadi variabel mati). Impor `ReactionPicker`/`ReactionSummary`:
```ts
import { ReactionPicker } from './teras/ReactionPicker';
import { ReactionSummary } from './teras/ReactionSummary';
```

- [ ] **Step 3: Rapikan simbol tak terpakai**

Jika `Heart` sudah tak dipakai di `TerasPage.tsx`, hapus dari impor `lucide-react`. Cek: `grep -n "Heart" src/components/TerasPage.tsx`. (Di `CommentThread.tsx` juga—cek dan hapus bila tak dipakai.)

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit && npm run build:spa`
Expected: 0 error, build sukses.

- [ ] **Step 5: Commit**

```bash
git add src/components/TerasPage.tsx src/components/teras/CommentThread.tsx
git commit -m "feat(teras): reaksi emoji + panel reaktor pada kiriman"
```

---

### Task 11: Verifikasi akhir & checklist manual

**Files:** —

- [ ] **Step 1: Suite verifikasi cepat**

Run:
```bash
node --check server.js
node --test tests/community-reactions.test.js tests/community-access.test.js
npx tsc --noEmit
npm run build:spa
```
Expected: semua lolos (0 error, build sukses).

- [ ] **Step 2: Konfirmasi tak ada sisa literal/`Heart` mati**

Run:
```bash
grep -n "{ suka: 0, selamat: 0, aamiin: 0 }" server.js src/components/TerasPage.tsx   # kosong
grep -rn "aria-label=\"Suka komentar\"\|aria-label=\"Suka\"" src/components            # kosong (Heart lama hilang)
```
Expected: kosong.

- [ ] **Step 3: Susun checklist manual untuk user (jangan dijalankan agen)**

Tulis ke ringkasan akhir untuk user:
1. **DB dulu:** tempel `migrations/20260727000000_community_reaction_emoji.sql` ke Supabase SQL Editor, jalankan, pastikan tak error. (Verifikasi nama constraint bila DROP gagal.)
2. Deploy kode (server + FE) **setelah** langkah 1.
3. Komentar & kiriman: klik ikon smile-plus → bilah 7 emoji muncul (klik, bukan hover); pilih emoji → tersimpan (refresh tetap ada); klik emoji sama → lepas.
4. Beberapa agen bereaksi beda → gugus emoji + total tampil benar; klik gugus → panel daftar siapa-bereaksi-apa dengan tab per-emoji.
5. `curl …/reactions` mengembalikan `{ data: { reactions, truncated } }`.
6. Notifikasi reaksi (lonceng + Telegram) tetap terkirim saat ada reaksi baru.

- [ ] **Step 4: Commit dokumentasi bila ada perubahan**

(Jika tak ada perubahan berkas di task ini, lewati commit.)

---

## Catatan Notifikasi (di luar task inti — opsional)

Plumbing notifikasi query `community_post_reactions` tanpa peduli jenis → emoji baru otomatis memicu notifikasi tanpa perubahan. Penyisipan emoji ke teks digest ("… bereaksi 🤲 …") adalah polish opsional (ambil `reaction` di query notifikasi ~`server.js:5293`, petakan via `REACTION_EMOJI`) — **tidak** termasuk cakupan plan ini.
