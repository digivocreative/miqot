// Gerbang maintenance sementara, dikontrol env:
//   MAINTENANCE_UNTIL       — ISO timestamp (mis. 2026-08-10T21:00:00+07:00); gerbang
//                             aktif hanya selama waktu ini masih di masa depan, lalu no-op.
//   MAINTENANCE_MODE        — "landing" (default lama) atau "strict".
//   MAINTENANCE_ALLOW_IPS   — daftar IP (koma) yang tetap boleh akses penuh.
//   MAINTENANCE_ALLOW_SLUGS — daftar slug agent dengan bypass login saat mode strict.
// Mode landing tetap membiarkan landing umroh/haji/bio beserta aset dan API
// pendukungnya hidup. Mode strict menutup semua akses manusia kecuali halaman login
// dan agent allowlist yang membawa JWT sah; webhook mesin penting tetap hidup.
// Custom domain agent tidak termasuk gerbang ini karena host yang diminta khusus
// alhijaz.co/www.alhijaz.co.
// Catatan: identitas IP dipercaya dari CF-Connecting-IP/X-Forwarded-For — cukup
// untuk jendela pemeliharaan, bukan kontrol akses keras.

const untilMs = Date.parse(process.env.MAINTENANCE_UNTIL || '') || 0;
const maintenanceMode = String(process.env.MAINTENANCE_MODE || 'landing').trim().toLowerCase() === 'strict'
  ? 'strict'
  : 'landing';
const allowedIps = new Set(
  String(process.env.MAINTENANCE_ALLOW_IPS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
);
const allowedSlugs = new Set(
  String(process.env.MAINTENANCE_ALLOW_SLUGS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
);

export const MAINTENANCE_ACCESS_COOKIE = 'miqot_maintenance_access';

export function isMaintenanceActive(now = Date.now()) {
  return now < untilMs;
}

export function isStrictMaintenanceActive(now = Date.now()) {
  return maintenanceMode === 'strict' && isMaintenanceActive(now);
}

export function isMaintenanceAgentAllowed(slug) {
  return allowedSlugs.has(String(slug || '').trim().toLowerCase());
}

export function maintenanceAccessCookieOptions(req, now = Date.now()) {
  const forwardedProto = req.headers?.['x-forwarded-proto'];
  const isHttps = req.secure || forwardedProto === 'https';
  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.max(1000, untilMs - now),
  };
}

// /umroh, /haji, /bio — bare (custom domain) maupun berprefix slug agent.
const LANDING_PATH_RE = /^\/(?:[a-z0-9-]+\/)?(?:umroh|haji|bio)\/?$/i;

// API yang dipakai halaman landing/bio + webhook mesin yang tak boleh putus.
const ALLOWED_PATH_PREFIXES = [
  '/api/bio/',            // BioPage: config + featured-paket-preview
  '/api/capi/',           // pixel CAPI dari landing umroh/haji
  '/og/',                 // gambar OG untuk preview link landing/bio
  '/api/resend-inbound',  // webhook email masuk (mesin, bukan user)
];
const ALLOWED_PATHS = new Set([
  '/api/analytics/public',  // event publik fire-and-forget
  '/api/domains/authorize', // Caddy on-demand TLS "ask" — wajib hidup utk custom domain
]);

// Endpoint mesin ini diautentikasi sendiri oleh signature/secret masing-masing.
// Membiarkannya hidup tidak membuka UI atau data aplikasi ke publik.
const STRICT_MACHINE_PATHS = new Set([
  '/api/domains/authorize',
  '/api/resend-inbound',
  '/api/telegram/webhook',
]);

function clientIp(req) {
  const cf = req.headers['cf-connecting-ip'];
  if (cf) return String(cf).trim();
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket?.remoteAddress || '';
}

function isLoopback(ip) {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function cookieValue(req, name) {
  const raw = req.headers?.cookie;
  if (!raw) return '';
  for (const part of String(raw).split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1 || part.slice(0, idx).trim() !== name) continue;
    const value = part.slice(idx + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return '';
}

function accessToken(req) {
  const auth = String(req.headers?.authorization || '');
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return cookieValue(req, MAINTENANCE_ACCESS_COOKIE);
}

function hasAllowedAgentCredential(req, verifyAccessToken) {
  const token = accessToken(req);
  if (!token || typeof verifyAccessToken !== 'function') return false;
  try {
    const payload = verifyAccessToken(token);
    // Password-reset and other purpose-specific JWTs share the signing secret but
    // must never become a maintenance bypass credential.
    if (!payload?.id || payload?.purpose) return false;
    if (payload.role !== 'agent' && payload.role !== 'admin') return false;
    return isMaintenanceAgentAllowed(payload.slug);
  } catch {
    return false;
  }
}

function isStrictBootstrapRequest(req, path) {
  const method = String(req.method || 'GET').toUpperCase();
  if ((path === '/login' || path === '/login/') && (method === 'GET' || method === 'HEAD')) {
    return true;
  }
  if (path === '/api/auth/login' && (method === 'POST' || method === 'OPTIONS')) {
    return true;
  }
  return STRICT_MACHINE_PATHS.has(path);
}

function maintenancePageHtml() {
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>alhijaz.co</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    min-height: 100vh;
    padding: 15vh 24px 40px;
    font-family: Arial, sans-serif;
    background: #fff; color: #202124;
  }
  main { width: 100%; max-width: 600px; margin: 0 auto; }
  .icon {
    position: relative; width: 38px; height: 46px; margin-bottom: 28px;
    border: 2px solid #5f6368; border-radius: 2px;
  }
  .icon::before {
    content: ''; position: absolute; top: -2px; right: -2px;
    width: 13px; height: 13px; background: #fff;
    border-left: 2px solid #5f6368; border-bottom: 2px solid #5f6368;
  }
  .face { position: absolute; left: 8px; bottom: 10px; color: #5f6368; font-size: 17px; }
  h1 { font-size: 28px; line-height: 1.25; font-weight: 500; margin-bottom: 18px; }
  p { font-size: 15px; line-height: 1.55; color: #5f6368; margin-bottom: 16px; }
  strong { color: #202124; font-weight: 500; }
  ul { margin: 0 0 22px 20px; color: #5f6368; font-size: 15px; line-height: 1.6; }
  code { font: 12px Arial, sans-serif; color: #5f6368; }
</style>
</head>
<body>
  <main role="main">
    <div class="icon" aria-hidden="true"><span class="face">:(</span></div>
    <h1>Situs ini tidak dapat dijangkau</h1>
    <p><strong>alhijaz.co</strong> menolak untuk tersambung.</p>
    <p>Coba:</p>
    <ul>
      <li>Periksa sambungan</li>
      <li>Periksa proxy dan firewall</li>
    </ul>
    <code>ERR_CONNECTION_REFUSED</code>
  </main>
  <script>
    (function () {
      var left = ${untilMs} - Date.now();
      if (left > 0) setTimeout(function () { location.reload(); }, left + 2000);
    })();
  </script>
</body>
</html>`;
}

export function createMaintenanceGate({ isPrimaryHost, isSharedStaticRequestPath, verifyAccessToken }) {
  if (isMaintenanceActive()) {
    console.log(
      '[maintenance] gate AKTIF sampai', new Date(untilMs).toISOString(),
      '— mode:', maintenanceMode,
      '— IP diizinkan:', [...allowedIps].join(', ') || '(tidak ada)',
      '— agent diizinkan:', [...allowedSlugs].join(', ') || '(tidak ada)'
    );
  }

  return function maintenanceGate(req, res, next) {
    if (!isMaintenanceActive()) return next();

    // Custom domain agent = landing publik seluruhnya → lolos.
    const host = (req.hostname || '').toLowerCase();
    if (!isPrimaryHost(host)) return next();

    const ip = clientIp(req);
    if (allowedIps.has(ip) || isLoopback(ip)) return next();

    const path = req.path || '/';
    if (isSharedStaticRequestPath(path)) return next();

    if (maintenanceMode === 'strict') {
      if (hasAllowedAgentCredential(req, verifyAccessToken)) return next();
      if (isStrictBootstrapRequest(req, path)) return next();
    } else {
      if (LANDING_PATH_RE.test(path)) return next();
      if (ALLOWED_PATHS.has(path)) return next();
      if (ALLOWED_PATH_PREFIXES.some(p => path.startsWith(p))) return next();
    }

    const retryAfterSec = Math.max(60, Math.ceil((untilMs - Date.now()) / 1000));
    res.set({ 'Retry-After': String(retryAfterSec), 'Cache-Control': 'no-store' });
    if (path.startsWith('/api/') || path === '/mcp' || path === '/dev-mcp') {
      return res.status(503).json({
        error: 'service_unavailable',
        message: 'Service Unavailable',
      });
    }
    return res.status(503).type('text/html; charset=utf-8').send(maintenancePageHtml());
  };
}
