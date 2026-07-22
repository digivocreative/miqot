# Draf Komposer Teras — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ketikan komposer Teras (utas di feed + balasan/komentar) tersimpan otomatis ke localStorage dan pulih setelah refresh/tab tertutup.

**Architecture:** Logika murni (kunci, serialisasi berversi, kedaluwarsa 7 hari, pemangkasan 20 kunci reply) di modul baru `src/lib/terasDraft.ts` tanpa dependensi React, storage sebagai parameter. `TerasPage.tsx` memasang efek tipis: satu efek pulihkan-saat-mount + satu efek auto-save debounce 500 ms untuk komposer utama, dan sepasang efek serupa untuk panel komentar. Media TIDAK disimpan (blob baru diunggah saat Kirim).

**Tech Stack:** React 18 + TypeScript (Vite), `node:test` untuk unit test (impor `.ts` langsung — presedennya `tests/teras-routes.test.js`).

**Spec:** `docs/superpowers/specs/2026-07-22-teras-draf-komposer-design.md`

## Global Constraints

- Tidak ada migrasi DB, tidak ada endpoint baru, `server.js` tidak disentuh.
- Semua akses localStorage best-effort: dibungkus try/catch, gagal = senyap.
- Kunci: `teras:draft:<slug>:feed` dan `teras:draft:<slug>:reply:<postId>`; `<slug>` selalu lowercase (identitas agent di FE = `agent.slug`, tidak ada id numerik).
- Payload berversi: `{ "v": 1, "savedAt": <ms>, "segments": ["..."] }`; versi tak dikenal/korup → kunci dibuang.
- Kedaluwarsa draf: 7 hari. Batas kunci reply: 20 per agent. Debounce: 500 ms.
- Gate FE = `npm run build:spa`; `npx tsc --noEmit` punya ~6 error pre-existing — yang penting TIDAK ada error baru di file yang disentuh.
- Sebelum SETIAP commit: `git branch --show-current` harus `main` (branch pernah berpindah di bawah sesi).
- Jangan jalankan `tests/*.browser.test.js` atau suite penuh (lambat/flaky — user yang menjalankan e2e).

---

### Task 1: Modul murni `src/lib/terasDraft.ts` + unit test

**Files:**
- Create: `src/lib/terasDraft.ts`
- Test: `tests/teras-draft.test.js`

**Interfaces:**
- Consumes: — (tidak ada; modul murni)
- Produces (dipakai Task 2 & 3):
  - `feedDraftKey(slug: string): string`
  - `replyDraftKey(slug: string, postId: string): string`
  - `loadDraft(storage: DraftStorage, key: string, now: number): string[] | null` — null jika tak ada/korup/kedaluwarsa/kosong-semua (kunci ikut dibersihkan)
  - `saveDraft(storage: DraftStorage, key: string, segments: string[], now: number): void` — semua segmen kosong (trim) → hapus kunci
  - `clearDraft(storage: DraftStorage, key: string): void`
  - `pruneReplyDrafts(storage: DraftStorage, slug: string, max: number, now: number): void`
  - `TERAS_REPLY_DRAFT_MAX = 20`, `TERAS_DRAFT_MAX_AGE_MS = 7 hari`
  - `interface DraftStorage { getItem; setItem; removeItem; readonly length; key(i) }` — `window.localStorage` memenuhinya

- [ ] **Step 1: Tulis unit test yang gagal**

Buat `tests/teras-draft.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  feedDraftKey,
  replyDraftKey,
  loadDraft,
  saveDraft,
  clearDraft,
  pruneReplyDrafts,
  TERAS_DRAFT_MAX_AGE_MS,
} from '../src/lib/terasDraft.ts';

const NOW = 1_753_142_400_000;

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: key => { map.delete(key); },
    get length() { return map.size; },
    key: index => Array.from(map.keys())[index] ?? null,
    map,
  };
}

function payload(segments, savedAt = NOW) {
  return JSON.stringify({ v: 1, savedAt, segments });
}

test('kunci memuat slug lowercase', () => {
  assert.equal(feedDraftKey('Nila'), 'teras:draft:nila:feed');
  assert.equal(replyDraftKey('Nila', 'p1'), 'teras:draft:nila:reply:p1');
});

test('simpan lalu muat bulat-balik', () => {
  const storage = fakeStorage();
  saveDraft(storage, feedDraftKey('nila'), ['halo', 'segmen dua'], NOW);
  assert.deepEqual(loadDraft(storage, feedDraftKey('nila'), NOW), ['halo', 'segmen dua']);
});

test('semua segmen kosong = hapus kunci', () => {
  const storage = fakeStorage({ [feedDraftKey('nila')]: payload(['lama']) });
  saveDraft(storage, feedDraftKey('nila'), ['  ', ''], NOW);
  assert.equal(storage.map.size, 0);
});

test('draf lebih tua dari 7 hari dibuang saat dibaca', () => {
  const key = feedDraftKey('nila');
  const storage = fakeStorage({ [key]: payload(['basi'], NOW - TERAS_DRAFT_MAX_AGE_MS - 1) });
  assert.equal(loadDraft(storage, key, NOW), null);
  assert.equal(storage.map.size, 0);
});

test('tepat 7 hari masih hidup', () => {
  const key = feedDraftKey('nila');
  const storage = fakeStorage({ [key]: payload(['pas'], NOW - TERAS_DRAFT_MAX_AGE_MS) });
  assert.deepEqual(loadDraft(storage, key, NOW), ['pas']);
});

test('JSON korup / versi asing / bentuk salah dibuang senyap', () => {
  for (const raw of ['{buk', JSON.stringify({ v: 2, savedAt: NOW, segments: ['x'] }), JSON.stringify({ v: 1, savedAt: 'x', segments: ['x'] }), JSON.stringify({ v: 1, savedAt: NOW, segments: [1] }), 'null']) {
    const key = feedDraftKey('nila');
    const storage = fakeStorage({ [key]: raw });
    assert.equal(loadDraft(storage, key, NOW), null, raw);
    assert.equal(storage.map.size, 0, raw);
  }
});

test('clearDraft menghapus kunci', () => {
  const key = feedDraftKey('nila');
  const storage = fakeStorage({ [key]: payload(['x']) });
  clearDraft(storage, key);
  assert.equal(storage.map.size, 0);
});

test('storage yang melempar tidak meledak', () => {
  const bomb = {
    getItem: () => { throw new Error('quota'); },
    setItem: () => { throw new Error('quota'); },
    removeItem: () => { throw new Error('quota'); },
    get length() { return 0; },
    key: () => null,
  };
  assert.equal(loadDraft(bomb, 'k', NOW), null);
  saveDraft(bomb, 'k', ['x'], NOW);
  clearDraft(bomb, 'k');
  pruneReplyDrafts(bomb, 'nila', 20, NOW);
});

test('prune: sisakan max terbaru, buang yang basi, kunci feed tak tersentuh', () => {
  const storage = fakeStorage();
  storage.setItem(feedDraftKey('nila'), payload(['feed'], NOW - TERAS_DRAFT_MAX_AGE_MS * 2));
  for (let i = 0; i < 25; i += 1) {
    storage.setItem(replyDraftKey('nila', `p${i}`), payload([`teks ${i}`], NOW - i * 1000));
  }
  storage.setItem(replyDraftKey('nila', 'basi'), payload(['basi'], NOW - TERAS_DRAFT_MAX_AGE_MS - 1));
  storage.setItem(replyDraftKey('lain', 'p0'), payload(['punya agent lain'], NOW));
  pruneReplyDrafts(storage, 'nila', 20, NOW);
  assert.equal(loadDraft(storage, replyDraftKey('nila', 'p0'), NOW)?.[0], 'teks 0');
  assert.equal(loadDraft(storage, replyDraftKey('nila', 'p19'), NOW)?.[0], 'teks 19');
  assert.equal(storage.getItem(replyDraftKey('nila', 'p20')), null);
  assert.equal(storage.getItem(replyDraftKey('nila', 'basi')), null);
  assert.notEqual(storage.getItem(feedDraftKey('nila')), null, 'kunci feed di luar urusan prune');
  assert.notEqual(storage.getItem(replyDraftKey('lain', 'p0')), null, 'agent lain tak tersentuh');
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `node --test tests/teras-draft.test.js`
Expected: FAIL — `Cannot find module '../src/lib/terasDraft.ts'`

- [ ] **Step 3: Implementasi `src/lib/terasDraft.ts`**

```ts
/**
 * Draf komposer Teras di localStorage — logika murni, tanpa React.
 * Storage dioper sebagai parameter supaya bisa diuji unit tanpa jsdom.
 * SEMUA operasi best-effort: gagal baca/tulis (quota, mode privat) = senyap.
 */

export const TERAS_DRAFT_VERSION = 1;
export const TERAS_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const TERAS_REPLY_DRAFT_MAX = 20;

/** Subset Storage yang dipakai; window.localStorage memenuhinya. */
export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  readonly length: number;
  key(index: number): string | null;
}

interface DraftPayload {
  v: number;
  savedAt: number;
  segments: string[];
}

export function feedDraftKey(slug: string): string {
  return `teras:draft:${slug.toLowerCase()}:feed`;
}

export function replyDraftKey(slug: string, postId: string): string {
  return `${replyDraftPrefix(slug)}${postId}`;
}

function replyDraftPrefix(slug: string): string {
  return `teras:draft:${slug.toLowerCase()}:reply:`;
}

function parsePayload(raw: string): DraftPayload | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const payload = value as Partial<DraftPayload>;
    if (payload.v !== TERAS_DRAFT_VERSION) return null;
    if (typeof payload.savedAt !== 'number' || !Number.isFinite(payload.savedAt)) return null;
    if (!Array.isArray(payload.segments)) return null;
    if (!payload.segments.every(segment => typeof segment === 'string')) return null;
    return payload as DraftPayload;
  } catch {
    return null;
  }
}

function isExpired(payload: DraftPayload, now: number): boolean {
  return now - payload.savedAt > TERAS_DRAFT_MAX_AGE_MS;
}

/** null = tak ada draf layak pakai; kunci korup/basi/kosong ikut dibersihkan. */
export function loadDraft(storage: DraftStorage, key: string, now: number): string[] | null {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const payload = parsePayload(raw);
    if (!payload || isExpired(payload, now) || payload.segments.every(segment => !segment.trim())) {
      storage.removeItem(key);
      return null;
    }
    return payload.segments;
  } catch {
    return null;
  }
}

/** Semua segmen kosong (trim) = buang draf; itu satu-satunya cara "hapus draf". */
export function saveDraft(storage: DraftStorage, key: string, segments: string[], now: number): void {
  try {
    if (segments.every(segment => !segment.trim())) {
      storage.removeItem(key);
      return;
    }
    const payload: DraftPayload = { v: TERAS_DRAFT_VERSION, savedAt: now, segments };
    storage.setItem(key, JSON.stringify(payload));
  } catch {
    // best-effort
  }
}

export function clearDraft(storage: DraftStorage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // best-effort
  }
}

/**
 * Jaga kunci reply per agent tetap <= max: buang yang basi + yang paling tua.
 * Kunci feed dan kunci agent lain di luar urusan fungsi ini.
 */
export function pruneReplyDrafts(storage: DraftStorage, slug: string, max: number, now: number): void {
  try {
    const prefix = replyDraftPrefix(slug);
    const alive: { key: string; savedAt: number }[] = [];
    const drop: string[] = [];
    // Kumpulkan dulu, hapus belakangan: menghapus sambil iterasi index membuat
    // storage.key(i) meloncati entri.
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const raw = storage.getItem(key);
      const payload = raw === null ? null : parsePayload(raw);
      if (!payload || isExpired(payload, now)) {
        drop.push(key);
        continue;
      }
      alive.push({ key, savedAt: payload.savedAt });
    }
    alive.sort((a, b) => b.savedAt - a.savedAt);
    alive.slice(max).forEach(entry => drop.push(entry.key));
    drop.forEach(key => clearDraft(storage, key));
  } catch {
    // best-effort
  }
}
```

- [ ] **Step 4: Jalankan test, pastikan LOLOS**

Run: `node --test tests/teras-draft.test.js`
Expected: PASS — semua test hijau (9 test)

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # harus: main
git add src/lib/terasDraft.ts tests/teras-draft.test.js
git commit -m "feat(teras): modul draf komposer murni (localStorage berversi, kedaluwarsa 7 hari, prune reply)"
```

---

### Task 2: Draf komposer utama (utas di feed)

**Files:**
- Modify: `src/components/TerasPage.tsx` (impor ~baris 47; efek baru setelah blok ref sync ~baris 1609; `resetComposer` ~baris 2105; hint media di sheet komposer ~baris 4024)

**Interfaces:**
- Consumes (Task 1): `feedDraftKey`, `loadDraft`, `saveDraft`, `clearDraft` — signature lihat Task 1.
- Produces: ref `feedDraftReadyRef` (dipakai internal file ini saja).

Fakta file yang dipakai task ini (verifikasi masih benar sebelum mengedit):
- `agent.slug` = identitas user login (prop `agent: TerasAgent`, baris ~1338).
- `composerSegments: ComposerSegmentState[]` state utama; `composerSegmentsRef` mirror-nya (baris ~1514); render mengasumsikan `composerSegments[0]` selalu ada.
- `blankComposerSegment()` (baris ~227) membuat segmen kosong dengan `key`/`id` BARU — pemulihan draf WAJIB lewat ini supaya `client_id` idempotensi baru, bukan menyimpan id lama.
- `MAX_THREAD_SEGMENTS = 10` (baris ~287).
- `resetComposer` (baris ~2105) dipanggil pada dua jalur: sukses kirim (~2669) dan buang-draf via confirm di `closeComposer` (~2137). DUA-DUANYA memang harus menghapus kunci draf — jadi `clearDraft` cukup ditaruh di dalam `resetComposer`.

- [ ] **Step 1: Tambah impor**

Di blok impor `TerasPage.tsx` (dekat baris 47, setelah `import { getAuthHeaders } from './LoginPage';`):

```ts
import {
  clearDraft,
  feedDraftKey,
  loadDraft,
  pruneReplyDrafts,
  replyDraftKey,
  saveDraft,
  TERAS_REPLY_DRAFT_MAX,
} from '../lib/terasDraft';
```

(Impor reply dipakai Task 3 — tsc akan menandai unused sementara; kalau mengganggu, tambahkan impor reply di Task 3 saja.)

- [ ] **Step 2: Efek pulihkan + efek auto-save**

Setelah efek sync `commentPanelsRef` (dekat baris 1609, sebelum `resetComposer`), tambahkan — URUTAN DEKLARASI PENTING: efek pulihkan harus dideklarasikan SEBELUM efek save, dan efek save menunggu `feedDraftReadyRef`:

```tsx
// ---- Draf komposer utama (localStorage, teks saja) ----
// Pulihkan sekali saat mount, hanya bila komposer masih kosong. Segmen
// direkonstruksi via blankComposerSegment() supaya client_id idempotensi baru.
const feedDraftReadyRef = useRef(false);
useEffect(() => {
  const bodies = loadDraft(window.localStorage, feedDraftKey(agent.slug), Date.now());
  const allEmpty = composerSegmentsRef.current.every(
    segment => !segment.body.trim() && segment.media.length === 0,
  );
  if (bodies && bodies.length > 0 && allEmpty) {
    const restored = bodies.slice(0, MAX_THREAD_SEGMENTS).map(body => ({
      ...blankComposerSegment(),
      body,
    }));
    composerSegmentsRef.current = restored;
    setComposerSegments(restored);
  }
  feedDraftReadyRef.current = true;
  // Sekali saat mount by design.
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

// Auto-save debounce 500 ms. saveDraft menghapus kunci saat semua teks kosong —
// mengosongkan komposer = membuang draf. Gerbang feedDraftReadyRef mencegah
// run pertama (komposer masih kosong) menghapus draf sebelum sempat dipulihkan.
useEffect(() => {
  if (!feedDraftReadyRef.current) return;
  const timer = window.setTimeout(() => {
    saveDraft(
      window.localStorage,
      feedDraftKey(agent.slug),
      composerSegments.map(segment => segment.body),
      Date.now(),
    );
  }, 500);
  return () => window.clearTimeout(timer);
}, [composerSegments, agent.slug]);
```

- [ ] **Step 3: Hapus kunci di `resetComposer`**

Di dalam `resetComposer` (baris ~2105), setelah `setComposerSegments(fresh);` tambahkan:

```ts
    clearDraft(window.localStorage, feedDraftKey(agent.slug));
```

- [ ] **Step 4: Hint "lampiran tidak tersimpan"**

Di sheet komposer, setelah blok `composerMediaWithoutTextIndex` (baris ~4020-4024, sebelum blok `composerError`):

```tsx
                {composerSegments.some(segment => segment.media.length > 0) && (
                  <p className="mb-3 text-[10px] font-medium text-gray-400 dark:text-slate-500">
                    Lampiran tidak ikut tersimpan di draf
                  </p>
                )}
```

- [ ] **Step 5: Verifikasi build**

Run: `npx tsc --noEmit 2>&1 | grep -i terasDraft; npx tsc --noEmit 2>&1 | grep TerasPage`
Expected: tidak ada error BARU menyebut terasDraft/TerasPage selain yang unused-import reply (kalau impor reply ditunda ke Task 3, harus nol).

Run: `npm run build:spa`
Expected: build sukses.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # harus: main
git add src/components/TerasPage.tsx
git commit -m "feat(teras): draf otomatis komposer utama (pulih saat mount, debounce 500ms)"
```

---

### Task 3: Draf balasan/komentar (per kiriman)

**Files:**
- Modify: `src/components/TerasPage.tsx` (efek baru setelah `updateCommentInput` ~baris 3178; handler sukses kirim komentar ~baris 3248-3262; hint media dekat counter komentar ~baris 5141)

**Interfaces:**
- Consumes (Task 1): `replyDraftKey`, `loadDraft`, `saveDraft`, `clearDraft`, `pruneReplyDrafts`, `TERAS_REPLY_DRAFT_MAX`.
- Consumes (file ini): `updateCommentInput(postId, input)` (baris ~3170; ia juga memaksa `open: true` — aman karena pemulihan hanya untuk panel yang memang terbuka/detail); `commentPanels: Record<string, CommentPanelState>`; prop `postId: string | null` (terisi = tampilan detail).

Fakta perilaku yang dipakai:
- Panel komentar LAHIR dengan `input: ''` (`emptyCommentPanel()`, baris ~477). Maka "prev tak dikenal" boleh dianggap `''` — inilah yang membuat ketikan pertama tetap tersimpan meski timer pertama menyalip.
- Sukses kirim komentar mengosongkan `input` di `setCommentPanels` (baris ~3248-3262) — kunci draf dihapus eksplisit di situ.

- [ ] **Step 1: Efek pulihkan + efek auto-save balasan**

Setelah deklarasi `updateCommentInput` (baris ~3178), tambahkan — lagi-lagi efek pulihkan dideklarasikan lebih dulu:

```tsx
// ---- Draf balasan per kiriman ----
// Pulihkan sekali per postId: panel yang terbuka (atau tampilan detail) dengan
// input kosong diisi draf. Sesudah dicoba sekali, tidak diulang — kalau user
// lalu mengosongkan input, auto-save di bawah yang menghapus kuncinya.
const replyDraftRestoredRef = useRef<Set<string>>(new Set());
useEffect(() => {
  const candidates = new Set<string>();
  if (postId) candidates.add(postId);
  Object.entries(commentPanels).forEach(([pid, panel]) => {
    if (panel.open) candidates.add(pid);
  });
  candidates.forEach(pid => {
    if (replyDraftRestoredRef.current.has(pid)) return;
    replyDraftRestoredRef.current.add(pid);
    if (commentPanels[pid]?.input.trim()) return;
    const bodies = loadDraft(window.localStorage, replyDraftKey(agent.slug, pid), Date.now());
    if (!bodies || !bodies[0]) return;
    updateCommentInput(pid, bodies[0]);
  });
  // updateCommentInput stabil per render; commentPanels adalah pemicu sebenarnya.
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [commentPanels, postId, agent.slug]);

// Auto-save debounce 500 ms — hanya panel yang inputnya BERUBAH sejak run
// sebelumnya (prev), supaya savedAt panel lain tidak ikut ter-refresh dan
// urutan prune tetap jujur. Panel lahir ber-input '' → prev default ''.
const replyDraftPrevRef = useRef<Record<string, string>>({});
useEffect(() => {
  const timer = window.setTimeout(() => {
    let touched = false;
    Object.entries(commentPanels).forEach(([pid, panel]) => {
      const prev = replyDraftPrevRef.current[pid] ?? '';
      if (prev === panel.input) return;
      replyDraftPrevRef.current[pid] = panel.input;
      saveDraft(window.localStorage, replyDraftKey(agent.slug, pid), [panel.input], Date.now());
      touched = true;
    });
    if (touched) pruneReplyDrafts(window.localStorage, agent.slug, TERAS_REPLY_DRAFT_MAX, Date.now());
  }, 500);
  return () => window.clearTimeout(timer);
}, [commentPanels, agent.slug]);
```

(Kalau impor reply ditunda dari Task 2, tambahkan sekarang ke blok impor: `replyDraftKey`, `pruneReplyDrafts`, `TERAS_REPLY_DRAFT_MAX`.)

- [ ] **Step 2: Hapus kunci saat komentar sukses terkirim**

Di handler sukses kirim komentar, tepat SETELAH blok `setCommentPanels(current => { ... input: '', media: [], ... })` (baris ~3262), tambahkan:

```ts
      clearDraft(window.localStorage, replyDraftKey(agent.slug, postId));
      replyDraftPrevRef.current[postId] = '';
```

(Baris kedua menyamakan prev dengan state baru supaya auto-save berikutnya tidak menulis ulang draf kosong.)

- [ ] **Step 3: Hint media di komposer balasan**

Dekat counter karakter komentar (baris ~5141, elemen yang merender `{commentInputLength}/{MAX_COMMUNITY_COMMENT_CHARS}`), tambahkan sebagai sibling sebelum/di dekat counter:

```tsx
                                {commentPanel.media.length > 0 && (
                                  <span className="text-[10px] font-medium text-gray-400 dark:text-slate-500">
                                    Lampiran tidak ikut tersimpan di draf
                                  </span>
                                )}
```

Sesuaikan penempatan dengan struktur flex yang ada di situ (jangan merusak layout counter); yang wajib: muncul hanya saat panel punya media.

- [ ] **Step 4: Verifikasi build**

Run: `npx tsc --noEmit 2>&1 | grep -iE "terasDraft|TerasPage"`
Expected: kosong (tidak ada error baru di file yang disentuh).

Run: `npm run build:spa`
Expected: build sukses.

Run: `node --test tests/teras-draft.test.js`
Expected: PASS (regresi modul murni).

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # harus: main
git add src/components/TerasPage.tsx
git commit -m "feat(teras): draf otomatis balasan komentar per kiriman"
```

---

### Task 4: Verifikasi akhir + checklist e2e untuk user

**Files:** — (tidak ada perubahan kode; hanya verifikasi)

- [ ] **Step 1: Jalankan seluruh gate cepat**

```bash
node --test tests/teras-draft.test.js && npx tsc --noEmit 2>&1 | grep -iE "terasDraft|TerasPage" ; npm run build:spa
```

Expected: unit test PASS, grep tsc kosong, build sukses. (JANGAN jalankan suite penuh/browser test.)

- [ ] **Step 2: Serahkan checklist e2e manual ke user**

Sampaikan checklist ini (user yang menjalankan):

1. Ketik utas 2-3 segmen di komposer feed → refresh halaman → buka komposer: ketikan pulih, tiap segmen di tempatnya.
2. Kirim utasnya → refresh: komposer kosong (draf terhapus).
3. Ketik sesuatu → tutup komposer → konfirmasi "Buang draft kiriman ini?" → buka lagi: kosong.
4. Ketik balasan di kiriman A (jangan kirim) → pindah ke kiriman B → kembali ke A: ketikan balasan pulih.
5. Kirim balasan di A → refresh → buka A: input balasan kosong.
6. Pasang foto di komposer → muncul keterangan "Lampiran tidak ikut tersimpan di draf"; refresh → teks pulih, foto memang hilang.
7. Login sebagai agent lain di perangkat yang sama: draf agent pertama tidak muncul.
