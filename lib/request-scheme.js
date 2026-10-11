// Skema (http/https) yang dilihat PENGUNJUNG, bukan yang dilihat proses ini.
//
// alhijaz.co: Cloudflare → nginx :80 → Node. nginx menimpa X-Forwarded-Proto
// dengan $scheme hop-nya sendiri, jadi header itu SELALU 'http' — terukur
// 2026-10-11 lewat tcpdump: kunjungan https pun tiba sebagai
// `X-Forwarded-Proto: http` + `CF-Visitor: {"scheme":"https"}`. Skema asli ada
// di CF-Visitor. Custom domain: Caddy → Node dengan X-Forwarded-Proto: https.
//
// CF-Visitor bisa dipalsukan oleh yang menembak origin langsung, tapi akibatnya
// hanya mengenai dirinya sendiri (cookie/redirect miliknya).

// 'https' | 'http' | null (tak diketahui — mis. localhost saat pengembangan).
export function visitorScheme(req) {
  if (req?.secure) return 'https';
  // Hanya 'https' yang dipercaya dari header ini: nilai 'http' justru selalu
  // muncul dari nginx, termasuk untuk pengunjung https.
  if (String(req?.headers?.['x-forwarded-proto'] || '').toLowerCase() === 'https') return 'https';
  const raw = req?.headers?.['cf-visitor'];
  if (raw) {
    try {
      const scheme = String(JSON.parse(raw)?.scheme || '').toLowerCase();
      if (scheme === 'https' || scheme === 'http') return scheme;
    } catch {
      /* header rusak = tak diketahui */
    }
  }
  return null;
}

export function isHttpsRequest(req) {
  return visitorScheme(req) === 'https';
}

// Halaman yang memasang/memakai cookie sesi Portal Jamaah atau membawa token
// reset password. Kunjungan http ke sini dinaikkan ke https (server.js):
// cookie Secure yang terpasang lewat https tidak terkirim di http, dan browser
// menolak halaman http menimpanya — link http lama di riwayat WhatsApp akan
// terjebak tanpa sesi.
// /dashboard/jamaah (daftar jamaah milik agent) bukan portal — dikecualikan.
const HTTPS_ONLY_PAGE_RE = /^\/(?:j\/[^/]+|(?:(?!dashboard\/)[a-z0-9-]+\/)?jamaah(?:\/.*)?|reset-password)\/?$/i;

export function isHttpsOnlyPagePath(path) {
  return HTTPS_ONLY_PAGE_RE.test(String(path || ''));
}
