import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { loadTs } from './fixtures/load-ts.js';

/**
 * Ambang "layar lebar" adalah kontrak antara dua berkas: media query di
 * src/lib/wideLayout.ts dan breakpoint --jadwal-col-w di src/index.css. Kalau
 * keduanya berbeda, rail tampil (CSS) tapi tak pernah diisi (JS) — atau
 * sebaliknya. Tes terakhir di bawah menjaga keduanya tetap satu angka.
 */
const { WIDE_MEDIA_QUERY, subscribeWide } = await loadTs('src/lib/wideLayout.ts');

/** MediaQueryList palsu — cukup untuk menguji langganan tanpa DOM. */
function fakeMql(matches = false) {
  const listeners = new Set();
  return {
    matches,
    addEventListener: (_type, fn) => listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
    emit(next) {
      this.matches = next;
      listeners.forEach((fn) => fn({ matches: next }));
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

test('ambang lebar tepat 1024px — 1024 sendiri ikut dihitung lebar', () => {
  assert.equal(WIDE_MEDIA_QUERY, '(min-width: 1024px)');
});

test('perubahan media query meneruskan nilai baru, berurutan', () => {
  const mql = fakeMql(false);
  const seen = [];
  subscribeWide(mql, () => seen.push(mql.matches));
  mql.emit(true);
  mql.emit(false);
  assert.deepEqual(seen, [true, false]);
});

test('berhenti berlangganan melepas listener — tidak ada kebocoran saat kartu berganti', () => {
  const mql = fakeMql(false);
  const stop = subscribeWide(mql, () => {});
  assert.equal(mql.listenerCount, 1);
  stop();
  assert.equal(mql.listenerCount, 0);
});

test('ambang JS sama dengan breakpoint pertama --jadwal-col-w di CSS', () => {
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  const widths = [...css.matchAll(/@media\s*\(min-width:\s*(\d+)px\)\s*\{\s*:root\s*\{([^}]*)\}/g)]
    .filter(([, , body]) => body.includes('--jadwal-col-w'))
    .map(([, w]) => Number(w));
  assert.ok(widths.length > 0, 'tidak ada breakpoint yang mengubah --jadwal-col-w');
  const firstJadwalBreakpoint = Math.min(...widths);
  assert.equal(WIDE_MEDIA_QUERY, `(min-width: ${firstJadwalBreakpoint}px)`);
});
