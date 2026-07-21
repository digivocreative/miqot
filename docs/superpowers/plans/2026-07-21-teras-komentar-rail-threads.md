# Teras Rail Komentar ala Threads — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ubah rail komentar Teras agar mirip Threads — komentar tingkat-teratas berdiri sendiri (dipisah hairline, tanpa garis penyambung), sementara rail utas penulis dan garis grup balasan bertingkat tetap ada.

**Architecture:** Perubahan murni presentasional pada dua komponen React (`TerasPage.tsx`, `teras/CommentThread.tsx`) plus penyelarasan test. Rail avatar post dibatasi hanya ke segmen utas (`chainRailBelow`); rail komentar dibatasi hanya saat komentar punya balasan nested; pemisah antar komentar teratas memakai `border-t` hairline. Tidak ada perubahan data/backend.

**Tech Stack:** React + TypeScript + Tailwind CSS + framer-motion. Test: `node --test` (assertion sumber) + Playwright browser test.

## Global Constraints

- Jangan ubah model data, endpoint, atau kolom `is_reply`. Perubahan hanya render.
- Rail antar-segmen utas penulis (`data-thread-rail="thread"`) HARUS tetap ada dan tetap dirender untuk tiap segmen non-terakhir (`chainRailBelow`).
- Warna hairline pemisah: `border-gray-100 dark:border-slate-800` (sama dengan border kartu kiriman). Warna garis grup nested tetap `bg-gray-200 dark:bg-slate-700`.
- Grid kolom avatar tetap `grid-cols-[40px_minmax(0,1fr)] gap-x-3`.
- Dukung mode terang & gelap; hormati `useReducedMotion` yang sudah ada.
- Verifikasi cepat wajib hijau: `npx tsc --noEmit` dan `npm run build`. Suite browser Teras dijalankan oleh user (lambat/flaky) — implementer cukup memperbarui assertion-nya agar sesuai perilaku baru.
- Cakupan test: HANYA test rail (`community-access.test.js` subtest baris 328, dan dua test browser di `teras-page.browser.test.js`). JANGAN sentuh 5 subtest gagal lain di `community-access.test.js` (feature gate, media migration, dashboard integration, heart reaction, idempotency) — itu pre-existing & di luar cakupan.

---

### Task 1: Tulis ulang guardrail test sumber rail (RED)

Test `community-access.test.js` subtest baris 328 saat ini SUDAH gagal (stale): mengharap literal `data-thread-rail="post"`/`"comment"`/`data-comment-row` di `TerasPage.tsx`, padahal post rail kini ekspresi ternary, dan comment/`data-comment-row` sudah pindah ke `CommentThread.tsx`; `data-reply-summary-row` bahkan tak ada lagi. Task ini menuliskannya ulang untuk mengunci desain baru sebagai guardrail cepat.

**Files:**
- Modify: `tests/community-access.test.js:328-351`

**Interfaces:**
- Consumes: — (membaca file sumber sebagai string)
- Produces: guardrail yang menjadi hijau setelah Task 2 + Task 3.

- [ ] **Step 1: Ganti seluruh badan subtest (baris 328-351) dengan versi baru**

Ganti dari `test('Teras thread rail uses a continuous grid instead of an absolute connector', () => {` sampai `});` penutupnya dengan:

```javascript
test('Teras comment rail follows Threads: flat comments separated, nested grouped', () => {
  const layoutSource = readFileSync(
    new URL('../src/components/DashboardLayout.tsx', import.meta.url),
    'utf8',
  );
  const pageSource = readFileSync(
    new URL('../src/components/TerasPage.tsx', import.meta.url),
    'utf8',
  );
  const commentThreadSource = readFileSync(
    new URL('../src/components/teras/CommentThread.tsx', import.meta.url),
    'utf8',
  );

  // Sumbu grid avatar (kolom 40px) dipertahankan di kedua file.
  assert.doesNotMatch(pageSource, /ml-\[68px\]/);
  assert.doesNotMatch(pageSource, /left-\[35px\]/);
  assert.match(pageSource, /grid-cols-\[40px_minmax\(0,1fr\)\]/);
  assert.match(commentThreadSource, /grid-cols-\[40px_minmax\(0,1fr\)\]/);

  // Hanya rail utas penulis yang tersisa di kartu post; rail post->komentar,
  // empty-state, dan stub input dihilangkan (Threads: komentar datar berdiri
  // sendiri).
  assert.match(pageSource, /data-thread-rail="thread"/);
  assert.doesNotMatch(pageSource, /data-thread-rail="post"/);
  assert.doesNotMatch(pageSource, /data-thread-rail="empty"/);
  assert.doesNotMatch(pageSource, /data-thread-rail="input"/);

  // Rail grup balasan bertingkat ada di CommentThread.
  assert.match(commentThreadSource, /data-thread-rail="comment"/);
  assert.match(commentThreadSource, /data-comment-row/);

  // Komentar teratas dipisah garis hairline, bukan rail penyambung.
  assert.match(commentThreadSource, /border-t border-gray-100/);

  // Hook layout media/komposer tak berubah.
  assert.match(pageSource, /data-media-layout="pair"/);
  assert.match(pageSource, /data-media-layout="carousel"/);
  assert.match(pageSource, /data-composer-media-layout/);

  assert.match(layoutSource, /data-teras-skeleton-post/);
  assert.doesNotMatch(layoutSource, /ml-\[68px\]/);
});
```

- [ ] **Step 2: Jalankan guardrail — harus MERAH pada assertion baru**

Run: `node --test --test-name-pattern="follows Threads: flat comments separated" tests/community-access.test.js`
Expected: FAIL. Assertion yang gagal antara lain `/data-thread-rail="thread"/` (kode masih ternary), `doesNotMatch …="empty"`/`…="input"` (masih ada), dan `border-t border-gray-100` di CommentThread (belum ada). Ini konfirmasi guardrail menangkap desain lama.

- [ ] **Step 3: Commit**

```bash
git add tests/community-access.test.js
git commit -m "test(teras): guardrail rail komentar ala Threads (RED)"
```

---

### Task 2: `CommentThread.tsx` — hairline pemisah + rail hanya untuk nested

**Files:**
- Modify: `src/components/teras/CommentThread.tsx` (pemanggilan `CommentRow` di map baris ~90-142; signature & badan `CommentRow` baris ~149-252)
- Guardrail: `tests/community-access.test.js` (subtest Task 1)

**Interfaces:**
- Consumes: tipe `CommunityComment` (punya `preview_replies?`, `reply_count?`) dari `../TerasPage`.
- Produces: `CommentRow` menerima dua prop baru `isTopLevel: boolean` dan `showRail: boolean`. Komentar teratas dipanggil `isTopLevel={true} showRail={previewReplies.length > 0}`; balasan nested `isTopLevel={false} showRail={false}`.

- [ ] **Step 1: Tambah dua prop ke pemanggilan `CommentRow` teratas (map utama)**

Di `CommentThread` (map `comments.map`), pada elemen `<CommentRow>` teratas (yang punya `actions={...}`), tambahkan dua prop. Sisipkan tepat setelah baris `onOpenThreadRow={() => onOpenThread(comment.id)}`:

```jsx
            onOpenThreadRow={() => onOpenThread(comment.id)}
            isTopLevel
            showRail={previewReplies.length > 0}
            hideQuote={hideQuote}
```

(`previewReplies` sudah dideklarasikan di atas: `const previewReplies = comment.preview_replies ?? [];`.)

- [ ] **Step 2: Tambah dua prop ke pemanggilan `CommentRow` nested (balasan)**

Pada `<CommentRow>` di dalam `{previewReplies.map(reply => (...))}` (yang TIDAK punya `actions`/`onOpenThreadRow`), tambahkan setelah `reduceMotion={!!reduceMotion}`:

```jsx
                reduceMotion={!!reduceMotion}
                isTopLevel={false}
                showRail={false}
```

- [ ] **Step 3: Tambah kedua prop ke tipe & destructure `CommentRow`**

Di parameter destructure `CommentRow`, tambahkan `isTopLevel,` dan `showRail,`. Di blok tipe props (object type setelah `}: {`), tambahkan:

```jsx
  /** True untuk komentar tingkat teratas: dapat pemisah hairline; balasan nested tidak. */
  isTopLevel: boolean;
  /** Render rail grup vertikal di kolom avatar — hanya bila komentar punya balasan nested tampil. */
  showRail: boolean;
```

- [ ] **Step 4: Ubah className kontainer baris — hairline untuk teratas, `mt-2` untuk nested**

Ganti className kontainer `CommentRow` (yang saat ini diawali `mt-2 grid grid-cols-[40px_minmax(0,1fr)] gap-x-3`) menjadi:

```jsx
      className={`grid grid-cols-[40px_minmax(0,1fr)] gap-x-3 ${
        isTopLevel ? 'border-t border-gray-100 pt-3 dark:border-slate-800' : 'mt-2'
      } ${
        onOpenThreadRow ? 'cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/50' : ''
      }`}
```

- [ ] **Step 5: Render rail avatar hanya saat `showRail`, tanpa `-mb-2`**

Ganti baris rail avatar:

```jsx
        <div data-thread-rail="comment" aria-hidden="true" className="mt-1.5 -mb-2 w-px flex-1 bg-gray-200 dark:bg-slate-700" />
```

menjadi:

```jsx
        {showRail && (
          <div data-thread-rail="comment" aria-hidden="true" className="mt-1.5 w-px flex-1 bg-gray-200 dark:bg-slate-700" />
        )}
```

- [ ] **Step 6: Verifikasi tipe & build**

Run: `npx tsc --noEmit`
Expected: tidak ada error (khususnya tak ada "Property 'isTopLevel' is missing").

Run: `npm run build`
Expected: build sukses.

- [ ] **Step 7: Commit**

```bash
git add src/components/teras/CommentThread.tsx
git commit -m "feat(teras): komentar teras dipisah hairline; rail hanya untuk balasan nested"
```

---

### Task 3: `TerasPage.tsx` — hilangkan rail post/empty/input, tambah hairline section

Setelah task ini guardrail Task 1 menjadi HIJAU.

**Files:**
- Modify: `src/components/TerasPage.tsx` — rail avatar post (~baris 4428-4444), empty-state (~baris 4727-4733), baris input komposer (~baris 4803-4809)
- Guardrail: `tests/community-access.test.js` (subtest Task 1)

**Interfaces:**
- Consumes: `chainRailBelow` (boolean, sudah ada, `= isChainSegment && !isLastSegment`), `reduceMotion`.
- Produces: `TerasPage.tsx` hanya berisi literal `data-thread-rail="thread"`; tidak ada lagi `="post"`, `="empty"`, `="input"`.

- [ ] **Step 1: Batasi rail avatar post hanya ke segmen utas**

Ganti blok `AnimatePresence` rail avatar post (kondisi `{(commentsOpen || chainRailBelow) && (` … penutupnya) menjadi:

```jsx
                    <AnimatePresence initial={false}>
                      {chainRailBelow && (
                        <motion.div
                          key="post-rail"
                          data-thread-rail="thread"
                          aria-hidden="true"
                          // -mb-6 menembus padding bawah kartu & padding atas kartu
                          // berikutnya, jadi garis menyambung ke avatar segmen utas
                          // sesudahnya. Rail HANYA untuk utas penulis; post -> komentar
                          // sengaja tak disambung (ala Threads).
                          className="mt-1.5 -mb-6 w-px flex-1 bg-gray-200 dark:bg-slate-700"
                          initial={reduceMotion ? false : { opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={reduceMotion ? { duration: 0 } : { duration: 0.25 }}
                        />
                      )}
                    </AnimatePresence>
```

- [ ] **Step 2: Empty-state jadi section hairline tanpa rail**

Ganti cabang empty-state:

```jsx
                        {commentPanel.comments.length === 0 ? (
                          <div className="mt-2 grid grid-cols-[40px_minmax(0,1fr)] gap-x-3">
                            <div aria-hidden="true" className="flex flex-col items-center">
                              <div data-thread-rail="empty" className="-my-2 w-px flex-1 bg-gray-200 dark:bg-slate-700" />
                            </div>
                            <p className="min-w-0 py-1 text-[11px] text-gray-500 dark:text-slate-400">Belum ada komentar — jadilah yang pertama membalas.</p>
                          </div>
                        ) : (
```

menjadi:

```jsx
                        {commentPanel.comments.length === 0 ? (
                          <p className="min-w-0 border-t border-gray-100 pt-3 text-[11px] text-gray-500 dark:border-slate-800 dark:text-slate-400">Belum ada komentar — jadilah yang pertama membalas.</p>
                        ) : (
```

- [ ] **Step 3: Baris input komposer jadi section hairline tanpa stub rail**

Ganti pembuka baris input (grid `data-thread-input` + kolom avatar berisi `data-thread-rail="input"`):

```jsx
                        <div data-thread-input className="mt-2 grid grid-cols-[40px_minmax(0,1fr)] gap-x-3">
                          <div className="relative flex justify-center pt-2">
                            <div data-thread-rail="input" aria-hidden="true" className="absolute left-1/2 top-0 h-5 w-px -translate-x-1/2 bg-gray-200 dark:bg-slate-700" />
                            <div className="relative z-10">
                              <AgentAvatar name={agent.name} photo={agent.photo} size="comment" />
                            </div>
                          </div>
```

menjadi:

```jsx
                        <div data-thread-input className="grid grid-cols-[40px_minmax(0,1fr)] gap-x-3 border-t border-gray-100 pt-3 dark:border-slate-800">
                          <div className="relative flex justify-center pt-2">
                            <div className="relative z-10">
                              <AgentAvatar name={agent.name} photo={agent.photo} size="comment" />
                            </div>
                          </div>
```

- [ ] **Step 4: Verifikasi tipe & build**

Run: `npx tsc --noEmit`
Expected: tidak ada error.

Run: `npm run build`
Expected: build sukses.

- [ ] **Step 5: Jalankan guardrail Task 1 — harus HIJAU**

Run: `node --test --test-name-pattern="follows Threads: flat comments separated" tests/community-access.test.js`
Expected: PASS. `TerasPage.tsx` kini punya literal `data-thread-rail="thread"` dan tak lagi punya `="empty"`/`="input"`; `CommentThread.tsx` punya `data-thread-rail="comment"`, `data-comment-row`, dan `border-t border-gray-100`.

- [ ] **Step 6: Commit**

```bash
git add src/components/TerasPage.tsx
git commit -m "feat(teras): rail post/komentar dilepas; utas & grup nested dipertahankan"
```

---

### Task 4: Selaraskan test browser Teras dengan perilaku baru

Dua test browser meng-assert rail lama. Ditulis ulang ke ekspektasi baru. Test ini lambat/flaky — DIJALANKAN OLEH USER pada suite penuh; implementer cukup memutakhirkan assertion-nya (tidak wajib menjalankannya).

**Files:**
- Modify: `tests/teras-page.browser.test.js` — blok assertion rail (~baris 1544-1564) dan test empty-rail (~baris 1622-1650)
- Tidak diubah: test `data-thread-rail="thread"` utas (~baris 2694-2696) — tetap 2 rail utas.

**Interfaces:**
- Consumes: helper test yang sudah ada (`createCommunityApi`, `makePost`, `makeComment`, `openApp`).
- Produces: —

- [ ] **Step 1: Ganti blok assertion rail (baris ~1544-1564) di test panel komentar**

Ganti dari `const threadRails = article.locator('[data-thread-rail]');` sampai sebelum `assert.doesNotMatch(await serverComment.evaluate(...` dengan:

```javascript
      // Threads-style: komentar datar (tanpa balasan nested) berdiri sendiri —
      // tidak ada rail penyambung post/komentar/input. Pemisah antar komentar
      // teratas adalah garis hairline (border-atas), bukan rail.
      assert.equal(await article.locator('[data-thread-rail]').count(), 0,
        'komentar datar tidak boleh punya rail penyambung apa pun');
      assert.equal(
        await article.locator('[data-comment-row]').first().evaluate(element => getComputedStyle(element).borderTopWidth),
        '1px',
        'tiap komentar teratas dipisah garis hairline (border-atas)',
      );
      assert.equal(
        await article.locator('[data-thread-input]').evaluate(element => getComputedStyle(element).borderTopWidth),
        '1px',
        'baris komposer berdiri sebagai section ber-hairline',
      );
```

(Assertion setelahnya — `assert.doesNotMatch(... /rounded|bg-|border/ ...)` untuk isi balasan flat, dan `matchingRequests(...)` — DIPERTAHANKAN apa adanya.)

- [ ] **Step 2: Tulis ulang test empty-state (baris ~1622-1650)**

Ganti seluruh test `test('empty comments keep a one-pixel thread rail aligned with the reply input', ...)` menjadi:

```javascript
  test('empty comments show a hairline section without any rail', { timeout: 30_000 }, async () => {
    const api = createCommunityApi({
      posts: [makePost({
        id: 'empty-comments-post',
        body: 'Uji komentar kosong',
        comment_count: 0,
      })],
      comments: { 'empty-comments-post': [] },
    });
    const app = await openApp({ api, viewport: { width: 360, height: 800 } });
    try {
      const article = app.page.locator('article').filter({ hasText: 'Uji komentar kosong' });
      await article.getByRole('button', { name: 'Komentari', exact: true }).click();
      const emptyNotice = article.getByText('Belum ada komentar — jadilah yang pertama membalas.', { exact: true });
      await emptyNotice.waitFor();

      assert.equal(await article.locator('[data-thread-rail]').count(), 0,
        'empty state tidak boleh punya rail penyambung');
      assert.equal(
        await emptyNotice.evaluate(element => getComputedStyle(element).borderTopWidth),
        '1px',
        'empty state tampil sebagai section ber-hairline',
      );
    } finally {
      await app.close();
    }
  });
```

- [ ] **Step 3: Verifikasi statis test (parse) tanpa menjalankan suite penuh**

Run: `node --check tests/teras-page.browser.test.js`
Expected: tidak ada syntax error.

- [ ] **Step 4: Commit**

```bash
git add tests/teras-page.browser.test.js
git commit -m "test(teras): selaraskan test browser rail komentar dgn perilaku Threads"
```

---

## Checklist verifikasi akhir (untuk user)

Jalankan visual di aplikasi:
1. Detail kiriman flat (mis. Ferra): tidak ada garis vertikal post→komentar maupun antar-komentar; tiap komentar teratas dipisah garis hairline tipis.
2. Komentar yang punya balasan nested: garis grup vertikal muncul di kiri balasan dan berhenti rapi di balasan terakhir (tak menembus ke section berikut).
3. Utas penulis multi-segmen: garis penyambung antar-segmen tetap ada.
4. Empty state & komposer: tampil sebagai section ber-hairline, tanpa stub garis.
5. Mode terang & gelap: warna hairline (`gray-100`/`slate-800`) & garis grup (`gray-200`/`slate-700`) sesuai.

Test:
- `node --test --test-name-pattern="follows Threads: flat comments separated" tests/community-access.test.js` → hijau.
- Suite browser Teras penuh (`tests/teras-page.browser.test.js`) → dijalankan user.

## Catatan pre-existing (di luar cakupan)

5 subtest lain di `community-access.test.js` sudah MERAH sebelum perubahan ini (feature gate, media migration, dashboard integration, heart reaction, idempotency) — kemungkinan drift sumber terpisah. Tidak disentuh oleh rencana ini.
