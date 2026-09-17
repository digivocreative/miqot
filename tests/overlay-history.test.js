import { test } from 'node:test';
import assert from 'node:assert/strict';

// Riwayat overlay (modal/sheet) yang ditutup gestur back. Temuan 5D (Chromium): menutup
// overlay A lewat tombol lalu membuka overlay B di handler yang sama → history.back() milik A
// selesai SETELAH B menambah entri, sehingga B ikut tertutup. Menutup induk + anak dalam satu
// render meninggalkan satu tekan back yang "kosong".

function installFakeBrowser() {
  const listeners = new Map();
  const entries = [{ state: null, url: 'http://x.test/bagas' }];
  let index = 0;
  const calls = [];
  const fire = () => {
    for (const fn of [...(listeners.get('popstate') || [])]) fn({ type: 'popstate' });
  };
  globalThis.window = {
    location: { get href() { return entries[index].url; } },
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) || []).filter((f) => f !== fn)); },
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
    history: {
      get state() { return entries[index].state; },
      pushState(state, _t, url) { entries.splice(index + 1); entries.push({ state, url }); index += 1; calls.push('push'); },
      replaceState(state, _t, url) { entries[index] = { state, url: url ?? entries[index].url }; },
      // Traversal asinkron seperti peramban: popstate menyusul, tidak seketika.
      go(delta) { calls.push(`go(${delta})`); setTimeout(() => { index = Math.max(0, index + delta); fire(); }, 15); },
      back() { this.go(-1); },
    },
  };
  return { calls, entries: () => entries.slice(0, index + 1), top: () => entries[index] };
}

const tick = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));
const { openOverlayEntry, overlayStackSize } = await import('../src/lib/overlayHistory.ts');

test('back menutup overlay dan membuang entrinya', async () => {
  const browser = installFakeBrowser();
  let closed = 0;
  openOverlayEntry(() => { closed += 1; });
  await tick();
  assert.equal(browser.entries().length, 2);
  window.history.back();
  await tick();
  assert.equal(closed, 1);
  assert.equal(overlayStackSize(), 0);
});

test('ditutup lewat tombol → entri overlay dibuang dengan satu traversal', async () => {
  const browser = installFakeBrowser();
  let closed = 0;
  const release = openOverlayEntry(() => { closed += 1; });
  await tick();
  release();
  await tick();
  assert.deepEqual(browser.calls, ['push', 'go(-1)']);
  assert.equal(browser.entries().length, 1);
  assert.equal(closed, 0, 'bukan ditutup oleh back');
});

test('tutup A lalu buka B di handler yang sama: B tetap terbuka', async () => {
  const browser = installFakeBrowser();
  let closedB = 0;
  const releaseA = openOverlayEntry(() => {});
  await tick();
  // Satu handler klik: A dilepas, B dibuka (render yang sama).
  releaseA();
  openOverlayEntry(() => { closedB += 1; });
  await tick(80);
  assert.equal(closedB, 0, 'traversal milik A tidak boleh menutup B');
  assert.equal(browser.entries().length, 2, 'entri B ada di puncak');
  assert.equal(overlayStackSize(), 1);
});

test('induk + anak ditutup bersamaan (urutan apa pun) → satu go(-2), tanpa back kosong', async () => {
  for (const order of ['child-first', 'parent-first']) {
    const browser = installFakeBrowser();
    const releaseParent = openOverlayEntry(() => {});
    await tick();
    const releaseChild = openOverlayEntry(() => {});
    await tick();
    assert.equal(browser.entries().length, 3);
    if (order === 'child-first') { releaseChild(); releaseParent(); } else { releaseParent(); releaseChild(); }
    await tick();
    assert.ok(browser.calls.includes('go(-2)'), `${order}: ${browser.calls.join(',')}`);
    assert.equal(browser.entries().length, 1, order);
    assert.equal(overlayStackSize(), 0, order);
  }
});

test('dibuka lalu dilepas sebelum tick (StrictMode dev) → tidak menyentuh riwayat', async () => {
  const browser = installFakeBrowser();
  const release = openOverlayEntry(() => {});
  release();
  await tick();
  assert.deepEqual(browser.calls, []);
});

// Temuan 5A: token `overlay-${seq}` mulai lagi dari 1 setiap halaman dimuat. Setelah reload
// di atas entri overlay lama, overlay pertama berikutnya memakai token yang sama dengan entri
// sisa itu → back pertama "kosong". Token wajib unik lintas muat halaman.
test('token overlay unik lintas muat halaman (modul dimuat ulang)', async () => {
  installFakeBrowser();
  const first = await import('../src/lib/overlayHistory.ts?load=1');
  first.openOverlayEntry(() => {});
  await tick();
  const firstToken = window.history.state.__overlay;

  // "Reload": halaman baru, riwayat masih memuat entri overlay lama di puncak.
  const browser = installFakeBrowser();
  window.history.replaceState({ __overlay: firstToken }, '', 'http://x.test/bagas');
  const second = await import('../src/lib/overlayHistory.ts?load=2');
  let closed = 0;
  second.openOverlayEntry(() => { closed += 1; });
  await tick();
  assert.notEqual(window.history.state.__overlay, firstToken);
  window.history.back();
  await tick();
  assert.equal(closed, 1, 'back pertama harus menutup overlay baru');
  assert.equal(browser.entries().length, 1);
});
