/**
 * Pure helpers for Teras (community) link previews.
 *
 * Semua logika di sini bebas jaringan supaya bisa diuji langsung:
 *   - deteksi URL pertama di body,
 *   - filter anti-SSRF (host/IP),
 *   - parse Open Graph / Twitter / <title> dari HTML,
 *   - sanitasi snapshot sebelum disimpan / dirender.
 * Resolusi DNS + fetch sesungguhnya dilakukan pemanggil (server.js).
 *
 * Deteksi URL ("apa itu URL pertama di teks") TIDAK didefinisikan ulang di
 * sini — didelegasikan ke `firstUrl` di lib/teras-linkify.js, satu-satunya
 * definisi otoritatif dipakai bersama oleh renderer link (linkifySegments)
 * dan body-strip (stripUrlFromBody), supaya server yang fetch OG untuk URL X
 * selalu sepakat dengan apa yang klien render/sembunyikan sebagai URL X.
 */

import { firstUrl } from './teras-linkify.js';

const TITLE_MAX = 200;
const DESC_MAX = 300;
const URL_MAX = 2048;

function firstUrlInText(text) {
  if (typeof text !== 'string') return null;
  return firstUrl(text);
}

function ipv4Parts(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some(n => n > 255)) return null;
  return parts;
}

function ipv4Blocked(parts) {
  const [a, b, c] = parts;
  if (a === 0) return true;                       // 0.0.0.0/8
  if (a === 10) return true;                      // 10/8
  if (a === 127) return true;                     // loopback
  if (a === 169 && b === 254) return true;        // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true;        // 192.168/16
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a >= 224) return true;                       // multicast/reserved
  return false;
}

// Perluas literal IPv6 (bentuk hex-group, hasil normalisasi WHATWG URL) jadi
// tepat 8 grup 16-bit sebagai angka. Menangani elision "::" dan ekor
// dotted-quad IPv4-embedded (mis. "::127.0.0.1" atau "::ffff:8.8.8.8") yang
// masih bisa muncul saat isBlockedAddress dipanggil langsung (di luar URL
// parser). Return null bila tidak valid -> pemanggil wajib fail closed.
function expandIpv6Groups(input) {
  let addr = input.split('%')[0]; // buang zone id (fe80::1%eth0)
  if (!addr) return null;

  // Ekor dotted-quad (mis. "::ffff:8.8.8.8" atau "64:ff9b::192.168.1.1"):
  // ubah jadi 2 grup hex supaya sisa parsing seragam sebagai IPv6 murni.
  const dotted = /^(.*:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(addr);
  if (dotted) {
    const v4 = ipv4Parts(dotted[2]);
    if (!v4) return null;
    const [a, b, c, d] = v4;
    const g1 = ((a << 8) | b).toString(16);
    const g2 = ((c << 8) | d).toString(16);
    const head = dotted[1] || '';
    if (!head.endsWith(':')) return null; // "1.2.3.4" polos tanpa ':' bukan IPv6
    addr = `${head}${g1}:${g2}`;
  }

  if ((addr.match(/::/g) || []).length > 1) return null; // "::" ganda -> invalid

  let groups;
  if (addr.includes('::')) {
    const [leftStr, rightStr] = addr.split('::');
    const left = leftStr ? leftStr.split(':') : [];
    const right = rightStr ? rightStr.split(':') : [];
    const missing = 8 - (left.length + right.length);
    if (missing < 0) return null;
    groups = [...left, ...Array(missing).fill('0'), ...right];
  } else {
    groups = addr.split(':');
  }
  if (groups.length !== 8) return null;

  const nums = groups.map(g => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  if (nums.some(n => Number.isNaN(n))) return null;
  return nums;
}

function isBlockedAddress(ip) {
  const raw = String(ip || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  const v4 = ipv4Parts(raw);
  if (v4) return ipv4Blocked(v4);

  // IPv6
  const g = expandIpv6Groups(raw);
  if (!g) return true; // tidak bisa diparse -> fail closed

  // Blok IPv6 murni dulu (lebih spesifik daripada pola IPv4-embedded di bawah,
  // yang juga secara sintaksis cocok dengan "::" dan "::1").
  if (g.every(n => n === 0)) return true;                                    // :: (unspecified)
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0 && g[6] === 0 && g[7] === 1) {
    return true;                                                             // ::1 (loopback)
  }
  if ((g[0] & 0xffc0) === 0xfe80) return true;   // fe80::/10 link-local
  if ((g[0] & 0xfe00) === 0xfc00) return true;   // fc00::/7 unique-local
  if ((g[0] & 0xffc0) === 0xfec0) return true;   // fec0::/10 site-local (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return true;   // ff00::/8 multicast

  // IPv4-embedded: reconstruct dotted quad dari 2 grup terakhir dan pakai
  // ulang aturan IPv4 di atas (jangan duplikasi daftar private/loopback/dst).
  const allZero03 = g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0;
  const allZero05 = allZero03 && g[4] === 0;
  const isV4Compat = allZero05 && g[5] === 0x0000;      // ::a.b.c.d (IPv4-compatible)
  const isV4Mapped = allZero05 && g[5] === 0xffff;      // ::ffff:a.b.c.d (IPv4-mapped)
  const isV4Translated = allZero03 && g[4] === 0xffff && g[5] === 0; // ::ffff:0:a.b.c.d (IPv4-translated, ::ffff:0:0/96)
  const isNat64 = g[0] === 0x0064 && g[1] === 0xff9b && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0; // 64:ff9b::/96 NAT64 (well-known)
  const isNat64Local = g[0] === 0x0064 && g[1] === 0xff9b && g[2] === 0x0001; // 64:ff9b:1::/48 NAT64 (local-use)
  if (isV4Compat || isV4Mapped || isV4Translated || isNat64 || isNat64Local) {
    const embedded = [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255];
    return ipv4Blocked(embedded);
  }

  // 6to4 (2002:AABB:CCDD::/48 = A.B.C.D): IPv4 sits in groups 1-2, not 6-7.
  if (g[0] === 0x2002) {
    const embedded = [g[1] >> 8, g[1] & 255, g[2] >> 8, g[2] & 255];
    return ipv4Blocked(embedded);
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

  if (!title && !image) return null;

  // NB: `og:url` (canonical) and `og:site_name` are intentionally NOT
  // extracted here. Both are attacker-controlled (they come from the fetched
  // page, not from the URL the member pasted) — a page can claim
  // `og:site_name: "detik.com"` while `og:url` points at a phishing domain.
  // The card's href/domain label are derived only from `baseUrl` (the
  // validated, pasted URL) at render time; see LinkPreviewCard in
  // TerasPage.tsx.
  const result = { url: baseUrl };
  if (title) result.title = title;
  if (description) result.description = description;
  if (image) result.image = image;
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
  const title = clampString(obj.title, TITLE_MAX);
  if (title) result.title = title;
  const description = clampString(obj.description, DESC_MAX);
  if (description) result.description = description;

  // Image must pass the SAME SSRF allowlist as url/canonical_url used to
  // (host/IP checks), not just a bare protocol check — otherwise
  // `image: "https://192.168.1.1/admin/reboot"` or "https://localhost:8080/x"
  // survives sanitization and gets rendered as an <img src> in every
  // member's browser: an unvalidated GET from the viewer's network position,
  // persisted forever in the snapshot.
  const image = clampString(obj.image, URL_MAX);
  if (image) {
    try {
      if (new URL(image).protocol === 'https:' && isAllowedPreviewUrl(image)) result.image = image;
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
