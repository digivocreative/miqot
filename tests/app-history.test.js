import { test } from 'node:test';
import assert from 'node:assert/strict';

// Riwayat navigasi dalam-app. Audit: tombol "Kembali" di app menambah entri riwayat
// (pushState) alih-alih mundur, jadi gestur back Android membuka lagi layar yang baru
// ditinggal; layar yang dibuka langsung (deep link / app diluncurkan) tak punya entri
// dalam-app sehingga back harus mengganti (replace) ke induknya, bukan keluar app.

function installFakeHistory(initialPath) {
  const entries = [{ state: null, url: initialPath }];
  let index = 0;
  const calls = [];
  globalThis.window = {
    history: {
      get state() { return entries[index].state; },
      pushState(state, _title, url) { entries.splice(index + 1); entries.push({ state, url }); index += 1; calls.push(['push', url]); },
      replaceState(state, _title, url) { entries[index] = { state, url: url ?? entries[index].url }; calls.push(['replace', url]); },
      back() { if (index > 0) index -= 1; calls.push(['back']); },
    },
  };
  return { calls, current: () => entries[index] };
}

const { pushAppState, replaceAppState, canGoBackInApp, backOr } = await import('../src/lib/appHistory.ts');

test('layar yang dibuka langsung tidak bisa mundur di dalam app → fallback dijalankan', () => {
  const h = installFakeHistory('/dashboard/jamaah/daftar');
  assert.equal(canGoBackInApp(), false);
  let fallback = 0;
  backOr(() => { fallback += 1; });
  assert.equal(fallback, 1);
  assert.deepEqual(h.calls, []);
});

test('setelah navigasi dalam app, kembali = history.back() (bukan push baru)', () => {
  const h = installFakeHistory('/dashboard');
  pushAppState({ tab: 'jamaah' }, '/dashboard/jamaah');
  pushAppState({ tab: 'jamaah' }, '/dashboard/jamaah/daftar');
  assert.equal(canGoBackInApp(), true);
  let fallback = 0;
  backOr(() => { fallback += 1; });
  assert.equal(fallback, 0);
  assert.deepEqual(h.calls.at(-1), ['back']);
  assert.equal(h.current().url, '/dashboard/jamaah');
  assert.equal(canGoBackInApp(), true, 'masih satu langkah dari entri awal');
  backOr(() => { fallback += 1; });
  assert.equal(h.current().url, '/dashboard');
  assert.equal(canGoBackInApp(), false);
});

// Entri overlay (src/lib/overlayHistory.ts) menyalin state halaman di bawahnya, termasuk
// kedalamannya. Navigasi dari dalam modal (mis. "Lihat Semua" → Edit jamaah) MENGGANTI
// entri overlay itu dengan layar tujuan — layar itu satu langkah di atas halaman daftar.
// Daftar yang dibuka langsung (shortcut app "Jamaah", kedalaman 0) dulu membuat layar edit
// ikut berkedalaman 0: Kembali mengganti ke daftar alih-alih mundur, meninggalkan entri
// daftar kembar yang membuat satu tekan back berikutnya terasa mati.
test('entri overlay yang diganti layar tujuan dihitung satu langkah di atas halamannya', () => {
  installFakeHistory('/dashboard/jamaah');
  window.history.pushState({ ...window.history.state, __overlay: 'overlay-abc-1' }, '', '/dashboard/jamaah');
  replaceAppState({}, '/dashboard/jamaah/edit/7');
  assert.equal(canGoBackInApp(), true, 'daftar jamaah masih ada di bawah layar edit');
  assert.equal(window.history.state.__overlay, undefined, 'penanda overlay tidak terbawa');
  replaceAppState({}, '/dashboard/jamaah/edit/7?tab=2');
  assert.equal(window.history.state.__appDepth, 1, 'replace berikutnya tidak menambah lagi');
});

test('replaceAppState mempertahankan kedalaman entri saat ini dan state tambahan', () => {
  installFakeHistory('/dashboard');
  pushAppState({ tab: 'teras' }, '/dashboard/teras');
  replaceAppState({ tab: 'teras', terasFromFeed: true }, '/dashboard/teras/post/1');
  assert.equal(canGoBackInApp(), true);
  assert.equal(window.history.state.terasFromFeed, true);
  assert.equal(window.history.state.tab, 'teras');
});
