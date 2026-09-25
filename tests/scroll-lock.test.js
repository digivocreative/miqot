import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTs } from './fixtures/load-ts.js';

/**
 * lockDocumentScroll mengunci gulir halaman di balik overlay layar penuh TANPA
 * mengubah lebar viewport. Latar belakangnya ada di kepala src/lib/scrollLock.ts
 * dan tests/jadwal-rail-gallery-scroll-lock.browser.test.js (bug aslinya).
 *
 * DOM-nya palsu dan minimal: yang diuji keputusan tiap listener (cegah atau
 * loloskan), bukan perambatan event peramban — itu bagian tes browser.
 */
const { documentScrollbarWidth, lockDocumentScroll } = await loadTs('src/lib/scrollLock.ts');

function fakeWindow({ innerWidth = 1440, clientWidth = 1434, bodyOverflow = '' } = {}) {
  const listeners = new Map();
  const win = {
    innerWidth,
    document: {
      documentElement: { clientWidth, nodeType: 1 },
      body: { style: { overflow: bodyOverflow }, nodeType: 1 },
    },
    getComputedStyle: (el) => el.__style ?? { overflowX: 'visible', overflowY: 'visible' },
    addEventListener(type, fn, opts) {
      listeners.set(type, { fn, opts });
    },
    removeEventListener(type, fn) {
      if (listeners.get(type)?.fn === fn) listeners.delete(type);
    },
  };
  return { win, listeners };
}

function el({ tagName = 'DIV', parent = null, style, scroll = {}, attrs = {}, editable = false } = {}) {
  return {
    nodeType: 1,
    tagName,
    parentElement: parent,
    isContentEditable: editable,
    __style: style,
    scrollLeft: 0,
    scrollTop: 0,
    scrollWidth: 0,
    scrollHeight: 0,
    clientWidth: 0,
    clientHeight: 0,
    ...scroll,
    getAttribute: (name) => attrs[name] ?? null,
  };
}

function fire(listeners, type, props) {
  const entry = listeners.get(type);
  assert.ok(entry, `tidak ada listener ${type}`);
  const event = {
    cancelable: true,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    ...props,
  };
  entry.fn(event);
  return event.defaultPrevented;
}

// Galeri: dialog → strip thumbnail yang bisa digeser mendatar (masih ada ruang ke kanan).
const dialog = el();
const strip = el({
  parent: dialog,
  style: { overflowX: 'auto', overflowY: 'hidden' },
  scroll: { scrollWidth: 900, clientWidth: 400, scrollLeft: 100 },
});
const thumb = el({ tagName: 'BUTTON', parent: strip });
const closeButton = el({ tagName: 'BUTTON', parent: dialog });

test('scrollbar overlay (lebar 0): overflow hidden dipakai, tanpa listener', () => {
  const { win, listeners } = fakeWindow({ innerWidth: 390, clientWidth: 390 });
  const release = lockDocumentScroll(win);
  assert.equal(win.document.body.style.overflow, 'hidden');
  assert.equal(listeners.size, 0);
  release();
  assert.equal(win.document.body.style.overflow, '');
});

test('scrollbar overlay: nilai overflow sebelumnya dikembalikan apa adanya (kunci bertumpuk)', () => {
  const { win } = fakeWindow({ innerWidth: 390, clientWidth: 390, bodyOverflow: 'hidden' });
  const release = lockDocumentScroll(win);
  release();
  assert.equal(win.document.body.style.overflow, 'hidden');
});

test('scrollbar memakan lebar: overflow TIDAK disentuh — viewport tidak boleh melebar', () => {
  const { win, listeners } = fakeWindow();
  const release = lockDocumentScroll(win);
  assert.equal(win.document.body.style.overflow, '');
  assert.deepEqual([...listeners.keys()].sort(), ['keydown', 'touchmove', 'touchstart', 'wheel']);
  // passive: false wajib — listener pasif tidak bisa mencegah gulir.
  assert.equal(listeners.get('wheel').opts.passive, false);
  assert.equal(listeners.get('touchmove').opts.passive, false);
  release();
  assert.equal(listeners.size, 0, 'listener bocor sesudah kunci dilepas');
});

test('roda: dicegah di atas elemen yang tak bisa digulir', () => {
  const { win, listeners } = fakeWindow();
  lockDocumentScroll(win);
  assert.equal(fire(listeners, 'wheel', { target: closeButton, deltaX: 0, deltaY: 120 }), true);
  // Roda di atas scrollbar halaman sendiri: target = <html>.
  assert.equal(fire(listeners, 'wheel', { target: win.document.documentElement, deltaX: 0, deltaY: 120 }), true);
});

test('roda: strip thumbnail tetap bisa digeser mendatar selama masih ada ruang', () => {
  const { win, listeners } = fakeWindow();
  lockDocumentScroll(win);
  assert.equal(fire(listeners, 'wheel', { target: thumb, deltaX: 80, deltaY: 4 }), false);
  assert.equal(fire(listeners, 'wheel', { target: thumb, deltaX: -80, deltaY: 0 }), false);
  // Roda tegak di atas strip mendatar = akan merambat ke halaman → cegah.
  assert.equal(fire(listeners, 'wheel', { target: thumb, deltaX: 0, deltaY: 120 }), true);
});

test('roda: strip yang mentok di ujung tidak boleh meneruskan gulir ke halaman', () => {
  const mentok = el({
    parent: dialog,
    style: { overflowX: 'auto', overflowY: 'hidden' },
    scroll: { scrollWidth: 900, clientWidth: 400, scrollLeft: 500 },
  });
  const { win, listeners } = fakeWindow();
  lockDocumentScroll(win);
  assert.equal(fire(listeners, 'wheel', { target: mentok, deltaX: 80, deltaY: 0 }), true);
  assert.equal(fire(listeners, 'wheel', { target: mentok, deltaX: -80, deltaY: 0 }), false);
});

test('sheet: badan yang bisa digulir tegak tetap bergulir sampai mentok, kepalanya tidak', () => {
  // Pola sheet Birthday/Hotel/Teras/dst.: kepala tetap + badan overflow-y-auto.
  const sheet = el();
  const header = el({ parent: sheet });
  const body = el({
    parent: sheet,
    style: { overflowX: 'hidden', overflowY: 'auto' },
    scroll: { scrollHeight: 1200, clientHeight: 500, scrollTop: 0 },
  });
  const row = el({ tagName: 'BUTTON', parent: body });
  const { win, listeners } = fakeWindow();
  lockDocumentScroll(win);

  assert.equal(fire(listeners, 'wheel', { target: row, deltaX: 0, deltaY: 120 }), false);
  assert.equal(fire(listeners, 'keydown', { target: row, key: 'ArrowDown' }), false);
  assert.equal(fire(listeners, 'wheel', { target: header, deltaX: 0, deltaY: 120 }), true);
  // Sudah di puncak: gulir ke atas akan merambat ke halaman.
  assert.equal(fire(listeners, 'wheel', { target: row, deltaX: 0, deltaY: -120 }), true);

  body.scrollTop = 700;
  assert.equal(fire(listeners, 'wheel', { target: row, deltaX: 0, deltaY: 120 }), true);
  assert.equal(fire(listeners, 'keydown', { target: row, key: 'End' }), true);
  assert.equal(fire(listeners, 'wheel', { target: row, deltaX: 0, deltaY: -120 }), false);
});

test('documentScrollbarWidth: selisih innerWidth dengan lebar klien <html>', () => {
  assert.equal(documentScrollbarWidth(fakeWindow().win), 6);
  assert.equal(documentScrollbarWidth(fakeWindow({ innerWidth: 390, clientWidth: 390 }).win), 0);
});

test('roda + Ctrl (pinch trackpad / zoom peramban) dibiarkan', () => {
  const { win, listeners } = fakeWindow();
  lockDocumentScroll(win);
  assert.equal(fire(listeners, 'wheel', { target: closeButton, deltaX: 0, deltaY: 30, ctrlKey: true }), false);
});

test('tombol gulir dicegah; spasi di tombol, isian, dan tombol lain dibiarkan', () => {
  const { win, listeners } = fakeWindow();
  lockDocumentScroll(win);
  for (const key of ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End']) {
    assert.equal(fire(listeners, 'keydown', { target: closeButton, key }), true, key);
  }
  assert.equal(fire(listeners, 'keydown', { target: dialog, key: ' ' }), true, 'spasi di dialog');
  // Spasi di tombol = mengaktifkan tombolnya, bukan menggulir.
  assert.equal(fire(listeners, 'keydown', { target: closeButton, key: ' ' }), false);
  // Slider Plyr (input range) memakai panah untuk seek/volume.
  const range = el({ tagName: 'INPUT', parent: dialog });
  assert.equal(fire(listeners, 'keydown', { target: range, key: 'ArrowUp' }), false);
  assert.equal(fire(listeners, 'keydown', { target: closeButton, key: 'Escape' }), false);
  assert.equal(fire(listeners, 'keydown', { target: closeButton, key: 'ArrowLeft' }), false);
});

test('tombol yang sudah dicegah pemilik lain tidak disentuh lagi', () => {
  const { win, listeners } = fakeWindow();
  lockDocumentScroll(win);
  const entry = listeners.get('keydown');
  let calls = 0;
  entry.fn({ target: closeButton, key: 'ArrowDown', defaultPrevented: true, preventDefault: () => { calls += 1; } });
  assert.equal(calls, 0);
});

test('sentuh: geser tegak di galeri dicegah, geser mendatar di strip dibiarkan', () => {
  const { win, listeners } = fakeWindow();
  lockDocumentScroll(win);
  fire(listeners, 'touchstart', { target: closeButton, touches: [{ clientX: 200, clientY: 400 }] });
  assert.equal(fire(listeners, 'touchmove', { target: closeButton, touches: [{ clientX: 200, clientY: 300 }] }), true);

  fire(listeners, 'touchstart', { target: thumb, touches: [{ clientX: 300, clientY: 800 }] });
  // Jari ke kiri = isi bergerak ke kanan (delta positif), sama seperti roda.
  assert.equal(fire(listeners, 'touchmove', { target: thumb, touches: [{ clientX: 220, clientY: 802 }] }), false);
});

test('sentuh: dua jari (pinch) dibiarkan', () => {
  const { win, listeners } = fakeWindow();
  lockDocumentScroll(win);
  fire(listeners, 'touchstart', { target: closeButton, touches: [{ clientX: 100, clientY: 100 }, { clientX: 300, clientY: 300 }] });
  assert.equal(
    fire(listeners, 'touchmove', { target: closeButton, touches: [{ clientX: 90, clientY: 90 }, { clientX: 310, clientY: 310 }] }),
    false,
  );
});
