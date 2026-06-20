import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReadableStream, TransformStream } from 'node:stream/web';

function isoDateMonthsAhead(monthsAhead) {
  const d = new Date();
  d.setUTCDate(5);
  d.setUTCMonth(d.getUTCMonth() + monthsAhead);
  return d.toISOString().slice(0, 10);
}

const SYNC_EVENT_DATE = isoDateMonthsAhead(1);

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

async function loadSyncCalendar() {
  if (!globalThis.ReadableStream) globalThis.ReadableStream = ReadableStream;
  if (!globalThis.TransformStream) globalThis.TransformStream = TransformStream;
  const mod = await import('../calendar-api.js');
  return mod.syncCalendar;
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

  if (table === 'calendar_events') {
    if (builder.columns === 'id') return { data: [], error: null };
    if (builder.columns === 'id, event_date, paket, jam') return { data: [], error: null };
    return { data: state.upserted, error: null };
  }

  return { data: [], error: null };
}

function createFakeSupabase() {
  const state = { upserted: [], deletedIds: [], updates: [] };

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
          if (this.operation === 'delete') state.deletedIds.push(...values);
          return this;
        },
        order() { return this; },
        eq() { return this; },
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
