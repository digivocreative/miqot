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

test('replaceAppState mempertahankan kedalaman entri saat ini dan state tambahan', () => {
  installFakeHistory('/dashboard');
  pushAppState({ tab: 'teras' }, '/dashboard/teras');
  replaceAppState({ tab: 'teras', terasFromFeed: true }, '/dashboard/teras/post/1');
  assert.equal(canGoBackInApp(), true);
  assert.equal(window.history.state.terasFromFeed, true);
  assert.equal(window.history.state.tab, 'teras');
});
