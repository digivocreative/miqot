import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRACKING_SCRIPT_LIMIT,
  normalizeTrackingScript,
  trackingScriptError,
} from '../lib/landing-tracking-script.js';

const PIXEL = `<!-- Meta Pixel Code -->
<script>
!function(f,b,e,v,n,t,s){/* ... */}(window, document, 'script');
fbq('init', '1234567890');
fbq('track', 'PageView');
</script>`;

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

test('snippet pixel wajar tersimpan apa adanya (cuma di-trim di tepi)', () => {
  assert.equal(normalizeTrackingScript(`\n  ${PIXEL}  \n`), PIXEL);
});

test('pola pengganti $1/$& di dalam snippet TIDAK diutak-atik di lapisan ini', () => {
  // Pengamanannya ada di titik suntik (replacement fungsi, bukan string).
  // Di sini yang dijaga: validasi tidak boleh diam-diam mengubah isi.
  const snippet = `<script>var a = s.replace(/(\\d+)/, '$1-$&');</script>`;
  assert.equal(normalizeTrackingScript(snippet), snippet);
});

test('menutup body/html lebih awal ditolak — apa pun ejaannya', () => {
  const nakal = [
    '<script>x()</script></body>',
    '<script>x()</script></BODY>',
    '<script>x()</script></ body>',
    '<script>x()</script></\tbody >',
    '<script>x()</script></html>',
    '</Html>',
  ];
  for (const value of nakal) {
    assert.equal(trackingScriptError(value), 'Tidak boleh memuat </body> atau </html>', value);
    assert.throws(() => normalizeTrackingScript(value), /Tidak boleh memuat/, value);
  }
});

test('kata "body" yang bukan tag penutup tetap boleh', () => {
  const sah = `<script>document.body.dataset.x = '1'; var t = '</bodyguard>';</script>`;
  assert.equal(trackingScriptError(sah), null);
  assert.equal(normalizeTrackingScript(sah), sah);
});

test('batas panjang ditegakkan di sini, bukan di limit express.json per-route', () => {
  const pas = 'a'.repeat(TRACKING_SCRIPT_LIMIT);
  const lebih = 'a'.repeat(TRACKING_SCRIPT_LIMIT + 1);
  assert.equal(trackingScriptError(pas), null);
  assert.equal(normalizeTrackingScript(pas), pas);
  assert.equal(trackingScriptError(lebih), `Melebihi batas ${TRACKING_SCRIPT_LIMIT} karakter`);
  assert.throws(() => normalizeTrackingScript(lebih), /Melebihi batas/);
});

test('spasi di tepi tidak ikut dihitung sebagai kelebihan panjang', () => {
  const pas = `   ${'a'.repeat(TRACKING_SCRIPT_LIMIT)}   `;
  assert.equal(trackingScriptError(pas), null);
});

test('trackingScriptError aman dipanggil untuk nilai kosong/non-string', () => {
  assert.equal(trackingScriptError(''), null);
  assert.equal(trackingScriptError('   '), null);
  assert.equal(trackingScriptError(undefined), null);
  assert.equal(trackingScriptError(null), null);
});
