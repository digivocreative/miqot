import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveInstallStart, isValidInstallStart } from '../src/lib/installScope.js';

const root = new URL('..', import.meta.url).pathname;
const read = (path) => readFileSync(root + path, 'utf8');

// Audit 2026-09-17: manifest blob menjadikan start_url = path apa pun yang sedang
// dibuka (termasuk /login → clearSession tiap app dibuka), tanpa `id`; iOS 26
// mengabaikannya dan membuka "/" sehingga slug agent hilang.

test('halaman aplikasi agent & rute umum memakai manifest generik (id "/")', () => {
  for (const path of [
    '/',
    '',
    '/login',
    '/register',
    '/reset-password',
    '/dashboard',
    '/dashboard/teras/post/abc123',
    '/teras/bagas',
    '/compare',
    '/top-partner',
    '/f/abc123',
    '/j/abc23',
  ]) {
    assert.equal(resolveInstallStart(path), null, path);
  }
});

test('halaman agent, paket, dan kloter dipasang dengan start di akar konteksnya', () => {
  assert.equal(resolveInstallStart('/bagas'), '/bagas');
  assert.equal(resolveInstallStart('/bagas/'), '/bagas');
  assert.equal(resolveInstallStart('/bagas/JBU1504'), '/bagas');
  assert.equal(resolveInstallStart('/bagas/JBU1504/itinerary'), '/bagas');
  assert.equal(resolveInstallStart('/bagas/kalkulasi'), '/bagas');
  assert.equal(resolveInstallStart('/26SEP2026'), '/26SEP2026');
  assert.equal(resolveInstallStart('/26SEP2026/doa'), '/26SEP2026');
});

test('portal jamaah dipasang di /:slug/jamaah (sesi portal yang menentukan dashboard-nya)', () => {
  assert.equal(resolveInstallStart('/bagas/jamaah'), '/bagas/jamaah');
  assert.equal(resolveInstallStart('/bagas/jamaah/abc23/dashboard'), '/bagas/jamaah');
  assert.equal(resolveInstallStart('/bagas/JAMAAH/abc23'), '/bagas/jamaah');
});

test('segmen tak wajar tidak pernah jadi start_url', () => {
  for (const path of ['/bagas%20x', '/<script>', '/a.b', `/${'x'.repeat(65)}`, '/-bagas']) {
    assert.equal(resolveInstallStart(path), null, path);
  }
});

test('validasi start di server menolak apa pun di luar bentuk yang dihasilkan klien', () => {
  for (const start of ['/bagas', '/26SEP2026', '/bagas/jamaah']) {
    assert.equal(isValidInstallStart(start), true, start);
  }
  for (const start of ['', '/', '/dashboard', '/login', '/bagas/kalkulasi', '//evil.example', 'https://evil.example/', '/bagas/jamaah/x', '/bagas?x=1', '/a.b']) {
    assert.equal(isValidInstallStart(start), false, start);
  }
});

// Safari mengambil <link rel="manifest"> saat HTML diurai dan mengabaikan perubahan href
// dari JS (terbukti di iOS 26 Simulator: dialog Add to Home Screen tetap "/"). Link per
// konteks dibuat skrip inline di <head> SEBELUM link bawaan build; peramban memakai link
// manifest pertama. Skrip inline itu duplikat aturan installScope.js → dijaga paritasnya.
function runInlineManifestScript(pathname, hostname = 'alhijaz.co') {
  const html = read('index.html');
  const script = html.match(/<script>\s*\/\/ Manifest per konteks[\s\S]*?<\/script>/)?.[0];
  assert.ok(script, 'skrip manifest inline tidak ditemukan di index.html');
  const body = script.replace(/^<script>/, '').replace(/<\/script>$/, '');
  const appended = [];
  const fakeDocument = {
    createElement: () => ({}),
    head: { appendChild: (el) => appended.push(el) },
  };
  new Function('location', 'document', body)({ hostname, pathname }, fakeDocument);
  return appended;
}

test('skrip manifest inline di index.html sepadan dengan resolveInstallStart', () => {
  for (const path of ['/', '/login', '/dashboard/jamaah', '/f/abc', '/bagas', '/bagas/JBU1504/itinerary', '/bagas/jamaah/abc23/dashboard', '/26SEP2026/doa', '/<script>', '/a.b']) {
    const expected = resolveInstallStart(path);
    const links = runInlineManifestScript(path);
    if (expected === null) {
      assert.equal(links.length, 0, `${path}: tidak boleh membuat link manifest`);
    } else {
      assert.equal(links.length, 1, path);
      assert.equal(links[0].rel, 'manifest');
      assert.equal(links[0].href, `/app.webmanifest?start=${encodeURIComponent(expected)}`, path);
    }
  }
  // Custom domain: agent tersirat dari host, manifest generik tetap benar.
  assert.equal(runInlineManifestScript('/umroh', 'umrohbersamabagas.com').length, 0);
});

test('index.html tanpa manifest blob; main.tsx tidak lagi menukar href (Safari mengabaikannya)', () => {
  const html = read('index.html');
  const main = read('src/main.tsx');
  assert.doesNotMatch(html, /new Blob\(\[JSON\.stringify\(manifest\)\]/);
  assert.doesNotMatch(main, /setAttribute\('href', `\/app\.webmanifest/);
});

test('server menyajikan manifest per konteks dari manifest hasil build', () => {
  const server = read('server.js');
  assert.match(server, /import \{ isValidInstallStart \} from '\.\/src\/lib\/installScope\.js';/);
  const route = server.match(/app\.get\('\/app\.webmanifest'[\s\S]*?\n\}\);/)?.[0] ?? '';
  assert.notEqual(route, '', 'rute /app.webmanifest tidak ditemukan');
  assert.match(route, /isValidInstallStart\(start\)/);
  assert.match(route, /manifest\.id = start;/);
  assert.match(route, /manifest\.start_url = start;/);
  assert.match(route, /delete manifest\.shortcuts;/);
  // Harus terdaftar sebelum express.static + penangkap 404 berkas statis.
  assert.ok(server.indexOf("app.get('/app.webmanifest'") < server.indexOf('app.use(express.static(distPath'));
});
