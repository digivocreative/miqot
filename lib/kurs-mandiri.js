import { load } from 'cheerio';

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
