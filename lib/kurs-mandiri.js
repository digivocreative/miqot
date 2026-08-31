import { load } from 'cheerio';
import { Agent } from 'undici';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export const MANDIRI_KURS_URL = 'https://www.bankmandiri.co.id/kurs';

export const MANDIRI_REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  'Referer': 'https://www.bankmandiri.co.id/',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Ch-Ua': '"Chromium";v="135", "Google Chrome";v="135", "Not-A.Brand";v="8"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Cache-Control': 'no-cache',
};

// Akamai Bot Manager di depan www.bankmandiri.co.id mulai membalas 403 halaman
// "Mandiri Maintenance" untuk klien Node sejak sekitar 25 Agustus 2026. Yang
// dibaca adalah sidik jari TLS-nya, bukan IP dan bukan header: dari mesin yang
// sama, curl tetap 200 sementara fetch()/undici DAN modul https bawaan Node
// dua-duanya 403, apa pun header yang dikirim. Menyusun ulang daftar cipher
// mengikuti urutan Chrome menggeser ClientHello-nya sehingga lolos lagi.
// Kalau suatu saat 403 kembali, yang perlu dicek pertama adalah blok ini.
export const MANDIRI_TLS_CIPHERS = [
  'TLS_AES_128_GCM_SHA256',
  'TLS_AES_256_GCM_SHA384',
  'TLS_CHACHA20_POLY1305_SHA256',
  'ECDHE-ECDSA-AES128-GCM-SHA256',
  'ECDHE-RSA-AES128-GCM-SHA256',
  'ECDHE-ECDSA-AES256-GCM-SHA384',
  'ECDHE-RSA-AES256-GCM-SHA384',
  'ECDHE-ECDSA-CHACHA20-POLY1305',
  'ECDHE-RSA-CHACHA20-POLY1305',
  'ECDHE-RSA-AES128-SHA',
  'ECDHE-RSA-AES256-SHA',
  'AES128-GCM-SHA256',
  'AES256-GCM-SHA384',
  'AES128-SHA',
  'AES256-SHA',
].join(':');

let chromeTlsDispatcher = null;

function getChromeTlsDispatcher() {
  if (!chromeTlsDispatcher) {
    chromeTlsDispatcher = new Agent({ connect: { ciphers: MANDIRI_TLS_CIPHERS } });
  }
  return chromeTlsDispatcher;
}

const runCommandDefault = promisify(execFile);

async function fetchViaUndici({ fetchImpl, dispatcher, url, headers, timeoutMs }) {
  const res = await fetchImpl(url, {
    headers,
    ...(dispatcher ? { dispatcher } : {}),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// curl membawa ClientHello-nya sendiri, yang tidak dikenali sebagai Node — dari
// mesin dan IP yang sama ia tetap 200 saat kedua klien Node dibalas 403. Produksi
// berjalan langsung di VM Ubuntu lewat systemd, bukan di dalam container, jadi
// binary-nya ada. Stderr curl ikut dinaikkan ke pesan galat supaya alert ops
// membawa sebab yang sebenarnya, bukan sekadar "Command failed".
async function fetchViaCurl({ runCommand, url, headers, timeoutMs }) {
  const args = ['-sS', '--compressed', '--fail', '-m', String(Math.ceil(timeoutMs / 1000))];
  for (const [name, value] of Object.entries(headers)) args.push('-H', `${name}: ${value}`);
  args.push(url);

  let stdout;
  try {
    ({ stdout } = await runCommand('curl', args, { maxBuffer: 32 * 1024 * 1024, encoding: 'utf8' }));
  } catch (err) {
    const detail = String(err?.stderr || '').trim() || err?.message || 'sebab tidak diketahui';
    throw new Error(`curl gagal: ${detail}`);
  }
  return stdout;
}

// Urutan ini bukan selera. Dari server produksi percobaan tls-chrome MENGGANTUNG
// sampai timeout penuh, jadi menaruhnya di depan berarti membuang satu timeout
// utuh tiap siklus sebelum sampai ke klien yang berpeluang jalan.
export function createMandiriFetchAttempts({ fetchImpl = fetch, runCommand = runCommandDefault } = {}) {
  return [
    { label: 'curl', run: (opts) => fetchViaCurl({ ...opts, runCommand }) },
    { label: 'tls-chrome', run: (opts) => fetchViaUndici({ ...opts, fetchImpl, dispatcher: getChromeTlsDispatcher() }) },
    { label: 'default', run: (opts) => fetchViaUndici({ ...opts, fetchImpl, dispatcher: null }) },
  ];
}

// Anggaran waktunya SATU untuk seluruh rantai, bukan satu per klien. Tanpa itu,
// tiga klien yang masing-masing menggantung berarti soket dan proses curl
// tertahan jauh lebih lama daripada satu siklus penyegaran.
export async function fetchMandiriKursHtml({
  attempts = createMandiriFetchAttempts(),
  url = MANDIRI_KURS_URL,
  headers = MANDIRI_REQUEST_HEADERS,
  timeoutMs = 12000,
  totalBudgetMs = 20000,
  now = Date.now,
  onAttemptFail = () => {},
} = {}) {
  let lastError = new Error('Tidak ada percobaan fetch kurs yang dikonfigurasi');
  const deadline = now() + totalBudgetMs;

  for (const attempt of attempts) {
    const remaining = deadline - now();
    if (remaining <= 0) {
      onAttemptFail(attempt.label, new Error('anggaran waktu rantai fetch habis'));
      continue;
    }
    try {
      const html = await attempt.run({ url, headers, timeoutMs: Math.min(timeoutMs, remaining) });
      if (!html) throw new Error('badan respons kosong');
      return { html, via: attempt.label };
    } catch (err) {
      lastError = err;
      onAttemptFail(attempt.label, err);
    }
  }

  throw lastError;
}

export const CURRENCY_NAMES = {
  AUD: 'Australian Dollar', CAD: 'Canadian Dollar', CHF: 'Swiss Franc',
  CNY: 'Chinese Yuan', DKK: 'Danish Krone', EUR: 'Euro',
  GBP: 'British Pound', HKD: 'Hong Kong Dollar', JPY: 'Japanese Yen',
  MYR: 'Malaysian Ringgit', NOK: 'Norwegian Krone', NZD: 'New Zealand Dollar',
  SAR: 'Saudi Riyal', SEK: 'Swedish Krona', SGD: 'Singapore Dollar',
  THB: 'Thai Baht', USD: 'US Dollar',
};

function pad2(value) {
  return String(value).padStart(2, '0');
}

function jakartaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find(part => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function parseMandiriTimestamp(updatedAt) {
  const match = String(updatedAt || '').match(/(\d{2})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})\s*WIB/);
  if (!match) return null;
  const [, dd, mm, yy, hh, min] = match;
  const year = 2000 + Number(yy);
  const month = Number(mm);
  const day = Number(dd);
  const hour = Number(hh);
  const minute = Number(min);
  return {
    dateKey: `${year}-${pad2(month)}-${pad2(day)}`,
    timeMs: Date.UTC(year, month - 1, day, hour - 7, minute, 0, 0),
  };
}

export function isKursToday(updatedAt, now = new Date()) {
  const parsed = parseMandiriTimestamp(updatedAt);
  if (!parsed) return false;
  return parsed.dateKey === jakartaDateKey(now);
}

function parseMandiriNumber(text) {
  const cleaned = String(text || '').trim().replace(/[^\d.,]/g, '');
  const parsed = Number.parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function parseTtCounterTimestamp($) {
  const tableText = $('table').first().text().replace(/\s+/g, ' ');
  const tableMatch = tableText.match(/TT\s*Counter\s*(\d{2}\/\d{2}\/\d{2})\s*-\s*(\d{2}:\d{2})\s*WIB/i);
  if (tableMatch) return `${tableMatch[1]} ${tableMatch[2]} WIB`;

  let updatedAt = null;
  $('table thead th, table tr:first-child th').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ');
    const match = text.match(/TT\s*Counter\s*(\d{2}\/\d{2}\/\d{2})\s*-\s*(\d{2}:\d{2})\s*WIB/i);
    if (match) updatedAt = `${match[1]} ${match[2]} WIB`;
  });
  return updatedAt;
}

export function parseMandiriKursHtml(html) {
  const $ = load(html);
  const rates = {};
  const updatedAt = parseTtCounterTimestamp($);

  $('table tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 5) return;

    const currency = $(cells[0]).text().trim().toUpperCase();
    if (!CURRENCY_NAMES[currency]) return;

    const ttJual = parseMandiriNumber($(cells[4]).text());
    if (ttJual != null) rates[currency] = ttJual;
  });

  return { rates, updatedAt };
}

export function shouldReplaceKursCache(currentCache, nextCache) {
  if (!nextCache?.rates || Object.keys(nextCache.rates).length === 0) return false;
  if (!currentCache?.rates || Object.keys(currentCache.rates).length === 0) return true;

  const currentTime = parseMandiriTimestamp(currentCache.updatedAt)?.timeMs;
  const nextTime = parseMandiriTimestamp(nextCache.updatedAt)?.timeMs;
  if (currentTime == null || nextTime == null) return true;

  return nextTime >= currentTime;
}

export function isKursCacheRefreshDue(cache, nowMs = Date.now(), refreshIntervalMs = 30 * 60 * 1000) {
  if (!cache?.rates || Object.keys(cache.rates).length === 0) return true;
  if (!isKursToday(cache.updatedAt, new Date(nowMs))) return true;
  if (!Number.isFinite(cache.fetchedAt)) return true;
  return nowMs - cache.fetchedAt >= refreshIntervalMs;
}

export const KURS_ALERT_RENUDGE_MS = 3 * 24 * 60 * 60 * 1000;

// Kurs pernah beku seminggu penuh tanpa seorang pun tahu (Akamai mulai memblokir
// klien Node, fetch-nya 403 terus, dan kegagalannya hanya mendarat di console).
// Yang dialarmkan HANYA kegagalan fetch/parse. Halaman yang terbaca normal tapi
// tanggalnya belum hari ini itu wajar di akhir pekan dan hari libur — kalau ikut
// dialarmkan, ops kebanjiran notifikasi tiap Sabtu-Minggu lalu berhenti membacanya.
export function decideKursFetchAlert({
  failed,
  alertedAt = null,
  nowMs = Date.now(),
  renudgeMs = KURS_ALERT_RENUDGE_MS,
}) {
  if (failed) {
    if (alertedAt == null) return 'alert';
    return nowMs - alertedAt >= renudgeMs ? 'alert' : 'quiet';
  }
  return alertedAt == null ? 'quiet' : 'recovered';
}

// Permintaan user TIDAK BOLEH menunggu panggilan jaringan keluar selama masih ada
// kurs yang bisa disajikan. Saat Akamai memblokir scrape, setiap GET /api/kurs
// menahan responsnya sampai timeout 15 detik — dan karena widget Kurs digerbangi
// `{kursData && ...}` tanpa skeleton, widgetnya hilang sama sekali dari dashboard.
// Menyajikan kurs basi lalu menyegarkan di latar belakang jauh lebih baik daripada
// menyajikan kekosongan. Hanya cache yang benar-benar kosong yang layak ditunggu.
export function shouldWaitForKursFetch(cache) {
  return !(cache?.rates && Object.keys(cache.rates).length > 0);
}

export const KURS_MIN_ATTEMPT_GAP_MS = 5 * 60 * 1000;

// Jeda minimum antar percobaan fetch keluar, terlepas dari sebasi apa cache-nya.
// isKursCacheRefreshDue() sengaja bernilai true selama data belum terbit hari ini,
// jadi ia sendirian tidak bisa menahan laju percobaan.
export function canAttemptKursFetch(lastAttemptAt, nowMs = Date.now(), minGapMs = KURS_MIN_ATTEMPT_GAP_MS) {
  if (!Number.isFinite(lastAttemptAt)) return true;
  return nowMs - lastAttemptAt >= minGapMs;
}
