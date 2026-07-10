import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCalendarFallbackOrigin,
  buildPublicModalUrl,
  calendarPublicFallbackOriginLookup,
  calendarPublicOriginLookup,
  fetchPublicCalendarEvents,
  fetchPublicEventDetail,
  parsePublicCalendarEventsFromHtml,
  parsePublicEventDetailHTML,
  probePublicCalendarPrimary,
  CALENDAR_PUBLIC_FALLBACK_ORIGIN_IP,
  CALENDAR_PUBLIC_ORIGIN_IP,
} from '../lib/calendar-public-source.js';

test('calendar transport pins TLS to the current origin and configures the proven fallback', () => {
  assert.equal(CALENDAR_PUBLIC_ORIGIN_IP, '101.255.3.160');
  assert.equal(CALENDAR_PUBLIC_FALLBACK_ORIGIN_IP, '115.124.86.220');

  calendarPublicOriginLookup('alhijazindowisata.com', { all: true }, (error, addresses) => {
    assert.equal(error, null);
    assert.deepEqual(addresses, [{ address: '101.255.3.160', family: 4 }]);
  });
  calendarPublicFallbackOriginLookup('alhijazindowisata.com', { all: true }, (error, addresses) => {
    assert.equal(error, null);
    assert.deepEqual(addresses, [{ address: '115.124.86.220', family: 4 }]);
  });

  const fallback = applyCalendarFallbackOrigin(
    'https://alhijazindowisata.com/jadwal/_kmodal.php?.m=B1&.g=G1',
    { 'User-Agent': 'x' },
  );
  assert.equal(new URL(fallback.url).origin, 'http://alhijazindowisata.com');
  assert.equal(Object.hasOwn(fallback.headers, 'Host'), false);
  assert.equal(fallback.headers['User-Agent'], 'x');
});

const PAGE_HTML = `
<html>
  <body>
    <div id="calendar"></div>
    <script>
      var calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        events: [
          {"title":"Manasik UMROH","start":"0000-00-00","color":"#ce93d8","extendedProps":{"mjudul":"MANASIK UMROH","aid":"M0679","icon":"kaaba","apalah":"JBU0679"}},
          {"title":"Manasik UMROH","start":"2026-06-20","color":"#ce93d8","extendedProps":{"mjudul":"MANASIK UMROH","aid":"M1532","icon":"kaaba","apalah":"JBU1532,JBU1538,JBU1496"}},
          {"title":"Keberangkatan UMROH","start":"2026-07-05","color":"#7bc86c","extendedProps":{"mjudul":"KEBERANGKATAN UMROH","aid":"B1532","icon":"plane-departure","apalah":"JBU1532"}},
          {"title":"Kepulangan UMROH","start":"2026-07-19","color":"#90caf9","extendedProps":{"mjudul":"KEPULANGAN UMROH","aid":"P1532","icon":"plane-arrival","apalah":"JBU1532"}}
        ],
        eventClick: function(pop) {}
      });
    </script>
  </body>
</html>`;

const DEPARTURE_MODAL_HTML = `
<table class="w-100 tablex">
  <thead>
    <tr>
      <th>GROUP</th><th>PESAWAT</th><th>WAKTU</th><th>PAKET</th><th>PAX</th><th>STAFF</th><th>TL</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>10</td>
      <td>SAUDIA ~ SV 827</td>
      <td>00.40</td>
      <td>PROMO JUM'ATAIN PLUS TAIF +BADAR 15HR (KERETA CEPAT)</td>
      <td>47</td>
      <td>-</td>
      <td>•  SUSTEN MARYANI MASCIK </td>
    </tr>
  </tbody>
</table>`;

const MANASIK_MODAL_HTML = `
<table class="w-100 tablex">
  <thead>
    <tr>
      <th>GROUP</th><th>PESAWAT</th><th>WAKTU</th><th>PAKET</th><th>PAX</th><th>TL</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>10</td>
      <td>SAUDIA ~ SV 827</td>
      <td>08:00</td>
      <td><span style="font-weight: 300; font-size: 10px">05 Juli 2026<br></span>PROMO JUM'ATAIN PLUS TAIF +BADAR 15HR (KERETA CEPAT)</td>
      <td>47</td>
      <td>•  SUSTEN MARYANI MASCIK </td>
    </tr>
  </tbody>
</table>`;

const MUTAWIF_MODAL_HTML = `
<table class="w-100 tablex">
  <thead>
    <tr>
      <th>GROUP</th><th>PESAWAT</th><th>WAKTU</th><th>PAKET</th><th>PAX</th><th>TL</th><th>MUTAWIF</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>13</td><td>SAUDIA ~ SV 827</td><td>00.40</td><td>REGULER 9HR</td><td>41</td>
      <td>• NIKESARI MARZUHENDA MARZUKI</td><td>• HANAFI FAUZAN</td>
    </tr>
    <tr>
      <td>14</td><td>SAUDIA ~ SV 827</td><td>00.41</td><td>PROMO UMRAH 9 HARI</td><td>48</td>
      <td>• YULIA SUSANTI</td><td>• ABDULBAITS JAZULI</td>
    </tr>
  </tbody>
</table>`;

test('parsePublicCalendarEventsFromHtml extracts public FullCalendar events and skips invalid dates', () => {
  const events = parsePublicCalendarEventsFromHtml(PAGE_HTML);

  assert.equal(events.length, 3);
  assert.deepEqual(
    events.map(ev => [ev.date, ev.type, ev.aid, ev.apalah]),
    [
      ['2026-06-20', 'manasik', 'M1532', 'JBU1532,JBU1538,JBU1496'],
      ['2026-07-05', 'keberangkatan', 'B1532', 'JBU1532'],
      ['2026-07-19', 'kepulangan', 'P1532', 'JBU1532'],
    ],
  );
});

test('parsePublicCalendarEventsFromHtml fails loudly when events array is missing', () => {
  assert.throws(
    () => parsePublicCalendarEventsFromHtml('<html><script>var x = [];</script></html>'),
    /events array tidak ditemukan di halaman publik/,
  );
});

test('parsePublicEventDetailHTML maps public WAKTU header into jam', () => {
  const rows = parsePublicEventDetailHTML(DEPARTURE_MODAL_HTML);

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    group_number: '10',
    pesawat: 'SAUDIA ~ SV 827',
    jam: '00.40',
    paket: "PROMO JUM'ATAIN PLUS TAIF +BADAR 15HR (KERETA CEPAT)",
    pax: 47,
    staff: '-',
    mutawif: '-',
    tour_leader: '• SUSTEN MARYANI MASCIK',
  });
});

test('parsePublicEventDetailHTML keeps MUTAWIF separate from STAFF', () => {
  const rows = parsePublicEventDetailHTML(MUTAWIF_MODAL_HTML);

  assert.deepEqual(
    rows.map(row => [row.group_number, row.tour_leader, row.staff, row.mutawif]),
    [
      ['13', '• NIKESARI MARZUHENDA MARZUKI', '-', '• HANAFI FAUZAN'],
      ['14', '• YULIA SUSANTI', '-', '• ABDULBAITS JAZULI'],
    ],
  );
});

test('fetchPublicEventDetail uses only the canonical TLS hostname pinned to the current origin', async () => {
  const urls = [];
  const rows = await fetchPublicEventDetail(
    { aid: 'B1559', date: '2026-07-11', type: 'keberangkatan', apalah: 'JBU1559,JBU1522' },
    async url => {
      urls.push(url);
      return new Response(MUTAWIF_MODAL_HTML, { status: 200 });
    },
  );

  assert.equal(new URL(urls[0]).hostname, 'alhijazindowisata.com');
  assert.equal(urls.length, 1);
  assert.equal(urls.some(url => String(url).includes('115.124.86.220')), false);
  assert.equal(rows[0].staff, '-');
  assert.equal(rows[0].mutawif, '• HANAFI FAUZAN');
  assert.equal(rows._calendarSource, 'primary');
});

test('calendar transport fails over on primary 403 and keeps the circuit open for modal requests', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    const parsed = new URL(String(url));
    requests.push({ url: parsed, headers: options.headers });

    if (parsed.protocol === 'https:') {
      return new Response('blocked', { status: 403 });
    }
    if (parsed.pathname.includes('/kegiatan/')) {
      return new Response(PAGE_HTML, { status: 200 });
    }
    return new Response(DEPARTURE_MODAL_HTML, { status: 200 });
  };

  const events = await fetchPublicCalendarEvents(fetchImpl, {
    validationOptions: { minimumEventCount: 3 },
  });
  const rows = await fetchPublicEventDetail(events[1], fetchImpl);

  assert.equal(events.length, 3);
  assert.equal(rows.length, 1);
  assert.equal(requests.filter(request => request.url.protocol === 'https:').length, 1);
  assert.equal(requests.filter(request => request.url.protocol === 'http:').length, 2);
  assert.equal(requests.every(request => request.url.hostname === 'alhijazindowisata.com'), true);
  assert.equal(requests.every(request => !Object.hasOwn(request.headers, 'Host')), true);
  assert.equal(events._calendarSource, 'fallback');
  assert.equal(rows._calendarSource, 'fallback');
});

test('calendar transport opens the primary circuit on 5xx before the modal batch', async () => {
  let primaryRequests = 0;
  let fallbackRequests = 0;
  const fetchImpl = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.protocol === 'https:') {
      primaryRequests += 1;
      return new Response('upstream unavailable', { status: 503 });
    }

    fallbackRequests += 1;
    if (parsed.pathname.includes('/kegiatan/')) return new Response(PAGE_HTML, { status: 200 });
    return new Response(DEPARTURE_MODAL_HTML, { status: 200 });
  };

  const events = await fetchPublicCalendarEvents(fetchImpl, {
    validationOptions: { minimumEventCount: 3 },
  });
  await fetchPublicEventDetail(events[1], fetchImpl);

  assert.equal(primaryRequests, 1);
  assert.equal(fallbackRequests, 2);
});

test('calendar transport falls back when a primary page is parseable but semantically incomplete', async () => {
  const requests = [];
  const fetchImpl = async (url) => {
    const parsed = new URL(String(url));
    requests.push(parsed.protocol);
    if (parsed.protocol === 'https:') {
      return new Response('<script>const calendar = { events: [] };</script>', { status: 200 });
    }
    return new Response(PAGE_HTML, { status: 200 });
  };

  const events = await fetchPublicCalendarEvents(fetchImpl, {
    validationOptions: { minimumEventCount: 3 },
  });

  assert.equal(events.length, 3);
  assert.equal(events._calendarSource, 'fallback');
  assert.deepEqual(requests, ['https:', 'http:']);
});

test('calendar detail tries the fallback when the primary modal is empty', async () => {
  const requests = [];
  const fetchImpl = async (url) => {
    const parsed = new URL(String(url));
    requests.push(parsed.protocol);
    if (parsed.protocol === 'https:') {
      return new Response(`
        <table>
          <thead><tr><th>GROUP</th><th>PESAWAT</th><th>WAKTU</th><th>PAKET</th><th>PAX</th></tr></thead>
          <tbody></tbody>
        </table>
      `, { status: 200 });
    }
    return new Response(DEPARTURE_MODAL_HTML, { status: 200 });
  };

  const rows = await fetchPublicEventDetail(
    { aid: 'B1532', date: '2026-07-05', type: 'keberangkatan', apalah: 'JBU1532' },
    fetchImpl,
  );

  assert.equal(rows.length, 1);
  assert.equal(rows._calendarSource, 'fallback');
  assert.deepEqual(requests, ['https:', 'http:']);
});

test('calendar detail preserves an empty primary result when its fallback fails', async () => {
  const fetchImpl = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.protocol === 'https:') {
      return new Response(`
        <table>
          <thead><tr><th>GROUP</th><th>PESAWAT</th><th>WAKTU</th><th>PAKET</th><th>PAX</th></tr></thead>
          <tbody></tbody>
        </table>
      `, { status: 200 });
    }
    return new Response('missing', { status: 404 });
  };

  const rows = await fetchPublicEventDetail(
    { aid: 'B1532', date: '2026-07-05', type: 'keberangkatan', apalah: 'JBU1532' },
    fetchImpl,
  );

  assert.deepEqual(rows, []);
  assert.equal(rows._calendarSource, 'primary');
});

test('calendar transport does not retry terminal 404 responses from both origins', async () => {
  let requests = 0;
  const fetchImpl = async () => {
    requests += 1;
    return new Response('missing', { status: 404 });
  };

  await assert.rejects(
    fetchPublicCalendarEvents(fetchImpl, { validationOptions: { minimumEventCount: 3 } }),
    /gagal setelah 1 percobaan: origin utama 101\.255\.3\.160: HTTP 404; fallback 115\.124\.86\.220: HTTP 404/,
  );
  assert.equal(requests, 2);
});

test('calendar transport retries fallback 403 as a transient rate limit', async () => {
  let primaryRequests = 0;
  let fallbackRequests = 0;
  const fetchImpl = async (url) => {
    if (new URL(String(url)).protocol === 'https:') {
      primaryRequests += 1;
      return new Response('blocked', { status: 403 });
    }

    fallbackRequests += 1;
    if (fallbackRequests === 1) return new Response('rate limited', { status: 403 });
    return new Response(PAGE_HTML, { status: 200 });
  };

  const events = await fetchPublicCalendarEvents(fetchImpl, {
    validationOptions: { minimumEventCount: 3 },
  });

  assert.equal(events.length, 3);
  assert.equal(events._calendarSource, 'fallback');
  assert.equal(primaryRequests, 1);
  assert.equal(fallbackRequests, 2);
});

test('primary health probe never masks failure with the fallback origin', async () => {
  const urls = [];
  await assert.rejects(
    probePublicCalendarPrimary(async url => {
      urls.push(String(url));
      return new Response('blocked', { status: 403 });
    }),
    /HTTP 403/,
  );

  assert.equal(urls.length, 1);
  assert.equal(new URL(urls[0]).protocol, 'https:');
  assert.equal(new URL(urls[0]).hostname, 'alhijazindowisata.com');

  await assert.rejects(
    probePublicCalendarPrimary(async () => new Response(PAGE_HTML, { status: 200 })),
    /minimum aman 20/,
  );
  const result = await probePublicCalendarPrimary(
    async () => new Response(PAGE_HTML, { status: 200 }),
    { minimumEventCount: 3 },
  );
  assert.deepEqual(result, { success: true, eventCount: 3 });
});

test('parsePublicEventDetailHTML preserves manasik departure prefix as DD/MM/YYYY package convention', () => {
  const rows = parsePublicEventDetailHTML(MANASIK_MODAL_HTML);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].staff, '-');
  assert.equal(rows[0].jam, '08:00');
  assert.equal(rows[0].paket, "05/07/2026PROMO JUM'ATAIN PLUS TAIF +BADAR 15HR (KERETA CEPAT)");
  assert.equal(rows[0].tour_leader, '• SUSTEN MARYANI MASCIK');
});

test('parsePublicEventDetailHTML rejects tables without required public modal headers', () => {
  assert.throws(
    () => parsePublicEventDetailHTML(`
      <table>
        <thead><tr><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th></tr></thead>
        <tbody><tr><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td></tr></tbody>
      </table>
    `),
    /format tabel detail tidak dikenali/,
  );
});

test('parsePublicEventDetailHTML rejects a partial modal containing a blank core row', () => {
  assert.throws(
    () => parsePublicEventDetailHTML(`
      <table>
        <thead><tr><th>GROUP</th><th>PESAWAT</th><th>WAKTU</th><th>PAKET</th><th>PAX</th></tr></thead>
        <tbody>
          <tr><td>10</td><td>SV 827</td><td>00.40</td><td>REGULER</td><td>40</td></tr>
          <tr><td></td><td>SV 827</td><td>00.40</td><td></td><td>40</td></tr>
        </tbody>
      </table>
    `),
    /format tabel detail tidak dikenali/,
  );
});

test('buildPublicModalUrl encodes public modal query parameters', () => {
  const href = buildPublicModalUrl({ aid: 'M1532', apalah: 'JBU1532,JBU1538,JBU1496' });
  const url = new URL(href);

  assert.equal(url.origin, 'https://alhijazindowisata.com');
  assert.equal(url.pathname, '/jadwal/_kmodal.php');
  assert.equal(url.searchParams.get('.m'), 'M1532');
  assert.equal(url.searchParams.get('.g'), 'JBU1532,JBU1538,JBU1496');
});
