/**
 * Pure helpers for Teras (community) link previews.
 *
 * Semua logika di sini bebas jaringan supaya bisa diuji langsung:
 *   - deteksi URL pertama di body,
 *   - filter anti-SSRF (host/IP),
 *   - parse Open Graph / Twitter / <title> dari HTML,
 *   - sanitasi snapshot sebelum disimpan / dirender.
 * Resolusi DNS + fetch sesungguhnya dilakukan pemanggil (server.js).
 */

const URL_RE = /\bhttps?:\/\/[^\s<>"')]+/i;
const TITLE_MAX = 200;
const DESC_MAX = 300;
const SITE_MAX = 100;
const URL_MAX = 2048;

function firstUrlInText(text) {
  if (typeof text !== 'string') return null;
  const match = text.match(URL_RE);
  if (!match) return null;
  // Buang tanda baca penutup yang ikut ter-capture.
  return match[0].replace(/[.,;:!?)\]}'"]+$/, '') || null;
}

function ipv4Parts(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some(n => n > 255)) return null;
  return parts;
}

function isBlockedAddress(ip) {
  const raw = String(ip || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  const v4 = ipv4Parts(raw);
  if (v4) {
    const [a, b] = v4;
    if (a === 0) return true;                       // 0.0.0.0/8
    if (a === 10) return true;                      // 10/8
    if (a === 127) return true;                     // loopback
    if (a === 169 && b === 254) return true;        // link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
    if (a === 192 && b === 168) return true;        // 192.168/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
    if (a >= 224) return true;                       // multicast/reserved
    return false;
  }
  // IPv6
  if (raw === '::1' || raw === '::') return true;   // loopback / unspecified
  if (raw.startsWith('fe80')) return true;          // link-local
  if (raw.startsWith('fc') || raw.startsWith('fd')) return true; // unique-local fc00::/7
  if (raw.startsWith('::ffff:')) {                  // IPv4-mapped
    const mapped = raw.slice('::ffff:'.length);
    return ipv4Parts(mapped) ? isBlockedAddress(mapped) : true;
  }
  return false;
}

function isAllowedPreviewUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  if (!host) return false;
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  // IP literal? blokir bila non-routable.
  if (ipv4Parts(host) || host.includes(':')) {
    if (isBlockedAddress(host)) return false;
    return true;
  }
  // Hostname harus punya titik (tolak bare intranet names).
  if (!host.includes('.')) return false;
  return true;
}

function decodeEntities(value) {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .trim();
}

function collectMetaTags(html) {
  const tags = new Map();
  const metaRe = /<meta\b[^>]*>/gi;
  const attrRe = /([a-z:-]+)\s*=\s*("([^"]*)"|'([^']*)')/gi;
  let meta;
  while ((meta = metaRe.exec(html))) {
    const attrs = {};
    let attr;
    attrRe.lastIndex = 0;
    while ((attr = attrRe.exec(meta[0]))) {
      attrs[attr[1].toLowerCase()] = attr[3] !== undefined ? attr[3] : attr[4];
    }
    const key = (attrs.property || attrs.name || '').toLowerCase();
    const content = attrs.content;
    if (key && content !== undefined && !tags.has(key)) {
      tags.set(key, decodeEntities(content));
    }
  }
  return tags;
}

function resolveUrl(value, baseUrl) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function parseOpenGraph(html, baseUrl) {
  if (typeof html !== 'string' || !html) return null;
  const tags = collectMetaTags(html);
  const pick = (...keys) => {
    for (const key of keys) {
      const value = tags.get(key);
      if (value) return value;
    }
    return undefined;
  };

  let title = pick('og:title', 'twitter:title');
  if (!title) {
    const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    if (m) title = decodeEntities(m[1].replace(/\s+/g, ' '));
  }
  const description = pick('og:description', 'twitter:description', 'description');
  const rawImage = pick('og:image', 'og:image:url', 'twitter:image', 'twitter:image:src');
  const image = rawImage ? resolveUrl(rawImage, baseUrl) : undefined;
  const siteName = pick('og:site_name', 'application-name');
  const canonical = pick('og:url');
  const canonicalUrl = canonical ? resolveUrl(canonical, baseUrl) : undefined;

  if (!title && !image) return null;

  const result = { url: baseUrl };
  if (canonicalUrl && canonicalUrl !== baseUrl) result.canonical_url = canonicalUrl;
  if (title) result.title = title;
  if (description) result.description = description;
  if (image) result.image = image;
  if (siteName) result.site_name = siteName;
  return result;
}

function clampString(value, max) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function sanitizeLinkPreview(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const url = clampString(obj.url, URL_MAX);
  if (!url || !isAllowedPreviewUrl(url)) return null;

  const result = { url };
  const canonical = clampString(obj.canonical_url, URL_MAX);
  if (canonical && isAllowedPreviewUrl(canonical)) result.canonical_url = canonical;
  const title = clampString(obj.title, TITLE_MAX);
  if (title) result.title = title;
  const description = clampString(obj.description, DESC_MAX);
  if (description) result.description = description;
  const siteName = clampString(obj.site_name, SITE_MAX);
  if (siteName) result.site_name = siteName;

  const image = clampString(obj.image, URL_MAX);
  if (image) {
    try {
      if (new URL(image).protocol === 'https:') result.image = image;
    } catch { /* abaikan image tak valid */ }
  }

  // Butuh minimal url + (title atau image) untuk jadi kartu berguna.
  if (!result.title && !result.image) return null;
  return result;
}

export {
  firstUrlInText,
  isBlockedAddress,
  isAllowedPreviewUrl,
  parseOpenGraph,
  sanitizeLinkPreview,
};
