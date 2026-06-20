import { load } from 'cheerio';

export const CALENDAR_PUBLIC_PAGE_URL = process.env.CALENDAR_PUBLIC_PAGE_URL
  || 'https://alhijazindowisata.com/jadwal/kegiatan/alhijaz-indowisata';

export const CALENDAR_PUBLIC_MODAL_BASE_URL = process.env.CALENDAR_PUBLIC_MODAL_BASE_URL
  || 'https://alhijazindowisata.com/jadwal/_kmodal.php';

const BROWSER_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};

// WAF di depan alhijazindowisata.com (101.255.3.160) mem-block IP egress server
// dengan HTTP 403 (sama dgn kasus submit legacy Cloudflare). Origin langsung
// menjawab 200 via plain HTTP + header Host. Set CALENDAR_PUBLIC_ORIGIN_IP=""
// untuk menonaktifkan rewrite dan kembali ke domain ber-WAF.
export const CALENDAR_PUBLIC_ORIGIN_IP = process.env.CALENDAR_PUBLIC_ORIGIN_IP === undefined
  ? '115.124.86.220'
  : process.env.CALENDAR_PUBLIC_ORIGIN_IP.trim();

// Bila origin IP dikonfigurasi, arahkan request ke IP itu via http dan kirim
// Host header asli supaya virtual-host server tetap melayani domain yang benar.
// Mengembalikan { url, headers } siap pakai untuk fetch.
export function applyOriginRewrite(targetUrl, headers = {}) {
  if (!CALENDAR_PUBLIC_ORIGIN_IP) {
    return { url: targetUrl, headers };
  }
  const parsed = new URL(targetUrl);
  const host = parsed.host;
  parsed.protocol = 'http:';
  parsed.host = CALENDAR_PUBLIC_ORIGIN_IP;
  return { url: parsed.toString(), headers: { ...headers, Host: host } };
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const REQUEST_TIMEOUT_MS = parsePositiveInt(process.env.CALENDAR_PUBLIC_REQUEST_TIMEOUT_MS, 45000);
// Origin me-rate-limit (403) saat burst; beri beberapa percobaan dgn backoff
// menaik supaya modal yang kena jendela limit sempat pulih sebelum menyerah.
const DETAIL_MAX_TRIES = 4;
const DETAIL_RETRY_DELAYS_MS = [2000, 4000, 8000];

const INDONESIAN_MONTHS = new Map([
  ['januari', '01'],
  ['februari', '02'],
  ['pebruari', '02'],
  ['maret', '03'],
  ['april', '04'],
  ['mei', '05'],
  ['juni', '06'],
  ['juli', '07'],
  ['agustus', '08'],
  ['september', '09'],
  ['oktober', '10'],
  ['november', '11'],
  ['desember', '12'],
]);

function isIdentifierChar(ch) {
  return /[A-Za-z0-9_$]/.test(ch || '');
}

function skipWhitespace(source, index) {
  let i = index;
  while (i < source.length && /\s/.test(source[i])) i += 1;
  return i;
}

function findEventsArrayStart(source) {
  let quote = null;
  let escaped = false;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }

    if (!source.startsWith('events', i)) continue;
    if (isIdentifierChar(source[i - 1]) || isIdentifierChar(source[i + 6])) continue;

    let j = skipWhitespace(source, i + 6);
    if (source[j] !== ':') continue;
    j = skipWhitespace(source, j + 1);
    if (source[j] === '[') return j;
  }

  return -1;
}

function extractBracketedArray(source, startIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let i = startIndex; i < source.length; i += 1) {
    const ch = source[i];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }

    if (ch === '[') {
      depth += 1;
    } else if (ch === ']') {
      depth -= 1;
      if (depth === 0) return source.slice(startIndex, i + 1);
    }
  }

  return null;
}

export function extractFullCalendarEventsJson(html) {
  const source = String(html || '');
  const startIndex = findEventsArrayStart(source);
  if (startIndex < 0) {
    throw new Error('Calendar publik: events array tidak ditemukan di halaman publik');
  }

  const json = extractBracketedArray(source, startIndex);
  if (!json) {
    throw new Error('Calendar publik: events array tidak ditemukan di halaman publik');
  }

  return json;
}

function detectPublicEventType(event) {
  const title = `${event?.title || ''} ${event?.extendedProps?.mjudul || ''}`.toLowerCase();
  if (title.includes('keberangkatan') || title.includes('berangkat')) return 'keberangkatan';
  if (title.includes('kepulangan') || title.includes('pulang')) return 'kepulangan';
  return 'manasik';
}

function normalizePublicEvent(event) {
  const start = event?.start ? String(event.start).split('T')[0] : '';
  if (!start || start === '0000-00-00' || !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    return null;
  }

  return {
    date: start,
    type: detectPublicEventType(event),
    title: event?.title || '',
    aid: event?.extendedProps?.aid || '',
    apalah: event?.extendedProps?.apalah || '',
    raw: event,
  };
}

export function parsePublicCalendarEventsFromHtml(html) {
  const json = extractFullCalendarEventsJson(html);
  let events;

  try {
    events = JSON.parse(json);
  } catch (err) {
    throw new Error(`Calendar publik: gagal parse events JSON - ${err.message}`);
  }

  if (!Array.isArray(events)) {
    throw new Error('Calendar publik: events array tidak valid di halaman publik');
  }

  return events
    .map(normalizePublicEvent)
    .filter(Boolean);
}

function normalizeCellText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHeaderText(value) {
  return normalizeCellText(value).toUpperCase();
}

function normalizePackageText(value) {
  const text = normalizeCellText(value);
  const match = text.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(.*)$/);
  if (!match) return text;

  const month = INDONESIAN_MONTHS.get(match[2].toLowerCase());
  if (!month) return text;

  const day = match[1].padStart(2, '0');
  const rest = match[4].trimStart();
  return `${day}/${month}/${match[3]}${rest}`;
}

function parsePax(value) {
  const match = String(value || '').match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

function headerIndexes(headers) {
  const indexes = {};

  headers.forEach((header, index) => {
    if (header === 'GROUP' || header === 'GRUP') indexes.group_number = index;
    if (header === 'PESAWAT') indexes.pesawat = index;
    if (header === 'JAM' || header === 'WAKTU') indexes.jam = index;
    if (header === 'PAKET') indexes.paket = index;
    if (header === 'PAX') indexes.pax = index;
    if (header === 'STAFF') indexes.staff = index;
    if (header === 'TL' || header === 'TOUR LEADER') indexes.tour_leader = index;
  });

  return indexes;
}

function hasRequiredDetailHeaders(indexes) {
  return indexes.group_number != null
    && indexes.pesawat != null
    && indexes.jam != null
    && indexes.paket != null
    && indexes.pax != null;
}

function cellText($, cells, index) {
  if (index == null || index < 0 || index >= cells.length) return '';
  return normalizeCellText($(cells[index]).text());
}

function packageCellText($, cells, index) {
  if (index == null || index < 0 || index >= cells.length) return '';
  return normalizePackageText($(cells[index]).text());
}

export function parsePublicEventDetailHTML(html) {
  const $ = load(html);
  const rows = [];
  let sawMalformedDetailTable = false;

  $('table').each((_, table) => {
    const $table = $(table);
    const headers = $table.find('thead th, tr:first-child th')
      .map((__, th) => normalizeHeaderText($(th).text()))
      .get();
    const indexes = headerIndexes(headers);
    if (!hasRequiredDetailHeaders(indexes)) {
      const hasDetailSizedRows = $table.find('tr').toArray()
        .some(tr => $(tr).find('td').length >= 5);
      if (hasDetailSizedRows) sawMalformedDetailTable = true;
      return;
    }

    $table.find('tr').each((__, tr) => {
      if ($(tr).find('th').length > 0) return;

      const cells = $(tr).find('td').toArray();
      if (cells.length < 5) return;

      rows.push({
        group_number: cellText($, cells, indexes.group_number) || null,
        pesawat: cellText($, cells, indexes.pesawat) || null,
        jam: cellText($, cells, indexes.jam) || null,
        paket: packageCellText($, cells, indexes.paket) || null,
        pax: parsePax(cellText($, cells, indexes.pax)),
        staff: cellText($, cells, indexes.staff) || '-',
        tour_leader: cellText($, cells, indexes.tour_leader) || '-',
      });
    });
  });

  if (rows.length === 0 && sawMalformedDetailTable) {
    throw new Error('Calendar publik: format tabel detail tidak dikenali');
  }

  return rows;
}

export function buildPublicModalUrl(event, modalBaseUrl = CALENDAR_PUBLIC_MODAL_BASE_URL) {
  const url = new URL(modalBaseUrl, CALENDAR_PUBLIC_PAGE_URL);
  url.searchParams.set('.m', event?.aid || '');
  url.searchParams.set('.g', event?.apalah || '');
  return url.toString();
}

function timeoutSignal() {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchPublicCalendarEvents(fetchImpl = fetch) {
  const { url, headers } = applyOriginRewrite(CALENDAR_PUBLIC_PAGE_URL, BROWSER_HEADERS);
  const res = await fetchImpl(url, {
    method: 'GET',
    headers,
    signal: timeoutSignal(),
  });

  if (!res.ok) {
    throw new Error(`Kalender publik gagal HTTP ${res.status}`);
  }

  const html = await res.text();
  const events = parsePublicCalendarEventsFromHtml(html);
  console.log(`[Calendar] Parsed ${events.length} public events from kegiatan page`);
  return events;
}

export async function fetchPublicEventDetail(event, fetchImpl = fetch) {
  if (!event?.aid) return [];

  const { url, headers } = applyOriginRewrite(buildPublicModalUrl(event), {
    ...BROWSER_HEADERS,
    Accept: 'text/html, */*',
    Referer: CALENDAR_PUBLIC_PAGE_URL,
    'X-Requested-With': 'XMLHttpRequest',
  });
  let lastErr;

  for (let attempt = 1; attempt <= DETAIL_MAX_TRIES; attempt += 1) {
    try {
      const res = await fetchImpl(url, {
        method: 'GET',
        headers,
        signal: timeoutSignal(),
      });

      if (!res.ok) {
        throw new Error(`modal HTTP ${res.status}`);
      }

      const html = await res.text();
      return parsePublicEventDetailHTML(html);
    } catch (err) {
      lastErr = err;
      if (attempt < DETAIL_MAX_TRIES) {
        const delay = DETAIL_RETRY_DELAYS_MS[attempt - 1] ?? DETAIL_RETRY_DELAYS_MS[DETAIL_RETRY_DELAYS_MS.length - 1];
        await sleep(delay);
      }
    }
  }

  throw new Error(`Detail publik gagal utk ${event.date || '-'}${event.type ? `/${event.type}` : ''}: ${lastErr.message}`);
}
