// Gerbang maintenance sementara, dikontrol env:
//   MAINTENANCE_UNTIL     — ISO timestamp (mis. 2026-08-08T21:00:00+07:00); gerbang
//                           aktif hanya selama waktu ini masih di masa depan, lalu no-op.
//   MAINTENANCE_ALLOW_IPS — daftar IP (koma) yang tetap boleh akses penuh.
// Selama aktif, selain IP yang diizinkan hanya jalur publik landing (umroh/haji/bio
// beserta aset & API pendukungnya) yang dilayani; sisanya menerima 503 + halaman
// maintenance. Custom domain agent = landing publik seluruhnya, jadi lolos utuh.
// Catatan: identitas IP dipercaya dari CF-Connecting-IP/X-Forwarded-For — cukup
// untuk jendela pemeliharaan, bukan kontrol akses keras.

const untilMs = Date.parse(process.env.MAINTENANCE_UNTIL || '') || 0;
const allowedIps = new Set(
  String(process.env.MAINTENANCE_ALLOW_IPS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
);

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

function maintenancePageHtml() {
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="300">
<title>Sedang Pemeliharaan — Alhijaz Indowisata</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    min-height: 100vh;
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: #faf9f6;
    text-align: center;
  }
  .logo { height: 40px; margin-bottom: 28px; }
  h1 { font-size: 22px; font-weight: 600; color: #14532d; margin-bottom: 10px; }
  p { font-size: 15px; line-height: 1.6; color: #57534e; }
</style>
</head>
<body>
  <main>
    <img class="logo" src="/logo-alhijaz.webp" alt="Alhijaz Indowisata" onerror="this.style.display='none'">
    <h1>Sedang Pemeliharaan</h1>
    <p>Sistem sedang dalam pemeliharaan singkat.<br>Silakan kembali pukul 21.00 WIB.</p>
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

export function createMaintenanceGate({ isPrimaryHost, isSharedStaticRequestPath }) {
  if (untilMs > Date.now()) {
    console.log(
      '[maintenance] gate AKTIF sampai', new Date(untilMs).toISOString(),
      '— IP diizinkan:', [...allowedIps].join(', ') || '(tidak ada)'
    );
  }

  return function maintenanceGate(req, res, next) {
    if (Date.now() >= untilMs) return next();

    // Custom domain agent = landing publik seluruhnya → lolos.
    const host = (req.hostname || '').toLowerCase();
    if (!isPrimaryHost(host)) return next();

    const ip = clientIp(req);
    if (allowedIps.has(ip) || isLoopback(ip)) return next();

    const path = req.path || '/';
    if (isSharedStaticRequestPath(path)) return next();
    if (LANDING_PATH_RE.test(path)) return next();
    if (ALLOWED_PATHS.has(path)) return next();
    if (ALLOWED_PATH_PREFIXES.some(p => path.startsWith(p))) return next();

    const retryAfterSec = Math.max(60, Math.ceil((untilMs - Date.now()) / 1000));
    res.set({ 'Retry-After': String(retryAfterSec), 'Cache-Control': 'no-store' });
    if (path.startsWith('/api/') || path === '/mcp' || path === '/dev-mcp') {
      return res.status(503).json({
        error: 'maintenance',
        message: 'Sistem sedang dalam pemeliharaan hingga pukul 21.00 WIB.',
      });
    }
    return res.status(503).type('text/html; charset=utf-8').send(maintenancePageHtml());
  };
}
