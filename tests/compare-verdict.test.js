import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDistanceMeters,
  headlinePriceGap,
  priceWinner,
  hotelWinner,
  seatWinner,
  buildCompareVerdict,
} from '../src/lib/compareVerdict.js';

// JBU1569 "HEMAT PLUS DUBAI 10HR" tier HEMAT lawan JBU1491 "REGULER 9HR" tier
// UHUD — pasangan nyata dari jadwal 1448. A lebih murah di ketiga tipe kamar,
// B hotelnya lebih tinggi bintang dan lebih dekat. Bentuk sisi sengaja sudah
// diresolusi pemanggil (bintang & jarak angka/teks jadi), supaya modul ini
// bebas dari lookup metadata hotel yang tinggal di berkas .ts.
const A = {
  prices: { Quard: 31200000, Triple: 32200000, Double: 34200000 },
  hotels: { mekkah: { stars: 4, distance: '±400m' }, madinah: { stars: 3, distance: '±200m' } },
  seatSisa: 26,
};
const B = {
  prices: { Quard: 33900000, Triple: 35700000, Double: 38700000 },
  hotels: { mekkah: { stars: 5, distance: '±300m' }, madinah: { stars: 4, distance: '±150m' } },
  seatSisa: 12,
};

test('parseDistanceMeters: km, koma desimal, dan format asing', () => {
  assert.equal(parseDistanceMeters('±400m'), 400);
  assert.equal(parseDistanceMeters('±150m dari Masjid Nabawi'), 150);
  assert.equal(parseDistanceMeters('±1,5 km'), 1500);
  assert.equal(parseDistanceMeters('1.5km'), 1500);
  assert.equal(parseDistanceMeters('300 meter'), 300);
  // Tak terbaca berarti TIDAK DIKETAHUI, bukan nol — kalau nol, hotel tanpa
  // data jarak akan selalu menang saat bintangnya seri.
  assert.equal(parseDistanceMeters('dekat masjid'), null);
  assert.equal(parseDistanceMeters(''), null);
  assert.equal(parseDistanceMeters(null), null);
});

test('headlinePriceGap: memakai kamar termurah, bukan selisih terbesar', () => {
  // Selisih Double 4,5 jt lebih besar, tapi yang ditawarkan agent harga Quad.
  assert.deepEqual(headlinePriceGap(A, B), { room: 'Quard', diff: 2700000, cheaper: 'a' });
});

test('headlinePriceGap: turun ke tipe berikutnya saat kamar termurah tak lengkap', () => {
  const a = { prices: { Quard: 0, Triple: 32200000, Double: 34200000 } };
  const b = { prices: { Quard: 33900000, Triple: 35700000, Double: 38700000 } };
  assert.deepEqual(headlinePriceGap(a, b), { room: 'Triple', diff: 3500000, cheaper: 'a' });
  assert.equal(headlinePriceGap({ prices: {} }, b), null);
  assert.equal(headlinePriceGap(null, null), null);
});

test('headlinePriceGap: harga sama dilaporkan apa adanya, bukan dicarikan tipe lain', () => {
  const a = { prices: { Quard: 31200000, Triple: 32200000 } };
  const b = { prices: { Quard: 31200000, Triple: 35700000 } };
  assert.deepEqual(headlinePriceGap(a, b), { room: 'Quard', diff: 0, cheaper: null });
});

test('priceWinner: sisi termurah di mayoritas tipe kamar', () => {
  assert.deepEqual(priceWinner(A, B), { side: 'a', wins: 3, total: 3 });
});

test('priceWinner: seri dan tanpa data sama-sama tak berpemenang', () => {
  const a = { prices: { Quard: 30000000, Triple: 40000000 } };
  const b = { prices: { Quard: 31000000, Triple: 39000000 } };
  assert.equal(priceWinner(a, b), null);
  assert.equal(priceWinner({ prices: { Quard: 0 } }, { prices: { Quard: 30000000 } }), null);
});

test('hotelWinner: jumlah bintang Mekkah + Madinah', () => {
  // A 4+3=7, B 5+4=9
  assert.deepEqual(hotelWinner(A, B), { side: 'b', reason: 'bintang' });
});

test('hotelWinner: bintang seri diputus jarak, Mekkah lebih dulu', () => {
  const a = { hotels: { mekkah: { stars: 5, distance: '±300m' }, madinah: { stars: 4, distance: '±150m' } } };
  const b = { hotels: { mekkah: { stars: 4, distance: '±100m' }, madinah: { stars: 5, distance: '±500m' } } };
  assert.deepEqual(hotelWinner(a, b), { side: 'b', reason: 'jarak' });
});

test('hotelWinner: bintang tak lengkap di salah satu sisi tak berpemenang', () => {
  const b = { hotels: { mekkah: { stars: 5, distance: '±300m' }, madinah: { stars: 4, distance: '±150m' } } };
  assert.equal(hotelWinner({ hotels: { mekkah: { stars: 4 } } }, b), null);
  assert.equal(hotelWinner({ hotels: {} }, b), null);
  assert.equal(hotelWinner(null, b), null);
});

test('hotelWinner: bintang seri dan jarak tak terbaca tak berpemenang', () => {
  const a = { hotels: { mekkah: { stars: 5, distance: 'dekat' }, madinah: { stars: 4, distance: '' } } };
  const b = { hotels: { mekkah: { stars: 5, distance: '' }, madinah: { stars: 4, distance: 'strategis' } } };
  assert.equal(hotelWinner(a, b), null);
});

test('seatWinner: sisa kursi terbanyak, sama berarti tak berpemenang', () => {
  assert.deepEqual(seatWinner(A, B), { side: 'a', a: 26, b: 12 });
  assert.equal(seatWinner({ seatSisa: 0 }, { seatSisa: 0 }), null);
  assert.equal(seatWinner({ seatSisa: 5 }, { seatSisa: 5 }), null);
});

test('buildCompareVerdict: merangkai keempatnya', () => {
  assert.deepEqual(buildCompareVerdict(A, B), {
    gap: { room: 'Quard', diff: 2700000, cheaper: 'a' },
    price: { side: 'a', wins: 3, total: 3 },
    hotel: { side: 'b', reason: 'bintang' },
    seat: { side: 'a', a: 26, b: 12 },
  });
});

test('buildCompareVerdict: paket kembar menghasilkan hero tanpa pemenang', () => {
  assert.deepEqual(buildCompareVerdict(A, A), {
    gap: { room: 'Quard', diff: 0, cheaper: null },
    price: null,
    hotel: null,
    seat: null,
  });
});
