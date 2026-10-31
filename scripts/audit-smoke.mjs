// End-to-end smoke/stress checks against a disposable server and in-memory DB.
// The child has no production env, and its preload blocks all external fetches.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const secret = randomBytes(48).toString('base64');
const agent = {
  id: '00000000-0000-4000-8000-000000000001', slug: 'audit-agent', name: 'Agent Audit',
  role: 'agent', status: 'active', email: 'audit@example.invalid', phone: '628123456789',
  password: await bcrypt.hash('audit-password', 4), awapi_key: 'MOCK-KEY', awapi_code: 'MOCK',
};
const schedule = {
  jadwal_id: 'JBU9998', year_code: '1448', jadwal_nama: 'PAKET AUDIT 9 HARI',
  berangkat_tgl: '2027-01-10', pulang_tgl: '2027-01-18', seat_sisa: '18', seat_total: '45',
  berangkat_rute: 'CGK-JED', pulang_rute: 'MED-CGK', berangkat_kode_penerbangan: 'SV819',
  paket_harga: { UHUD: { Quard: '33900000', Triple: '34900000', Double: '35900000' } },
};
const agentWithAiw = {
  ...agent, id: '00000000-0000-4000-8000-000000000002', slug: 'audit-aiw', email: 'aiw@example.invalid',
  jamaah_username: 'SM00001', jamaah_password: 'mock-encrypted',
};
const tables = { agents: [agent, agentWithAiw], umroh_schedules: [schedule], itineraries: [], jamaah: [], jamaah_haji: [] };
const dbReads = {};
const mock = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  const table = url.pathname.split('/').at(-1);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    // Analytics written by a mock login goes only to this disposable server.
    for await (const _chunk of req) { /* drain */ }
    res.writeHead(201, { 'content-type': 'application/json' }).end('[]');
    return;
  }
  dbReads[table] = (dbReads[table] || 0) + 1;
  let rows = [...(tables[table] || [])];
  for (const [key, filter] of url.searchParams) {
    if (filter.startsWith('eq.')) rows = rows.filter(row => String(row[key]) === filter.slice(3));
  }
  const singular = req.headers.accept?.includes('vnd.pgrst.object');
  const data = singular ? rows[0] || null : rows;
  res.writeHead(200, { 'content-type': 'application/json', 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` });
  res.end(req.method === 'HEAD' ? '' : JSON.stringify(data));
});
await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
const mockOrigin = `http://127.0.0.1:${mock.address().port}`;
const reservation = createServer();
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['--import', './tests/fixtures/audit-network-guard.mjs', 'server.js'], {
  cwd: root,
  env: {
    PATH: process.env.PATH, NODE_ENV: 'test', DOTENV_CONFIG_PATH: '/dev/null',
    ENABLE_BACKGROUND_JOBS: 'false', PORT: String(port), JWT_SECRET: secret,
    SUPABASE_URL: mockOrigin, SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role',
    CAPI_ENCRYPTION_KEY: randomBytes(32).toString('base64'), AWAPI_SYNC_ENABLED: 'true',
    AUDIT_MOCK_DB_ORIGIN: mockOrigin, COMMIT_SHA: 'audit', COMMIT_MSG: 'audit validation',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', chunk => { output = (output + chunk).slice(-20000); });
child.stderr.on('data', chunk => { output = (output + chunk).slice(-20000); });
let browser;
let page;
const pageErrors = [];
const browserErrors = [];
let totalRequests = 0;
const request = async (path, options = {}) => {
  totalRequests++;
  return fetch(base + path, { ...options, signal: AbortSignal.timeout(20000) });
};
const jsonPost = body => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
try {
  const deadline = Date.now() + 20000;
  while (!output.includes('server running on')) {
    if (child.exitCode !== null || Date.now() > deadline) throw new Error(`Server startup failed: ${output}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  const login = await request('/api/auth/login', jsonPost({ slug: agent.slug, password: 'audit-password' }));
  assert.equal(login.status, 200);
  const session = await login.json();
  const auth = { headers: { authorization: `Bearer ${session.token}` } };
  const me = await request('/api/auth/me', auth);
  assert.equal(me.status, 200);
  const meBody = await me.json();
  assert.equal(meBody.has_aiw_account, false, 'agent without Akun AIW');
  assert.equal(JSON.stringify(meBody).includes('jamaah'), false, '/me must not expose credentials');
  const withAiw = jwt.sign({ id: agentWithAiw.id, slug: agentWithAiw.slug, role: 'agent' }, secret);
  const meWithAiw = await (await request('/api/auth/me', { headers: { authorization: `Bearer ${withAiw}` } })).json();
  assert.equal(meWithAiw.has_aiw_account, true, 'agent with Akun AIW');
  const staleAdmin = jwt.sign({ id: agent.id, slug: agent.slug, role: 'admin' }, secret);
  assert.equal((await request('/api/admin/agents', { headers: { authorization: `Bearer ${staleAdmin}` } })).status, 403);
  const deleted = jwt.sign({ id: 'deleted-agent', role: 'admin' }, secret);
  assert.equal((await request('/api/auth/me', { headers: { authorization: `Bearer ${deleted}` } })).status, 401);
  assert.equal((await request('/api/laporan/jamaah/JM999999/refresh', auth)).status, 404);
  assert.equal((await request('/api/laporan/umrah/FOREIGN/refresh', auth)).status, 404);
  assert.equal((await request('/api/awapi/test', { ...jsonPost({ awapi_code: 'FOREIGN' }), headers: { ...auth.headers, 'content-type': 'application/json' } })).status, 403);
  assert.equal((await request(`/api/capi/${agent.slug}/event`, jsonPost({ eventName: 'Purchase', customData: { value: 99999999 } }))).status, 400);
  assert.equal((await request(`/api/capi/${agent.slug}/event`, jsonPost({ eventKey: 'contact' }))).status, 200);
  for (const path of ['/login', '/audit-agent', '/audit-agent/umroh', '/audit-agent/haji']) {
    const res = await request(path);
    assert.equal(res.status, 200, path);
    assert.match(await res.text(), /<html/i);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  }
  const missing = await request('/assets/nonexistent-audit.js');
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('cache-control'), 'no-store');

  const readsBefore = dbReads.umroh_schedules || 0;
  const timings = [];
  let jobs = 0;
  const started = performance.now();
  await Promise.all(Array.from({ length: 32 }, async () => {
    while (jobs++ < 1200) {
      const t = performance.now();
      const res = await request('/api/schedules/1448');
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, 'ok');
      assert.equal(body.aaData.length, 1);
      timings.push(performance.now() - t);
    }
  }));
  const elapsedMs = performance.now() - started;
  const scheduleReads = (dbReads.umroh_schedules || 0) - readsBefore;
  assert.equal(scheduleReads, 1, '1200 schedule requests should perform one DB read');
  await Promise.all(Array.from({ length: 200 }, async () => {
    const res = await request('/api/auth/me', auth);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).id, agent.id);
  }));
  for (let n = 0; n < 30; n++) await (await request('/api/auth/login', jsonPost({}))).arrayBuffer();
  const limited = await request('/api/auth/login', { ...jsonPost({}), headers: { 'content-type': 'application/json', 'x-forwarded-for': '8.8.8.8' } });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  assert.equal((await request(`/api/capi/${agent.slug}/login`, jsonPost({ password: 'audit-password' }))).status, 429);
  assert.equal((await request('/api/auth/login', jsonPost({ slug: 'x'.repeat(17000) }))).status, 413);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  page = await context.newPage();
  page.on('pageerror', err => pageErrors.push(err.message));
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
  page.on('requestfailed', request => browserErrors.push(`${request.url()}: ${request.failure()?.errorText}`));
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.locator('#login-password').waitFor({ state: 'visible' });
  await context.addCookies([{ name: 'jamaah_session', value: 'mock-http-only-secret', url: base, httpOnly: true }]);
  await page.evaluate(() => { document.cookie = 'jamaah_session=cookie; path=/'; });
  const portalCookie = (await context.cookies()).find(cookie => cookie.name === 'jamaah_session');
  assert.equal(portalCookie?.value, 'mock-http-only-secret', 'old app cannot replace the HttpOnly session with its marker');
  assert.equal(portalCookie?.httpOnly, true);
  await page.goto(`${base}/audit-agent`, { waitUntil: 'networkidle' });
  await page.locator('[data-jadwal-id="JBU9998"]').first().waitFor({ state: 'visible', timeout: 20000 });
  // Gerbang Akun AIW: server asli + bundel build. Agent tanpa akun dialihkan, yang punya tidak.
  await page.evaluate(stored => localStorage.setItem('auth_session', JSON.stringify(stored)), session);
  await page.goto(`${base}/audit-agent`);
  await page.waitForURL('**/dashboard/jamaah', { timeout: 20000 });
  await page.getByRole('heading', { name: 'AIW Agent Login' }).waitFor({ state: 'visible', timeout: 20000 });
  await page.evaluate(stored => localStorage.setItem('auth_session', JSON.stringify(stored)), {
    token: withAiw, user: { slug: agentWithAiw.slug, name: agentWithAiw.name, role: 'agent' },
  });
  await page.goto(`${base}/audit-agent`);
  await page.locator('[data-jadwal-id="JBU9998"]').first().waitFor({ state: 'visible', timeout: 20000 });
  assert.deepEqual(pageErrors, [], 'built login/public app must not throw in Chromium');
  timings.sort((a, b) => a - b);
  // /proc hanya ada di Linux; di macOS angka memori dilewati.
  const rss = process.platform === 'linux'
    ? readFileSync(`/proc/${child.pid}/status`, 'utf8').match(/^VmRSS:\s+(\d+)/m)?.[1]
    : null;
  console.log(JSON.stringify({
    result: 'passed', requests: totalRequests, scheduleRequests: timings.length, concurrency: 32,
    scheduleDbReads: scheduleReads, scheduleElapsedMs: Math.round(elapsedMs),
    medianMs: Math.round(timings[Math.floor(timings.length / 2)]), p95Ms: Math.round(timings[Math.floor(timings.length * 0.95)]),
    childRssMiB: rss ? Math.round(Number(rss) / 1024) : null, browserSmoke: ['login', 'public schedule'],
  }, null, 2));
} catch (err) {
  console.error('Mock browser errors:', JSON.stringify({ pageErrors, browserErrors }));
  if (page && !page.isClosed()) console.error('Mock browser state:', (await page.locator('body').innerText({ timeout: 1000 }).catch(() => '')).slice(0, 3000));
  console.error(output.slice(-6000));
  throw err;
} finally {
  await browser?.close();
  const exited = once(child, 'exit');
  if (child.exitCode === null) child.kill('SIGTERM');
  if (child.exitCode === null) await exited;
  await new Promise(resolve => mock.close(resolve));
}
