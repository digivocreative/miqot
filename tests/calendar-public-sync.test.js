import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReadableStream, TransformStream } from 'node:stream/web';

// Fixture orchestration sengaja memakai snapshot kecil. Guard produksi diuji
// terpisah lewat validatePublicCalendarSnapshot.
process.env.CALENDAR_PUBLIC_MIN_EVENT_COUNT = '1';
process.env.CALENDAR_PUBLIC_REQUIRED_EVENT_TYPES = 'keberangkatan';
process.env.CALENDAR_PUBLIC_MAX_STALE_DELETE_RATIO = '1';
// Relay is opt-in per test so fallback orchestration tests stay fully local.
process.env.CALENDAR_PUBLIC_READER_BASE_URL = '';

// Tes ini menguji orkestrasi & parsing sync. Transport tetap memakai URL domain
// resmi; DNS pinning berada di dispatcher dan tidak mengubah URL yang di-stub.

function isoDateMonthsAhead(monthsAhead) {
  const d = new Date();
  d.setUTCDate(5);
  d.setUTCMonth(d.getUTCMonth() + monthsAhead);
  return d.toISOString().slice(0, 10);
}

const SYNC_EVENT_DATE = isoDateMonthsAhead(1);
const FAILED_EVENT_DATE = isoDateMonthsAhead(2);

const PUBLIC_PAGE_HTML = `
<script>
  var calendar = new FullCalendar.Calendar(calendarEl, {
    events: [
      {"title":"Keberangkatan UMROH","start":"${SYNC_EVENT_DATE}","color":"#7bc86c","extendedProps":{"mjudul":"KEBERANGKATAN UMROH","aid":"B1532","icon":"plane-departure","apalah":"JBU1532"}}
    ],
    eventClick: function(pop) {}
  });
</script>`;

const PUBLIC_MODAL_HTML = `
<table>
  <thead>
    <tr><th>GROUP</th><th>PESAWAT</th><th>WAKTU</th><th>PAKET</th><th>PAX</th><th>STAFF</th><th>TL</th></tr>
  </thead>
  <tbody>
    <tr>
      <td>10</td>
      <td>SAUDIA ~ SV 827</td>
      <td>00.40</td>
      <td>PROMO JUM'ATAIN PLUS TAIF +BADAR 15HR (KERETA CEPAT)</td>
      <td>47</td>
      <td>-</td>
      <td>•  SUSTEN MARYANI MASCIK</td>
    </tr>
  </tbody>
</table>`;

function publicPageHtmlForEvents(events) {
  return `
<script>
  var calendar = new FullCalendar.Calendar(calendarEl, {
    events: ${JSON.stringify(events)}
  });
</script>`;
}

function publicModalHtmlForGroup(groupNumber) {
  return `
<table>
  <thead>
    <tr><th>GROUP</th><th>PESAWAT</th><th>WAKTU</th><th>PAKET</th><th>PAX</th><th>STAFF</th><th>TL</th></tr>
  </thead>
  <tbody>
    <tr>
      <td>${groupNumber}</td>
      <td>SAUDIA ~ SV 827</td>
      <td>00.40</td>
      <td>PROMO JUM'ATAIN PLUS TAIF +BADAR 15HR (KERETA CEPAT)</td>
      <td>47</td>
      <td>-</td>
      <td>-</td>
    </tr>
  </tbody>
</table>`;
}

function htmlResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get() { return 'text/html'; } },
    async text() { return body; },
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}

async function loadCalendarApi() {
  if (!globalThis.ReadableStream) globalThis.ReadableStream = ReadableStream;
  if (!globalThis.TransformStream) globalThis.TransformStream = TransformStream;
  return import('../calendar-api.js');
}

async function loadSyncCalendar() {
  return (await loadCalendarApi()).syncCalendar;
}

const SCHEDULE = {
  jadwal_id: 'JBU1532',
  jadwal_nama: "PROMO JUM'ATAIN PLUS TAIF +BADAR 15HR (KERETA CEPAT)",
  seat_total: '47',
  seat_sisa: '1',
  maskapai: 'SAUDIA',
  berangkat_tgl: SYNC_EVENT_DATE,
  berangkat_jam: '00.40',
  berangkat_rute: 'CGK - JED',
  berangkat_kode_penerbangan: 'SV 827',
  pulang_tgl: '2026-07-19',
  pulang_jam: '07.35',
  pulang_rute: 'JED - CGK',
  pulang_kode_penerbangan: 'SV 816',
  manasik_tgl: '2026-06-20',
  manasik_jam: '08:00:00',
};

function makeResult(table, builder, state) {
  if (table === 'umroh_schedules') return { data: [SCHEDULE], error: null };
  if (table === 'jamaah_network_pax') return { data: [{ jadwal_id: 'JBU1532', pax: 3 }], error: null };
  if (table === 'calendar_insights') {
    return {
      data: state.staleCandidates === null
        ? null
        : { data: { ids: state.staleCandidates } },
      error: null,
    };
  }

  if (table === 'calendar_events') {
    if (builder.columns === 'id, event_date, event_type, raw_data') {
      if (state.existingCalendarReadError) {
        return { data: null, error: new Error('calendar read unavailable') };
      }
      return { data: state.existingCalendarRows, error: null };
    }
    if (builder.columns === 'id, event_date, paket, jam') return { data: [], error: null };
    if (builder.operation === 'delete' && state.deleteError) {
      return { data: null, error: new Error('calendar delete unavailable') };
    }
    return { data: state.upserted, error: null };
  }

  return { data: [], error: null };
}

function createFakeSupabase({
  existingCalendarIds = [],
  existingCalendarRows = null,
  existingCalendarReadError = false,
  missingMutawifColumn = false,
  upsertError = false,
  deleteError = false,
  staleCandidates = null,
} = {}) {
  const state = {
    upserted: [],
    deletedIds: [],
    updates: [],
    existingCalendarIds,
    existingCalendarRows: existingCalendarRows
      || existingCalendarIds.map((id) => {
        // id = `${event_date}_${event_type}_${rowKey}`
        const [event_date, event_type] = String(id).split('_');
        return { id, event_date, event_type, raw_data: null };
      }),
    existingCalendarReadError,
    missingMutawifColumn,
    missingMutawifErrorCount: 0,
    upsertError,
    deleteError,
    deleteAttempts: [],
    upsertCountAtDelete: null,
    staleCandidates,
  };

  return {
    state,
    from(table) {
      const builder = {
        table,
        columns: null,
        patch: null,
        select(columns) {
          this.columns = columns;
          return this;
        },
        gte() { return this; },
        gt() { return this; },
        in(_column, values) {
          if (this.operation === 'delete') {
            state.deleteAttempts.push(...values);
            state.upsertCountAtDelete = state.upserted.length;
            if (!state.deleteError) state.deletedIds.push(...values);
          }
          return this;
        },
        order() { return this; },
        eq() { return this; },
        maybeSingle() {
          return Promise.resolve(makeResult(table, this, state));
        },
        is() { return this; },
        delete() {
          this.operation = 'delete';
          return this;
        },
        update(patch) {
          this.operation = 'update';
          this.patch = patch;
          state.updates.push(patch);
          return this;
        },
        upsert(rows) {
          if (table === 'calendar_insights') {
            state.staleCandidates = rows.data.ids;
            return Promise.resolve({ error: null });
          }
          if (state.missingMutawifColumn && rows.some(row => Object.hasOwn(row, 'mutawif'))) {
            state.missingMutawifErrorCount++;
            return Promise.resolve({
              error: {
                code: 'PGRST204',
                message: "Could not find the 'mutawif' column of 'calendar_events' in the schema cache",
              },
            });
          }
          if (state.upsertError) {
            return Promise.resolve({ error: new Error('calendar upsert unavailable') });
          }
          state.upserted.push(...rows);
          return Promise.resolve({ error: null });
        },
        then(resolve) {
          resolve(makeResult(table, this, state));
        },
      };
      return builder;
    },
  };
}

test('validatePublicCalendarSnapshot rejects truncated or type-incomplete pages', async () => {
  const { validatePublicCalendarSnapshot } = await loadCalendarApi();
  const full = [
    { type: 'manasik' },
    { type: 'keberangkatan' },
    { type: 'kepulangan' },
  ];

  assert.match(
    validatePublicCalendarSnapshot(full.slice(0, 1), {
      minimumEventCount: 3,
      requiredEventTypes: ['manasik', 'keberangkatan', 'kepulangan'],
    }),
    /minimum aman 3/,
  );
  assert.match(
    validatePublicCalendarSnapshot(full.slice(0, 2), {
      minimumEventCount: 2,
      requiredEventTypes: ['manasik', 'keberangkatan', 'kepulangan'],
    }),
    /tidak memuat tipe wajib: kepulangan/,
  );
  assert.equal(
    validatePublicCalendarSnapshot(full, {
      minimumEventCount: 3,
      requiredEventTypes: ['manasik', 'keberangkatan', 'kepulangan'],
    }),
    null,
  );
});

test('syncCalendar scrapes public kegiatan page and public modal without legacy login', async () => {
  const originalFetch = global.fetch;
  const urls = [];
  try {
    global.fetch = async (url) => {
      const href = String(url);
      const parsed = new URL(href);
      urls.push(href);

      if (
        parsed.origin === 'https://alhijazindowisata.com' &&
        parsed.pathname === '/jadwal/kegiatan/alhijaz-indowisata'
      ) {
        return htmlResponse(PUBLIC_PAGE_HTML);
      }
      if (
        parsed.origin === 'https://alhijazindowisata.com' &&
        parsed.pathname === '/jadwal/_kmodal.php' &&
        parsed.searchParams.get('.m') === 'B1532' &&
        parsed.searchParams.get('.g') === 'JBU1532'
      ) {
        return htmlResponse(PUBLIC_MODAL_HTML);
      }

      throw new Error(`unexpected fetch: ${href}`);
    };

    const syncCalendar = await loadSyncCalendar();
    const supabase = createFakeSupabase();
    const result = await syncCalendar(supabase);

    assert.equal(result.success, true);
    assert.equal(result.count, 1);
    assert.equal(supabase.state.upserted.length, 1);
    assert.equal(supabase.state.upserted[0].id, `${SYNC_EVENT_DATE}_keberangkatan_10`);
    assert.equal(supabase.state.upserted[0].event_type, 'keberangkatan');
    assert.equal(supabase.state.upserted[0].jam, '00.40');
    assert.equal(supabase.state.upserted[0].pax, 47);
    assert.equal(
      supabase.state.updates.some(patch =>
        patch.jadwal_id === 'JBU1532' &&
        patch.pax_terisi === 46 &&
        patch.pax_jamaah === 3
      ),
      true
    );

    assert.equal(urls.some(href => href.includes('/jadwal/kegiatan/alhijaz-indowisata')), true);
    assert.equal(urls.some(href => href.includes('/jadwal/_kmodal.php')), true);
    assert.equal(urls.some(href => href.includes('cek_login.php')), false);
    assert.equal(urls.some(href => href.includes('115.124.86.220')), false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('syncCalendar refetches the fallback when the primary active range is incomplete', async () => {
  const originalFetch = global.fetch;
  const urls = [];
  const oldPrimaryPage = publicPageHtmlForEvents([{
    title: 'Keberangkatan UMROH',
    start: '2020-01-05',
    extendedProps: {
      mjudul: 'KEBERANGKATAN UMROH',
      aid: 'BOLD',
      apalah: 'JBUOLD',
    },
  }]);

  try {
    global.fetch = async (url) => {
      const parsed = new URL(String(url));
      urls.push(`${parsed.protocol}//${parsed.host}${parsed.pathname}`);
      if (parsed.pathname === '/jadwal/kegiatan/alhijaz-indowisata') {
        return htmlResponse(parsed.protocol === 'https:' ? oldPrimaryPage : PUBLIC_PAGE_HTML);
      }
      if (parsed.pathname === '/jadwal/_kmodal.php' && parsed.protocol === 'http:') {
        return htmlResponse(PUBLIC_MODAL_HTML);
      }
      throw new Error(`unexpected fetch: ${url}`);
    };

    const syncCalendar = await loadSyncCalendar();
    const supabase = createFakeSupabase();
    const result = await syncCalendar(supabase);

    assert.equal(result.success, true);
    assert.equal(result.source, 'fallback');
    assert.deepEqual(urls, [
      'https://alhijazindowisata.com/jadwal/kegiatan/alhijaz-indowisata',
      'http://alhijazindowisata.com/jadwal/kegiatan/alhijaz-indowisata',
      'http://alhijazindowisata.com/jadwal/_kmodal.php',
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test('syncCalendar keeps MUTAWIF separate in raw_data while the additive column migration is pending', async () => {
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

    const syncCalendar = await loadSyncCalendar();
    const supabase = createFakeSupabase({ missingMutawifColumn: true });
    const result = await syncCalendar(supabase);

    assert.equal(result.success, true);
    assert.equal(supabase.state.missingMutawifErrorCount, 1);
    assert.equal(Object.hasOwn(supabase.state.upserted[0], 'mutawif'), false);
    assert.equal(supabase.state.upserted[0].raw_data.mutawif, '-');
  } finally {
    global.fetch = originalFetch;
  }
});

test('syncCalendar preserves existing MUTAWIF when fallback detail has no MUTAWIF column', async () => {
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

    const id = `${SYNC_EVENT_DATE}_keberangkatan_10`;
    const syncCalendar = await loadSyncCalendar();
    const supabase = createFakeSupabase({
      existingCalendarRows: [{ id, raw_data: { mutawif: '• MUTAWIF TERSIMPAN' } }],
    });
    const result = await syncCalendar(supabase);

    assert.equal(result.success, true);
    assert.equal(supabase.state.upserted[0].mutawif, '• MUTAWIF TERSIMPAN');
    assert.equal(supabase.state.upserted[0].raw_data.mutawif, '• MUTAWIF TERSIMPAN');
    assert.equal(Object.hasOwn(supabase.state.upserted[0], '_preserve_mutawif'), false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('syncCalendar enriches upcoming fallback departures from the current MUTAWIF reader', async () => {
  const originalFetch = global.fetch;
  const readerRequests = [];
  try {
    global.fetch = async (url) => {
      const parsed = new URL(String(url));
      if (parsed.hostname === 'reader.example') {
        readerRequests.push(String(url));
        return jsonResponse({
          code: 200,
          status: 200,
          data: {
            httpStatus: 200,
            content: `
              | GROUP | PESAWAT | WAKTU | PAKET | PAX | STAFF | TL | MUTAWIF |
              | --- | --- | --- | --- | --- | --- | --- | --- |
              | 10 | SAUDIA ~ SV 827 | 00.40 | PROMO JUM'ATAIN PLUS TAIF +BADAR 15HR (KERETA CEPAT) | 47 | - | • SUSTEN MARYANI MASCIK | • HANAFI FAUZAN |
            `,
          },
        });
      }
      if (parsed.pathname === '/jadwal/kegiatan/alhijaz-indowisata') {
        return parsed.protocol === 'https:'
          ? htmlResponse('blocked', 403)
          : htmlResponse(PUBLIC_PAGE_HTML);
      }
      if (parsed.pathname === '/jadwal/_kmodal.php' && parsed.protocol === 'http:') {
        return htmlResponse(PUBLIC_MODAL_HTML);
      }
      throw new Error(`unexpected fetch: ${url}`);
    };

    const syncCalendar = await loadSyncCalendar();
    const supabase = createFakeSupabase();
    const result = await syncCalendar(supabase, {
      readerBaseUrl: 'https://reader.example',
      readerMinimumIntervalMs: 0,
      readerWindowDays: 45,
    });

    assert.equal(result.success, true);
    assert.equal(result.source, 'fallback');
    assert.equal(result.mutawifReaderEvents, 1);
    assert.equal(result.mutawifReaderRows, 1);
    assert.equal(result.mutawifReaderFailures, 0);
    assert.equal(readerRequests.length, 1);
    assert.equal(supabase.state.upserted[0].mutawif, '• HANAFI FAUZAN');
    assert.equal(supabase.state.upserted[0].raw_data.mutawif, '• HANAFI FAUZAN');
  } finally {
    global.fetch = originalFetch;
  }
});

test('syncCalendar preserves a valid MUTAWIF and fails safely when reader regresses to a placeholder', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async (url) => {
      const parsed = new URL(String(url));
      if (parsed.hostname === 'reader.example') {
        return jsonResponse({
          code: 200,
          status: 200,
          data: {
            httpStatus: 200,
            content: `
              | GROUP | PESAWAT | WAKTU | PAKET | PAX | STAFF | TL | MUTAWIF |
              | --- | --- | --- | --- | --- | --- | --- | --- |
              | 10 | SAUDIA ~ SV 827 | 00.40 | PROMO JUM'ATAIN PLUS TAIF +BADAR 15HR (KERETA CEPAT) | 47 | - | • SUSTEN MARYANI MASCIK | . . . . . |
            `,
          },
        });
      }
      if (parsed.pathname === '/jadwal/kegiatan/alhijaz-indowisata') {
        return parsed.protocol === 'https:'
          ? htmlResponse('blocked', 403)
          : htmlResponse(PUBLIC_PAGE_HTML);
      }
      if (parsed.pathname === '/jadwal/_kmodal.php' && parsed.protocol === 'http:') {
        return htmlResponse(PUBLIC_MODAL_HTML);
      }
      throw new Error(`unexpected fetch: ${url}`);
    };

    const id = `${SYNC_EVENT_DATE}_keberangkatan_10`;
    const syncCalendar = await loadSyncCalendar();
    const supabase = createFakeSupabase({
      existingCalendarRows: [{ id, raw_data: { mutawif: '• HANAFI FAUZAN' } }],
    });
    const result = await syncCalendar(supabase, {
      readerBaseUrl: 'https://reader.example',
      readerMinimumIntervalMs: 0,
      readerWindowDays: 180,
    });

    assert.equal(result.success, false);
    assert.equal(result.mutawifReaderFailures, 0);
    assert.equal(result.mutawifRegressionsPrevented, 1);
    assert.match(result.error, /regresi nama MUTAWIF dicegah/);
    assert.equal(supabase.state.upserted[0].mutawif, '• HANAFI FAUZAN');
    assert.equal(supabase.state.upserted[0].raw_data.mutawif, '• HANAFI FAUZAN');
    assert.equal(Object.hasOwn(supabase.state.upserted[0], '_mutawif_regression_candidate'), false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('syncCalendar preserves old MUTAWIF and reports a retryable failure when reader is unavailable', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async (url) => {
      const parsed = new URL(String(url));
      if (parsed.hostname === 'reader.example') return jsonResponse({}, 503);
      if (parsed.pathname === '/jadwal/kegiatan/alhijaz-indowisata') {
        return parsed.protocol === 'https:'
          ? htmlResponse('blocked', 403)
          : htmlResponse(PUBLIC_PAGE_HTML);
      }
      if (parsed.pathname === '/jadwal/_kmodal.php' && parsed.protocol === 'http:') {
        return htmlResponse(PUBLIC_MODAL_HTML);
      }
      throw new Error(`unexpected fetch: ${url}`);
    };

    const id = `${SYNC_EVENT_DATE}_keberangkatan_10`;
    const syncCalendar = await loadSyncCalendar();
    const supabase = createFakeSupabase({
      existingCalendarRows: [{ id, raw_data: { mutawif: '• HANAFI FAUZAN' } }],
    });
    const result = await syncCalendar(supabase, {
      readerBaseUrl: 'https://reader.example',
      readerMinimumIntervalMs: 0,
      readerWindowDays: 180,
    });

    assert.equal(result.success, false);
    assert.equal(result.mutawifReaderFailures, 1);
    assert.equal(result.mutawifRegressionsPrevented, 0);
    assert.match(result.error, /detail MUTAWIF gagal diverifikasi/);
    assert.equal(supabase.state.upserted[0].mutawif, '• HANAFI FAUZAN');
    assert.equal(supabase.state.upserted[0].raw_data.mutawif, '• HANAFI FAUZAN');
  } finally {
    global.fetch = originalFetch;
  }
});

test('syncCalendar rejects a reader table whose GROUP does not match the fallback detail', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async (url) => {
      const parsed = new URL(String(url));
      if (parsed.hostname === 'reader.example') {
        return jsonResponse({
          code: 200,
          status: 200,
          data: {
            httpStatus: 200,
            content: `
              | GROUP | PESAWAT | WAKTU | PAKET | PAX | STAFF | TL | MUTAWIF |
              | --- | --- | --- | --- | --- | --- | --- | --- |
              | 999 | SAUDIA ~ SV 827 | 00.40 | PROMO JUM'ATAIN PLUS TAIF +BADAR 15HR (KERETA CEPAT) | 47 | - | • SUSTEN MARYANI MASCIK | • NAMA SALAH |
            `,
          },
        });
      }
      if (parsed.pathname === '/jadwal/kegiatan/alhijaz-indowisata') {
        return parsed.protocol === 'https:'
          ? htmlResponse('blocked', 403)
          : htmlResponse(PUBLIC_PAGE_HTML);
      }
      if (parsed.pathname === '/jadwal/_kmodal.php' && parsed.protocol === 'http:') {
        return htmlResponse(PUBLIC_MODAL_HTML);
      }
      throw new Error(`unexpected fetch: ${url}`);
    };

    const id = `${SYNC_EVENT_DATE}_keberangkatan_10`;
    const syncCalendar = await loadSyncCalendar();
    const supabase = createFakeSupabase({
      existingCalendarRows: [{ id, raw_data: { mutawif: '• HANAFI FAUZAN' } }],
    });
    const result = await syncCalendar(supabase, {
      readerBaseUrl: 'https://reader.example',
      readerMinimumIntervalMs: 0,
      readerWindowDays: 180,
    });

    assert.equal(result.success, false);
    assert.equal(result.mutawifReaderFailures, 1);
    assert.match(result.error, /detail MUTAWIF gagal diverifikasi/);
    assert.equal(supabase.state.upserted[0].mutawif, '• HANAFI FAUZAN');
  } finally {
    global.fetch = originalFetch;
  }
});

test('syncCalendar aborts safely when existing MUTAWIF cannot be read', async () => {
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

    const syncCalendar = await loadSyncCalendar();
    const supabase = createFakeSupabase({ existingCalendarReadError: true });
    const result = await syncCalendar(supabase);

    assert.equal(result.success, false);
    assert.match(result.error, /mempertahankan MUTAWIF: calendar read unavailable/);
    assert.equal(supabase.state.upserted.length, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('syncCalendar reports upsert failure and never attempts stale-delete first', async () => {
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

    const staleId = `${SYNC_EVENT_DATE}_keberangkatan_11`;
    const syncCalendar = await loadSyncCalendar();
    const supabase = createFakeSupabase({ existingCalendarIds: [staleId], upsertError: true });
    const result = await syncCalendar(supabase);

    assert.equal(result.success, false);
    assert.match(result.error, /upsert calendar_events gagal setelah 0\/1 row/);
    assert.equal(result.rowsUpserted, 0);
    assert.equal(supabase.state.deleteAttempts.length, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('syncCalendar reports delete failure only after all upserts succeed', async () => {
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

    const staleId = `${isoDateMonthsAhead(4)}_keberangkatan_legacy`;
    const syncCalendar = await loadSyncCalendar();
    const supabase = createFakeSupabase({
      existingCalendarIds: [staleId],
      deleteError: true,
      staleCandidates: [staleId],
    });
    const result = await syncCalendar(supabase);

    assert.equal(result.success, false);
    assert.match(result.error, /delete stale calendar_events gagal/);
    assert.equal(result.rowsUpserted, 1);
    assert.equal(supabase.state.upsertCountAtDelete, 1);
    assert.deepEqual(supabase.state.deleteAttempts, [staleId]);
  } finally {
    global.fetch = originalFetch;
  }
});

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
  } finally {
    global.fetch = originalFetch;
  }
});

test('syncCalendar skips stale-delete when the public page uses the fallback origin', async () => {
  const originalFetch = global.fetch;
  const unrelatedStaleId = `${isoDateMonthsAhead(4)}_keberangkatan_legacy`;
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

    const syncCalendar = await loadSyncCalendar();
    const supabase = createFakeSupabase({ existingCalendarIds: [unrelatedStaleId] });
    const result = await syncCalendar(supabase);

    assert.equal(result.success, true);
    assert.equal(result.source, 'fallback');
    assert.equal(supabase.state.deletedIds.length, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('syncCalendar serializes modal requests while the public page uses fallback', async () => {
  const originalFetch = global.fetch;
  let inFlight = 0;
  let maxInFlight = 0;
  try {
    const events = [1, 2, 3].map(index => ({
      title: 'Keberangkatan UMROH',
      start: isoDateMonthsAhead(index),
      extendedProps: {
        mjudul: 'KEBERANGKATAN UMROH',
        aid: `B${index}`,
        apalah: `JBU${index}`,
      },
    }));

    global.fetch = async (url) => {
      const parsed = new URL(String(url));
      if (parsed.protocol === 'https:') return htmlResponse('blocked', 403);
      if (parsed.pathname === '/jadwal/kegiatan/alhijaz-indowisata') {
        return htmlResponse(publicPageHtmlForEvents(events));
      }
      if (parsed.pathname === '/jadwal/_kmodal.php') {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise(resolve => setTimeout(resolve, 5));
        inFlight -= 1;
        return htmlResponse(publicModalHtmlForGroup(parsed.searchParams.get('.m')));
      }
      throw new Error(`unexpected fetch: ${url}`);
    };

    const syncCalendar = await loadSyncCalendar();
    const result = await syncCalendar(createFakeSupabase());

    assert.equal(result.success, true);
    assert.equal(result.source, 'fallback');
    assert.equal(maxInFlight, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test('syncCalendar skips stale-delete when modal details use the fallback origin', async () => {
  const originalFetch = global.fetch;
  const unrelatedStaleId = `${isoDateMonthsAhead(4)}_keberangkatan_legacy`;
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

    const syncCalendar = await loadSyncCalendar();
    const supabase = createFakeSupabase({ existingCalendarIds: [unrelatedStaleId] });
    const result = await syncCalendar(supabase);

    assert.equal(result.success, true);
    assert.equal(result.source, 'fallback');
    assert.equal(supabase.state.deletedIds.length, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('syncCalendar fetches public modal details with bounded concurrency', async () => {
  const originalFetch = global.fetch;
  const modalEvents = [1, 2, 3, 4].map((n) => ({
    title: 'Keberangkatan UMROH',
    start: isoDateMonthsAhead(n),
    color: '#7bc86c',
    extendedProps: {
      mjudul: 'KEBERANGKATAN UMROH',
      aid: `B15${n}`,
      icon: 'plane-departure',
      apalah: `JBU15${n}`,
    },
  }));
  let activeModalFetches = 0;
  let maxActiveModalFetches = 0;

  try {
    global.fetch = async (url) => {
      const href = String(url);
      const parsed = new URL(href);

      if (
        parsed.origin === 'https://alhijazindowisata.com' &&
        parsed.pathname === '/jadwal/kegiatan/alhijaz-indowisata'
      ) {
        return htmlResponse(publicPageHtmlForEvents(modalEvents));
      }

      if (
        parsed.origin === 'https://alhijazindowisata.com' &&
        parsed.pathname === '/jadwal/_kmodal.php'
      ) {
        activeModalFetches++;
        maxActiveModalFetches = Math.max(maxActiveModalFetches, activeModalFetches);
        await new Promise(resolve => setTimeout(resolve, 25));
        activeModalFetches--;
        return htmlResponse(publicModalHtmlForGroup(parsed.searchParams.get('.m')));
      }

      throw new Error(`unexpected fetch: ${href}`);
    };

    const syncCalendar = await loadSyncCalendar();
    const supabase = createFakeSupabase();
    const result = await syncCalendar(supabase);

    assert.equal(result.success, true);
    assert.equal(result.count, 4);
    assert.equal(supabase.state.upserted.length, 4);
    assert.equal(maxActiveModalFetches > 1, true);
  } finally {
    global.fetch = originalFetch;
  }
});

test('syncCalendar reports partial failure and preserves all stale rows for malformed details', async () => {
  const originalFetch = global.fetch;
  const existingFailedId = `${FAILED_EVENT_DATE}_keberangkatan_legacy`;
  const unrelatedStaleId = `${isoDateMonthsAhead(4)}_keberangkatan_legacy`;
  const events = [
    {
      title: 'Keberangkatan UMROH',
      start: SYNC_EVENT_DATE,
      color: '#7bc86c',
      extendedProps: {
        mjudul: 'KEBERANGKATAN UMROH',
        aid: 'B1532',
        icon: 'plane-departure',
        apalah: 'JBU1532',
      },
    },
    {
      title: 'Keberangkatan UMROH',
      start: FAILED_EVENT_DATE,
      color: '#7bc86c',
      extendedProps: {
        mjudul: 'KEBERANGKATAN UMROH',
        aid: 'B9999',
        icon: 'plane-departure',
        apalah: 'JBU1532',
      },
    },
  ];

  try {
    global.fetch = async (url) => {
      const href = String(url);
      const parsed = new URL(href);

      if (
        parsed.origin === 'https://alhijazindowisata.com' &&
        parsed.pathname === '/jadwal/kegiatan/alhijaz-indowisata'
      ) {
        return htmlResponse(publicPageHtmlForEvents(events));
      }

      if (
        parsed.origin === 'https://alhijazindowisata.com' &&
        parsed.pathname === '/jadwal/_kmodal.php' &&
        parsed.searchParams.get('.m') === 'B1532'
      ) {
        return htmlResponse(PUBLIC_MODAL_HTML);
      }

      if (
        parsed.origin === 'https://alhijazindowisata.com' &&
        parsed.pathname === '/jadwal/_kmodal.php' &&
        parsed.searchParams.get('.m') === 'B9999'
      ) {
        return htmlResponse(`
          <table>
            <thead><tr><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th></tr></thead>
            <tbody><tr><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td></tr></tbody>
          </table>
        `);
      }

      throw new Error(`unexpected fetch: ${href}`);
    };

    const syncCalendar = await loadSyncCalendar();
    const supabase = createFakeSupabase({ existingCalendarIds: [existingFailedId, unrelatedStaleId] });
    const result = await syncCalendar(supabase);

    assert.equal(result.success, false);
    assert.match(result.error, /1\/2 detail event gagal/);
    assert.equal(result.count, 1);
    assert.equal(result.failedEvents, 1);
    assert.equal(supabase.state.deletedIds.includes(existingFailedId), false);
    assert.equal(supabase.state.deletedIds.includes(unrelatedStaleId), false);
  } finally {
    global.fetch = originalFetch;
  }
});
