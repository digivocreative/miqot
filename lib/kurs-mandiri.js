import { load } from 'cheerio';

// Sumbernya bukan lagi www.bankmandiri.co.id. Akamai Bot Manager di depan situs
// itu memblokir egress VPS produksi berdasarkan reputasi IP — dari sana curl pun
// ditolak — dan seluruh mesin penyamar sidik jari TLS yang dulu menghuni berkas
// ini tidak pernah bisa mengalahkannya. kursdollar.org menayangkan tabel Mandiri
// yang sama di atas LiteSpeed polos tanpa bot gate: 200 bahkan tanpa
// User-Agent, jadi satu fetch biasa sudah cukup.
//
// Kolom yang dibaca adalah DD/TT, dan itu bukan tebakan: pada 1 Sep 2026 seri
// DD/TT kursdollar (USD 17820, SAR 4918, SGD 14099) sama persis dengan TT
// Counter di halaman Mandiri sendiri, di dua tanggal berturut-turut.
export const KURS_SOURCE_URL = 'https://kursdollar.org/bank/mandiri.php';

export const KURS_REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
};

// Pagunya tetap dijaga meski rantainya sudah tunggal: sumber yang menggantung
// tidak boleh menahan soket lebih lama daripada satu siklus penyegaran.
export async function fetchKursHtml({
  url = KURS_SOURCE_URL,
  headers = KURS_REQUEST_HEADERS,
  timeoutMs = 12000,
  fetchImpl = fetch,
} = {}) {
  const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  if (!html) throw new Error('badan respons kosong');
  return { html, via: 'kursdollar' };
}

// kursdollar hanya menerbitkan 14 mata uang. CHF, DKK, NOK dan SEK yang dulu
// ikut tayang sengaja dibuang: menayangkan mata uang yang sumbernya tidak punya
// berarti angka beku yang menyamar segar.
export const CURRENCY_NAMES = {
  AUD: 'Australian Dollar', CAD: 'Canadian Dollar', CNY: 'Chinese Yuan',
  EUR: 'Euro', GBP: 'British Pound', HKD: 'Hong Kong Dollar',
  JPY: 'Japanese Yen', KRW: 'South Korean Won', MYR: 'Malaysian Ringgit',
  NZD: 'New Zealand Dollar', SAR: 'Saudi Riyal', SGD: 'Singapore Dollar',
  THB: 'Thai Baht', USD: 'US Dollar',
};

// Baris `kurs_cache` bisa ditulis oleh deploy yang lebih lama dan membawa mata
// uang yang build ini sudah buang. Cache tidak boleh bisa memperkenalkan kembali
// apa yang sumbernya tak punya lagi, jadi setiap rate yang masuk dari sana
// disaring lewat CURRENCY_NAMES dulu.
export function pickSupportedRates(rates) {
  const out = {};
  if (!rates || typeof rates !== 'object') return out;
  for (const [code, value] of Object.entries(rates)) {
    if (!CURRENCY_NAMES[code]) continue;
    if (!Number.isFinite(value)) continue;
    out[code] = value;
  }
  return out;
}

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

function parseKursNumber(text) {
  // Sel kursdollar membawa delta harian di dalam kurung: "17.820,00 (+ 40,00)".
  // Kurung itu dibuang lebih dulu — tanpa ini angka perubahan ikut terbaca.
  const cleaned = String(text || '').split('(')[0].replace(/[^\d.,-]/g, '').trim();
  if (!cleaned) return null;
  const parsed = Number.parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

// "Selasa 01/09/2026 10:10" -> "01/09/26 10:10 WIB". Normalisasi ini yang
// membuat pergantian sumber tidak menyentuh satu pun kode hilir: isKursToday,
// shouldReplaceKursCache, penanda stale dan kartu share semuanya membaca
// format lama itu.
function normaliseKursdollarStamp(text) {
  // \s* dan bukan \s+: cheerio merapatkan teks anak elemen tanpa sisipan spasi,
  // jadi sel yang terbaca mata sebagai "Selasa 01/09/2026 10:10" sampai ke sini
  // sebagai "Selasa 01/09/202610:10".
  const match = String(text || '').match(/(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, dd, mm, yyyy, hh, mi] = match;
  return `${dd}/${mm}/${yyyy.slice(2)} ${hh}:${mi} WIB`;
}

// Halaman kursdollar adalah SATU tabel yang memuat tiga seksi berurutan — Bank
// Notes, DD/TT, Special Rate — dipisahkan baris satu-sel. Yang kita mau cuma
// DD/TT, dan salah seksi adalah mode gagal paling berbahaya di sini: pada
// halaman 1 Sep 2026, Bank Notes tanggal 01/09 identik dengan DD/TT tanggal
// 31/08 di SEMUA mata uang, jadi angkanya akan tampak wajar dan lolos tanpa
// gejala apa pun. Karena itu parser ini tidak pernah menebak: kalau seksi
// DD/TT tidak ketemu, ia pulang dengan tangan kosong dan membiarkan alarm ops
// yang bicara.
export function parseKursdollarHtml(html) {
  const $ = load(html);
  const rows = [];
  $('table tr').each((_, tr) => {
    const cells = $(tr).find('th, td')
      .map((__, cell) => $(cell).text().replace(/\s+/g, ' ').trim())
      .get();
    if (cells.length) rows.push(cells);
  });

  const rates = {};
  let inDdTt = false;
  let columns = null;
  let stamp = null;

  for (const cells of rows) {
    if (cells.length === 1) {
      if (!cells[0]) continue;
      if (inDdTt) break; // penanda seksi berikutnya; jangan menyerempet tetangga
      inDdTt = /^DD\s*\/\s*TT$/i.test(cells[0]);
      columns = null;
      continue;
    }
    if (!inDdTt) continue;

    if (/tanggal\s*update/i.test(cells[0])) {
      // Mata uang dipetakan dari header seksi, bukan dari posisi kolom tetap:
      // urutan kursdollar berbeda dari Mandiri dan bisa bergeser kapan saja.
      columns = cells.map(cell => (cell.match(/\(\s*([A-Z]{3})\s*\)/) || [])[1] || null);
      continue;
    }
    if (!columns) continue;

    // Baris bertanggal adalah "Beli" dan menggeser seluruh kolom satu langkah;
    // yang dipakai dashboard adalah "Jual" tepat di bawahnya.
    const dated = normaliseKursdollarStamp(cells[0]);
    if (dated) {
      if (stamp) break; // blok tanggal terbaru sudah lewat tanpa baris Jual
      stamp = dated;
      continue;
    }
    if (!stamp || !/^jual$/i.test(cells[0])) continue;

    for (let i = 1; i < columns.length; i += 1) {
      const code = columns[i];
      if (!code || !CURRENCY_NAMES[code]) continue;
      const value = parseKursNumber(cells[i]);
      if (value != null) rates[code] = value;
    }
    break;
  }

  return { rates, updatedAt: Object.keys(rates).length ? stamp : null };
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
