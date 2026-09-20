/**
 * Keputusan gestur tarik-untuk-segarkan (src/lib/pwa/pull-to-refresh.js).
 *
 * Yang dijaga di sini adalah hal-hal yang TIDAK terlihat saat mencoba sendiri di
 * satu HP: bahwa geser mendatar tidak pernah menang jadi tarikan, bahwa jari yang
 * naik tidak bisa berubah pikiran jadi tarikan, dan bahwa tarikan mentah yang
 * dibutuhkan tetap sepanjang PTR native (±111px) — angka yang gampang tergeser
 * diam-diam saat orang mengutak-atik redaman.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PULL_MAX,
  PULL_START_SLOP,
  PULL_TRIGGER,
  classifyGesture,
  dampPull,
  isTypingTarget,
} from '../src/lib/pwa/pull-to-refresh.js';

/** Tarikan mentah terkecil yang menghasilkan jarak tersaji >= PULL_TRIGGER. */
function rawNeededToArm() {
  for (let raw = 0; raw <= 1000; raw += 0.5) {
    if (dampPull(raw) >= PULL_TRIGGER) return raw;
  }
  return Infinity;
}

test('redaman: nol di bawah nol, monoton naik, tak pernah melewati asimtot', () => {
  assert.equal(dampPull(0), 0);
  assert.equal(dampPull(-40), 0);

  let previous = 0;
  for (let raw = 1; raw <= 2000; raw += 7) {
    const current = dampPull(raw);
    assert.ok(current > previous, `jarak harus naik di raw=${raw}`);
    assert.ok(current < PULL_MAX, `jarak harus tetap di bawah ${PULL_MAX} di raw=${raw}`);
    previous = current;
  }
});

test('tarikan mentah untuk mengunci refresh ±111px — sepadan PTR native, bukan sentuhan tak sengaja', () => {
  const raw = rawNeededToArm();
  assert.ok(raw > 90 && raw < 130, `butuh ${raw}px mentah; di luar jendela 90–130px yang terasa native`);
});

test('gestur mendatar tidak pernah jadi tarikan — carousel kartu yang menang', () => {
  assert.equal(classifyGesture(40, 12), 'abandon');
  assert.equal(classifyGesture(-40, 12), 'abandon');
  // Persis diagonal 45° pun diserahkan ke carousel: ax >= ay.
  assert.equal(classifyGesture(30, 30), 'abandon');
});

test('jari yang naik tidak boleh berubah pikiran jadi tarikan', () => {
  assert.equal(classifyGesture(0, -30), 'abandon');
  assert.equal(classifyGesture(2, -PULL_START_SLOP), 'abandon');
});

test('gerakan di bawah slop belum diputuskan — verdict-nya tertunda, bukan dibuang', () => {
  assert.equal(classifyGesture(0, 0), 'pending');
  assert.equal(classifyGesture(3, 5), 'pending');
  assert.equal(classifyGesture(-5, -4), 'pending');
});

test('turun tegak melewati slop = tarikan', () => {
  assert.equal(classifyGesture(0, PULL_START_SLOP), 'pull');
  assert.equal(classifyGesture(6, 40), 'pull');
});

test('sedang mengetik = bukan titik mulai tarikan', () => {
  assert.equal(isTypingTarget(null), false);
  assert.equal(isTypingTarget({ tagName: 'DIV' }), false);
  assert.equal(isTypingTarget({ tagName: 'INPUT' }), true);
  assert.equal(isTypingTarget({ tagName: 'TEXTAREA' }), true);
  assert.equal(isTypingTarget({ tagName: 'DIV', isContentEditable: true }), true);
});
