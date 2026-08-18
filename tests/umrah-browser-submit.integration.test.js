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
            <option value="1" selected>Jamaah Baru</option>
          </select>
          <select name="vjadwal" onchange="fetch('/aiw/staff/pages/_otb.php')">
            <option value="">Pilih</option>
            <option value="JBU001" selected>JBU001</option>
          </select>
          <select name="paket" onchange="
            fetch('/aiw/staff/pages/_pkt.php', { method: 'POST' })
              .then(response => response.text())
              .then(html => { document.querySelector('#paket-details').innerHTML = html; })
          ">
            <option value="">Pilih</option>
            <option value="PKT001" selected>Paket Test</option>
          </select>
          <div id="paket-details"><input type="hidden" name="hpaket" value="0"></div>
          <select name="vmarketing" onchange="fetch('/aiw/staff/pages/_perwakilan.php')">
            <option value="SMTEST" selected>Marketing Test</option>
          </select>
          <input type="hidden" name="marketing" value="SMTEST">
          <select name="perwakilan"><option value="WKTEST" selected>Koordinator Test</option></select>
          <input name="ktp">
          <input name="pendaftar">
          <input type="file" name="file_ktp">
          <button id="sbButton" type="submit">Simpan</button>
        </form>
        <script>
          window.grecaptcha = {
            ready(callback) { callback(); },
            execute: async () => '${TEST_RECAPTCHA_TOKEN}',
          };
          function legacyCaptcha(isi) {
            grecaptcha.execute('fake-site-key', { action: 'submit' });
            return { id: 'fake-token-id', name: 'fake_recaptcha', value: isi };
          }
          document.getElementById('mF').addEventListener('submit', function(event) {
            event.preventDefault();
            const form = this;
            grecaptcha.ready(function() {
              grecaptcha.execute('fake-site-key', { action: 'submit' }).then(function(isi) {
                const token = document.createElement('input');
                token.type = 'hidden';
                token.id = 'fake-token-id';
                token.name = 'fake_recaptcha';
                token.value = isi;
                form.appendChild(token);

                const nativeMarker = document.createElement('input');
                nativeMarker.type = 'hidden';
                nativeMarker.name = 'native_submit_handler';
                nativeMarker.value = '1';
                form.appendChild(nativeMarker);

                const webdriverMarker = document.createElement('input');
                webdriverMarker.type = 'hidden';
                webdriverMarker.name = 'webdriver_state';
                webdriverMarker.value = String(navigator.webdriver);
                form.appendChild(webdriverMarker);
                form.submit();
              });
            });
          });
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

const DEFAULT_SUBMIT_RESPONSE_HTML =
  "<!doctype html><script>alert('Pendaftaran berhasil')</script><p>route=umrah</p>";

async function startFakeLegacyServer({
  packagePrice = TEST_PACKAGE_PRICE,
  submitResponseHtml = DEFAULT_SUBMIT_RESPONSE_HTML,
} = {}) {
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

      // Post-registration list page (window.location target on success). No form#mF.
      if (
        req.method === 'GET' &&
        url.pathname === '/aiw/staff/pages/main.php' &&
        url.searchParams.get('route') === 'umrah' &&
        !url.searchParams.get('act')
      ) {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end('<!doctype html><h1>Data Umrah</h1><table id="myDataTable"></table>');
        return;
      }

      if (/\/(?:_jdaftar|_otb)\.php$/.test(url.pathname)) {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end('OK');
        return;
      }

      if (url.pathname.endsWith('/_pkt.php')) {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(`
          <input type="hidden" name="hpaket" value="${packagePrice}">
          <input type="hidden" name="npaket" value="JBU001.2026-10-02.PKT001">
        `);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/aiw/staff/pages/aksi_umrah.php') {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(submitResponseHtml);
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
        vmarketing: 'SMTEST',
        marketing: 'SMTEST',
        perwakilan: 'WKTEST',
        firstname: 'CODEX',
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
    assert.equal(
      fakeLegacy.requests.filter(request => request.pathname.endsWith('/_jdaftar.php')).length,
      1,
      'jamaah field dependency must refresh even when the option is pre-selected',
    );
    assert.equal(
      fakeLegacy.requests.filter(request => request.pathname.endsWith('/_otb.php')).length,
      1,
      'package options must refresh even when the schedule is pre-selected',
    );
    assert.equal(packageRequests.length, 1, 'package detail AJAX must run once before submit');
    assert.equal(
      fakeLegacy.requests.filter(request => request.pathname.endsWith('/_perwakilan.php')).length,
      0,
      'an unchanged marketing selection must not reload the coordinator field',
    );

    const submits = fakeLegacy.requests.filter(request => request.pathname.endsWith('/aksi_umrah.php'));
    assert.equal(submits.length, 1, 'registration must have exactly one final mutation request');

    const multipartBody = submits[0].body.toString('latin1');
    assert.equal(multipartField(multipartBody, 'hpaket'), TEST_PACKAGE_PRICE);
    assert.equal(multipartField(multipartBody, 'npaket'), 'JBU001.2026-10-02.PKT001');
    assert.equal(multipartField(multipartBody, 'pakets'), null);
    assert.equal(multipartField(multipartBody, 'firstname'), null);
    assert.equal(multipartField(multipartBody, 'pin'), 'fresh-browser-pin');
    assert.equal(multipartField(multipartBody, 'ktp'), TEST_NIK);
    assert.equal(multipartField(multipartBody, 'fake_recaptcha'), TEST_RECAPTCHA_TOKEN);
    assert.equal(multipartField(multipartBody, 'native_submit_handler'), '1');
    assert.equal(multipartField(multipartBody, 'webdriver_state'), 'false');
    assert.match(multipartBody, /name="file_ktp"; filename="ktp\.jpg"/);
    assert.ok(multipartBody.includes(TEST_FILE_BYTES));
    assert.ok(!multipartBody.includes('stale-pin'));
    assert.match(submits[0].headers['user-agent'], /Chrome\/\d+\.0\.0\.0 Safari\/537\.36/);
    assert.doesNotMatch(submits[0].headers['user-agent'], /HeadlessChrome/);
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

test('browser submit does NOT infer success from an unknown post-submit label that only navigates to the list', { timeout: 45_000 }, async () => {
  // Alhijaz's aksi_umrah.php runs an inline <script>alert(status); window.location=list</script>
  // and navigates to the registration list on BOTH success and failure. When the
  // status label is a regressed/unknown value (verified live: alert('unknown')), the
  // submit was rejected (e.g. reCAPTCHA v3 score) and NO row is persisted. Navigation
  // to route=umrah must therefore never be read as success — only an explicit
  // 'Pendaftaran berhasil' alert is. Reporting false success drops real registrations.
  const fakeLegacy = await startFakeLegacyServer({
    submitResponseHtml:
      "<!doctype html><script>alert('unknown');window.location.href='/aiw/staff/pages/main.php?route=umrah';</script>",
  });
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
        ktp: TEST_NIK,
        pendaftar: 'CODEX TEST',
        vmarketing: 'SMTEST',
        marketing: 'SMTEST',
        perwakilan: 'WKTEST',
      },
      hiddenFields: { pin: 'stale-pin', hpaket: '0' },
      fileBuffer: Buffer.from(TEST_FILE_BYTES),
      fileName: 'ktp.jpg',
      fileFieldName: 'file_ktp',
      idb: TEST_IDB,
    });

    assert.equal(result.success, false, JSON.stringify(result));
    assert.match(result.error, /unknown/i);
  } finally {
    if (previousBrowserBase === undefined) delete process.env.LEGACY_BROWSER_API_BASE;
    else process.env.LEGACY_BROWSER_API_BASE = previousBrowserBase;
    await fakeLegacy.close();
  }
});

test('browser submit still rejects an explicit failure alert even after navigation', { timeout: 45_000 }, async () => {
  // A genuine server rejection must keep failing: an explicit failure phrase blocks
  // even if the page happens to navigate to a route=umrah URL.
  const fakeLegacy = await startFakeLegacyServer({
    submitResponseHtml:
      "<!doctype html><script>alert('Gagal: NIK sudah terdaftar');window.location.href='/aiw/staff/pages/main.php?route=umrah';</script>",
  });
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
        ktp: TEST_NIK,
        pendaftar: 'CODEX TEST',
        vmarketing: 'SMTEST',
        marketing: 'SMTEST',
        perwakilan: 'WKTEST',
      },
      hiddenFields: { pin: 'stale-pin', hpaket: '0' },
      fileBuffer: Buffer.from(TEST_FILE_BYTES),
      fileName: 'ktp.jpg',
      fileFieldName: 'file_ktp',
      idb: TEST_IDB,
    });

    assert.equal(result.success, false, JSON.stringify(result));
    assert.match(result.error, /NIK sudah terdaftar/);
  } finally {
    if (previousBrowserBase === undefined) delete process.env.LEGACY_BROWSER_API_BASE;
    else process.env.LEGACY_BROWSER_API_BASE = previousBrowserBase;
    await fakeLegacy.close();
  }
});
