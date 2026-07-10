/**
 * Laporan API — Lightweight HTTP session-based fetch (no Playwright)
 *
 * POST /api/laporan/login       → login via native fetch, store PHPSESSID
 * GET  /api/laporan/fetch       → fetch laporan HTML using stored cookie
 * POST /api/laporan/sync        → fetch + parse + return structured data
 * POST /api/laporan/disconnect  → clear session
 */

import * as cheerio from 'cheerio';
import { getSetCookies as getUndiciSetCookies } from 'undici';
import { parseLegacyDmyDate } from './lib/legacy-date-parse.js';

const DEFAULT_INTERNAL_API_BASE = 'http://115.124.86.220';
const CLOUDFLARE_INTERNAL_API_BASE = 'https://jadwal.alhijaz.co';
const INTERNAL_API_BASE = (process.env.INTERNAL_API_BASE || DEFAULT_INTERNAL_API_BASE).replace(/\/+$/, '');
const BROWSER_INTERNAL_API_BASE = (process.env.LEGACY_BROWSER_API_BASE || DEFAULT_INTERNAL_API_BASE).replace(/\/+$/, '');
const BASE = INTERNAL_API_BASE + '/aiw/staff';
const BROWSER_BASE = BROWSER_INTERNAL_API_BASE + '/aiw/staff';
const UMRAH_RECAPTCHA_SITE_KEY = process.env.UMRAH_RECAPTCHA_SITE_KEY || '6LdSnAAtAAAAAAXOJz4lOvICok5i2Yg1K0_vTmZ4';
const UMRAH_RECAPTCHA_FIELD_NAME = process.env.UMRAH_RECAPTCHA_FIELD_NAME || 'c2f98e8686461650071c28e75c98d7ac_68SwyXPE';
// Cloudflare base (jadwal.alhijaz.co) is deliberately NOT a login/session base:
// its path to the legacy origin is chronically broken (522 origin-timeout + 403
// bot-challenge), so any session that pins to it fails on submit/fetch with
// "Gagal menghubungi server" (incident 2026-06-19). The direct IP is reliable;
// when it's down Cloudflare 522s during the same outage, so it is no real fallback.
// It stays in LEGACY_INTERNAL_HOSTS below so normalizeLegacyUrl still rewrites any
// stray absolute jadwal.alhijaz.co form action back to the direct-IP session base.
const LOGIN_BASE_CANDIDATES = Array.from(new Set([
  INTERNAL_API_BASE,
  DEFAULT_INTERNAL_API_BASE,
])).map(base => base.replace(/\/+$/, ''));
const LEGACY_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const LEGACY_STAFF_PATH = '/aiw/staff';
const LEGACY_INTERNAL_HOSTS = new Set([
  new URL(DEFAULT_INTERNAL_API_BASE).host,
  new URL(CLOUDFLARE_INTERNAL_API_BASE).host,
  '43.134.121.246:8220',
]);

function getSetCookieHeaders(headers) {
  try {
    const parsed = getUndiciSetCookies(headers);
    if (parsed?.length) return parsed;
  } catch { /* fall through */ }
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  if (typeof headers.raw === 'function') {
    return headers.raw()['set-cookie'] || [];
  }
  const raw = headers.get('set-cookie');
  return raw ? [raw] : [];
}

function parseCookieEntry(cookie) {
  let name = '';
  let value = '';
  let deleted = false;

  if (cookie && typeof cookie === 'object') {
    name = String(cookie.name || '').trim();
    value = String(cookie.value || '').trim();
    deleted = !value ||
      value.toLowerCase() === 'deleted' ||
      cookie.maxAge === 0 ||
      (cookie.expires instanceof Date && cookie.expires.getTime() <= Date.now());
  } else {
    const [nameValue, ...attrs] = String(cookie).split(';');
    const eq = nameValue.indexOf('=');
    if (eq <= 0) return { name: '', value: '', deleted: false };
    name = nameValue.slice(0, eq).trim();
    value = nameValue.slice(eq + 1).trim();
    const attrText = attrs.join(';').toLowerCase();
    deleted = !value ||
      value.toLowerCase() === 'deleted' ||
      attrText.includes('max-age=0') ||
      attrText.includes('01 jan 1970');
  }

  return { name, value, deleted };
}

export function buildCookieString(cookies) {
  const jar = new Map();
  for (const cookie of cookies || []) {
    const { name, value, deleted } = parseCookieEntry(cookie);

    // Legacy often sends a valid PHPSESSID and a PHPSESSID=deleted in the same
    // response. Treat deleted cookies as cleanup noise; protected-page validation
    // below decides whether the remaining cookie is actually authenticated.
    if (!name || deleted) continue;
    jar.set(name, value);
  }
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

function parseCookieString(cookieString) {
  const jar = new Map();
  for (const part of String(cookieString || '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    const value = rest.join('=').trim();
    if (name && value) jar.set(name.trim(), value);
  }
  return jar;
}

function serializeCookieJar(jar) {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

export function mergeCookieString(existingCookieString, cookies) {
  const jar = parseCookieString(existingCookieString);
  for (const cookie of cookies || []) {
    const { name, value, deleted } = parseCookieEntry(cookie);
    // Same reason as buildCookieString(): legacy can send PHPSESSID=deleted
    // alongside a valid PHPSESSID. Ignore deletes and let protected-page checks
    // decide when the session is actually dead.
    if (!name || deleted) continue;
    jar.set(name, value);
  }
  return serializeCookieJar(jar);
}

function refreshSessionCookies(session, headers) {
  if (!session) return;
  const cookies = getSetCookieHeaders(headers);
  if (!cookies.length) return;
  const nextCookie = mergeCookieString(session.cookie, cookies);
  if (nextCookie && nextCookie !== session.cookie) {
    session.cookie = nextCookie;
  }
}

function getCookieValue(cookieString, name) {
  for (const part of String(cookieString || '').split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return '';
}

function getSessionBase(session) {
  return session?.base || BASE;
}

function normalizeLegacyUrl(url, base = BASE) {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const parsed = new URL(url);
      if (LEGACY_INTERNAL_HOSTS.has(parsed.host) && parsed.pathname.startsWith(LEGACY_STAFF_PATH)) {
        return `${base}${parsed.pathname.slice(LEGACY_STAFF_PATH.length)}${parsed.search}`;
      }
    } catch { /* keep original */ }
    return url;
  }
  if (url.startsWith('/')) return `${base}${url}`;
  return `${base}/pages/${url}`;
}

// ── In-memory session store with TTL (1 hour) ──
const sessions = new Map();
const SESSION_TTL = 60 * 60 * 1000; // 1 hour

// Detects legacy "you've been logged out" responses. Covers the login-page
// redirect (cek_login.php / "Sign in to start your session") plus the inline
// alert legacy serves on protected pages when PHPSESSID is rejected:
//   <script>alert('Sesi Anda habis, silahkan re-login!!'); window.location='/aiw/staff/';</script>
export function isSessionExpiredHtml(html) {
  if (!html) return false;
  if (html.includes('cek_login.php')) return true;
  if (html.includes('Sign in to start your session')) return true;
  if (/Sesi Anda habis|silahkan re-login/i.test(html)) return true;
  return false;
}

function extractLegacyAlert(html) {
  const match = String(html || '').match(/alert\((['"])([\s\S]*?)\1\)/i);
  return (match?.[2] || '').replace(/\s+/g, ' ').trim();
}

function legacyLoginRejection(alertText) {
  const message = String(alertText || '').trim();
  if (!message) return null;
  if (/password|username|user|login|akses|aktif|sesuai/i.test(message)) {
    return {
      success: false,
      error: `Login sistem internal ditolak: ${message}`,
      reason: /aktif/i.test(message) ? 'inactive_credentials' : 'invalid_credentials',
    };
  }
  return null;
}

function cleanExpired() {
  const now = Date.now();
  for (const [key, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL) {
      sessions.delete(key);
    }
  }
}

// Run cleanup every 10 minutes
setInterval(cleanExpired, 10 * 60 * 1000);

// ── Check if session exists and is active ──
export function isSessionActive(username) {
  const session = sessions.get(username);
  if (!session) return false;
  if (Date.now() - session.createdAt > SESSION_TTL) {
    sessions.delete(username);
    return false;
  }
  return true;
}

// ── Login: POST to cek_login.php, capture PHPSESSID ──
// Retries on 403 (Apache rate-limit) with exponential backoff
export async function login(username, password, kantor = '2') {
  const MAX_ATTEMPTS = 3;
  const BACKOFF_BASE = 10_000; // 10s, 20s, 40s

  let lastError = null;

  for (const loginBase of LOGIN_BASE_CANDIDATES) {
    const staffBase = `${loginBase}/aiw/staff`;
    const bootstrapCookies = [];
    try {
      const bootstrapRes = await fetch(`${staffBase}/`, {
        method: 'GET',
        headers: {
          'User-Agent': LEGACY_UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      });
      bootstrapCookies.push(...getSetCookieHeaders(bootstrapRes.headers));
    } catch (err) {
      console.warn(`[Login] ${username}: bootstrap ${loginBase} failed: ${err.message}`);
    }

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const body = new URLSearchParams({
          kantor,
          username,
          password,
          z: '',
        });

        const res = await fetch(`${staffBase}/cek_login.php`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': LEGACY_UA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            'Origin': loginBase,
            'Referer': `${staffBase}/`,
            ...(buildCookieString(bootstrapCookies) ? { Cookie: buildCookieString(bootstrapCookies) } : {}),
          },
          body: body.toString(),
          redirect: 'manual', // Don't follow redirect — capture Set-Cookie first
          signal: AbortSignal.timeout(30_000), // 30s timeout for login
        });

        // Handle Apache/Cloudflare rate-limiting — wait and retry
        if (res.status === 403 || res.status === 429) {
          const wait = BACKOFF_BASE * Math.pow(2, attempt);
          console.warn(`[Login] ${username}: ${res.status} rate-limited, retry ${attempt + 1}/${MAX_ATTEMPTS} in ${wait / 1000}s`);
          if (attempt < MAX_ATTEMPTS - 1) {
            await new Promise(r => setTimeout(r, wait));
            continue;
          }
          return { success: false, error: `Server rate-limit (${res.status}) — coba lagi nanti`, reason: 'rate_limited' };
        }

        if (res.status === 401) {
          return { success: false, error: 'Login gagal — username atau password salah', reason: 'invalid_credentials' };
        }

        if (res.status !== 302) {
          const loginHtml = await res.text().catch(() => '');
          const rejection = legacyLoginRejection(extractLegacyAlert(loginHtml));
          if (rejection) return rejection;
        }

        const cookies = getSetCookieHeaders(res.headers);
        const cookieString = buildCookieString([...bootstrapCookies, ...cookies]);

        if (!cookieString) {
          lastError = {
            success: false,
            error: 'Login sistem internal ditolak (tidak ada sesi) — kemungkinan besar username/password berubah. Silakan login ulang sistem internal dari dashboard. Credential tersimpan tidak dihapus otomatis.',
            reason: 'login_no_session',
          };
          break;
        }

        const phpSessionValue = getCookieValue(cookieString, 'PHPSESSID').trim();
        if (!phpSessionValue || phpSessionValue.toLowerCase() === 'deleted') {
          lastError = {
            success: false,
            error: 'Login sistem internal ditolak — kemungkinan besar username/password berubah. Silakan login ulang sistem internal dari dashboard.',
            reason: 'login_deleted_session',
          };
          console.warn(`[Login] ${username}: ${loginBase} returned deleted PHPSESSID`);
          break;
        }

        // Validate the cookie against a protected page. Without this, an
        // unauthenticated bootstrap PHPSESSID could be mistaken for a login.
        const validateRes = await fetch(`${staffBase}/pages/main.php?route=home`, {
          method: 'GET',
          headers: {
            Cookie: cookieString,
            'User-Agent': LEGACY_UA,
            'Referer': `${staffBase}/`,
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(15_000),
        });
        const validateHtml = await validateRes.text();
        if (isSessionExpiredHtml(validateHtml)) {
          lastError = {
            success: false,
            error: 'Login sistem internal ditolak — kemungkinan besar username/password berubah. Silakan login ulang sistem internal dari dashboard.',
            reason: 'login_deleted_session',
          };
          console.warn(`[Login] ${username}: ${loginBase} returned PHPSESSID but protected page rejected it`);
          break;
        }

        // Store session keyed by username
        sessions.set(username, {
          cookie: cookieString,
          kantor,
          base: staffBase,
          createdAt: Date.now(),
        });

        return {
          success: true,
          message: 'Berhasil login ke sistem internal',
        };

      } catch (err) {
        if (err.cause?.code === 'ECONNREFUSED' || err.cause?.code === 'ETIMEDOUT') {
          lastError = { success: false, error: 'Sistem internal tidak dapat dihubungi' };
          break;
        }
        console.error('Laporan login error:', err.message, err.cause);
        lastError = { success: false, error: 'Gagal menghubungi sistem internal' };
        break;
      }
    }
  }
  return lastError || { success: false, error: 'Login gagal setelah retry' };
}

// ── Fetch Laporan: Build URL server-side (prevent SSRF), GET with cookie ──
// Uses a 2-attempt strategy: fast 20s first try → retry with 45s on timeout.
// This handles transient PHP server slowness without needing complex retry logic upstream.
export async function fetchLaporan(username, { kantor, agentId, tglAwal, tglAkhir }) {
  const session = sessions.get(username);
  if (!session) {
    return { success: false, error: 'Belum login — silakan login terlebih dahulu' };
  }

  // Check TTL
  if (Date.now() - session.createdAt > SESSION_TTL) {
    sessions.delete(username);
    return { success: false, error: 'Session kedaluwarsa, silakan login ulang' };
  }

  // Build URL server-side (prevent SSRF — don't accept raw URL from client)
  const base = getSessionBase(session);
  const ob = `${kantor}.${agentId}`;
  const url = `${base}/pages/route/laporan_data_jamaah/_claporanm.php?.ob=${encodeURIComponent(ob)}&.tgw=${encodeURIComponent(tglAwal)}&.tgk=${encodeURIComponent(tglAkhir)}&.m=${encodeURIComponent(agentId)}`;

  const TIMEOUTS = [20_000, 50_000]; // 1st attempt: 20s (fast), 2nd: 50s (generous)

  for (let attempt = 0; attempt < TIMEOUTS.length; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUTS[attempt]);

      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Cookie: session.cookie,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        redirect: 'follow',
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const html = await res.text();

      // Check if redirected to login page (session expired on remote)
      if (isSessionExpiredHtml(html)) {
        sessions.delete(username);
        return { success: false, reason: 'session_expired', error: 'Session kedaluwarsa di sistem internal' };
      }

      return { success: true, html };

    } catch (err) {
      if (err.name === 'AbortError') {
        // On first timeout, retry with longer timeout after a brief pause
        if (attempt < TIMEOUTS.length - 1) {
          await new Promise(r => setTimeout(r, 1000)); // 1s breather before retry
          continue;
        }
        return { success: false, reason: 'timeout', error: `Sistem internal tidak merespons (timeout ${TIMEOUTS[attempt] / 1000}s, ${attempt + 1} attempts)` };
      }
      if (err.cause?.code === 'ECONNREFUSED' || err.cause?.code === 'ETIMEDOUT') {
        return { success: false, reason: 'network', error: 'Sistem internal tidak merespons' };
      }
      console.error('Laporan fetch error:', err.message);
      return { success: false, reason: 'unknown', error: 'Gagal mengambil data laporan' };
    }
  }
}

// ── Fetch Umrah Page: Extract booking ringkasan (Calon Jamaah) ──
export async function fetchUmrahBookings(username) {
  const session = sessions.get(username);
  if (!session) return { success: false, error: 'Belum login' };

  if (Date.now() - session.createdAt > SESSION_TTL) {
    sessions.delete(username);
    return { success: false, error: 'Session kedaluwarsa, silakan login ulang' };
  }

  const base = getSessionBase(session);
  const url = `${base}/pages/main.php?route=umrah`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Cookie: session.cookie,
        'User-Agent': 'Mozilla/5.0'
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const html = await res.text();
    if (isSessionExpiredHtml(html)) {
      sessions.delete(username);
      return { success: false, error: 'Session kedaluwarsa di sistem internal' };
    }

    const $ = cheerio.load(html);
    const bookings = [];

    $('table tr').each((i, el) => {
      const tds = $(el).find('td');
      if (tds.length < 5) return;

      const parseBrCell = (tdNode) => {
         const cellHtml = $(tdNode).html() || '';
         const parts = cellHtml.split(/<br\s*\/?>/i);
         return parts.map(p => cheerio.load(p).text().trim()).filter(Boolean);
      };

      const col1 = parseBrCell(tds[1]);
      const col2 = parseBrCell(tds[2]);
      const staf = $(tds[4]).text().trim();
      const marketing = $(tds[6]).text().trim();
      const paket = $(tds[9]).text().trim();
      const bayar = $(tds[10]).text().trim();

      const id_umroh = col1[0] || '';
      const tgl_daftar_raw = col1[1] || '';
      const tgl_berangkat_raw = col2[1] || '';
      
      // Parse DD MMM YYYY to YYYY-MM-DD (English + Indonesian months via the
      // shared MONTH_TOKEN_MAP; unknown token -> null, never a fabricated date).
      const tgl_berangkat = parseLegacyDmyDate(tgl_berangkat_raw);
      const tgl_daftar = parseLegacyDmyDate(tgl_daftar_raw);

      if (id_umroh) {
        bookings.push({
            id_umroh,
            jadwal: col2[0] || '',
            tgl_berangkat_raw,
            tgl_berangkat,
            tgl_daftar,
            staf,
            marketing,
            paket,
            bayar
        });
      }
    });

    const tail = html.slice(-4096).toLowerCase();
    const complete = tail.includes('</html>') || tail.includes('</body>');
    return { success: true, complete, bookings };
  } catch (err) {
    return { success: false, complete: false, error: 'Gagal mengambil data umrah summary' };
  }
}

// ── Fetch Alhijaz Official API credentials ──
// Scrape the `/aiw/staff/pages/main.php?route=api` page using the active session
// to discover the agent's x-api-key and code. Used to auto-populate
// agents.awapi_key and agents.awapi_code without requiring manual input.
//
// The API key on that page has the shape "{code}-{secret}", e.g. "SM01078-kDUFDznksE4EC".
// Code is uppercase letters + digits; secret is alphanumeric (>=8 chars).
export async function fetchAwapiCredentials(username) {
  const session = sessions.get(username);
  if (!session) return { success: false, error: 'Belum login', reason: 'no_session' };

  if (Date.now() - session.createdAt > SESSION_TTL) {
    sessions.delete(username);
    return { success: false, error: 'Session kedaluwarsa', reason: 'session_expired' };
  }

  const base = getSessionBase(session);
  const url = `${base}/pages/main.php?route=api`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Cookie: session.cookie,
        'User-Agent': 'Mozilla/5.0',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const html = await res.text();
    if (isSessionExpiredHtml(html)) {
      sessions.delete(username);
      return { success: false, error: 'Session kedaluwarsa di sistem internal', reason: 'session_expired' };
    }

    // Match api key pattern: 2-4 uppercase letters + digits, dash, alphanumeric secret.
    // Defensive: find all matches and pick the most common (in case the page lists
    // multiple agent codes — the agent's own key should appear repeatedly in code samples).
    const KEY_RE = /\b([A-Z]{2,4}\d{3,8})-([A-Za-z0-9]{8,})\b/g;
    const counts = new Map();
    let match;
    while ((match = KEY_RE.exec(html)) !== null) {
      const full = `${match[1]}-${match[2]}`;
      counts.set(full, (counts.get(full) || 0) + 1);
    }

    if (counts.size === 0) {
      return { success: false, error: 'API key tidak ditemukan di halaman', reason: 'not_found' };
    }

    // Pick the key with highest occurrence count (most repeated → likely the active one).
    let bestKey = '';
    let bestCount = 0;
    for (const [k, c] of counts) {
      if (c > bestCount) { bestKey = k; bestCount = c; }
    }

    const code = bestKey.split('-')[0];
    return { success: true, awapi_key: bestKey, awapi_code: code };
  } catch (err) {
    return { success: false, error: err.message || 'Gagal mengambil API credentials', reason: 'fetch_error' };
  }
}

// ── Fetch Umrah Detail: Extract per-jamaah data from a single booking ──
// URL: route=umrah&act=edit&id=AIW... → returns HTML with server-rendered jamaah table
// Much lighter than laporan (3.6KB vs 100KB+), zero timeout risk
export async function fetchUmrahDetail(username, idUmroh) {
  const session = sessions.get(username);
  if (!session) return { success: false, reason: 'session_expired', error: 'Belum login' };

  if (Date.now() - session.createdAt > SESSION_TTL) {
    sessions.delete(username);
    return { success: false, reason: 'session_expired', error: 'Session kedaluwarsa' };
  }

  const base = getSessionBase(session);
  const url = `${base}/pages/main.php?route=umrah&act=edit&id=${idUmroh}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000); // 10s — page is small

    const res = await fetch(url, {
      method: 'GET',
      headers: { Cookie: session.cookie, 'User-Agent': 'Mozilla/5.0' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const html = await res.text();
    if (isSessionExpiredHtml(html)) {
      sessions.delete(username);
      return { success: false, reason: 'session_expired', error: 'Session kedaluwarsa' };
    }

    const $ = cheerio.load(html);
    const jamaahItems = [];

    // The data table is table#example1 — server-rendered rows with 15 columns
    // Row structure: [actions, jadwal/berangkat, id/nama, L/P, harga, kantor, marketing, sisa, ...]
    $('#example1 tbody tr, #example1 tr').each((i, tr) => {
      const tds = $(tr).find('> td');
      if (tds.length < 14) return;

      // col[2]: "JM...ID\nNAMA JAMAAH" — split by <br>
      const namaCell = $(tds[2]);
      const namaCellHtml = namaCell.html() || '';
      const namaParts = namaCellHtml.split(/<br\s*\/?>/i);
      const jmId = namaParts[0] ? cheerio.load(namaParts[0]).text().trim() : '';
      const nama = namaParts.length >= 2 ? cheerio.load(namaParts.slice(1).join(' ')).text().trim() : '';

      if (!nama) return;

      // col[3]: L/P
      const jk = $(tds[3]).text().trim();

      // col[1]: jadwal/berangkat "JBU1508\n10 OCT 2026"
      const jadwalCell = $(tds[1]);
      const jadwalHtml = jadwalCell.html() || '';
      const jadwalParts = jadwalHtml.split(/<br\s*\/?>/i);
      const id_jadwal_raw = jadwalParts[0] ? cheerio.load(jadwalParts[0]).text().trim() : '';
      const id_jadwal = /^JBU\d+$/i.test(id_jadwal_raw) ? id_jadwal_raw.toUpperCase() : null;
      const tgl_berangkat_raw = jadwalParts.length >= 2 ? cheerio.load(jadwalParts[1]).text().trim() : '';

      // English + Indonesian months via the shared MONTH_TOKEN_MAP. An unknown
      // token (e.g. Indonesian "Des") must NOT silently become January — leave
      // null so the Phase-1 merge keeps the existing (correct) departure date.
      const tgl_berangkat = parseLegacyDmyDate(tgl_berangkat_raw);

      // col[4]: HARGA PAKET (rupiah string "38.700.000")
      const hargaPaket = parseRupiah($(tds[4]).text().trim());
      // col[5-6]: diskon kantor/marketing. These reduce the amount the jamaah
      // actually paid; treating them as cash payment causes false "payment in"
      // notifications on every sync.
      const diskonKantor = parseRupiah($(tds[5]).text().trim());
      const diskonMarketing = parseRupiah($(tds[6]).text().trim());
      // col[7]: SISA PAKET
      const sisaPaket = parseRupiah($(tds[7]).text().trim());
      // bayar bersih = harga - diskon - sisa
      const bayar = hargaPaket - diskonKantor - diskonMarketing - sisaPaket;

      // col[14]: STATUS BAYAR
      const statusBayar = $(tds[14])?.text()?.trim() || '';

      jamaahItems.push({
        id_umroh: idUmroh,
        jm_id: jmId || null,
        nama,
        jk: jk || null,
        bayar: bayar > 0 ? bayar : 0,
        sisa: sisaPaket,
        diskon_kantor: diskonKantor,
        diskon_marketing: diskonMarketing,
        tgl_berangkat,
        raw_data: {
          jm_id: jmId,
          status_bayar: statusBayar,
          harga_paket: hargaPaket,
          diskon_kantor: diskonKantor,
          diskon_marketing: diskonMarketing,
          bayar_gross: Math.max(0, hargaPaket - sisaPaket),
          id_jadwal,
          source: 'umrah_detail',
        },
      });
    });

    return { success: true, items: jamaahItems };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { success: false, reason: 'timeout', error: 'Timeout fetching detail' };
    }
    if (err.cause?.code === 'ECONNREFUSED' || err.cause?.code === 'ECONNRESET') {
      return { success: false, reason: 'network', error: 'Server unreachable' };
    }
    return { success: false, reason: 'unknown', error: err.message };
  }
}

// ── Parse Laporan HTML: Extract jamaah data from legacy table ──
// Legacy HTML has 38 columns per data row:
// col0:  NO
// col1:  ID UMROH (e.g. "AIW0024460")
// col2:  NAMA — contains <small class="eh">JM...50706</small><br>ACTUAL NAME
// col3:  L/P
// col4:  TELP
// col5:  TGL LAHIR
// col6:  PAKET
// col7-15:  PERLENGKAPAN (9 cols, skip)
// col16-32: DOKUMEN (17 cols, skip)
// col33: BAYAR PAKET
// col34: SISA PAKET
// col35: BAYAR PERLENGKAPAN
// col36: SISA PERLENGKAPAN
// col37: KEBERANGKATAN
export function parseLaporanHtml(html) {
  const $ = cheerio.load(html);
  const items = [];

  // Find tbody rows in the main data table
  $('table.table tbody tr').each((i, tr) => {
    const tds = $(tr).find('> td');
    if (tds.length < 7) return; // Need at least core columns

    // First column is row number
    const firstCell = $(tds[0]).text().trim();
    const rowNum = parseInt(firstCell, 10);
    if (isNaN(rowNum)) return;

    // col1: ID UMROH
    const id_umroh = $(tds[1]).text().trim();

    // col2: NAMA — parse HTML to separate JM ID from actual name
    const namaCell = $(tds[2]);
    // The <small> tag often contains a CSS-truncated display like "JM...50706".
    // Reject dotted values as jm_id (they'd create ghost rows on upsert), but
    // capture the trailing suffix as a hint — enrichment matching keys on it
    // to disambiguate same-nama family members sharing an id_umroh.
    const jmIdRawSmall = namaCell.find('small').text().trim();
    const jmIdSmall = /^JM[^.]+$/i.test(jmIdRawSmall) ? jmIdRawSmall : '';
    let jmIdHint = null;
    if (!jmIdSmall && /^JM/i.test(jmIdRawSmall)) {
      const lastDot = jmIdRawSmall.lastIndexOf('.');
      const suffix = lastDot >= 0 ? jmIdRawSmall.slice(lastDot + 1).trim() : '';
      if (/^\w{3,}$/.test(suffix)) jmIdHint = suffix;
    }
    // Get the actual name: text after <br>, or all text minus the small tag content
    let nama = '';
    const namaCellHtml = namaCell.html() || '';
    const brParts = namaCellHtml.split(/<br\s*\/?>/i);
    if (brParts.length >= 2) {
      // Text after the <br> is the actual name
      nama = cheerio.load(brParts.slice(1).join(' ')).text().trim();
    } else {
      // Fallback: get full text and remove the JM... prefix (raw, possibly truncated)
      const fullText = namaCell.text().trim();
      nama = fullText.replace(jmIdRawSmall, '').trim();
    }
    if (!nama) nama = namaCell.text().trim();

    // col3: L/P
    const jk = $(tds[3]).text().trim();

    // col4: TELP
    const wa = $(tds[4]).text().trim();

    // col5: TGL LAHIR
    const tgl_lahir = parseBirthDateDMY($(tds[5]).text().trim());

    // col6: PAKET
    const paket = $(tds[6]).text().trim();

    // col7-15: PERLENGKAPAN (9 cols)
    // Legacy HTML uses Font Awesome icons: <i class="fa fa-check"> (green) or <i class="fa fa-times"> (red)
    const perlengkapanKeys = ['batik', 'bergo', 'buku_doa', 'ikhram', 'koper', 'mukena', 'sabuk', 'syal', 'tas_paspor'];
    const perlengkapan = {};
    perlengkapanKeys.forEach((key, idx) => {
      if (tds.length > (7 + idx)) {
        const cell = $(tds[7 + idx]);
        // Check for fa-check icon (green checkmark) in HTML
        const html = cell.html() || '';
        perlengkapan[key] = html.includes('fa-check');
      } else {
        perlengkapan[key] = false;
      }
    });

    // col16-23: DOKUMEN (8 cols) — same icon pattern as perlengkapan
    const dokumenKeys = ['paspor', 'vaksin', 'buku_nikah', 'akta_lahir', 'ktp', 'kk', 'foto', 'pernyataan'];
    const dokumen = {};
    dokumenKeys.forEach((key, idx) => {
      if (tds.length > (16 + idx)) {
        const cell = $(tds[16 + idx]);
        const html = cell.html() || '';
        dokumen[key] = html.includes('fa-check');
      } else {
        dokumen[key] = false;
      }
    });

    // col33-34: BAYAR/SISA PAKET (only if enough columns)
    let bayar = 0, sisa = 0;
    if (tds.length > 34) {
      bayar = parseRupiah($(tds[33]).text().trim());
      sisa = parseRupiah($(tds[34]).text().trim());
    }

    // col37: KEBERANGKATAN
    let tgl_berangkat = null;
    if (tds.length > 37) {
      tgl_berangkat = parseDateDMY($(tds[37]).text().trim());
    }

    // col28: NOMOR PASPOR (under DOKUMEN → PASPOR sub-header)
    let no_paspor = null;
    if (tds.length > 28) {
      const raw = $(tds[28]).text().trim();
      if (raw && raw !== '-') no_paspor = raw;
    }

    // col29: EXPIRED PASPOR (format: DD/MM/YYYY)
    let paspor_expired = null;
    if (tds.length > 29) {
      paspor_expired = parseDateDMY($(tds[29]).text().trim());
    }

    // col38: PENDAFTARAN (format: "DD/MM/YYYY HH:MM:SS")
    let tgl_daftar = null;
    if (tds.length > 38) {
      const raw = $(tds[38]).text().trim();
      // Extract date part before the time (space separator)
      const datePart = raw.split(' ')[0];
      tgl_daftar = parseDateDMY(datePart);
    }

    if (id_umroh && nama) {
      items.push({
        id_umroh,
        jm_id: jmIdSmall || null,
        jm_id_hint: jmIdHint,
        nama,
        jk: jk || null,
        wa: wa || null,
        tgl_lahir,
        paket: paket || null,
        perlengkapan,
        dokumen,
        bayar,
        sisa,
        tgl_berangkat,
        tgl_daftar,
        no_paspor,
        paspor_expired,
        raw_data: { jm_id: jmIdSmall, jm_id_hint: jmIdHint, cols_count: tds.length },
      });
    }
  });

  return { items, count: items.length };
}

// ── Helper: Parse "3.500.000" or "Rp 3.500.000" to integer ──
function parseRupiah(str) {
  if (!str) return 0;
  const cleaned = str.replace(/[^0-9]/g, '');
  return parseInt(cleaned, 10) || 0;
}

// Convert DD/MM/YYYY or similar to YYYY-MM-DD for Supabase date columns
function parseDateDMY(str) {
  if (!str || str === '-') return null;
  // Reject zero dates (0000-00-00, 00/00/0000, etc.)
  if (str.startsWith('0000') || str === '00/00/0000') return null;
  // Try DD/MM/YYYY
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const day = m[1].padStart(2, '0');
    const month = m[2].padStart(2, '0');
    if (day === '00' || month === '00') return null;
    const result = `${m[3]}-${month}-${day}`;
    return result.startsWith('0000') ? null : result;
  }
  // Already YYYY-MM-DD? Validate no zero day/month (e.g. "2033-07-00")
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    if (str.endsWith('-00') || str.includes('-00-')) return null;
    return str;
  }
  return null; // Return null instead of raw string to prevent DB errors
}

function getJakartaYear() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
  }).formatToParts(new Date());
  return Number(parts.find(p => p.type === 'year')?.value);
}

function parseBirthDateDMY(str) {
  const date = parseDateDMY(str);
  if (!date) return null;
  const birthYear = Number(date.slice(0, 4));
  if (!Number.isFinite(birthYear) || birthYear >= getJakartaYear()) return null;
  return date;
}

// ── Extract JS Handlers from legacy HTML ──
// Parses <script> tags and onchange attributes to find AJAX calls that populate
// dependent dropdowns (e.g., paket when jadwal changes). This is critical because
// paket options are client-side rendered via AJAX, not server-side templating.
function extractJsHandlers($, html) {
  const result = {
    jadwalOnchange: null,
    scriptFunctions: {},   // { funcName: funcBody }
    ajaxCalls: [],         // [{ url, method, dataHint, contextHint }]
    paketAjaxUrl: null,
    paketAjaxMethod: null,
    paketAjaxParam: null,
  };

  // 1. Grab onchange attributes on key form elements
  $('select, input').each((_, el) => {
    const name = $(el).attr('name');
    const onchange = $(el).attr('onchange');
    if (name === 'jadwal' && onchange) {
      result.jadwalOnchange = onchange;
    }
  });

  // 2. Parse all <script> contents
  const scriptContents = [];
  $('script').each((_, el) => {
    const content = $(el).html() || '';
    if (content.trim()) scriptContents.push(content);
  });
  const allScripts = scriptContents.join('\n\n');

  // 3. Extract named function declarations (function foo() { ... })
  // Covers: function getPaket(...) {}, var getPaket = function (...) {}
  const funcDeclPattern = /function\s+(\w+)\s*\([^)]*\)\s*\{([\s\S]*?)^\}/gm;
  let funcMatch;
  while ((funcMatch = funcDeclPattern.exec(allScripts)) !== null) {
    result.scriptFunctions[funcMatch[1]] = funcMatch[2].trim();
  }

  // Also catch `var foo = function(...) { ... }` and `const foo = function(...) { ... }`
  const assignFuncPattern = /(?:var|let|const)\s+(\w+)\s*=\s*function\s*\([^)]*\)\s*\{([\s\S]*?)^\}/gm;
  while ((funcMatch = assignFuncPattern.exec(allScripts)) !== null) {
    if (!result.scriptFunctions[funcMatch[1]]) {
      result.scriptFunctions[funcMatch[1]] = funcMatch[2].trim();
    }
  }

  // 4. Extract AJAX calls: $.ajax, $.get, $.post, $.load, $.getJSON, fetch
  const ajaxPatterns = [
    // $.ajax({ url: '...', type: 'GET'/'POST', data: {...} })
    {
      regex: /\$\.ajax\s*\(\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}\s*\)/g,
      parse: (body) => {
        const urlMatch = body.match(/url\s*:\s*['"]([^'"]+)['"]/);
        const typeMatch = body.match(/(?:type|method)\s*:\s*['"]([^'"]+)['"]/i);
        const dataMatch = body.match(/data\s*:\s*\{([^}]*)\}/);
        return {
          url: urlMatch?.[1],
          method: typeMatch?.[1]?.toUpperCase() || 'GET',
          dataHint: dataMatch?.[1]?.trim() || null,
        };
      },
    },
    // $.get('url', data, callback) or $.get('url')
    {
      regex: /\$\.get\s*\(\s*['"]([^'"]+)['"](?:\s*,\s*(\{[^}]*\}))?/g,
      parse: (_, url, data) => ({ url, method: 'GET', dataHint: data || null }),
    },
    // $.post('url', data, callback)
    {
      regex: /\$\.post\s*\(\s*['"]([^'"]+)['"](?:\s*,\s*(\{[^}]*\}))?/g,
      parse: (_, url, data) => ({ url, method: 'POST', dataHint: data || null }),
    },
    // $('...').load('url', data) — common for HTML fragment loading
    {
      regex: /\.load\s*\(\s*['"]([^'"]+)['"](?:\s*,\s*(\{[^}]*\}))?/g,
      parse: (_, url, data) => ({ url, method: 'GET', dataHint: data || null }),
    },
    // $.getJSON('url', ...)
    {
      regex: /\$\.getJSON\s*\(\s*['"]([^'"]+)['"]/g,
      parse: (_, url) => ({ url, method: 'GET', dataHint: null }),
    },
    // fetch('url', { method: '...' })
    {
      regex: /fetch\s*\(\s*['"]([^'"]+)['"](?:\s*,\s*\{([^}]*)\})?/g,
      parse: (_, url, opts) => {
        const methodMatch = opts?.match(/method\s*:\s*['"]([^'"]+)['"]/);
        return { url, method: methodMatch?.[1]?.toUpperCase() || 'GET', dataHint: null };
      },
    },
  ];

  for (const { regex, parse } of ajaxPatterns) {
    let match;
    while ((match = regex.exec(allScripts)) !== null) {
      let call;
      if (parse.length === 1) {
        // $.ajax parser takes the full body
        call = parse(match[1]);
      } else {
        call = parse(...match);
      }
      if (call?.url) {
        // Capture surrounding context (~200 chars before match) to help identify scope
        const contextStart = Math.max(0, match.index - 200);
        const contextHint = allScripts.slice(contextStart, match.index).slice(-150);
        result.ajaxCalls.push({ ...call, contextHint });
      }
    }
  }

  // 5. PRIORITY 1: If we have `jadwal onchange="fnName(this.value)"`, find the AJAX call
  //    inside that function body. This is the MOST RELIABLE source.
  if (result.jadwalOnchange) {
    const funcCallMatch = result.jadwalOnchange.match(/(\w+)\s*\(/);
    if (funcCallMatch) {
      const funcName = funcCallMatch[1];
      const funcBody = result.scriptFunctions[funcName];
      if (funcBody) {
        // Look for $.post('url', {data}) or $.get('url', {data}) or $.ajax({url, data, type})
        const postMatch = funcBody.match(/\$\.post\s*\(\s*['"]([^'"]+)['"](?:\s*,\s*\{([^}]*)\})?/);
        const getMatch = funcBody.match(/\$\.get\s*\(\s*['"]([^'"]+)['"](?:\s*,\s*\{([^}]*)\})?/);
        const ajaxMatch = funcBody.match(/\$\.ajax\s*\(\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/);
        const loadMatch = funcBody.match(/\.load\s*\(\s*['"]([^'"]+)['"](?:\s*,\s*\{([^}]*)\})?/);

        let url = null, method = null, dataHint = null;
        if (postMatch) { url = postMatch[1]; method = 'POST'; dataHint = postMatch[2]; }
        else if (getMatch) { url = getMatch[1]; method = 'GET'; dataHint = getMatch[2]; }
        else if (loadMatch) { url = loadMatch[1]; method = 'GET'; dataHint = loadMatch[2]; }
        else if (ajaxMatch) {
          const body = ajaxMatch[1];
          const urlM = body.match(/url\s*:\s*['"]([^'"]+)['"]/);
          const typeM = body.match(/(?:type|method)\s*:\s*['"]([^'"]+)['"]/i);
          const dataM = body.match(/data\s*:\s*\{([^}]*)\}/);
          url = urlM?.[1]; method = typeM?.[1]?.toUpperCase() || 'GET'; dataHint = dataM?.[1];
        }

        if (url) {
          result.paketAjaxUrl = url;
          result.paketAjaxMethod = method;
          // Parameter name from dataHint (e.g. "jadwal: val" → "jadwal")
          const paramMatch = (dataHint || '').match(/(\w+)\s*:/);
          result.paketAjaxParam = paramMatch?.[1] || 'jadwal';
          result.paketAjaxSource = `jadwal onchange → ${funcName}()`;
        }
      }
    }
  }

  // 5b. PRIORITY 2: Look for the legacy `otb(val)` function by name. When idb binding
  //     strips the jadwal select's onchange attribute, Priority 1 fails — but otb()
  //     is still defined in the script, and it holds the correct jadwal→paket AJAX call.
  if (!result.paketAjaxUrl && result.scriptFunctions.otb) {
    const funcBody = result.scriptFunctions.otb;
    const postMatch = funcBody.match(/\$\.post\s*\(\s*['"]([^'"]+)['"](?:\s*,\s*\{([^}]*)\})?/);
    const getMatch = funcBody.match(/\$\.get\s*\(\s*['"]([^'"]+)['"](?:\s*,\s*\{([^}]*)\})?/);
    let url = null, method = null, dataHint = null;
    if (postMatch) { url = postMatch[1]; method = 'POST'; dataHint = postMatch[2]; }
    else if (getMatch) { url = getMatch[1]; method = 'GET'; dataHint = getMatch[2]; }
    if (url) {
      result.paketAjaxUrl = url;
      result.paketAjaxMethod = method;
      const paramMatch = (dataHint || '').match(/(\w+)\s*:/);
      result.paketAjaxParam = paramMatch?.[1] || 'jadwal';
      result.paketAjaxSource = 'otb() function body';
    }
  }

  // 6. FALLBACK: Identify AJAX call whose URL/context mentions "paket" (less reliable;
  //    may pick a different paket-related handler like `_pkt.php` which is for price lookup)
  if (!result.paketAjaxUrl) {
    const paketCandidates = result.ajaxCalls.filter(c => {
      const urlLower = (c.url || '').toLowerCase();
      const contextLower = (c.contextHint || '').toLowerCase();
      // Exclude _pkt.php — that's for price lookup, not paket options
      if (urlLower.includes('_pkt.php')) return false;
      return urlLower.includes('paket') ||
             urlLower.includes('_otb.php') ||
             contextLower.includes('paket') ||
             (c.dataHint || '').toLowerCase().includes('paket');
    });

    const best = paketCandidates.find(c => (c.url || '').toLowerCase().includes('_otb.php'))
              || paketCandidates.find(c => (c.url || '').toLowerCase().includes('paket'))
              || paketCandidates[0];

    if (best) {
      result.paketAjaxUrl = best.url;
      result.paketAjaxMethod = best.method || 'GET';
      const paramMatch = (best.dataHint || '').match(/(\w+)\s*:/);
      result.paketAjaxParam = paramMatch?.[1] || 'jadwal';
      result.paketAjaxSource = 'url/context contains "paket"';
    }
  }

  return result;
}

// ── Fetch Umrah Registration Form: Extract dropdown options & form structure ──
// Optional: pass tglBerangkat to get paket options filtered by departure schedule
export async function fetchUmrahFormOptions(username, { tglBerangkat, idb } = {}) {
  const session = sessions.get(username);
  if (!session) return { success: false, error: 'Belum login' };

  if (Date.now() - session.createdAt > SESSION_TTL) {
    sessions.delete(username);
    return { success: false, error: 'Session kedaluwarsa, silakan login ulang' };
  }

  // Build URL — if tglBerangkat provided, include it as query param to trigger
  // server-side rendering of dependent fields (e.g. paket umroh for that schedule)
  const base = getSessionBase(session);
  let url = `${base}/pages/main.php?route=umrah&act=tdaftar`;
  if (tglBerangkat) {
    url += `&tgl_berangkat=${encodeURIComponent(tglBerangkat)}&berangkat=${encodeURIComponent(tglBerangkat)}&jadwal=${encodeURIComponent(tglBerangkat)}`;
  }
  // Bind to existing ID Umroh (group/family registration). Legacy uses dot-prefixed `.idb`.
  if (idb) {
    url += `&.idb=${encodeURIComponent(idb)}`;
    console.log(`[UmrahForm] Binding to existing ID Umroh via idb=${idb}, URL:`, url);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Cookie: session.cookie,
        'User-Agent': LEGACY_UA,
        'Referer': `${base}/pages/main.php?route=umrah`,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    refreshSessionCookies(session, res.headers);

    const html = await res.text();
    if (isSessionExpiredHtml(html)) {
      sessions.delete(username);
      return { success: false, reason: 'session_expired_remote', error: 'Sistem internal menolak akses form pendaftaran (sesi habis di sisi internal)' };
    }
    const blockingAlert = findBlockingLegacyDialog([extractLegacyAlert(html)]);
    if (idb && blockingAlert) {
      return {
        success: false,
        reason: 'legacy_form_rejected',
        error: `Alhijaz menolak tambah jamaah: ${blockingAlert}`,
      };
    }

    const $ = cheerio.load(html);

    // Find the registration form — pick the form with the most input fields (not header search form)
    let formEl = $('form').first();
    let maxFields = formEl.find('input, select, textarea').length;
    $('form').each((_, el) => {
      const count = $(el).find('input, select, textarea').length;
      if (count > maxFields) {
        formEl = $(el);
        maxFields = count;
      }
    });

    const formAction = formEl.attr('action') || '';
    console.log('[UmrahForm] Form found with', maxFields, 'fields, action:', formAction);

    // Strip PHP warnings/notices that legacy code sometimes prepends to values
    // (e.g. "Warning: Undefined variable $b in ... on line 836 >JBU1530.2026-06-13.17").
    // Defined here because both hiddenFields and select options use it.
    const stripPhpNoise = (label) => {
      if (!label) return label;
      let s = label;
      const lastOnLine = s.search(/on line \d+(?!.*on line \d+)/s);
      if (lastOnLine >= 0) {
        const tail = s.slice(lastOnLine).replace(/^on line \d+\s*>?\s*/, '');
        if (tail.length > 0) s = tail;
      }
      s = s.replace(/^(Warning|Notice|Fatal error|Deprecated)\s*:.*$/i, '');
      return s.trim();
    };

    // Extract hidden fields. Legacy PHP may echo warnings directly into a hidden
    // input's value; when that happens, try to salvage the real tail (e.g. the JBU
    // kode that PHP printed after the warning), otherwise drop the field.
    const hiddenFields = {};
    formEl.find('input[type="hidden"]').each((_, el) => {
      const name = $(el).attr('name');
      const rawValue = $(el).attr('value') || '';
      if (!name) return;
      const hasNoise = /<\s*b\s*>|<br|warning|notice|fatal/i.test(rawValue);
      const cleaned = hasNoise ? stripPhpNoise(rawValue) : rawValue;
      if (hasNoise && (!cleaned || /<\s*b\s*>|<br/i.test(cleaned))) {
        console.warn(`[UmrahForm] Skipping hidden field "${name}" — contains PHP error noise:`, rawValue.slice(0, 80));
        return;
      }
      hiddenFields[name] = cleaned;
    });

    // Helper to extract select options
    function extractOptions(selectName) {
      const opts = [];
      formEl.find(`select[name="${selectName}"] option`).each((_, el) => {
        const value = $(el).attr('value') || '';
        const label = $(el).text().trim();
        if (value || label) opts.push({ value, label });
      });
      return opts;
    }

    // Extract all select elements — search globally (not just inside first form)
    // because legacy layouts sometimes place selects outside form or in nested structures.
    // Prefer form-scoped selects when there's a conflict.
    // Skips placeholder options ("-", empty, "Pilih...") so frontend can detect
    // empty-state for dependent dropdowns.
    const isPlaceholderOption = (value, label) => {
      if (!value || value === '-' || value === '0') return true;
      if (!label || label === '-' || /^pilih/i.test(label.trim())) return true;
      return false;
    };
    const allSelects = {};
    // Tracks `<option selected>` values so the frontend can pre-fill locked dropdowns
    // (e.g. when .idb binds a parent jadwal, vjadwal comes back with selected=...)
    const selectedValues = {};
    const extractSelectOptions = (el) => {
      const opts = [];
      let selected = null;
      $(el).find('option').each((_, opt) => {
        const rawValue = $(opt).attr('value') || '';
        const value = stripPhpNoise(rawValue);
        const label = stripPhpNoise($(opt).text().trim());
        const isSelected = $(opt).attr('selected') !== undefined;
        if (isPlaceholderOption(value, label)) return;
        if (isSelected && !selected) selected = value;
        opts.push({ value, label });
      });
      return { opts, selected };
    };
    const recordSelect = (name, el) => {
      const { opts, selected } = extractSelectOptions(el);
      if (!allSelects[name] || allSelects[name].length === 0 || opts.length > allSelects[name].length) {
        allSelects[name] = opts;
      }
      if (selected && !selectedValues[name]) selectedValues[name] = selected;
    };

    // First: form-scoped selects
    formEl.find('select').each((_, el) => {
      const name = $(el).attr('name');
      if (name) recordSelect(name, el);
    });

    // Then: any select outside the form (fill in missing ones, or replace if form had empty)
    $('select').each((_, el) => {
      const name = $(el).attr('name');
      if (name) recordSelect(name, el);
    });

    // Log for debugging
    const selectSummary = Object.fromEntries(
      Object.entries(allSelects).map(([k, v]) => [k, v.length])
    );
    console.log('[UmrahForm] Selects found:', selectSummary);
    if (Object.keys(selectedValues).length > 0) {
      console.log('[UmrahForm] Pre-selected values:', selectedValues);
    }

    // Extract all input fields — search globally. Also capture pre-filled values
    // (legacy form may pre-populate inputs like `vidu` with the parent's ID when
    // .idb binds an existing registration).
    const allInputs = {};
    const inputDefaults = {};
    const collectInput = (el) => {
      const name = $(el).attr('name');
      const type = $(el).attr('type') || 'text';
      if (name && type !== 'hidden') {
        allInputs[name] = {
          type,
          placeholder: $(el).attr('placeholder') || '',
          required: $(el).attr('required') !== undefined,
        };
        const rawValue = $(el).attr('value');
        if (rawValue !== undefined && rawValue !== '') {
          const cleaned = stripPhpNoise(String(rawValue));
          if (cleaned) inputDefaults[name] = cleaned;
        }
      }
    };
    formEl.find('input').each((_, el) => collectInput(el));
    $('input').each((_, el) => { if (!allInputs[$(el).attr('name')]) collectInput(el); });

    // Sniff for a JBU jadwal pattern across hidden + input defaults. When .idb binds
    // a parent jadwal, the kode shows up somewhere in the pre-filled form data —
    // we fall back to this if no <option selected> was detected on vjadwal.
    if (!selectedValues.vjadwal && !selectedValues.jadwal) {
      const jbuPattern = /JBU\d+\.\d{4}-\d{2}-\d{2}\.\d+/;
      const scanPool = [...Object.values(hiddenFields), ...Object.values(inputDefaults)];
      for (const raw of scanPool) {
        const m = String(raw || '').match(jbuPattern);
        if (m) {
          const target = allSelects.vjadwal ? 'vjadwal' : allSelects.jadwal ? 'jadwal' : null;
          if (target) {
            // Confirm the match exists as an option — otherwise the lock would render an empty label
            const exists = allSelects[target].some(o => o.value === m[0]);
            if (exists) {
              selectedValues[target] = m[0];
              console.log(`[UmrahForm] Inferred ${target} from JBU pattern:`, m[0]);
              break;
            }
          }
        }
      }
    }

    // Extract textarea fields — search globally
    const allTextareas = {};
    const collectTextarea = (el) => {
      const name = $(el).attr('name');
      if (name) {
        allTextareas[name] = {
          placeholder: $(el).attr('placeholder') || '',
          required: $(el).attr('required') !== undefined,
        };
      }
    };
    formEl.find('textarea').each((_, el) => collectTextarea(el));
    $('textarea').each((_, el) => { if (!allTextareas[$(el).attr('name')]) collectTextarea(el); });

    // Extract JS handlers — critical for discovering the AJAX URL that populates paket
    const jsHandlers = extractJsHandlers($, html);
    if (jsHandlers.paketAjaxUrl) {
      console.log('[UmrahForm] Paket AJAX URL:', jsHandlers.paketAjaxMethod, jsHandlers.paketAjaxUrl, 'param:', jsHandlers.paketAjaxParam, `(source: ${jsHandlers.paketAjaxSource || '?'})`);
    }
    // Log ALL discovered AJAX calls so we can see what else is there
    console.log('[UmrahForm] All AJAX calls discovered:', jsHandlers.ajaxCalls.length);
    jsHandlers.ajaxCalls.forEach((c, i) => {
      console.log(`  [${i}] ${c.method} ${c.url}  data:${c.dataHint || '-'}  ctx:${(c.contextHint || '').slice(-80).replace(/\s+/g, ' ')}`);
    });
    console.log('[UmrahForm] JS functions found:', Object.keys(jsHandlers.scriptFunctions).join(', ') || '(none)');
    if (jsHandlers.jadwalOnchange) {
      console.log('[UmrahForm] jadwal onchange attr:', jsHandlers.jadwalOnchange);
    }
    // Dump the `pkt` function body — this is the legacy JS that builds the _pkt.php payload.
    // Knowing its exact format lets us match it and fix the "LUNAS bug" (price=0).
    if (jsHandlers.scriptFunctions.pkt) {
      console.log('[UmrahForm] pkt() body:\n' + jsHandlers.scriptFunctions.pkt);
    }

    // Cache the discovered handlers on the session for reuse by fetchUmrahDependentOptions
    // Note: `session` is the outer-scope var from the top of this function
    if (session) {
      session.jsHandlers = jsHandlers;
    }

    // ── Auto-fetch jdaftar-specific fields (kelamin, ktp, status_nikah, etc.) ──
    // The legacy form uses `ojd(val)` JS to load these when jdaftar changes.
    // We trigger it with the "Jamaah Baru" option so the fields are available immediately.
    try {
      const jdaftarOpts = allSelects.jdaftar || [];
      const jamaahBaru = jdaftarOpts.find(o => /jamaah\s*baru|baru/i.test(o.label));
      if (jamaahBaru?.value) {
        const jdaftarRes = await fetchUmrahJdaftarFields(username, jamaahBaru.value);
        if (jdaftarRes.success && jdaftarRes.fields) {
          // Merge jdaftar-specific fields into main form (don't override existing)
          for (const [name, opts] of Object.entries(jdaftarRes.fields.selects || {})) {
            if (!allSelects[name] || allSelects[name].length === 0) {
              allSelects[name] = opts;
            }
          }
          for (const [name, info] of Object.entries(jdaftarRes.fields.inputs || {})) {
            if (!allInputs[name]) allInputs[name] = info;
          }
          for (const [name, info] of Object.entries(jdaftarRes.fields.textareas || {})) {
            if (!allTextareas[name]) allTextareas[name] = info;
          }
          console.log('[UmrahForm] After jdaftar merge — Selects:', Object.fromEntries(
            Object.entries(allSelects).map(([k, v]) => [k, v.length])
          ));
        }
      }
    } catch (err) {
      console.warn('[UmrahForm] Failed to fetch jdaftar fields:', err.message);
    }

    return {
      success: true,
      formAction,
      hiddenFields,
      selects: allSelects,
      selectedValues,
      inputs: allInputs,
      textareas: allTextareas,
      jsHandlers,
      rawHtml: html,
    };

  } catch (err) {
    if (err.name === 'AbortError') {
      return { success: false, error: 'Sistem internal tidak merespons (timeout)' };
    }
    console.error('fetchUmrahFormOptions error:', err.message);
    return { success: false, error: 'Gagal mengambil form pendaftaran' };
  }
}

function collectLegacyFormFields($, formEl) {
  const values = {};
  const inputs = {};
  const textareas = {};
  const selects = {};
  const selectedValues = {};

  formEl.find('input').each((_, el) => {
    const name = $(el).attr('name');
    if (!name) return;
    const type = ($(el).attr('type') || 'text').toLowerCase();
    inputs[name] = {
      type,
      required: $(el).attr('required') !== undefined,
      disabled: $(el).attr('disabled') !== undefined,
      readonly: $(el).attr('readonly') !== undefined,
      placeholder: $(el).attr('placeholder') || '',
    };
    if (type === 'checkbox' || type === 'radio') {
      if ($(el).attr('checked') !== undefined) values[name] = $(el).attr('value') || '1';
      return;
    }
    if (type !== 'file' && type !== 'submit' && type !== 'button' && type !== 'reset') {
      values[name] = $(el).attr('value') || '';
    }
  });

  formEl.find('textarea').each((_, el) => {
    const name = $(el).attr('name');
    if (!name) return;
    textareas[name] = {
      required: $(el).attr('required') !== undefined,
      disabled: $(el).attr('disabled') !== undefined,
      readonly: $(el).attr('readonly') !== undefined,
      placeholder: $(el).attr('placeholder') || '',
    };
    values[name] = $(el).text() || '';
  });

  formEl.find('select').each((_, el) => {
    const name = $(el).attr('name');
    if (!name) return;
    const opts = [];
    let selected = '';
    $(el).find('option').each((_, opt) => {
      const value = $(opt).attr('value') || '';
      const label = $(opt).text().replace(/\s+/g, ' ').trim();
      const isSelected = $(opt).attr('selected') !== undefined;
      if (isSelected) selected = value;
      if (value || label) opts.push({ value, label });
    });
    if (!selected) selected = String($(el).val() || '');
    selects[name] = opts;
    selectedValues[name] = selected;
    values[name] = selected;
  });

  return { values, inputs, textareas, selects, selectedValues };
}

function legacyDateToIso(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : raw;
}

export async function fetchUmrahJamaahEditForm(username, { idUmroh, jmId } = {}) {
  const session = sessions.get(username);
  if (!session) return { success: false, reason: 'session_expired', error: 'Belum login' };

  if (Date.now() - session.createdAt > SESSION_TTL) {
    sessions.delete(username);
    return { success: false, reason: 'session_expired', error: 'Session kedaluwarsa' };
  }
  if (!idUmroh || !jmId) {
    return { success: false, error: 'ID Umroh/Jamaah tidak lengkap' };
  }

  const base = getSessionBase(session);
  const editUrl = `${base}/pages/main.php?route=umrah&act=edaftar&.idb=${encodeURIComponent(`${idUmroh}.${jmId}`)}`;

  try {
    const res = await fetch(editUrl, {
      method: 'GET',
      headers: {
        Cookie: session.cookie,
        'User-Agent': LEGACY_UA,
        'Referer': `${base}/pages/main.php?route=umrah&act=edit&id=${encodeURIComponent(idUmroh)}`,
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
    });
    refreshSessionCookies(session, res.headers);
    const html = await res.text();
    if (isSessionExpiredHtml(html)) {
      sessions.delete(username);
      return { success: false, reason: 'session_expired_remote', error: 'Session kedaluwarsa di sistem internal' };
    }

    const $ = cheerio.load(html);
    const formEl = $('form#mF').first();
    if (!formEl.length) {
      const blockingAlert = findBlockingLegacyDialog([extractLegacyAlert(html)]);
      return {
        success: false,
        reason: blockingAlert ? 'legacy_form_rejected' : 'form_not_found',
        error: blockingAlert ? `Alhijaz menolak form edit: ${blockingAlert}` : 'Form edit jamaah legacy tidak ditemukan',
      };
    }

    const form = collectLegacyFormFields($, formEl);
    form.values.tgl_lahir = legacyDateToIso(form.values.tlahir || form.values.tgl_lahir);

    const docUrl = `${base}/pages/main.php?route=dokumen&act=edit-dokumen&id=${encodeURIComponent(idUmroh)}&idj=${encodeURIComponent(jmId)}`;
    try {
      const docRes = await fetch(docUrl, {
        method: 'GET',
        headers: {
          Cookie: session.cookie,
          'User-Agent': LEGACY_UA,
          'Referer': editUrl,
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(12_000),
      });
      refreshSessionCookies(session, docRes.headers);
      const docHtml = await docRes.text();
      if (!isSessionExpiredHtml(docHtml)) {
        const $$ = cheerio.load(docHtml);
        const docForm = collectLegacyFormFields($$, $$('form').first());
        const rawPassport = String(docForm.values.no_passpor || '').trim();
        if (rawPassport && !/PASPOR\s+BELUM\s+DITERIMA/i.test(rawPassport)) {
          form.values.no_paspor = rawPassport;
        }
        const expired = legacyDateToIso(docForm.values.tgl_expired || '');
        if (expired) form.values.paspor_expired = expired;
      }
    } catch (err) {
      console.warn('[UmrahEditForm] Dokumen form fetch failed:', err.message);
    }

    return {
      success: true,
      formAction: formEl.attr('action') || '',
      values: form.values,
      inputs: form.inputs,
      textareas: form.textareas,
      selects: form.selects,
      selectedValues: form.selectedValues,
    };
  } catch (err) {
    if (err.name === 'AbortError') return { success: false, reason: 'timeout', error: 'Sistem internal tidak merespons (timeout)' };
    return { success: false, reason: 'unknown', error: err.message || 'Gagal mengambil form edit jamaah' };
  }
}

// ── Fetch Jdaftar Fields: Call _jdaftar.php with selected jdaftar value ──
// Triggered by function ojd(val) in legacy JS. The response contains fields
// specific to the jamaah type: kelamin, ktp, status_nikah, pekerjaan, pendamping,
// pengalaman, remarks, mahram, kondisi_jamaah, alamat, etc.
export async function fetchUmrahJdaftarFields(username, jdaftarValue) {
  const session = sessions.get(username);
  if (!session) return { success: false, error: 'Belum login' };

  if (Date.now() - session.createdAt > SESSION_TTL) {
    sessions.delete(username);
    return { success: false, error: 'Session kedaluwarsa, silakan login ulang' };
  }

  const base = getSessionBase(session);
  const url = `${base}/pages/route/data_umrah/_jdaftar.php`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Cookie: session.cookie,
        'User-Agent': LEGACY_UA,
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${base}/pages/main.php?route=umrah&act=tdaftar`,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: new URLSearchParams({ jdaftar: jdaftarValue }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    refreshSessionCookies(session, res.headers);

    if (!res.ok) {
      console.log('[UmrahJdaftar] HTTP', res.status);
      return { success: false, error: `HTTP ${res.status}` };
    }

    const html = await res.text();
    if (isSessionExpiredHtml(html)) {
      sessions.delete(username);
      return { success: false, error: 'Session kedaluwarsa di sistem internal' };
    }

    const fields = extractAllFieldsFromHtml(html);
    console.log(`[UmrahJdaftar] Fields loaded for jdaftar=${jdaftarValue}: ${Object.keys(fields.selects).length} selects, ${Object.keys(fields.inputs).length} inputs, ${Object.keys(fields.textareas).length} textareas`);
    return { success: true, fields };
  } catch (err) {
    console.error('[UmrahJdaftar] Error:', err.message);
    return { success: false, error: err.message };
  }
}

// ── Helper: Parse HTML fragment for <option> tags (used for AJAX responses) ──
function extractOptionsFromHtml(html) {
  const $ = cheerio.load(html);
  const opts = [];
  $('option').each((_, el) => {
    const value = $(el).attr('value') || '';
    const label = $(el).text().trim();
    if (value && label && value !== '-' && label !== '-') {
      opts.push({ value, label });
    }
  });
  return opts;
}

// ── Helper: Parse ALL form fields (selects/inputs/textareas) from an HTML fragment.
// Used for AJAX responses that inject additional form fields (e.g. _otb.php response
// which contains kelamin, ktp, status_nikah, pekerjaan, alamat, etc.)
function extractAllFieldsFromHtml(html) {
  const $ = cheerio.load(html);
  const selects = {};
  const inputs = {};
  const textareas = {};
  const hiddenFields = {};

  $('select').each((_, el) => {
    const name = $(el).attr('name');
    if (!name) return;
    const opts = [];
    $(el).find('option').each((_, opt) => {
      const value = $(opt).attr('value') || '';
      const label = $(opt).text().trim();
      // Skip placeholder options consistently with main form scraper
      if (!value || value === '-' || value === '0') return;
      if (!label || label === '-' || /^pilih/i.test(label)) return;
      opts.push({ value, label });
    });
    selects[name] = opts;
  });

  $('input').each((_, el) => {
    const name = $(el).attr('name');
    if (!name) return;
    const type = $(el).attr('type') || 'text';
    if (type === 'hidden') {
      hiddenFields[name] = $(el).attr('value') || '';
      return;
    }
    if (type === 'submit' || type === 'button' || type === 'reset') return;
    inputs[name] = {
      type,
      placeholder: $(el).attr('placeholder') || '',
      required: $(el).attr('required') !== undefined,
    };
  });

  $('textarea').each((_, el) => {
    const name = $(el).attr('name');
    if (!name) return;
    textareas[name] = {
      placeholder: $(el).attr('placeholder') || '',
      required: $(el).attr('required') !== undefined,
    };
  });

  return { selects, inputs, textareas, hiddenFields };
}

// ── Helper: Resolve URL relative to the form page base ──
function resolveAjaxUrl(url, base = BASE) {
  return normalizeLegacyUrl(url, base);
}

// ── Parse response text for options — tries multiple formats ──
function parseOptionsFromResponse(text) {
  const trimmed = text.trim();

  // 1. Try JSON format: [{value, label}, ...] or { options: [...] } or { data: [...] }
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const arr = Array.isArray(parsed) ? parsed
                : Array.isArray(parsed?.options) ? parsed.options
                : Array.isArray(parsed?.data) ? parsed.data
                : Array.isArray(parsed?.result) ? parsed.result
                : null;
      if (arr) {
        return arr
          .map(item => {
            if (typeof item === 'string') return { value: item, label: item };
            return {
              value: String(item.value ?? item.id ?? item.kode ?? item.code ?? item.key ?? ''),
              label: String(item.label ?? item.text ?? item.name ?? item.nama ?? item.title ?? item.value ?? ''),
            };
          })
          .filter(o => o.value && o.label && o.value !== '-');
      }
    } catch { /* not JSON, fall through */ }
  }

  // 2. Try HTML <option> tags (may be a fragment or full HTML)
  const htmlOpts = extractOptionsFromHtml(trimmed);
  if (htmlOpts.length > 0) return htmlOpts;

  // 3. Try newline-separated "value|label" or "value\tlabel" or "value,label"
  const lines = trimmed.split(/\r?\n/).filter(l => l.trim());
  if (lines.length > 1 && lines.length < 100) {
    const delim = lines[0].includes('|') ? '|' : lines[0].includes('\t') ? '\t' : null;
    if (delim) {
      const parsed = lines
        .map(l => l.split(delim).map(s => s.trim()))
        .filter(p => p.length >= 2 && p[0] && p[1] && p[0] !== '-')
        .map(p => ({ value: p[0], label: p.slice(1).join(' ') }));
      if (parsed.length > 0) return parsed;
    }
  }

  return [];
}

// ── Try the discovered paket AJAX URL with different method/param combinations ──
async function tryPaketAjax(session, jadwal, jsHandlers) {
  if (!jsHandlers?.paketAjaxUrl) return null;

  const base = getSessionBase(session);
  const baseUrl = resolveAjaxUrl(jsHandlers.paketAjaxUrl, base);
  const method = jsHandlers.paketAjaxMethod || 'GET';
  const paramName = jsHandlers.paketAjaxParam || 'jadwal';

  // Extract additional params from the JS dataHint if available
  // e.g., if dataHint = "pkt: x, jns: y, .jns: z", extract ["pkt", "jns", ".jns"]
  const discoveredParams = new Set([paramName]);
  for (const call of (jsHandlers.ajaxCalls || [])) {
    if (call.dataHint) {
      const paramMatches = call.dataHint.matchAll(/([\w.$]+)\s*:/g);
      for (const m of paramMatches) discoveredParams.add(m[1]);
    }
  }

  // Build attempts — each combines (method, primary param name, extra data context)
  const attempts = [];
  const commonParams = ['pkt', 'jadwal', 'berangkat', 'tgl_berangkat', 'kd_paket', 'paket', '.b', 'id'];

  // Start with the discovered param + method
  for (const param of [paramName, ...commonParams]) {
    if (!attempts.some(a => a.method === method && a.param === param)) {
      attempts.push({ method, param, data: {} });
    }
  }

  // Try opposite method with discovered param
  const oppositeMethod = method === 'GET' ? 'POST' : 'GET';
  attempts.push({ method: oppositeMethod, param: paramName, data: {} });

  // Try sending full context: main param + all other discovered params (empty values)
  const extraData = {};
  for (const p of discoveredParams) {
    if (p !== paramName) extraData[p] = '';
  }
  if (Object.keys(extraData).length > 0) {
    attempts.push({ method, param: paramName, data: extraData });
  }

  for (const attempt of attempts) {
    try {
      let url, body;
      const headers = {
        Cookie: session.cookie,
        'User-Agent': LEGACY_UA,
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${base}/pages/main.php?route=umrah&act=tdaftar`,
        'Accept': 'text/html, */*; q=0.01',
      };

      const params = { [attempt.param]: jadwal, ...attempt.data };

      if (attempt.method === 'POST') {
        url = baseUrl;
        body = new URLSearchParams(params).toString();
        headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
      } else {
        const qs = new URLSearchParams(params).toString();
        url = baseUrl + (baseUrl.includes('?') ? '&' : '?') + qs;
      }

      const res = await fetch(url, {
        method: attempt.method,
        headers,
        body,
        signal: AbortSignal.timeout(10_000),
      });
      refreshSessionCookies(session, res.headers);

      if (!res.ok) {
        console.log(`[UmrahDeps] Paket AJAX ${attempt.method} ${attempt.param} → HTTP ${res.status}`);
        continue;
      }

      const responseText = await res.text();
      const previewLen = responseText.length > 300 ? 800 : 200;
      const preview = responseText.trim().slice(0, previewLen).replace(/\s+/g, ' ');

      // Check for session expiration
      if (isSessionExpiredHtml(responseText)) {
        return { sessionExpired: true };
      }

      // Parse as multiple formats (HTML fragment, JSON, delimited text)
      const opts = parseOptionsFromResponse(responseText);
      if (opts.length > 0) {
        // Also extract all OTHER form fields from the response — the _otb.php response
        // injects additional fields (kelamin, ktp, status_nikah, etc.) into the #otb div.
        const allFields = extractAllFieldsFromHtml(responseText);
        console.log(`[UmrahDeps] Paket AJAX ✓ ${attempt.method} ${attempt.param} ${Object.keys(attempt.data).length ? '+ctx' : ''} → ${opts.length} paket options, +${Object.keys(allFields.selects).length} selects, +${Object.keys(allFields.inputs).length} inputs, +${Object.keys(allFields.textareas).length} textareas`);
        return {
          options: opts,
          sourceUrl: url,
          method: attempt.method,
          param: attempt.param,
          extraFields: allFields,
        };
      } else {
        console.log(`[UmrahDeps] Paket AJAX ${attempt.method} ${attempt.param} ${Object.keys(attempt.data).length ? '+ctx' : ''} → 0 options (${responseText.length} bytes). Preview: ${preview}`);
      }
    } catch (err) {
      console.log(`[UmrahDeps] Paket AJAX ERR ${attempt.method} ${attempt.param} → ${err.message}`);
    }
  }

  return null;
}

// ── Fetch Dependent Options: paket, vmarketing, perwakilan — all depend on jadwal ──
// Strategy: (1) If discovered paket AJAX URL from JS, use it directly.
//           (2) Also re-fetch form URL with ?jadwal=X to get vmarketing/perwakilan.
export async function fetchUmrahDependentOptions(username, jadwal) {
  const session = sessions.get(username);
  if (!session) return { success: false, error: 'Belum login' };

  if (Date.now() - session.createdAt > SESSION_TTL) {
    sessions.delete(username);
    return { success: false, error: 'Session kedaluwarsa, silakan login ulang' };
  }

  if (!jadwal) return { success: false, error: 'jadwal required' };

  const combined = {};
  let lastSourceUrl = null;
  const base = getSessionBase(session);
  // Extra fields discovered from _otb.php response (kelamin, ktp, status_nikah, etc.)
  let extraFields = null;

  // ── Step 1: Try discovered paket AJAX URL first (from JS analysis) ──
  if (session.jsHandlers?.paketAjaxUrl) {
    const paketResult = await tryPaketAjax(session, jadwal, session.jsHandlers);
    if (paketResult?.sessionExpired) {
      sessions.delete(username);
      return { success: false, error: 'Session kedaluwarsa di sistem internal' };
    }
    if (paketResult?.options?.length > 0) {
      combined.paket = paketResult.options;
      lastSourceUrl = paketResult.sourceUrl;
      if (paketResult.extraFields) {
        extraFields = paketResult.extraFields;
      }
    }
  } else {
    console.log('[UmrahDeps] No paket AJAX URL cached — run form-options first to discover it.');
  }

  const j = encodeURIComponent(jadwal);

  // ── Step 2: Re-fetch full form for vmarketing/perwakilan (and as paket fallback) ──
  const urls = [
    `${base}/pages/main.php?route=umrah&act=tdaftar&jadwal=${j}`,
    `${base}/pages/main.php?route=umrah&act=tdaftar&berangkat=${j}`,
    `${base}/pages/main.php?route=umrah&act=tdaftar&tgl_berangkat=${j}`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Cookie: session.cookie,
          'User-Agent': LEGACY_UA,
          'Referer': `${base}/pages/main.php?route=umrah&act=tdaftar`,
        },
        signal: AbortSignal.timeout(15_000),
      });
      refreshSessionCookies(session, res.headers);

      if (!res.ok) continue;
      const html = await res.text();
      if (isSessionExpiredHtml(html)) {
        sessions.delete(username);
        return { success: false, error: 'Session kedaluwarsa di sistem internal' };
      }

      const $ = cheerio.load(html);

      // Find the registration form (most fields)
      let formEl = $('form').first();
      let maxFields = formEl.find('input, select, textarea').length;
      $('form').each((_, el) => {
        const count = $(el).find('input, select, textarea').length;
        if (count > maxFields) {
          formEl = $(el);
          maxFields = count;
        }
      });

      // Extract dependent selects: paket, vmarketing, perwakilan
      const result = {};
      const extract = (sel) => {
        const opts = [];
        $(sel).find('option').each((_, opt) => {
          const value = $(opt).attr('value') || '';
          const label = $(opt).text().trim();
          if (value && label && value !== '-' && label !== '-') {
            opts.push({ value, label });
          }
        });
        return opts;
      };

      // Look for each dependent field (skip paket if already populated from AJAX in Step 1)
      const targetFields = combined.paket
        ? ['vmarketing', 'marketing', 'perwakilan', 'koordinator']
        : ['paket', 'vmarketing', 'marketing', 'perwakilan', 'koordinator'];

      for (const name of targetFields) {
        if (result[name]) continue;
        const sel = formEl.find(`select[name="${name}"]`);
        if (sel.length > 0) {
          const opts = extract(sel.first());
          if (opts.length > 0) result[name] = opts;
        }
      }

      // Global scan fallback
      if (Object.keys(result).length === 0) {
        $('select').each((_, el) => {
          const name = $(el).attr('name');
          if (!name || !targetFields.includes(name)) return;
          const opts = extract(el);
          if (opts.length > 0 && !result[name]) result[name] = opts;
        });
      }

      // Merge into combined result
      for (const [k, v] of Object.entries(result)) {
        if (!combined[k] && v.length > 0) combined[k] = v;
      }

      if (Object.keys(result).length > 0) {
        lastSourceUrl = url;
        break; // Stop trying other URLs once we got results
      }
    } catch (err) {
      console.warn('[UmrahDeps] URL failed:', url, err.message);
    }
  }

  console.log('[UmrahDeps] Jadwal:', jadwal, 'Found:', Object.fromEntries(
    Object.entries(combined).map(([k, v]) => [k, v.length])
  ), extraFields ? `+ extraFields (${Object.keys(extraFields.selects).length} selects, ${Object.keys(extraFields.inputs).length} inputs, ${Object.keys(extraFields.textareas).length} textareas)` : '');

  if (Object.keys(combined).length > 0) {
    return { success: true, data: combined, sourceUrl: lastSourceUrl, extraFields };
  }

  return { success: false, error: 'Tidak bisa mengambil opsi dependent' };
}

// ── Fetch Paket Options (legacy, kept for compatibility): Try multiple approaches ──
export async function fetchUmrahPaketOptions(username, tglBerangkat) {
  const session = sessions.get(username);
  if (!session) return { success: false, error: 'Belum login' };

  if (Date.now() - session.createdAt > SESSION_TTL) {
    sessions.delete(username);
    return { success: false, error: 'Session kedaluwarsa, silakan login ulang' };
  }

  if (!tglBerangkat) return { success: false, error: 'tglBerangkat required' };

  // Try common AJAX endpoint patterns used by legacy PHP systems.
  // Based on discovered form action: pages/route/data_umrah/aksi_umrah.php
  // So dependent dropdowns likely live in the same directory: pages/route/data_umrah/*.php
  const j = encodeURIComponent(tglBerangkat);
  const base = getSessionBase(session);
  const candidateUrls = [
    // data_umrah directory (discovered from form action)
    `${base}/pages/route/data_umrah/get_paket.php?jadwal=${j}`,
    `${base}/pages/route/data_umrah/paket.php?jadwal=${j}`,
    `${base}/pages/route/data_umrah/_paket.php?jadwal=${j}`,
    `${base}/pages/route/data_umrah/cpaket.php?jadwal=${j}`,
    `${base}/pages/route/data_umrah/_cpaket.php?jadwal=${j}`,
    `${base}/pages/route/data_umrah/aksi_umrah.php?act=getpaket&jadwal=${j}`,
    `${base}/pages/route/data_umrah/aksi_umrah.php?route=umrah&act=getpaket&jadwal=${j}`,
    `${base}/pages/route/data_umrah/aksi_umrah.php?route=umrah&act=paket&jadwal=${j}`,
    // Fallback: old guesses
    `${base}/pages/route/umrah/_paket.php?berangkat=${j}`,
    `${base}/pages/route/umrah/paket.php?berangkat=${j}`,
    // Re-render whole form with jadwal selected (last resort)
    `${base}/pages/main.php?route=umrah&act=tdaftar&jadwal=${j}`,
  ];

  const tried = [];

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Cookie: session.cookie,
          'User-Agent': LEGACY_UA,
          'X-Requested-With': 'XMLHttpRequest', // Common marker for AJAX requests
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        tried.push({ url, status: res.status });
        continue;
      }

      const body = await res.text();
      if (isSessionExpiredHtml(body)) {
        sessions.delete(username);
        return { success: false, error: 'Session kedaluwarsa di sistem internal' };
      }

      // Try parsing as options list — could be raw <option> tags or full HTML
      const $ = cheerio.load(body);
      const opts = [];

      // Look for <option> tags anywhere in the response
      $('option').each((_, el) => {
        const value = $(el).attr('value') || '';
        const label = $(el).text().trim();
        if (value && label && value !== '-' && label !== '-') {
          opts.push({ value, label });
        }
      });

      // If no options in <option>, try parsing full form and look for paket select
      if (opts.length === 0) {
        $('select[name*="paket" i]').find('option').each((_, el) => {
          const value = $(el).attr('value') || '';
          const label = $(el).text().trim();
          if (value && label && value !== '-' && label !== '-') {
            opts.push({ value, label });
          }
        });
      }

      tried.push({ url, status: res.status, optionsCount: opts.length });

      if (opts.length > 0) {
        return { success: true, options: opts, sourceUrl: url };
      }
    } catch (err) {
      tried.push({ url, error: err.message });
    }
  }

  return { success: false, error: 'Tidak bisa mengambil paket options', tried };
}

// ── Fetch Paket Details: call _pkt.php to get harga_paket, npaket, harga_perlengkapan ──
// Triggered by legacy JS function `pkt(val)` when paket dropdown changes.
// The endpoint returns HTML fragment with price/hidden fields — without these,
// legacy submit results in harga=0, sisa=0, which is treated as LUNAS (paid off).
export async function fetchUmrahPaketDetails(username, jadwal, paketValue) {
  const session = sessions.get(username);
  if (!session) return { success: false, error: 'Belum login' };

  if (!jadwal || !paketValue) {
    return { success: false, error: 'jadwal & paketValue required' };
  }

  // Build candidate pkt formats. Legacy JS is opaque; we try several and take the first
  // one whose hpaket parses as a non-zero number (real package price).
  const jadwalKode = jadwal.split('.')[0];
  const paketParts = paketValue.split('.');
  const paketSpecific = (paketParts[0] === jadwalKode ? paketParts.slice(1) : paketParts).join('.');
  const candidates = [
    `${jadwal}.${paketSpecific}`,      // JBU1530.2026-06-13.18.PKT042.RAHMAH.Triple
    paketValue,                         // raw as-is from _otb.php option value
    `${jadwalKode}.${paketSpecific}`,   // JBU1530.PKT042.RAHMAH.Triple
    `${jadwal}.${paketValue}`,          // duplicated kode (PHP might expect this)
  ];
  const base = getSessionBase(session);
  const url = `${base}/pages/route/data_umrah/_pkt.php`;

  const parseResponse = async (compositePkt) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Cookie: session.cookie,
        'User-Agent': LEGACY_UA,
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${base}/pages/main.php?route=umrah&act=tdaftar`,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: new URLSearchParams({ pkt: compositePkt }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    refreshSessionCookies(session, res.headers);

    if (!res.ok) return { ok: false, httpStatus: res.status };

    const html = await res.text();
    if (isSessionExpiredHtml(html)) {
      sessions.delete(username);
      return { ok: false, sessionExpired: true };
    }

    const $ = cheerio.load(html);
    const extractedFields = {};
    let hpaketRaw = null;
    $('input').each((_, el) => {
      const name = $(el).attr('name');
      let value = $(el).attr('value');
      if (!name || value === undefined) return;
      if (typeof value === 'string') {
        if (/<\s*b\s*>|<br|warning|notice|fatal/i.test(value)) {
          if (name === 'hpaket') hpaketRaw = value;
          return;
        }
        value = value.trim();
      }
      extractedFields[name] = value;
    });
    // hpaket is returned in Indonesian format "39.900.000" — strip dots before numeric parse
    const hpaketStr = String(extractedFields.hpaket || '').replace(/\./g, '');
    const hpaketNumeric = Number(hpaketStr) || 0;
    return { ok: true, compositePkt, extractedFields, hpaketNumeric, hpaketRaw, html };
  };

  try {
    let best = null;
    for (const compositePkt of candidates) {
      const attempt = await parseResponse(compositePkt);
      if (!attempt.ok) {
        if (attempt.sessionExpired) return { success: false, error: 'Session kedaluwarsa di sistem internal' };
        if (attempt.httpStatus) return { success: false, error: `HTTP ${attempt.httpStatus}` };
        continue;
      }
      console.log(`[UmrahPaketDetails] pkt="${compositePkt}" → hpaket=${attempt.hpaketNumeric}, fields=`, attempt.extractedFields);
      if (attempt.hpaketNumeric > 0) {
        return { success: true, fields: attempt.extractedFields };
      }
      if (!best) best = attempt;
    }
    // No candidate produced a non-zero hpaket — return the first attempt's fields + log
    // so we can diagnose. Caller should warn user that price wasn't resolved.
    console.warn('[UmrahPaketDetails] All pkt formats failed to resolve hpaket (>0). Tried:', candidates);
    if (best?.hpaketRaw) {
      console.warn('[UmrahPaketDetails] Raw hpaket PHP error:', best.hpaketRaw.slice(0, 200));
    }
    return {
      success: true,
      fields: best?.extractedFields || {},
      warning: 'hpaket not resolved — legacy system may mark registration as LUNAS',
    };
  } catch (err) {
    console.error('[UmrahPaketDetails] Error:', err.message);
    return { success: false, error: err.message };
  }
}

// ── Submit Umrah Registration: POST form data to legacy system ──
// Uses manual multipart body construction — proved reliable against legacy PHP.
// Field names with brackets (e.g. "nama[0]") are preserved literally so PHP
// parses them as array elements.
export async function submitUmrahRegistration(username, { formAction, fields, hiddenFields, fileBuffer, fileName, fileFieldName, idb }) {
  const session = sessions.get(username);
  if (!session) return { success: false, error: 'Belum login' };

  if (Date.now() - session.createdAt > SESSION_TTL) {
    sessions.delete(username);
    return { success: false, error: 'Session kedaluwarsa, silakan login ulang' };
  }

  // Build the full URL.
  const base = getSessionBase(session);
  let actionUrl;
  if (formAction.startsWith('http')) {
    actionUrl = normalizeLegacyUrl(formAction, base);
  } else if (formAction.startsWith('/')) {
    actionUrl = `${base}${formAction}`;
  } else {
    actionUrl = `${base}/pages/${formAction}`;
  }
  // Bind to existing ID Umroh so the new jamaah is grouped with the prior registration.
  if (idb) {
    actionUrl += (actionUrl.includes('?') ? '&' : '?') + `.idb=${encodeURIComponent(idb)}`;
    console.log(`[UmrahSubmit] Binding to ID Umroh ${idb}, submit URL:`, actionUrl);
  }

  try {
    const boundary = '----FormBoundary' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const textParts = [];

    // Hidden fields first
    if (hiddenFields) {
      for (const [key, value] of Object.entries(hiddenFields)) {
        textParts.push(
          `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
          `${value ?? ''}\r\n`
        );
      }
    }

    // Visible/user-entered fields (bracket names like "nama[0]" preserved literally)
    for (const [key, value] of Object.entries(fields)) {
      textParts.push(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
        `${value ?? ''}\r\n`
      );
    }

    // File field (if present) — use discovered field name
    const fldName = fileFieldName || 'file_ktp';
    let fileHeaderBuf = null;
    if (fileBuffer && fileName) {
      const ext = (fileName.split('.').pop() || '').toLowerCase();
      const mimeTypes = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', pdf: 'application/pdf' };
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      fileHeaderBuf = Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${fldName}"; filename="${fileName}"\r\n` +
        `Content-Type: ${contentType}\r\n\r\n`,
        'utf-8'
      );
      console.log(`[UmrahSubmit] File "${fileName}" (${fileBuffer.length} bytes, ${contentType}) attached as field "${fldName}"`);
    }

    // Assemble body as Buffer (supports both text and binary file)
    const textBuf = Buffer.from(textParts.join(''), 'utf-8');
    let bodyBuffer;
    if (fileBuffer && fileHeaderBuf) {
      const endBuf = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');
      bodyBuffer = Buffer.concat([textBuf, fileHeaderBuf, fileBuffer, endBuf]);
    } else {
      const endBuf = Buffer.from(`--${boundary}--\r\n`, 'utf-8');
      bodyBuffer = Buffer.concat([textBuf, endBuf]);
    }

    console.log(`[UmrahSubmit] POST ${actionUrl} — fields:`, Object.keys(fields).length, 'hidden:', Object.keys(hiddenFields || {}).length, 'file:', !!fileBuffer, 'body size:', bodyBuffer.length);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    let res;
    try {
      res = await fetch(actionUrl, {
        method: 'POST',
        headers: {
          Cookie: session.cookie,
          'User-Agent': LEGACY_UA,
          'Origin': base.replace(/\/aiw\/staff$/, ''),
          'Referer': `${base}/pages/main.php?route=umrah&act=tdaftar`,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(bodyBuffer.length),
        },
        body: bodyBuffer,
        redirect: 'manual',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    refreshSessionCookies(session, res.headers);

    // Check for redirect (usually means success in PHP forms)
    const location = res.headers.get('location') || '';
    const statusCode = res.status;

    // Read response body
    const responseHtml = await res.text();
    const responsePreview = responseHtml.trim().slice(0, 500).replace(/\s+/g, ' ');
    console.log(`[UmrahSubmit] Response status=${statusCode} length=${responseHtml.length} location="${location}"`);
    console.log(`[UmrahSubmit] Preview: ${responsePreview}`);

    // Detect session expired
    if (isSessionExpiredHtml(responseHtml)) {
      sessions.delete(username);
      return { success: false, reason: 'session_expired_remote', error: 'Session kedaluwarsa di sistem internal' };
    }

    // PHP forms typically redirect on success (302/303)
    if (statusCode >= 300 && statusCode < 400) {
      return { success: true, message: 'Pendaftaran jamaah berhasil', redirectUrl: location };
    }

    // Check for success indicators in response HTML
    const $ = cheerio.load(responseHtml);
    const alertSuccess = $('.alert-success').text().trim();
    if (alertSuccess) {
      return { success: true, message: alertSuccess || 'Pendaftaran jamaah berhasil' };
    }

    // Check for error indicators
    const alertError = $('.alert-danger, .alert-warning').text().trim();
    if (alertError) {
      return { success: false, error: alertError };
    }

    // If we got a 200 with no clear success/error, check if we're back on the form
    // (which might mean validation errors)
    const hasForm = $('form').length > 0;
    const errorMessages = [];
    $('.help-block, .error-message, .text-danger, .has-error .help-block').each((_, el) => {
      const text = $(el).text().trim();
      if (text) errorMessages.push(text);
    });

    if (errorMessages.length > 0) {
      return { success: false, error: errorMessages.join('; ') };
    }

    // If redirected back to list page or any success-like page
    if (responseHtml.includes('route=umrah') && !hasForm) {
      return { success: true, message: 'Pendaftaran jamaah berhasil' };
    }

    // Some legacy systems return JSON-like text (e.g., "1", "OK", "success") on success
    const trimmed = responseHtml.trim();
    if (trimmed === '1' || /^(ok|success|berhasil)/i.test(trimmed) || trimmed.length < 5) {
      console.log('[UmrahSubmit] Treating short response as success:', JSON.stringify(trimmed));
      return { success: true, message: 'Pendaftaran jamaah berhasil' };
    }

    // Status 200 with a form back usually means validation error — but if no error indicators
    // were found AND content suggests success/list redirect, treat as success.
    if (statusCode === 200 && (responseHtml.includes('AIW') || responseHtml.includes('jamaah'))) {
      console.log('[UmrahSubmit] Status 200 with AIW/jamaah keyword — treating as success');
      return { success: true, message: 'Pendaftaran jamaah berhasil (mungkin perlu verifikasi)' };
    }

    // Ambiguous — return the response for debugging
    console.log('[UmrahSubmit] AMBIGUOUS RESPONSE — full body length:', responseHtml.length);
    return {
      success: false,
      error: 'Tidak dapat menentukan hasil pendaftaran. Silakan cek di sistem internal.',
      debug: { statusCode, hasForm, location, responsePreview },
    };

  } catch (err) {
    const cause = err?.cause || err;
    const debug = {
      causeCode: cause?.code || err?.code || null,
      causeMessage: cause?.message || err?.message || String(err),
      bytesWritten: cause?.socket?.bytesWritten ?? null,
      bytesRead: cause?.socket?.bytesRead ?? null,
    };
    if (err.name === 'AbortError') {
      console.error('[UmrahSubmit] TIMEOUT:', debug);
      return {
        success: false,
        reason: 'transport_timeout',
        error: 'Sistem internal tidak merespons (timeout)',
        debug,
      };
    }
    console.error('[UmrahSubmit] EXCEPTION:', err.message, debug, err.stack);
    return {
      success: false,
      reason: 'transport_error',
      error: 'Koneksi ke sistem internal terputus. Silakan coba lagi.',
      debug,
    };
  }
}

function legacyFieldSelector(name) {
  return `[name="${String(name).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
}

function getUploadMimeType(fileName) {
  const ext = String(fileName || '').split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'pdf') return 'application/pdf';
  return 'application/octet-stream';
}

async function selectLegacyBrowserOption(page, name, value, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error(`Field ${name} wajib diisi`);
    return false;
  }
  const valueString = String(value);
  const loc = page.locator(`select${legacyFieldSelector(name)}`).first();
  if (await loc.count() === 0) {
    if (required) throw new Error(`Field ${name} tidak ditemukan di form legacy`);
    return false;
  }
  await loc.evaluate(el => {
    el.disabled = false;
    el.removeAttribute('readonly');
  });
  const hasOption = await loc.evaluate((el, selectedValue) => {
    return Array.from(el.options).some(option => option.value === selectedValue);
  }, valueString);
  if (!hasOption) {
    if (required) throw new Error(`Opsi ${name}=${valueString} tidak tersedia di form legacy`);
    return false;
  }
  await loc.selectOption(valueString);
  return true;
}

function normalizeLegacyDialogMessage(message) {
  const cleaned = String(message || '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.;:-]+/, '')
    .trim();
  if (!cleaned) return '';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function findBlockingLegacyDialog(dialogs) {
  return (dialogs || [])
    .map(normalizeLegacyDialogMessage)
    .find(message => {
      if (!message || /berhasil|success/i.test(message)) return false;
      const seatMatch = message.match(/sisa\s+seat\s*=\s*(\d+)/i);
      if (seatMatch && Number(seatMatch[1]) > 0) return false;
      return true;
    }) || '';
}

async function pickLegacyBrowserSelectName(page, names) {
  for (const name of names) {
    if (!name) continue;
    const count = await page.locator(`select${legacyFieldSelector(name)}`).count();
    if (count > 0) return name;
  }
  return '';
}

async function appendLegacyBrowserHidden(page, name, value) {
  return page.evaluate(({ name: fieldName, value: fieldValue }) => {
    const form = document.querySelector('form#mF') || document.querySelector('form');
    if (!form) return false;
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = fieldName;
    input.value = String(fieldValue ?? '');
    form.appendChild(input);
    return true;
  }, { name, value });
}

async function fillLegacyBrowserField(page, name, value) {
  if (value === undefined || value === null) return false;
  const valueString = String(value);
  const loc = page.locator(legacyFieldSelector(name)).first();
  if (await loc.count() === 0) return false;

  const tagName = await loc.evaluate(el => el.tagName.toLowerCase());
  const type = await loc.evaluate(el => (el.getAttribute('type') || '').toLowerCase());
  await loc.evaluate(el => {
    el.disabled = false;
    el.removeAttribute('readonly');
  });

  if (tagName === 'select') {
    return selectLegacyBrowserOption(page, name, value);
  }
  if (type === 'file') return false;
  if (type === 'checkbox' || type === 'radio') {
    await loc.evaluate((el, selectedValue) => {
      el.checked = !selectedValue || selectedValue === '1' || selectedValue.toLowerCase() === 'true' || selectedValue === el.value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, valueString);
    return true;
  }

  await loc.evaluate((el, selectedValue) => {
    el.value = selectedValue;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, valueString);
  return true;
}

async function setLegacyBrowserFile(page, fileBuffer, fileName, fileFieldName) {
  if (!fileBuffer || !fileName) return false;
  const fieldName = fileFieldName || 'file_ktp';
  const loc = page.locator(`input[type="file"]${legacyFieldSelector(fieldName)}`).first();
  if (await loc.count() === 0) {
    console.warn(`[UmrahBrowserSubmit] File field "${fieldName}" tidak ditemukan; submit dilanjutkan tanpa file.`);
    return false;
  }
  await loc.setInputFiles({
    name: fileName,
    mimeType: getUploadMimeType(fileName),
    buffer: fileBuffer,
  });
  return true;
}

// These values are populated by the live jadwal/paket AJAX flow in the fresh
// browser form. Never overwrite them with the stale snapshot sent by the SPA.
const BROWSER_MANAGED_UMRAH_FIELDS = new Set([
  'pin',
  'hpaket',
  'harga_paket',
  'npaket',
  'harga_perlengkapan',
  'lain',
]);

async function readLegacyBrowserPackagePrice(page) {
  return page.evaluate(() => {
    const names = ['hpaket', 'harga_paket', 'harga', 'hpkt'];
    let firstFound = null;
    for (const name of names) {
      const element = document.querySelector(`[name="${name}"]`);
      if (!element) continue;
      const value = String(element.value || '').trim();
      const numeric = Number(value.replace(/[^0-9]/g, '')) || 0;
      const state = { name, value, numeric };
      if (!firstFound) firstFound = state;
      if (numeric > 0) return state;
    }
    return firstFound || { name: '', value: '', numeric: 0 };
  });
}

async function waitForLegacyAjax(page, urlPart, timeout = 15_000) {
  return page.waitForResponse(res => res.url().includes(urlPart), { timeout }).catch(() => null);
}

async function getLegacyBrowserRecaptchaConfig(page) {
  return page.evaluate(({ fallbackSiteKey, fallbackTokenField }) => {
    const scripts = Array.from(document.scripts)
      .map(script => `${script.src || ''}\n${script.textContent || ''}`)
      .join('\n');

    const executeMatch = scripts.match(/grecaptcha\.execute\(\s*['"]([^'"]+)['"]/i);
    const actionMatch = scripts.match(/grecaptcha\.execute\(\s*['"][^'"]+['"]\s*,\s*\{\s*action\s*:\s*['"]([^'"]+)['"]/i);
    const renderMatch = scripts.match(/recaptcha\/api\.js\?render=([^'"\s&]+)/i);
    const siteKey = executeMatch?.[1]
      || (renderMatch?.[1] ? decodeURIComponent(renderMatch[1]) : '')
      || fallbackSiteKey;

    const tokenNameMatch =
      scripts.match(/name\s*:\s*['"]([^'"]+)['"]\s*,\s*value\s*:\s*isi/i) ||
      scripts.match(/name\s*:\s*['"]([^'"]+)['"][\s\S]{0,240}?value\s*:\s*isi/i);
    const tokenIdMatch =
      scripts.match(/id\s*:\s*['"]([^'"]+)['"][\s\S]{0,240}?name\s*:\s*['"][^'"]+['"][\s\S]{0,240}?value\s*:\s*isi/i);

    return {
      siteKey,
      action: actionMatch?.[1] || 'submit',
      tokenField: tokenNameMatch?.[1] || fallbackTokenField,
      tokenId: tokenIdMatch?.[1] || 'legacy_recaptcha_token',
      source: tokenNameMatch?.[1] ? 'legacy_script' : 'fallback',
    };
  }, {
    fallbackSiteKey: UMRAH_RECAPTCHA_SITE_KEY,
    fallbackTokenField: UMRAH_RECAPTCHA_FIELD_NAME,
  });
}

// Browser submit for the final legacy mutation. The current Alhijaz form requires
// a reCAPTCHA v3 token that only exists after the page JavaScript runs, so this is
// the primary submit path whenever a saved legacy password is available.
export async function submitUmrahRegistrationWithBrowser({
  username,
  password,
  kantor = '2',
  fields = {},
  hiddenFields = {},
  fileBuffer,
  fileName,
  fileFieldName,
  idb,
  retryBlocked = true,
  dryRun = false,
}) {
  if (!username || !password) {
    return { success: false, error: 'Credential sistem internal tidak lengkap' };
  }

  let browser;
  const dialogs = [];
  let finalSubmitRequestSeen = false;
  let pageClosed = false;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1365, height: 900 },
      userAgent: LEGACY_UA,
    });
    const page = await context.newPage();

    page.on('dialog', async dialog => {
      const message = normalizeLegacyDialogMessage(dialog.message());
      dialogs.push(message);
      console.log('[UmrahBrowserSubmit] Dialog:', message);
      await dialog.accept().catch(() => {});
    });
    page.on('pageerror', err => {
      console.warn('[UmrahBrowserSubmit] Page error:', err.message);
    });
    page.on('request', request => {
      if (request.method() === 'POST' && request.url().includes('aksi_umrah.php')) {
        finalSubmitRequestSeen = true;
      }
    });
    page.on('close', () => {
      pageClosed = true;
    });

    await page.goto(`${BROWSER_BASE}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.selectOption('select[name="kantor"]', String(kantor || '2'));
    await page.fill('input[name="username"]', username);
    await page.fill('input[name="password"]', password);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30_000 }),
      page.click('button[type="submit"], input[type="submit"]'),
    ]);

    if (await page.locator('input[name="username"]').count()) {
      return { success: false, error: 'Login sistem internal ditolak saat fallback browser' };
    }

    let formUrl = `${BROWSER_BASE}/pages/main.php?route=umrah&act=tdaftar`;
    if (idb) formUrl += `&.idb=${encodeURIComponent(idb)}`;
    await page.goto(formUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(300);
    if (await page.locator('form#mF').count() === 0) {
      const blockingDialog = findBlockingLegacyDialog(dialogs);
      if (blockingDialog) {
        return {
          success: false,
          error: `Alhijaz menolak pendaftaran: ${blockingDialog}`,
          debug: { browserFallback: true, dialogs, stage: 'form_load' },
        };
      }
      const html = await page.content().catch(() => '');
      if (isSessionExpiredHtml(html)) {
        return { success: false, reason: 'session_expired_remote', error: 'Session kedaluwarsa di sistem internal' };
      }
      return { success: false, error: 'Form pendaftaran legacy tidak ditemukan saat fallback browser' };
    }

    const jdaftarValue = fields.jdaftar || '1';
    const jdaftarWait = waitForLegacyAjax(page, '_jdaftar.php');
    await selectLegacyBrowserOption(page, 'jdaftar', jdaftarValue, { required: true });
    const jdaftarResponse = await jdaftarWait;
    if (!jdaftarResponse?.ok()) {
      return {
        success: false,
        reason: 'legacy_dependency_failed',
        error: 'Field data jamaah gagal dimuat dari Alhijaz. Silakan coba lagi.',
        debug: { browserFallback: true, stage: 'jdaftar', statusCode: jdaftarResponse?.status() || null },
      };
    }
    await page.waitForSelector(`${legacyFieldSelector('ktp')}, select${legacyFieldSelector('kelamin')}`, { timeout: 15_000 }).catch(() => {});

    const jadwalValue = fields.jadwal || fields.vjadwal || fields.berangkat || fields.tgl_berangkat;
    const paketValue = fields.paket || fields.paket_umroh;
    if (jadwalValue) {
      const paketWait = waitForLegacyAjax(page, '_otb.php');
      const jadwalFieldName = await pickLegacyBrowserSelectName(page, ['vjadwal', 'jadwal', 'berangkat', 'tgl_berangkat']);
      if (!jadwalFieldName) throw new Error('Field jadwal tidak ditemukan di form legacy');
      await selectLegacyBrowserOption(page, jadwalFieldName, jadwalValue, { required: true });
      const paketResponse = await paketWait;
      if (!paketResponse?.ok()) {
        return {
          success: false,
          reason: 'legacy_dependency_failed',
          error: 'Daftar paket gagal dimuat dari Alhijaz. Silakan coba lagi.',
          debug: { browserFallback: true, stage: 'jadwal', statusCode: paketResponse?.status() || null },
        };
      }
      await page.waitForTimeout(300);
      const blockingDialog = findBlockingLegacyDialog(dialogs);
      if (blockingDialog) {
        return {
          success: false,
          error: `Alhijaz menolak jadwal/paket: ${blockingDialog}`,
          debug: { browserFallback: true, dialogs, stage: 'jadwal' },
        };
      }
      await page.waitForSelector(`select${legacyFieldSelector('paket')} option`, { state: 'attached', timeout: 15_000 }).catch(() => {});
    }
    if (paketValue) {
      const detailWait = waitForLegacyAjax(page, '_pkt.php');
      await selectLegacyBrowserOption(page, 'paket', paketValue, { required: true });
      const detailResponse = await detailWait;
      if (!detailResponse?.ok()) {
        return {
          success: false,
          reason: 'legacy_dependency_failed',
          error: 'Harga paket gagal dimuat dari Alhijaz. Silakan coba lagi.',
          debug: { browserFallback: true, stage: 'paket', statusCode: detailResponse?.status() || null },
        };
      }
      await page.waitForTimeout(300);
      const blockingDialog = findBlockingLegacyDialog(dialogs);
      if (blockingDialog) {
        return {
          success: false,
          error: `Alhijaz menolak jadwal/paket: ${blockingDialog}`,
          debug: { browserFallback: true, dialogs, stage: 'paket' },
        };
      }
    }

    for (const [name, value] of Object.entries(hiddenFields || {})) {
      // Use the browser's fresh anti-CSRF/session pin from the current form.
      if (BROWSER_MANAGED_UMRAH_FIELDS.has(name)) continue;
      if (value === undefined || value === null || value === '') continue;
      await fillLegacyBrowserField(page, name, value);
    }

    const dependencyFields = new Set([
      'jdaftar', 'jadwal', 'vjadwal', 'berangkat', 'tgl_berangkat', 'paket', 'paket_umroh',
    ]);
    for (const [name, value] of Object.entries(fields || {})) {
      if (dependencyFields.has(name) || BROWSER_MANAGED_UMRAH_FIELDS.has(name)) continue;
      const filled = await fillLegacyBrowserField(page, name, value);
      if (!filled) await appendLegacyBrowserHidden(page, name, value);
    }

    const fileAttached = await setLegacyBrowserFile(page, fileBuffer, fileName, fileFieldName);
    if (fileBuffer && fileName && !fileAttached) {
      return {
        success: false,
        reason: 'file_field_missing',
        error: 'Kolom upload KTP tidak ditemukan pada form Alhijaz. Muat ulang form lalu coba lagi.',
        debug: { browserFallback: true, stage: 'file', fileFieldName },
      };
    }

    if (paketValue) {
      const packagePrice = await readLegacyBrowserPackagePrice(page);
      console.log('[UmrahBrowserSubmit] Fresh package price:', packagePrice);
      if (!packagePrice.name || packagePrice.numeric <= 0) {
        return {
          success: false,
          reason: 'package_price_unresolved',
          error: 'Harga paket belum berhasil dimuat dari Alhijaz. Pilih ulang jadwal dan paket, lalu coba lagi.',
          debug: { browserFallback: true, dialogs, packagePrice, stage: 'package_price' },
        };
      }
    }

    const preSubmitDialog = findBlockingLegacyDialog(dialogs);
    if (preSubmitDialog) {
      return {
        success: false,
        error: `Alhijaz menolak pendaftaran: ${preSubmitDialog}`,
        debug: { browserFallback: true, dialogs, stage: 'pre_submit' },
      };
    }

    const submitResponsePromise = dryRun
      ? null
      : page.waitForResponse(
        res => res.url().includes('aksi_umrah.php'),
        { timeout: 25_000 },
      ).catch(() => null);

    const recaptchaConfig = await getLegacyBrowserRecaptchaConfig(page);
    if (!recaptchaConfig.tokenField) {
      return {
        success: false,
        error: 'Field reCAPTCHA legacy tidak ditemukan',
        debug: { browserFallback: true, dialogs, recaptchaSource: recaptchaConfig.source },
      };
    }

    const tokenInfo = await page.evaluate(async ({ siteKey, tokenAction, tokenField, tokenId, isDryRun }) => {
      const started = Date.now();
      while (Date.now() - started < 20_000) {
        if (window.grecaptcha && typeof window.grecaptcha.execute === 'function') break;
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      if (!window.grecaptcha || typeof window.grecaptcha.execute !== 'function') {
        return { ok: false, error: 'grecaptcha tidak tersedia' };
      }
      const token = await window.grecaptcha.execute(siteKey, { action: tokenAction || 'submit' });
      if (!token) return { ok: false, error: 'token reCAPTCHA kosong' };
      if (isDryRun) return { ok: true, length: token.length, dryRun: true };
      const form = document.querySelector('form#mF');
      if (!form) return { ok: false, error: 'form legacy hilang sebelum submit' };
      const input = document.createElement('input');
      input.type = 'hidden';
      input.id = tokenId || 'legacy_recaptcha_token';
      input.name = tokenField;
      input.value = token;
      form.appendChild(input);
      HTMLFormElement.prototype.submit.call(form);
      return { ok: true, length: token.length };
    }, {
      siteKey: recaptchaConfig.siteKey,
      tokenAction: recaptchaConfig.action,
      tokenField: recaptchaConfig.tokenField,
      tokenId: recaptchaConfig.tokenId,
      isDryRun: dryRun,
    });

    if (!tokenInfo.ok) {
      return {
        success: false,
        error: tokenInfo.error || 'Gagal membuat token reCAPTCHA legacy',
        debug: { browserFallback: true, dialogs },
      };
    }
    if (tokenInfo.dryRun) {
      return {
        success: true,
        dryRun: true,
        message: 'Preflight browser pendaftaran berhasil',
        debug: {
          browserFallback: true,
          tokenLength: tokenInfo.length,
          recaptchaSource: recaptchaConfig.source,
          recaptchaAction: recaptchaConfig.action,
        },
      };
    }

    const submitResponse = await submitResponsePromise;
    await new Promise(resolve => setTimeout(resolve, 1_500));
    const html = await page.content().catch(() => '');
    const statusCode = submitResponse?.status() || null;
    const responseUrl = submitResponse?.url() || '';
    const responsePreview = submitResponse
      ? (await submitResponse.text().catch(() => '')).trim().slice(0, 500).replace(/\s+/g, ' ')
      : '';
    const currentUrl = pageClosed ? formUrl : page.url();
    const sessionDialog = dialogs.find(message => /Sesi Anda habis|silahkan re-login/i.test(message));
    const successDialog = dialogs.find(message => /berhasil|success/i.test(message));
    const blockingDialog = findBlockingLegacyDialog(dialogs);
    const formStillOpen = await page.locator('form#mF').count().catch(() => 0);

    console.log('[UmrahBrowserSubmit] Result:', {
      statusCode,
      responseUrl,
      currentUrl,
      dialogs,
      formStillOpen,
      tokenLength: tokenInfo.length,
      recaptchaSource: recaptchaConfig.source,
      recaptchaAction: recaptchaConfig.action,
      responsePreview,
    });

    if (sessionDialog || isSessionExpiredHtml(html)) {
      return {
        success: false,
        reason: 'session_expired_remote',
        error: 'Session kedaluwarsa di sistem internal',
        debug: { browserFallback: true, statusCode, responseUrl, currentUrl, dialogs },
      };
    }
    if (successDialog) {
      return { success: true, message: successDialog || 'Pendaftaran jamaah berhasil' };
    }
    if (blockingDialog) {
      return {
        success: false,
        error: `Alhijaz menolak pendaftaran: ${blockingDialog}`,
        debug: { browserFallback: true, statusCode, responseUrl, currentUrl, dialogs, responsePreview },
      };
    }
    if (statusCode === 403 && retryBlocked) {
      console.warn('[UmrahBrowserSubmit] Final submit HTTP 403 — retrying once with a fresh browser session');
      await browser.close().catch(() => {});
      browser = null;
      await new Promise(resolve => setTimeout(resolve, 1_000));
      return submitUmrahRegistrationWithBrowser({
        username,
        password,
        kantor,
        fields,
        hiddenFields,
        fileBuffer,
        fileName,
        fileFieldName,
        idb,
        retryBlocked: false,
        dryRun,
      });
    }
    if (statusCode === 403) {
      const cloudflareLike = /cloudflare|cf-error|attention required|<!doctype html/i.test(responsePreview);
      return {
        success: false,
        error: cloudflareLike
          ? 'Alhijaz/Cloudflare sedang menolak submit (HTTP 403). Cek daftar jamaah dulu; kalau belum masuk, coba ulang beberapa saat lagi.'
          : 'Alhijaz menolak submit (HTTP 403). Cek daftar jamaah dulu; kalau belum masuk, coba ulang beberapa saat lagi.',
        debug: { browserFallback: true, statusCode, responseUrl, currentUrl, dialogs, responsePreview },
      };
    }
    if (statusCode && statusCode >= 200 && statusCode < 400 && !formStillOpen && /route=umrah/.test(currentUrl)) {
      return { success: true, message: 'Pendaftaran jamaah berhasil' };
    }

    const alertText = dialogs.find(Boolean);
    return {
      success: false,
      error: alertText || 'Submit browser tidak mengembalikan status berhasil',
      debug: { browserFallback: true, statusCode, responseUrl, currentUrl, dialogs, formStillOpen, responsePreview },
    };
  } catch (err) {
    const successDialog = dialogs.find(message => /berhasil|success/i.test(message));
    if (successDialog) {
      return { success: true, message: successDialog || 'Pendaftaran jamaah berhasil' };
    }
    console.error('[UmrahBrowserSubmit] EXCEPTION:', err.message, {
      finalSubmitRequestSeen,
      pageClosed,
      dialogs,
    });
    if (finalSubmitRequestSeen) {
      return {
        success: false,
        reason: 'submit_outcome_unknown',
        error: 'Pendaftaran sudah terkirim tetapi hasilnya belum dapat dipastikan. Cek daftar jamaah sebelum mencoba lagi.',
        debug: { browserFallback: true, finalSubmitRequestSeen, pageClosed, dialogs, message: err.message },
      };
    }
    return {
      success: false,
      reason: 'browser_submit_exception',
      error: 'Browser pendaftaran gagal sebelum data dikirim. Silakan coba lagi.',
      debug: { browserFallback: true, finalSubmitRequestSeen, pageClosed, dialogs, message: err.message },
    };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

function normalizeLegacyCompareText(value) {
  return String(value || '').replace(/\s+/g, '').trim().toUpperCase();
}

function isoDateToLegacyDmy(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return raw;
}

function isoDateForLegacyInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  return raw;
}

async function getLegacyBrowserFieldValue(page, name) {
  const loc = page.locator(`${legacyFieldSelector(name)}`).first();
  if (await loc.count() === 0) return '';
  return loc.evaluate(el => el.value || '').catch(() => '');
}

async function enableLegacyBrowserField(page, name) {
  const loc = page.locator(`${legacyFieldSelector(name)}`).first();
  if (await loc.count() === 0) return false;
  await loc.evaluate(el => {
    el.disabled = false;
    el.readOnly = false;
    el.removeAttribute('disabled');
    el.removeAttribute('readonly');
  });
  return true;
}

async function loginLegacyBrowserPage(page, { username, password, kantor }) {
  await page.goto(`${BROWSER_BASE}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.selectOption('select[name="kantor"]', String(kantor || '2'));
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30_000 }),
    page.click('button[type="submit"], input[type="submit"]'),
  ]);

  if (await page.locator('input[name="username"]').count()) {
    return { success: false, error: 'Login sistem internal ditolak saat edit jamaah' };
  }
  return { success: true };
}

async function submitCurrentLegacyBrowserFormWithRecaptcha(page, dialogs, {
  responseUrlPart,
  operationLabel,
  successMessage,
}) {
  const submitResponsePromise = page.waitForResponse(
    res => res.url().includes(responseUrlPart),
    { timeout: 25_000 },
  ).catch(() => null);

  const recaptchaConfig = await getLegacyBrowserRecaptchaConfig(page);
  if (!recaptchaConfig.tokenField) {
    return {
      success: false,
      error: 'Field reCAPTCHA legacy tidak ditemukan',
      debug: { browserEdit: true, dialogs, operation: operationLabel, recaptchaSource: recaptchaConfig.source },
    };
  }

  const tokenInfo = await page.evaluate(async ({ siteKey, tokenAction, tokenField, tokenId }) => {
    const started = Date.now();
    while (Date.now() - started < 20_000) {
      if (window.grecaptcha && typeof window.grecaptcha.execute === 'function') break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!window.grecaptcha || typeof window.grecaptcha.execute !== 'function') {
      return { ok: false, error: 'grecaptcha tidak tersedia' };
    }
    const token = await window.grecaptcha.execute(siteKey, { action: tokenAction || 'submit' });
    if (!token) return { ok: false, error: 'token reCAPTCHA kosong' };
    const form = document.querySelector('form#mF') || document.querySelector('form');
    if (!form) return { ok: false, error: 'form legacy hilang sebelum submit' };
    const input = document.createElement('input');
    input.type = 'hidden';
    input.id = tokenId || 'legacy_recaptcha_token';
    input.name = tokenField;
    input.value = token;
    form.appendChild(input);
    HTMLFormElement.prototype.submit.call(form);
    return { ok: true, length: token.length };
  }, {
    siteKey: recaptchaConfig.siteKey,
    tokenAction: recaptchaConfig.action,
    tokenField: recaptchaConfig.tokenField,
    tokenId: recaptchaConfig.tokenId,
  });

  if (!tokenInfo.ok) {
    return {
      success: false,
      error: tokenInfo.error || 'Gagal membuat token reCAPTCHA legacy',
      debug: { browserEdit: true, dialogs, operation: operationLabel },
    };
  }

  const submitResponse = await submitResponsePromise;
  await page.waitForTimeout(1_500);
  const html = await page.content().catch(() => '');
  const statusCode = submitResponse?.status() || null;
  const responseUrl = submitResponse?.url() || '';
  const responsePreview = submitResponse
    ? (await submitResponse.text().catch(() => '')).trim().slice(0, 500).replace(/\s+/g, ' ')
    : '';
  const currentUrl = page.url();
  const sessionDialog = dialogs.find(message => /Sesi Anda habis|silahkan re-login/i.test(message));
  const successDialog = dialogs.find(message => /berhasil|success/i.test(message));
  const blockingDialog = findBlockingLegacyDialog(dialogs);
  const formStillOpen = await page.locator('form#mF').count().catch(() => 0);

  console.log('[UmrahBrowserEdit] Result:', {
    operation: operationLabel,
    statusCode,
    responseUrl,
    currentUrl,
    dialogs,
    formStillOpen,
    tokenLength: tokenInfo.length,
    recaptchaSource: recaptchaConfig.source,
    recaptchaAction: recaptchaConfig.action,
    responsePreview,
  });

  if (sessionDialog || isSessionExpiredHtml(html)) {
    return {
      success: false,
      reason: 'session_expired_remote',
      error: 'Session kedaluwarsa di sistem internal',
      debug: { browserEdit: true, statusCode, responseUrl, currentUrl, dialogs, operation: operationLabel },
    };
  }
  if (successDialog) {
    return { success: true, message: successDialog || successMessage };
  }
  if (blockingDialog) {
    return {
      success: false,
      error: `Alhijaz menolak edit jamaah: ${blockingDialog}`,
      debug: { browserEdit: true, statusCode, responseUrl, currentUrl, dialogs, responsePreview, operation: operationLabel },
    };
  }
  if (statusCode === 403) {
    const cloudflareLike = /cloudflare|cf-error|attention required|<!doctype html/i.test(responsePreview);
    return {
      success: false,
      error: cloudflareLike
        ? 'Alhijaz/Cloudflare sedang menolak submit edit (HTTP 403). Coba ulang beberapa saat lagi.'
        : 'Alhijaz menolak submit edit (HTTP 403). Coba ulang beberapa saat lagi.',
      debug: { browserEdit: true, statusCode, responseUrl, currentUrl, dialogs, responsePreview, operation: operationLabel },
    };
  }
  if (statusCode && statusCode >= 200 && statusCode < 400 && !formStillOpen) {
    return { success: true, message: successMessage };
  }

  return {
    success: false,
    error: dialogs.find(Boolean) || 'Submit edit internal tidak mengembalikan status berhasil',
    debug: { browserEdit: true, statusCode, responseUrl, currentUrl, dialogs, formStillOpen, responsePreview, operation: operationLabel },
  };
}

async function submitLegacyDocumentEditForm(page, dialogs, {
  idUmroh,
  jmId,
  fields = {},
}) {
  const needsDocumentUpdate =
    fields.no_paspor !== undefined ||
    fields.paspor_expired !== undefined;
  if (!needsDocumentUpdate) return { success: true, skipped: true };

  const documentUrl = `${BROWSER_BASE}/pages/main.php?route=dokumen&act=edit-dokumen&id=${encodeURIComponent(idUmroh)}&idj=${encodeURIComponent(jmId)}`;
  await page.goto(documentUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(300);

  if (await page.locator('form').count() === 0) {
    const html = await page.content().catch(() => '');
    if (isSessionExpiredHtml(html)) {
      return { success: false, reason: 'session_expired_remote', error: 'Session kedaluwarsa di sistem internal' };
    }
    return { success: false, error: 'Form dokumen jamaah legacy tidak ditemukan' };
  }

  const formIds = await page.evaluate(() => ({
    idu: document.querySelector('[name="idu"]')?.value || '',
    idj: document.querySelector('[name="idj"]')?.value || '',
  }));
  if (formIds.idu && formIds.idu !== idUmroh) {
    return { success: false, error: 'Form dokumen internal tidak cocok dengan ID Umroh jamaah' };
  }
  if (formIds.idj && formIds.idj !== jmId) {
    return { success: false, error: 'Form dokumen internal tidak cocok dengan ID Jamaah' };
  }

  if (fields.nama !== undefined) {
    await enableLegacyBrowserField(page, 'nama_jamaah');
    await fillLegacyBrowserField(page, 'nama_jamaah', fields.nama || '');
  }
  if (fields.no_paspor !== undefined && fields.no_paspor !== null && fields.no_paspor !== '') {
    await enableLegacyBrowserField(page, 'no_passpor');
    await fillLegacyBrowserField(page, 'no_passpor', fields.no_paspor);
  }
  if (fields.paspor_expired !== undefined) {
    await enableLegacyBrowserField(page, 'tgl_expired');
    await fillLegacyBrowserField(page, 'tgl_expired', isoDateForLegacyInput(fields.paspor_expired));
  }

  const submitResponsePromise = page.waitForResponse(
    res => res.url().includes('aksi_dokumen.php'),
    { timeout: 25_000 },
  ).catch(() => null);

  const submitButton = page.locator('input[type="submit"], button[type="submit"]').first();
  if (await submitButton.count() === 0) {
    return { success: false, error: 'Tombol submit dokumen legacy tidak ditemukan' };
  }
  await submitButton.click();

  const submitResponse = await submitResponsePromise;
  await page.waitForTimeout(1_500);
  const html = await page.content().catch(() => '');
  const statusCode = submitResponse?.status() || null;
  const responseUrl = submitResponse?.url() || '';
  const responsePreview = submitResponse
    ? (await submitResponse.text().catch(() => '')).trim().slice(0, 500).replace(/\s+/g, ' ')
    : '';
  const sessionDialog = dialogs.find(message => /Sesi Anda habis|silahkan re-login/i.test(message));
  const successDialog = dialogs.find(message => /berhasil|success/i.test(message));
  const blockingDialog = findBlockingLegacyDialog(dialogs);

  console.log('[UmrahBrowserEditDocs] Result:', {
    statusCode,
    responseUrl,
    currentUrl: page.url(),
    dialogs,
    responsePreview,
  });

  if (sessionDialog || isSessionExpiredHtml(html)) {
    return { success: false, reason: 'session_expired_remote', error: 'Session kedaluwarsa di sistem internal' };
  }
  if (successDialog) return { success: true, message: successDialog };
  if (blockingDialog) return { success: false, error: `Alhijaz menolak edit dokumen: ${blockingDialog}` };
  if (!statusCode || (statusCode >= 200 && statusCode < 400)) {
    return { success: true, message: 'Dokumen jamaah berhasil diperbarui' };
  }
  return {
    success: false,
    error: 'Submit dokumen internal tidak mengembalikan status berhasil',
    debug: { browserEdit: true, statusCode, responseUrl, responsePreview },
  };
}

export async function submitUmrahJamaahEditWithBrowser({
  username,
  password,
  kantor = '2',
  idUmroh,
  jmId,
  fields = {},
  retryBlocked = true,
}) {
  if (!username || !password) {
    return { success: false, error: 'Credential sistem internal tidak lengkap' };
  }
  if (!idUmroh || !jmId) {
    return { success: false, error: 'ID Umroh/Jamaah internal tidak lengkap' };
  }

  let browser;
  const dialogs = [];
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1365, height: 900 },
      userAgent: LEGACY_UA,
    });
    const page = await context.newPage();

    page.on('dialog', async dialog => {
      const message = normalizeLegacyDialogMessage(dialog.message());
      dialogs.push(message);
      console.log('[UmrahBrowserEdit] Dialog:', message);
      await dialog.accept().catch(() => {});
    });
    page.on('pageerror', err => {
      console.warn('[UmrahBrowserEdit] Page error:', err.message);
    });

    const loginResult = await loginLegacyBrowserPage(page, { username, password, kantor });
    if (!loginResult.success) return loginResult;

    const editUrl = `${BROWSER_BASE}/pages/main.php?route=umrah&act=edaftar&.idb=${encodeURIComponent(`${idUmroh}.${jmId}`)}`;
    await page.goto(editUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(300);
    if (await page.locator('form#mF').count() === 0) {
      const blockingDialog = findBlockingLegacyDialog(dialogs);
      if (blockingDialog) {
        return {
          success: false,
          error: `Alhijaz menolak edit jamaah: ${blockingDialog}`,
          debug: { browserEdit: true, dialogs, stage: 'form_load' },
        };
      }
      const html = await page.content().catch(() => '');
      if (isSessionExpiredHtml(html)) {
        return { success: false, reason: 'session_expired_remote', error: 'Session kedaluwarsa di sistem internal' };
      }
      return { success: false, error: 'Form edit jamaah legacy tidak ditemukan' };
    }

    const formIds = await page.evaluate(() => ({
      idu: document.querySelector('[name="idu"]')?.value || '',
      idjamaah: document.querySelector('[name="idjamaah"]')?.value || '',
    }));
    if (formIds.idu && formIds.idu !== idUmroh) {
      return { success: false, error: 'Form edit internal tidak cocok dengan ID Umroh jamaah' };
    }
    if (formIds.idjamaah && formIds.idjamaah !== jmId) {
      return { success: false, error: 'Form edit internal tidak cocok dengan ID Jamaah' };
    }

    const originalName = await getLegacyBrowserFieldValue(page, 'nlengkap');
    const originalPhone = await getLegacyBrowserFieldValue(page, 'tjamaah');
    const originalPendaftar = await getLegacyBrowserFieldValue(page, 'pendaftar');
    const originalPendaftarPhone = await getLegacyBrowserFieldValue(page, 'tpendaftar');

    if (fields.nama !== undefined) {
      await fillLegacyBrowserField(page, 'nlengkap', fields.nama || '');
      if (
        !originalPendaftar ||
        normalizeLegacyCompareText(originalPendaftar) === normalizeLegacyCompareText(originalName)
      ) {
        await fillLegacyBrowserField(page, 'pendaftar', fields.nama || '');
      }
    }
    if (fields.wa !== undefined) {
      await fillLegacyBrowserField(page, 'tjamaah', fields.wa || '');
      if (!originalPendaftarPhone || originalPendaftarPhone === originalPhone) {
        await fillLegacyBrowserField(page, 'tpendaftar', fields.wa || '');
      }
    }
    if (fields.tgl_lahir !== undefined) {
      await fillLegacyBrowserField(page, 'tlahir', isoDateToLegacyDmy(fields.tgl_lahir));
    }

    const fieldMap = {
      jk: 'kelamin',
      kelamin: 'kelamin',
      ktp: 'ktp',
      pendaftar: 'pendaftar',
      tpendaftar: 'tpendaftar',
      tempat_lahir: 'plahir',
      plahir: 'plahir',
      status: 'status',
      pekerjaan: 'pekerjaan',
      pendamping: 'pendamping',
      pengalaman: 'pengalaman',
      remarks: 'remarks',
      mahram: 'mahram',
      kondisi: 'kondisi',
      alamat: 'alamat',
      prov: 'prov',
      kab: 'kab',
      kec: 'kec',
      kel: 'kel',
      keterangan: 'keterangan',
    };
    for (const [incomingName, legacyName] of Object.entries(fieldMap)) {
      if (fields[incomingName] === undefined) continue;
      await fillLegacyBrowserField(page, legacyName, fields[incomingName] || '');
    }

    const preSubmitDialog = findBlockingLegacyDialog(dialogs);
    if (preSubmitDialog) {
      return {
        success: false,
        error: `Alhijaz menolak edit jamaah: ${preSubmitDialog}`,
        debug: { browserEdit: true, dialogs, stage: 'pre_submit' },
      };
    }

    let biodataResult = await submitCurrentLegacyBrowserFormWithRecaptcha(page, dialogs, {
      responseUrlPart: 'aksi_umrah.php',
      operationLabel: 'jamaah_biodata',
      successMessage: 'Edit data jamaah berhasil',
    });

    if (!biodataResult.success && biodataResult.debug?.statusCode === 403 && retryBlocked) {
      console.warn('[UmrahBrowserEdit] Final submit HTTP 403 — retrying once with a fresh browser session');
      await browser.close().catch(() => {});
      browser = null;
      await new Promise(resolve => setTimeout(resolve, 1_000));
      return submitUmrahJamaahEditWithBrowser({
        username,
        password,
        kantor,
        idUmroh,
        jmId,
        fields,
        retryBlocked: false,
      });
    }

    if (!biodataResult.success) return biodataResult;

    const documentResult = await submitLegacyDocumentEditForm(page, dialogs, {
      idUmroh,
      jmId,
      fields,
    });
    if (!documentResult.success) return documentResult;

    return {
      success: true,
      message: biodataResult.message || 'Edit data jamaah berhasil',
      documentUpdated: !documentResult.skipped,
    };
  } catch (err) {
    console.error('[UmrahBrowserEdit] EXCEPTION:', err.message);
    return { success: false, error: 'Edit internal gagal: ' + err.message };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// ── Get session cookie for reuse (e.g. haji sync) ──
export function getSessionCookie(username) {
  const session = sessions.get(username);
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_TTL) {
    sessions.delete(username);
    return null;
  }
  return session.cookie;
}

// ── Disconnect: Logout from PHP server + remove local session ──
// Set skipRemoteLogout=true for background sync to avoid rate-limiting on Alhijaz server
export async function disconnect(username, { skipRemoteLogout = false } = {}) {
  const session = sessions.get(username);
  if (session?.cookie && !skipRemoteLogout) {
    // Destroy PHP session on remote server (best-effort)
    try {
      const base = getSessionBase(session);
      await fetch(`${base}/logout.php`, {
        method: 'GET',
        headers: {
          'Cookie': session.cookie,
          'User-Agent': LEGACY_UA,
        },
        redirect: 'manual', // Don't follow redirect — it creates a new orphan PHP session
        signal: AbortSignal.timeout(5_000),
      });
    } catch {} // Don't fail if logout request fails
  }
  sessions.delete(username);
  return { success: true, message: session ? 'Berhasil disconnect' : 'Session tidak ditemukan' };
}
