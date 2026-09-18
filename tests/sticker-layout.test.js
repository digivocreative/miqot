// Geometri sticker: satu-satunya sumber posisi & ukuran, dipakai BERSAMA oleh
// pratinjau DOM di studio dan komposit kanvas saat menyimpan.
//
// Yang dijaga tes ini bukan rumusnya, melainkan invariannya: placement yang
// sama harus menghasilkan hasil proporsional identik di setiap ukuran kanvas
// yang beredar (brosur paket punya EMPAT, Brosur Jadwal satu lagi, panggung
// editor ukuran kesekian). Begitu ada satu jalur yang diam-diam memakai piksel,
// pratinjau dan berkas yang terkirim mulai berbeda — dan itu tidak kelihatan
// sampai ada agent yang mengeluh.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  STICKER_W_DEFAULT, STICKER_W_MAX, STICKER_W_MIN,
  clampPlacement, defaultPlacement, placementToRect, rectToPlacement,
} from '../src/lib/stickerLayout.js';

// Empat ukuran brosur paket yang beredar + kanvas Brosur Jadwal.
const CANVASES = [
  [1080, 1440], [1081, 1440], [1200, 1600], [1279, 1600], [1080, 1620],
];

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('placement default di tengah dan selebar STICKER_W_DEFAULT', () => {
  const p = defaultPlacement('sold-out', 0);
  assert.equal(p.stickerId, 'sold-out');
  assert.equal(p.w, STICKER_W_DEFAULT);
  assert.equal(p.cx, 0.5);
  assert.equal(p.cy, 0.5);
});

test('sticker kedua bergeser dari yang pertama — tidak menimpa persis', () => {
  const a = defaultPlacement('sold-out', 0);
  const b = defaultPlacement('best-seller', 1);
  assert.ok(a.cx !== b.cx || a.cy !== b.cy, 'placement index 1 identik dengan index 0');
});

test('pergeseran default berputar, tidak lari keluar gambar', () => {
  for (let i = 0; i < 12; i++) {
    const p = defaultPlacement('x', i);
    assert.ok(p.cx > 0 && p.cx < 1, `cx keluar rentang di index ${i}: ${p.cx}`);
    assert.ok(p.cy > 0 && p.cy < 1, `cy keluar rentang di index ${i}: ${p.cy}`);
  }
});

test('lebar di-clamp ke rentang yang diizinkan', () => {
  assert.equal(clampPlacement({ stickerId: 'x', cx: 0.5, cy: 0.5, w: 5 }, 1, 0.75).w, STICKER_W_MAX);
  assert.equal(clampPlacement({ stickerId: 'x', cx: 0.5, cy: 0.5, w: 0.001 }, 1, 0.75).w, STICKER_W_MIN);
});

// Sticker WAJIB utuh di dalam brosur. Bagian yang menggantung di luar tepi tidak
// ikut terbakar ke berkas — kanvas dipotong di tepi gambar — jadi sticker yang
// boleh menggantung berarti yang dilihat agent bukan yang terkirim.
test('sticker tidak pernah bisa keluar dari brosur, dari arah mana pun', () => {
  const imageAspect = 1080 / 1440;
  for (const [cx, cy] of [[9, -9], [-9, 9], [0.5, 9], [-3, 0.5], [1.4, 1.4]]) {
    for (const w of [0.1, 0.3, 0.75, 1]) {
      const p = clampPlacement({ stickerId: 'x', cx, cy, w }, 1, imageAspect);
      const rect = placementToRect(p, 1, 1080, 1440);
      const where = `cx=${cx} cy=${cy} w=${w}`;
      assert.ok(rect.x >= -1e-6, `${where}: keluar kiri (${rect.x})`);
      assert.ok(rect.y >= -1e-6, `${where}: keluar atas (${rect.y})`);
      assert.ok(rect.x + rect.w <= 1080 + 1e-6, `${where}: keluar kanan (${rect.x + rect.w})`);
      assert.ok(rect.y + rect.h <= 1440 + 1e-6, `${where}: keluar bawah (${rect.y + rect.h})`);
    }
  }
});

test('sticker yang lebih besar dari gambarnya dipusatkan, bukan dijepit ke rentang terbalik', () => {
  // Gambar melebar (rasio 2): sticker persegi selebar penuh jadi LEBIH TINGGI
  // dari gambarnya, sehingga batas bawah clamp melewati batas atasnya.
  const p = clampPlacement({ stickerId: 'x', cx: 0.1, cy: 0.1, w: 1 }, 1, 2);
  assert.equal(p.cx, 0.5);
  assert.equal(p.cy, 0.5);
});

test('placement default sudah utuh di dalam brosur tanpa perlu dikoreksi', () => {
  const imageAspect = 1080 / 1440;
  for (let i = 0; i < 12; i++) {
    const p = clampPlacement(defaultPlacement('x', i), 1, imageAspect);
    const d = defaultPlacement('x', i);
    assert.ok(Math.abs(p.cx - d.cx) < 1e-9 && Math.abs(p.cy - d.cy) < 1e-9,
      `placement default index ${i} tergeser oleh clamp: ${d.cx},${d.cy} → ${p.cx},${p.cy}`);
  }
});

test('rasio sticker terjaga di semua ukuran kanvas — persegi tetap persegi', () => {
  for (const [w, h] of CANVASES) {
    const rect = placementToRect({ stickerId: 'x', cx: 0.5, cy: 0.5, w: 0.3 }, 1, w, h);
    assert.ok(near(rect.w, rect.h, 1e-6), `${w}x${h}: ${rect.w} != ${rect.h}`);
    assert.ok(near(rect.w, w * 0.3), `${w}x${h}: lebar ${rect.w} != 30% dari ${w}`);
  }
});

test('rasio non-persegi ikut dihormati', () => {
  const rect = placementToRect({ stickerId: 'x', cx: 0.5, cy: 0.5, w: 0.5 }, 2, 1000, 1000);
  assert.ok(near(rect.w, 500));
  assert.ok(near(rect.h, 250));
});

test('konversi piksel bolak-balik kembali ke nilai semula di semua kanvas', () => {
  const original = { stickerId: 'x', cx: 0.42, cy: 0.63, w: 0.27 };
  for (const [w, h] of CANVASES) {
    const rect = placementToRect(original, 1, w, h);
    const back = rectToPlacement({ ...rect, stickerId: 'x' }, w, h);
    assert.ok(near(back.cx, original.cx, 1e-9), `${w}x${h} cx: ${back.cx}`);
    assert.ok(near(back.cy, original.cy, 1e-9), `${w}x${h} cy: ${back.cy}`);
    assert.ok(near(back.w, original.w, 1e-9), `${w}x${h} w: ${back.w}`);
  }
});

test('placement yang sama menghasilkan rect proporsional identik di kanvas berbeda', () => {
  const p = { stickerId: 'x', cx: 0.25, cy: 0.75, w: 0.4 };
  const a = placementToRect(p, 1, 1080, 1440);
  const b = placementToRect(p, 1, 1279, 1600);
  assert.ok(near(a.x / 1080, b.x / 1279, 1e-9));
  assert.ok(near(a.w / 1080, b.w / 1279, 1e-9));
});

// Panggung editor jauh lebih kecil dari kanvas ekspor. Kalau invarian ini
// pecah, yang digeser agent bukan lagi yang tergambar ke berkas.
test('panggung editor kecil dan kanvas ekspor besar sepakat secara proporsional', () => {
  const p = { stickerId: 'x', cx: 0.33, cy: 0.66, w: 0.45 };
  const stage = placementToRect(p, 1, 324, 432);
  const exported = placementToRect(p, 1, 1080, 1440);
  assert.ok(near(stage.x / 324, exported.x / 1080, 1e-9));
  assert.ok(near(stage.y / 432, exported.y / 1440, 1e-9));
  assert.ok(near(stage.w / 324, exported.w / 1080, 1e-9));
});
