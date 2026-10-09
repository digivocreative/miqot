// OAuth 2.1 per-agent untuk MCP /mcp — supaya agent non-teknis bisa menambahkan
// `https://alhijaz.co/mcp` sebagai custom connector di claude.ai / ChatGPT cukup
// dengan login akun dashboard. Kunci statis `alhijaz_mcp_` (mcp-server.js) TETAP
// berlaku untuk klien developer (Claude Code, Cursor, API); ChatGPT dan claude.ai
// biasa tidak bisa mengirim header statis, jadi tanpa modul ini mereka tak bisa
// tersambung sama sekali (audit 9 Okt 2026: 24 kunci dibuat, praktis 0 dipakai).
//
// Desain (2026-10-09), pola sama dengan dev-mcp.js tapi per-agent:
// - Discovery: PRM RFC 9728 di /.well-known/oauth-protected-resource/mcp (dan
//   root) → authorization server ber-issuer ROOT `<base>`; endpoint-nya di
//   /oauth/mcp/*. Root dipilih karena dokumentasi ChatGPT hanya menyebut
//   /.well-known/oauth-authorization-server di root — Dev-MCP (satu developer,
//   lewat Claude yang patuh path-insertion RFC 8414) yang pindah ke /oauth/dev.
// - Klien: CIMD (client_id = URL dokumen metadata, mis. "identitas Claude yang
//   dipublikasikan" — default di claude.ai) dari host daftar putih, atau DCR
//   RFC 7591 stateless (client_id = JWT berisi redirect_uris).
//   redirect_uri WAJIB salah satu URL callback PERSIS milik klien yang dikenal
//   (claude.ai, chatgpt.com, Cursor) atau loopback. Tanpa itu, siapa pun bisa
//   mendaftar klien ber-redirect ke URL-nya lalu memancing agent login di halaman
//   ASLI kita → kode (dan data jamaah) jatuh ke penyerang. Sengaja persis, bukan
//   per-domain: satu open redirect / halaman UGC di domain vendor (mis.
//   vscode.dev/redirect yang tujuannya dari state) cukup untuk membocorkan kode.
//   Tambahan: env MCP_OAUTH_REDIRECT_URIS (dipisah koma; akhiran * = prefiks).
// - Login: username/email + password dashboard (bcrypt, disuntik dari server.js).
//   MASTER_PASSWORD sengaja TIDAK berlaku — impersonasi admin tidak boleh diam-diam
//   menyerahkan data agent ke aplikasi AI pihak ketiga.
// - Token: access 1 jam + refresh 90 hari (dirotasi), JWT bertanda tangan
//   (MCP_OAUTH_SECRET, atau turunan HMAC dari JWT_SECRET — terpisah kriptografis
//   dari JWT dashboard & Dev-MCP). Keduanya membawa id baris mcp_oauth_grants
//   (gid) → bisa dicabut per aplikasi; agent non-aktif = token mati.
// - Satu-satunya tabel yang DITULIS modul ini: mcp_oauth_grants (dijaga test).
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import express from 'express';
import { createRateLimiter } from './mcp-server.js';
import { base64url, buildBaseUrl, verifyPkceS256, validateResourceIndicator } from './dev-mcp.js';

// Prefix endpoint OAuth agent (issuer-nya root, lihat header).
export const ISSUER_PATH = '/oauth/mcp';
export const RESOURCE_PATH = '/mcp';
const SCOPE = 'read';
// Diiklankan agar klien yang mensyaratkannya (ChatGPT) meminta refresh token;
// refresh token SELALU diterbitkan, scope tak dikenal diabaikan.
const SCOPES_SUPPORTED = [SCOPE, 'offline_access'];
const CIMD_CACHE_TTL_MS = 60 * 60_000;
const CIMD_MAX_BYTES = 64 * 1024;
const ACCESS_TTL_SECONDS = 3600;
const REFRESH_TTL_SECONDS = 90 * 86400;
const CODE_TTL_SECONDS = 120;
const GRANT_CACHE_TTL_MS = 60_000;
const LAST_USED_STAMP_INTERVAL_MS = 10 * 60_000;
const IP_RATE_LIMIT_PER_MINUTE = 60;
const LOGIN_ATTEMPTS_PER_IP = 10; // per 10 menit
// Per akun lintas IP — sengaja longgar: kunci ketat bisa dipakai siapa pun untuk
// mengunci agent (slug publik). Penjaga utama tebak-password = batas per IP.
const LOGIN_FAILS_PER_ACCOUNT = 30; // per 60 menit
const LOGIN_FAIL_WINDOW_MS = 60 * 60_000;
// Refresh token lama yang muncul dalam jendela ini sesudah rotasi dianggap balapan
// klien (dua refresh paralel), bukan pencurian — ditolak tanpa mencabut sambungan.
const REFRESH_REUSE_GRACE_MS = 30_000;
const ACCESS_PREFIX = 'alhijaz_at_';
const REFRESH_PREFIX = 'alhijaz_rt_';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// URL callback persis klien AI yang dikenal (dicek 9 Okt 2026). Akhiran * =
// prefiks yang sisanya hanya boleh satu segmen [A-Za-z0-9_-] tanpa query.
// VS Code & klien CLI memakai loopback (selalu diizinkan, port bebas).
const DEFAULT_REDIRECT_URIS = [
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
  'https://chatgpt.com/connector_platform_oauth_redirect',
  'https://chatgpt.com/connector/oauth/*',
  'https://www.cursor.com/agents/mcp/oauth/callback',
  'cursor://anysphere.cursor-mcp/oauth/callback',
];
// CIMD hanya di-fetch dari host vendor ini (anti-SSRF).
const CIMD_HOSTS = new Set(['claude.ai', 'claude.com', 'chatgpt.com']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function deriveMcpOAuthSecret({ oauthSecret, jwtSecret } = {}) {
  if (oauthSecret) return String(oauthSecret);
  return crypto.createHmac('sha256', 'mcp-oauth-v1').update(String(jwtSecret || 'fallback-secret-change-me')).digest('hex');
}

export function parseRedirectUriAllowlist(spec) {
  const extra = String(spec || '').split(',').map((u) => u.trim()).filter(Boolean);
  return [...new Set([...DEFAULT_REDIRECT_URIS, ...extra])];
}

// { ok, host } — host = label stabil untuk grant & tampilan ('localhost' untuk
// semua loopback, nama skema untuk aplikasi lokal).
export function classifyRedirectUri(uri, allowedUris = DEFAULT_REDIRECT_URIS) {
  const raw = String(uri || '');
  let u;
  try { u = new URL(raw); } catch { return { ok: false }; }
  if (u.hash || u.username || u.password) return { ok: false };
  if ((u.protocol === 'http:' || u.protocol === 'https:') && LOOPBACK_HOSTS.has(u.hostname.toLowerCase())) {
    return { ok: true, host: 'localhost' };
  }
  // Bandingkan string mentah (bukan hasil normalisasi URL) supaya ../ , %2e,
  // atau host berhuruf besar tidak bisa menyelinap lewat prefiks.
  const allowed = allowedUris.some((entry) => {
    if (!entry.endsWith('*')) return raw === entry;
    const prefix = entry.slice(0, -1);
    return raw.startsWith(prefix) && /^[A-Za-z0-9_-]{1,200}$/.test(raw.slice(prefix.length));
  });
  if (!allowed) return { ok: false };
  const host = u.protocol === 'https:' ? u.hostname.toLowerCase() : u.protocol.slice(0, -1);
  return { ok: true, host };
}

// redirect_uri harus terdaftar persis — kecuali loopback: RFC 8252 §7.3, port
// diabaikan (Claude Code mendaftarkan `http://localhost/callback` tanpa port lalu
// memakai port acak).
export function redirectUriRegistered(uri, registered = []) {
  if (registered.includes(uri)) return true;
  let u;
  try { u = new URL(String(uri)); } catch { return false; }
  if (!LOOPBACK_HOSTS.has(u.hostname)) return false;
  return registered.some((r) => {
    try {
      const v = new URL(r);
      return v.protocol === u.protocol && v.hostname === u.hostname && v.pathname === u.pathname && v.search === u.search;
    } catch { return false; }
  });
}

// CIMD: client_id berupa URL https di host vendor yang dikenal (path wajib ada).
export function isCimdClientId(clientId) {
  if (typeof clientId !== 'string' || !clientId.startsWith('https://')) return false;
  let u;
  try { u = new URL(clientId); } catch { return false; }
  if (u.pathname === '/' || u.hash || u.search || u.username || u.password || u.port) return false;
  return CIMD_HOSTS.has(u.hostname.toLowerCase()) && u.href === clientId;
}

// Ambil & validasi dokumen metadata klien (CIMD). Dibatasi waktu & ukuran,
// redirect ditolak (anti-SSRF via pengalihan).
async function fetchClientMetadataDocument(url) {
  const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000), headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > CIMD_MAX_BYTES) throw new Error('dokumen terlalu besar');
  return JSON.parse(text);
}

// Nama yang dilihat agent di halaman izin & daftar sambungan. Untuk host yang
// dikenal, nama diturunkan dari host (client_name dari DCR bisa diisi apa saja).
export function clientDisplayName(redirectHost, clientName) {
  const host = String(redirectHost || '');
  if (/(^|\.)claude\.(ai|com)$/.test(host)) return 'Claude';
  if (/(^|\.)(chatgpt\.com|openai\.com)$/.test(host)) return 'ChatGPT';
  if (host === 'cursor' || /(^|\.)cursor\.com$/.test(host)) return 'Cursor';
  const name = String(clientName || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60);
  if (name) return name;
  return host === 'localhost' ? 'Aplikasi di komputermu' : host;
}

// ── Token (pure; secret eksplisit agar mudah diuji) ─────────────────────────
function wrap(prefix, token) {
  return `${prefix}${base64url(token)}`;
}

function unwrap(prefix, value) {
  const raw = String(value || '');
  if (!raw.startsWith(prefix)) return null;
  const s = raw.slice(prefix.length).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(s + '='.repeat((4 - (s.length % 4)) % 4), 'base64').toString('utf8');
}

const clientHash = (clientId) => crypto.createHash('sha256').update(String(clientId)).digest('hex').slice(0, 16);

export function makeMcpClientId(secret, { redirect_uris, client_name, auth = 'none' }) {
  return jwt.sign({ typ: 'mcp_client', redirect_uris, client_name: client_name || null, auth }, secret);
}

export function parseMcpClientId(secret, clientId) {
  const p = jwt.verify(String(clientId || ''), secret);
  if (p.typ !== 'mcp_client') throw new Error('bukan client_id MCP');
  return p;
}

// Secret klien confidential diturunkan dari client_id → tanpa penyimpanan.
export function clientSecretFor(secret, clientId) {
  return crypto.createHmac('sha256', secret).update(`client-secret:${clientId}`).digest('hex');
}

export function issueMcpAccessToken(secret, { issuer, resource, agentId, grantId }) {
  return wrap(ACCESS_PREFIX, jwt.sign({ typ: 'mcp_at', gid: grantId, scope: SCOPE }, secret, {
    subject: agentId, audience: resource, issuer, expiresIn: ACCESS_TTL_SECONDS,
    jwtid: crypto.randomBytes(12).toString('hex'),
  }));
}

// jti refresh token disimpan di baris grant (refresh_jti) → sekali pakai.
export function issueMcpRefreshToken(secret, { issuer, resource, agentId, grantId, cid, auth, jti }) {
  return wrap(REFRESH_PREFIX, jwt.sign({ typ: 'mcp_rt', gid: grantId, cid, auth, scope: SCOPE }, secret, {
    subject: agentId, audience: resource, issuer, expiresIn: REFRESH_TTL_SECONDS,
    jwtid: jti || crypto.randomBytes(12).toString('hex'),
  }));
}

// Lempar error bila token palsu/kadaluarsa/salah audience/issuer/tipe.
export function verifyMcpToken(secret, token, { kind, issuer, resource }) {
  const raw = unwrap(kind === 'rt' ? REFRESH_PREFIX : ACCESS_PREFIX, token);
  if (!raw) throw new Error('format token salah');
  const p = jwt.verify(raw, secret, { issuer, audience: resource });
  if (p.typ !== `mcp_${kind}`) throw new Error('tipe token salah');
  if (!UUID_RE.test(String(p.gid || '')) || !p.sub) throw new Error('klaim token tidak lengkap');
  return p;
}

// ── Halaman login & izin ────────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const AUTHORIZE_FIELDS = ['response_type', 'client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method', 'resource', 'scope'];

export function renderAuthorizePage({ base, params = {}, display, redirectHost, error, identifier = '', showForm = true }) {
  const hidden = AUTHORIZE_FIELDS
    .map((k) => `<input type="hidden" name="${k}" value="${escapeHtml(params[k] || '')}">`)
    .join('\n      ');
  const appName = escapeHtml(display || 'Asisten AI');
  return `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Sambungkan Asisten AI · Alhijaz</title>
<style>
  :root{--bg:#f8fafc;--card:#fff;--text:#1f2937;--muted:#6b7280;--line:#e5e7eb;--accent:#14b8a6;--accent-strong:#0d9488;--soft:#f0fdfa;--soft-text:#0f766e;--err-bg:#fef2f2;--err:#b91c1c;color-scheme:light dark}
  @media (prefers-color-scheme:dark){:root{--bg:#0f172a;--card:#1e293b;--text:#f1f5f9;--muted:#94a3b8;--line:#334155;--soft:rgba(19,78,74,.35);--soft-text:#5eead4;--err-bg:rgba(127,29,29,.35);--err:#fecaca}}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;background:var(--bg);color:var(--text);font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  .card{width:100%;max-width:400px;background:var(--card);border:1px solid var(--line);border-radius:20px;padding:24px;box-shadow:0 10px 30px rgba(15,23,42,.08)}
  .brand{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
  .brand b{font-size:13px;letter-spacing:.12em;color:var(--accent-strong)}
  .badge{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--soft-text);background:var(--soft);padding:4px 9px;border-radius:999px}
  h1{font-size:19px;line-height:1.3;margin:0 0 8px}
  p{font-size:13px;line-height:1.55;color:var(--muted);margin:0 0 10px}
  ul{margin:0 0 14px;padding:0;list-style:none}
  li{font-size:13px;line-height:1.5;padding:6px 0 6px 22px;position:relative;border-top:1px solid var(--line)}
  li:first-child{border-top:0}
  li::before{content:"✓";position:absolute;left:2px;color:var(--accent-strong);font-weight:700}
  .ro{font-size:12px;color:var(--soft-text);background:var(--soft);border-radius:10px;padding:8px 10px;margin-bottom:16px}
  label{display:block;font-size:12px;font-weight:600;margin:12px 0 6px}
  input[type=text],input[type=password]{width:100%;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--text);font-size:16px}
  input:focus{outline:2px solid var(--accent);outline-offset:1px}
  .actions{display:flex;flex-direction:column;gap:8px;margin-top:18px}
  button{width:100%;padding:13px;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;border:0}
  .primary{background:var(--accent);color:#fff}
  .primary:hover{background:var(--accent-strong)}
  .secondary{background:transparent;color:var(--muted);border:1px solid var(--line)}
  .err{background:var(--err-bg);color:var(--err);font-size:13px;padding:10px 12px;border-radius:10px;margin-bottom:12px}
  .foot{font-size:11px;color:var(--muted);margin:16px 0 0;line-height:1.5}
</style></head><body>
  <main class="card">
    <div class="brand"><b>ALHIJAZ</b><span class="badge">Asisten AI · baca-saja</span></div>
    <h1>Sambungkan ${appName} ke akun Alhijaz</h1>
    ${error ? `<div class="err" role="alert">${escapeHtml(error)}</div>` : ''}
    ${showForm ? `<p>${appName} akan bisa membaca data milikmu untuk menjawab pertanyaan:</p>
    <ul>
      <li>Jamaah milikmu &amp; status pembayarannya</li>
      <li>Jadwal paket, harga &amp; kalkulasi</li>
      <li>Kalender manasik, keberangkatan &amp; kepulangan</li>
    </ul>
    <div class="ro">Hanya membaca — tidak bisa mengubah atau menghapus apa pun.</div>
    <form method="post" action="${escapeHtml(base)}${ISSUER_PATH}/authorize">
      <label for="identifier">Username atau email</label>
      <input id="identifier" name="identifier" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" value="${escapeHtml(identifier)}" required>
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
      ${hidden}
      <div class="actions">
        <button class="primary" type="submit" name="action" value="allow">Masuk &amp; Izinkan</button>
        <button class="secondary" type="submit" name="action" value="deny" formnovalidate>Batal</button>
      </div>
    </form>
    <p class="foot">Setelah ini kamu kembali ke <b>${escapeHtml(redirectHost || '')}</b>. Sambungan bisa diputus kapan saja di Dashboard → AI Tools → AI Assistant (MCP).</p>` : ''}
  </main>
</body></html>`;
}

// ── HTTP wiring ─────────────────────────────────────────────────────────────
// initMcpOAuth(app, { supabase, verifyAgentCredentials, onConnect, log, env, fetchClientMetadata })
// verifyAgentCredentials({ identifier, password }) → agent {id,slug,name,status,role} | null
// fetchClientMetadata(url) → dokumen CIMD (disuntik di test; default fetch).
// Mengembalikan runtime yang dipakai mcp-server.js untuk memverifikasi bearer.
export function initMcpOAuth(app, {
  supabase, verifyAgentCredentials, onConnect, log = console.log, env = process.env,
  fetchClientMetadata = fetchClientMetadataDocument,
} = {}) {
  if (!supabase) throw new Error('initMcpOAuth: supabase client is required');
  if (typeof verifyAgentCredentials !== 'function') throw new Error('initMcpOAuth: verifyAgentCredentials is required');

  const secret = deriveMcpOAuthSecret({ oauthSecret: env.MCP_OAUTH_SECRET, jwtSecret: env.JWT_SECRET });
  const allowedUris = parseRedirectUriAllowlist(env.MCP_OAUTH_REDIRECT_URIS);
  const ipLimiter = createRateLimiter({ limit: IP_RATE_LIMIT_PER_MINUTE });
  const loginIpLimiter = createRateLimiter({ limit: LOGIN_ATTEMPTS_PER_IP, windowMs: 10 * 60_000 });
  // identifier -> stempel waktu password salah (15 menit terakhir). Diperiksa
  // SEBELUM bcrypt supaya tebak-password ke satu akun dari banyak IP tetap mentok.
  const accountFails = new Map();
  const recentFails = (identifier) => {
    const cutoff = Date.now() - LOGIN_FAIL_WINDOW_MS;
    const fails = (accountFails.get(identifier) || []).filter((t) => t > cutoff);
    if (fails.length) accountFails.set(identifier, fails); else accountFails.delete(identifier);
    return fails;
  };
  const usedCodes = new Map(); // jti -> exp epoch ms (kode sekali pakai)
  const grantCache = new Map(); // gid -> { agent|null, expiresAt }
  const stampedAt = new Map(); // gid -> epoch ms stempel last_used_at terakhir
  const cimdCache = new Map(); // url -> { client|null, expiresAt }

  const issuerOf = (base) => base;
  const endpointsOf = (base) => `${base}${ISSUER_PATH}`;
  const resourceOf = (base) => `${base}${RESOURCE_PATH}`;
  const clientIp = (req) => req.headers['x-real-ip']
    || (typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'].split(',')[0].trim() : '')
    || req.ip || 'unknown';

  // Discovery & token dipanggil dari browser maupun server vendor; tanpa cookie
  // sama sekali, jadi origin * aman. WWW-Authenticate di-expose untuk alur 401.
  const cors = (req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'Authorization, Content-Type, Accept, Mcp-Protocol-Version');
    res.set('Access-Control-Expose-Headers', 'WWW-Authenticate');
    res.set('Access-Control-Max-Age', '86400');
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  };
  const limited = (req, res) => {
    if (ipLimiter(clientIp(req))) return false;
    res.status(429).json({ error: 'rate_limited', error_description: `Terlalu banyak request (max ${IP_RATE_LIMIT_PER_MINUTE}/menit)` });
    return true;
  };
  const form = express.urlencoded({ extended: false, limit: '32kb' });
  const json = express.json({ limit: '32kb' });

  const PRM_PATH = `/.well-known/oauth-protected-resource${RESOURCE_PATH}`;
  const AS_META_PATHS = ['/.well-known/oauth-authorization-server', '/.well-known/openid-configuration'];
  // app.use dengan prefix ikut mencocokkan sub-path (/.well-known/oauth-*/dev-mcp
  // milik Dev-MCP) — cors-nya identik, jadi tidak masalah.
  app.use(['/.well-known/oauth-protected-resource', ...AS_META_PATHS, ISSUER_PATH], cors);

  // ── Discovery ──
  // Root PRM juga menunjuk /mcp: klien yang tidak membaca WWW-Authenticate
  // (dokumentasi ChatGPT menyebut root) tetap menemukan resource yang benar.
  app.get([PRM_PATH, '/.well-known/oauth-protected-resource'], (req, res) => {
    const base = buildBaseUrl(req);
    res.set('Cache-Control', 'no-store').json({
      resource: resourceOf(base),
      resource_name: 'Alhijaz',
      authorization_servers: [issuerOf(base)],
      scopes_supported: SCOPES_SUPPORTED,
      bearer_methods_supported: ['header'],
    });
  });

  const asMetadata = (req, res) => {
    const base = buildBaseUrl(req);
    const endpoints = endpointsOf(base);
    res.set('Cache-Control', 'no-store').json({
      issuer: issuerOf(base),
      authorization_endpoint: `${endpoints}/authorize`,
      token_endpoint: `${endpoints}/token`,
      registration_endpoint: `${endpoints}/register`,
      revocation_endpoint: `${endpoints}/revoke`,
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
      revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
      scopes_supported: SCOPES_SUPPORTED,
      authorization_response_iss_parameter_supported: true,
      client_id_metadata_document_supported: true,
      // Varian openid-configuration diperiksa skema OIDC oleh sebagian klien;
      // token id tidak pernah diterbitkan (scope openid diabaikan).
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      jwks_uri: `${endpoints}/jwks`,
    });
  };
  for (const path of AS_META_PATHS) app.get(path, asMetadata);
  app.get(`${ISSUER_PATH}/jwks`, (req, res) => res.set('Cache-Control', 'no-store').json({ keys: [] }));

  // ── Dynamic Client Registration (RFC 7591) ──
  app.post(`${ISSUER_PATH}/register`, json, (req, res) => {
    if (limited(req, res)) return;
    const body = req.body || {};
    const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u) => typeof u === 'string').slice(0, 10) : [];
    if (!redirectUris.length) {
      return res.status(400).json({ error: 'invalid_redirect_uri', error_description: 'redirect_uris wajib diisi minimal satu' });
    }
    for (const u of redirectUris) {
      if (!classifyRedirectUri(u, allowedUris).ok) {
        log(`[MCP-OAuth] register ditolak: redirect_uri di luar daftar putih (${String(u).slice(0, 120)})`);
        return res.status(400).json({ error: 'invalid_redirect_uri', error_description: `redirect_uri tidak diizinkan untuk Alhijaz: ${u}` });
      }
    }
    const requested = String(body.token_endpoint_auth_method || 'none');
    const auth = ['client_secret_post', 'client_secret_basic'].includes(requested) ? requested : 'none';
    const clientName = typeof body.client_name === 'string' ? body.client_name.slice(0, 80) : null;
    const clientId = makeMcpClientId(secret, { redirect_uris: redirectUris, client_name: clientName, auth });
    res.status(201).set('Cache-Control', 'no-store').json({
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      ...(auth !== 'none' ? { client_secret: clientSecretFor(secret, clientId), client_secret_expires_at: 0 } : {}),
      redirect_uris: redirectUris,
      token_endpoint_auth_method: auth,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: SCOPE,
      ...(clientName ? { client_name: clientName } : {}),
    });
  });

  // ── Klien: CIMD (URL) atau DCR (JWT) → { redirect_uris, client_name, auth } ──
  const resolveCimdClient = async (url) => {
    const cached = cimdCache.get(url);
    if (cached && cached.expiresAt > Date.now()) return cached.client;
    let client = null;
    try {
      const doc = await fetchClientMetadata(url);
      const redirectUris = Array.isArray(doc?.redirect_uris) ? doc.redirect_uris.filter((u) => typeof u === 'string') : [];
      const auth = doc?.token_endpoint_auth_method || 'none';
      if (doc?.client_id === url && redirectUris.length && auth === 'none') {
        client = { redirect_uris: redirectUris, client_name: typeof doc.client_name === 'string' ? doc.client_name.slice(0, 80) : null, auth: 'none' };
      } else {
        log(`[MCP-OAuth] dokumen CIMD tidak valid: ${url}`);
      }
    } catch (err) {
      log(`[MCP-OAuth] gagal mengambil CIMD ${url}: ${err.message}`);
    }
    if (cimdCache.size > 200) cimdCache.clear();
    // Gagal di-cache singkat saja supaya gangguan jaringan sesaat cepat pulih.
    cimdCache.set(url, { client, expiresAt: Date.now() + (client ? CIMD_CACHE_TTL_MS : 60_000) });
    return client;
  };
  const resolveClient = async (clientId) => {
    if (isCimdClientId(clientId)) return resolveCimdClient(clientId);
    try { return parseMcpClientId(secret, clientId); } catch { return null; }
  };

  // ── Authorization endpoint ──
  // resource: kanonik /mcp (trailing slash bebas) atau origin polos — beberapa
  // klien mengirim origin; token selalu ber-audience kanonik.
  const resourceOk = (value, base) => !validateResourceIndicator(value, resourceOf(base)).error
    || !validateResourceIndicator(value, base).error;

  const validateAuthorize = async (q, base) => {
    const client = await resolveClient(q.client_id);
    if (!client) return { fatal: 'Aplikasi tidak dikenal. Hapus lalu tambahkan ulang sambungan Alhijaz di aplikasi AI-mu.' };
    const redirect = classifyRedirectUri(q.redirect_uri, allowedUris);
    if (!redirect.ok || !redirectUriRegistered(q.redirect_uri, client.redirect_uris)) return { fatal: 'Alamat kembali (redirect_uri) aplikasi ini tidak diizinkan.' };
    const display = clientDisplayName(redirect.host, client.client_name);
    const ctx = { client, redirectHost: redirect.host, display };
    if (q.response_type !== 'code') return { ...ctx, fatal: 'Permintaan tidak didukung (response_type harus code).' };
    if (q.code_challenge_method !== 'S256' || !q.code_challenge) return { ...ctx, fatal: 'Permintaan tidak aman: PKCE S256 wajib.' };
    if (!resourceOk(q.resource, base)) {
      log(`[MCP-OAuth] resource ditolak: ${String(q.resource).slice(0, 120)}`);
      return { ...ctx, fatal: 'Alamat server (resource) tidak cocok dengan Alhijaz MCP.' };
    }
    return ctx;
  };

  const sendPage = (res, status, opts) => {
    res.status(status)
      .set('Cache-Control', 'no-store')
      .set('X-Frame-Options', 'DENY')
      .set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'")
      .set('Referrer-Policy', 'no-referrer')
      .type('html')
      .send(renderAuthorizePage(opts));
  };

  app.get(`${ISSUER_PATH}/authorize`, async (req, res) => {
    if (limited(req, res)) return;
    const base = buildBaseUrl(req);
    const check = await validateAuthorize(req.query, base);
    if (check.fatal) return sendPage(res, 400, { base, display: check.display, error: check.fatal, showForm: false });
    sendPage(res, 200, { base, params: req.query, display: check.display, redirectHost: check.redirectHost });
  });

  const redirectWith = (res, redirectUri, params) => {
    const url = new URL(redirectUri);
    for (const [k, v] of Object.entries(params)) if (v != null && v !== '') url.searchParams.set(k, v);
    res.redirect(302, url.toString());
  };

  app.post(`${ISSUER_PATH}/authorize`, form, async (req, res) => {
    // Limit umum DULU: validasi klien bisa memicu fetch dokumen CIMD.
    if (limited(req, res)) return;
    const base = buildBaseUrl(req);
    const p = req.body || {};
    const check = await validateAuthorize(p, base);
    if (check.fatal) return sendPage(res, 400, { base, display: check.display, error: check.fatal, showForm: false });
    const page = (status, error, identifier) => sendPage(res, status, { base, params: p, display: check.display, redirectHost: check.redirectHost, error, identifier });

    if (p.action === 'deny') {
      return redirectWith(res, p.redirect_uri, { error: 'access_denied', error_description: 'Agent membatalkan izin', state: p.state, iss: issuerOf(base) });
    }
    if (!loginIpLimiter(clientIp(req))) return page(429, 'Terlalu banyak percobaan masuk. Coba lagi 10 menit lagi.', p.identifier);

    const identifier = String(p.identifier || '').trim().toLowerCase().slice(0, 120);
    const password = String(p.password || '');
    if (!identifier || !password) return page(400, 'Isi username/email dan password.', identifier);
    if (recentFails(identifier).length >= LOGIN_FAILS_PER_ACCOUNT) {
      return page(429, 'Terlalu banyak password salah untuk akun ini. Coba lagi dalam 1 jam, atau masuk lewat dashboard dulu.', identifier);
    }

    let agent;
    try {
      agent = await verifyAgentCredentials({ identifier, password });
    } catch (err) {
      log(`[MCP-OAuth] login lookup error: ${err.message}`);
      return page(503, 'Server sedang sibuk. Coba lagi sebentar.', identifier);
    }
    if (!agent) {
      if (accountFails.size > 5000) accountFails.clear();
      accountFails.set(identifier, [...recentFails(identifier), Date.now()]);
      log(`[MCP-OAuth] login gagal ip=${clientIp(req)}`);
      return page(401, 'Username/email atau password salah.', identifier);
    }
    accountFails.delete(identifier);
    if (agent.status !== 'active') return page(403, 'Akun ini belum aktif. Hubungi admin Alhijaz.', identifier);

    const code = jwt.sign({
      typ: 'mcp_code',
      cid: clientHash(p.client_id),
      auth: check.client.auth || 'none',
      redirect_uri: p.redirect_uri,
      code_challenge: p.code_challenge,
      client_name: check.display,
      redirect_host: check.redirectHost,
    }, secret, { subject: agent.id, expiresIn: CODE_TTL_SECONDS, jwtid: crypto.randomBytes(12).toString('hex') });
    log(`[MCP-OAuth] ${agent.slug}: izin diberikan ke ${check.display}`);
    redirectWith(res, p.redirect_uri, { code, state: p.state, iss: issuerOf(base) });
  });

  // ── Grant store (satu-satunya tabel yang ditulis modul ini) ──
  const consumeCode = (jti, expSec) => {
    const now = Date.now();
    for (const [k, v] of usedCodes) if (v < now) usedCodes.delete(k);
    if (!jti || usedCodes.has(jti)) return false;
    usedCodes.set(jti, (expSec || 0) * 1000 || now + CODE_TTL_SECONDS * 1000);
    return true;
  };

  const createGrant = async ({ agentId, clientName, redirectHost, refreshJti }) => {
    // Sambung ulang dari aplikasi yang sama (claude.ai/ChatGPT: satu sambungan
    // per akun) menggantikan grant lama supaya daftar sambungan tidak menumpuk.
    // Loopback dikecualikan: dua komputer berbeda sama-sama "localhost".
    if (redirectHost !== 'localhost') {
      const { error } = await supabase.from('mcp_oauth_grants')
        .update({ revoked_at: new Date().toISOString() })
        .eq('agent_id', agentId)
        .eq('client_name', clientName)
        .eq('redirect_host', redirectHost)
        .is('revoked_at', null);
      if (error) throw new Error(error.message);
      grantCache.clear();
    }
    const id = crypto.randomUUID();
    const { error } = await supabase.from('mcp_oauth_grants')
      .insert({ id, agent_id: agentId, client_name: clientName, redirect_host: redirectHost, refresh_jti: refreshJti });
    if (error) throw new Error(error.message);
    return id;
  };

  // agent aktif pemilik grant, atau null bila grant dicabut/tidak ada/agent non-aktif.
  const loadGrantAgent = async (gid, agentId, { fresh = false } = {}) => {
    const cached = grantCache.get(gid);
    if (!fresh && cached && cached.expiresAt > Date.now()) return cached.agent;
    const { data: grant, error } = await supabase.from('mcp_oauth_grants')
      .select('id, agent_id, revoked_at')
      .eq('id', gid)
      .maybeSingle();
    if (error) throw new Error(error.message);
    let agent = null;
    if (grant && !grant.revoked_at && grant.agent_id === agentId) {
      const { data, error: agentError } = await supabase.from('agents')
        .select('id, slug, name, status, role')
        .eq('id', grant.agent_id)
        .maybeSingle();
      if (agentError) throw new Error(agentError.message);
      if (data && data.status === 'active') agent = data;
    }
    if (grantCache.size > 2000) grantCache.clear();
    grantCache.set(gid, { agent, expiresAt: Date.now() + GRANT_CACHE_TTL_MS });
    return agent;
  };

  const stampGrantUsage = (gid) => {
    const now = Date.now();
    if ((stampedAt.get(gid) || 0) > now - LAST_USED_STAMP_INTERVAL_MS) return;
    if (stampedAt.size > 5000) stampedAt.clear();
    stampedAt.set(gid, now);
    supabase.from('mcp_oauth_grants').update({ last_used_at: new Date(now).toISOString() }).eq('id', gid)
      .then(({ error }) => { if (error) log(`[MCP-OAuth] stempel last_used gagal: ${error.message}`); })
      .catch((err) => log(`[MCP-OAuth] stempel last_used ditolak: ${err?.message || err}`));
  };

  // Rotasi refresh token sekali pakai (OAuth 2.1 untuk klien publik). jti yang
  // bukan milik grant saat ini = token lama dipakai ulang → kemungkinan bocor →
  // cabut seluruh sambungan; kecuali token tepat-sebelumnya dalam jendela singkat
  // (dua refresh paralel dari klien yang sama).
  const rotateRefresh = async ({ gid, sub, jti }) => {
    const { data: grant, error } = await supabase.from('mcp_oauth_grants')
      .select('id, agent_id, revoked_at, refresh_jti, prev_refresh_jti, refreshed_at')
      .eq('id', gid)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!grant || grant.revoked_at || grant.agent_id !== sub) return { error: 'revoked' };
    if (!jti || grant.refresh_jti !== jti) {
      const racing = jti && jti === grant.prev_refresh_jti && grant.refreshed_at
        && Date.now() - Date.parse(grant.refreshed_at) < REFRESH_REUSE_GRACE_MS;
      if (racing) return { error: 'race' };
      log(`[MCP-OAuth] refresh token lama dipakai ulang — sambungan ${gid.slice(0, 8)} dicabut`);
      await revokeGrant(gid);
      return { error: 'reused' };
    }
    const agent = await loadGrantAgent(gid, sub, { fresh: true });
    if (!agent) return { error: 'revoked' };
    const nextJti = crypto.randomBytes(12).toString('hex');
    const { data: updated, error: updateError } = await supabase.from('mcp_oauth_grants')
      .update({ refresh_jti: nextJti, prev_refresh_jti: jti, refreshed_at: new Date().toISOString() })
      .eq('id', gid)
      .eq('refresh_jti', jti)
      .is('revoked_at', null)
      .select('id');
    if (updateError) throw new Error(updateError.message);
    if (!updated?.length) return { error: 'race' };
    return { nextJti };
  };

  const revokeGrant = async (gid) => {
    const { error } = await supabase.from('mcp_oauth_grants')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', gid)
      .is('revoked_at', null);
    if (error) throw new Error(error.message);
    grantCache.delete(gid);
  };

  // ── Token endpoint ──
  // Kredensial klien: Basic header atau body. Klien publik ('none') cukup PKCE.
  const readClientAuth = (req) => {
    const b = req.body || {};
    const m = String(req.headers.authorization || '').match(/^Basic\s+(.+)$/i);
    if (m) {
      const decoded = Buffer.from(m[1], 'base64').toString('utf8');
      const i = decoded.indexOf(':');
      if (i <= 0) return { malformed: true };
      try {
        return { clientId: decodeURIComponent(decoded.slice(0, i)), clientSecret: decodeURIComponent(decoded.slice(i + 1)) };
      } catch {
        return { malformed: true };
      }
    }
    return { clientId: b.client_id, clientSecret: b.client_secret };
  };
  const clientAuthOk = ({ clientId, clientSecret, malformed }, { cid, auth }) => {
    if (malformed) return false;
    if (clientId && clientHash(clientId) !== cid) return false;
    if (!auth || auth === 'none') return true;
    if (!clientId || !clientSecret) return false;
    const expected = Buffer.from(clientSecretFor(secret, clientId));
    const given = Buffer.from(String(clientSecret));
    return expected.length === given.length && crypto.timingSafeEqual(expected, given);
  };

  // Audience SELALU URL kanonik — resource kiriman klien boleh beda trailing
  // slash, sedangkan verifikasi audience JWT membandingkan string persis.
  const tokenResponse = ({ base, agentId, grantId, cid, auth, refreshJti }) => ({
    access_token: issueMcpAccessToken(secret, { issuer: issuerOf(base), resource: resourceOf(base), agentId, grantId }),
    token_type: 'Bearer',
    expires_in: ACCESS_TTL_SECONDS,
    refresh_token: issueMcpRefreshToken(secret, { issuer: issuerOf(base), resource: resourceOf(base), agentId, grantId, cid, auth, jti: refreshJti }),
    scope: SCOPE,
  });

  app.post(`${ISSUER_PATH}/token`, form, json, async (req, res) => {
    if (limited(req, res)) return;
    res.set('Cache-Control', 'no-store').set('Pragma', 'no-cache');
    const base = buildBaseUrl(req);
    const b = req.body || {};
    const clientAuth = readClientAuth(req);
    const fail = (status, error, description) => {
      if (error === 'invalid_client') res.set('WWW-Authenticate', 'Basic realm="alhijaz"');
      return res.status(status).json({ error, error_description: description });
    };

    if (b.grant_type === 'authorization_code') {
      let payload;
      try { payload = jwt.verify(String(b.code || ''), secret); } catch { return fail(400, 'invalid_grant', 'authorization code tidak valid / kadaluarsa'); }
      if (payload.typ !== 'mcp_code') return fail(400, 'invalid_grant', 'tipe kode salah');
      if (!clientAuthOk(clientAuth, payload)) return fail(401, 'invalid_client', 'autentikasi klien gagal');
      if (b.redirect_uri != null && b.redirect_uri !== payload.redirect_uri) return fail(400, 'invalid_grant', 'redirect_uri tidak cocok');
      // RFC 7636: verifier 43–128 karakter unreserved.
      if (!/^[A-Za-z0-9._~-]{43,128}$/.test(String(b.code_verifier || ''))) return fail(400, 'invalid_grant', 'code_verifier tidak valid');
      if (!verifyPkceS256(b.code_verifier, payload.code_challenge)) return fail(400, 'invalid_grant', 'PKCE code_verifier tidak cocok');
      if (!resourceOk(b.resource, base)) return fail(400, 'invalid_target', 'resource tidak cocok dengan grant');
      if (!consumeCode(payload.jti, payload.exp)) return fail(400, 'invalid_grant', 'authorization code sudah dipakai');
      let grantId;
      const refreshJti = crypto.randomBytes(12).toString('hex');
      try {
        grantId = await createGrant({ agentId: payload.sub, clientName: payload.client_name, redirectHost: payload.redirect_host, refreshJti });
      } catch (err) {
        log(`[MCP-OAuth] gagal menyimpan grant: ${err.message}`);
        return fail(503, 'temporarily_unavailable', 'Coba lagi sebentar');
      }
      // Telemetri saja — hook boleh async; penolakan tidak boleh jadi unhandled
      // rejection (default Node: proses mati).
      Promise.resolve()
        .then(() => onConnect?.({ agentId: payload.sub, clientName: payload.client_name }))
        .catch((err) => log(`[MCP-OAuth] onConnect gagal: ${err?.message || err}`));
      return res.json(tokenResponse({ base, agentId: payload.sub, grantId, cid: payload.cid, auth: payload.auth, refreshJti }));
    }

    if (b.grant_type === 'refresh_token') {
      let payload;
      try {
        payload = verifyMcpToken(secret, b.refresh_token, { kind: 'rt', issuer: issuerOf(base), resource: resourceOf(base) });
      } catch { return fail(400, 'invalid_grant', 'refresh_token tidak valid / kadaluarsa'); }
      if (!clientAuthOk(clientAuth, payload)) return fail(401, 'invalid_client', 'autentikasi klien gagal');
      if (!resourceOk(b.resource, base)) return fail(400, 'invalid_target', 'resource tidak cocok');
      let rotated;
      try { rotated = await rotateRefresh({ gid: payload.gid, sub: payload.sub, jti: payload.jti }); } catch (err) {
        log(`[MCP-OAuth] refresh lookup error: ${err.message}`);
        return fail(503, 'temporarily_unavailable', 'Coba lagi sebentar');
      }
      if (rotated.error === 'race') return fail(400, 'invalid_grant', 'refresh_token sudah diganti — pakai token terbaru');
      if (rotated.error) return fail(400, 'invalid_grant', 'Sambungan sudah diputus — sambungkan ulang dari aplikasi AI');
      return res.json(tokenResponse({ base, agentId: payload.sub, grantId: payload.gid, cid: payload.cid, auth: payload.auth, refreshJti: rotated.nextJti }));
    }

    return fail(400, 'unsupported_grant_type', 'grant_type harus authorization_code atau refresh_token');
  });

  // ── Revocation (RFC 7009) — klien memanggilnya saat sambungan dihapus ──
  app.post(`${ISSUER_PATH}/revoke`, form, json, async (req, res) => {
    if (limited(req, res)) return;
    const base = buildBaseUrl(req);
    const token = String((req.body || {}).token || '');
    let payload = null;
    let kind = null;
    for (const k of ['rt', 'at']) {
      try { payload = verifyMcpToken(secret, token, { kind: k, issuer: issuerOf(base), resource: resourceOf(base) }); kind = k; break; } catch { /* coba jenis lain */ }
    }
    // RFC 7009: token tak dikenal tetap dijawab 200. Refresh token membawa
    // identitas klien (cid/auth) → klien confidential wajib autentikasi;
    // access token cukup dibuktikan dengan memilikinya.
    if (payload && (kind === 'at' || clientAuthOk(readClientAuth(req), payload))) {
      try { await revokeGrant(payload.gid); } catch (err) { log(`[MCP-OAuth] revoke gagal: ${err.message}`); return res.status(503).json({ error: 'temporarily_unavailable' }); }
    }
    res.status(200).end();
  });

  // ── Runtime untuk mcp-server.js ──
  return {
    resourceMetadataUrl: (req) => `${buildBaseUrl(req)}${PRM_PATH}`,
    parseBearer(header) {
      const m = typeof header === 'string' ? header.match(/^Bearer\s+(alhijaz_at_[A-Za-z0-9_-]+)\s*$/i) : null;
      return m ? m[1] : null;
    },
    // Sinkron, tanpa DB: menolak token palsu sebelum menyentuh Postgres.
    verifyAccessToken(token, req) {
      const base = buildBaseUrl(req);
      try {
        const p = verifyMcpToken(secret, token, { kind: 'at', issuer: issuerOf(base), resource: resourceOf(base) });
        return { agentId: p.sub, grantId: p.gid };
      } catch {
        return null;
      }
    },
    async resolveAgent({ agentId, grantId }) {
      const agent = await loadGrantAgent(grantId, agentId);
      if (agent) stampGrantUsage(grantId);
      return agent;
    },
    revokeGrant,
    // Ganti/reset password = semua aplikasi AI agent itu harus login ulang.
    async revokeAllForAgent(agentId) {
      const { error } = await supabase.from('mcp_oauth_grants')
        .update({ revoked_at: new Date().toISOString() })
        .eq('agent_id', agentId)
        .is('revoked_at', null);
      if (error) throw new Error(error.message);
      grantCache.clear();
    },
    invalidateGrant: (gid) => grantCache.delete(gid),
  };
}
