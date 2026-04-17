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

    const tail = html.slice(-4096).toLowerCase();
    const complete = tail.includes('</html>') || tail.includes('</body>');
    return { success: true, complete, bookings };
  } catch (err) {
    return { success: false, complete: false, error: 'Gagal mengambil data umrah summary' };
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

  // 6. FALLBACK: Identify AJAX call whose URL/context mentions "paket" (less reliable;
  //    may pick a different paket-related handler like `_pkt.php` which is for price lookup)
  if (!result.paketAjaxUrl) {
    const paketCandidates = result.ajaxCalls.filter(c => {
      const urlLower = (c.url || '').toLowerCase();
      const contextLower = (c.contextHint || '').toLowerCase();
      return urlLower.includes('paket') ||
             contextLower.includes('paket') ||
             (c.dataHint || '').toLowerCase().includes('paket');
    });

    const best = paketCandidates.find(c => (c.url || '').toLowerCase().includes('paket'))
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
export async function fetchUmrahFormOptions(username, { tglBerangkat } = {}) {
  const session = sessions.get(username);
  if (!session) return { success: false, error: 'Belum login' };

  if (Date.now() - session.createdAt > SESSION_TTL) {
    sessions.delete(username);
    return { success: false, error: 'Session kedaluwarsa, silakan login ulang' };
  }

  // Build URL — if tglBerangkat provided, include it as query param to trigger
  // server-side rendering of dependent fields (e.g. paket umroh for that schedule)
  let url = `${BASE}/pages/main.php?route=umrah&act=tdaftar`;
  if (tglBerangkat) {
    url += `&tgl_berangkat=${encodeURIComponent(tglBerangkat)}&berangkat=${encodeURIComponent(tglBerangkat)}&jadwal=${encodeURIComponent(tglBerangkat)}`;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Cookie: session.cookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const html = await res.text();
    if (html.includes('cek_login.php') || html.includes('Sign in to start your session')) {
      sessions.delete(username);
      return { success: false, error: 'Session kedaluwarsa di sistem internal' };
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

    // Extract hidden fields
    const hiddenFields = {};
    formEl.find('input[type="hidden"]').each((_, el) => {
      const name = $(el).attr('name');
      const value = $(el).attr('value') || '';
      if (name) hiddenFields[name] = value;
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
    const allSelects = {};
    const extractSelectOptions = (el) => {
      const opts = [];
      $(el).find('option').each((_, opt) => {
        const value = $(opt).attr('value') || '';
        const label = $(opt).text().trim();
        if (value || label) opts.push({ value, label });
      });
      return opts;
    };

    // First: form-scoped selects
    formEl.find('select').each((_, el) => {
      const name = $(el).attr('name');
      if (name) allSelects[name] = extractSelectOptions(el);
    });

    // Then: any select outside the form (fill in missing ones, or replace if form had empty)
    $('select').each((_, el) => {
      const name = $(el).attr('name');
      if (!name) return;
      const opts = extractSelectOptions(el);
      if (!allSelects[name] || allSelects[name].length === 0) {
        allSelects[name] = opts;
      } else if (opts.length > allSelects[name].length) {
        // Prefer the select with MORE options (more likely the real dropdown)
        allSelects[name] = opts;
      }
    });

    // Log for debugging
    const selectSummary = Object.fromEntries(
      Object.entries(allSelects).map(([k, v]) => [k, v.length])
    );
    console.log('[UmrahForm] Selects found:', selectSummary);

    // Extract all input fields — search globally
    const allInputs = {};
    const collectInput = (el) => {
      const name = $(el).attr('name');
      const type = $(el).attr('type') || 'text';
      if (name && type !== 'hidden') {
        allInputs[name] = {
          type,
          placeholder: $(el).attr('placeholder') || '',
          required: $(el).attr('required') !== undefined,
        };
      }
    };
    formEl.find('input').each((_, el) => collectInput(el));
    $('input').each((_, el) => { if (!allInputs[$(el).attr('name')]) collectInput(el); });

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

    // Cache the discovered handlers on the session for reuse by fetchUmrahDependentOptions
    // Note: `session` is the outer-scope var from the top of this function
    if (session) {
      session.jsHandlers = jsHandlers;
    }

    return {
      success: true,
      formAction,
      hiddenFields,
      selects: allSelects,
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

// ── Helper: Resolve URL relative to the form page base ──
function resolveAjaxUrl(url) {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return `${BASE}${url}`;
  // Relative URL — resolve against /pages/ directory (where main.php lives)
  return `${BASE}/pages/${url}`;
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

  const baseUrl = resolveAjaxUrl(jsHandlers.paketAjaxUrl);
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${BASE}/pages/main.php?route=umrah&act=tdaftar`,
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

      if (!res.ok) {
        console.log(`[UmrahDeps] Paket AJAX ${attempt.method} ${attempt.param} → HTTP ${res.status}`);
        continue;
      }

      const responseText = await res.text();
      const previewLen = responseText.length > 300 ? 800 : 200;
      const preview = responseText.trim().slice(0, previewLen).replace(/\s+/g, ' ');

      // Check for session expiration
      if (responseText.includes('cek_login.php') || responseText.includes('Sign in to start your session')) {
        return { sessionExpired: true };
      }

      // Parse as multiple formats (HTML fragment, JSON, delimited text)
      const opts = parseOptionsFromResponse(responseText);
      if (opts.length > 0) {
        console.log(`[UmrahDeps] Paket AJAX ✓ ${attempt.method} ${attempt.param} ${Object.keys(attempt.data).length ? '+ctx' : ''} → ${opts.length} options`);
        return { options: opts, sourceUrl: url, method: attempt.method, param: attempt.param };
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
    }
  } else {
    console.log('[UmrahDeps] No paket AJAX URL cached — run form-options first to discover it.');
  }

  const j = encodeURIComponent(jadwal);

  // ── Step 2: Re-fetch full form for vmarketing/perwakilan (and as paket fallback) ──
  const urls = [
    `${BASE}/pages/main.php?route=umrah&act=tdaftar&jadwal=${j}`,
    `${BASE}/pages/main.php?route=umrah&act=tdaftar&berangkat=${j}`,
    `${BASE}/pages/main.php?route=umrah&act=tdaftar&tgl_berangkat=${j}`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Cookie: session.cookie,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': `${BASE}/pages/main.php?route=umrah&act=tdaftar`,
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) continue;
      const html = await res.text();
      if (html.includes('cek_login.php') || html.includes('Sign in to start your session')) {
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
  ));

  if (Object.keys(combined).length > 0) {
    return { success: true, data: combined, sourceUrl: lastSourceUrl };
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
  const candidateUrls = [
    // data_umrah directory (discovered from form action)
    `${BASE}/pages/route/data_umrah/get_paket.php?jadwal=${j}`,
    `${BASE}/pages/route/data_umrah/paket.php?jadwal=${j}`,
    `${BASE}/pages/route/data_umrah/_paket.php?jadwal=${j}`,
    `${BASE}/pages/route/data_umrah/cpaket.php?jadwal=${j}`,
    `${BASE}/pages/route/data_umrah/_cpaket.php?jadwal=${j}`,
    `${BASE}/pages/route/data_umrah/aksi_umrah.php?act=getpaket&jadwal=${j}`,
    `${BASE}/pages/route/data_umrah/aksi_umrah.php?route=umrah&act=getpaket&jadwal=${j}`,
    `${BASE}/pages/route/data_umrah/aksi_umrah.php?route=umrah&act=paket&jadwal=${j}`,
    // Fallback: old guesses
    `${BASE}/pages/route/umrah/_paket.php?berangkat=${j}`,
    `${BASE}/pages/route/umrah/paket.php?berangkat=${j}`,
    // Re-render whole form with jadwal selected (last resort)
    `${BASE}/pages/main.php?route=umrah&act=tdaftar&jadwal=${j}`,
  ];

  const tried = [];

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Cookie: session.cookie,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'X-Requested-With': 'XMLHttpRequest', // Common marker for AJAX requests
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        tried.push({ url, status: res.status });
        continue;
      }

      const body = await res.text();
      if (body.includes('cek_login.php') || body.includes('Sign in to start your session')) {
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

// ── Submit Umrah Registration: POST form data to legacy system ──
export async function submitUmrahRegistration(username, { formAction, fields, hiddenFields, fileBuffer, fileName }) {
  const session = sessions.get(username);
  if (!session) return { success: false, error: 'Belum login' };

  if (Date.now() - session.createdAt > SESSION_TTL) {
    sessions.delete(username);
    return { success: false, error: 'Session kedaluwarsa, silakan login ulang' };
  }

  // Build the full URL.
  // Form action can be:
  //   - absolute: starts with http
  //   - root-relative: starts with /
  //   - relative: e.g. "route/data_umrah/aksi_umrah.php?..."
  // Relative URLs resolve against the current page URL: ${BASE}/pages/main.php
  // So they become ${BASE}/pages/<relative>.
  let actionUrl;
  if (formAction.startsWith('http')) {
    actionUrl = formAction;
  } else if (formAction.startsWith('/')) {
    actionUrl = `${BASE}${formAction}`;
  } else {
    actionUrl = `${BASE}/pages/${formAction}`;
  }

  try {
    // Build multipart form body using URLSearchParams for non-file fields
    // and native FormData for file uploads
    const boundary = '----FormBoundary' + Date.now().toString(36);
    const parts = [];

    // Add hidden fields first
    if (hiddenFields) {
      for (const [key, value] of Object.entries(hiddenFields)) {
        parts.push(
          `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
          `${value}\r\n`
        );
      }
    }

    // Add form fields
    for (const [key, value] of Object.entries(fields)) {
      parts.push(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
        `${value}\r\n`
      );
    }

    // Add file if provided
    if (fileBuffer && fileName) {
      const ext = fileName.split('.').pop().toLowerCase();
      const mimeTypes = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', pdf: 'application/pdf' };
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      parts.push(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file_ktp"; filename="${fileName}"\r\n` +
        `Content-Type: ${contentType}\r\n\r\n`
      );
      // File binary will be appended separately
    }

    // Build final body as Buffer for proper binary handling
    const textPart = parts.join('');
    const endBoundary = `\r\n--${boundary}--\r\n`;

    let bodyBuffer;
    if (fileBuffer) {
      const textBuf = Buffer.from(textPart, 'utf-8');
      const endBuf = Buffer.from(endBoundary, 'utf-8');
      bodyBuffer = Buffer.concat([textBuf, fileBuffer, endBuf]);
    } else {
      bodyBuffer = Buffer.from(textPart + `--${boundary}--\r\n`, 'utf-8');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    const res = await fetch(actionUrl, {
      method: 'POST',
      headers: {
        Cookie: session.cookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': bodyBuffer.length.toString(),
      },
      body: bodyBuffer,
      redirect: 'manual',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    // Check for redirect (usually means success in PHP forms)
    const location = res.headers.get('location') || '';
    const statusCode = res.status;

    // Read response body
    const responseHtml = await res.text();

    // Detect session expired
    if (responseHtml.includes('cek_login.php') || responseHtml.includes('Sign in to start your session')) {
      sessions.delete(username);
      return { success: false, error: 'Session kedaluwarsa di sistem internal' };
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

    // Ambiguous — return the response for debugging
    return {
      success: false,
      error: 'Tidak dapat menentukan hasil pendaftaran. Silakan cek di sistem internal.',
      debug: { statusCode, hasForm, location },
    };

  } catch (err) {
    if (err.name === 'AbortError') {
      return { success: false, error: 'Sistem internal tidak merespons (timeout)' };
    }
    console.error('submitUmrahRegistration error:', err.message);
    return { success: false, error: 'Gagal mengirim pendaftaran: ' + err.message };
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
