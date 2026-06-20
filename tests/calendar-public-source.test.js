import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyOriginRewrite,
  buildPublicModalUrl,
  parsePublicCalendarEventsFromHtml,
  parsePublicEventDetailHTML,
  CALENDAR_PUBLIC_ORIGIN_IP,
} from '../lib/calendar-public-source.js';

test('applyOriginRewrite mengarahkan ke origin IP via http + Host header', () => {
  // Default origin IP aktif (env tidak di-set kosong di file ini).
  assert.equal(CALENDAR_PUBLIC_ORIGIN_IP, '115.124.86.220');

  const { url, headers } = applyOriginRewrite(
    'https://alhijazindowisata.com/jadwal/_kmodal.php?.m=B1&.g=G1',
    { 'User-Agent': 'x' },
  );
  const parsed = new URL(url);
  assert.equal(parsed.protocol, 'http:');
  assert.equal(parsed.host, '115.124.86.220');
  assert.equal(parsed.pathname, '/jadwal/_kmodal.php');
  assert.equal(parsed.searchParams.get('.m'), 'B1');
  assert.equal(headers.Host, 'alhijazindowisata.com');
  assert.equal(headers['User-Agent'], 'x');
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
    tour_leader: '• SUSTEN MARYANI MASCIK',
  });
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

test('buildPublicModalUrl encodes public modal query parameters', () => {
  const href = buildPublicModalUrl({ aid: 'M1532', apalah: 'JBU1532,JBU1538,JBU1496' });
  const url = new URL(href);

  assert.equal(url.origin, 'https://alhijazindowisata.com');
  assert.equal(url.pathname, '/jadwal/_kmodal.php');
  assert.equal(url.searchParams.get('.m'), 'M1532');
  assert.equal(url.searchParams.get('.g'), 'JBU1532,JBU1538,JBU1496');
});
