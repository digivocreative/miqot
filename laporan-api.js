/**
 * Laporan API — Lightweight HTTP session-based fetch (no Playwright)
 *
 * POST /api/laporan/login       → login via native fetch, store PHPSESSID
 * GET  /api/laporan/fetch       → fetch laporan HTML using stored cookie
 * POST /api/laporan/disconnect  → clear session
 */

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

// ── Disconnect: Remove session ──
export function disconnect(username) {
  const existed = sessions.delete(username);
  return { success: true, message: existed ? 'Berhasil disconnect' : 'Session tidak ditemukan' };
}
