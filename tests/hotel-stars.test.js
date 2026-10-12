import test from 'node:test';
import assert from 'node:assert/strict';

import { fillPackageHotelStars, matchDirectoryHotel } from '../lib/hotel-stars.js';

// Potongan Direktori Hotel sungguhan (Oktober 2026).
const DIRECTORY = [
  { name: 'Movenpick', city: 'mekkah', stars: 5, aliases: [] },
  { name: 'Anwar Almadinah Movenpick', city: 'madinah', stars: 5, aliases: [] },
  { name: 'Al Olayan Ajyad Ex Almassa', city: 'mekkah', stars: 4, aliases: [] },
  { name: 'Durrat Al Eiman', city: 'madinah', stars: 3, aliases: [] },
  { name: 'Elifim Resort', city: 'turki', stars: 4, aliases: ['ELIFIM RESOT'] },
  { name: 'Ephesus Hitit Hotel', city: 'turki', stars: 4, aliases: [] },
  { name: 'Koza Hotel', city: 'turki', stars: 4, aliases: ['KOZA'] },
  { name: 'Hotel Tanpa Bintang', city: 'mekkah', stars: null, aliases: [] },
];

test('payload baru: nama polos diberi (★N) dari direktori, termasuk ejaan /SETARAF dan alias', () => {
  const { paketHotel, missing } = fillPackageHotelStars({
    HEMAT: {
      mekkah: 'AL OLAYAN AJYAD EX ALMASSA',
      madinah: 'DURRAT AL EIMAN/SETARAF',
      bolu: 'ELIFIM RESOT',
      kusadasi: 'HITIT',
      bursa: 'KOZA',
    },
  }, DIRECTORY);
  assert.deepEqual(paketHotel.HEMAT, {
    mekkah: 'AL OLAYAN AJYAD EX ALMASSA (★4)',
    madinah: 'DURRAT AL EIMAN/SETARAF (★3)',
    bolu: 'ELIFIM RESOT (★4)',
    kusadasi: 'HITIT (★4)',
    bursa: 'KOZA (★4)',
  });
  assert.deepEqual(missing, []);
});

test('bintang dari hulu tidak pernah ditimpa', () => {
  const input = { RAHMAH: { mekkah: 'MOVENPICK (⭐3)', mekkah_hotel: 'X', mekkah_bintang: '2' } };
  const { paketHotel } = fillPackageHotelStars(input, DIRECTORY);
  assert.equal(paketHotel.RAHMAH.mekkah, 'MOVENPICK (⭐3)');
  assert.equal(paketHotel.RAHMAH.mekkah_bintang, '2');
});

test('payload lama: _bintang kosong atau "0" diisi', () => {
  const { paketHotel } = fillPackageHotelStars({
    UHUD: { mekkah_hotel: 'MOVENPICK', mekkah_bintang: '0', madinah_hotel: 'DURRAT AL EIMAN' },
  }, DIRECTORY);
  assert.equal(paketHotel.UHUD.mekkah_bintang, '5');
  assert.equal(paketHotel.UHUD.madinah_bintang, '3');
});

test('kota ikut disaring: MOVENPICK di Madinah tidak memakai Movenpick Mekkah', () => {
  assert.equal(matchDirectoryHotel('MOVENPICK', 'madinah', DIRECTORY)?.name, 'Anwar Almadinah Movenpick');
  assert.equal(matchDirectoryHotel('KOZA', 'mekkah', DIRECTORY), null);
});

test('hotel yang tak dikenal direktori atau belum berbintang dilaporkan, nama dibiarkan', () => {
  const { paketHotel, missing } = fillPackageHotelStars({
    HEMAT: { mekkah: 'HOTEL TANPA BINTANG', madinah: 'HOTEL BARU SEKALI' },
  }, DIRECTORY);
  assert.deepEqual(paketHotel.HEMAT, { mekkah: 'HOTEL TANPA BINTANG', madinah: 'HOTEL BARU SEKALI' });
  assert.deepEqual(missing, [
    { city: 'mekkah', name: 'HOTEL TANPA BINTANG' },
    { city: 'madinah', name: 'HOTEL BARU SEKALI' },
  ]);
});

test('nama pendek tidak menjadi dasar kecocokan "memuat"', () => {
  assert.equal(matchDirectoryHotel('AL KHALIL', 'mekkah', [{ name: 'Al', city: 'mekkah', stars: 5 }]), null);
});

test('payload kosong/aneh dikembalikan apa adanya', () => {
  assert.deepEqual(fillPackageHotelStars(null, DIRECTORY), { paketHotel: null, missing: [] });
  assert.deepEqual(fillPackageHotelStars({ X: null }, DIRECTORY).paketHotel, { X: null });
  assert.deepEqual(fillPackageHotelStars({ X: { mekkah: 'MOVENPICK' } }, []).missing, [{ city: 'mekkah', name: 'MOVENPICK' }]);
});
