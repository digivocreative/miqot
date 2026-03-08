/**
 * Laporan API — Lightweight HTTP session-based fetch (no Playwright)
 *
 * POST /api/laporan/login       → login via native fetch, store PHPSESSID
 * GET  /api/laporan/fetch       → fetch laporan HTML using stored cookie
 * POST /api/laporan/sync        → fetch + parse + return structured data
 * POST /api/laporan/disconnect  → clear session
 */

import * as cheerio from 'cheerio';

const BASE = 'http://115.124.86.220/aiw/staff';

// ── In-memory session store with TTL (1 hour) ──
const sessions = new Map();
const SESSION_TTL = 60 * 60 * 1000; // 1 hour

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
export async function login(username, password, kantor = '2') {
  try {
    const body = new URLSearchParams({
      kantor,
      username,
      password,
      z: '',
    });

    const res = await fetch(`${BASE}/cek_login.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: body.toString(),
      redirect: 'manual', // Don't follow redirect — capture Set-Cookie first
    });

    // Extract cookies from Set-Cookie header
    let cookies;
    if (typeof res.headers.getSetCookie === 'function') {
      // Node 18.14+
      cookies = res.headers.getSetCookie();
    } else if (typeof res.headers.raw === 'function') {
      // Older Node / node-fetch fallback
      cookies = res.headers.raw()['set-cookie'] || [];
    } else {
      // Last resort: try get
      const raw = res.headers.get('set-cookie');
      cookies = raw ? [raw] : [];
    }

    if (!cookies || cookies.length === 0) {
      return { success: false, error: 'Login gagal — username atau password salah' };
    }

    // Extract PHPSESSID value
    const phpSessionCookie = cookies.find(c => c.includes('PHPSESSID'));
    if (!phpSessionCookie) {
      return { success: false, error: 'Login gagal — username atau password salah' };
    }

    // Build cookie string for subsequent requests
    const cookieString = cookies
      .map(c => c.split(';')[0]) // take only name=value part
      .join('; ');

    // Store session keyed by username
    sessions.set(username, {
      cookie: cookieString,
      kantor,
      createdAt: Date.now(),
    });

    return {
      success: true,
      message: 'Berhasil login ke sistem internal',
    };

  } catch (err) {
    if (err.cause?.code === 'ECONNREFUSED' || err.cause?.code === 'ETIMEDOUT') {
      return { success: false, error: 'Sistem internal tidak dapat dihubungi' };
    }
    console.error('Laporan login error:', err.message);
    return { success: false, error: 'Gagal menghubungi sistem internal' };
  }
}

// ── Fetch Laporan: Build URL server-side (prevent SSRF), GET with cookie ──
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
  const ob = `${kantor}.${agentId}`;
  const url = `${BASE}/pages/route/laporan_data_jamaah/_claporanm.php?.ob=${encodeURIComponent(ob)}&.tgw=${encodeURIComponent(tglAwal)}&.tgk=${encodeURIComponent(tglAkhir)}&.m=${encodeURIComponent(agentId)}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Cookie: session.cookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      redirect: 'follow',
    });

    const html = await res.text();

    // Check if redirected to login page (session expired on remote)
    if (html.includes('cek_login.php') || html.includes('Sign in to start your session')) {
      sessions.delete(username);
      return { success: false, error: 'Session kedaluwarsa di sistem internal, silakan login ulang' };
    }

    return {
      success: true,
      html,
    };

  } catch (err) {
    if (err.cause?.code === 'ECONNREFUSED' || err.cause?.code === 'ETIMEDOUT') {
      return { success: false, error: 'Sistem internal tidak merespons' };
    }
    console.error('Laporan fetch error:', err.message);
    return { success: false, error: 'Gagal mengambil data laporan' };
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
    const jmIdSmall = namaCell.find('small').text().trim(); // "JM...50706"
    // Get the actual name: text after <br>, or all text minus the small tag content
    let nama = '';
    const namaCellHtml = namaCell.html() || '';
    const brParts = namaCellHtml.split(/<br\s*\/?>/i);
    if (brParts.length >= 2) {
      // Text after the <br> is the actual name
      nama = cheerio.load(brParts.slice(1).join(' ')).text().trim();
    } else {
      // Fallback: get full text and remove the JM... prefix
      const fullText = namaCell.text().trim();
      nama = fullText.replace(jmIdSmall, '').trim();
    }
    if (!nama) nama = namaCell.text().trim();

    // col3: L/P
    const jk = $(tds[3]).text().trim();

    // col4: TELP
    const wa = $(tds[4]).text().trim();

    // col5: TGL LAHIR
    const tgl_lahir = parseDateDMY($(tds[5]).text().trim());

    // col6: PAKET
    const paket = $(tds[6]).text().trim();

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

    if (id_umroh && nama) {
      items.push({
        id_umroh,
        nama,
        jk: jk || null,
        wa: wa || null,
        tgl_lahir,
        paket: paket || null,
        bayar,
        sisa,
        tgl_berangkat,
        tgl_daftar: null, // Not in this table
        raw_data: { jm_id: jmIdSmall, cols_count: tds.length },
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
  // Try DD/MM/YYYY
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  // Already YYYY-MM-DD? Return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  return str; // fallback
}

// ── Disconnect: Remove session ──
export function disconnect(username) {
  const existed = sessions.delete(username);
  return { success: true, message: existed ? 'Berhasil disconnect' : 'Session tidak ditemukan' };
}
