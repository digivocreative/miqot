import { load } from 'cheerio';
import { Agent } from 'undici';
import { validatePublicCalendarSnapshot } from './calendar-public-snapshot.js';

export const CALENDAR_PUBLIC_PAGE_URL = process.env.CALENDAR_PUBLIC_PAGE_URL
  || 'https://alhijazindowisata.com/jadwal/kegiatan/alhijaz-indowisata';

export const CALENDAR_PUBLIC_MODAL_BASE_URL = process.env.CALENDAR_PUBLIC_MODAL_BASE_URL
  || 'https://alhijazindowisata.com/jadwal/_kmodal.php';

const BROWSER_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};

// Origin aktif membawa data terbaru (termasuk MUTAWIF), tetapi WAF-nya dapat
// memblokir IP egress aplikasi. Tetap prioritaskan TLS hostname resmi, lalu
// gunakan origin lama sebagai failover agar event/grup/jam tidak membeku.
export const CALENDAR_PUBLIC_ORIGIN_IP = '101.255.3.160';
export const CALENDAR_PUBLIC_FALLBACK_ORIGIN_IP = process.env.CALENDAR_PUBLIC_FALLBACK_ORIGIN_IP === undefined
  ? '115.124.86.220'
  : process.env.CALENDAR_PUBLIC_FALLBACK_ORIGIN_IP.trim();

export function calendarPublicOriginLookup(_hostname, options, callback) {
  const address = { address: CALENDAR_PUBLIC_ORIGIN_IP, family: 4 };
  if (options?.all) {
    callback(null, [address]);
    return;
  }
  callback(null, address.address, address.family);
}

export function calendarPublicFallbackOriginLookup(_hostname, options, callback) {
  const address = { address: CALENDAR_PUBLIC_FALLBACK_ORIGIN_IP, family: 4 };
  if (options?.all) {
    callback(null, [address]);
    return;
  }
  callback(null, address.address, address.family);
}

const CALENDAR_PUBLIC_DISPATCHER = new Agent({
  connect: { lookup: calendarPublicOriginLookup },
});
const CALENDAR_PUBLIC_FALLBACK_DISPATCHER = new Agent({
  connect: { lookup: calendarPublicFallbackOriginLookup },
});

export function applyCalendarFallbackOrigin(targetUrl, headers = {}) {
  if (!CALENDAR_PUBLIC_FALLBACK_ORIGIN_IP) return null;

  const parsed = new URL(targetUrl);
  parsed.protocol = 'http:';
  return {
    url: parsed.toString(),
    headers: { ...headers },
  };
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const REQUEST_TIMEOUT_MS = parsePositiveInt(process.env.CALENDAR_PUBLIC_REQUEST_TIMEOUT_MS, 45000);
const PRIMARY_ORIGIN_COOLDOWN_MS = parsePositiveInt(
  process.env.CALENDAR_PUBLIC_ORIGIN_COOLDOWN_MS,
  30 * 60 * 1000,
);
const PRIMARY_TRANSIENT_COOLDOWN_MS = parsePositiveInt(
  process.env.CALENDAR_PUBLIC_TRANSIENT_COOLDOWN_MS,
  60 * 1000,
);
// HTTP 403 primary bersifat deterministik untuk egress yang diblokir sehingga
// langsung failover; 403 dari fallback dapat berupa rate-limit dan tetap retry.
const REQUEST_MAX_TRIES = 4;
const REQUEST_RETRY_DELAYS_MS = [2000, 4000, 8000];
const primaryBlockedUntilByFetch = new WeakMap();

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
    if (['MUTAWIF', 'MUTHAWIF', 'MUTHOWIF'].includes(header)) indexes.mutawif = index;
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
  let sawInvalidDetailRow = false;

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

      const row = {
        group_number: cellText($, cells, indexes.group_number) || null,
        pesawat: cellText($, cells, indexes.pesawat) || null,
        jam: cellText($, cells, indexes.jam) || null,
        paket: packageCellText($, cells, indexes.paket) || null,
        pax: parsePax(cellText($, cells, indexes.pax)),
        staff: cellText($, cells, indexes.staff) || '-',
        mutawif: cellText($, cells, indexes.mutawif) || '-',
        tour_leader: cellText($, cells, indexes.tour_leader) || '-',
      };
      if (!row.group_number || !row.paket || !row.pesawat) {
        sawInvalidDetailRow = true;
        return;
      }
      Object.defineProperty(row, '_mutawifSourceAvailable', {
        value: indexes.mutawif != null,
        enumerable: false,
      });
      rows.push(row);
    });
  });

  if (sawInvalidDetailRow || (rows.length === 0 && sawMalformedDetailTable)) {
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

function httpError(status) {
  const error = new Error(`HTTP ${status}`);
  error.status = status;
  return error;
}

function isRetryableRequestError(error, target) {
  if (error?.tryCalendarFallbackOnly) return false;
  if (!Number.isInteger(error?.status)) return true;
  if (!target.primary && error.status === 403) return true;
  return error.status === 408
    || error.status === 425
    || error.status === 429
    || error.status >= 500;
}

function primaryOriginIsCoolingDown(fetchImpl) {
  if (!CALENDAR_PUBLIC_FALLBACK_ORIGIN_IP) return false;
  return (primaryBlockedUntilByFetch.get(fetchImpl) || 0) > Date.now();
}

function shouldOpenPrimaryCircuit(error) {
  if (error?.tryCalendarFallbackOnly) return false;
  if (!Number.isInteger(error?.status)) return true;
  return error.status === 403
    || error.status === 408
    || error.status === 425
    || error.status === 429
    || error.status >= 500;
}

function markPrimaryOriginBlocked(fetchImpl, error) {
  if (!CALENDAR_PUBLIC_FALLBACK_ORIGIN_IP || !shouldOpenPrimaryCircuit(error)) return;

  const wasBlocked = primaryOriginIsCoolingDown(fetchImpl);
  const cooldownMs = error?.status === 403
    ? PRIMARY_ORIGIN_COOLDOWN_MS
    : PRIMARY_TRANSIENT_COOLDOWN_MS;
  primaryBlockedUntilByFetch.set(fetchImpl, Date.now() + cooldownMs);
  if (!wasBlocked) {
    const reason = Number.isInteger(error?.status) ? `HTTP ${error.status}` : error?.message || 'network error';
    console.warn(
      `[Calendar] Origin utama ${CALENDAR_PUBLIC_ORIGIN_IP} gagal (${reason}); `
      + `failover ke ${CALENDAR_PUBLIC_FALLBACK_ORIGIN_IP} selama ${Math.round(cooldownMs / 60000)} menit`,
    );
  }
}

async function fetchCalendarResponse(target, fetchImpl) {
  const res = await fetchImpl(target.url, {
    ...target.options,
    signal: timeoutSignal(),
  });

  if (!res.ok) {
    if (typeof res.body?.cancel === 'function') {
      try { await res.body.cancel(); } catch { /* ignore response cleanup failure */ }
    }
    throw httpError(res.status);
  }

  return res;
}

async function fetchFromCalendarOrigins(
  url,
  options,
  fetchImpl,
  label,
  parseResponse = async response => response,
  { forceFallback = false } = {},
) {
  const fallback = applyCalendarFallbackOrigin(url, options.headers);
  const lastErrorBySource = new Map();
  let attemptsMade = 0;
  let recoverablePrimaryValue = null;

  for (let attempt = 1; attempt <= REQUEST_MAX_TRIES; attempt += 1) {
    attemptsMade = attempt;
    const targets = [];
    if (!forceFallback && !primaryOriginIsCoolingDown(fetchImpl)) {
      targets.push({
        source: `origin utama ${CALENDAR_PUBLIC_ORIGIN_IP}`,
        primary: true,
        url,
        options: { ...options, dispatcher: CALENDAR_PUBLIC_DISPATCHER },
      });
    }
    if (fallback) {
      targets.push({
        source: `fallback ${CALENDAR_PUBLIC_FALLBACK_ORIGIN_IP}`,
        primary: false,
        url: fallback.url,
        options: {
          ...options,
          headers: fallback.headers,
          dispatcher: CALENDAR_PUBLIC_FALLBACK_DISPATCHER,
        },
      });
    }

    const roundErrors = [];
    for (const target of targets) {
      try {
        const response = await fetchCalendarResponse(target, fetchImpl);
        const value = await parseResponse(response, target);
        return { value, source: target.primary ? 'primary' : 'fallback' };
      } catch (error) {
        if (error?.tryCalendarFallbackOnly) {
          recoverablePrimaryValue = error.recoverableCalendarValue;
        }
        lastErrorBySource.set(target.source, error);
        roundErrors.push({ error, target });
        if (target.primary) markPrimaryOriginBlocked(fetchImpl, error);
      }
    }

    const shouldRetry = roundErrors.some(({ error, target }) => isRetryableRequestError(error, target));
    if (!shouldRetry || attempt >= REQUEST_MAX_TRIES) break;

    if (attempt < REQUEST_MAX_TRIES) {
      const delay = REQUEST_RETRY_DELAYS_MS[attempt - 1]
        ?? REQUEST_RETRY_DELAYS_MS[REQUEST_RETRY_DELAYS_MS.length - 1];
      await sleep(delay);
    }
  }

  if (recoverablePrimaryValue !== null) {
    return { value: recoverablePrimaryValue, source: 'primary' };
  }

  const errors = [...lastErrorBySource]
    .map(([source, error]) => `${source}: ${error?.message || 'unknown error'}`)
    .join('; ');
  throw new Error(`${label} gagal setelah ${attemptsMade} percobaan: ${errors || 'tidak ada origin tersedia'}`);
}

export async function probePublicCalendarPrimary(fetchImpl = fetch, validationOptions) {
  const response = await fetchCalendarResponse({
    url: CALENDAR_PUBLIC_PAGE_URL,
    options: {
      method: 'GET',
      headers: BROWSER_HEADERS,
      dispatcher: CALENDAR_PUBLIC_DISPATCHER,
    },
  }, fetchImpl);
  const events = parsePublicCalendarEventsFromHtml(await response.text());
  const snapshotError = validatePublicCalendarSnapshot(events, validationOptions);
  if (snapshotError) throw new Error(`snapshot primary tidak lengkap: ${snapshotError}`);
  primaryBlockedUntilByFetch.delete(fetchImpl);
  return { success: true, eventCount: events.length };
}

export async function fetchPublicCalendarEvents(
  fetchImpl = fetch,
  { forceFallback = false, validationOptions } = {},
) {
  const { value: events, source } = await fetchFromCalendarOrigins(
    CALENDAR_PUBLIC_PAGE_URL,
    { method: 'GET', headers: BROWSER_HEADERS },
    fetchImpl,
    'Halaman kalender publik',
    async response => {
      const parsedEvents = parsePublicCalendarEventsFromHtml(await response.text());
      const snapshotError = validatePublicCalendarSnapshot(parsedEvents, validationOptions);
      if (snapshotError) throw new Error(`snapshot tidak lengkap: ${snapshotError}`);
      return parsedEvents;
    },
    { forceFallback },
  );

  Object.defineProperty(events, '_calendarSource', {
    value: source,
    enumerable: false,
  });
  console.log(`[Calendar] Parsed ${events.length} public events from kegiatan page`);
  return events;
}

export async function fetchPublicEventDetail(
  event,
  fetchImpl = fetch,
  { forceFallback = false } = {},
) {
  if (!event?.aid) return [];

  const canonicalUrl = buildPublicModalUrl(event);
  const canonicalHeaders = {
    ...BROWSER_HEADERS,
    Accept: 'text/html, */*',
    Referer: CALENDAR_PUBLIC_PAGE_URL,
    'X-Requested-With': 'XMLHttpRequest',
  };
  const label = `Detail publik ${event.date || '-'}${event.type ? `/${event.type}` : ''}`;
  const { value: rows, source } = await fetchFromCalendarOrigins(
    canonicalUrl,
    { method: 'GET', headers: canonicalHeaders },
    fetchImpl,
    label,
    async (response, target) => {
      const parsedRows = parsePublicEventDetailHTML(await response.text());
      if (target.primary && parsedRows.length === 0 && CALENDAR_PUBLIC_FALLBACK_ORIGIN_IP) {
        const error = new Error('detail primary kosong; mencoba fallback');
        error.tryCalendarFallbackOnly = true;
        error.recoverableCalendarValue = parsedRows;
        throw error;
      }
      return parsedRows;
    },
    { forceFallback },
  );
  Object.defineProperty(rows, '_calendarSource', {
    value: source,
    enumerable: false,
  });
  return rows;
}
