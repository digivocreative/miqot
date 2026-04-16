/**
 * Laporan API — Lightweight HTTP session-based fetch (no Playwright)
 *
 * POST /api/laporan/login       → login via native fetch, store PHPSESSID
 * GET  /api/laporan/fetch       → fetch laporan HTML using stored cookie
 * POST /api/laporan/sync        → fetch + parse + return structured data
 * POST /api/laporan/disconnect  → clear session
 */

import * as cheerio from 'cheerio';

const BASE = (process.env.INTERNAL_API_BASE || 'http://115.124.86.220') + '/aiw/staff';

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
// Retries on 403 (Apache rate-limit) with exponential backoff
export async function login(username, password, kantor = '2') {
  const MAX_ATTEMPTS = 3;
  const BACKOFF_BASE = 10_000; // 10s, 20s, 40s

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
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
        signal: AbortSignal.timeout(30_000), // 30s timeout for login
      });

      // Handle Apache rate-limiting (403) — wait and retry
      if (res.status === 403) {
        const wait = BACKOFF_BASE * Math.pow(2, attempt);
        console.warn(`[Login] ${username}: 403 rate-limited, retry ${attempt + 1}/${MAX_ATTEMPTS} in ${wait / 1000}s`);
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
        return { success: false, error: 'Server rate-limit (403) — coba lagi nanti', reason: 'rate_limited' };
      }

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
      console.error('Laporan login error:', err.message, err.cause);
      return { success: false, error: 'Gagal menghubungi sistem internal' };
    }
  }
  return { success: false, error: 'Login gagal setelah retry' };
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
  const ob = `${kantor}.${agentId}`;
  const url = `${BASE}/pages/route/laporan_data_jamaah/_claporanm.php?.ob=${encodeURIComponent(ob)}&.tgw=${encodeURIComponent(tglAwal)}&.tgk=${encodeURIComponent(tglAkhir)}&.m=${encodeURIComponent(agentId)}`;

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
      if (html.includes('cek_login.php') || html.includes('Sign in to start your session')) {
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

  const url = `${BASE}/pages/main.php?route=umrah`;

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
    if (html.includes('cek_login.php')) {
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
      
      const months = { 'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12', 'Okt': '10', 'Agt': '08' };

      // Parse DD MMM YYYY to YYYY-MM-DD
      let tgl_berangkat = null;
      if (tgl_berangkat_raw) {
          const m = tgl_berangkat_raw.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
          if (m) {
             const mName = m[2].substring(0, 3);
             tgl_berangkat = `${m[3]}-${months[mName] || '01'}-${m[1].padStart(2, '0')}`;
          }
      }

      let tgl_daftar = null;
      if (tgl_daftar_raw) {
          const m = tgl_daftar_raw.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
          if (m) {
             const mName = m[2].substring(0, 3);
             tgl_daftar = `${m[3]}-${months[mName] || '01'}-${m[1].padStart(2, '0')}`;
          }
      }

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

    return { success: true, bookings };
  } catch (err) {
    return { success: false, error: 'Gagal mengambil data umrah summary' };
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

  const url = `${BASE}/pages/main.php?route=umrah&act=edit&id=${idUmroh}`;

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
    if (html.includes('cek_login.php')) {
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
      const tgl_berangkat_raw = jadwalParts.length >= 2 ? cheerio.load(jadwalParts[1]).text().trim() : '';

      let tgl_berangkat = null;
      if (tgl_berangkat_raw) {
        const months = { 'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04', 'MAY': '05', 'JUN': '06',
                         'JUL': '07', 'AUG': '08', 'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12' };
        const m = tgl_berangkat_raw.match(/(\d{1,2})\s+([A-Z]+)\s+(\d{4})/i);
        if (m) {
          tgl_berangkat = `${m[3]}-${months[m[2].toUpperCase()] || '01'}-${m[1].padStart(2, '0')}`;
        }
      }

      // col[4]: HARGA PAKET (rupiah string "38.700.000")
      const hargaPaket = parseRupiah($(tds[4]).text().trim());
      // col[7]: SISA PAKET
      const sisaPaket = parseRupiah($(tds[7]).text().trim());
      // bayar = harga - sisa
      const bayar = hargaPaket - sisaPaket;

      // col[14]: STATUS BAYAR
      const statusBayar = $(tds[14])?.text()?.trim() || '';

      jamaahItems.push({
        id_umroh: idUmroh,
        nama,
        jk: jk || null,
        bayar: bayar > 0 ? bayar : 0,
        sisa: sisaPaket,
        tgl_berangkat,
        raw_data: { jm_id: jmId, status_bayar: statusBayar, harga_paket: hargaPaket, source: 'umrah_detail' },
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
      await fetch(`${BASE}/logout.php`, {
        method: 'GET',
        headers: {
          'Cookie': session.cookie,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        redirect: 'manual', // Don't follow redirect — it creates a new orphan PHP session
        signal: AbortSignal.timeout(5_000),
      });
    } catch {} // Don't fail if logout request fails
  }
  sessions.delete(username);
  return { success: true, message: session ? 'Berhasil disconnect' : 'Session tidak ditemukan' };
}
