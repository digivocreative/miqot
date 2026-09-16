import { test } from 'node:test';
import assert from 'node:assert/strict';

import { getLowestPrice } from '../lib/notifier-lowest-price.js';

test('getLowestPrice: No-bed (anak tanpa kasur) tidak jadi harga mulai', () => {
  // JBU1618 (Sep 2026): notifikasi dulu bilang 26,7 jt padahal kartu 29,7 jt
  const harga = {
    HEMAT: { Quard: '29700000', Double: '32200000', Infant: '13900000', 'No-bed': '26700000', Triple: '30700000' },
  };
  assert.deepEqual(getLowestPrice(harga), { lowest: 29700000, roomType: 'Quard', paketType: 'HEMAT' });
});

test('getLowestPrice: Infant, Single, dan tipe kamar tak dikenal diabaikan', () => {
  const harga = { UHUD: { Double: '38700000', Infant: '13900000', Single: '9000000', Kids: '1000000' } };
  assert.deepEqual(getLowestPrice(harga), { lowest: 38700000, roomType: 'Double', paketType: 'UHUD' });
});

test('getLowestPrice: minimum lintas tier, abaikan N/A dan nol', () => {
  const harga = {
    RAHMAH: { Quard: '39900000', Triple: '42700000', Double: '47300000' },
    UHUD: { Quard: 'N/A', Triple: '35700000', Double: '0' },
  };
  assert.deepEqual(getLowestPrice(harga), { lowest: 35700000, roomType: 'Triple', paketType: 'UHUD' });
});

test('getLowestPrice: tanpa harga terpakai → null', () => {
  const empty = { lowest: null, roomType: '', paketType: '' };
  assert.deepEqual(getLowestPrice(null), empty);
  assert.deepEqual(getLowestPrice({ HEMAT: { Infant: '13900000', 'No-bed': '26700000' } }), empty);
});
