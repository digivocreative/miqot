import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import {
  initMcpOAuth,
  classifyRedirectUri,
  redirectUriRegistered,
  isCimdClientId,
  clientDisplayName,
  deriveMcpOAuthSecret,
  issueMcpAccessToken,
  verifyMcpToken,
  renderAuthorizePage,
} from '../mcp-oauth.js';
import { initMcpServer, generateMcpApiKey, hashMcpApiKey } from '../mcp-server.js';
import { issueAccessToken as issueDevAccessToken, pkceChallengeFromVerifier } from '../dev-mcp.js';

const rootPath = new URL('..', import.meta.url).pathname;
const read = (path) => readFileSync(join(rootPath, path), 'utf8');

// ── pure ─────────────────────────────────────────────────────────────────────

test('redirect_uri allowlist: exact vendor callbacks + loopback only', () => {
  assert.deepEqual(classifyRedirectUri('https://claude.ai/api/mcp/auth_callback'), { ok: true, host: 'claude.ai' });
  assert.deepEqual(classifyRedirectUri('https://chatgpt.com/connector_platform_oauth_redirect'), { ok: true, host: 'chatgpt.com' });
  assert.deepEqual(classifyRedirectUri('https://chatgpt.com/connector/oauth/cb_8f3A-x'), { ok: true, host: 'chatgpt.com' });
  assert.deepEqual(classifyRedirectUri('http://127.0.0.1:33418/callback'), { ok: true, host: 'localhost' });
  assert.deepEqual(classifyRedirectUri('http://localhost:6274/oauth/callback'), { ok: true, host: 'localhost' });
  assert.deepEqual(classifyRedirectUri('cursor://anysphere.cursor-mcp/oauth/callback'), { ok: true, host: 'cursor' });
  for (const bad of [
    'https://evil.example/cb',
    'https://claude.ai.evil.example/api/mcp/auth_callback',
    'https://anything.claude.com/any/path', // subdomain/path lain di domain vendor
    'https://claude.ai/api/mcp/auth_callback/extra',
    'https://claude.ai/api/mcp/auth_callback?next=https://evil.example',
    'https://vscode.dev/redirect', // redirector: tujuan dari state
    'https://chatgpt.com/connector/oauth/a/../../evil',
    'https://chatgpt.com/connector/oauth/x?y=1',
    'https://chatgpt.com/connector/oauth/',
    'vscode://attacker.ext/cb',
    'cursor://anysphere.cursor-mcp/oauth/other',
    'http://claude.ai/api/mcp/auth_callback', // bukan https
    'https://claude.ai/api/mcp/auth_callback#frag',
    'javascript:alert(1)',
    'not a url',
  ]) {
    assert.equal(classifyRedirectUri(bad).ok, false, bad);
  }
  // Tambahan lewat env (MCP_OAUTH_REDIRECT_URIS).
  assert.equal(classifyRedirectUri('https://chat.mistral.ai/oauth/cb', ['https://chat.mistral.ai/oauth/cb']).ok, true);
});

test('loopback redirect_uri matches regardless of port (RFC 8252); others must match exactly', () => {
  // Dokumen CIMD Claude Code mendaftarkan URI tanpa port lalu memakai port acak.
  assert.equal(redirectUriRegistered('http://localhost:53412/callback', ['http://localhost/callback']), true);
  assert.equal(redirectUriRegistered('http://127.0.0.1:9/callback', ['http://127.0.0.1/callback']), true);
  assert.equal(redirectUriRegistered('http://localhost:9/other', ['http://localhost/callback']), false);
  assert.equal(redirectUriRegistered('https://claude.ai/api/mcp/auth_callback/', ['https://claude.ai/api/mcp/auth_callback']), false);
});

test('CIMD client_id must be an https URL with a path on an allowlisted host', () => {
  assert.equal(isCimdClientId('https://claude.ai/oauth/mcp-oauth-client-metadata'), true);
  assert.equal(isCimdClientId('https://evil.example/client.json'), false);
  assert.equal(isCimdClientId('https://claude.ai/'), false);
  assert.equal(isCimdClientId('http://claude.ai/oauth/x'), false);
  assert.equal(isCimdClientId('eyJhbGciOi.jwt.client'), false);
  assert.equal(isCimdClientId('https://claude.ai:8443/oauth/x'), false);
  assert.equal(isCimdClientId('https://claude.ai/oauth/x?y=1'), false);
  assert.equal(isCimdClientId('https://www.cursor.com/oauth/x'), false);
});

test('display name comes from the trusted redirect host, not the self-declared client_name', () => {
  assert.equal(clientDisplayName('claude.ai', 'ChatGPT palsu'), 'Claude');
  assert.equal(clientDisplayName('chatgpt.com', null), 'ChatGPT');
  assert.equal(clientDisplayName('localhost', 'Claude Code (alhijaz)'), 'Claude Code (alhijaz)');
  assert.equal(clientDisplayName('localhost', ''), 'Aplikasi di komputermu');
});

test('OAuth tokens are bound to secret, issuer, audience and type', () => {
  const secret = deriveMcpOAuthSecret({ jwtSecret: 'x' });
  assert.notEqual(secret, deriveMcpOAuthSecret({ jwtSecret: 'y' }));
  const gid = '11111111-2222-3333-4444-555555555555';
  const opts = { issuer: 'https://alhijaz.co', resource: 'https://alhijaz.co/mcp' };
  const at = issueMcpAccessToken(secret, { ...opts, agentId: 'agent-1', grantId: gid });
  assert.match(at, /^alhijaz_at_[A-Za-z0-9_-]+$/);
  assert.equal(verifyMcpToken(secret, at, { kind: 'at', ...opts }).gid, gid);
  assert.throws(() => verifyMcpToken('lain', at, { kind: 'at', ...opts }));
  assert.throws(() => verifyMcpToken(secret, at, { kind: 'rt', ...opts }));
  assert.throws(() => verifyMcpToken(secret, at, { kind: 'at', ...opts, resource: 'https://alhijaz.co/dev-mcp' }));
  assert.throws(() => verifyMcpToken(secret, at, { kind: 'at', ...opts, issuer: 'https://alhijaz.co/oauth/dev' }));
});

test('authorize page escapes everything it echoes and never embeds the password', () => {
  const html = renderAuthorizePage({
    base: 'https://alhijaz.co',
    display: '<img src=x onerror=alert(1)>',
    redirectHost: 'claude.ai',
    params: { state: '"><script>x</script>', client_id: 'abc' },
    identifier: '<b>uji</b>',
  });
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<script>x<\/script>/);
  assert.doesNotMatch(html, /<b>uji<\/b>/);
  assert.match(html, /name="password" type="password"/);
  assert.doesNotMatch(html, /name="password"[^>]*value=/);
  // iOS Safari zoom: input wajib >= 16px.
  assert.match(html, /font-size:16px/);
});

test('mcp-oauth.js only ever writes to mcp_oauth_grants', () => {
  const src = read('mcp-oauth.js');
  const froms = [...src.matchAll(/\.from\('([a-z_]+)'\)\s*\.(\w+)\(/g)].map(([, table, op]) => [table, op]);
  assert.ok(froms.length >= 5);
  for (const [table, op] of froms) {
    if (table !== 'mcp_oauth_grants') assert.equal(op, 'select', `${table} hanya boleh dibaca`);
  }
  // Hapus Supabase = `.delete()` tanpa argumen; Map.delete(key) boleh.
  assert.doesNotMatch(src, /\.(upsert|rpc)\(|\.delete\(\)/);
  // MASTER_PASSWORD tidak boleh membuka OAuth (komentar boleh menyebutnya).
  assert.doesNotMatch(src, /env\.MASTER_PASSWORD/);
  const server = read('server.js');
  const verifier = server.slice(server.indexOf('async function verifyAgentLoginForMcp'), server.indexOf('const mcpOAuth = initMcpOAuth'));
  assert.ok(verifier.includes('bcrypt.compare'));
  assert.doesNotMatch(verifier, /env\.MASTER_PASSWORD/);
});

// ── HTTP: alur lengkap lewat klien OAuth resmi MCP SDK ──────────────────────

const AGENT = { id: 'aaaaaaaa-0000-4000-8000-000000000001', slug: 'uji', name: 'Agent Uji', status: 'active', role: 'agent' };

// Supabase in-memory: cukup untuk grant store + lookup agent + tool MCP.
function fakeSupabase(agents) {
  const tables = { agents: agents.map((a) => ({ ...a })), mcp_oauth_grants: [] };
  return {
    tables,
    from(table) {
      tables[table] ||= [];
      let op = 'select';
      let payload = null;
      const filters = [];
      const rows = () => tables[table].filter((r) => filters.every((f) => f(r)));
      const q = {
        select: () => q,
        insert: (row) => { op = 'insert'; payload = row; return q; },
        update: (patch) => { op = 'update'; payload = patch; return q; },
        eq: (c, v) => { filters.push((r) => r[c] === v); return q; },
        is: (c, v) => { filters.push((r) => (r[c] ?? null) === v); return q; },
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then(resolve, reject) {
          let result;
          if (op === 'insert') {
            tables[table].push({ created_at: new Date().toISOString(), last_used_at: null, revoked_at: null, ...payload });
            result = { error: null };
          } else if (op === 'update') {
            const hit = rows();
            hit.forEach((r) => Object.assign(r, payload));
            result = { data: hit, error: null };
          } else {
            result = { data: rows(), error: null, count: rows().length };
          }
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      for (const m of ['neq', 'gt', 'gte', 'lt', 'lte', 'not', 'or', 'ilike', 'in', 'order', 'range', 'limit']) q[m] = () => q;
      return q;
    },
  };
}

// Dokumen CIMD tiruan (produksi: fetch https, host daftar putih).
const CIMD_DOCS = {
  'https://claude.ai/oauth/mcp-oauth-client-metadata': {
    client_id: 'https://claude.ai/oauth/mcp-oauth-client-metadata', client_name: 'Claude',
    redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], token_endpoint_auth_method: 'none',
  },
  'https://claude.ai/oauth/claude-code-client-metadata': {
    client_id: 'https://claude.ai/oauth/claude-code-client-metadata', client_name: 'Claude Code',
    redirect_uris: ['http://localhost/callback', 'http://127.0.0.1/callback'], token_endpoint_auth_method: 'none',
  },
  'https://claude.ai/oauth/spoofed': { client_id: 'https://claude.ai/oauth/lain', redirect_uris: ['https://claude.ai/x'] },
};

async function startServer({ agents = [AGENT], env = {} } = {}) {
  const supabase = fakeSupabase(agents);
  const cimdFetches = [];
  const app = express();
  app.use('/mcp', express.json());
  app.use(express.json());
  const oauth = initMcpOAuth(app, {
    supabase,
    log: () => {},
    env: { JWT_SECRET: 'test-jwt-secret', ...env },
    fetchClientMetadata: async (url) => {
      cimdFetches.push(url);
      if (!CIMD_DOCS[url]) throw new Error('HTTP 404');
      return CIMD_DOCS[url];
    },
    verifyAgentCredentials: async ({ identifier, password }) => {
      const agent = supabase.tables.agents.find((a) => a.slug === identifier);
      return agent && password === 'rahasia' ? { ...agent } : null;
    },
  });
  initMcpServer(app, { supabase, log: () => {}, oauth });
  const http = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${http.address().port}`;
  return { base, supabase, oauth, cimdFetches, close: () => new Promise((resolve) => http.close(resolve)) };
}

class TestProvider {
  constructor(redirectUrl = 'http://127.0.0.1:65530/callback', authMethod = 'none') {
    this._redirectUrl = redirectUrl;
    this._authMethod = authMethod;
    this.authUrl = null;
  }
  get redirectUrl() { return this._redirectUrl; }
  get clientMetadata() {
    return {
      client_name: 'Klien Uji',
      redirect_uris: [this._redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: this._authMethod,
    };
  }
  clientInformation() { return this.client; }
  saveClientInformation(info) { this.client = info; }
  tokens() { return this._tokens; }
  saveTokens(tokens) { this._tokens = tokens; }
  redirectToAuthorization(url) { this.authUrl = url; }
  saveCodeVerifier(verifier) { this._verifier = verifier; }
  codeVerifier() { return this._verifier; }
}

// Simulasi browser agent: buka halaman login lalu kirim form.
async function submitLogin(base, authUrl, { identifier = 'uji', password = 'rahasia', action = 'allow' } = {}) {
  const page = await fetch(authUrl);
  const html = await page.text();
  const body = new URLSearchParams({ ...Object.fromEntries(new URL(authUrl).searchParams), identifier, password, action });
  const res = await fetch(`${base}/oauth/mcp/authorize`, {
    method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body,
  });
  return { page, html, res, location: res.headers.get('location') ? new URL(res.headers.get('location')) : null };
}

// POST form login dengan IP sumber tertentu (X-Real-IP, seperti di belakang Caddy).
async function submitLoginFrom(base, authUrl, ip, { identifier = 'uji', password = 'rahasia' } = {}) {
  const body = new URLSearchParams({ ...Object.fromEntries(new URL(authUrl).searchParams), identifier, password, action: 'allow' });
  return fetch(`${base}/oauth/mcp/authorize`, {
    method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-real-ip': ip }, body,
  });
}

async function connectWithOAuth(base, provider = new TestProvider()) {
  const url = new URL(`${base}/mcp`);
  const first = new StreamableHTTPClientTransport(url, { authProvider: provider });
  await assert.rejects(new Client({ name: 'uji', version: '1' }).connect(first), UnauthorizedError);
  assert.ok(provider.authUrl, 'SDK harus diarahkan ke halaman login');
  const login = await submitLogin(base, provider.authUrl);
  assert.equal(login.res.status, 302);
  await first.finishAuth(login.location.searchParams.get('code'));
  const client = new Client({ name: 'uji', version: '1' });
  await client.connect(new StreamableHTTPClientTransport(url, { authProvider: provider }));
  return { client, provider, login };
}

test('official MCP SDK client: discovery → DCR → agent login → token → tools/list', async () => {
  const srv = await startServer();
  try {
    const { client, provider, login } = await connectWithOAuth(srv.base);
    assert.equal(login.page.status, 200);
    assert.match(login.html, /Sambungkan Klien Uji ke akun Alhijaz/);
    assert.equal(login.page.headers.get('x-frame-options'), 'DENY');
    assert.equal(provider.authUrl.origin + provider.authUrl.pathname, `${srv.base}/oauth/mcp/authorize`);
    assert.equal(provider.authUrl.searchParams.get('resource'), `${srv.base}/mcp`);
    assert.equal(login.location.searchParams.get('iss'), srv.base);
    assert.match(provider.tokens().access_token, /^alhijaz_at_/);
    assert.match(provider.tokens().refresh_token, /^alhijaz_rt_/);

    const { tools } = await client.listTools();
    assert.equal(tools.length, 8);
    const out = await client.callTool({ name: 'list_jamaah', arguments: {} });
    assert.ok(!out.isError, out.content?.[0]?.text);

    const grants = srv.supabase.tables.mcp_oauth_grants;
    assert.equal(grants.length, 1);
    assert.equal(grants[0].agent_id, AGENT.id);
    assert.equal(grants[0].client_name, 'Klien Uji');
    assert.equal(grants[0].redirect_host, 'localhost');
    assert.ok(grants[0].last_used_at, 'pemakaian distempel');
    await client.close();
  } finally {
    await srv.close();
  }
});

test('discovery: /mcp (and root PRM) point at the ROOT issuer whose endpoints live under /oauth/mcp', async () => {
  const srv = await startServer();
  try {
    const unauth = await fetch(`${srv.base}/mcp`, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: '{}',
    });
    assert.equal(unauth.status, 401);
    assert.match(unauth.headers.get('www-authenticate'), new RegExp(`resource_metadata="${srv.base}/.well-known/oauth-protected-resource/mcp"`));
    assert.equal(unauth.headers.get('access-control-expose-headers'), 'WWW-Authenticate, Mcp-Session-Id');

    for (const path of ['/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-protected-resource']) {
      const prm = await (await fetch(`${srv.base}${path}`)).json();
      assert.equal(prm.resource, `${srv.base}/mcp`, path);
      assert.deepEqual(prm.authorization_servers, [srv.base], path);
    }
    for (const path of ['/.well-known/oauth-authorization-server', '/.well-known/openid-configuration']) {
      const res = await fetch(`${srv.base}${path}`);
      assert.equal(res.status, 200, path);
      const meta = await res.json();
      assert.equal(meta.issuer, srv.base, path);
      assert.equal(meta.token_endpoint, `${srv.base}/oauth/mcp/token`);
      assert.deepEqual(meta.code_challenge_methods_supported, ['S256']);
      assert.equal(meta.client_id_metadata_document_supported, true);
    }
    // Issuer /mcp bukan authorization server — jangan jatuh ke SPA / Dev-MCP.
    assert.equal((await fetch(`${srv.base}/.well-known/oauth-authorization-server/mcp`)).status, 404);
  } finally {
    await srv.close();
  }
});

test('DCR refuses redirect_uris outside the allowlist (anti-phishing)', async () => {
  const srv = await startServer();
  try {
    const register = (redirect_uris) => fetch(`${srv.base}/oauth/mcp/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ redirect_uris, client_name: 'x' }),
    });
    assert.equal((await register(['https://evil.example/cb'])).status, 400);
    assert.equal((await register(['https://claude.ai/api/mcp/auth_callback', 'https://evil.example/cb'])).status, 400);
    assert.equal((await register(['https://vscode.dev/redirect'])).status, 400);
    assert.equal((await register(['vscode://attacker.ext/cb'])).status, 400);
    const ok = await register(['https://claude.ai/api/mcp/auth_callback']);
    assert.equal(ok.status, 201);
    assert.equal((await ok.json()).token_endpoint_auth_method, 'none');
  } finally {
    await srv.close();
  }
});

async function registerAndAuthorizeUrl(base, { redirect = 'http://127.0.0.1:65530/callback', verifier = 'v'.repeat(50), authMethod = 'none' } = {}) {
  const reg = await (await fetch(`${base}/oauth/mcp/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ redirect_uris: [redirect], client_name: 'Manual', token_endpoint_auth_method: authMethod }),
  })).json();
  const url = new URL(`${base}/oauth/mcp/authorize`);
  url.search = new URLSearchParams({
    response_type: 'code', client_id: reg.client_id, redirect_uri: redirect, state: 'st4te',
    code_challenge: pkceChallengeFromVerifier(verifier), code_challenge_method: 'S256', resource: `${base}/mcp`,
  }).toString();
  return { reg, url, verifier, redirect };
}

const exchange = (base, fields, headers = {}) => fetch(`${base}/oauth/mcp/token`, {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams(fields),
});

test('login page: wrong password stays on page, deny returns access_denied, inactive agent refused', async () => {
  const srv = await startServer({ agents: [AGENT, { ...AGENT, id: 'aaaaaaaa-0000-4000-8000-000000000002', slug: 'pending', status: 'pending' }] });
  try {
    const { url } = await registerAndAuthorizeUrl(srv.base);
    const wrong = await submitLogin(srv.base, url, { password: 'salah' });
    assert.equal(wrong.res.status, 401);
    assert.match(await wrong.res.text(), /password salah/);

    const deny = await submitLogin(srv.base, url, { action: 'deny' });
    assert.equal(deny.res.status, 302);
    assert.equal(deny.location.searchParams.get('error'), 'access_denied');
    assert.equal(deny.location.searchParams.get('state'), 'st4te');

    const inactive = await submitLogin(srv.base, url, { identifier: 'pending' });
    assert.equal(inactive.res.status, 403);
    assert.equal(srv.supabase.tables.mcp_oauth_grants.length, 0);
  } finally {
    await srv.close();
  }
});

test('login brute force: per-IP cap, and an attacker cannot lock a real agent out', async () => {
  const srv = await startServer();
  try {
    const { url } = await registerAndAuthorizeUrl(srv.base);
    const fromIp = (ip, opts) => submitLoginFrom(srv.base, url, ip, opts);
    // 9 password salah dari IP penyerang → korban dari IP lain tetap bisa masuk.
    for (let i = 0; i < 9; i++) assert.equal((await fromIp('6.6.6.6', { password: `salah${i}` })).status, 401);
    assert.equal((await fromIp('1.2.3.4')).status, 302);
    // Percobaan ke-11 dari IP yang sama kena batas per IP (10/10 menit).
    await fromIp('6.6.6.6', { password: 'salah9' });
    assert.equal((await fromIp('6.6.6.6')).status, 429);
    // Tebakan tersebar dari banyak IP tetap mentok di batas per akun (30/jam).
    for (let i = 0; i < 30; i++) await fromIp(`10.0.${i}.1`, { password: `x${i}` });
    assert.equal((await fromIp('10.9.9.9')).status, 429);
  } finally {
    await srv.close();
  }
});

test('token endpoint: PKCE mismatch and code reuse are rejected', async () => {
  const srv = await startServer();
  try {
    const { url, reg, verifier, redirect } = await registerAndAuthorizeUrl(srv.base);
    const code = (await submitLogin(srv.base, url)).location.searchParams.get('code');
    const bad = await exchange(srv.base, { grant_type: 'authorization_code', code, code_verifier: 'x'.repeat(50), client_id: reg.client_id, redirect_uri: redirect });
    assert.equal((await bad.json()).error, 'invalid_grant');
    const good = await exchange(srv.base, { grant_type: 'authorization_code', code, code_verifier: verifier, client_id: reg.client_id, redirect_uri: redirect });
    assert.equal(good.status, 200);
    const reuse = await exchange(srv.base, { grant_type: 'authorization_code', code, code_verifier: verifier, client_id: reg.client_id });
    assert.equal((await reuse.json()).error, 'invalid_grant');
  } finally {
    await srv.close();
  }
});

test('confidential clients (client_secret_post/basic) must authenticate at the token endpoint', async () => {
  const srv = await startServer();
  try {
    const { url, reg, verifier } = await registerAndAuthorizeUrl(srv.base, { authMethod: 'client_secret_post' });
    assert.ok(reg.client_secret);
    const code = (await submitLogin(srv.base, url)).location.searchParams.get('code');
    const noSecret = await exchange(srv.base, { grant_type: 'authorization_code', code, code_verifier: verifier, client_id: reg.client_id });
    assert.equal((await noSecret.json()).error, 'invalid_client');
    const code2 = (await submitLogin(srv.base, url)).location.searchParams.get('code');
    const basic = Buffer.from(`${encodeURIComponent(reg.client_id)}:${encodeURIComponent(reg.client_secret)}`).toString('base64');
    const ok = await exchange(srv.base, { grant_type: 'authorization_code', code: code2, code_verifier: verifier }, { authorization: `Basic ${basic}` });
    assert.equal(ok.status, 200);
  } finally {
    await srv.close();
  }
});

test('refresh rotates tokens; revoking the grant kills both access and refresh tokens', async () => {
  const srv = await startServer();
  try {
    const { client, provider } = await connectWithOAuth(srv.base);
    await client.close();
    const { refresh_token } = provider.tokens();
    const refreshed = await exchange(srv.base, { grant_type: 'refresh_token', refresh_token, client_id: provider.client.client_id });
    assert.equal(refreshed.status, 200);
    const fresh = await refreshed.json();
    assert.notEqual(fresh.access_token, provider.tokens().access_token);

    const callMcp = (token) => fetch(`${srv.base}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    assert.equal((await callMcp(fresh.access_token)).status, 200);

    // Putus dari dashboard = revokeGrant + invalidasi cache.
    const [grant] = srv.supabase.tables.mcp_oauth_grants;
    await srv.oauth.revokeGrant(grant.id);
    const after = await callMcp(fresh.access_token);
    assert.equal(after.status, 401);
    assert.match(after.headers.get('www-authenticate'), /error="invalid_token"/);
    const deadRefresh = await exchange(srv.base, { grant_type: 'refresh_token', refresh_token: fresh.refresh_token });
    assert.equal((await deadRefresh.json()).error, 'invalid_grant');
  } finally {
    await srv.close();
  }
});

test('reconnecting the same hosted app replaces the old grant instead of piling up', async () => {
  const srv = await startServer();
  try {
    for (let i = 0; i < 2; i++) {
      const { url, reg, verifier, redirect } = await registerAndAuthorizeUrl(srv.base, { redirect: 'https://claude.ai/api/mcp/auth_callback' });
      const code = (await submitLogin(srv.base, url)).location.searchParams.get('code');
      assert.equal((await exchange(srv.base, { grant_type: 'authorization_code', code, code_verifier: verifier, client_id: reg.client_id, redirect_uri: redirect })).status, 200);
    }
    const grants = srv.supabase.tables.mcp_oauth_grants;
    assert.equal(grants.length, 2);
    assert.equal(grants.filter((g) => !g.revoked_at).length, 1);
    assert.equal(grants[1].client_name, 'Claude');
  } finally {
    await srv.close();
  }
});

test('foreign tokens are refused: Dev-MCP access token and forged alhijaz_at_ token', async () => {
  const srv = await startServer();
  try {
    const call = (token) => fetch(`${srv.base}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    const dev = issueDevAccessToken('test-jwt-secret', `${srv.base}/dev-mcp`);
    assert.equal((await call(dev)).status, 401);
    const forged = issueMcpAccessToken('kunci-penyerang', {
      issuer: `${srv.base}/oauth/mcp`, resource: `${srv.base}/mcp`, agentId: AGENT.id, grantId: '11111111-2222-3333-4444-555555555555',
    });
    assert.equal((await call(forged)).status, 401);
  } finally {
    await srv.close();
  }
});

test('static alhijaz_mcp_ keys keep working next to OAuth', async () => {
  const key = generateMcpApiKey();
  const srv = await startServer({ agents: [{ ...AGENT, mcp_api_key: hashMcpApiKey(key) }] });
  try {
    const client = new Client({ name: 'uji', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${srv.base}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${key}` } },
    }));
    assert.equal((await client.listTools()).tools.length, 8);
    await client.close();
  } finally {
    await srv.close();
  }
});

test('CIMD: Claude published identity (no DCR) connects; spoofed or foreign documents are refused', async () => {
  const srv = await startServer();
  try {
    const verifier = 'c'.repeat(50);
    const authorizeUrl = (clientId, redirect) => {
      const url = new URL(`${srv.base}/oauth/mcp/authorize`);
      url.search = new URLSearchParams({
        response_type: 'code', client_id: clientId, redirect_uri: redirect, state: 's',
        code_challenge: pkceChallengeFromVerifier(verifier), code_challenge_method: 'S256', resource: `${srv.base}/mcp`,
      }).toString();
      return url;
    };
    const claude = 'https://claude.ai/oauth/mcp-oauth-client-metadata';
    const login = await submitLogin(srv.base, authorizeUrl(claude, 'https://claude.ai/api/mcp/auth_callback'));
    assert.match(login.html, /Sambungkan Claude ke akun Alhijaz/);
    assert.equal(login.res.status, 302);
    assert.equal(login.location.origin, 'https://claude.ai');
    const tokens = await exchange(srv.base, {
      grant_type: 'authorization_code', code: login.location.searchParams.get('code'), code_verifier: verifier,
      client_id: claude, redirect_uri: 'https://claude.ai/api/mcp/auth_callback', resource: `${srv.base}/mcp`,
    });
    assert.equal(tokens.status, 200);

    // Claude Code: loopback dengan port acak cocok dengan URI tanpa port.
    const cc = await fetch(authorizeUrl('https://claude.ai/oauth/claude-code-client-metadata', 'http://localhost:51234/callback'));
    assert.equal(cc.status, 200);

    // Dokumen yang client_id-nya tidak sama dengan URL-nya ditolak.
    assert.equal((await fetch(authorizeUrl('https://claude.ai/oauth/spoofed', 'https://claude.ai/x'))).status, 400);
    // Host di luar daftar putih tidak pernah di-fetch (anti-SSRF).
    const before = srv.cimdFetches.length;
    assert.equal((await fetch(authorizeUrl('https://evil.example/meta.json', 'https://claude.ai/api/mcp/auth_callback'))).status, 400);
    assert.equal(srv.cimdFetches.length, before);
    // redirect_uri yang tidak ada di dokumen ditolak.
    assert.equal((await fetch(authorizeUrl(claude, 'https://claude.ai/api/lain'))).status, 400);
  } finally {
    await srv.close();
  }
});

const callMcpWith = (base, token) => fetch(`${base}/mcp`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${token}` },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
});

test('refresh tokens are single-use: parallel race tolerated, later replay revokes the whole connection', async () => {
  const srv = await startServer();
  try {
    const { client, provider } = await connectWithOAuth(srv.base);
    await client.close();
    const rt1 = provider.tokens().refresh_token;
    const first = await (await exchange(srv.base, { grant_type: 'refresh_token', refresh_token: rt1 })).json();
    assert.ok(first.refresh_token && first.refresh_token !== rt1);

    // Balapan (rt1 lagi < 30 dtk sesudah rotasi): ditolak, sambungan TETAP hidup.
    const race = await exchange(srv.base, { grant_type: 'refresh_token', refresh_token: rt1 });
    assert.equal((await race.json()).error, 'invalid_grant');
    assert.equal((await callMcpWith(srv.base, first.access_token)).status, 200);

    // rt1 dipakai lagi jauh sesudahnya = token bocor → grant dicabut.
    const [grant] = srv.supabase.tables.mcp_oauth_grants;
    grant.refreshed_at = new Date(Date.now() - 5 * 60_000).toISOString();
    const replay = await exchange(srv.base, { grant_type: 'refresh_token', refresh_token: rt1 });
    assert.equal((await replay.json()).error, 'invalid_grant');
    assert.ok(grant.revoked_at, 'pemakaian ulang mencabut sambungan');
    assert.equal((await callMcpWith(srv.base, first.access_token)).status, 401);
    // Refresh token terbaru pun ikut mati.
    assert.equal((await (await exchange(srv.base, { grant_type: 'refresh_token', refresh_token: first.refresh_token })).json()).error, 'invalid_grant');
  } finally {
    await srv.close();
  }
});

test('token endpoint: malformed Basic header → 401 invalid_client (not 500); short code_verifier rejected', async () => {
  const srv = await startServer();
  try {
    const bad = await exchange(srv.base, { grant_type: 'refresh_token', refresh_token: 'x' }, { authorization: `Basic ${Buffer.from('%E0%A4%A:%zz').toString('base64')}` });
    // refresh_token tak valid dicek dulu → tetap 4xx, tidak pernah 500.
    assert.ok(bad.status >= 400 && bad.status < 500, String(bad.status));
    const { url, reg, redirect } = await registerAndAuthorizeUrl(srv.base, { verifier: 'v'.repeat(50) });
    const code = (await submitLogin(srv.base, url)).location.searchParams.get('code');
    const malformed = await exchange(srv.base, { grant_type: 'authorization_code', code, code_verifier: 'v'.repeat(50), redirect_uri: redirect },
      { authorization: `Basic ${Buffer.from(`${reg.client_id}:%zz`).toString('base64')}` });
    assert.equal(malformed.status, 401);
    assert.equal((await malformed.json()).error, 'invalid_client');
    assert.match(malformed.headers.get('www-authenticate'), /^Basic/);
    const code2 = (await submitLogin(srv.base, url)).location.searchParams.get('code');
    const short = await exchange(srv.base, { grant_type: 'authorization_code', code: code2, code_verifier: 'pendek', client_id: reg.client_id });
    assert.equal((await short.json()).error, 'invalid_grant');
  } finally {
    await srv.close();
  }
});

test('password change revokes every OAuth connection of that agent', async () => {
  const srv = await startServer();
  try {
    const { client, provider } = await connectWithOAuth(srv.base);
    await client.close();
    await srv.oauth.revokeAllForAgent(AGENT.id);
    assert.equal((await callMcpWith(srv.base, provider.tokens().access_token)).status, 401);
  } finally {
    await srv.close();
  }
  // Semua jalur ganti password di server.js memanggilnya.
  const server = read('server.js');
  const handler = (marker) => server.slice(server.indexOf(marker), server.indexOf('\n});', server.indexOf(marker)));
  assert.match(handler("app.post('/api/auth/reset-password'"), /revokeMcpOAuthOnPasswordChange\(decoded\.id\)/);
  assert.match(handler("app.put('/api/admin/agents/:slug'"), /if \(updates\.password\) revokeMcpOAuthOnPasswordChange\(targetAgent\.id\)/);
  assert.equal((server.match(/if \(updates\.password\) revokeMcpOAuthOnPasswordChange\(req\.user\.id\)/g) || []).length, 2, 'profil: cabang ganti-slug & biasa');
});
