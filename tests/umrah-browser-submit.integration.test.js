import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

const TEST_NIK = '3276010101900001';
const TEST_IDB = 'AIW001.JBU001';
const TEST_PACKAGE_PRICE = '33900000';
const TEST_RECAPTCHA_TOKEN = 'fake-recaptcha-token';
const TEST_FILE_BYTES = 'fake-jpeg-file-bytes';

function registrationFormHtml() {
  return `<!doctype html>
    <html>
      <body>
        <form id="mF" method="post" enctype="multipart/form-data" action="/aiw/staff/pages/aksi_umrah.php">
          <input type="hidden" name="pin" value="fresh-browser-pin">
          <select name="jdaftar" onchange="fetch('/aiw/staff/pages/_jdaftar.php')">
            <option value="">Pilih</option>
            <option value="1">Jamaah Baru</option>
          </select>
          <select name="vjadwal" onchange="fetch('/aiw/staff/pages/_otb.php')">
            <option value="">Pilih</option>
            <option value="JBU001">JBU001</option>
          </select>
          <select name="paket" onchange="
            fetch('/aiw/staff/pages/_pkt.php', { method: 'POST' })
              .then(response => response.text())
              .then(html => { document.querySelector('#paket-details').innerHTML = html; })
          ">
            <option value="">Pilih</option>
            <option value="PKT001">Paket Test</option>
          </select>
          <div id="paket-details"><input type="hidden" name="hpaket" value="0"></div>
          <input name="ktp">
          <input name="pendaftar">
          <input type="file" name="file_ktp">
        </form>
        <script>
          window.grecaptcha = { execute: async () => '${TEST_RECAPTCHA_TOKEN}' };
          function legacyCaptcha(isi) {
            grecaptcha.execute('fake-site-key', { action: 'submit' });
            return { id: 'fake-token-id', name: 'fake_recaptcha', value: isi };
          }
        </script>
      </body>
    </html>`;
}

function loginFormHtml() {
  return `<!doctype html>
    <form method="post" action="/aiw/staff/cek_login.php">
      <select name="kantor"><option value="2">2</option></select>
      <input name="username">
      <input name="password" type="password">
      <button type="submit">Login</button>
    </form>`;
}

async function startFakeLegacyServer({ packagePrice = TEST_PACKAGE_PRICE } = {}) {
  const requests = [];
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      requests.push({
        method: req.method,
        pathname: url.pathname,
        search: url.search,
        headers: req.headers,
        body,
      });

      if (req.method === 'GET' && url.pathname === '/aiw/staff/') {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(loginFormHtml());
        return;
      }

      if (req.method === 'POST' && url.pathname === '/aiw/staff/cek_login.php') {
        res.statusCode = 302;
        res.setHeader('set-cookie', 'PHPSESSID=fake-browser-session; Path=/');
        res.setHeader('location', '/aiw/staff/pages/main.php?route=home');
        res.end();
        return;
      }

      if (
        req.method === 'GET' &&
        url.pathname === '/aiw/staff/pages/main.php' &&
        url.searchParams.get('route') === 'home'
      ) {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end('<!doctype html><h1>Home</h1>');
        return;
      }

      if (
        req.method === 'GET' &&
        url.pathname === '/aiw/staff/pages/main.php' &&
        url.searchParams.get('act') === 'tdaftar'
      ) {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(registrationFormHtml());
        return;
      }

      if (/\/(?:_jdaftar|_otb)\.php$/.test(url.pathname)) {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end('OK');
        return;
      }

      if (url.pathname.endsWith('/_pkt.php')) {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(`<input type="hidden" name="hpaket" value="${packagePrice}">`);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/aiw/staff/pages/aksi_umrah.php') {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end("<!doctype html><script>alert('Pendaftaran berhasil')</script><p>route=umrah</p>");
        return;
      }

      res.statusCode = 404;
      res.end('not found');
    } catch (error) {
      res.statusCode = 500;
      res.end(error.message);
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    requests,
    async close() {
      await new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
      });
    },
  };
}

async function importLaporanApiWithoutRefedCleanupTimer() {
  const originalSetInterval = globalThis.setInterval;
  globalThis.setInterval = (...args) => {
    const timer = originalSetInterval(...args);
    timer.unref?.();
    return timer;
  };
  try {
    const url = new URL('../laporan-api.js', import.meta.url);
    url.searchParams.set('integration-test', String(Date.now()));
    return await import(url.href);
  } finally {
    globalThis.setInterval = originalSetInterval;
  }
}

function multipartField(body, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = body.match(new RegExp(`name="${escapedName}"\\r\\n\\r\\n([^\\r]*)`));
  return match?.[1] ?? null;
}

test('browser submit stays local, preserves fresh package price, and sends one complete registration', { timeout: 45_000 }, async () => {
  const fakeLegacy = await startFakeLegacyServer();
  const previousBrowserBase = process.env.LEGACY_BROWSER_API_BASE;
  process.env.LEGACY_BROWSER_API_BASE = fakeLegacy.origin;

  try {
    const { submitUmrahRegistrationWithBrowser } = await importLaporanApiWithoutRefedCleanupTimer();
    const result = await submitUmrahRegistrationWithBrowser({
      username: 'SMTEST',
      password: 'secret',
      kantor: '2',
      fields: {
        jdaftar: '1',
        vjadwal: 'JBU001',
        paket: 'PKT001',
        pakets: 'JBU001.PKT001',
        ktp: TEST_NIK,
        pendaftar: 'CODEX TEST',
      },
      // This is deliberately stale. The browser's fresh _pkt.php response must win.
      hiddenFields: { pin: 'stale-pin', hpaket: '0' },
      fileBuffer: Buffer.from(TEST_FILE_BYTES),
      fileName: 'ktp.jpg',
      fileFieldName: 'file_ktp',
      idb: TEST_IDB,
    });

    assert.equal(result.success, true, JSON.stringify(result));

    const formLoads = fakeLegacy.requests.filter(request =>
      request.pathname === '/aiw/staff/pages/main.php' &&
      new URLSearchParams(request.search).get('act') === 'tdaftar'
    );
    assert.equal(formLoads.length, 1);
    assert.equal(new URLSearchParams(formLoads[0].search).get('.idb'), TEST_IDB);

    const packageRequests = fakeLegacy.requests.filter(request => request.pathname.endsWith('/_pkt.php'));
    assert.equal(packageRequests.length, 1, 'package detail AJAX must run once before submit');

    const submits = fakeLegacy.requests.filter(request => request.pathname.endsWith('/aksi_umrah.php'));
    assert.equal(submits.length, 1, 'registration must have exactly one final mutation request');

    const multipartBody = submits[0].body.toString('latin1');
    assert.equal(multipartField(multipartBody, 'hpaket'), TEST_PACKAGE_PRICE);
    assert.equal(multipartField(multipartBody, 'pakets'), 'JBU001.PKT001');
    assert.equal(multipartField(multipartBody, 'pin'), 'fresh-browser-pin');
    assert.equal(multipartField(multipartBody, 'ktp'), TEST_NIK);
    assert.equal(multipartField(multipartBody, 'fake_recaptcha'), TEST_RECAPTCHA_TOKEN);
    assert.match(multipartBody, /name="file_ktp"; filename="ktp\.jpg"/);
    assert.ok(multipartBody.includes(TEST_FILE_BYTES));
    assert.ok(!multipartBody.includes('stale-pin'));
  } finally {
    if (previousBrowserBase === undefined) delete process.env.LEGACY_BROWSER_API_BASE;
    else process.env.LEGACY_BROWSER_API_BASE = previousBrowserBase;
    await fakeLegacy.close();
  }
});

test('browser submit refuses an unresolved package price before the final mutation', { timeout: 45_000 }, async () => {
  const fakeLegacy = await startFakeLegacyServer({ packagePrice: '0' });
  const previousBrowserBase = process.env.LEGACY_BROWSER_API_BASE;
  process.env.LEGACY_BROWSER_API_BASE = fakeLegacy.origin;

  try {
    const { submitUmrahRegistrationWithBrowser } = await importLaporanApiWithoutRefedCleanupTimer();
    const result = await submitUmrahRegistrationWithBrowser({
      username: 'SMTEST',
      password: 'secret',
      kantor: '2',
      fields: {
        jdaftar: '1',
        vjadwal: 'JBU001',
        paket: 'PKT001',
        pakets: 'JBU001.PKT001',
        ktp: TEST_NIK,
      },
      hiddenFields: { pin: 'stale-pin', hpaket: '33900000' },
    });

    assert.equal(result.success, false);
    assert.equal(result.reason, 'package_price_unresolved');
    assert.equal(
      fakeLegacy.requests.filter(request => request.pathname.endsWith('/aksi_umrah.php')).length,
      0,
      'no final mutation may run with price zero',
    );
  } finally {
    if (previousBrowserBase === undefined) delete process.env.LEGACY_BROWSER_API_BASE;
    else process.env.LEGACY_BROWSER_API_BASE = previousBrowserBase;
    await fakeLegacy.close();
  }
});

test('browser dry-run verifies reCAPTCHA without sending the final mutation', { timeout: 45_000 }, async () => {
  const fakeLegacy = await startFakeLegacyServer();
  const previousBrowserBase = process.env.LEGACY_BROWSER_API_BASE;
  process.env.LEGACY_BROWSER_API_BASE = fakeLegacy.origin;

  try {
    const { submitUmrahRegistrationWithBrowser } = await importLaporanApiWithoutRefedCleanupTimer();
    const result = await submitUmrahRegistrationWithBrowser({
      username: 'SMTEST',
      password: 'secret',
      kantor: '2',
      fields: {
        jdaftar: '1',
        vjadwal: 'JBU001',
        paket: 'PKT001',
        pakets: 'JBU001.PKT001',
        ktp: TEST_NIK,
      },
      hiddenFields: { pin: 'stale-pin', hpaket: '0' },
      dryRun: true,
    });

    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(result.dryRun, true);
    assert.ok(result.debug.tokenLength > 0);
    assert.equal(
      fakeLegacy.requests.filter(request => request.pathname.endsWith('/aksi_umrah.php')).length,
      0,
      'dry-run must never send the final mutation',
    );
  } finally {
    if (previousBrowserBase === undefined) delete process.env.LEGACY_BROWSER_API_BASE;
    else process.env.LEGACY_BROWSER_API_BASE = previousBrowserBase;
    await fakeLegacy.close();
  }
});
