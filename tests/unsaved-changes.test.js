import { test } from 'node:test';
import assert from 'node:assert/strict';

// Peringatan "beforeunload" hanya terpasang selama ada form yang belum disimpan, dan bisa
// dilepas sementara saat muat ulang dilakukan dengan sengaja (tombol "Muat ulang" versi baru)
// supaya pengguna tidak ditanya dua kali.
const listeners = new Map();
globalThis.window = {
  addEventListener: (type, fn) => listeners.set(type, fn),
  removeEventListener: (type, fn) => { if (listeners.get(type) === fn) listeners.delete(type); },
};

const { setUnsaved, hasUnsavedChanges, suppressUnloadGuard } = await import('../src/lib/unsavedChanges.ts');

test('registry form kotor & penjaga beforeunload', () => {
  assert.equal(hasUnsavedChanges(), false);
  assert.equal(listeners.has('beforeunload'), false);

  setUnsaved('jamaah-edit', true);
  setUnsaved('profil', true);
  assert.equal(hasUnsavedChanges(), true);
  assert.equal(listeners.has('beforeunload'), true);

  const event = { defaultPrevented: false, returnValue: undefined, preventDefault() { this.defaultPrevented = true; } };
  listeners.get('beforeunload')(event);
  assert.equal(event.defaultPrevented, true);

  setUnsaved('jamaah-edit', false);
  assert.equal(hasUnsavedChanges(), true, 'masih ada form kotor lain');
  assert.equal(listeners.has('beforeunload'), true);

  setUnsaved('profil', false);
  assert.equal(hasUnsavedChanges(), false);
  assert.equal(listeners.has('beforeunload'), false);
});

test('suppressUnloadGuard melepas peringatan untuk muat ulang yang disengaja', () => {
  setUnsaved('landing-editor', true);
  assert.equal(listeners.has('beforeunload'), true);
  suppressUnloadGuard();
  assert.equal(listeners.has('beforeunload'), false);
  // Tetap tercatat kotor (konfirmasi sudah ditanyakan oleh pemanggil).
  assert.equal(hasUnsavedChanges(), true);
  setUnsaved('landing-editor', false);
});
