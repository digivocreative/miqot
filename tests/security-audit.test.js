import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import vm from 'node:vm';
import { requireJwtSecret, currentAgentSession, passwordResetVersion, matchesPasswordResetVersion } from '../lib/auth-security.js';
import { createCredentialCipher } from '../lib/credential-cipher.js';
import { createRateLimiter } from '../lib/request-rate-limit.js';
import { clientIp } from '../lib/client-ip.js';
import { createDeployWebhookHandler, verifyDeploySignature } from '../lib/deploy-webhook.js';
import { readResponseBuffer } from '../lib/bounded-response.js';
import { browserCapiEventKey, BROWSER_CAPI_EVENTS } from '../lib/capi-browser-events.js';

const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

function response() {
  return { statusCode: 200, headers: {}, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; }, set(k, v) { this.headers[k] = v; return this; }, cookie() {}, redirect(n, location) { this.statusCode = n; this.headers.Location = location; } };
}

// Execute the real route body with mocked integrations. Never boot the app,
// load .env, or send a transaction to Supabase/AWAPI/Telegram.
function route(method, path, context) {
  const anchor = `app.${method}('${path}'`;
  const start = source.indexOf(anchor);
  assert.ok(start >= 0, anchor);
  const end = source.indexOf('\n});', start) + 4;
  let handler;
  const app = { [method]: (...args) => { handler = args.at(-1); } };
  vm.runInNewContext(source.slice(start, end), { app, authMiddleware() {}, authIpLimiter() {}, capiIpLimiter() {}, process: { env: { AWAPI_SYNC_ENABLED: 'true' } }, console, ...context });
  return handler;
}

test('JWT configuration fails closed instead of signing with a public default', () => {
  for (const JWT_SECRET of [undefined, '', 'short', 'fallback-secret-change-me']) assert.throws(() => requireJwtSecret({ JWT_SECRET }));
  const JWT_SECRET = randomBytes(48).toString('base64');
  assert.equal(requireJwtSecret({ JWT_SECRET }), JWT_SECRET);
});

test('version endpoint recognizes Rollup hashes containing underscores and hyphens', () => {
  for (const name of ['index-abc123.js', 'index-a_B-c9.js']) {
    const handler = route('get', '/api/version', { getIndexHtml: () => `<script src="/assets/${name}"></script>` });
    const res = response();
    handler({}, res);
    assert.equal(res.body.entry, name);
  }
});

test('session privileges follow the current account; deleted and disabled accounts are rejected', () => {
  const token = { id: 'a', slug: 'old', role: 'admin', isMaster: false };
  assert.equal(currentAgentSession(token, null), null);
  assert.equal(currentAgentSession(token, { id: 'a', status: 'rejected' }), null);
  const session = currentAgentSession(token, { id: 'a', slug: 'new', name: 'Agent', role: 'agent', status: 'active' });
  assert.equal(session.role, 'agent');
  assert.equal(session.slug, 'new');
  assert.equal(session.isMaster, false);
  assert.equal(currentAgentSession(token, { id: 'a', role: null }).role, 'agent');
});

test('auth middleware rejects a signed session whose agent no longer exists', async () => {
  const start = source.indexOf('async function authMiddleware(');
  const end = source.indexOf('\nfunction adminOnly(', start);
  const ctx = { verifyAgentSessionToken: () => ({ id: 'deleted', role: 'admin' }), getAgentById: async () => null, currentAgentSession, agentCacheById: {}, agentCacheFailUntil: 0 };
  vm.createContext(ctx);
  vm.runInContext(source.slice(start, end), ctx);
  const res = response();
  await ctx.authMiddleware({ headers: { authorization: 'Bearer signed' } }, res, () => assert.fail('deleted user was authorized'));
  assert.equal(res.statusCode, 401);
});

test('a cold agent cache during DB failure returns 503 instead of logging out valid users', async () => {
  const start = source.indexOf('async function authMiddleware(');
  const end = source.indexOf('\nfunction adminOnly(', start);
  const ctx = {
    verifyAgentSessionToken: () => ({ id: 'a', role: 'agent' }), getAgentById: async () => null,
    currentAgentSession, agentCacheById: null, agentCacheFailUntil: Date.now() + 60000,
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(start, end), ctx);
  const res = response();
  await ctx.authMiddleware({ headers: { authorization: 'Bearer signed' } }, res, () => assert.fail('unverified user must not reach the route'));
  assert.equal(res.statusCode, 503);
  assert.equal(res.headers['Retry-After'], '15');
});

test('password reset versions cannot be reused after a password change or for another agent', () => {
  const secret = 'x'.repeat(48);
  const agent = { id: 'a', password: 'old-hash' };
  const version = passwordResetVersion(agent, secret);
  assert.equal(matchesPasswordResetVersion(version, agent, secret), true);
  assert.equal(matchesPasswordResetVersion(version, { ...agent, password: 'new-hash' }, secret), false);
  assert.equal(matchesPasswordResetVersion(version, { ...agent, id: 'b' }, secret), false);
  for (const invalid of [undefined, null, 'x', [], '0'.repeat(65)]) assert.equal(matchesPasswordResetVersion(invalid, agent, secret), false);
});

test('credential encryption authenticates ciphertext and never falls back to plaintext writes', () => {
  const key = randomBytes(32).toString('base64');
  const cipher = createCredentialCipher(key);
  const value = 'secret:password';
  const encrypted = cipher.encrypt(value);
  assert.equal(cipher.decrypt(encrypted), value);
  assert.notEqual(cipher.encrypt(value), encrypted);
  assert.equal(cipher.decrypt(encrypted.slice(0, -2) + (encrypted.endsWith('00') ? '01' : '00')), '');
  assert.equal(createCredentialCipher(randomBytes(32).toString('base64')).decrypt(encrypted), '');
  assert.equal(createCredentialCipher('').decrypt(encrypted), '');
  assert.throws(() => createCredentialCipher('').encrypt(value));
  assert.throws(() => createCredentialCipher(randomBytes(16).toString('base64')));
  assert.equal(cipher.decrypt('legacy:plaintext'), 'legacy:plaintext');
});

test('upstream body limits check both declared and streamed sizes', async () => {
  assert.equal((await readResponseBuffer(new Response('12345'), 5)).toString(), '12345');
  await assert.rejects(readResponseBuffer(new Response('123456'), 5), /size limit/);
  await assert.rejects(readResponseBuffer(new Response('x', { headers: { 'content-length': '9999999' } }), 5), /size limit/);
  assert.equal((await readResponseBuffer(new Response(null), 5)).length, 0);
});

test('direct clients cannot spoof proxy IP headers to bypass limits', () => {
  const request = (peer, headers) => ({ socket: { remoteAddress: peer }, headers });
  assert.equal(clientIp(request('203.0.113.9', { 'x-real-ip': '8.8.8.8' })), '203.0.113.9');
  assert.equal(clientIp(request('127.0.0.1', { 'x-real-ip': '8.8.8.8' })), '8.8.8.8');
  assert.equal(clientIp(request('::1', { 'x-real-ip': 'not-an-ip' })), '::1');
  assert.equal(clientIp(request('127.0.0.1', { 'x-forwarded-for': '8.8.8.8' })), '127.0.0.1');
});

test('custom-domain canonical redirects cannot become a protocol-relative external URL', () => {
  const start = source.indexOf('app.use(', source.indexOf('// 2) Pada custom domain:'));
  const end = source.indexOf('\n});', start) + 4;
  let canonicalize;
  vm.runInNewContext(source.slice(start, end), { app: { use(fn) { canonicalize = fn; } } });
  for (const [path, expected] of [['/agent//evil.example', '/evil.example'], ['/agent/umroh', '/umroh'], ['/agent', '/']]) {
    const res = response();
    canonicalize({ customDomain: 'agent.example', customDomainAgent: { slug: 'agent' }, path, url: path }, res, () => assert.fail('expected canonical redirect'));
    assert.equal(res.statusCode, 301);
    assert.equal(res.headers.Location, expected);
  }
});

test('limiter handles bursts, bounds key memory, and recovers at expiry', async () => {
  let time = 0;
  const limiter = createRateLimiter({ max: 10, windowMs: 1000, maxKeys: 20, now: () => time });
  const results = await Promise.all(Array.from({ length: 1000 }, async () => limiter.consume('ip')));
  assert.equal(results.filter(r => r.ok).length, 10);
  assert.equal(limiter.consume('ip').retryAfter, 1);
  for (let n = 0; n < 10000; n++) limiter.consume(`ip-${n}`);
  assert.equal(limiter.size, 20);
  time = 1000;
  assert.equal(limiter.consume('new').ok, true);
  assert.equal(limiter.size, 1);
});

test('single-jamaah refresh rejects foreign IDs before calling AWAPI', async () => {
  let calls = 0;
  const handler = route('get', '/api/laporan/jamaah/:idJamaah/refresh', {
    getAgentById: async () => ({ awapi_key: 'own-key', awapi_code: 'OWN' }),
    agentOwnsUmrohJamaah: async (owner, id) => { assert.equal(owner, 'a'); assert.equal(id, 'JM-foreign'); return false; },
    awapiFetchJamaahById: async () => { calls++; throw new Error('must not reach AWAPI'); },
  });
  const res = response();
  await handler({ user: { id: 'a', slug: 'a' }, params: { idJamaah: 'JM-foreign' } }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(calls, 0);
});

test('booking refresh is owner-scoped and fails closed on lookup errors', async () => {
  for (const error of [null, { message: 'DB unavailable' }]) {
    const filters = [];
    const query = { select() { return this; }, eq(k, v) { filters.push([k, v]); return this; }, limit() { return this; }, maybeSingle: async () => ({ data: null, error }) };
    const handler = route('get', '/api/laporan/umrah/:idUmrah/refresh', {
      getAgentById: async () => ({ awapi_key: 'own-key', awapi_code: 'OWN' }),
      supabase: { from: () => query },
      awapiFetchUmrahById: () => assert.fail('must not reach AWAPI'),
    });
    const res = response();
    await handler({ user: { id: 'a', slug: 'a' }, params: { idUmrah: 'U-foreign' } }, res);
    assert.equal(res.statusCode, error ? 503 : 404);
    assert.deepEqual(filters, [['agent_id', 'a'], ['id_umroh', 'U-foreign']]);
  }
});

test('agent cannot test AWAPI credentials for another account', async () => {
  const handler = route('post', '/api/awapi/test', { getAgentById: async () => ({ awapi_key: 'own-key', awapi_code: 'OWN' }) });
  const res = response();
  await handler({ user: { id: 'a', role: 'agent' }, body: { awapi_key: 'foreign-key', awapi_code: 'OTHER' } }, res);
  assert.equal(res.statusCode, 403);
});

test('anonymous CAPI cannot invent Purchase events or override configured names', async () => {
  for (const body of [{ eventName: 'Purchase' }, { eventKey: 'purchase' }, { eventKey: 'contact', eventName: 'Purchase' }, { eventKey: '__proto__' }]) {
    assert.equal(browserCapiEventKey(body), null);
    const handler = route('post', '/api/capi/:slug/event', { browserCapiEventKey });
    const res = response();
    await handler({ body, params: { slug: 'agent' } }, res);
    assert.equal(res.statusCode, 400);
  }
  assert.equal(browserCapiEventKey({ eventName: 'Contact' }), 'contact');
  assert.equal(browserCapiEventKey({ eventKey: 'viewContent' }), 'viewContent');
});

test('CAPI preserves owner event mappings while stripping visitor payment values and hashed PII', async () => {
  let payload;
  const config = { pixelId: 'mock-pixel', accessToken: 'mock-token', events: { contact: { eventName: 'CustomEvent', customEventName: 'OwnerLead' } } };
  const handler = route('post', '/api/capi/:slug/event', {
    browserCapiEventKey, BROWSER_CAPI_EVENTS, crypto: { createHash },
    getAgentBySlug: async () => ({ id: 'a' }), checkCapiRateLimit: () => true,
    capiCircuitIsOpen: () => false, readCapiConfig: async () => config,
    capiDecrypt: () => 'mock-only-secret', clientIp: () => '203.0.113.1',
    fetch: async (_url, options) => { payload = JSON.parse(options.body); return Response.json({ events_received: 1 }); },
    logCapiEvent() {}, capiCircuitRecordResult() {},
  });
  const res = response();
  await handler({
    params: { slug: 'agent' }, headers: { 'user-agent': 'MockBrowser' },
    body: { eventKey: 'contact', eventId: 'test-event', customData: { value: 99999999, currency: 'USD' }, userData: { em: 'spoofed-identity' }, actionSource: 'physical_store' },
  }, res);
  assert.equal(res.body.sent, true);
  assert.equal(payload.data[0].event_name, 'OwnerLead');
  assert.deepEqual(payload.data[0].custom_data, {});
  assert.equal(payload.data[0].user_data.em, undefined);
  assert.equal(payload.data[0].user_data.client_user_agent, 'MockBrowser');
  assert.equal(payload.data[0].action_source, 'website');
});

test('portal sessions are delivered only as HttpOnly cookies and activity writes are throttled', () => {
  const start = source.indexOf('async function handlePortalMagicConsume(');
  const end = source.indexOf("app.get('/api/portal/jamaah/:slug/auth/consume", start);
  const consume = source.slice(start, end);
  assert.doesNotMatch(consume, /session_token:\s*sessionToken,\s*\n\s*id_umroh:\s*portalToken\.id_umroh,\s*\n\s*jamaah_name/);
  assert.match(consume, /res\.cookie\('jamaah_session'/);
  assert.match(consume, /session_token: 'cookie'/);
  assert.match(source, /Date\.now\(\) - lastActiveMs >= 5 \* 60 \* 1000/);
});

test('cached old portal apps can use the cookie marker without receiving a bearer secret', () => {
  const start = source.indexOf('function getPortalSessionToken(');
  const end = source.indexOf('\nfunction getPortalCookieOptions(', start);
  const ctx = { getPortalCookie: () => 'real-cookie-secret' };
  vm.createContext(ctx);
  vm.runInContext(source.slice(start, end), ctx);
  assert.equal(ctx.getPortalSessionToken({ headers: { authorization: 'Bearer cookie' } }), 'real-cookie-secret');
  assert.equal(ctx.getPortalSessionToken({ headers: { authorization: 'Bearer legacy-secret' } }), 'legacy-secret');
  assert.equal(ctx.getPortalSessionToken({ headers: {} }), 'real-cookie-secret');
});

test('webhook requires HMAC even from loopback and rejects oversized bodies', async t => {
  const secret = 'test-only-webhook-secret';
  const calls = [];
  const server = createServer(createDeployWebhookHandler({ secret, maxBytes: 300, deploy: (...args) => calls.push(args) }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/webhook/deploy`;
  const body = JSON.stringify({ ref: 'refs/heads/main', head_commit: { message: 'Perbaikan aman ✓', author: { name: 'Audit' } } });
  const signature = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
  assert.equal(verifyDeploySignature(body, signature, secret), true);
  assert.equal((await fetch(url, { method: 'POST', body })).status, 403);
  assert.equal((await fetch(url, { method: 'POST', body, headers: { 'x-hub-signature-256': signature } })).status, 200);
  assert.deepEqual(calls, [['Perbaikan aman ✓', 'Audit']]);
  assert.equal((await fetch(url, { method: 'POST', body: 'x'.repeat(301) })).status, 413);
  assert.equal(calls.length, 1);
});
