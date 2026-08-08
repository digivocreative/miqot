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
    color: #1f2a24;
    background:
      radial-gradient(1100px 600px at 50% -10%, rgba(197, 160, 89, 0.16), transparent 60%),
      linear-gradient(180deg, #faf7f0 0%, #f1ece0 100%);
  }
  .card {
    width: 100%; max-width: 460px;
    background: #fffdf8;
    border: 1px solid rgba(197, 160, 89, 0.35);
    border-top: 4px solid #c5a059;
    border-radius: 20px;
    padding: 44px 32px 36px;
    text-align: center;
    box-shadow: 0 24px 60px -24px rgba(31, 42, 36, 0.25);
  }
  .logo { height: 44px; margin-bottom: 26px; }
  .ornament { margin: 0 auto 22px; display: block; }
  h1 {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 26px; font-weight: 700; color: #14532d;
    letter-spacing: 0.2px; margin-bottom: 12px;
  }
  p.lead { font-size: 15px; line-height: 1.65; color: #4b5a51; margin-bottom: 26px; }
  p.lead strong { color: #14532d; }
  .count { display: flex; justify-content: center; gap: 10px; margin-bottom: 26px; }
  .cell {
    min-width: 74px; padding: 12px 10px 10px;
    background: linear-gradient(180deg, #14532d, #0e3d21);
    border-radius: 14px; color: #f6efdf;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.12);
  }
  .cell b { display: block; font-size: 28px; font-variant-numeric: tabular-nums; line-height: 1.1; }
  .cell span { display: block; font-size: 10.5px; letter-spacing: 1.6px; text-transform: uppercase; opacity: 0.75; margin-top: 3px; }
  .sep { align-self: center; font-size: 22px; color: #c5a059; font-weight: 700; }
  .note {
    font-size: 13px; line-height: 1.6; color: #6b7a70;
    background: rgba(197, 160, 89, 0.10);
    border: 1px solid rgba(197, 160, 89, 0.28);
    border-radius: 12px; padding: 12px 16px; margin-bottom: 24px;
  }
  .foot { font-size: 12px; letter-spacing: 2.2px; text-transform: uppercase; color: #a4917a; }
</style>
</head>
<body>
  <main class="card">
    <img class="logo" src="/logo-alhijaz.webp" alt="Alhijaz Indowisata" onerror="this.style.display='none'">
    <svg class="ornament" width="54" height="54" viewBox="0 0 54 54" fill="none" aria-hidden="true">
      <path d="M27 3l6.4 10.9L45.7 9l-4.9 12.3L54 27l-13.2 5.7L45.7 45l-12.3-4.9L27 51l-6.4-10.9L8.3 45l4.9-12.3L0 27l13.2-5.7L8.3 9l12.3 4.9L27 3z" fill="#c5a059" opacity="0.9"/>
      <circle cx="27" cy="27" r="9.5" fill="#fffdf8"/>
      <path d="M30.8 21.5a7 7 0 100 11 5.6 5.6 0 010-11z" fill="#14532d"/>
    </svg>
    <h1>Sedang Pemeliharaan Sistem</h1>
    <p class="lead">Kami sedang melakukan peningkatan singkat agar layanan makin lancar.<br>Insya Allah kembali normal pukul <strong>21.00 WIB</strong> malam ini.</p>
    <div class="count" id="count">
      <div class="cell"><b id="h">–</b><span>Jam</span></div>
      <div class="sep">:</div>
      <div class="cell"><b id="m">–</b><span>Menit</span></div>
      <div class="sep">:</div>
      <div class="cell"><b id="s">–</b><span>Detik</span></div>
    </div>
    <div class="note">Halaman informasi <strong>Umroh</strong>, <strong>Haji</strong>, dan <strong>profil konsultan</strong> tetap dapat diakses seperti biasa.</div>
    <div class="foot">Alhijaz Indowisata</div>
  </main>
  <script>
    (function () {
      var until = ${untilMs};
      var pad = function (n) { return String(n).padStart(2, '0'); };
      function tick() {
        var left = until - Date.now();
        if (left <= 0) { location.reload(); return; }
        var t = Math.floor(left / 1000);
        document.getElementById('h').textContent = pad(Math.floor(t / 3600));
        document.getElementById('m').textContent = pad(Math.floor((t % 3600) / 60));
        document.getElementById('s').textContent = pad(t % 60);
        setTimeout(tick, 1000);
      }
      tick();
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
