import { test } from 'node:test';
import assert from 'node:assert/strict';

// Audit 2026-09-17: tidak ada ajakan pasang app sama sekali; di iOS 26 "Add to Home Screen"
// tersembunyi 4 ketukan. Event beforeinstallprompt harus ditangkap sedini mungkin (sebelum
// React mount) dan hanya ditahan di dashboard — halaman publik tetap memakai UI bawaan peramban.

const { detectInstallPlatform, createInstallPrompt } = await import('../src/lib/pwa/installPrompt.ts');

test('deteksi platform untuk instruksi pasang', () => {
  assert.equal(detectInstallPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15', 5), 'ios');
  // iPadOS menyamar sebagai Macintosh tapi punya layar sentuh.
  assert.equal(detectInstallPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15', 5), 'ios');
  assert.equal(detectInstallPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0 Safari/537.36', 0), 'desktop');
  assert.equal(detectInstallPlatform('Mozilla/5.0 (Linux; Android 14; SM-A155F) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36', 5), 'android');
});

function fakeWindow(pathname) {
  const handlers = {};
  return {
    location: { pathname },
    addEventListener: (type, fn) => { handlers[type] = fn; },
    fire: (type, event) => handlers[type]?.(event),
  };
}

function fakePromptEvent(outcome) {
  return {
    prevented: false,
    preventDefault() { this.prevented = true; },
    prompted: 0,
    prompt() { this.prompted += 1; return Promise.resolve(); },
    userChoice: Promise.resolve({ outcome, platform: 'web' }),
  };
}

test('di dashboard event ditahan dan bisa dipicu dari kartu pasang', async () => {
  const win = fakeWindow('/dashboard');
  const store = createInstallPrompt(win);
  assert.equal(store.getState().canPrompt, false);
  const event = fakePromptEvent('accepted');
  win.fire('beforeinstallprompt', event);
  assert.equal(event.prevented, true);
  assert.equal(store.getState().canPrompt, true);
  const outcome = await store.promptInstall();
  assert.equal(outcome, 'accepted');
  assert.equal(event.prompted, 1);
  assert.equal(store.getState().canPrompt, false, 'event hanya bisa dipakai sekali');
  assert.equal(store.getState().installed, true);
});

test('di halaman publik event dibiarkan ke UI bawaan peramban', () => {
  const win = fakeWindow('/bagas');
  const store = createInstallPrompt(win);
  const event = fakePromptEvent('dismissed');
  win.fire('beforeinstallprompt', event);
  assert.equal(event.prevented, false);
  assert.equal(store.getState().canPrompt, true);
});

test('appinstalled menandai terpasang dan membuang event', async () => {
  const win = fakeWindow('/dashboard/jamaah');
  const store = createInstallPrompt(win);
  win.fire('beforeinstallprompt', fakePromptEvent('dismissed'));
  win.fire('appinstalled', {});
  assert.deepEqual({ canPrompt: store.getState().canPrompt, installed: store.getState().installed }, { canPrompt: false, installed: true });
  assert.equal(await store.promptInstall(), 'unavailable');
});
