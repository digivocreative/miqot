import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import jwt from 'jsonwebtoken';
import express from 'express';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import {
  initDevMcp,
  REPO_ROOT,
  deriveSecret,
  resolveRepoPath,
  isTracked,
  makeBlocklist,
  buildProjectTree,
  parseGitGrep,
  base64url,
  pkceChallengeFromVerifier,
  verifyPkceS256,
  validateRedirectUri,
  constantTimeEqual,
  buildBaseUrl,
  validateResourceIndicator,
  normalizeOAuthScope,
  authorizePage,
  makeClientId,
  parseClientId,
  issueAuthCode,
  issueAccessToken,
  issueRefreshToken,
  verifyAccessToken,
  decodeBearerToken,
} from '../dev-mcp.js';

const SECRET = 'test-secret-dev-mcp';
const RESOURCE = 'https://alhijaz.co/dev-mcp';

// ── Path & boundary guards ──
test('resolveRepoPath rejects path traversal & escapes', () => {
  assert.equal(resolveRepoPath('../../etc/passwd'), null);
  assert.equal(resolveRepoPath('/etc/passwd'), null);
  assert.equal(resolveRepoPath('src/../../../etc/passwd'), null);
  assert.equal(resolveRepoPath(''), null);
  assert.equal(resolveRepoPath('foo\0bar'), null);
  // in-repo paths resolve to absolute under root
  assert.ok(resolveRepoPath('server.js').startsWith(REPO_ROOT));
  assert.ok(resolveRepoPath('src/components').startsWith(REPO_ROOT));
});

test('isTracked accepts tracked files and rejects .env / untracked', () => {
  assert.equal(isTracked('server.js'), true);
  assert.equal(isTracked('mcp-server.js'), true);
  assert.equal(isTracked('package.json'), true);
  // .env is gitignored → never tracked → the git boundary blocks secret leakage
  assert.equal(isTracked('.env'), false);
  assert.equal(isTracked('this/file/does/not/exist.js'), false);
});

test('makeBlocklist matches globs (incl **) and passes others', () => {
  const blocked = makeBlocklist('SECURITY-AUDIT-REPORT.md, docs/**');
  assert.equal(blocked('SECURITY-AUDIT-REPORT.md'), true);
  assert.equal(blocked('docs/project-summary.md'), true);
  assert.equal(blocked('docs/a/b/c.md'), true);
  assert.equal(blocked('server.js'), false);
  // empty spec blocks nothing
  const none = makeBlocklist('');
  assert.equal(none('anything.js'), false);
});

// ── project_tree (pure) ──
test('buildProjectTree groups dirs first and honors dir/depth', () => {
  const paths = [
    'server.js',
    'src/App.tsx',
    'src/components/Card.tsx',
    'src/components/Nav.tsx',
    'lib/util.js',
  ];
  const full = buildProjectTree(paths);
  assert.equal(full.entries, 5);
  // directories rendered before files at root level (lib/, src/ before server.js)
  const rootLines = full.text.split('\n').filter((l) => !l.startsWith(' '));
  assert.deepEqual(rootLines, ['lib/', 'src/', 'server.js']);

  const scoped = buildProjectTree(paths, { dir: 'src/components' });
  assert.match(scoped.text, /Card\.tsx/);
  assert.doesNotMatch(scoped.text, /server\.js/);

  const shallow = buildProjectTree(paths, { maxDepth: 1 });
  // depth 1 collapses src/components/* — only top-level dir names + files
  assert.match(shallow.text, /^src\/$/m);
  assert.doesNotMatch(shallow.text, /Card\.tsx/);
});

test('buildProjectTree caps entries', () => {
  const paths = Array.from({ length: 50 }, (_, i) => `f${i}.js`);
  const t = buildProjectTree(paths, { maxEntries: 10 });
  assert.equal(t.truncated, true);
  assert.ok(t.entries <= 11);
});

// ── search_code parser ──
test('parseGitGrep parses file:line:text and caps results', () => {
  const out = ['a.js:12:const x = 1', 'b.ts:3:foo()', 'nomatchline', 'c.js:99:bar'].join('\n');
  const { rows } = parseGitGrep(out, { maxResults: 10 });
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { file: 'a.js', line: 12, text: 'const x = 1' });

  const many = Array.from({ length: 20 }, (_, i) => `f.js:${i + 1}:hit`).join('\n');
  const capped = parseGitGrep(many, { maxResults: 5 });
  assert.equal(capped.rows.length, 5);
  assert.equal(capped.truncated, true);
});

// ── PKCE ──
test('verifyPkceS256 matches challenge derived from verifier', () => {
  const verifier = base64url(Buffer.from('a'.repeat(48)));
  const challenge = pkceChallengeFromVerifier(verifier);
  assert.equal(verifyPkceS256(verifier, challenge), true);
  assert.equal(verifyPkceS256(verifier, challenge + 'x'), false);
  assert.equal(verifyPkceS256('wrong', challenge), false);
  assert.equal(verifyPkceS256('', challenge), false);
});

// ── redirect_uri validation ──
test('validateRedirectUri requires exact match + https/localhost', () => {
  const reg = ['https://claude.ai/api/mcp/auth_callback', 'http://localhost:5173/cb'];
  assert.equal(validateRedirectUri('https://claude.ai/api/mcp/auth_callback', reg), true);
  assert.equal(validateRedirectUri('http://localhost:5173/cb', reg), true);
  // not registered
  assert.equal(validateRedirectUri('https://evil.com/cb', reg), false);
  // registered but http non-localhost would fail the scheme check
  assert.equal(validateRedirectUri('http://claude.ai/cb', ['http://claude.ai/cb']), false);
  assert.equal(validateRedirectUri('', reg), false);
});

test('constantTimeEqual', () => {
  assert.equal(constantTimeEqual('abc', 'abc'), true);
  assert.equal(constantTimeEqual('abc', 'abd'), false);
  assert.equal(constantTimeEqual('abc', 'abcd'), false);
});

test('validateResourceIndicator accepts only the Dev-MCP resource', () => {
  assert.deepEqual(validateResourceIndicator(undefined, RESOURCE), { resource: RESOURCE, provided: false });
  assert.deepEqual(validateResourceIndicator(RESOURCE, RESOURCE), { resource: RESOURCE, provided: true });
  // trailing slash is accepted as the same resource, but the requested value is preserved for aud echoing.
  assert.deepEqual(validateResourceIndicator(`${RESOURCE}/`, RESOURCE), { resource: `${RESOURCE}/`, provided: true });
  assert.equal(validateResourceIndicator('https://evil.com/dev-mcp', RESOURCE).error, 'invalid_target');
  assert.equal(validateResourceIndicator('https://alhijaz.co/other', RESOURCE).error, 'invalid_target');
  assert.equal(validateResourceIndicator(`${RESOURCE}#frag`, RESOURCE).error, 'invalid_resource');
  assert.equal(validateResourceIndicator([RESOURCE, 'https://evil.com/dev-mcp'], RESOURCE).error, 'multiple_resources');
});

test('normalizeOAuthScope defaults to dev and rejects unsupported scopes', () => {
  assert.equal(normalizeOAuthScope(undefined), 'dev');
  assert.equal(normalizeOAuthScope(''), 'dev');
  assert.equal(normalizeOAuthScope('dev dev'), 'dev');
  assert.equal(normalizeOAuthScope('openid'), null);
  assert.equal(normalizeOAuthScope('dev openid'), null);
});

// ── base URL (proto forcing behind TLS proxy) ──
test('buildBaseUrl forces https for non-localhost even if edge says http', () => {
  const mk = (headers) => buildBaseUrl({ headers });
  // Cloudflare/Caddy may forward x-forwarded-proto: http → must still be https
  assert.equal(mk({ host: 'alhijaz.co', 'x-forwarded-proto': 'http' }), 'https://alhijaz.co');
  assert.equal(mk({ host: 'alhijaz.co' }), 'https://alhijaz.co');
  assert.equal(mk({ 'x-forwarded-host': 'alhijaz.co', host: 'node:3000' }), 'https://alhijaz.co');
  // localhost keeps http for dev/test
  assert.equal(mk({ host: '127.0.0.1:3000', 'x-forwarded-proto': 'http' }), 'http://127.0.0.1:3000');
  assert.equal(mk({ host: 'localhost:5173' }), 'http://localhost:5173');
});

// ── authorize page carries ALL params through the password POST ──
test('authorizePage renders hidden inputs for every OAuth param (incl response_type)', () => {
  const params = {
    response_type: 'code', client_id: 'CID', redirect_uri: 'https://claude.ai/cb',
    state: 'ST', code_challenge: 'CH', code_challenge_method: 'S256', resource: 'https://alhijaz.co/dev-mcp', scope: 'dev',
  };
  const html = authorizePage({ base: 'https://alhijaz.co', params });
  // Every param the POST handler re-validates must survive as a hidden field —
  // response_type was previously dropped → "Hanya response_type=code" after login.
  for (const [k, v] of Object.entries(params)) {
    assert.match(html, new RegExp(`name="${k}" value="${v.replace(/[/.]/g, '\\$&')}"`), `hidden field for ${k}`);
  }
  // reflected values are HTML-escaped (XSS guard)
  const xss = authorizePage({ base: 'https://alhijaz.co', params: { state: '"><script>' } });
  assert.doesNotMatch(xss, /"><script>/);
});

// ── Client registration (DCR) ──
test('makeClientId / parseClientId round-trip carries redirect_uris', () => {
  const cid = makeClientId(SECRET, { redirect_uris: ['https://claude.ai/cb'], client_name: 'Claude' });
  const parsed = parseClientId(SECRET, cid);
  assert.deepEqual(parsed.redirect_uris, ['https://claude.ai/cb']);
  assert.equal(parsed.client_name, 'Claude');
  // wrong secret rejected
  assert.throws(() => parseClientId('other-secret', cid));
});

// ── Tokens ──
test('issueAccessToken / verifyAccessToken round-trip + aud binding', () => {
  const at = issueAccessToken(SECRET, RESOURCE, '8h', { issuer: 'https://alhijaz.co', clientId: 'cid-1', scope: 'dev' });
  const p = verifyAccessToken(SECRET, at, RESOURCE, { issuer: 'https://alhijaz.co' });
  assert.equal(p.typ, 'at');
  assert.equal(p.sub, 'dev');
  assert.equal(p.iss, 'https://alhijaz.co');
  assert.equal(p.client_id, 'cid-1');
  assert.equal(p.scope, 'dev');
  assert.ok(p.jti);
  assert.equal(at.includes('.'), false);
  assert.equal(at.startsWith('mcp_at_'), true);
  assert.equal(decodeBearerToken(at).scope, 'dev');
  // wrong audience rejected
  assert.throws(() => verifyAccessToken(SECRET, at, 'https://evil.com/dev-mcp'));
  // trailing slash variant is accepted as the same protected resource.
  assert.equal(verifyAccessToken(SECRET, issueAccessToken(SECRET, `${RESOURCE}/`), RESOURCE).aud, `${RESOURCE}/`);
  // wrong secret rejected
  assert.throws(() => verifyAccessToken('other', at, RESOURCE));
});

test('access token can omit scope when OAuth client did not request one', () => {
  const at = issueAccessToken(SECRET, RESOURCE, '8h', { issuer: 'https://alhijaz.co', clientId: 'cid-1', scope: null });
  const p = verifyAccessToken(SECRET, at, RESOURCE, { issuer: 'https://alhijaz.co' });
  assert.equal(p.scope, undefined);
  assert.equal(p.client_id, 'cid-1');
});

test('expired access token is rejected', () => {
  const expired = issueAccessToken(SECRET, RESOURCE, '-1s');
  assert.throws(() => verifyAccessToken(SECRET, expired, RESOURCE), /jwt expired/);
});

test('refresh token has typ rt and is aud-bound', () => {
  const rt = issueRefreshToken(SECRET, RESOURCE, '30d', { issuer: 'https://alhijaz.co', clientId: 'cid-1', scope: 'dev' });
  assert.equal(rt.includes('.'), false);
  assert.equal(rt.startsWith('mcp_rt_'), true);
  const p = decodeBearerToken(rt, 'rt');
  assert.equal(p.typ, 'rt');
  assert.equal(p.iss, 'https://alhijaz.co');
  assert.equal(p.aud, RESOURCE);
  assert.equal(p.client_id, 'cid-1');
  assert.equal(p.scope, 'dev');
});

test('auth code carries pkce challenge + jti and expires', () => {
  const challenge = pkceChallengeFromVerifier('verifier-xyz-1234567890');
  const code = issueAuthCode(SECRET, { redirect_uri: 'https://claude.ai/cb', code_challenge: challenge, resource: RESOURCE, client_id: 'cid', scope: 'dev', scopeProvided: true });
  const p = jwt.verify(code, SECRET);
  assert.equal(p.typ, 'code');
  assert.equal(p.code_challenge, challenge);
  assert.equal(p.scope, 'dev');
  assert.equal(p.scope_provided, true);
  assert.ok(p.jti);
  assert.ok(p.exp - p.iat <= 60);
});

// ── deriveSecret separation ──
test('deriveSecret prefers explicit, else derives distinct-from-JWT secret', () => {
  assert.equal(deriveSecret({ devSecret: 'explicit' }), 'explicit');
  const derived = deriveSecret({ jwtSecret: 'dashboard-secret' });
  // derived secret must NOT equal the raw JWT secret (cross-token replay prevented)
  assert.notEqual(derived, 'dashboard-secret');
  // and is deterministic
  assert.equal(derived, deriveSecret({ jwtSecret: 'dashboard-secret' }));
});

// ── Read-only source guard (mirrors mcp-server.test.js philosophy) ──
test('dev-mcp.js performs no filesystem writes / git mutations', () => {
  const src = readFileSync(new URL('../dev-mcp.js', import.meta.url), 'utf8');
  for (const forbidden of ['writeFileSync', 'appendFileSync', 'unlinkSync', 'rmSync', 'execSync(']) {
    assert.ok(!src.includes(forbidden), `dev-mcp.js must not use ${forbidden}`);
  }
  // git usage must be read-only plumbing only
  for (const mutate of ["'commit'", "'add'", "'push'", "'checkout'", "'reset'", "'rm'"]) {
    assert.ok(!src.includes(`, ${mutate}`) && !src.includes(`[${mutate}`), `dev-mcp.js must not run git ${mutate}`);
  }
});

// ── HTTP: issuer /oauth/dev lewat klien OAuth resmi MCP SDK (logika Claude) ──
// Root domain dipakai OAuth agent /mcp sejak 9 Okt 2026; Dev-MCP harus tetap
// tersambung lewat path-insertion RFC 8414, dan token lama ber-iss root tetap sah.
test('Dev-MCP OAuth works end-to-end with the /oauth/dev path issuer; legacy root-issuer tokens still accepted', async () => {
  const env = { DEV_MCP_PASSWORD: 'pw-dev', JWT_SECRET: 'jwt-dev-test' };
  const app = express();
  initDevMcp(app, { log: () => {}, env });
  const http = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${http.address().port}`;
  try {
    const prm = await (await fetch(`${base}/.well-known/oauth-protected-resource/dev-mcp`)).json();
    assert.deepEqual(prm.authorization_servers, [`${base}/oauth/dev`]);
    assert.equal((await (await fetch(`${base}/.well-known/oauth-authorization-server/oauth/dev`)).json()).issuer, `${base}/oauth/dev`);
    // Root bukan lagi milik Dev-MCP.
    assert.equal((await fetch(`${base}/.well-known/oauth-authorization-server`)).status, 404);

    const provider = {
      get redirectUrl() { return 'http://127.0.0.1:65531/callback'; },
      get clientMetadata() { return { client_name: 'Dev Uji', redirect_uris: ['http://127.0.0.1:65531/callback'], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }; },
      clientInformation() { return this.client; },
      saveClientInformation(c) { this.client = c; },
      tokens() { return this._tokens; },
      saveTokens(t) { this._tokens = t; },
      redirectToAuthorization(url) { this.authUrl = url; },
      saveCodeVerifier(v) { this._v = v; },
      codeVerifier() { return this._v; },
    };
    const url = new URL(`${base}/dev-mcp`);
    const first = new StreamableHTTPClientTransport(url, { authProvider: provider });
    await assert.rejects(new Client({ name: 'dev', version: '1' }).connect(first), UnauthorizedError);
    const body = new URLSearchParams({ ...Object.fromEntries(provider.authUrl.searchParams), password: 'pw-dev' });
    const res = await fetch(`${base}/oauth/dev/authorize`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    const loc = new URL(res.headers.get('location'));
    assert.equal(loc.searchParams.get('iss'), `${base}/oauth/dev`);
    await first.finishAuth(loc.searchParams.get('code'));
    const client = new Client({ name: 'dev', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(url, { authProvider: provider }));
    assert.ok((await client.listTools()).tools.some((t) => t.name === 'project_overview'));
    await client.close();

    // Token yang diterbitkan sebelum pindah issuer (iss = root) masih diterima.
    const secret = deriveSecret({ jwtSecret: env.JWT_SECRET });
    const legacy = issueAccessToken(secret, `${base}/dev-mcp`, '1h', { issuer: base, scope: 'dev' });
    const legacyClient = new Client({ name: 'dev', version: '1' });
    await legacyClient.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${legacy}` } } }));
    await legacyClient.close();
  } finally {
    await new Promise((resolve) => http.close(resolve));
  }
});
