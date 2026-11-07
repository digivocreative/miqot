import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

const TEST_ID_UMROH = 'AIW001';
const TEST_JM_ID = 'JM001';
const TEST_RECAPTCHA_TOKEN = 'fake-recaptcha-token';
const SUCCESS_RESPONSE_HTML =
  "<!doctype html><script>alert('Berhasil!');window.location.href='/aiw/staff/pages/main.php?route=umrah';</script>";

// Form edit jamaah (route=umrah&act=edaftar). Sejak ±22–28 Sep 2026 AIW tidak lagi
// memuat reCAPTCHA di form-nya: tombol Simpan langsung submit native ke aksi_umrah.php.
// `recaptcha: true` meniru bentuk lama (listener submit menyisipkan token lalu form.submit()).
function editFormHtml({ recaptcha = false, ktpPattern = '' } = {}) {
  return `<!doctype html>
    <html>
      <body>
        <form id="mF" method="post" enctype="multipart/form-data" action="/aiw/staff/pages/aksi_umrah.php">
          <input type="hidden" name="idu" value="${TEST_ID_UMROH}">
          <input type="hidden" name="idjamaah" value="${TEST_JM_ID}">
          <div class="form-group"><label>Nama Lengkap *</label><input name="nlengkap" value="BUDI LAMA" required></div>
          <div class="form-group"><label>Jenis Kelamin</label>
            <select name="kelamin"><option value="L" selected>Laki-laki</option><option value="P">Perempuan</option></select>
          </div>
          <div class="form-group"><label>No. KTP</label><input name="ktp" value="3276010101900001"${ktpPattern ? ` pattern="${ktpPattern}"` : ''}></div>
          <div class="form-group"><label>Nama Pendaftar</label><input name="pendaftar" value="BUDI LAMA"></div>
          <input type="hidden" name="tpendaftar" value="1111111111">
          <div class="form-group"><label>No. Telp/HP Jamaah</label><input name="tjamaah" value="081200000001"></div>
          <div class="form-group"><label>Tempat Lahir</label><input name="plahir" value="BANDUNG"></div>
          <div class="form-group"><label>Tanggal Lahir</label><input name="tlahir" value="01/01/1990"></div>
          <div class="form-group"><label>Alamat</label><textarea name="alamat">JL LAMA</textarea></div>
          <input type="hidden" name="pin" value="fresh-edit-pin">
          <button id="sbButton" type="submit">Simpan</button>
        </form>
        ${recaptcha ? `<script>
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
                token.name = 'fake_recaptcha';
                token.value = isi;
                form.appendChild(token);
                form.submit();
              });
            });
          });
        </script>` : ''}
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

async function startFakeLegacyServer({ formHtml = editFormHtml(), submitResponseHtml = SUCCESS_RESPONSE_HTML } = {}) {
  const requests = [];
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      requests.push({
        method: req.method,
        pathname: url.pathname,
        search: url.search,
        body: Buffer.concat(chunks),
        at: Date.now(),
      });

      const html = body => {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(body);
      };

      if (req.method === 'GET' && url.pathname === '/aiw/staff/') return html(loginFormHtml());
      if (req.method === 'POST' && url.pathname === '/aiw/staff/cek_login.php') {
        res.statusCode = 302;
        res.setHeader('set-cookie', 'PHPSESSID=fake-browser-session; Path=/');
        res.setHeader('location', '/aiw/staff/pages/main.php?route=home');
        res.end();
        return;
      }
      if (url.pathname === '/aiw/staff/pages/main.php') {
        const route = url.searchParams.get('route');
        const act = url.searchParams.get('act');
        if (route === 'home') return html('<!doctype html><h1>Home</h1>');
        if (route === 'umrah' && act === 'edaftar') return html(formHtml);
        if (route === 'umrah' && !act) return html('<!doctype html><h1>Data Umrah</h1>');
      }
      if (req.method === 'POST' && url.pathname === '/aiw/staff/pages/aksi_umrah.php') return html(submitResponseHtml);

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

async function withFakeLegacy(serverOptions, run) {
  const fakeLegacy = await startFakeLegacyServer(serverOptions);
  const previousBrowserBase = process.env.LEGACY_BROWSER_API_BASE;
  const previousHeadful = process.env.LEGACY_BROWSER_HEADFUL;
  process.env.LEGACY_BROWSER_API_BASE = fakeLegacy.origin;
  // Tanpa Xvfb di mesin tes: langsung headless, tanpa percobaan headed yang pasti gagal.
  process.env.LEGACY_BROWSER_HEADFUL = 'off';
  try {
    const api = await importLaporanApiWithoutRefedCleanupTimer();
    await run(api, fakeLegacy);
  } finally {
    if (previousBrowserBase === undefined) delete process.env.LEGACY_BROWSER_API_BASE;
    else process.env.LEGACY_BROWSER_API_BASE = previousBrowserBase;
    if (previousHeadful === undefined) delete process.env.LEGACY_BROWSER_HEADFUL;
    else process.env.LEGACY_BROWSER_HEADFUL = previousHeadful;
    await fakeLegacy.close();
  }
}

function multipartField(body, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = body.match(new RegExp(`name="${escapedName}"\\r\\n\\r\\n([^\\r]*)`));
  return match?.[1] ?? null;
}

// Bentuk `legacyFields` dari POST /api/laporan/jamaah/update: tpendaftar placeholder
// 1111111111 sudah diganti nomor jamaah oleh server.
const EDIT_PAYLOAD = {
  username: 'SMTEST',
  password: 'secret',
  kantor: '2',
  idUmroh: TEST_ID_UMROH,
  jmId: TEST_JM_ID,
  fields: {
    nama: 'BUDI BARU',
    wa: '6281200000002',
    tgl_lahir: '1990-02-03',
    jk: 'L',
    ktp: '3276010101900001',
    pendaftar: 'BUDI BARU',
    tpendaftar: '6281200000002',
    tempat_lahir: 'BANDUNG',
    alamat: 'JL BARU',
  },
};

const submitsOf = fakeLegacy => fakeLegacy.requests.filter(request =>
  request.method === 'POST' && request.pathname.endsWith('/aksi_umrah.php'));

test('edit form without reCAPTCHA (live since ±Sep 2026) saves promptly through the native Simpan button', { timeout: 45_000 }, async () => {
  await withFakeLegacy({}, async ({ submitUmrahJamaahEditWithBrowser }, fakeLegacy) => {
    const startedAt = Date.now();
    const result = await submitUmrahJamaahEditWithBrowser(EDIT_PAYLOAD);
    const elapsed = Date.now() - startedAt;

    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(result.message, 'Berhasil!');
    // Dulu menunggu grecaptcha 20 dtk lalu gagal "grecaptcha tidak tersedia".
    assert.ok(elapsed < 10_000, `edit took ${elapsed}ms`);

    const submits = submitsOf(fakeLegacy);
    assert.equal(submits.length, 1, 'exactly one biodata mutation');
    const body = submits[0].body.toString('latin1');
    assert.equal(multipartField(body, 'nlengkap'), 'BUDI BARU');
    assert.equal(multipartField(body, 'tjamaah'), '6281200000002');
    assert.equal(multipartField(body, 'tlahir'), '03/02/1990');
    assert.equal(multipartField(body, 'alamat'), 'JL BARU');
    assert.equal(multipartField(body, 'idu'), TEST_ID_UMROH);
    assert.equal(multipartField(body, 'idjamaah'), TEST_JM_ID);
    assert.equal(multipartField(body, 'pin'), 'fresh-edit-pin');
    assert.equal(multipartField(body, 'pendaftar'), 'BUDI BARU');
    assert.equal(multipartField(body, 'tpendaftar'), '6281200000002');
  });
});

test('edit form that still carries a reCAPTCHA listener lets AIW attach its own token', { timeout: 45_000 }, async () => {
  await withFakeLegacy({ formHtml: editFormHtml({ recaptcha: true }) }, async ({ submitUmrahJamaahEditWithBrowser }, fakeLegacy) => {
    const result = await submitUmrahJamaahEditWithBrowser(EDIT_PAYLOAD);
    assert.equal(result.success, true, JSON.stringify(result));

    const submits = submitsOf(fakeLegacy);
    assert.equal(submits.length, 1);
    const body = submits[0].body.toString('latin1');
    assert.equal(multipartField(body, 'fake_recaptcha'), TEST_RECAPTCHA_TOKEN);
    assert.equal(multipartField(body, 'nlengkap'), 'BUDI BARU');
  });
});

test('an AIW rejection alert after submit is reported, not treated as saved', { timeout: 45_000 }, async () => {
  const submitResponseHtml = "<!doctype html><script>alert('Gagal menyimpan data');"
    + "window.location.href='/aiw/staff/pages/main.php?route=umrah';</script>";
  await withFakeLegacy({ submitResponseHtml }, async ({ submitUmrahJamaahEditWithBrowser }) => {
    const result = await submitUmrahJamaahEditWithBrowser(EDIT_PAYLOAD);
    assert.equal(result.success, false);
    assert.match(result.error, /Gagal menyimpan data/);
  });
});

test('an HTML5-invalid field is named instead of a silent no-submit', { timeout: 45_000 }, async () => {
  await withFakeLegacy({ formHtml: editFormHtml({ ktpPattern: '.{16,16}' }) }, async ({ submitUmrahJamaahEditWithBrowser }, fakeLegacy) => {
    const result = await submitUmrahJamaahEditWithBrowser({
      ...EDIT_PAYLOAD,
      fields: { ...EDIT_PAYLOAD.fields, ktp: '12345' },
    });
    assert.equal(result.success, false);
    assert.equal(result.reason, 'legacy_form_invalid');
    assert.match(result.error, /No\. KTP harus 16–16 karakter/);
    assert.equal(submitsOf(fakeLegacy).length, 0, 'an invalid form must not post');
  });
});
