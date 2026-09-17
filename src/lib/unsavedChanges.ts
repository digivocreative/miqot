// Registry form yang belum disimpan. Dipakai untuk (1) peringatan beforeunload selama ada
// perubahan tertunda dan (2) konfirmasi sebelum "Muat ulang" versi baru. Tanpa React
// (hook-nya di src/hooks/useUnsavedChanges.ts) supaya bisa diuji node:test.

const dirtyKeys = new Set<string>();
let guardAttached = false;

function onBeforeUnload(event: BeforeUnloadEvent) {
  event.preventDefault();
  // Chrome lama butuh returnValue terisi agar dialog muncul.
  event.returnValue = '';
}

function syncGuard() {
  if (typeof window === 'undefined') return;
  if (dirtyKeys.size > 0 && !guardAttached) {
    window.addEventListener('beforeunload', onBeforeUnload);
    guardAttached = true;
  } else if (dirtyKeys.size === 0 && guardAttached) {
    window.removeEventListener('beforeunload', onBeforeUnload);
    guardAttached = false;
  }
}

export function setUnsaved(key: string, dirty: boolean): void {
  if (dirty) dirtyKeys.add(key);
  else dirtyKeys.delete(key);
  syncGuard();
}

export function hasUnsavedChanges(): boolean {
  return dirtyKeys.size > 0;
}

/** Lepas peringatan beforeunload sebelum muat ulang yang sudah dikonfirmasi pengguna. */
export function suppressUnloadGuard(): void {
  if (typeof window === 'undefined' || !guardAttached) return;
  window.removeEventListener('beforeunload', onBeforeUnload);
  guardAttached = false;
}
