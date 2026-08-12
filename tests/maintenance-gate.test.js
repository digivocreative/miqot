import { test } from 'node:test';
import assert from 'node:assert/strict';

const previousEnv = {
  MAINTENANCE_UNTIL: process.env.MAINTENANCE_UNTIL,
  MAINTENANCE_MODE: process.env.MAINTENANCE_MODE,
  MAINTENANCE_ALLOW_IPS: process.env.MAINTENANCE_ALLOW_IPS,
  MAINTENANCE_ALLOW_SLUGS: process.env.MAINTENANCE_ALLOW_SLUGS,
};

process.env.MAINTENANCE_UNTIL = '2099-08-10T21:00:00+07:00';
process.env.MAINTENANCE_MODE = 'strict';
process.env.MAINTENANCE_ALLOW_IPS = '';
process.env.MAINTENANCE_ALLOW_SLUGS = 'nikita';

const gateModuleUrl = new URL('../lib/maintenance-gate.js', import.meta.url);
gateModuleUrl.searchParams.set('test', String(Date.now()));
const {
  MAINTENANCE_ACCESS_COOKIE,
  createMaintenanceGate,
  isMaintenanceAgentAllowed,
  isStrictMaintenanceActive,
} = await import(gateModuleUrl.href);

for (const [key, value] of Object.entries(previousEnv)) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function request(path, overrides = {}) {
  return {
    path,
    method: 'GET',
    hostname: 'alhijaz.co',
    headers: {},
    socket: { remoteAddress: '203.0.113.10' },
    ...overrides,
  };
}

function response() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    set(headers) { Object.assign(this.headers, headers); return this; },
    status(code) { this.statusCode = code; return this; },
    type(value) { this.headers['Content-Type'] = value; return this; },
    send(value) { this.body = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

function runGate(req) {
  const res = response();
  let nextCalled = false;
  const gate = createMaintenanceGate({
    isPrimaryHost: host => host === 'alhijaz.co' || host === 'www.alhijaz.co',
    isSharedStaticRequestPath: path => path.startsWith('/assets/') || path === '/logo-alhijaz.webp',
    verifyAccessToken: token => {
      if (token === 'nikita-token') return { id: 'agent-1', slug: 'nikita', role: 'admin' };
      if (token === 'other-token') return { id: 'agent-2', slug: 'bagas', role: 'agent' };
      if (token === 'reset-token') return { id: 'agent-1', slug: 'nikita', role: 'admin', purpose: 'password-reset' };
      throw new Error('invalid token');
    },
  });
  gate(req, res, () => { nextCalled = true; });
  return { res, nextCalled };
}

test('strict maintenance menutup halaman publik, termasuk landing agent', () => {
  for (const path of ['/', '/nikita', '/nikita/umroh', '/bio/nikita', '/api/analytics/public']) {
    const { res, nextCalled } = runGate(request(path));
    assert.equal(nextCalled, false, path);
    assert.equal(res.statusCode, 503, path);
    assert.equal(res.headers['Cache-Control'], 'no-store', path);
    if (path.startsWith('/api/')) {
      assert.equal(res.body.error, 'service_unavailable', path);
      assert.doesNotMatch(JSON.stringify(res.body), /maintenance|pemeliharaan/i, path);
    } else {
      assert.match(res.body, /ERR_CONNECTION_REFUSED/, path);
      assert.doesNotMatch(res.body, /maintenance|pemeliharaan|21\.00/i, path);
    }
  }
});

test('strict maintenance tetap menyediakan login, aset, dan webhook mesin', () => {
  const cases = [
    request('/login'),
    request('/api/auth/login', { method: 'POST' }),
    request('/assets/app.js'),
    request('/logo-alhijaz.webp'),
    request('/api/domains/authorize'),
    request('/api/resend-inbound', { method: 'POST' }),
    request('/api/telegram/webhook', { method: 'POST' }),
  ];
  for (const req of cases) assert.equal(runGate(req).nextCalled, true, req.path);
});

test('hanya JWT login agent allowlist yang menjadi bypass', () => {
  assert.equal(isStrictMaintenanceActive(), true);
  assert.equal(isMaintenanceAgentAllowed('NIKITA'), true);
  assert.equal(isMaintenanceAgentAllowed('bagas'), false);

  assert.equal(runGate(request('/dashboard', {
    headers: { authorization: 'Bearer nikita-token' },
  })).nextCalled, true);
  assert.equal(runGate(request('/dashboard', {
    headers: { authorization: 'Bearer other-token' },
  })).res.statusCode, 503);
  assert.equal(runGate(request('/dashboard', {
    headers: { authorization: 'Bearer reset-token' },
  })).res.statusCode, 503);
});

test('cookie login nikita melewatkan request navigasi tanpa Authorization header', () => {
  const req = request('/dashboard', {
    headers: { cookie: `theme=dark; ${MAINTENANCE_ACCESS_COOKIE}=nikita-token` },
  });
  assert.equal(runGate(req).nextCalled, true);
});

test('custom domain di luar host utama tidak ikut diblokir', () => {
  assert.equal(runGate(request('/umroh', { hostname: 'contoh-agent.id' })).nextCalled, true);
});
