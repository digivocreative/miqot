// Gerbang callout sticker: muncul lagi tiap 4 jam, berhenti setelah 10 kali
// dijawab lewat tombolnya.
//
// Diuji sebagai fungsi murni karena inilah bagian yang paling mudah salah
// diam-diam: salah tanda pada perbandingan waktu atau salah batas pada
// hitungan tidak menimbulkan error apa pun — callout-nya cuma tidak pernah
// muncul lagi, atau muncul terus, dan tidak ada yang tahu sampai ada yang
// mengeluh berminggu-minggu kemudian.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  PROMO_INTERVAL_MS, PROMO_MAX_DISMISSALS,
  promoStateAfterDismiss, readPromoState, serializePromoState, shouldShowPromo,
} from '../src/lib/stickerPromoGate.js';

const NOW = 1_800_000_000_000;

test('agent baru langsung dapat callout', () => {
  assert.equal(shouldShowPromo(readPromoState(null), NOW), true);
});

test('setelah ditutup, callout diam sampai 4 jam lewat', () => {
  const s = promoStateAfterDismiss(readPromoState(null), NOW, true);
  assert.equal(shouldShowPromo(s, NOW), false);
  assert.equal(shouldShowPromo(s, NOW + PROMO_INTERVAL_MS - 1000), false, 'muncul sebelum 4 jam');
  assert.equal(shouldShowPromo(s, NOW + PROMO_INTERVAL_MS), true, 'tidak muncul tepat di 4 jam');
});

test('berhenti selamanya setelah 10 kali dijawab lewat tombol', () => {
  let s = readPromoState(null);
  let t = NOW;
  for (let i = 0; i < PROMO_MAX_DISMISSALS; i++) {
    assert.equal(shouldShowPromo(s, t), true, `putaran ${i + 1} seharusnya masih muncul`);
    s = promoStateAfterDismiss(s, t, true);
    t += PROMO_INTERVAL_MS;
  }
  assert.equal(s.dismissals, PROMO_MAX_DISMISSALS);
  assert.equal(shouldShowPromo(s, t), false, 'masih muncul padahal sudah 10 kali dijawab');
  assert.equal(shouldShowPromo(s, t + PROMO_INTERVAL_MS * 1000), false, 'muncul lagi setelah lama');
});

test('membuka baris tanpa menyentuh tombol callout menunda, tapi tidak menghitung', () => {
  let s = readPromoState(null);
  for (let i = 0; i < 50; i++) s = promoStateAfterDismiss(s, NOW + i, false);
  assert.equal(s.dismissals, 0, 'klik baris ikut terhitung');
  assert.equal(shouldShowPromo(s, NOW + 60), false, 'tidak menunda sama sekali');
  assert.equal(shouldShowPromo(s, NOW + 50 + PROMO_INTERVAL_MS), true, 'tidak pernah muncul lagi');
});

test('jam perangkat yang sempat maju tidak menyandera callout', () => {
  const s = { dismissals: 1, lastAt: NOW + PROMO_INTERVAL_MS * 100 };
  assert.equal(shouldShowPromo(s, NOW), true, 'stempel masa depan menahan callout');
});

test('data rusak atau kosong diperlakukan sebagai belum pernah', () => {
  for (const raw of [null, undefined, '', '{', 'null', '"x"', '{"dismissals":"banyak"}']) {
    const s = readPromoState(raw);
    assert.deepEqual(s, { dismissals: 0, lastAt: 0 }, `gagal untuk ${JSON.stringify(raw)}`);
  }
});

test('nilai tidak masuk akal dinormalkan, bukan dipercaya apa adanya', () => {
  assert.deepEqual(readPromoState('{"dismissals":-5,"lastAt":null}'), { dismissals: 0, lastAt: 0 });
  assert.deepEqual(readPromoState('{"dismissals":3.7,"lastAt":12}'), { dismissals: 3, lastAt: 12 });
});

test('bolak-balik lewat penyimpanan tidak mengubah keadaan', () => {
  const s = promoStateAfterDismiss(readPromoState(null), NOW, true);
  assert.deepEqual(readPromoState(serializePromoState(s)), s);
});
