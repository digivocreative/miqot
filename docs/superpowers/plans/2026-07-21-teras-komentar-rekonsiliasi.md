# Rekonsiliasi: Komentar-jadi-kiriman DI ATAS Utas Composer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Menyusun ulang fitur "komentar jadi kiriman penuh" (reaksi/balas/kutip komentar) di atas fitur "utas composer" yang sudah ada di `main`, memakai **kolom pembeda eksplisit `is_reply`** agar segmen-utas dan balasan-komentar bisa hidup berdampingan di skema `parent_post_id`/`root_post_id` yang sama.

**Architecture:** `main` sudah mengirim kolom `parent_post_id`/`root_post_id` + filter feed + rantai utas di detail. Balasan komentar adalah anak-post `is_reply = true` (penulis bisa siapa saja); segmen utas adalah anak-post `is_reply = false` (penulis = penulis akar). Feed utama menyembunyikan **semua** anak; profil menampilkan balasan tapi menyembunyikan segmen; `comment_count`/`reply_count` menghitung `is_reply = true` saja.

**Tech Stack:** Node/Express (`server.js`), Supabase JS, React+TS+Vite (`src/components/TerasPage.tsx`), `node:test`. Branch kerja `worktree-teras-reconcile` (dari `main`). Kode fitur B tersedia sebagai bahan lewat `git show worktree-teras-komentar-thread:<path>`.

## Global Constraints

- **DDL hanya user** di Supabase SQL Editor. DB lokal = PRODUKSI. Subagent KODE SAJA — tanpa `node server.js`/`npm run dev`/curl/psql. Verifikasi cepat saja (node --check, tsc, build, unit test); e2e diserahkan user.
- **Jangan push/merge ke `main`** — push memicu auto-deploy. Kerja di worktree.
- **`main` sudah punya**: kolom+indeks skema, filter `parent_post_id IS NULL` di feed/teaser/head/unread/broadcast, composer segmen, `thread` di detail, `thread_count`, DELETE cascade utas, `lib/community-thread-compose.js`, preferensi lonceng (`prefs`/`bellSourceFlags`). JANGAN bangun ulang; JANGAN hapus fitur utas.
- **Pembeda**: `is_reply BOOLEAN NOT NULL DEFAULT false`. Balasan (`POST /comments`) = `true`; segmen (`POST /posts` segments[]) = `false`; backfill komentar lama = `true`.
- **Batas balasan 300 char, kiriman/segmen 500.** Cuplikan maks 2. `reply_count`/`comment_count` hitung anak `is_reply = true` saja.
- **Pesan galat Bahasa Indonesia.** Ikuti gaya `[community] ...`.
- Verifikasi tiap task: `node --check server.js`, dan untuk FE `npx tsc --noEmit` (baseline galat pra-eksis harus dicatat, tak boleh nambah) + `npm run build`. Guard test berbasis teks sumber sesuai preseden repo. Commit selektif (`git add <path>`), verifikasi `git branch --show-current` = `worktree-teras-reconcile` dulu.
- Bahan fitur B: `git show worktree-teras-komentar-thread:<path>`. Peta lengkap di `.superpowers/sdd/reconcile-map.md`.

## File Structure

| Berkas | Peran dalam rekonsiliasi |
|---|---|
| `migrations/20260726000000_community_post_thread.sql` | main sudah punya (kolom+indeks). TAMBAHKAN: kolom `is_reply`, backfill komentar lama (`is_reply=true`), DROP→re-ADD FK mention, cek `type`, verifikasi, rename legacy |
| `lib/community-thread.js` | bawa utuh dari B (murni, 16 tes) |
| `src/components/teras/CommentThread.tsx`, `AgentAvatar.tsx` | bawa dari B; sesuaikan saat menuang TerasPage |
| `server.js` | integrasi: `is_reply` di jalur tulis, profil pakai `is_reply`, `comment_count`/`reply_count` pakai `is_reply`, `GET /comments`, `ancestors` di detail (pertahankan `thread`), notifikasi sumber balasan di atas `prefs` main, DELETE aturan campuran |
| `src/components/TerasPage.tsx` | tuang ulang manual: basis main + lapisan komentar B |
| `tests/community-thread*.test.js`, guard | bawa + perluas dari B, selaraskan dengan `is_reply` |

---

### Task 1: Migrasi — kolom `is_reply` + operasi data komentar

**Files:**
- Modify: `migrations/20260726000000_community_post_thread.sql`

**Interfaces:**
- Produces: kolom `community_posts.is_reply BOOLEAN NOT NULL DEFAULT false`; indeks parsial balasan; urutan A→deploy→B→C terdokumentasi.

Migrasi ini SUDAH ADA di main (kolom+indeks utas). Task ini MENAMBAHKAN operasi milik fitur B tanpa mengubah bagian utas yang sudah di-deploy. Karena kolom+indeks utas sudah di prod, bagian yang benar-benar baru bagi produksi hanyalah: `is_reply`, backfill, FK mention, rename legacy.

- [ ] **Step 1: Baca migrasi main + bagian B**

`git show worktree-teras-komentar-thread:migrations/20260726000000_community_post_thread.sql` = versi B (punya backfill, cek type, FK, rename). Versi main = yang ada di worktree ini sekarang. Pahami keduanya sebelum menulis.

- [ ] **Step 2: Tambahkan kolom `is_reply` + indeks (Bagian A tambahan)**

Di dalam BAGIAN A migrasi (setelah kolom parent/root yang sudah ada), tambahkan:

```sql
-- Pembeda anak-post: balasan komentar (true, penulis bebas) vs segmen utas
-- (false, penulis = penulis akar). Feed utama menyembunyikan semua anak; profil
-- menampilkan balasan tapi menyembunyikan segmen; comment_count hitung balasan saja.
ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS is_reply BOOLEAN NOT NULL DEFAULT false;

-- Balasan sebuah kiriman, terurut waktu (dipakai GET /comments + comment_count).
CREATE INDEX IF NOT EXISTS idx_community_posts_replies
  ON community_posts (parent_post_id, created_at)
  WHERE is_reply = true AND deleted_at IS NULL;

-- Balasan yang tampil di profil penulis.
CREATE INDEX IF NOT EXISTS idx_community_posts_reply_author
  ON community_posts (agent_id, created_at DESC)
  WHERE is_reply = true AND deleted_at IS NULL;
```

- [ ] **Step 3: Backfill komentar lama sebagai balasan (`is_reply=true`)**

Bawa BAGIAN B dari fitur B, TAPI setiap baris hasil backfill diberi `is_reply = true` (komentar lama = balasan, bukan segmen). Pertahankan dua varian kolom `type` dan cek pra-B dari fitur B. `post_id` lama → `parent_post_id` DAN `root_post_id`. `ON CONFLICT (id) DO NOTHING`.

- [ ] **Step 4: FK mention (A: DROP, C: re-ADD ke community_posts) + rename legacy**

Bawa DROP FK `community_mentions_comment_id_fkey` ke Bagian A dan re-ADD (menunjuk `community_posts`) ke Bagian C, persis alur fitur B. Bawa verifikasi `NOT EXISTS` dan Langkah 6 rename `community_post_comments → _legacy` (dikomentari, ditunda). Urutan header: **A → deploy → B → C**.

- [ ] **Step 5: Commit**

```bash
git add migrations/20260726000000_community_post_thread.sql
git commit -m "feat(teras-reconcile): kolom is_reply + backfill komentar lama sebagai balasan"
```

---

### Task 2: Helper murni `lib/community-thread.js`

**Files:**
- Create: `lib/community-thread.js`, `tests/community-thread.test.js`

**Interfaces:**
- Produces: `resolveRootPostId`, `buildAncestorChain`, `groupRepliesWithPreview` (identik fitur B).

- [ ] **Step 1: Bawa utuh dari fitur B**

`git show worktree-teras-komentar-thread:lib/community-thread.js > lib/community-thread.js` dan `git show worktree-teras-komentar-thread:tests/community-thread.test.js > tests/community-thread.test.js`. File ini murni & tak bergantung apa pun; tak perlu diubah.

- [ ] **Step 2: Jalankan tes**

Run: `node --test tests/community-thread.test.js` → 16/16 pass.

- [ ] **Step 3: Commit**

```bash
git add lib/community-thread.js tests/community-thread.test.js
git commit -m "feat(teras-reconcile): helper murni bentuk thread balasan"
```

---

### Task 3: Jalur tulis balasan — `POST /comments` ke community_posts + `is_reply=true`

**Files:**
- Modify: `server.js` — `POST /api/community/posts/:id/comments`, `POST /api/community/posts` (guard), `recordCommunityMentions`, `loadActiveCommunityPost`, `DELETE /api/community/comments/:id`

**Interfaces:**
- Consumes: `resolveRootPostId` (Task 2), `is_reply` (Task 1)
- Produces: balasan = baris `community_posts` dengan `parent_post_id`, `root_post_id`, `is_reply=true`.

- [ ] **Step 1: `POST /comments` menulis ke community_posts**

Bawa jalur tulis fitur B (`git show worktree-teras-komentar-thread:server.js`, cari `POST /api/community/posts/:id/comments`), tapi WAJIB set **`is_reply: true`** pada insert. Pertahankan: validasi 1–300, media, `client_id` (23505 idempoten), retry kolom `type` obsolet, guard `isCommunityThreadSchemaMissing` → 503, `resolveRootPostId(post)`. Respons `reply_count: 0, preview_replies: []`. Pastikan `loadActiveCommunityPost` mengambil `root_post_id`.

- [ ] **Step 2: `recordCommunityMentions` melayani dua pemanggil**

Fungsi harus menerima BENTUK segmen (`{segments}`, main) DAN bentuk balasan (`{body, postId, commentId}`, B) tanpa memecah pemanggil composer utas. `lib/community-notifications.js` JANGAN disentuh (identik).

- [ ] **Step 3: `POST /posts` guard tidak memecah jalur segmen**

Jalur segmen main menulis `parent_post_id`/`root_post_id` **di server** (dari `segments[]`), bukan dari klien. Pastikan penolakan `parent_post_id` dari KLIEN (fitur B) tidak memblokir jalur segmen server-side. Kalau bentuk main berbeda, sesuaikan supaya composer utas tetap jalan.

- [ ] **Step 4: `DELETE /comments/:id` alias**

Bawa dari B: hapus baris `community_posts` (soft delete), syarat `parent_post_id IS NOT NULL` + `is_reply = true` (jangan bisa menghapus segmen utas lewat endpoint komentar). Pertahankan status/pesan lama.

- [ ] **Step 5: Verifikasi**

Run: `node --check server.js`. Concern apa pun soal interaksi dengan jalur segmen main → laporkan.

- [ ] **Step 6: Commit**

```bash
git add server.js
git commit -m "feat(teras-reconcile): balasan ditulis sebagai kiriman is_reply"
```

---

### Task 4: Baca balasan + hitungan pakai `is_reply`

**Files:**
- Modify: `server.js` — `GET /api/community/posts/:id/comments`, `comment_count` di feed & detail

**Interfaces:**
- Consumes: `groupRepliesWithPreview`, `is_reply`
- Produces: `GET /comments` mengembalikan balasan (`is_reply=true`) + `reply_count`/`preview_replies`; `comment_count` = jumlah anak `is_reply=true`.

- [ ] **Step 1: `GET /comments` daftar balasan**

Bawa jalur baca fitur B, TAPI query balasan menyaring `.eq('parent_post_id', post.id).eq('is_reply', true)` (bukan hanya parent). Query cucu untuk cuplikan juga `.eq('is_reply', true)`. Pertahankan disiplin: `{ count: 'exact' }` untuk deteksi truncation, `console.warn` saat terpotong, degradasi pra-migrasi. `preview_replies` bentuk identik komentar.

- [ ] **Step 2: `comment_count` di feed & detail hitung `is_reply=true`**

Kedua penghitung `comment_count` (feed `buildPostsQuery` pasca-query, dan `GET /posts/:id`) menghitung anak `.eq('is_reply', true)` — supaya segmen utas TIDAK terhitung sebagai komentar. Feed: satu query `{count:'exact'}` + warn truncation. Detail: head-count eksak. Pertahankan degradasi.

- [ ] **Step 3: Verifikasi**

Run: `node --check server.js`.

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat(teras-reconcile): baca balasan & hitungan berbasis is_reply"
```

---

### Task 5: Detail — pertahankan `thread` (main) + tambah `ancestors` (B)

**Files:**
- Modify: `server.js` — `GET /api/community/posts/:id`

**Interfaces:**
- Consumes: `buildAncestorChain`
- Produces: payload detail memuat `thread` (segmen ke bawah, main) DAN `ancestors` (leluhur ke atas, B) DAN `comment_count` (is_reply).

- [ ] **Step 1: Tambah `ancestors` tanpa menghapus `thread`**

Pertahankan blok `thread` main apa adanya. Tambahkan penelusuran leluhur per-hop fitur B (`fetchCommunityAncestorRow`, `COMMUNITY_MAX_ANCESTOR_HOPS`, leluhur terhapus `{available:false}`) dan field `ancestors` + `parent_post_id`. Loop retry schema-missing harus tetap menaungi semua bendera.

- [ ] **Step 2: Verifikasi**

Run: `node --check server.js`.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat(teras-reconcile): rantai leluhur di detail, thread utas dipertahankan"
```

---

### Task 6: Profil menampilkan balasan (`is_reply`) tanpa membocorkan segmen

**Files:**
- Modify: `server.js` — `buildPostsQuery` di `GET /api/community/feed`

**Interfaces:**
- Consumes: `is_reply`
- Produces: mode profil memuat kiriman induk + balasan (`is_reply=true`), TIDAK segmen; item balasan membawa `parent_author`. Mode linimasa tetap hanya kiriman induk.

- [ ] **Step 1: Filter profil vs linimasa berbasis `is_reply`**

- Linimasa (non-profil): tetap `.is('parent_post_id', null)` — sembunyikan semua anak (segmen & balasan). Ini bentuk main; jangan longgarkan.
- Profil (`profileMember`): `.or('parent_post_id.is.null,is_reply.eq.true')` — tampilkan kiriman induk + balasan, sembunyikan segmen (`is_reply=false, parent_post_id NOT NULL`).
- Masukkan `parent_post_id` + `is_reply` ke `select` hanya saat `includeThread`.

- [ ] **Step 2: `parent_author` untuk baris "Membalas ke @X" (profil saja)**

Bawa blok `parentAuthorById` fitur B (satu query `.in('id', parentIds)`, bawa `deleted_at` supaya induk terhapus → `available:false`), hanya di mode profil. Field respons `parent_post_id` + `parent_author`.

- [ ] **Step 3: Verifikasi**

Run: `node --check server.js`.

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat(teras-reconcile): profil memuat balasan, segmen utas tetap tersembunyi"
```

---

### Task 7: Notifikasi — sumber balasan di atas `prefs`/`bellSourceFlags` main

**Files:**
- Modify: `server.js` — `loadTerasNotificationSources`

**Interfaces:**
- Consumes: embed induk `parent:community_posts!parent_post_id!inner`, `is_reply`
- Produces: notifikasi `comment` bersumber balasan (`is_reply=true`) atas kiriman/balasan saya; `broadcastQuery` tetap saring anak (bentuk main); guard skema toleran `PGRST201`.

- [ ] **Step 1: `commentQuery` sumber balasan, di atas signature main**

Ganti `commentQuery` main (yang baca `community_post_comments`) dengan bentuk fitur B: embed `parent:community_posts!parent_post_id!inner(agent_id, deleted_at)`, `.eq('parent.agent_id', agent.id)`, `.eq('is_reply', true)`, `.not('parent_post_id','is',null)`, lalu map `post_id: row.parent_post_id`. TAPI pertahankan signature `(agent, { since, limit, prefs })` + `bellSourceFlags` main — tuang sumber baru ke KERANGKA main, jangan ganti kerangkanya. `lib/community-notifications.js` tak disentuh.

- [ ] **Step 2: `broadcastQuery` pakai bentuk main**

JANGAN bawa penghapusan filter dari B. Broadcast tetap `parent_post_id IS NULL` (bentuk main) — @semua hanya dari kiriman induk.

- [ ] **Step 3: Guard skema toleran PGRST201**

Pastikan guard yang menaungi embed self-ref (kini `community_posts` punya 3 FK ke diri sendiri) menoleransi `PGRST201` selain `42P01/PGRST205/PGRST200`, supaya embed ambigu tidak mematikan seluruh lonceng. Bawa dari fitur B.

- [ ] **Step 4: Verifikasi**

Run: `node --check server.js` + `node --test tests/community-notifications.test.js`.

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "feat(teras-reconcile): notifikasi balasan di atas kerangka prefs lonceng"
```

---

### Task 8: DELETE — cascade utas dipertahankan, balasan orang lain selamat

**Files:**
- Modify: `server.js` — `DELETE /api/community/posts/:id`

**Interfaces:**
- Produces: hapus akar utas cascade ke segmen (`.eq('agent_id', root.agent_id)`, bentuk main); balasan `is_reply=true` milik agen lain TIDAK ikut terhapus.

- [ ] **Step 1: Batasi cascade ke segmen milik penulis akar**

Pertahankan cascade utas main, tapi pastikan predikatnya `.eq('agent_id', post.agent_id)` (hanya segmen milik penulis akar) SEHINGGA balasan `is_reply=true` dari agen lain di bawah akar itu tidak ikut soft-deleted. Verifikasi lewat pembacaan bahwa balasan agen lain → jadi placeholder `{available:false}` di `buildAncestorChain`, bukan terhapus.

- [ ] **Step 2: Verifikasi**

Run: `node --check server.js`.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat(teras-reconcile): cascade hapus utas tanpa menyeret balasan agen lain"
```

---

### Task 9: Guard test skema — selaraskan dengan `is_reply` + profil longgar

**Files:**
- Modify: `tests/community-thread-feed-guard.test.js` (main punya versi utas)

**Interfaces:**
- Produces: guard mengunci: linimasa saring semua anak; profil tampilkan `is_reply`; comment_count pakai `is_reply`; broadcast tetap saring; commentQuery notifikasi sumber balasan.

- [ ] **Step 1: Perluas guard main, jangan hapus asersinya**

Guard main mengunci 6 query utas. Perbarui daftar (memo [[teras-utas-composer]] baris 15: "perbarui daftar, jangan hapus tesnya"): profil kini `is_reply.eq.true` (bukan disaring penuh); comment_count `is_reply`; broadcast tetap `parent_post_id IS NULL`; commentQuery sumber `community_posts`+`parent_post_id`. Tambah asersi baru, pertahankan yang utas.

- [ ] **Step 2: Bukti mutasi**

Untuk asersi profil-`is_reply`, buktikan tesnya hidup: balik sementara (hapus `is_reply` dari profil), pastikan GAGAL, kembalikan, pastikan LULUS. Laporkan output.

- [ ] **Step 3: Jalankan + commit**

Run: `node --test tests/community-thread-feed-guard.test.js`.
```bash
git add tests/community-thread-feed-guard.test.js
git commit -m "feat(teras-reconcile): guard sumber selaras is_reply + profil balasan"
```

---

### Task 10: TerasPage.tsx — tuang lapisan komentar di atas basis utas main

**Files:**
- Modify: `src/components/TerasPage.tsx` (basis main)
- Create: `src/components/teras/CommentThread.tsx`, `src/components/teras/AgentAvatar.tsx`

**Interfaces:**
- Consumes: `GET /comments`, `ancestors`, `parent_author` dari server (Task 3–6)
- Produces: UI komentar (CommentThread, baris aksi, cuplikan, "Membalas ke @X", klik komentar) HIDUP BERDAMPINGAN dengan composer segmen + chip 1/N + render `thread` main.

Ini task paling besar. Basis = TerasPage **main** (jangan buang composer segmen, chip 1/N, render thread). Tambahkan lapisan komentar B.

- [ ] **Step 1: Bawa komponen ours-only**

`git show worktree-teras-komentar-thread:src/components/teras/CommentThread.tsx > src/components/teras/CommentThread.tsx` dan sama untuk `AgentAvatar.tsx`. CATATAN: kalau main masih punya `AgentAvatar` inline di TerasPage, ekstraksi harus diselaraskan — impor dari modul baru di kedua tempat, jangan duplikat definisi.

- [ ] **Step 2: Tipe balasan pada `CommunityPost`/`CommunityComment`**

Tambahkan `parent_author?`, `ancestors?`, `reply_count?`, `preview_replies?`, dan tipe `CommunityComment` dari B. Pertahankan `thread_count?`/`thread?` main. Ekspor tipe yang dipakai CommentThread.

- [ ] **Step 3: Render + aksi komentar**

Tuang dari fitur B: render `CommentThread`, baris aksi komentar (react/reply/quote/delete), penargetan balas (chip "Membalas ke X", `composerSheetVisible = composerOpen && !profileSlug` invarian JANGAN dipecah), cuplikan + "Lihat N balasan", klik baris komentar → buka thread, helper optimistic `insertCommentReply`/`removeCommentFromState`, lookup reaksi komentar. Baris "Membalas ke @X" di profil dari `parent_author`. Sembunyikan tombol Kutip di mode profil.

- [ ] **Step 4: Verifikasi**

Run: `npx tsc --noEmit` (catat baseline galat pra-eksis dulu, tak boleh nambah) + `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add src/components/TerasPage.tsx src/components/teras/CommentThread.tsx src/components/teras/AgentAvatar.tsx
git commit -m "feat(teras-reconcile): UI komentar berdampingan dengan composer utas"
```

---

### Task 11: Verifikasi menyeluruh + checklist rilis terunifikasi

**Files:**
- Create: `docs/superpowers/checklists/2026-07-21-teras-komentar-rekonsiliasi-rilis.md`

- [ ] **Step 1: Seluruh tes + baseline**

Ukur baseline suite pada `main` (worktree terpisah) lalu bandingkan; nol kegagalan BARU. `npx tsc --noEmit` + `npm run build` bersih.

- [ ] **Step 2: Checklist rilis**

Karena kolom+indeks utas SUDAH di prod, checklist rilis rekonsiliasi hanya perlu menjalankan bagian BARU: `is_reply` (Bagian A tambahan), backfill komentar lama (`is_reply=true`), FK mention A→C, cek `type`, verifikasi `NOT EXISTS`. Urutan A→deploy→B→C. Merge ke main = auto-deploy (Bagian A dulu). Verifikasi manual di aplikasi (thread, reaksi komentar, balas bersasaran, profil menampilkan balasan tapi bukan segmen utas, composer utas MASIH jalan, lonceng). Langkah 6 rename legacy ditunda.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/checklists/2026-07-21-teras-komentar-rekonsiliasi-rilis.md
git commit -m "docs(teras-reconcile): checklist rilis rekonsiliasi"
```
