# Kalender: pembersihan baris hantu penomoran ulang kloter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membuat stale-delete `calendar_events` benar-benar berjalan, sehingga baris hantu akibat penomoran ulang kloter di sistem hulu terhapus sendiri tiap sync.

**Architecture:** Satu jalur hapus dipecah menjadi dua yang masing-masing punya bukti sendiri. Jalur **per-event** menghapus tanpa konfirmasi ulang untuk tiap (tanggal, tipe) yang daftar grupnya baru saja berhasil di-scrape. Jalur **global** menangani event key yang hilang total dari snapshot, tetap dengan konfirmasi dua-langkah. Kegagalan rute (origin fallback) berhenti memblokir keduanya; mutu data dinilai per event, bukan global.

**Tech Stack:** Node.js ESM, `node:test` + `node:assert/strict`, Supabase JS client, fake Supabase builder di `tests/calendar-public-sync.test.js`.

## Global Constraints

- Skema `id` `calendar_events` **tidak berubah**: tetap `${event.date}_${event.type}_${jadwal_id || group_number || rowN}` (`calendar-api.js:246-247`). Mengunci `id` ke `jadwal_id` sudah dicoret di spec — terbukti melebur dua kloter sah pada JBU1542.
- Tidak ada perubahan skema basis data dan tidak ada migrasi SQL.
- Id berawalan `_DEMO_` kebal terhadap semua jalur penghapusan.
- `CALENDAR_PUBLIC_MAX_STALE_DELETE_RATIO` (default 0.25, `calendar-api.js:54`) berlaku **hanya** untuk himpunan stale jalur global.
- Jalankan tes dengan `node --test tests/calendar-public-sync.test.js`.
- Tes penjaga yang merah karena perubahan ini adalah tes **basi**, bukan regresi — tulis ulang untuk menegaskan invarian baru, jangan longgarkan sampai hijau, dan buktikan tiap penulisan ulang lewat uji mutasi.

---

### Task 1: Jalur per-event menghapus hantu penomoran ulang dalam satu run

Inti perbaikan. Termasuk penyesuaian harness dan kolom `select` yang dibutuhkan agar tesnya bisa ditulis sama sekali.

**Files:**
- Modify: `calendar-api.js:167-275` (`resolvePublicEventRows`)
- Modify: `calendar-api.js:461-464` (select `existingRows`)
- Modify: `calendar-api.js:499-571` (blok upsert dan stale-delete)
- Test: `tests/calendar-public-sync.test.js:128-247` (harness), `:717-750` (tes yang ditulis ulang)

**Interfaces:**
- Consumes: tidak ada dari task lain.
- Produces:
  - `resolvePublicEventRows` mengembalikan dua field baru: `eventKey: string` (`"YYYY-MM-DD_tipe"`) dan `authoritative: boolean`.
  - `syncCalendar` mengembalikan dua field baru pada hasilnya: `rowsDeletedPerEvent: number` dan `rowsDeletedGlobal: number` (Task 4 mengisi yang kedua; Task 1 sudah mengembalikan keduanya dengan `rowsDeletedGlobal` bernilai 0 sampai Task 4).

- [ ] **Step 1: Siapkan harness membawa `event_date` dan `event_type`**

Harness sekarang mencocokkan nama kolom persis dan membuat baris palsu tanpa kolom tanggal/tipe. Tanpa langkah ini, `select` yang berubah akan jatuh diam-diam ke cabang `return { data: state.upserted }` dan tesnya menguji hal yang salah.

Di `tests/calendar-public-sync.test.js`, dalam `makeResult`, ganti baris `if (builder.columns === 'id, raw_data') {`:

```js
    if (builder.columns === 'id, event_date, event_type, raw_data') {
```

Lalu di `createFakeSupabase`, ganti pembentukan `existingCalendarRows` default:

```js
    existingCalendarRows: existingCalendarRows
      || existingCalendarIds.map((id) => {
        // id = `${event_date}_${event_type}_${rowKey}`
        const [event_date, event_type] = String(id).split('_');
        return { id, event_date, event_type, raw_data: null };
      }),
```

- [ ] **Step 2: Tulis ulang tes penjaga baris 717 menjadi tes kasus renumber**

Tes `syncCalendar deletes a stale row only after two complete primary snapshots` memakai `staleId = ${SYNC_EVENT_DATE}_keberangkatan_11` — baris basi pada event key yang **sama** dengan grup 10 yang segar. Itu persis kasus per-event, yang kini harus tuntas dalam satu run. Ganti seluruh blok tes di `tests/calendar-public-sync.test.js:717-750` dengan:

```js
test('syncCalendar menghapus baris hantu penomoran ulang dalam satu run', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async (url) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === '/jadwal/kegiatan/alhijaz-indowisata') {
        return htmlResponse(PUBLIC_PAGE_HTML);
      }
      if (parsed.pathname === '/jadwal/_kmodal.php') {
        return htmlResponse(PUBLIC_MODAL_HTML);
      }
      throw new Error(`unexpected fetch: ${url}`);
    };

    // Hulu menomori ulang kloter: dulu grup 11, sekarang modal hanya
    // mengembalikan grup 10 untuk (tanggal, tipe) yang sama.
    const staleId = `${SYNC_EVENT_DATE}_keberangkatan_11`;
    const freshId = `${SYNC_EVENT_DATE}_keberangkatan_10`;
    const syncCalendar = await loadSyncCalendar();
    const supabase = createFakeSupabase({ existingCalendarIds: [staleId] });

    const result = await syncCalendar(supabase);

    assert.equal(result.success, true);
    assert.deepEqual(supabase.state.deletedIds, [staleId]);
    assert.equal(result.rowsDeletedPerEvent, 1);
    assert.equal(supabase.state.upserted.some(row => row.id === freshId), true);
    // Bukti lokal per-event: tuntas dalam satu run, tanpa run kedua.
    // (Jangan menegaskan `staleCandidates` di sini — daftar kandidat global
    // baru berhenti mencatat baris ini setelah Task 4 mengganti buktinya ke
    // absennya event key. Penegasannya ada di Task 4 step 2.)
  } finally {
    global.fetch = originalFetch;
  }
});
```

- [ ] **Step 3: Jalankan tes, pastikan MERAH**

Run: `node --test tests/calendar-public-sync.test.js`
Expected: FAIL pada `menghapus baris hantu penomoran ulang dalam satu run` — `deletedIds` masih `[]` karena jalur per-event belum ada, dan `result.rowsDeletedPerEvent` masih `undefined`.

- [ ] **Step 4: Tambahkan `eventKey` dan `authoritative` ke `resolvePublicEventRows`**

Di `calendar-api.js`, ganti baris 168 (`const failedKey = ...`) menjadi:

```js
  const eventKey = `${event.date}_${event.type}`;
```

Lalu pada tiga titik `return` fungsi ini, sesuaikan:

Return pertama (blok `catch` fetch detail, sekitar baris 175):

```js
    return {
      rows: [],
      eventKey,
      authoritative: false,
      failedKey: eventKey,
      fallbackUsed: 0,
      emptyDetails: 0,
      detailUsesFallback: false,
      mutawifReaderEvents: 0,
      mutawifReaderRows: 0,
      mutawifReaderFailures: 0,
    };
```

Return kedua (detail kosong dan fallback jadwal tidak lengkap, sekitar baris 232):

```js
      return {
        rows: [],
        eventKey,
        authoritative: false,
        failedKey: eventKey,
        fallbackUsed,
        emptyDetails,
        detailUsesFallback,
        mutawifReaderEvents,
        mutawifReaderRows,
        mutawifReaderFailures,
      };
```

Return terakhir (sekitar baris 265):

```js
  return {
    rows,
    eventKey,
    // `detailUsesFallback` sengaja TIDAK ikut: itu soal rute, bukan mutu data.
    // Origin fallback menyajikan isi yang sama lewat IP.
    authoritative: rows.length > 0 && fallbackUsed === 0 && emptyDetails === 0,
    failedKey: null,
    fallbackUsed,
    emptyDetails,
    detailUsesFallback,
    mutawifReaderEvents,
    mutawifReaderRows,
    mutawifReaderFailures,
  };
```

- [ ] **Step 5: Kumpulkan id segar per event key**

Di `calendar-api.js`, di dalam loop `for (const result of detailResults) {` (sekitar baris 416-425), tambahkan sebelum `if (result.rows.length > 0) allRows.push(...result.rows);`:

```js
    if (result.authoritative) {
      authoritativeFreshIdsByEvent.set(
        result.eventKey,
        new Set(result.rows.map(row => row.id)),
      );
    }
```

Dan deklarasikan petanya tepat sebelum loop itu:

```js
  const authoritativeFreshIdsByEvent = new Map();
```

- [ ] **Step 6: Ambil kolom tanggal dan tipe pada pembacaan baris lama**

Di `calendar-api.js:463`, ganti:

```js
    .select('id, event_date, event_type, raw_data')
```

- [ ] **Step 7: Laporkan jumlah penghapusan pada hasil sync**

Di `calendar-api.js`, tambahkan dua penghitung tepat sebelum `const resultMeta = () => ({` (sekitar baris 437):

```js
  let rowsDeletedPerEvent = 0;
  let rowsDeletedGlobal = 0;
```

Lalu tambahkan dua field ke objek yang dikembalikan `resultMeta`:

```js
    rowsDeletedPerEvent,
    rowsDeletedGlobal,
```

- [ ] **Step 8: Implementasikan penghapusan per-event**

Di `calendar-api.js`, tepat setelah loop upsert selesai (setelah baris `rowsUpserted += batch.length; }`, sekitar baris 511) dan **sebelum** blok stale-delete lama, sisipkan:

```js
  const DELETE_BATCH = 50;

  // ── Jalur per-event ──
  // Untuk tiap (tanggal, tipe) yang daftar grupnya baru saja berhasil
  // di-scrape, daftar itu otoritatif: baris DB di luar daftar adalah hantu.
  // Buktinya lokal dan langsung, jadi tak perlu konfirmasi dua-langkah.
  // Ini yang menangkap penomoran ulang kloter oleh sistem hulu.
  if (!existingRowsError && existingRows && authoritativeFreshIdsByEvent.size > 0) {
    const perEventStaleIds = [];
    for (const row of existingRows) {
      const id = String(row.id);
      if (id.startsWith('_DEMO_')) continue;
      const freshIds = authoritativeFreshIdsByEvent.get(`${row.event_date}_${row.event_type}`);
      if (!freshIds || freshIds.has(id)) continue;
      perEventStaleIds.push(id);
    }

    for (let i = 0; i < perEventStaleIds.length; i += DELETE_BATCH) {
      const batch = perEventStaleIds.slice(i, i + DELETE_BATCH);
      const { error: deleteError } = await supabase
        .from('calendar_events')
        .delete()
        .in('id', batch);
      if (deleteError) {
        const syncError = `delete stale per-event calendar_events gagal: ${deleteError.message}`;
        console.error(`[Calendar] ${syncError}`);
        return { success: false, error: syncError, ...resultMeta() };
      }
      rowsDeletedPerEvent += batch.length;
    }
    if (rowsDeletedPerEvent > 0) {
      console.log(
        `[Calendar] Hapus ${rowsDeletedPerEvent} baris hantu dari `
        + `${authoritativeFreshIdsByEvent.size} event otoritatif`,
      );
    }
  }
```

Catatan: `const DELETE_BATCH = 50;` sekarang dideklarasikan di sini, jadi **hapus** deklarasi duplikatnya yang lama di dalam blok stale-delete global (`calendar-api.js:553`).

- [ ] **Step 9: Jalankan tes, pastikan HIJAU**

Run: `node --test tests/calendar-public-sync.test.js`
Expected: tes `menghapus baris hantu penomoran ulang dalam satu run` PASS.

Tes lain mungkin masih merah — itu tes penjaga basi yang ditangani Task 2 dan Task 3. Catat mana saja yang merah sebelum lanjut.

- [ ] **Step 10: Commit**

```bash
git add calendar-api.js tests/calendar-public-sync.test.js
git commit -m "fix(kalender): hapus baris hantu per-event tanpa konfirmasi ulang

Daftar grup hasil scrape untuk satu (tanggal, tipe) bersifat otoritatif untuk
event itu, jadi baris DB di luar daftar boleh langsung dibuang. Ini yang
menangkap penomoran ulang kloter oleh sistem hulu.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Mutu data dinilai per event, bukan global

Satu event yang detailnya gagal atau direkonstruksi dari `umroh_schedules` hanya boleh menonaktifkan penghapusan untuk dirinya sendiri.

**Files:**
- Test: `tests/calendar-public-sync.test.js` (dua tes baru)

**Interfaces:**
- Consumes: `authoritative` dari Task 1.
- Produces: tidak ada yang baru.

- [ ] **Step 1: Tulis tes — event yang detailnya gagal tidak kehilangan barisnya, event lain tetap dibersihkan**

Tambahkan di `tests/calendar-public-sync.test.js`:

```js
test('kegagalan detail satu event tidak menghalangi pembersihan event lain', async () => {
  const originalFetch = global.fetch;
  const events = [
    {
      title: 'Keberangkatan UMROH',
      start: SYNC_EVENT_DATE,
      color: '#7bc86c',
      extendedProps: { mjudul: 'KEBERANGKATAN UMROH', aid: 'B1532', apalah: 'JBU1532' },
    },
    {
      title: 'Keberangkatan UMROH',
      start: FAILED_EVENT_DATE,
      color: '#7bc86c',
      extendedProps: { mjudul: 'KEBERANGKATAN UMROH', aid: 'B9999', apalah: 'JBU9999' },
    },
  ];

  try {
    global.fetch = async (url) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === '/jadwal/kegiatan/alhijaz-indowisata') {
        return htmlResponse(publicPageHtmlForEvents(events));
      }
      if (parsed.pathname === '/jadwal/_kmodal.php') {
        if (parsed.searchParams.get('.m') === 'B9999') return htmlResponse('boom', 500);
        return htmlResponse(PUBLIC_MODAL_HTML);
      }
      throw new Error(`unexpected fetch: ${url}`);
    };

    const healthyStaleId = `${SYNC_EVENT_DATE}_keberangkatan_11`;
    const failedEventId = `${FAILED_EVENT_DATE}_keberangkatan_77`;
    const syncCalendar = await loadSyncCalendar();
    const supabase = createFakeSupabase({
      existingCalendarIds: [healthyStaleId, failedEventId],
    });

    const result = await syncCalendar(supabase);

    assert.equal(result.success, true);
    assert.deepEqual(supabase.state.deletedIds, [healthyStaleId]);
    assert.equal(supabase.state.deletedIds.includes(failedEventId), false);
  } finally {
    global.fetch = originalFetch;
  }
});
```

- [ ] **Step 2: Tulis tes — dua kloter berbagi satu jadwal sama-sama selamat**

Penjaga regresi terhadap jebakan peleburan yang dicoret di spec. Tambahkan:

```js
test('dua kloter pada satu jadwal sama-sama bertahan', async () => {
  const originalFetch = global.fetch;
  const twoGroupModalHtml = `
<table>
  <thead>
    <tr><th>GROUP</th><th>PESAWAT</th><th>WAKTU</th><th>PAKET</th><th>PAX</th><th>STAFF</th><th>TL</th></tr>
  </thead>
  <tbody>
    <tr><td>69</td><td>SAUDIA ~ SV 827</td><td>00.40</td><td>PROMO JUM'ATAIN PLUS TAIF +BADAR 15HR (KERETA CEPAT)</td><td>40</td><td>-</td><td>-</td></tr>
    <tr><td>70</td><td>SAUDIA ~ SV 827</td><td>00.40</td><td>PROMO JUM'ATAIN PLUS TAIF +BADAR 15HR (KERETA CEPAT)</td><td>45</td><td>-</td><td>-</td></tr>
  </tbody>
</table>`;

  try {
    global.fetch = async (url) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === '/jadwal/kegiatan/alhijaz-indowisata') {
        return htmlResponse(PUBLIC_PAGE_HTML);
      }
      if (parsed.pathname === '/jadwal/_kmodal.php') return htmlResponse(twoGroupModalHtml);
      throw new Error(`unexpected fetch: ${url}`);
    };

    const syncCalendar = await loadSyncCalendar();
    const supabase = createFakeSupabase({
      existingCalendarIds: [
        `${SYNC_EVENT_DATE}_keberangkatan_69`,
        `${SYNC_EVENT_DATE}_keberangkatan_70`,
      ],
    });

    const result = await syncCalendar(supabase);

    assert.equal(result.success, true);
    assert.equal(supabase.state.deletedIds.length, 0);
    assert.equal(supabase.state.upserted.length, 2);
  } finally {
    global.fetch = originalFetch;
  }
});
```

- [ ] **Step 3: Jalankan tes**

Run: `node --test tests/calendar-public-sync.test.js`
Expected: kedua tes baru PASS tanpa perubahan kode produksi — keduanya menegaskan perilaku yang sudah dibawa `authoritative` dari Task 1.

Kalau ada yang MERAH, itu bug nyata di Task 1, bukan tes yang salah. Perbaiki `authoritative` sebelum lanjut.

- [ ] **Step 4: Buktikan tes benar-benar menggigit (uji mutasi)**

Ubah sementara `authoritative` di `calendar-api.js` menjadi `rows.length > 0` saja (buang syarat `fallbackUsed === 0 && emptyDetails === 0`). Jalankan ulang tes.

Expected: `kegagalan detail satu event tidak menghalangi pembersihan event lain` tetap PASS (event gagal tak menghasilkan baris sama sekali, jadi tak masuk peta), sedangkan penjaga sesungguhnya untuk syarat itu adalah tes schedule-fallback di Task 3. Kembalikan mutasi.

Kalau tak satu pun tes berubah warna, tes ini hampa — perkuat dulu sebelum lanjut.

- [ ] **Step 5: Commit**

```bash
git add tests/calendar-public-sync.test.js
git commit -m "test(kalender): mutu data per-event dan penjaga dua kloter satu jadwal

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Rute cadangan berhenti memblokir penghapusan

Dua tes yang ada memaku perilaku yang justru merupakan bugnya. Keduanya lolos karena alasan yang salah kalau hanya dibiarkan, jadi harus ditulis ulang.

**Files:**
- Modify: `calendar-api.js:513-571` (buang `degradedSnapshot`)
- Test: `tests/calendar-public-sync.test.js:752-778` dan `:822-850`

**Interfaces:**
- Consumes: `authoritative` (Task 1).
- Produces: `degradedSnapshot` tidak ada lagi; `degradedReasons` tetap melaporkan `page_fallback` dan `detail_fallback` seperti sekarang.

- [ ] **Step 1: Tulis ulang tes halaman-lewat-fallback**

Ganti seluruh blok `syncCalendar skips stale-delete when the public page uses the fallback origin` (`tests/calendar-public-sync.test.js:752-778`) dengan:

```js
test('rute fallback halaman tidak menghalangi penghapusan per-event', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async (url) => {
      const parsed = new URL(String(url));
      if (parsed.protocol === 'https:') return htmlResponse('blocked', 403);
      if (parsed.pathname === '/jadwal/kegiatan/alhijaz-indowisata') {
        return htmlResponse(PUBLIC_PAGE_HTML);
      }
      if (parsed.pathname === '/jadwal/_kmodal.php') {
        return htmlResponse(PUBLIC_MODAL_HTML);
      }
      throw new Error(`unexpected fetch: ${url}`);
    };

    const staleId = `${SYNC_EVENT_DATE}_keberangkatan_11`;
    const syncCalendar = await loadSyncCalendar();
    const supabase = createFakeSupabase({ existingCalendarIds: [staleId] });
    const result = await syncCalendar(supabase);

    assert.equal(result.success, true);
    assert.equal(result.source, 'fallback');
    // Rute cadangan menyajikan isi yang sama; ia tidak boleh mengunci penyapu.
    assert.deepEqual(supabase.state.deletedIds, [staleId]);
  } finally {
    global.fetch = originalFetch;
  }
});
```

- [ ] **Step 2: Tulis ulang tes detail-lewat-fallback**

Ganti seluruh blok `syncCalendar skips stale-delete when modal details use the fallback origin` (`tests/calendar-public-sync.test.js:822-850`) dengan:

```js
test('rute fallback detail modal tidak menghalangi penghapusan per-event', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async (url) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === '/jadwal/kegiatan/alhijaz-indowisata') {
        return htmlResponse(PUBLIC_PAGE_HTML);
      }
      if (parsed.pathname === '/jadwal/_kmodal.php' && parsed.protocol === 'https:') {
        return htmlResponse('blocked', 403);
      }
      if (parsed.pathname === '/jadwal/_kmodal.php') {
        return htmlResponse(PUBLIC_MODAL_HTML);
      }
      throw new Error(`unexpected fetch: ${url}`);
    };

    const staleId = `${SYNC_EVENT_DATE}_keberangkatan_11`;
    const syncCalendar = await loadSyncCalendar();
    const supabase = createFakeSupabase({ existingCalendarIds: [staleId] });
    const result = await syncCalendar(supabase);

    assert.equal(result.success, true);
    assert.equal(result.source, 'fallback');
    assert.deepEqual(supabase.state.deletedIds, [staleId]);
  } finally {
    global.fetch = originalFetch;
  }
});
```

- [ ] **Step 3: Tulis tes — schedule-fallback TETAP memblokir, untuk event itu saja**

Ini penjaga yang membedakan "rute cadangan" dari "data direkonstruksi". Tambahkan:

```js
test('event yang direkonstruksi dari umroh_schedules tidak menghapus baris lamanya', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async (url) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === '/jadwal/kegiatan/alhijaz-indowisata') {
        return htmlResponse(PUBLIC_PAGE_HTML);
      }
      // Modal 200 tapi tanpa baris terparse -> detail kosong -> fallback jadwal.
      if (parsed.pathname === '/jadwal/_kmodal.php') {
        return htmlResponse('<table><tbody></tbody></table>');
      }
      throw new Error(`unexpected fetch: ${url}`);
    };

    const staleId = `${SYNC_EVENT_DATE}_keberangkatan_11`;
    const syncCalendar = await loadSyncCalendar();
    const supabase = createFakeSupabase({ existingCalendarIds: [staleId] });
    const result = await syncCalendar(supabase);

    assert.equal(result.success, true);
    assert.equal(supabase.state.deletedIds.length, 0);
  } finally {
    global.fetch = originalFetch;
  }
});
```

- [ ] **Step 4: Jalankan tes, pastikan tiga tes ini MERAH di tempat yang benar**

Run: `node --test tests/calendar-public-sync.test.js`
Expected: dua tes rute-fallback MERAH (`deletedIds` masih `[]` karena `degradedSnapshot` masih mengunci penghapusan per-event? — tidak; jalur per-event Task 1 tidak digerbangi `degradedSnapshot`, jadi keduanya sudah HIJAU). Tes schedule-fallback HIJAU.

Kalau ketiganya sudah hijau tanpa perubahan kode, itu benar dan diharapkan: Task 1 memang sudah melepas jalur per-event dari gerbang rute. Langkah berikut membersihkan gerbang yang kini jadi kode mati untuk jalur global.

- [ ] **Step 5: Buang `degradedSnapshot` dari gerbang stale-delete global**

Di `calendar-api.js`, hapus deklarasi `degradedSnapshot` (sekitar baris 513-516):

```js
  const degradedSnapshot = publicPageUsesFallback
    || detailOriginFallbackUsed > 0
    || fallbackUsed > 0
    || failedEventKeys.size > 0;
```

Ganti pembuka blok global (sekitar baris 518) dari `if (!existingRowsError && existingRows && !degradedSnapshot) {` menjadi:

```js
  // Rute cadangan (page_fallback / detail_fallback) tidak lagi mengunci
  // penghapusan: isinya sama, cuma jalannya lewat IP. Mutu data ditangani
  // per event lewat `authoritative`, dan jalur global di bawah memakai bukti
  // "event key absen dari snapshot" yang kebal terhadap kegagalan detail.
  if (!existingRowsError && existingRows) {
```

Lalu hapus seluruh cabang `else if` di ujung blok (sekitar baris 569-571):

```js
  } else if (!existingRowsError && existingRows && degradedSnapshot) {
    console.warn('[Calendar] Stale-delete dilewati karena snapshot belum authoritative/complete');
  }
```

sisakan penutup `}` blok `if`.

- [ ] **Step 6: Jalankan tes**

Run: `node --test tests/calendar-public-sync.test.js`
Expected: seluruh berkas HIJAU kecuali tes jalur global yang ditangani Task 4. Catat mana yang merah.

- [ ] **Step 7: Buktikan tes rute benar-benar menggigit (uji mutasi)**

Kembalikan sementara gerbang lama pada jalur per-event: bungkus blok per-event Task 1 dengan `if (!publicPageUsesFallback && detailOriginFallbackUsed === 0)`. Jalankan ulang.

Expected: kedua tes `rute fallback ... tidak menghalangi penghapusan per-event` MERAH. Kalau tetap hijau, tesnya hampa — perbaiki dulu. Kembalikan mutasi.

- [ ] **Step 8: Commit**

```bash
git add calendar-api.js tests/calendar-public-sync.test.js
git commit -m "fix(kalender): rute cadangan berhenti mengunci stale-delete

page_fallback/detail_fallback adalah soal rute, bukan mutu data. Origin
fallback menyajikan isi yang sama lewat IP, dan gerbang inilah yang membuat
penyapu tak pernah jalan selama origin utama 403.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Jalur global memakai bukti absennya event key

**Files:**
- Modify: `calendar-api.js:518-568` (isi blok stale-delete global)
- Test: `tests/calendar-public-sync.test.js` (dua tes baru)

**Interfaces:**
- Consumes: `existingRows` yang kini memuat `event_date` dan `event_type` (Task 1).
- Produces: `rowsDeletedGlobal` terisi pada hasil `syncCalendar`.

- [ ] **Step 1: Tulis tes — key yang absen dari snapshot tetap butuh dua run**

```js
test('event key yang lenyap dari snapshot dihapus setelah dua run', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async (url) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === '/jadwal/kegiatan/alhijaz-indowisata') {
        return htmlResponse(PUBLIC_PAGE_HTML);
      }
      if (parsed.pathname === '/jadwal/_kmodal.php') {
        return htmlResponse(PUBLIC_MODAL_HTML);
      }
      throw new Error(`unexpected fetch: ${url}`);
    };

    // Event key ini tidak ada sama sekali di PUBLIC_PAGE_HTML.
    const goneId = `${isoDateMonthsAhead(4)}_keberangkatan_legacy`;
    const syncCalendar = await loadSyncCalendar();
    const supabase = createFakeSupabase({ existingCalendarIds: [goneId] });

    const first = await syncCalendar(supabase);
    assert.equal(first.success, true);
    assert.equal(supabase.state.deletedIds.length, 0);
    assert.deepEqual(supabase.state.staleCandidates, [goneId]);

    const second = await syncCalendar(supabase);
    assert.equal(second.success, true);
    assert.deepEqual(supabase.state.deletedIds, [goneId]);
    assert.equal(second.rowsDeletedGlobal, 1);
  } finally {
    global.fetch = originalFetch;
  }
});
```

- [ ] **Step 2: Tulis tes — kegagalan detail tidak membuat baris tampak stale global**

```js
test('kegagalan detail tidak menjadikan baris event itu kandidat stale global', async () => {
  const originalFetch = global.fetch;
  const events = [
    {
      title: 'Keberangkatan UMROH',
      start: SYNC_EVENT_DATE,
      color: '#7bc86c',
      extendedProps: { mjudul: 'KEBERANGKATAN UMROH', aid: 'B1532', apalah: 'JBU1532' },
    },
    {
      title: 'Keberangkatan UMROH',
      start: FAILED_EVENT_DATE,
      color: '#7bc86c',
      extendedProps: { mjudul: 'KEBERANGKATAN UMROH', aid: 'B9999', apalah: 'JBU9999' },
    },
  ];

  try {
    global.fetch = async (url) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === '/jadwal/kegiatan/alhijaz-indowisata') {
        return htmlResponse(publicPageHtmlForEvents(events));
      }
      if (parsed.pathname === '/jadwal/_kmodal.php') {
        if (parsed.searchParams.get('.m') === 'B9999') return htmlResponse('boom', 500);
        return htmlResponse(PUBLIC_MODAL_HTML);
      }
      throw new Error(`unexpected fetch: ${url}`);
    };

    const failedEventId = `${FAILED_EVENT_DATE}_keberangkatan_77`;
    const syncCalendar = await loadSyncCalendar();
    const supabase = createFakeSupabase({ existingCalendarIds: [failedEventId] });

    const result = await syncCalendar(supabase);

    assert.equal(result.success, true);
    // Event-nya ADA di snapshot; detailnya saja yang gagal. Absennya detail
    // bukan bukti bahwa event-nya lenyap.
    assert.equal(supabase.state.staleCandidates?.includes(failedEventId) ?? false, false);
    assert.equal(supabase.state.deletedIds.length, 0);
  } finally {
    global.fetch = originalFetch;
  }
});
```

- [ ] **Step 3: Jalankan tes, pastikan MERAH**

Run: `node --test tests/calendar-public-sync.test.js`
Expected: `kegagalan detail tidak menjadikan baris event itu kandidat stale global` FAIL — logika lama memakai `freshIds`, sehingga baris event yang detailnya gagal ikut tercatat sebagai kandidat.

- [ ] **Step 4: Ganti bukti jalur global dari `freshIds` ke absennya event key**

Di `calendar-api.js`, dalam blok global, ganti:

```js
    const freshIds = new Set(allRows.map(row => row.id));
    const observedStaleIds = existingRows
      .map(row => row.id)
      .filter(id => !freshIds.has(id) && !id.startsWith('_DEMO_'));
```

menjadi:

```js
    // Bukti jalur ini adalah daftar event pada halaman, bukan baris hasil
    // detail. Dengan begitu satu detail yang gagal diambil tidak membuat
    // seluruh barisnya tampak lenyap.
    const snapshotKeys = new Set(filtered.map(event => `${event.date}_${event.type}`));
    const observedStaleIds = existingRows
      .filter(row => !snapshotKeys.has(`${row.event_date}_${row.event_type}`))
      .map(row => String(row.id))
      .filter(id => !id.startsWith('_DEMO_'));
```

- [ ] **Step 5: Hitung baris yang terhapus jalur global**

Di dalam loop delete global, setelah pemeriksaan `deleteError`, tambahkan:

```js
      rowsDeletedGlobal += batch.length;
```

dan ubah log penutupnya menjadi:

```js
    if (rowsDeletedGlobal > 0) {
      console.log(`[Calendar] Hapus ${rowsDeletedGlobal} baris dari event key yang lenyap`);
    }
```

- [ ] **Step 6: Jalankan tes, pastikan HIJAU**

Run: `node --test tests/calendar-public-sync.test.js`
Expected: seluruh berkas PASS.

- [ ] **Step 7: Buktikan tes menggigit (uji mutasi)**

Kembalikan sementara `observedStaleIds` ke versi berbasis `freshIds`. Jalankan ulang.

Expected: `kegagalan detail tidak menjadikan baris event itu kandidat stale global` MERAH. Kembalikan mutasi.

- [ ] **Step 8: Commit**

```bash
git add calendar-api.js tests/calendar-public-sync.test.js
git commit -m "fix(kalender): jalur stale global memakai absennya event key

Bukti lama (id tak ada di freshIds) membuat satu detail yang gagal diambil
menjadikan seluruh barisnya tampak lenyap. Bukti baru memakai daftar event
halaman, yang kebal terhadap kegagalan detail.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Rasio 25% hanya menghitung stale global, plus ops alert

**Files:**
- Modify: `calendar-api.js` (komentar pagar rasio)
- Modify: `server.js:24976-25002` (health patch dan ops alert)
- Test: `tests/calendar-public-sync.test.js` (satu tes baru)

**Interfaces:**
- Consumes: `rowsDeletedPerEvent`, `rowsDeletedGlobal` (Task 1 dan Task 4).
- Produces: tidak ada yang baru.

- [ ] **Step 1: Tulis tes — penghapusan per-event masif tidak menggagalkan sync**

Berkas tes menyetel `CALENDAR_PUBLIC_MAX_STALE_DELETE_RATIO = '1'` di baris 9, jadi setel ulang khusus di dalam tes ini lalu kembalikan.

```js
test('penghapusan per-event masif tidak tersandung pagar rasio stale global', async () => {
  const originalFetch = global.fetch;
  const originalRatio = process.env.CALENDAR_PUBLIC_MAX_STALE_DELETE_RATIO;
  try {
    global.fetch = async (url) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === '/jadwal/kegiatan/alhijaz-indowisata') {
        return htmlResponse(PUBLIC_PAGE_HTML);
      }
      if (parsed.pathname === '/jadwal/_kmodal.php') {
        return htmlResponse(PUBLIC_MODAL_HTML);
      }
      throw new Error(`unexpected fetch: ${url}`);
    };

    // 8 baris hantu pada event key yang segar; semuanya lewat jalur per-event.
    const staleIds = [11, 12, 13, 14, 15, 16, 17, 18]
      .map(n => `${SYNC_EVENT_DATE}_keberangkatan_${n}`);
    const syncCalendar = await loadSyncCalendar();
    const supabase = createFakeSupabase({ existingCalendarIds: staleIds });

    const result = await syncCalendar(supabase);

    assert.equal(result.success, true);
    assert.equal(result.rowsDeletedPerEvent, 8);
    assert.equal(result.rowsDeletedGlobal, 0);
    assert.equal(supabase.state.deletedIds.length, 8);
  } finally {
    process.env.CALENDAR_PUBLIC_MAX_STALE_DELETE_RATIO = originalRatio;
    global.fetch = originalFetch;
  }
});
```

- [ ] **Step 2: Jalankan tes**

Run: `node --test tests/calendar-public-sync.test.js`
Expected: PASS. Rasio dihitung dari `staleIds` jalur global yang di sini kosong, jadi pagar tak tersentuh. Kalau MERAH, berarti penghapusan per-event bocor ke hitungan rasio — perbaiki di Task 4 sebelum lanjut.

- [ ] **Step 3: Perjelas maksud pagar rasio lewat komentar**

Tepat di atas `const staleDeleteRatio = ...` di `calendar-api.js`, tambahkan:

```js
    // Pagar ini SENGAJA hanya menghitung stale jalur global. Penghapusan
    // per-event punya bukti langsung per (tanggal, tipe) dan jumlahnya bisa
    // besar saat backlog dikuras — memasukkannya ke sini akan menggagalkan
    // sync dan mengunci pembersihan, persis bug yang sedang diperbaiki.
```

- [ ] **Step 4: Catat jumlah penghapusan di health record dan kirim ops alert bila besar**

Di `server.js`, dalam `healthPatch` (sekitar baris 24976), tambahkan dua field:

```js
      last_rows_deleted_per_event: syncResult?.rowsDeletedPerEvent || 0,
      last_rows_deleted_global: syncResult?.rowsDeletedGlobal || 0,
```

Lalu tepat sebelum `await persistCalendarSyncHealth(healthPatch);` (sekitar baris 25002), sisipkan:

```js
    const totalDeleted = (syncResult?.rowsDeletedPerEvent || 0)
      + (syncResult?.rowsDeletedGlobal || 0);
    if (totalDeleted > 50) {
      try {
        await sendOpsAlert(
          `🧹 <b>Sync kalender menghapus ${totalDeleted} baris</b> — `
          + `${syncResult.rowsDeletedPerEvent} per-event, ${syncResult.rowsDeletedGlobal} event lenyap. `
          + 'Wajar saat backlog pertama dikuras; periksa bila berulang.',
        );
      } catch (err) {
        console.warn('[Calendar] Gagal kirim alert penghapusan:', err.message);
      }
    }
```

Alert ini informatif — ia tidak memblokir penghapusan dan tidak menggagalkan sync.

- [ ] **Step 5: Verifikasi sintaks `server.js`**

Run: `node --check server.js`
Expected: tanpa keluaran.

- [ ] **Step 6: Commit**

```bash
git add calendar-api.js server.js tests/calendar-public-sync.test.js
git commit -m "feat(kalender): laporkan jumlah penghapusan dan alert saat menguras backlog

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Verifikasi menyeluruh dan runbook pasca-deploy

**Files:**
- Create: `scripts/verify-calendar-duplicates.mjs`

**Interfaces:**
- Consumes: tidak ada dari task lain.
- Produces: skrip verifikasi read-only yang dipakai sebelum dan sesudah deploy.

- [ ] **Step 1: Tulis skrip verifikasi read-only**

Buat `scripts/verify-calendar-duplicates.mjs`:

```js
#!/usr/bin/env node
// Read-only. Menghitung duplikat (tanggal, tipe, jadwal_id) di calendar_events.
// Jalankan: node --env-file=.env scripts/verify-calendar-duplicates.mjs
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const RANGE_START = process.argv[2] || '2026-07-01';

const { data, error } = await supabase
  .from('calendar_events')
  .select('id, event_date, event_type, group_number, jadwal_id, synced_at')
  .gte('event_date', RANGE_START);

if (error) {
  console.error('Query gagal:', error.message);
  process.exit(1);
}

const byKey = new Map();
for (const row of data) {
  if (!row.jadwal_id) continue;
  const key = `${row.event_date}|${row.event_type}|${row.jadwal_id}`;
  if (!byKey.has(key)) byKey.set(key, []);
  byKey.get(key).push(row);
}

const dupes = [...byKey.entries()].filter(([, rows]) => rows.length > 1);
const excess = dupes.reduce((sum, [, rows]) => sum + rows.length - 1, 0);

console.log(`Rentang           : event_date >= ${RANGE_START}`);
console.log(`Total baris       : ${data.length}`);
console.log(`Kombinasi duplikat: ${dupes.length}`);
console.log(`Baris berlebih    : ${excess}`);

for (const [key, rows] of dupes) {
  const stamps = new Set(rows.map(r => r.synced_at));
  const verdict = stamps.size === 1 ? 'SAH (satu snapshot)' : 'HANTU (beda snapshot)';
  console.log(`  ${verdict}  ${key} -> ${rows.map(r => `grp${r.group_number}@${r.synced_at.slice(0, 10)}`).join(' | ')}`);
}

const ghosts = dupes.filter(([, rows]) => new Set(rows.map(r => r.synced_at)).size > 1);
console.log(`\nKombinasi HANTU tersisa: ${ghosts.length} (target setelah perbaikan: 0)`);
```

- [ ] **Step 2: Jalankan sebagai baseline sebelum deploy**

Run: `node --env-file=.env scripts/verify-calendar-duplicates.mjs`
Expected: `Kombinasi duplikat: 140`, `Baris berlebih: 446`, `Kombinasi HANTU tersisa: 133` (140 dikurangi 7 kombinasi sah pada JBU1542).

Catat angkanya sebagai pembanding.

- [ ] **Step 3: Jalankan seluruh berkas tes kalender**

Run: `node --test tests/calendar-public-sync.test.js tests/calendar-api-fallback.test.js tests/calendar-jadwal-match.test.js tests/calendar-public-source.test.js`
Expected: semua PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-calendar-duplicates.mjs
git commit -m "chore(kalender): skrip verifikasi duplikat read-only

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Runbook deploy (dijalankan pengguna)**

1. Merge branch `fix/kalender-hantu-stale-delete` ke `main` dan push — webhook deploy akan me-restart `server.js`.
2. Tunggu 2 menit. Sync otomatis jalan 60 detik setelah start (`server.js:25078`).
3. Jalankan `node --env-file=.env scripts/verify-calendar-duplicates.mjs`.
   Harapan: `Kombinasi HANTU tersisa: 0`, `Kombinasi duplikat: 7` — sisa 7 itu kloter kembar sah pada JBU1542.
4. Untuk 19 baris pada 6 event key yang lenyap: jalur global butuh run kedua. Restart sekali lagi, atau tunggu siklus 12 jam berikutnya, lalu jalankan ulang skrip verifikasi.
5. Periksa tab Manasik 23 Agustus 2026 di `/dashboard`: harus tersisa dua kloter (33 dan 36), footer `2 kloter · 84 pax`.

---

## Self-Review

**Cakupan spec:**

| Bagian spec | Task |
|---|---|
| Jalur per-event tanpa dua-langkah | Task 1 |
| `authoritative` tidak menyertakan `detailUsesFallback` | Task 1 step 4, diuji Task 3 |
| Mutu data per event, bukan global | Task 2 |
| Rute tidak memblokir; buang `degradedSnapshot` | Task 3 |
| Jalur global berbasis absennya event key + dua-langkah | Task 4 |
| Rasio 25% hanya untuk stale global | Task 5 |
| Ops alert >50 baris, informatif | Task 5 step 4 |
| `_DEMO_` kebal | Task 1 step 8, Global Constraints |
| Tulis ulang tes penjaga basi + uji mutasi | Task 1 step 2, Task 3 step 1-2 dan 7, Task 4 step 7 |
| Verifikasi 140 → 7 | Task 6 |

**Catatan revisi diri:** spec menyebut dua tes penjaga yang perlu ditulis ulang; pembacaan berkas tes menemukan **tiga**. Tes `syncCalendar deletes a stale row only after two complete primary snapshots` (`:717`) memakai baris basi pada event key yang sama dengan baris segar — itu kasus per-event, yang kini tuntas dalam satu run. Penulisan ulangnya masuk Task 1 step 2, dan kasus dua-langkah yang sesungguhnya dipindahkan ke fixture baru di Task 4 step 1 dengan event key yang benar-benar absen dari snapshot.
