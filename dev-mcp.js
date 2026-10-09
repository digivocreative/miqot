// Dev-MCP — read-only Model Context Protocol endpoint (POST /dev-mcp) yang
// menggambarkan STRUKTUR PROJECT + DOKUMENTASI + DESIGN SYSTEM untuk brainstorming
// developer di claude.ai. BERBEDA dari mcp-server.js (`/mcp`, data bisnis per-agent) —
// yang ini single-user (developer), mengekspos repo di disk (versi ter-deploy).
//
// Desain (2026-07-09):
// - Transport Streamable HTTP STATELESS (server+transport baru per request,
//   sessionIdGenerator: undefined), mount di POST /dev-mcp pada Express utama.
// - Auth: OAuth 2.1 single-user (gerbang satu password DEV_MCP_PASSWORD) karena
//   custom connector claude.ai WAJIB alur OAuth (tak menerima bearer statis).
//   Semua artefak OAuth = JWT bertanda-tangan → tanpa tabel DB.
// - READ-ONLY & BATAS AMAN GIT: hanya file yang di-track git yang boleh dibaca
//   (git ls-files / git grep). `.env`, data/*.json, secret lain sudah gitignore →
//   otomatis tak terjangkau. Spawn git via execFile argumen-array (bukan shell)
//   → tak bisa command-injection. Semua path input di-guard path-traversal.
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createRateLimiter } from './mcp-server.js';

export const REPO_ROOT = dirname(fileURLToPath(import.meta.url));

const MAX_READ_BYTES = 200_000;
const MAX_SEARCH_RESULTS = 200;
const DEFAULT_SEARCH_RESULTS = 60;
const MAX_TREE_ENTRIES = 5000;
const ACCESS_TTL = '8h';
const REFRESH_TTL = '30d';
const CODE_TTL_SECONDS = 60;
const IP_RATE_LIMIT_PER_MINUTE = 120;
const DEFAULT_SCOPE = 'dev';
const SUPPORTED_SCOPES = new Set([DEFAULT_SCOPE]);

// ── Batas aman: secret khusus dev-mcp ────────────────────────────────────────
// DEV_MCP_SECRET bila di-set; kalau tidak, TURUNKAN dari JWT_SECRET lewat HMAC
// sehingga token dev-mcp secara kriptografis TERPISAH dari JWT dashboard (token
// dashboard tak bisa dipakai sebagai access token dev-mcp dan sebaliknya) tanpa
// mewajibkan env baru.
export function deriveSecret({ devSecret, jwtSecret } = {}) {
  if (devSecret) return String(devSecret);
  const base = jwtSecret || 'fallback-secret-change-me';
  return crypto.createHmac('sha256', 'dev-mcp-v1').update(String(base)).digest('hex');
}

// ── Git helpers (execFile, argumen array — no shell) ─────────────────────────
function git(args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  } catch (err) {
    // git grep keluar 1 saat tak ada match — bukan error sesungguhnya.
    if (allowFail) return err.stdout != null ? String(err.stdout) : '';
    throw err;
  }
}

export function isTracked(relPath) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', relPath], { cwd: REPO_ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function listTracked(pathspec = []) {
  const out = git(['ls-files', '-z', ...(pathspec.length ? ['--', ...pathspec] : [])]);
  return out.split('\0').filter(Boolean);
}

// ── Path & blocklist guards ──────────────────────────────────────────────────
// Resolve `input` terhadap root repo; kembalikan absolute path HANYA jika masih
// di dalam root (tolak `../`, absolute di luar root, dsb). null = ditolak.
export function resolveRepoPath(input, root = REPO_ROOT) {
  const rel = String(input || '').trim();
  if (!rel) return null;
  if (rel.includes('\0')) return null;
  const abs = resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + sep)) return null;
  return abs;
}

function toRel(abs) {
  return relative(REPO_ROOT, abs) || '.';
}

// Glob sederhana (mendukung * dan **) → regex, untuk DEV_MCP_BLOCK_GLOBS.
function globToRegExp(glob) {
  const globstar = '__DEV_MCP_GLOBSTAR__';
  const escaped = glob.trim()
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, globstar)      // ** → any (termasuk /)
    .replace(/\*/g, '[^/]*')          // *  → segmen
    .replace(new RegExp(globstar, 'g'), '.*');
  return new RegExp(`^${escaped}$`);
}

export function makeBlocklist(spec) {
  const globs = String(spec || '').split(',').map((s) => s.trim()).filter(Boolean);
  const res = globs.map(globToRegExp);
  return function isBlocked(relPath) {
    return res.some((re) => re.test(relPath));
  };
}

// ── Pembacaan aman (git-tracked + not-blocked + cap ukuran) ──────────────────
function safeReadFile(relInput, { isBlocked, start, end } = {}) {
  const abs = resolveRepoPath(relInput);
  if (!abs) return { error: `Path tidak valid / di luar repo: ${relInput}` };
  const rel = toRel(abs);
  if (!isTracked(rel)) return { error: `File tidak ditemukan atau tidak di-track git (secret/gitignore ditolak): ${rel}` };
  if (isBlocked && isBlocked(rel)) return { error: `File diblokir oleh kebijakan: ${rel}` };

  let text;
  try {
    const st = statSync(abs);
    if (!st.isFile()) return { error: `Bukan berkas biasa: ${rel}` };
    text = readFileSync(abs, 'utf8');
  } catch (err) {
    return { error: `Gagal membaca ${rel}: ${err.message}` };
  }

  let truncated = false;
  let lineRange = null;
  if (Number.isInteger(start) || Number.isInteger(end)) {
    const lines = text.split('\n');
    const from = Math.max(1, Number(start) || 1);
    const to = Math.min(lines.length, Number(end) || lines.length);
    text = lines.slice(from - 1, to).join('\n');
    lineRange = { from, to, total_lines: lines.length };
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_READ_BYTES) {
    text = Buffer.from(text, 'utf8').subarray(0, MAX_READ_BYTES).toString('utf8');
    truncated = true;
  }
  return { path: rel, content: text, ...(lineRange ? { line_range: lineRange } : {}), ...(truncated ? { truncated: true } : {}) };
}

// ── project_tree (pure, dari daftar path relatif) ────────────────────────────
export function buildProjectTree(paths, { dir = '', maxDepth = Infinity, maxEntries = MAX_TREE_ENTRIES } = {}) {
  const prefix = dir ? String(dir).replace(/\/+$/, '') + '/' : '';
  const root = {};
  let count = 0;
  let truncated = false;
  for (const p of paths) {
    if (prefix && !p.startsWith(prefix)) continue;
    const relToDir = prefix ? p.slice(prefix.length) : p;
    const parts = relToDir.split('/').filter(Boolean);
    if (!parts.length) continue;
    let node = root;
    for (let i = 0; i < parts.length && i < maxDepth; i++) {
      const isFile = i === parts.length - 1;
      const key = parts[i];
      if (isFile) {
        if (!(key in node)) {
          if (count >= maxEntries) { truncated = true; break; }
          node[key] = null; // file leaf
          count++; // count only files → entries == file_count
        }
      } else {
        if (node[key] == null) node[key] = {}; // create dir (absent or was a file-null)
        node = node[key];
      }
    }
    if (truncated) break;
  }

  const lines = [];
  const render = (node, depth) => {
    const keys = Object.keys(node).sort((a, b) => {
      const ad = node[a] !== null, bd = node[b] !== null;
      if (ad !== bd) return ad ? -1 : 1; // direktori dulu
      return a.localeCompare(b);
    });
    for (const k of keys) {
      const isDir = node[k] !== null;
      lines.push(`${'  '.repeat(depth)}${k}${isDir ? '/' : ''}`);
      if (isDir) render(node[k], depth + 1);
    }
  };
  render(root, 0);
  return { text: lines.join('\n'), entries: count, truncated };
}

// ── search_code (pure parser untuk output git grep) ──────────────────────────
export function parseGitGrep(out, { maxResults = DEFAULT_SEARCH_RESULTS, maxLineLen = 300 } = {}) {
  const rows = [];
  let truncated = false;
  for (const raw of String(out || '').split('\n')) {
    if (!raw) continue;
    const m = raw.match(/^([^:]+):(\d+):(.*)$/);
    if (!m) continue;
    if (rows.length >= maxResults) { truncated = true; break; }
    let line = m[3];
    if (line.length > maxLineLen) line = line.slice(0, maxLineLen) + '…';
    rows.push({ file: m[1], line: Number(m[2]), text: line });
  }
  return { rows, truncated };
}

// ── OAuth: PKCE, redirect_uri, token helpers (pure) ──────────────────────────
export function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(text) {
  const s = String(text).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(s + '='.repeat((4 - (s.length % 4)) % 4), 'base64').toString('utf8');
}

export function pkceChallengeFromVerifier(verifier) {
  return base64url(crypto.createHash('sha256').update(String(verifier)).digest());
}

export function verifyPkceS256(verifier, challenge) {
  if (!verifier || !challenge) return false;
  const expected = pkceChallengeFromVerifier(verifier);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(challenge));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Exact-match terhadap daftar teregistrasi + wajib https ATAU localhost.
export function validateRedirectUri(uri, registered = []) {
  if (!uri || !Array.isArray(registered) || !registered.includes(uri)) return false;
  let u;
  try { u = new URL(uri); } catch { return false; }
  const isLocalhost = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '::1';
  return u.protocol === 'https:' || (u.protocol === 'http:' && isLocalhost);
}

export function constantTimeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function wrapBearerToken(kind, token) {
  return `mcp_${kind}_${base64url(token)}`;
}

function unwrapBearerToken(token, kind) {
  const prefix = `mcp_${kind}_`;
  const raw = String(token || '');
  if (!raw.startsWith(prefix)) return raw; // backward-compatible with old JWTs already issued during debugging
  return base64urlDecode(raw.slice(prefix.length));
}

// Token helpers menerima `secret` eksplisit → mudah diuji tanpa env.
export function makeClientId(secret, meta = {}) {
  return jwt.sign({ typ: 'client', redirect_uris: meta.redirect_uris || [], client_name: meta.client_name || null }, secret);
}
export function parseClientId(secret, clientId) {
  const p = jwt.verify(clientId, secret);
  if (p.typ !== 'client') throw new Error('bukan client_id');
  return p;
}
export function issueAuthCode(secret, { redirect_uri, code_challenge, resource, client_id, scope = DEFAULT_SCOPE, scopeProvided = false }) {
  const jti = crypto.randomBytes(16).toString('hex');
  return jwt.sign({ typ: 'code', redirect_uri, code_challenge, resource, client_id, scope, scope_provided: Boolean(scopeProvided) }, secret, { expiresIn: `${CODE_TTL_SECONDS}s`, jwtid: jti });
}
export function issueAccessToken(secret, resource, ttl = ACCESS_TTL, { issuer, clientId, scope = DEFAULT_SCOPE } = {}) {
  const options = {
    subject: 'dev',
    audience: resource,
    expiresIn: ttl,
    jwtid: crypto.randomBytes(16).toString('hex'),
    header: { typ: 'at+jwt' },
  };
  if (issuer) options.issuer = issuer;
  const token = jwt.sign({ typ: 'at', ...(scope ? { scope } : {}), ...(clientId ? { client_id: clientId } : {}) }, secret, options);
  return wrapBearerToken('at', token);
}
export function issueRefreshToken(secret, resource, ttl = REFRESH_TTL, { issuer, clientId, scope = DEFAULT_SCOPE } = {}) {
  const options = {
    subject: 'dev',
    audience: resource,
    expiresIn: ttl,
    jwtid: crypto.randomBytes(16).toString('hex'),
  };
  if (issuer) options.issuer = issuer;
  const token = jwt.sign({ typ: 'rt', ...(scope ? { scope } : {}), ...(clientId ? { client_id: clientId } : {}) }, secret, options);
  return wrapBearerToken('rt', token);
}
export function verifyAccessToken(secret, token, resource, { issuer } = {}) {
  const p = jwt.verify(unwrapBearerToken(token, 'at'), secret, issuer ? { issuer } : {});
  if (p.typ !== 'at') throw new Error('typ token salah');
  const audiences = Array.isArray(p.aud) ? p.aud : [p.aud];
  if (!audiences.some((aud) => resourceMatchesCanonical(aud, resource))) throw new Error('audience token salah');
  return p;
}

export function decodeBearerToken(token, kind = 'at') {
  return jwt.decode(unwrapBearerToken(token, kind));
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function buildBaseUrl(req) {
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').toString().split(',')[0].trim();
  // Produksi SELALU di belakang TLS (Cloudflare→Caddy→node); x-forwarded-proto
  // dari edge bisa datang sebagai "http" (CF→Caddy internal) → PAKSA https untuk
  // host non-lokal. OAuth/connector claude.ai mewajibkan https. Localhost (dev/
  // test) boleh http.
  const isLocal = /^(localhost|127\.0\.0\.1|\[?::1\]?)(:\d+)?$/i.test(host);
  const xfProto = (req.headers['x-forwarded-proto'] || '').toString().split(',')[0].trim().toLowerCase();
  const proto = isLocal ? (xfProto || 'http') : 'https';
  return `${proto}://${host}`;
}
function canonicalResource(base) {
  return `${base}/dev-mcp`;
}
// Issuer Dev-MCP ber-PATH sejak 9 Okt 2026: root domain kini milik OAuth agent
// /mcp (mcp-oauth.js — ChatGPT hanya membaca metadata di root). Claude mengikuti
// path-insertion RFC 8414, jadi /.well-known/oauth-authorization-server/oauth/dev
// tetap ditemukan. Token lama ber-iss root masih diterima (DEV_LEGACY_ISSUER)
// supaya connector yang sudah tersambung tidak putus.
const DEV_ISSUER_PATH = '/oauth/dev';
function issuerOf(base) {
  return `${base}${DEV_ISSUER_PATH}`;
}
const acceptedIssuers = (base) => [issuerOf(base), base];
function protectedResourceMetadataUrl(base) {
  return `${base}/.well-known/oauth-protected-resource/dev-mcp`;
}

function oneParam(value) {
  if (Array.isArray(value)) return value.length ? value[value.length - 1] : undefined;
  return value;
}

function scopeParts(scope) {
  return String(scope || '').trim().split(/\s+/).filter(Boolean);
}

export function normalizeOAuthScope(value, defaultScope = DEFAULT_SCOPE) {
  const raw = oneParam(value);
  if (raw == null || String(raw).trim() === '') return defaultScope;
  const scopes = [...new Set(scopeParts(raw))];
  if (!scopes.length) return defaultScope;
  if (scopes.some((s) => !SUPPORTED_SCOPES.has(s))) return null;
  return scopes.join(' ');
}

function oauthScopeInfo(value, defaultScope = DEFAULT_SCOPE) {
  const raw = oneParam(value);
  const provided = raw != null && String(raw).trim() !== '';
  const scope = normalizeOAuthScope(value, defaultScope);
  if (!scope) return { error: 'invalid_scope' };
  return { scope, provided };
}

function scopeAllows(requested, granted) {
  const grantedSet = new Set(scopeParts(granted));
  return scopeParts(requested).every((s) => grantedSet.has(s));
}

function parseResourceUrl(resource) {
  try {
    const u = new URL(String(resource));
    if (!u.protocol || !u.hostname || u.hash || u.search) return null;
    return u;
  } catch {
    return null;
  }
}

function resourceMatchesCanonical(resource, canonical) {
  const r = parseResourceUrl(resource);
  const c = parseResourceUrl(canonical);
  if (!r || !c) return false;
  const rPath = r.pathname.replace(/\/+$/, '') || '/';
  const cPath = c.pathname.replace(/\/+$/, '') || '/';
  return r.protocol === c.protocol && r.host === c.host && rPath === cPath;
}

export function validateResourceIndicator(value, canonical) {
  const rawValues = Array.isArray(value) ? value : [value];
  const values = rawValues
    .map((v) => (v == null ? '' : String(v).trim()))
    .filter(Boolean);
  if (!values.length) return { resource: canonical, provided: false };

  const unique = [...new Set(values)];
  if (unique.length !== 1) return { error: 'multiple_resources' };

  const resource = unique[0];
  const u = parseResourceUrl(resource);
  if (!u) return { error: 'invalid_resource' };
  if (!resourceMatchesCanonical(resource, canonical)) return { error: 'invalid_target' };
  return { resource, provided: true };
}

// ── MCP server (tools) ───────────────────────────────────────────────────────
function toolResult(payload) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 1);
  return { content: [{ type: 'text', text }] };
}
function toolError(message) {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

function buildDevMcpServer({ log, isBlocked }) {
  const server = new McpServer({ name: 'alhijaz-dev', version: '1.0.0' });

  const register = (name, config, handler) => {
    server.registerTool(name, config, async (args = {}) => {
      log(`[DevMCP] ${name} (${Object.keys(args || {}).join(',') || 'no args'})`);
      try {
        return await handler(args);
      } catch (err) {
        log(`[DevMCP] ${name} ERROR ${err.message}`);
        return toolError('Terjadi kesalahan internal saat memproses permintaan.');
      }
    });
  };

  register('project_overview', {
    title: 'Ringkasan project',
    description: 'Dokumen arsitektur utama (docs/project-summary.md): stack, modul, endpoint, alur data. Baca ini dulu untuk memahami project.',
    inputSchema: {},
  }, async () => {
    const r = safeReadFile('docs/project-summary.md', { isBlocked });
    return r.error ? toolError(r.error) : toolResult(r);
  });

  register('design_system', {
    title: 'Design system',
    description: 'Spesifikasi design system (docs/DESIGN-SYSTEM.md): token warna, komponen, pola UI, gotcha. Baca sebelum mendiskusikan UI/tampilan.',
    inputSchema: {},
  }, async () => {
    const r = safeReadFile('docs/DESIGN-SYSTEM.md', { isBlocked });
    return r.error ? toolError(r.error) : toolResult(r);
  });

  register('list_docs', {
    title: 'Daftar dokumen',
    description: 'Daftar seluruh dokumen markdown project (docs/*.md dan *.md di root) yang bisa dibaca via read_doc.',
    inputSchema: {},
  }, async () => {
    const docs = listTracked(['docs/**/*.md', '*.md']).filter((p) => !isBlocked(p)).sort();
    return toolResult({ total: docs.length, docs });
  });

  register('read_doc', {
    title: 'Baca dokumen',
    description: 'Baca satu dokumen markdown (dari list_docs). Hanya file .md di docs/ atau root project.',
    inputSchema: {
      path: z.string().min(1).max(200).describe('Path dokumen relatif, mis. docs/api-integration-spec.md'),
    },
  }, async ({ path }) => {
    const abs = resolveRepoPath(path);
    const rel = abs ? toRel(abs) : '';
    const okShape = /^docs\/.+\.md$/i.test(rel) || /^[^/]+\.md$/i.test(rel);
    if (!okShape) return toolError('read_doc hanya untuk berkas .md di docs/ atau root project. Pakai read_file untuk berkas lain.');
    const r = safeReadFile(rel, { isBlocked });
    return r.error ? toolError(r.error) : toolResult(r);
  });

  register('project_tree', {
    title: 'Struktur file project',
    description: 'Pohon file project (hanya file yang di-track git — node_modules/dist/data & secret otomatis tak muncul). '
      + 'Batasi dengan dir dan/atau depth untuk fokus pada sub-bagian.',
    inputSchema: {
      dir: z.string().max(200).optional().describe('Batasi ke subdirektori, mis. "src/components" atau "lib"'),
      depth: z.preprocess((v) => (v == null || v === '' ? undefined : Number(v)), z.number().int().min(1).max(20)).optional()
        .describe('Kedalaman maksimum level folder (default: seluruhnya)'),
    },
  }, async ({ dir = '', depth }) => {
    if (dir) {
      const abs = resolveRepoPath(dir);
      if (!abs) return toolError(`Direktori tidak valid / di luar repo: ${dir}`);
      dir = toRel(abs);
      if (dir === '.') dir = '';
    }
    const paths = listTracked(dir ? ['--', dir] : []);
    const tree = buildProjectTree(paths, { dir, maxDepth: depth || Infinity });
    return toolResult({
      dir: dir || '(root)',
      ...(depth ? { depth } : {}),
      file_count: tree.entries,
      ...(tree.truncated ? { truncated: true, truncated_note: `Dipotong di ${MAX_TREE_ENTRIES} entri — persempit dengan dir/depth.` } : {}),
      tree: tree.text,
    });
  });

  register('search_code', {
    title: 'Cari di kode',
    description: 'Cari string/regex di seluruh kode project (git grep, hanya file ter-track). '
      + 'Kembalikan file:line:cuplikan. Batasi dengan path_glob (mis. "src/**/*.tsx") dan max_results.',
    inputSchema: {
      query: z.string().min(2).max(200).describe('Teks yang dicari (default: pencocokan literal)'),
      regex: z.boolean().optional().describe('true = perlakukan query sebagai regex (POSIX extended)'),
      path_glob: z.string().max(200).optional().describe('Batasi ke pathspec git, mis. "src/**/*.ts" atau "lib"'),
      max_results: z.preprocess((v) => (v == null || v === '' ? undefined : Number(v)), z.number().int().min(1).max(MAX_SEARCH_RESULTS)).optional(),
    },
  }, async ({ query, regex, path_glob, max_results = DEFAULT_SEARCH_RESULTS }) => {
    const cap = Math.min(Number(max_results) || DEFAULT_SEARCH_RESULTS, MAX_SEARCH_RESULTS);
    const args = ['grep', '-n', '-I', '--no-color'];
    args.push(regex ? '-E' : '-F');
    args.push('-e', String(query));
    if (path_glob) {
      const abs = resolveRepoPath(path_glob.replace(/[*?].*$/, '') || '.');
      if (!abs) return toolError(`path_glob tidak valid / di luar repo: ${path_glob}`);
      args.push('--', path_glob);
    }
    const out = git(args, { allowFail: true });
    const { rows, truncated } = parseGitGrep(out, { maxResults: cap });
    return toolResult({
      query,
      total: rows.length,
      ...(truncated ? { truncated: true, truncated_note: `Hanya ${cap} hasil pertama — persempit query/path_glob.` } : {}),
      matches: rows,
    });
  });

  register('read_file', {
    title: 'Baca berkas',
    description: 'Baca isi satu berkas project (hanya file yang di-track git — secret/gitignore ditolak). '
      + 'Opsional rentang baris start/end. Untuk file besar baca per-rentang.',
    inputSchema: {
      path: z.string().min(1).max(300).describe('Path berkas relatif, mis. server.js atau src/components/App.tsx'),
      start: z.preprocess((v) => (v == null || v === '' ? undefined : Number(v)), z.number().int().min(1)).optional().describe('Baris awal (1-indexed)'),
      end: z.preprocess((v) => (v == null || v === '' ? undefined : Number(v)), z.number().int().min(1)).optional().describe('Baris akhir (inklusif)'),
    },
  }, async ({ path, start, end }) => {
    const r = safeReadFile(path, { isBlocked, start, end });
    return r.error ? toolError(r.error) : toolResult(r);
  });

  return server;
}

// ── HTTP wiring ──────────────────────────────────────────────────────────────
function jsonRpcError(res, status, code, message) {
  res.status(status).json({ jsonrpc: '2.0', error: { code, message }, id: null });
}

export function authorizePage({ base, error, params }) {
  const hidden = ['response_type', 'client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method', 'resource', 'scope']
    .map((k) => `<input type="hidden" name="${k}" value="${escapeHtml(params[k] || '')}">`)
    .join('\n      ');
  return `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sambungkan Dev MCP</title>
<style>
  :root{color-scheme:light dark}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;display:grid;min-height:100vh;place-items:center}
  .card{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:28px;width:min(92vw,380px);box-shadow:0 20px 50px rgba(0,0,0,.4)}
  h1{font-size:18px;margin:0 0 4px}
  p{font-size:13px;color:#94a3b8;margin:0 0 18px;line-height:1.5}
  label{font-size:12px;font-weight:600;color:#cbd5e1;display:block;margin-bottom:6px}
  input[type=password]{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:10px;border:1px solid #475569;background:#0f172a;color:#e2e8f0;font-size:14px}
  button{width:100%;margin-top:16px;padding:12px;border:0;border-radius:10px;background:#14b8a6;color:#042f2e;font-weight:700;font-size:14px;cursor:pointer}
  .err{background:#7f1d1d;color:#fecaca;font-size:12px;padding:9px 12px;border-radius:8px;margin-bottom:14px}
  .badge{display:inline-block;font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#5eead4;background:#134e4a;padding:3px 8px;border-radius:999px;margin-bottom:12px}
</style></head><body>
  <form class="card" method="post" action="${escapeHtml(base)}/oauth/dev/authorize">
    <span class="badge">Dev MCP · baca-saja</span>
    <h1>Sambungkan Claude ke repo Alhijaz</h1>
    <p>Akses baca-saja ke dokumentasi &amp; struktur kode untuk brainstorming. Masukkan password developer.</p>
    ${error ? `<div class="err">${escapeHtml(error)}</div>` : ''}
    <label for="pw">Password developer</label>
    <input id="pw" name="password" type="password" autocomplete="current-password" autofocus required>
    ${hidden}
    <button type="submit">Izinkan akses</button>
  </form>
</body></html>`;
}

// initDevMcp(app, { log }) — pasang endpoint discovery, OAuth, dan /dev-mcp.
export function initDevMcp(app, { log = console.log, env = process.env } = {}) {
  const password = env.DEV_MCP_PASSWORD || '';
  const secret = deriveSecret({ devSecret: env.DEV_MCP_SECRET, jwtSecret: env.JWT_SECRET });
  const isBlocked = makeBlocklist(env.DEV_MCP_BLOCK_GLOBS);
  const enabled = Boolean(password);

  if (!enabled) {
    log('[DevMCP] DEV_MCP_PASSWORD tidak di-set → endpoint /dev-mcp NONAKTIF (set env untuk mengaktifkan).');
  } else if (!env.DEV_MCP_SECRET) {
    log('[DevMCP] DEV_MCP_SECRET tidak di-set → memakai secret turunan dari JWT_SECRET (aman, tapi set DEV_MCP_SECRET untuk pemisahan penuh).');
  }

  const ipLimiter = createRateLimiter({ limit: IP_RATE_LIMIT_PER_MINUTE });
  const usedCodes = new Map(); // jti -> exp epoch ms (single-use auth code)
  const consumeCode = (jti, expSec) => {
    const now = Date.now();
    for (const [k, v] of usedCodes) if (v < now) usedCodes.delete(k);
    if (!jti || usedCodes.has(jti)) return false;
    usedCodes.set(jti, (expSec || 0) * 1000 || now + CODE_TTL_SECONDS * 1000);
    return true;
  };

  const clientIp = (req) => req.headers['x-real-ip']
    || (typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'].split(',')[0].trim() : '')
    || req.ip || 'unknown';
  const rateLimited = (req, res) => {
    if (ipLimiter(clientIp(req))) return false;
    res.status(429).json({ error: 'rate_limited', error_description: `Terlalu banyak request (max ${IP_RATE_LIMIT_PER_MINUTE}/menit)` });
    return true;
  };

  const form = express.urlencoded({ extended: false, limit: '32kb' });
  const json = express.json({ limit: '32kb' });

  // CORS — claude.ai melakukan discovery/OAuth (dan probe konektivitas) dari
  // BROWSER, jadi tanpa header CORS browser memblokir request → "Couldn't
  // connect to the server". Wajib EXPOSE `WWW-Authenticate` supaya browser bisa
  // membaca tantangan 401 dan memulai alur OAuth, plus `Mcp-Session-Id`.
  const applyCors = (req, res) => {
    res.set('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', req.headers['access-control-request-headers']
      || 'Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID');
    res.set('Access-Control-Expose-Headers', 'Mcp-Session-Id, WWW-Authenticate');
    res.set('Access-Control-Max-Age', '86400');
  };
  const corsMw = (req, res, next) => {
    applyCors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  };
  app.use(['/dev-mcp', '/oauth/dev', '/.well-known/oauth-protected-resource/dev-mcp', '/.well-known/oauth-authorization-server/oauth/dev', '/.well-known/oauth-authorization-server/dev-mcp'], corsMw);

  // ── Discovery (RFC 9728 + RFC 8414) — plain & path-suffixed ──
  const protectedResource = (req, res) => {
    const base = buildBaseUrl(req);
    res.set('Cache-Control', 'no-store').json({
      resource: canonicalResource(base),
      resource_name: 'Alhijaz Dev MCP',
      authorization_servers: [issuerOf(base)],
      scopes_supported: [DEFAULT_SCOPE],
      bearer_methods_supported: ['header'],
    });
  };
  app.get('/.well-known/oauth-protected-resource/dev-mcp', protectedResource);

  const authServerMeta = (req, res) => {
    const base = buildBaseUrl(req);
    res.set('Cache-Control', 'no-store').json({
      issuer: issuerOf(base),
      authorization_endpoint: `${base}/oauth/dev/authorize`,
      token_endpoint: `${base}/oauth/dev/token`,
      registration_endpoint: `${base}/oauth/dev/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      authorization_response_iss_parameter_supported: true,
      scopes_supported: [DEFAULT_SCOPE],
    });
  };
  // Path-insertion (RFC 8414) & path-append untuk issuer /oauth/dev, plus varian
  // lama /dev-mcp untuk klien yang menebak issuer dari URL resource.
  app.get('/.well-known/oauth-authorization-server/oauth/dev', authServerMeta);
  app.get('/oauth/dev/.well-known/oauth-authorization-server', authServerMeta);
  app.get('/.well-known/oauth-authorization-server/dev-mcp', authServerMeta);

  // ── Dynamic Client Registration (RFC 7591) ──
  app.post('/oauth/dev/register', json, (req, res) => {
    if (rateLimited(req, res)) return;
    const body = req.body || {};
    const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u) => typeof u === 'string') : [];
    if (!redirectUris.length) {
      return res.status(400).json({ error: 'invalid_redirect_uri', error_description: 'redirect_uris wajib diisi minimal satu' });
    }
    for (const u of redirectUris) {
      try {
        const parsed = new URL(u);
        const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1';
        if (!(parsed.protocol === 'https:' || (parsed.protocol === 'http:' && local))) {
          return res.status(400).json({ error: 'invalid_redirect_uri', error_description: `redirect_uri harus https atau localhost: ${u}` });
        }
      } catch {
        return res.status(400).json({ error: 'invalid_redirect_uri', error_description: `redirect_uri tidak valid: ${u}` });
      }
    }
    const clientId = makeClientId(secret, { redirect_uris: redirectUris, client_name: body.client_name });
    res.status(201).set('Cache-Control', 'no-store').json({
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      ...(body.client_name ? { client_name: body.client_name } : {}),
    });
  });

  // ── Authorization endpoint ──
  const validateAuthorizeParams = (q, base) => {
    if (q.response_type !== 'code') return { error: 'Hanya response_type=code yang didukung' };
    if (q.code_challenge_method !== 'S256' || !q.code_challenge) return { error: 'PKCE S256 wajib (code_challenge + code_challenge_method=S256)' };
    let client;
    try { client = parseClientId(secret, q.client_id); } catch { return { error: 'client_id tidak dikenal — daftar dulu via registration' }; }
    if (!validateRedirectUri(q.redirect_uri, client.redirect_uris)) return { error: 'redirect_uri tidak cocok dengan yang teregistrasi' };
    const scopeInfo = oauthScopeInfo(q.scope);
    if (scopeInfo.error) return { error: 'scope tidak didukung' };
    const target = validateResourceIndicator(q.resource, canonicalResource(base));
    if (target.error) return { error: 'resource tidak valid untuk Dev MCP' };
    return { client, resource: target.resource, scope: scopeInfo.scope, scopeProvided: scopeInfo.provided };
  };

  app.get('/oauth/dev/authorize', (req, res) => {
    if (rateLimited(req, res)) return;
    const base = buildBaseUrl(req);
    if (!enabled) return res.status(503).type('html').send(authorizePage({ base, error: 'Dev MCP belum dikonfigurasi (DEV_MCP_PASSWORD kosong).', params: {} }));
    const check = validateAuthorizeParams(req.query, base);
    if (check.error) return res.status(400).type('html').send(authorizePage({ base, error: check.error, params: {} }));
    res.type('html').send(authorizePage({ base, params: req.query }));
  });

  app.post('/oauth/dev/authorize', form, (req, res) => {
    if (rateLimited(req, res)) return;
    const base = buildBaseUrl(req);
    if (!enabled) return res.status(503).type('html').send(authorizePage({ base, error: 'Dev MCP belum dikonfigurasi.', params: {} }));
    const p = req.body || {};
    const check = validateAuthorizeParams(p, base);
    if (check.error) return res.status(400).type('html').send(authorizePage({ base, error: check.error, params: {} }));
    if (!p.password || !constantTimeEqual(p.password, password)) {
      return res.status(401).type('html').send(authorizePage({ base, error: 'Password salah.', params: p }));
    }
    const code = issueAuthCode(secret, {
      redirect_uri: p.redirect_uri,
      code_challenge: p.code_challenge,
      resource: check.resource,
      client_id: p.client_id,
      scope: check.scope,
      scopeProvided: check.scopeProvided,
    });
    const url = new URL(p.redirect_uri);
    url.searchParams.set('code', code);
    if (p.state) url.searchParams.set('state', p.state);
    url.searchParams.set('iss', issuerOf(base));
    res.redirect(302, url.toString());
  });

  const pickTokenResource = (requested, granted, canonical) => {
    const target = validateResourceIndicator(requested, canonical);
    if (target.error) return { error: target.error };
    const grantedResource = resourceMatchesCanonical(granted, canonical) ? granted : canonical;
    if (target.provided && !resourceMatchesCanonical(target.resource, grantedResource)) return { error: 'invalid_target' };
    return { resource: target.provided ? target.resource : grantedResource };
  };

  const pickTokenScope = (requested, granted) => {
    const grantedScope = normalizeOAuthScope(granted);
    const raw = oneParam(requested);
    const hasRequested = raw != null && String(raw).trim() !== '';
    const requestedScope = hasRequested ? normalizeOAuthScope(raw) : grantedScope;
    if (!grantedScope || !requestedScope || !scopeAllows(requestedScope, grantedScope)) return { error: 'invalid_scope' };
    return { scope: requestedScope, includeResponseScope: hasRequested };
  };

  // ── Token endpoint ──
  app.post('/oauth/dev/token', form, (req, res) => {
    if (rateLimited(req, res)) return;
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    const base = buildBaseUrl(req);
    const canonical = canonicalResource(base);
    const b = req.body || {};

    const tokenJson = ({ resource, scope, includeResponseScope, clientId }) => {
      return {
        access_token: issueAccessToken(secret, resource, ACCESS_TTL, { issuer: issuerOf(base), clientId, scope }),
        token_type: 'Bearer',
        expires_in: 8 * 3600,
        refresh_token: issueRefreshToken(secret, resource, REFRESH_TTL, { issuer: issuerOf(base), clientId, scope }),
        ...(includeResponseScope ? { scope } : {}),
      };
    };

    if (b.grant_type === 'authorization_code') {
      let payload;
      try { payload = jwt.verify(b.code, secret); } catch { return res.status(400).json({ error: 'invalid_grant', error_description: 'authorization code tidak valid / kadaluarsa' }); }
      if (payload.typ !== 'code') return res.status(400).json({ error: 'invalid_grant', error_description: 'tipe token salah' });
      if (b.client_id && payload.client_id !== b.client_id) return res.status(400).json({ error: 'invalid_grant', error_description: 'client_id tidak cocok' });
      // redirect_uri: wajib cocok bila DIKIRIM. Sebagian klien tak mengirim ulang
      // di token request; PKCE + code JWT bertanda-tangan sudah mengikat grant,
      // jadi bila absent kita tak menolak.
      if (b.redirect_uri != null && payload.redirect_uri !== b.redirect_uri) return res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri tidak cocok' });
      if (!verifyPkceS256(b.code_verifier, payload.code_challenge)) return res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE code_verifier tidak cocok' });
      if (!consumeCode(payload.jti, payload.exp)) return res.status(400).json({ error: 'invalid_grant', error_description: 'authorization code sudah dipakai' });
      const target = pickTokenResource(b.resource, payload.resource, canonical);
      if (target.error) return res.status(400).json({ error: 'invalid_target', error_description: 'resource tidak valid untuk grant ini' });
      const targetScope = pickTokenScope(b.scope, payload.scope);
      if (targetScope.error) return res.status(400).json({ error: 'invalid_scope', error_description: 'scope tidak valid untuk grant ini' });
      return res.json(tokenJson({ resource: target.resource, scope: targetScope.scope, includeResponseScope: targetScope.includeResponseScope, clientId: payload.client_id }));
    }

    if (b.grant_type === 'refresh_token') {
      let payload;
      try { payload = jwt.verify(unwrapBearerToken(b.refresh_token, 'rt'), secret, { issuer: acceptedIssuers(base) }); } catch { return res.status(400).json({ error: 'invalid_grant', error_description: 'refresh_token tidak valid / kadaluarsa' }); }
      if (payload.typ !== 'rt') return res.status(400).json({ error: 'invalid_grant', error_description: 'tipe token salah' });
      if (b.client_id && payload.client_id && payload.client_id !== b.client_id) return res.status(400).json({ error: 'invalid_grant', error_description: 'client_id tidak cocok' });
      const target = pickTokenResource(b.resource, payload.aud, canonical);
      if (target.error) return res.status(400).json({ error: 'invalid_target', error_description: 'resource tidak valid untuk refresh token ini' });
      const targetScope = pickTokenScope(b.scope, payload.scope);
      if (targetScope.error) return res.status(400).json({ error: 'invalid_scope', error_description: 'scope tidak valid untuk refresh token ini' });
      return res.json(tokenJson({ resource: target.resource, scope: targetScope.scope, includeResponseScope: targetScope.includeResponseScope, clientId: payload.client_id || b.client_id }));
    }

    return res.status(400).json({ error: 'unsupported_grant_type', error_description: 'grant_type harus authorization_code atau refresh_token' });
  });

  // ── /dev-mcp (MCP endpoint) ──
  app.post('/dev-mcp', json, async (req, res) => {
    if (!ipLimiter(clientIp(req))) return jsonRpcError(res, 429, -32002, `Rate limit: max ${IP_RATE_LIMIT_PER_MINUTE}/menit`);
    const base = buildBaseUrl(req);
    const resource = canonicalResource(base);
    const challenge = `Bearer resource_metadata="${protectedResourceMetadataUrl(base)}"`;

    if (!enabled) {
      res.set('WWW-Authenticate', challenge);
      return jsonRpcError(res, 503, -32003, 'Dev MCP belum dikonfigurasi (DEV_MCP_PASSWORD kosong)');
    }

    const auth = req.headers.authorization || '';
    const m = auth.match(/^Bearer\s+(.+)\s*$/i);
    if (!m) {
      res.set('WWW-Authenticate', challenge);
      return jsonRpcError(res, 401, -32001, 'Unauthorized: OAuth diperlukan');
    }
    try {
      verifyAccessToken(secret, m[1].trim(), resource, { issuer: acceptedIssuers(base) });
    } catch {
      res.set('WWW-Authenticate', `${challenge}, error="invalid_token"`);
      return jsonRpcError(res, 401, -32001, 'Unauthorized: access token tidak valid / kadaluarsa');
    }

    try {
      const server = buildDevMcpServer({ log, isBlocked });
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => { transport.close(); server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      log(`[DevMCP] request error ${err.message}`);
      if (!res.headersSent) jsonRpcError(res, 500, -32603, 'Internal server error');
    }
  });

  const methodNotAllowed = (req, res) => jsonRpcError(res, 405, -32000, 'Method not allowed (stateless MCP: gunakan POST)');
  app.get('/dev-mcp', methodNotAllowed);
  app.delete('/dev-mcp', methodNotAllowed);

  return { enabled };
}
