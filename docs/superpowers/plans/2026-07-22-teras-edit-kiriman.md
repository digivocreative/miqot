# Edit Kiriman & Komentar Teras — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Penulis bisa mengedit teks kiriman/komentarnya (tanpa batas waktu), dengan stempel `edited_at` dan label "· diedit" permanen.

**Architecture:** Satu kolom `edited_at timestamptz` (migrasi manual user), validasi di helper murni baru `lib/community-edit.js`, satu endpoint `PATCH /api/community/posts/:id` yang melayani kiriman DAN komentar (satu tabel `community_posts`), UI edit inline di TerasPage (kiriman) dan CommentThread (komentar) yang mem-patch state lokal tanpa refetch.

**Tech Stack:** Express 5 + Supabase (PostgREST) di server.js; React 18 + TS (Vite) di FE; `node:test` untuk helper murni.

**Spec:** `docs/superpowers/specs/2026-07-22-teras-edit-kiriman-design.md`

## Global Constraints

- Kebijakan: tanpa batas waktu edit; teks saja; TANPA notifikasi mention baru / pencatatan `community_mentions` / refresh link preview; hanya penulis (`agent_id` = user login, BUKAN `canModerateCommunityContent`); tanpa riwayat versi.
- Batas panjang per codepoint (`Array.from`): kiriman 1–500 (`MAX_SEGMENT_BODY_CHARS` dari `lib/community-thread-compose.js`), komentar 1–300. Pesan galat persis: `Isi posting wajib 1–500 karakter` / `Isi komentar wajib 1–300 karakter`.
- `@semua` BARU ditolak saat edit (pesan: `Tidak bisa menambah @semua lewat edit`); `@semua` yang sudah ada boleh dipertahankan/dihapus.
- Parser JSON WAJIB path-scoped di deklarasi route (`express.json({ limit: '8kb' })`) — parser global 10mb di server.js ~446-453 adalah jebakan yang sudah 3× menggigit.
- Kolom `edited_at` bisa belum ada (user belum migrasi): SEMUA select baru memakai pola retry `isCommunityEditSchemaMissing` (42703/PGRST204 + /edited_at/), konsisten dengan fallback media/quote/thread yang ada; UPDATE yang gagal karena kolom hilang → 503 `Migrasi edit Teras belum diterapkan`.
- Mode edit FE TIDAK menyentuh kunci draf `teras:draft:*` (fitur draf kemarin).
- Set nilai textarea programatik wajib rAF + `autoGrowCommentInput` (pelajaran fitur draf; autosize hanya event-driven).
- Gate FE = `npm run build:spa`; `npx tsc --noEmit` punya ~6 error pre-existing di file lain — file tersentuh tidak boleh menambah error. Server = `node --check server.js` (tidak ada suite endpoint; verifikasi curl oleh user pasca-deploy).
- Sebelum SETIAP commit: `git branch --show-current` harus `main`.
- JANGAN jalankan `tests/*.browser.test.js` atau suite penuh.
- Line anchors di plan ini = posisi saat plan ditulis; cari berdasarkan ISI kode.

---

### Task 1: Helper murni `lib/community-edit.js` + unit test

**Files:**
- Create: `lib/community-edit.js`
- Test: `tests/community-edit.test.js`

**Interfaces:**
- Consumes: `hasEveryoneMention(body)` dari `lib/community-broadcast.js`; `MAX_SEGMENT_BODY_CHARS` (=500) dari `lib/community-thread-compose.js`.
- Produces (dipakai Task 2): `validateCommunityEdit({ nextBody, previousBody, isReply }) → { ok: true, body } | { ok: false, error }`; `MAX_REPLY_BODY_CHARS = 300`.

- [ ] **Step 1: Tulis unit test yang gagal**

Buat `tests/community-edit.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCommunityEdit, MAX_REPLY_BODY_CHARS } from '../lib/community-edit.js';

test('edit kiriman valid: trim dan kembalikan body', () => {
  const result = validateCommunityEdit({ nextBody: '  teks baru  ', previousBody: 'lama', isReply: false });
  assert.deepEqual(result, { ok: true, body: 'teks baru' });
});

test('batas kiriman 500 per codepoint (emoji = 1)', () => {
  const emoji500 = '😀'.repeat(500);
  assert.equal(validateCommunityEdit({ nextBody: emoji500, previousBody: 'x', isReply: false }).ok, true);
  const emoji501 = '😀'.repeat(501);
  assert.deepEqual(
    validateCommunityEdit({ nextBody: emoji501, previousBody: 'x', isReply: false }),
    { ok: false, error: 'Isi posting wajib 1–500 karakter' },
  );
});

test('batas komentar 300 per codepoint', () => {
  assert.equal(MAX_REPLY_BODY_CHARS, 300);
  assert.equal(validateCommunityEdit({ nextBody: 'a'.repeat(300), previousBody: 'x', isReply: true }).ok, true);
  assert.deepEqual(
    validateCommunityEdit({ nextBody: 'a'.repeat(301), previousBody: 'x', isReply: true }),
    { ok: false, error: 'Isi komentar wajib 1–300 karakter' },
  );
});

test('kosong / spasi saja / bukan string ditolak dengan pesan sesuai jenis', () => {
  assert.deepEqual(
    validateCommunityEdit({ nextBody: '   ', previousBody: 'x', isReply: false }),
    { ok: false, error: 'Isi posting wajib 1–500 karakter' },
  );
  assert.deepEqual(
    validateCommunityEdit({ nextBody: undefined, previousBody: 'x', isReply: true }),
    { ok: false, error: 'Isi komentar wajib 1–300 karakter' },
  );
  assert.deepEqual(
    validateCommunityEdit({ nextBody: 42, previousBody: 'x', isReply: false }),
    { ok: false, error: 'Isi posting wajib 1–500 karakter' },
  );
});

test('@semua baru ditolak', () => {
  assert.deepEqual(
    validateCommunityEdit({ nextBody: 'halo @semua', previousBody: 'halo', isReply: false }),
    { ok: false, error: 'Tidak bisa menambah @semua lewat edit' },
  );
});

test('@semua yang sudah ada boleh dipertahankan atau dihapus', () => {
  assert.equal(
    validateCommunityEdit({ nextBody: 'update @semua ya', previousBody: 'info @semua', isReply: false }).ok,
    true,
  );
  assert.equal(
    validateCommunityEdit({ nextBody: 'tanpa broadcast', previousBody: 'info @semua', isReply: false }).ok,
    true,
  );
});

test('previousBody bukan string dianggap tanpa @semua', () => {
  assert.deepEqual(
    validateCommunityEdit({ nextBody: 'hai @semua', previousBody: null, isReply: false }),
    { ok: false, error: 'Tidak bisa menambah @semua lewat edit' },
  );
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `node --test tests/community-edit.test.js`
Expected: FAIL — `Cannot find module '../lib/community-edit.js'`

- [ ] **Step 3: Implementasi `lib/community-edit.js`**

```js
// Validasi edit kiriman/komentar Teras — murni, tanpa DB, diuji unit.
// Batas panjang HARUS selaras dengan aturan buat: kiriman ikut
// MAX_SEGMENT_BODY_CHARS (community-thread-compose), komentar 300 (angka yang
// sama dengan cek di POST /api/community/posts/:id/comments dan
// MAX_COMMUNITY_COMMENT_CHARS di TerasPage.tsx — 3 titik sinkron).

import { hasEveryoneMention } from './community-broadcast.js';
import { MAX_SEGMENT_BODY_CHARS } from './community-thread-compose.js';

export const MAX_REPLY_BODY_CHARS = 300;

/**
 * Edit tidak memicu broadcast, jadi @semua yang BARU muncul lewat edit akan
 * menampilkan pil yang menjanjikan notifikasi yang tidak pernah terjadi —
 * ditolak. @semua yang memang sudah ada di teks lama boleh tetap/dihapus.
 */
export function validateCommunityEdit({ nextBody, previousBody, isReply }) {
  const body = typeof nextBody === 'string' ? nextBody.trim() : '';
  const length = Array.from(body).length;
  const max = isReply ? MAX_REPLY_BODY_CHARS : MAX_SEGMENT_BODY_CHARS;
  if (length < 1 || length > max) {
    return {
      ok: false,
      error: isReply
        ? `Isi komentar wajib 1–${MAX_REPLY_BODY_CHARS} karakter`
        : `Isi posting wajib 1–${MAX_SEGMENT_BODY_CHARS} karakter`,
    };
  }
  const previous = typeof previousBody === 'string' ? previousBody : '';
  if (hasEveryoneMention(body) && !hasEveryoneMention(previous)) {
    return { ok: false, error: 'Tidak bisa menambah @semua lewat edit' };
  }
  return { ok: true, body };
}
```

- [ ] **Step 4: Jalankan test, pastikan LOLOS**

Run: `node --test tests/community-edit.test.js`
Expected: PASS (7 test)

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # harus: main
git add lib/community-edit.js tests/community-edit.test.js
git commit -m "feat(teras): helper murni validasi edit kiriman/komentar"
```

---

### Task 2: server.js — PATCH endpoint + `edited_at` di GET

**Files:**
- Modify: `server.js` — (a) import; (b) helper schema-missing dekat `isCommunityMediaSchemaMissing` (~4258); (c) endpoint PATCH tepat DI ATAS `app.delete('/api/community/posts/:id', ...)` (~6892); (d) select feed (~5554 + loop ~5611), detail (~5799 + loop ~5806), segmen utas (~5958), komentar + cuplikan balasan (~6627, ~6814, ~6841).

**Interfaces:**
- Consumes (Task 1): `validateCommunityEdit({ nextBody, previousBody, isReply })`.
- Consumes (server.js, sudah ada): `getAgentById`, `requireCommunityAccess`, `isCommunityUuid`, `isCommunityThreadSchemaMissing`, `supabase`.
- Produces (dipakai Task 3-4): `PATCH /api/community/posts/:id` body `{ body }` → 200 `{ data: { id, body, edited_at } }` | 400 `{error}` validasi | 403 `Hanya penulis yang bisa mengedit` | 404 `Kiriman tidak ditemukan` | 503 `Migrasi edit Teras belum diterapkan`; kolom `edited_at` (string ISO | null) ikut di rows GET feed/detail/thread/comments.

- [ ] **Step 1: Import + helper**

Tambah ke blok import lib di atas server.js (dekat import `./lib/community-thread-compose.js` yang sudah ada):

```js
import { validateCommunityEdit } from './lib/community-edit.js';
```

Tambah helper setelah `isCommunityMediaSchemaMissing` (~4258), pola yang sama:

```js
function isCommunityEditSchemaMissing(error) {
  const code = String(error?.code || '');
  if (!['42703', 'PGRST204'].includes(code)) return false;
  return /edited_at/i.test(String(error?.message || error?.details || ''));
}
```

- [ ] **Step 2: Endpoint PATCH**

Tepat di atas `app.delete('/api/community/posts/:id', ...)` (~6892). Gaya catch mengikuti handler DELETE tepat di bawahnya (samakan persis bentuk `catch` tetangga saat mengedit):

```js
// PATCH /api/community/posts/:id — edit teks kiriman/komentar oleh penulisnya.
// Kebijakan (spec 2026-07-22): tanpa batas waktu; teks saja; TANPA notifikasi
// mention baru & TANPA refresh link preview; @semua baru ditolak di helper.
app.patch('/api/community/posts/:id', authMiddleware, express.json({ limit: '8kb' }), async (req, res) => {
  try {
    const agent = await getAgentById(req.user.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (!requireCommunityAccess(agent, res)) return;

    if (!isCommunityUuid(req.params.id)) {
      return res.status(404).json({ error: 'Kiriman tidak ditemukan' });
    }
    const loadPostForEdit = withThread => supabase
      .from('community_posts')
      .select(`id, agent_id, body, deleted_at${withThread ? ', is_reply' : ''}`)
      .eq('id', req.params.id)
      .maybeSingle();
    let { data: post, error: findError } = await loadPostForEdit(true);
    if (isCommunityThreadSchemaMissing(findError)) {
      ({ data: post, error: findError } = await loadPostForEdit(false));
    }
    if (findError) throw findError;
    if (!post || post.deleted_at) {
      return res.status(404).json({ error: 'Kiriman tidak ditemukan' });
    }
    // Sengaja BUKAN canModerateCommunityContent: admin tidak mengedit tulisan
    // orang — jalur moderasi tetap hapus.
    if (post.agent_id !== agent.id) {
      return res.status(403).json({ error: 'Hanya penulis yang bisa mengedit' });
    }

    const verdict = validateCommunityEdit({
      nextBody: req.body?.body,
      previousBody: post.body,
      isReply: post.is_reply === true,
    });
    if (!verdict.ok) return res.status(400).json({ error: verdict.error });

    const editedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('community_posts')
      .update({ body: verdict.body, edited_at: editedAt })
      .eq('id', post.id);
    if (isCommunityEditSchemaMissing(updateError)) {
      return res.status(503).json({ error: 'Migrasi edit Teras belum diterapkan' });
    }
    if (updateError) throw updateError;

    res.json({ data: { id: post.id, body: verdict.body, edited_at: editedAt } });
  } catch (error) {
    console.error('PATCH /api/community/posts/:id error:', error);
    res.status(500).json({ error: 'Gagal menyimpan perubahan' });
  }
});
```

- [ ] **Step 3: `edited_at` di GET feed**

Di `buildPostsQuery` (~5551): tambah parameter kelima `includeEdited` dan sisipkan `${includeEdited ? 'edited_at, ' : ''}` di select tepat sebelum `is_system, `:

```js
const buildPostsQuery = (includeMedia, includeQuote, includeLinkPreview, includeThread, includeEdited) => {
  let query = supabase
    .from('community_posts')
    .select(`id, body, photo_url, ${includeMedia ? 'media, ' : ''}${includeQuote ? 'quoted_post_id, ' : ''}${includeLinkPreview ? 'link_preview, ' : ''}${includeThread ? 'parent_post_id, is_reply, ' : ''}${includeEdited ? 'edited_at, ' : ''}is_system, created_at, agent_id, agent:agents!community_posts_agent_id_fkey(name, slug, photo)`)
```

Di loop retry (~5611-5636): tambah `let includeEdited = true;`, naikkan `attempt < 5` jadi `attempt < 6` (perbarui komentar hitungan kolom fallback juga), oper `includeEdited` ke `buildPostsQuery`, dan tambah cabang:

```js
      if (includeEdited && isCommunityEditSchemaMissing(postsError)) {
        includeEdited = false;
        continue;
      }
```

- [ ] **Step 4: `edited_at` di GET detail + segmen utas**

Handler `GET /api/community/posts/:id` (~5775): perlakuan yang sama — `buildPostQuery` dapat parameter `includeEdited`, select disisipi `${includeEdited ? 'edited_at, ' : ''}` sebelum `is_system, `, loop retry (~5811) `attempt < 5` → `attempt < 6` + cabang `isCommunityEditSchemaMissing` seperti Step 3.

Query segmen utas di handler yang sama (~5958, select `` `id, body, photo_url, ${includeMedia ? 'media, ' : ''}is_system, created_at, agent_id, ...` ``): pakai flag `includeEdited` yang SUDAH diresolusi loop di atas:

```js
        .select(`id, body, photo_url, ${includeMedia ? 'media, ' : ''}${includeEdited ? 'edited_at, ' : ''}is_system, created_at, agent_id, agent:agents!community_posts_agent_id_fkey(name, slug, photo)`)
```

- [ ] **Step 5: `edited_at` di GET komentar + cuplikan balasan**

Handler `GET /api/community/posts/:id/comments` (~6609): `loadCommentRows` dapat parameter kedua dan retry-nya jadi loop kecil:

```js
    const loadCommentRows = (includeMedia, includeEdited) => supabase
      .from('community_posts')
      .select(`id, agent_id, body, ${includeMedia ? 'media, ' : ''}${includeEdited ? 'edited_at, ' : ''}created_at, parent_post_id, agent:agents!community_posts_agent_id_fkey(name, slug, photo)`)
      .eq('parent_post_id', post.id)
      .eq('is_reply', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(100);
    let includeMedia = true;
    let includeEdited = true;
    let comments = null;
    let error = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      ({ data: comments, error } = await loadCommentRows(includeMedia, includeEdited));
      if (includeMedia && isCommunityMediaSchemaMissing(error)) {
        includeMedia = false;
        continue;
      }
      if (includeEdited && isCommunityEditSchemaMissing(error)) {
        includeEdited = false;
        continue;
      }
      break;
    }
```

(Baris `let includeMedia = true;` + dua baris retry lama di bawahnya diganti blok ini; sisa handler tak berubah.) Dua select cuplikan balasan di handler yang sama (~6814 `` `id, body, ${includeMediaColumn ? 'media, ' : ''}created_at` `` dan ~6841 `` `id, body, ${includeMedia ? 'media, ' : ''}created_at` ``): sisipkan `${includeEdited ? 'edited_at, ' : ''}` sebelum `created_at` memakai flag yang sudah diresolusi (samakan nama variabel media dengan yang dipakai di masing-masing lokasi).

- [ ] **Step 6: Verifikasi**

Run: `node --check server.js`
Expected: tanpa output (sintaks valid).

Run: `node --test tests/community-edit.test.js tests/community-thread.test.js tests/community-thread-compose.test.js 2>&1 | tail -5`
Expected: semua PASS (regresi helper yang batasnya diimpor).

- [ ] **Step 7: Commit**

```bash
git branch --show-current   # harus: main
git add server.js
git commit -m "feat(teras): PATCH edit kiriman/komentar + edited_at di seluruh GET (fallback pra-migrasi)"
```

---

### Task 3: FE — edit kiriman di TerasPage + label "diedit"

**Files:**
- Modify: `src/components/TerasPage.tsx` — tipe (~116, ~170, ~186), state + handler (dekat state komposer ~1360), menu titik-tiga kiriman (~4767), render body kiriman & `<time>` (~4893).

**Interfaces:**
- Consumes (Task 2): `PATCH /api/community/posts/:id` (bentuk respons/galat lihat Task 2). Pola fetch yang ada: `requestJson` + `getAuthHeaders`.
- Produces (dipakai Task 4): state `editingEntry: { id: string; text: string; saving: boolean; error: string | null } | null`; handler `startEditEntry(id, body)`, `cancelEditEntry()`, `saveEditEntry(kind: 'post' | 'comment', postIdForPanel?: string)`; util `patchEntryBody(id, body, editedAt)` yang mem-patch `posts` (termasuk `post.thread` bila ada) dan `commentPanels`.

- [ ] **Step 1: Tipe**

Tambah `edited_at?: string | null;` tepat setelah `created_at` di: `interface CommunityPost` (~116), bentuk segmen utas (`created_at?: string` ~170 — ikuti opsionalitasnya: `edited_at?: string | null`), dan `interface CommunityComment` (~186).

- [ ] **Step 2: State + handler + util patch**

Dekat state komposer (~1360-1370) tambah:

```tsx
  // ---- Edit kiriman/komentar (spec 2026-07-22) ----
  // Satu mode edit aktif; TIDAK menyentuh kunci draf teras:draft:* mana pun.
  const [editingEntry, setEditingEntry] = useState<{
    id: string;
    text: string;
    saving: boolean;
    error: string | null;
  } | null>(null);
```

Setelah `updateCommentInput` (agar bisa dipanggil dari kedua dunia), tambah:

```tsx
  const patchEntryBody = (id: string, body: string, editedAt: string) => {
    setPosts(current => current.map(post => {
      let next = post.id === id ? { ...post, body, edited_at: editedAt } : post;
      // Segmen utas menempel di kiriman induk (lihat bentuk respons GET detail).
      const threadRows = (next as { thread?: { id: string; body: string; edited_at?: string | null }[] }).thread;
      if (threadRows?.some(segment => segment.id === id)) {
        next = {
          ...next,
          thread: threadRows.map(segment => (
            segment.id === id ? { ...segment, body, edited_at: editedAt } : segment
          )),
        } as typeof next;
      }
      return next;
    }));
    setCommentPanels(current => {
      let changed = false;
      const entries = Object.entries(current).map(([pid, panel]) => {
        const comments = panel.comments.map(comment => {
          let nextComment = comment.id === id ? { ...comment, body, edited_at: editedAt } : comment;
          // Cuplikan balasan bersarang: ikuti struktur & nama field yang
          // dipakai helper hapus komentar (~line 656) — kalau di sana bukan
          // `replies`, samakan dengan nama aslinya.
          const replies = (nextComment as { replies?: CommunityComment[] }).replies;
          if (replies?.some(reply => reply.id === id)) {
            nextComment = {
              ...nextComment,
              replies: replies.map(reply => (
                reply.id === id ? { ...reply, body, edited_at: editedAt } : reply
              )),
            } as typeof nextComment;
          }
          if (nextComment !== comment) changed = true;
          return nextComment;
        });
        return [pid, { ...panel, comments }] as const;
      });
      return changed ? Object.fromEntries(entries) : current;
    });
  };

  const startEditEntry = (id: string, body: string) => {
    if (editingEntry && editingEntry.id !== id) {
      // Pindah target edit: buang senyap hanya kalau teks belum diubah.
      const original = posts.find(post => post.id === editingEntry.id)?.body;
      if (editingEntry.text !== original && !window.confirm('Buang perubahan?')) return;
    }
    setEditingEntry({ id, text: body, saving: false, error: null });
  };

  const cancelEditEntry = () => setEditingEntry(null);

  const saveEditEntry = async () => {
    if (!editingEntry || editingEntry.saving) return;
    setEditingEntry(current => (current ? { ...current, saving: true, error: null } : current));
    try {
      const result = await requestJson<{ id: string; body: string; edited_at: string }>(
        `/api/community/posts/${editingEntry.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ body: editingEntry.text }),
        },
        'Gagal menyimpan. Coba lagi.',
      );
      if (!result?.body) throw new Error('Gagal menyimpan. Coba lagi.');
      patchEntryBody(result.id, result.body, result.edited_at);
      setEditingEntry(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal menyimpan. Coba lagi.';
      setEditingEntry(current => (current ? { ...current, saving: false, error: message } : current));
    }
  };
```

Cocokkan bentuk pemanggilan `requestJson` dengan pemakaian yang sudah ada di file (generic + envelope `{data}`): kalau `requestJson` mengembalikan envelope, sesuaikan (`result.data.body` dst.) — lihat pemakaian di submit komentar.

- [ ] **Step 3: Item menu "Edit" pada kiriman milik sendiri**

Di menu titik-tiga kiriman (~4754-4777), di ATAS tombol Hapus, tambah (hanya kiriman sendiri; `post.is_own` — bukan `canDeletePost` yang mencakup admin):

```tsx
                              {post.is_own && (
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    closePostMenu(post.id, true);
                                    startEditEntry(post.id, post.body);
                                  }}
                                  className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-[13.5px] font-semibold text-gray-800 transition-colors hover:bg-gray-100 active:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-700/60 dark:active:bg-slate-700/60"
                                >
                                  Edit
                                  <Pencil size={16} />
                                </button>
                              )}
```

Tambahkan `Pencil` ke import `lucide-react` yang ada. Sesuaikan cara menutup menu dengan mekanisme yang dipakai tombol Hapus/Laporkan di situ.

- [ ] **Step 4: Render mode edit + label pada kiriman**

Di kartu kiriman, bungkus render body: bila `editingEntry?.id === post.id` ganti blok body dengan editor inline (counter 500 = `MAX_SEGMENT_BODY_CHARS`; definisikan `const MAX_COMMUNITY_POST_CHARS = 500;` dekat `MAX_COMMUNITY_COMMENT_CHARS` ~294 dengan komentar sinkron ke `lib/community-thread-compose.js`):

```tsx
{editingEntry?.id === post.id ? (
  <div className="mt-1">
    <textarea
      value={editingEntry.text}
      autoFocus
      rows={1}
      readOnly={editingEntry.saving}
      ref={node => {
        if (node) {
          node.style.height = '';
          node.style.height = `${node.scrollHeight}px`;
        }
      }}
      onChange={event => {
        const { value } = event.target;
        event.target.style.height = '';
        event.target.style.height = `${event.target.scrollHeight}px`;
        setEditingEntry(current => (current ? { ...current, text: value } : current));
      }}
      onKeyDown={event => { if (event.key === 'Escape') cancelEditEntry(); }}
      className="w-full resize-none overflow-hidden rounded-xl border border-gray-200 bg-white px-3 py-2 text-[14px] text-gray-900 outline-none focus:border-emerald-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
    />
    <div className="mt-1.5 flex items-center justify-between gap-3">
      <span className={`text-[11px] font-medium ${Array.from(editingEntry.text.trim()).length > MAX_COMMUNITY_POST_CHARS ? 'text-red-500' : 'text-gray-400 dark:text-slate-500'}`}>
        {Array.from(editingEntry.text.trim()).length}/{MAX_COMMUNITY_POST_CHARS}
      </span>
      <div className="flex items-center gap-2">
        {editingEntry.error && (
          <span role="alert" className="text-[11px] font-medium text-red-500">{editingEntry.error}</span>
        )}
        <button type="button" onClick={cancelEditEntry} disabled={editingEntry.saving}
          className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800">
          Batal
        </button>
        <button
          type="button"
          onClick={() => void saveEditEntry()}
          disabled={editingEntry.saving
            || Array.from(editingEntry.text.trim()).length < 1
            || Array.from(editingEntry.text.trim()).length > MAX_COMMUNITY_POST_CHARS}
          className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {editingEntry.saving ? <Loader2 size={13} className="animate-spin" /> : null}
          Simpan
        </button>
      </div>
    </div>
  </div>
) : (
  /* blok render body yang sudah ada, apa adanya */
)}
```

Textarea di sini pakai autosize inline (bukan `autoGrowCommentInput` — itu milik input komentar); `ref` callback menangani tinggi awal untuk teks lama multi-baris.

Label di samping `<time>` (~4893) — pola yang sama diterapkan juga di render segmen utas di halaman detail (cari `<time` lain yang merender segmen):

```tsx
{post.edited_at && (
  <span className="shrink-0 text-[11px] font-medium text-gray-400 dark:text-slate-500">· diedit</span>
)}
```

- [ ] **Step 5: Verifikasi build**

Run: `npx tsc --noEmit 2>&1 | grep -iE "TerasPage|community-edit"` → kosong.
Run: `npm run build:spa` → sukses.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # harus: main
git add src/components/TerasPage.tsx
git commit -m "feat(teras): edit inline kiriman + label diedit"
```

---

### Task 4: FE — edit komentar di CommentThread

**Files:**
- Modify: `src/components/teras/CommentThread.tsx` (props ~10-30, CommentRow ~204-360, `<time>` ~349)
- Modify: `src/components/TerasPage.tsx` (pemanggilan `<CommentThread` — oper prop baru)

**Interfaces:**
- Consumes (Task 3): `startEditEntry`/`saveEditEntry` TIDAK dipakai di sini — komentar punya jalur sendiri lewat prop; `patchEntryBody(id, body, editedAt)` dipakai TerasPage di dalam callback.
- Produces: prop baru `CommentThreadProps.onEditSave: (commentId: string, body: string) => Promise<string | null>` — kembalikan `null` saat sukses (state komentar sudah dipatch pemanggil), atau string pesan galat untuk ditampilkan.

Catatan deviasi sadar dari spec: "satu mode edit aktif" ditegakkan ketat antar-KIRIMAN (state `editingEntry` tunggal); edit KOMENTAR hidup sebagai state lokal per baris `CommentRow`, jadi teorinya satu edit kiriman + satu edit komentar bisa terbuka bersamaan. Diterima demi batas komponen yang bersih (menghindari prop-drilling state edit ke dalam CommentThread); dampak praktisnya nol karena masing-masing tetap satu-per-jenis dan tidak saling menimpa.

- [ ] **Step 1: Prop + state edit lokal di CommentRow**

`CommentThreadProps` tambah `onEditSave: (commentId: string, body: string) => Promise<string | null>;` — teruskan ke setiap `CommentRow` (dua lokasi pemanggilan di dalam file, ~122 & ~155, sejajar `onDelete`).

Di `CommentRow`, state lokal + konstanta (300 sudah ada sebagai batas komentar di TerasPage; di file ini definisikan `const MAX_COMMENT_EDIT_CHARS = 300;` dekat atas komponen dengan komentar sinkron):

```tsx
  const [editState, setEditState] = useState<{ text: string; saving: boolean; error: string | null } | null>(null);
  const editLength = editState ? Array.from(editState.text.trim()).length : 0;

  const submitEdit = async () => {
    if (!editState || editState.saving) return;
    setEditState(current => (current ? { ...current, saving: true, error: null } : current));
    const message = await onEditSave(comment.id, editState.text);
    if (message === null) {
      setEditState(null);
    } else {
      setEditState(current => (current ? { ...current, saving: false, error: message } : current));
    }
  };
```

(Import `useState` bila belum ada di file.)

- [ ] **Step 2: Pintu masuk + editor + label**

Di sebelah tombol hapus (~352, gated `canDeleteComment`), tambah tombol Edit HANYA untuk `comment.is_own` (bukan `canDeleteComment` — admin tidak mengedit), ikuti gaya tombol aksi komentar yang ada di situ, `onClick={() => setEditState({ text: comment.body, saving: false, error: null })}`.

Render body komentar: bila `editState` aktif ganti blok body dengan editor (bentuk yang sama dengan Task 3 Step 4 tapi batas 300 dan tombol memanggil `submitEdit`; Esc → `setEditState(null)`):

```tsx
{editState ? (
  <div className="mt-1">
    <textarea
      value={editState.text}
      autoFocus
      rows={1}
      readOnly={editState.saving}
      ref={node => {
        if (node) {
          node.style.height = '';
          node.style.height = `${node.scrollHeight}px`;
        }
      }}
      onChange={event => {
        const { value } = event.target;
        event.target.style.height = '';
        event.target.style.height = `${event.target.scrollHeight}px`;
        setEditState(current => (current ? { ...current, text: value } : current));
      }}
      onKeyDown={event => { if (event.key === 'Escape') setEditState(null); }}
      className="w-full resize-none overflow-hidden rounded-xl border border-gray-200 bg-white px-3 py-2 text-[13.5px] text-gray-900 outline-none focus:border-emerald-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
    />
    <div className="mt-1.5 flex items-center justify-between gap-3">
      <span className={`text-[11px] font-medium ${editLength > MAX_COMMENT_EDIT_CHARS ? 'text-red-500' : 'text-gray-400 dark:text-slate-500'}`}>
        {editLength}/{MAX_COMMENT_EDIT_CHARS}
      </span>
      <div className="flex items-center gap-2">
        {editState.error && (
          <span role="alert" className="text-[11px] font-medium text-red-500">{editState.error}</span>
        )}
        <button type="button" onClick={() => setEditState(null)} disabled={editState.saving}
          className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800">
          Batal
        </button>
        <button type="button" onClick={() => void submitEdit()}
          disabled={editState.saving || editLength < 1 || editLength > MAX_COMMENT_EDIT_CHARS}
          className="rounded-full bg-emerald-600 px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
          Simpan
        </button>
      </div>
    </div>
  </div>
) : (
  /* render body komentar yang sudah ada */
)}
```

Label setelah `<time>` (~349):

```tsx
{comment.edited_at && (
  <span className="shrink-0 text-[11px] font-medium text-gray-400 dark:text-slate-500">· diedit</span>
)}
```

(Tipe comment di file ini: tambah `edited_at?: string | null` di bentuk komentar yang dipakai CommentThread bila ia punya deklarasi tipe sendiri; kalau memakai `CommunityComment` dari TerasPage, Task 3 Step 1 sudah menutupnya.)

- [ ] **Step 3: Wire di TerasPage**

Di setiap pemanggilan `<CommentThread ... onDelete={...}>` tambah:

```tsx
onEditSave={async (commentId, body) => {
  try {
    const result = await requestJson<{ id: string; body: string; edited_at: string }>(
      `/api/community/posts/${commentId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ body }),
      },
      'Gagal menyimpan. Coba lagi.',
    );
    if (!result?.body) return 'Gagal menyimpan. Coba lagi.';
    patchEntryBody(result.id, result.body, result.edited_at);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Gagal menyimpan. Coba lagi.';
  }
}}
```

(Sesuaikan envelope `requestJson` seperti Task 3 Step 2; kalau pemanggilan `<CommentThread` lebih dari satu, angkat callback jadi satu `const handleCommentEditSave = ...` dekat `patchEntryBody` dan oper di semua lokasi.)

- [ ] **Step 4: Verifikasi build**

Run: `npx tsc --noEmit 2>&1 | grep -iE "TerasPage|CommentThread|community-edit"` → kosong.
Run: `npm run build:spa` → sukses.
Run: `node --test tests/community-edit.test.js` → PASS (regresi).

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # harus: main
git add src/components/teras/CommentThread.tsx src/components/TerasPage.tsx
git commit -m "feat(teras): edit inline komentar + label diedit"
```

---

### Task 5: Verifikasi akhir + serah-terima migrasi & checklist

**Files:** — (verifikasi saja)

- [ ] **Step 1: Gate cepat**

```bash
node --check server.js && node --test tests/community-edit.test.js tests/teras-draft.test.js && npx tsc --noEmit 2>&1 | grep -iE "TerasPage|CommentThread|community-edit" ; npm run build:spa
```

Expected: check bersih, test PASS, grep tsc kosong, build sukses. (JANGAN suite penuh/browser.)

- [ ] **Step 2: Serah-terima ke user**

Sampaikan, urutannya penting:

**A. Migrasi (jalankan di Supabase SQL Editor SEBELUM deploy):**

```sql
ALTER TABLE community_posts ADD COLUMN edited_at timestamptz;
```

**B. Deploy** server.js (push → deploy; node tidak hot-reload).

**C. Verifikasi rute** (401 = rute hidup; 404 HTML = server lama belum ter-deploy):

```bash
curl -i -X PATCH https://<host>/api/community/posts/00000000-0000-0000-0000-000000000000 -H 'Content-Type: application/json' -d '{"body":"x"}'
```

**D. E2e manual:** (1) edit kiriman sendiri → teks berubah + "· diedit" di feed & detail, bertahan setelah refresh; (2) edit segmen utas dari halaman detail → label di segmen itu; (3) edit komentar & balasan → label di utas komentar; (4) kiriman orang lain → tidak ada menu Edit; (5) tambah `@semua` saat edit → ditolak dengan pesan; (6) 0/501 karakter → tombol Simpan nonaktif; (7) matikan jaringan → Simpan gagal, teks TIDAK hilang, pesan galat tampil; (8) Esc / Batal → teks asli kembali; (9) sebelum migrasi diterapkan (kalau sempat): edit → pesan "Migrasi edit Teras belum diterapkan".
