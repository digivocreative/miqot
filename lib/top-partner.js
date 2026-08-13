const TOP_PARTNER_ENDPOINT_PATH =
  '/jadwal/src/dataagen.php?sEcho=1&iColumns=10&iDisplayStart=0&iDisplayLength=-1';

// Cloudflare di hostname publik kadang menolak request server-to-server dengan
// 403, sementara origin jadwal tetap sehat. Data ini publik dan origin yang
// sama juga dipakai oleh sinkronisasi jadwal, jadi utamakan origin lalu
// pertahankan hostname HTTPS sebagai fallback jika routing origin berubah.
export const TOP_PARTNER_ENDPOINT =
  `https://alhijazindowisata.com${TOP_PARTNER_ENDPOINT_PATH}`;

export const TOP_PARTNER_ENDPOINTS = Object.freeze([
  `http://115.124.86.220${TOP_PARTNER_ENDPOINT_PATH}`,
  TOP_PARTNER_ENDPOINT,
]);

export const TOP_PARTNER_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const TOP_PARTNER_PHOTO_PROXY_BASE =
  'https://alhijazindowisata.com/jadwal/_s.php?.max=350&.img=http://115.124.86.220/m/';

export const TOP_PARTNER_WHATSAPP_TEXT = 'Assalamualaikum, saya ingin info umroh Alhijaz';

export const TOP_PARTNER_META_TITLE = 'Top Partner Alhijaz Indowisata';

export const TOP_PARTNER_META_DESCRIPTION =
  'Temukan partner unggulan resmi yang responsif dan mudah dihubungi untuk konsultasi umroh dan haji plus.';

export const TOP_PARTNER_OG_IMAGE_PATH = '/og/top-partner.png';

function asText(value) {
  return value == null ? '' : String(value);
}

export function normalizeWaNumber(raw) {
  const digits = asText(raw).replace(/\D/g, '');
  if (!digits) return '';

  const normalized = digits.startsWith('0')
    ? `62${digits.slice(1)}`
    : digits.startsWith('62')
      ? digits
      : '';

  if (normalized.length < 10 || normalized.length > 15) return '';
  return normalized;
}

export function firstValidUrl(raw, options = {}) {
  const line = asText(raw).split(/[\r\n]/).map((v) => v.trim()).find(Boolean) || '';
  if (!line || line === '-') return '';

  const url = /^https?:\/\//i.test(line)
    ? line
    : /^www\./i.test(line)
      ? `https://${line}`
      : '';

  if (!url) return '';
  if (options.rejectMaps && /(^https?:\/\/)?(www\.)?(maps\.app\.goo\.gl|google\.[^/]+\/maps)/i.test(url)) {
    return '';
  }
  return url;
}

export function buildPhotoProxyUrl(file) {
  const cleanFile = asText(file).trim();
  return cleanFile ? `${TOP_PARTNER_PHOTO_PROXY_BASE}${cleanFile}` : '';
}

export function buildWaLink(phone) {
  const cleanPhone = normalizeWaNumber(phone);
  if (!cleanPhone) return '';
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(TOP_PARTNER_WHATSAPP_TEXT)}`;
}

export function sanitizePartnerRow(row) {
  const full = Array.isArray(row) ? row : [];
  const name = asText(full[0]).trim().replace(/\s+/g, ' ');
  const phone = normalizeWaNumber(full[1]);
  const photoFile = asText(full[2]).trim();

  return {
    id: asText(full[8]).trim(),
    name,
    phone,
    waLink: buildWaLink(phone),
    photo: buildPhotoProxyUrl(photoFile),
    photoFile,
    facebook: firstValidUrl(full[3]),
    instagram: firstValidUrl(full[4]),
    tiktok: firstValidUrl(full[6], { rejectMaps: true }),
    website: firstValidUrl(full[7]),
  };
}

export function sanitizePartnerRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map(sanitizePartnerRow)
    .filter((partner) => partner.name);
}

export function isTopPartnerCacheFresh(
  syncedAt,
  now = Date.now(),
  maxAgeMs = TOP_PARTNER_REFRESH_INTERVAL_MS,
) {
  const timestamp = Date.parse(asText(syncedAt));
  return Number.isFinite(timestamp)
    && Number.isFinite(now)
    && Number.isFinite(maxAgeMs)
    && maxAgeMs > 0
    && now - timestamp >= 0
    && now - timestamp < maxAgeMs;
}

/**
 * Ambil daftar Top Partner dari origin resmi dengan failover terurut.
 * Payload kosong dianggap gagal agar cache valid tidak pernah tertimpa data
 * kosong akibat halaman blokir/WAF yang kebetulan membalas HTTP 200.
 */
export async function fetchTopPartnerData(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('Fetch Top Partner tidak tersedia');

  const endpoints = Array.isArray(options.endpoints) && options.endpoints.length
    ? options.endpoints
    : TOP_PARTNER_ENDPOINTS;
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 20_000;
  const failures = [];

  for (const endpoint of endpoints) {
    const url = asText(endpoint).trim();
    if (!url) continue;

    try {
      const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(timeoutMs)
        : undefined;
      const response = await fetchImpl(url, {
        headers: options.headers,
        cache: 'no-store',
        signal,
      });
      if (!response?.ok) throw new Error(`HTTP ${response?.status || 'unknown'}`);

      const raw = await response.json();
      const rows = Array.isArray(raw?.aaData)
        ? raw.aaData
        : Array.isArray(raw?.data)
          ? raw.data
          : [];
      const partners = sanitizePartnerRows(rows).slice(0, 20);
      if (partners.length === 0) throw new Error('payload partner kosong');

      return { partners, endpoint: url };
    } catch (err) {
      failures.push(`${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new Error(`Semua sumber Top Partner gagal (${failures.join(' | ') || 'endpoint kosong'})`);
}

export function shufflePartners(partners, random = Math.random) {
  const result = [...(Array.isArray(partners) ? partners : [])];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
