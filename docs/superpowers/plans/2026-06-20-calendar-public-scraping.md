# Calendar Public Scraping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Dashboard calendar ingestion for manasik, keberangkatan, and kepulangan with scraping from the public Alhijaz kegiatan calendar page while preserving the existing Dashboard API, database shape, and enrichment behavior.

**Architecture:** Isolate public calendar parsing/fetching in a new `lib/calendar-public-source.js` module, then wire `calendar-api.js` to use that module instead of legacy login, cookies, and `_jmodal.php`. Keep `calendar_events`, `/api/calendar/events`, `UpcomingSchedule`, AI insight, flight status, and existing enrichment code on the same contracts.

**Tech Stack:** Node.js ESM, Express, Supabase JS, Cheerio, node:test, FullCalendar inline JSON parsing, public HTML modal scraping.

---

## File Structure

- Create `lib/calendar-public-source.js`
  - Owns public source URLs, event JSON extraction, event normalization, public modal URL building, modal HTML parsing, and public network fetch helpers.
  - Exports parser functions for tests and fetch functions for `calendar-api.js`.

- Create `tests/calendar-public-source.test.js`
  - Unit tests for public page event parsing, public modal parsing, Indonesian manasik date normalization, and modal URL query params.

- Create `tests/calendar-public-sync.test.js`
  - Integration-style unit test for `syncCalendar` with mocked `global.fetch` and fake Supabase.
  - Proves public page and `_kmodal.php` are used and legacy login URLs are not called.

- Create `tests/calendar-public-source-guard.test.js`
  - Source guard test to ensure `calendar-api.js` no longer contains calendar credential/login code and `server.js` calendar failure alert no longer points operators to credential troubleshooting.

- Modify `calendar-api.js`
  - Remove legacy calendar login, cookie/session import, legacy base constants, legacy page fetch, legacy modal fetch, and inline detail parser.
  - Import `fetchPublicCalendarEvents` and `fetchPublicEventDetail` from `lib/calendar-public-source.js`.
  - Keep `syncCalendar`, `loadScheduleFallbackMap`, stale delete, fallback, enrichment, and return payload semantics.

- Modify `server.js`
  - Update calendar retry comment and ops alert copy so troubleshooting points to the public kegiatan page and `_kmodal.php`, not legacy login credentials.

Do not modify the `calendar_events` schema, Dashboard components, Supabase migrations, agent jamaah sync, AWAPI sync, or haji sync.

Before implementation, run `git status --short` and do not stage unrelated dirty files. Stage exact files in each task.

---

### Task 1: Add Public Source Parser Module

**Files:**
- Create: `tests/calendar-public-source.test.js`
- Create: `lib/calendar-public-source.js`

- [ ] **Step 1: Write failing parser tests**

Create `tests/calendar-public-source.test.js` with:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPublicModalUrl,
  parsePublicCalendarEventsFromHtml,
  parsePublicEventDetailHTML,
} from '../lib/calendar-public-source.js';

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

test('buildPublicModalUrl encodes public modal query parameters', () => {
  const href = buildPublicModalUrl({ aid: 'M1532', apalah: 'JBU1532,JBU1538,JBU1496' });
  const url = new URL(href);

  assert.equal(url.origin, 'https://alhijazindowisata.com');
  assert.equal(url.pathname, '/jadwal/_kmodal.php');
  assert.equal(url.searchParams.get('.m'), 'M1532');
  assert.equal(url.searchParams.get('.g'), 'JBU1532,JBU1538,JBU1496');
});
```

- [ ] **Step 2: Run parser tests and verify they fail**

Run:

```bash
node --test tests/calendar-public-source.test.js
```

Expected: FAIL with `Cannot find module '../lib/calendar-public-source.js'`.

- [ ] **Step 3: Implement the public source module**

Create `lib/calendar-public-source.js` with:

```js
import * as cheerio from 'cheerio';

export const CALENDAR_PUBLIC_PAGE_URL = process.env.CALENDAR_PUBLIC_PAGE_URL || 'https://alhijazindowisata.com/jadwal/kegiatan/alhijaz-indowisata';
export const CALENDAR_PUBLIC_MODAL_BASE_URL = process.env.CALENDAR_PUBLIC_MODAL_BASE_URL || 'https://alhijazindowisata.com/jadwal/_kmodal.php';

const CALENDAR_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const FETCH_TIMEOUT_MS = 15000;

const INDONESIAN_MONTHS = new Map([
  ['JANUARI', '01'],
  ['FEBRUARI', '02'],
  ['MARET', '03'],
  ['APRIL', '04'],
  ['MEI', '05'],
  ['JUNI', '06'],
  ['JULI', '07'],
  ['AGUSTUS', '08'],
  ['SEPTEMBER', '09'],
  ['OKTOBER', '10'],
  ['NOVEMBER', '11'],
  ['DESEMBER', '12'],
]);

function detectPublicEventType(title) {
  const t = String(title || '').toLowerCase();
  if (t.includes('keberangkatan') || t.includes('berangkat')) return 'keberangkatan';
  if (t.includes('kepulangan') || t.includes('pulang')) return 'kepulangan';
  return 'manasik';
}

function normalizeCellText($, cell) {
  return $(cell).text().replace(/\s+/g, ' ').trim();
}

function parseIndonesianDateToDmy(text) {
  const match = String(text || '').trim().match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return null;

  const day = match[1].padStart(2, '0');
  const month = INDONESIAN_MONTHS.get(match[2].toUpperCase());
  const year = match[3];

  return month ? `${day}/${month}/${year}` : null;
}

function normalizePackageCell($, cell) {
  const rawText = normalizeCellText($, cell);
  const dateText = $(cell).find('span').first().text().replace(/\s+/g, ' ').trim();
  const dmy = parseIndonesianDateToDmy(dateText);
  if (!dmy) return rawText || null;

  const packageName = rawText.startsWith(dateText)
    ? rawText.slice(dateText.length).trim()
    : rawText.replace(dateText, '').trim();
  return `${dmy}${packageName}`;
}

export function extractFullCalendarEventsJson(html) {
  const markerMatch = String(html || '').match(/\bevents\s*:/);
  if (!markerMatch) return null;

  const markerIndex = markerMatch.index + markerMatch[0].length;
  const start = html.indexOf('[', markerIndex);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < html.length; i++) {
    const ch = html[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '[') depth++;
    if (ch === ']') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }

  return null;
}

export function parsePublicCalendarEventsFromHtml(html) {
  const eventsJson = extractFullCalendarEventsJson(html);
  if (!eventsJson) {
    throw new Error('Calendar sync: events array tidak ditemukan di halaman publik — layout berubah');
  }

  let events;
  try {
    events = JSON.parse(eventsJson);
  } catch (err) {
    throw new Error(`Calendar sync: gagal parse public events JSON — ${err.message}`);
  }

  if (!Array.isArray(events)) {
    throw new Error('Calendar sync: public events bukan array');
  }

  return events
    .filter(ev => ev?.start && ev.start !== '0000-00-00')
    .map(ev => ({
      date: String(ev.start).split('T')[0],
      type: detectPublicEventType(ev.title),
      title: ev.title || '',
      aid: ev.extendedProps?.aid || '',
      apalah: ev.extendedProps?.apalah || '',
      raw: ev,
    }));
}

export function parsePublicEventDetailHTML(html) {
  const $ = cheerio.load(html);
  const rows = [];

  const headers = $('table th')
    .map((_, th) => $(th).text().replace(/\s+/g, ' ').trim().toUpperCase())
    .get();

  const indexOfHeader = (...names) => headers.findIndex(header => names.includes(header));
  const groupIdx = indexOfHeader('GROUP');
  const pesawatIdx = indexOfHeader('PESAWAT');
  const jamIdx = indexOfHeader('JAM', 'WAKTU');
  const paketIdx = indexOfHeader('PAKET');
  const paxIdx = indexOfHeader('PAX');
  const staffIdx = indexOfHeader('STAFF');
  const tlIdx = indexOfHeader('TL');

  $('table tr').each((_, row) => {
    if ($(row).find('th').length > 0) return;

    const cells = $(row).find('td').toArray();
    if (cells.length < 5) return;

    const textAt = (idx) => idx >= 0 && cells[idx] ? normalizeCellText($, cells[idx]) : null;
    const pax = parseInt(textAt(paxIdx), 10);

    rows.push({
      group_number: textAt(groupIdx) || null,
      pesawat: textAt(pesawatIdx) || null,
      jam: textAt(jamIdx) || null,
      paket: paketIdx >= 0 && cells[paketIdx] ? normalizePackageCell($, cells[paketIdx]) : null,
      pax: Number.isFinite(pax) ? pax : 0,
      staff: textAt(staffIdx) || '-',
      tour_leader: textAt(tlIdx) || '-',
    });
  });

  return rows;
}

export function buildPublicModalUrl(event, modalBaseUrl = CALENDAR_PUBLIC_MODAL_BASE_URL) {
  const url = new URL(modalBaseUrl);
  url.searchParams.set('.m', event?.aid || '');
  url.searchParams.set('.g', event?.apalah || '');
  return url.toString();
}

export async function fetchPublicCalendarEvents(fetchImpl = fetch) {
  const res = await fetchImpl(CALENDAR_PUBLIC_PAGE_URL, {
    method: 'GET',
    headers: {
      'User-Agent': CALENDAR_USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  const html = await res.text();
  if (!res.ok) {
    throw new Error(`Calendar sync: public page HTTP ${res.status}`);
  }

  const events = parsePublicCalendarEventsFromHtml(html);
  console.log(`[Calendar] Parsed ${events.length} events from public FullCalendar page`);
  return events;
}

export async function fetchPublicEventDetail(event, fetchImpl = fetch) {
  if (!event?.aid) return [];

  const detailUrl = buildPublicModalUrl(event);
  const MAX_TRIES = 2;
  let lastErr;

  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    try {
      const res = await fetchImpl(detailUrl, {
        method: 'GET',
        headers: {
          'User-Agent': CALENDAR_USER_AGENT,
          'Accept': 'text/html, */*',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': CALENDAR_PUBLIC_PAGE_URL,
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      const html = await res.text();
      if (!res.ok) throw new Error(`modal publik HTTP ${res.status}`);

      return parsePublicEventDetailHTML(html);
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_TRIES) await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  throw new Error(`Detail publik gagal utk ${event.date}/${event.type}: ${lastErr.message}`);
}
```

- [ ] **Step 4: Run parser tests and verify they pass**

Run:

```bash
node --test tests/calendar-public-source.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit parser module and tests**

Run:

```bash
git add lib/calendar-public-source.js tests/calendar-public-source.test.js
git commit -m "feat(calendar): add public source parser"
```

Expected: commit succeeds and stages no unrelated files.

---

### Task 2: Add Sync Integration Test With Mocked Public Fetch

**Files:**
- Create: `tests/calendar-public-sync.test.js`

- [ ] **Step 1: Write failing sync test**

Create `tests/calendar-public-sync.test.js` with:

```js
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { syncCalendar } from '../calendar-api.js';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

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
  const urls = [];
  global.fetch = async (url) => {
    const href = String(url);
    urls.push(href);

    if (href.includes('/jadwal/kegiatan/alhijaz-indowisata')) {
      return new Response(PUBLIC_PAGE_HTML, { status: 200, headers: { 'content-type': 'text/html' } });
    }
    if (href.includes('/jadwal/_kmodal.php')) {
      return new Response(PUBLIC_MODAL_HTML, { status: 200, headers: { 'content-type': 'text/html' } });
    }

    throw new Error(`unexpected fetch: ${href}`);
  };

  const supabase = createFakeSupabase();
  const result = await syncCalendar(supabase);

  assert.equal(result.success, true);
  assert.equal(result.count, 1);
  assert.equal(supabase.state.upserted.length, 1);
  assert.equal(supabase.state.upserted[0].id, `${SYNC_EVENT_DATE}_keberangkatan_10`);
  assert.equal(supabase.state.upserted[0].event_type, 'keberangkatan');
  assert.equal(supabase.state.upserted[0].jam, '00.40');
  assert.equal(supabase.state.upserted[0].pax, 47);
  assert.equal(supabase.state.updates.some(patch => patch.jadwal_id === 'JBU1532' && patch.pax_terisi === 46), true);

  assert.equal(urls.some(href => href.includes('/jadwal/kegiatan/alhijaz-indowisata')), true);
  assert.equal(urls.some(href => href.includes('/jadwal/_kmodal.php')), true);
  assert.equal(urls.some(href => href.includes('cek_login.php')), false);
  assert.equal(urls.some(href => href.includes('115.124.86.220')), false);
});
```

- [ ] **Step 2: Run sync test and verify it fails on legacy behavior**

Run:

```bash
node --test tests/calendar-public-sync.test.js
```

Expected: FAIL because `syncCalendar` still attempts legacy login before fetching the public page.

- [ ] **Step 3: Do not commit yet**

Keep this failing test uncommitted until Task 3 wires `calendar-api.js` to the public source.

---

### Task 3: Wire `calendar-api.js` To Public Source

**Files:**
- Modify: `calendar-api.js:1-207`
- Modify: `calendar-api.js:242-349`
- Test: `tests/calendar-public-sync.test.js`

- [ ] **Step 1: Replace the file header and imports**

In `calendar-api.js`, replace lines 1-25 with:

```js
/**
 * Calendar API — Scrape calendar events from the public Alhijaz kegiatan page
 *
 * Fetches Manasik/Keberangkatan/Kepulangan events from:
 * https://alhijazindowisata.com/jadwal/kegiatan/alhijaz-indowisata
 *
 * The public page embeds FullCalendar events inline and loads detail tables
 * from /jadwal/_kmodal.php?.m={aid}&.g={apalah}. No legacy login or calendar
 * credential is required for Dashboard calendar ingestion.
 */

import { PDFParse } from 'pdf-parse';
import { matchEventToSchedule, findSiblingKeberangkatan, tokenizeName, overlapScore } from './lib/calendar-jadwal-match.js';
import { buildScheduleFallbackDetails, parseCalendarJadwalIds } from './lib/calendar-schedule-fallback.js';
import { fetchPublicCalendarEvents, fetchPublicEventDetail } from './lib/calendar-public-source.js';
```

- [ ] **Step 2: Delete legacy calendar scraper functions**

In `calendar-api.js`, delete the old legacy-only block from line 27 through line 207:

- `loginInternal`
- `fetchAllCalendarEvents`
- `detectEventType`
- `fetchEventDetail`
- `parseEventDetailHTML`

After deletion, `loadScheduleFallbackMap` should be the first function after the imports.

- [ ] **Step 3: Replace the login and page-fetch block in `syncCalendar`**

In `syncCalendar`, replace the old login/page-fetch section around lines 246-262:

```js
  let cookie;
  try {
    cookie = await loginInternal();
    console.log('[Calendar] Login successful');
  } catch (err) {
    console.error('[Calendar] Login failed:', err.message);
    return { success: false, error: err.message };
  }

  // Fetch ALL events from the calendar page (they're all pre-loaded)
  let calendarEvents;
  try {
    calendarEvents = await fetchAllCalendarEvents(cookie);
  } catch (err) {
    console.error('[Calendar] Page fetch failed:', err.message);
    return { success: false, error: err.message };
  }
```

with:

```js
  // Fetch ALL events from the public kegiatan page. The public page preloads
  // the FullCalendar array, so this no longer needs legacy login credentials.
  let calendarEvents;
  try {
    calendarEvents = await fetchPublicCalendarEvents();
  } catch (err) {
    console.error('[Calendar] Public page fetch failed:', err.message);
    return { success: false, error: err.message };
  }
```

- [ ] **Step 4: Update the zero-event error text**

In `syncCalendar`, replace:

```js
    return { success: false, error: 'sumber tidak memuat event sama sekali — layout/login berubah?' };
```

with:

```js
    return { success: false, error: 'sumber publik tidak memuat event sama sekali — layout halaman berubah?' };
```

- [ ] **Step 5: Replace the detail fetch call**

In `syncCalendar`, replace:

```js
      details = await fetchEventDetail(cookie, event);
    } catch (err) {
      if (err.sessionExpired) throw err; // fatal — caller retry run penuh dengan login baru
      failedEventKeys.add(`${event.date}_${event.type}`);
      console.warn(`[Calendar] ${err.message} — baris lama event ini dipertahankan`);
      detailsFetched++;
      continue;
    }
```

with:

```js
      details = await fetchPublicEventDetail(event);
    } catch (err) {
      failedEventKeys.add(`${event.date}_${event.type}`);
      console.warn(`[Calendar] ${err.message} — baris lama event ini dipertahankan`);
      detailsFetched++;
      continue;
    }
```

- [ ] **Step 6: Update empty-detail comment**

In `syncCalendar`, replace:

```js
        // "no data!" dari modal legacy berarti detail tidak bisa dipercaya.
```

with:

```js
        // Detail kosong dari modal publik berarti detail tidak bisa dipercaya.
```

- [ ] **Step 7: Run parser and sync tests**

Run:

```bash
node --test tests/calendar-public-source.test.js tests/calendar-public-sync.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit public sync wiring**

Run:

```bash
git add calendar-api.js tests/calendar-public-sync.test.js
git commit -m "feat(calendar): switch sync to public source"
```

Expected: commit succeeds and stages no unrelated files.

---

### Task 4: Add Source Guard Test And Update Ops Alert Copy

**Files:**
- Create: `tests/calendar-public-source-guard.test.js`
- Modify: `server.js:16680-16764`

- [ ] **Step 1: Write failing source guard test**

Create `tests/calendar-public-source-guard.test.js` with:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('calendar-api no longer uses legacy calendar login or credentials', () => {
  const src = readFileSync(new URL('../calendar-api.js', import.meta.url), 'utf8');
  const forbidden = [
    'CALENDAR_USERNAME',
    'CALENDAR_PASSWORD',
    'CALENDAR_KANTOR',
    'INTERNAL_API_BASE',
    'loginInternal',
    'cek_login.php',
    'pages/main.php?route=home',
    'pages/_jmodal.php',
    'buildCookieString',
    'isSessionExpiredHtml',
  ];

  for (const text of forbidden) {
    assert.doesNotMatch(src, new RegExp(escapeRegExp(text)), `calendar-api.js still contains ${text}`);
  }

  assert.match(src, /fetchPublicCalendarEvents/);
  assert.match(src, /fetchPublicEventDetail/);
});

test('calendar ops alert points to public calendar source instead of legacy credentials', () => {
  const src = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const calendarSection = src.slice(src.indexOf('// ── Calendar sync:'), src.indexOf('// ── Itinerary background sync:'));

  assert.doesNotMatch(calendarSection, /kredensial kalender|login legacy|server legacy down/);
  assert.match(calendarSection, /halaman publik kegiatan/);
  assert.match(calendarSection, /_kmodal\.php/);
});
```

- [ ] **Step 2: Run source guard and verify it fails on alert copy**

Run:

```bash
node --test tests/calendar-public-source-guard.test.js
```

Expected: FAIL because `server.js` still mentions legacy credentials in the calendar ops alert.

- [ ] **Step 3: Update calendar retry comments and alert copy**

In `server.js`, replace the comment around lines 16680-16684:

```js
// ── Calendar sync: every 12 hours (shared data, doesn't change often) ──
// Resiliensi (insiden 12 Jun 2026 — sync gagal diam-diam 18 jam, grup basi):
// gagal → retry +10m lalu +30m (login baru tiap attempt); 3x gagal → ops alert
// sekali per insiden + notifikasi saat pulih; last_success_at/last_error
// dicatat di calendar_insights utk observability.
```

with:

```js
// ── Calendar sync: every 12 hours (shared data, doesn't change often) ──
// Resiliensi (insiden 12 Jun 2026 — sync gagal diam-diam 18 jam, grup basi):
// gagal → retry +10m lalu +30m (fetch publik ulang tiap attempt); 3x gagal
// → ops alert sekali per insiden + notifikasi saat pulih; last_success_at/
// last_error dicatat di calendar_insights utk observability.
```

Then replace the alert text around line 16762:

```js
      `Data kalender (event, grup, jam) membeku sampai sync pulih — card penerbangan ikut terdampak. ` +
      `Cek: login legacy (kredensial kalender), layout halaman, atau server legacy down.`
```

with:

```js
      `Data kalender (event, grup, jam) membeku sampai sync pulih — card penerbangan ikut terdampak. ` +
      `Cek: halaman publik kegiatan, endpoint _kmodal.php, layout halaman, atau koneksi ke server publik.`
```

- [ ] **Step 4: Run source guard test**

Run:

```bash
node --test tests/calendar-public-source-guard.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit guard and alert update**

Run:

```bash
git add tests/calendar-public-source-guard.test.js
git add -p server.js
git diff --cached --stat
git commit -m "test(calendar): guard public source switch"
```

Expected: staged diff includes the new guard test and only the calendar alert-copy hunk from `server.js`; commit succeeds and stages no unrelated files.

---

### Task 5: Run Targeted Regression Tests

**Files:**
- Test only; no file changes expected.

- [ ] **Step 1: Run all calendar parser, sync, fallback, and matching tests**

Run:

```bash
node --test \
  tests/calendar-public-source.test.js \
  tests/calendar-public-sync.test.js \
  tests/calendar-public-source-guard.test.js \
  tests/calendar-api-fallback.test.js \
  tests/calendar-jadwal-match.test.js
```

Expected: PASS.

- [ ] **Step 2: Run related flight and MCP tests that consume calendar data**

Run:

```bash
node --test tests/flight-jamaah.test.js tests/mcp-server.test.js
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: Vite and function bundles build successfully.

- [ ] **Step 4: Commit no-op verification status**

Run:

```bash
git status --short
```

Expected: no uncommitted changes from this task. Do not create a commit for this task.

---

### Task 6: Live Public Source Probe

**Files:**
- Test only; no file changes expected.

- [ ] **Step 1: Probe the live public page and one detail modal per type**

Run:

```bash
node --input-type=module - <<'NODE'
import { fetchPublicCalendarEvents, fetchPublicEventDetail } from './lib/calendar-public-source.js';

const events = await fetchPublicCalendarEvents();
const counts = events.reduce((acc, ev) => {
  acc[ev.type] = (acc[ev.type] || 0) + 1;
  return acc;
}, {});

console.log(JSON.stringify({ total: events.length, counts }, null, 2));

for (const type of ['manasik', 'keberangkatan', 'kepulangan']) {
  const event = events.find(ev => ev.type === type && ev.aid && ev.apalah);
  if (!event) throw new Error(`No sample event for ${type}`);
  const details = await fetchPublicEventDetail(event);
  console.log(JSON.stringify({
    type,
    date: event.date,
    aid: event.aid,
    detailRows: details.length,
    firstDetail: details[0] || null,
  }, null, 2));
  if (details.length === 0) throw new Error(`No detail rows for ${type} sample`);
}
NODE
```

Expected:

- `total` is greater than `0`.
- `counts.manasik`, `counts.keberangkatan`, and `counts.kepulangan` are all greater than `0`.
- Each sample prints `detailRows` greater than `0`.
- No URL containing `115.124.86.220` is fetched.

- [ ] **Step 2: Record live source count in the implementation notes**

Append one concise line to the final implementation summary after execution:

```text
Live public source probe: <total> events; manasik=<n>, keberangkatan=<n>, kepulangan=<n>; sample detail rows loaded for all three types.
```

---

### Task 7: Optional Configured Supabase Sync Smoke

**Files:**
- Runtime verification only; no file changes expected.

Run this task only after Tasks 1-6 pass. It writes to the configured `calendar_events` table, so confirm the current `.env` points to the intended environment before running.

- [ ] **Step 1: Run a one-shot calendar sync against configured Supabase**

Run:

```bash
node --input-type=module - <<'NODE'
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { syncCalendar } from './calendar-api.js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for this smoke test');
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const result = await syncCalendar(supabase);
console.log(JSON.stringify(result, null, 2));
if (!result?.success) process.exit(1);
NODE
```

Expected: JSON result has `"success": true`, `count` greater than `0`, and `failedEvents` present.

- [ ] **Step 2: Check the Dashboard calendar API for the current month**

Use a valid Dashboard bearer token from the local logged-in browser session and run:

```bash
TOKEN='<dashboard bearer token>'
MONTH="$(TZ=Asia/Jakarta date +%-m)"
YEAR="$(TZ=Asia/Jakarta date +%Y)"
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/calendar/events?month=${MONTH}&year=${YEAR}" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s); console.log(JSON.stringify({success:j.success, events:j.data?.events?.length || 0, lastSync:j.data?.lastSync || null}, null, 2)); if(!j.success) process.exit(1);})"
```

Expected: `success` is `true`, `lastSync` is non-null, and `events` is a number.

- [ ] **Step 3: Browser smoke on Dashboard**

Open `http://localhost:5173/dashboard` in the already logged-in browser session and verify:

- Calendar card renders.
- Month navigation still works.
- Dates with events show colored dots.
- Tapping an event date opens the bottom sheet.
- Bottom sheet has rows for Berangkat, Pulang, or Manasik when data exists.
- PAX displays a number.
- AI insight bar still appears when cached insight data exists.

Do not commit from this task.

---

## Final Verification Checklist

Run these commands before reporting completion:

```bash
node --test \
  tests/calendar-public-source.test.js \
  tests/calendar-public-sync.test.js \
  tests/calendar-public-source-guard.test.js \
  tests/calendar-api-fallback.test.js \
  tests/calendar-jadwal-match.test.js \
  tests/flight-jamaah.test.js \
  tests/mcp-server.test.js
```

```bash
npm run build
```

```bash
node --input-type=module - <<'NODE'
import { fetchPublicCalendarEvents, fetchPublicEventDetail } from './lib/calendar-public-source.js';
const events = await fetchPublicCalendarEvents();
const counts = events.reduce((acc, ev) => (acc[ev.type] = (acc[ev.type] || 0) + 1, acc), {});
console.log(JSON.stringify({ total: events.length, counts }, null, 2));
for (const type of ['manasik', 'keberangkatan', 'kepulangan']) {
  const event = events.find(ev => ev.type === type && ev.aid && ev.apalah);
  const details = await fetchPublicEventDetail(event);
  console.log(`${type}: ${event.date} ${event.aid} rows=${details.length}`);
  if (!details.length) process.exit(1);
}
NODE
```

Expected final state:

- Dashboard calendar sync no longer imports or references calendar legacy credentials.
- Public source parser tests pass.
- `syncCalendar` mocked test proves public page and `_kmodal.php` are used.
- Existing fallback/matching tests pass.
- Build succeeds.
- Live public source probe returns non-zero events and detail rows for all three event types.
