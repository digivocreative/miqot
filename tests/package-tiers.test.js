import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  listPackageTiers,
  cheapestPackageTier,
  resolvePackageTier,
  tierHotelInfo,
  packageCityHotels,
  tierRoomPrice,
  tierStartingPrice,
} from '../src/lib/packageTiers.js';

// JBU1500 "PLUS CAIRO + ALEXANDRIA 12HR MIX PAKET RAHMAH & UHUD", satu-satunya
// paket bertier tiga di jadwal 1448 — bentuk hasil transformPackage, bukan
// mentahan API. Tiap tier hotelnya benar-benar berbeda, dan hanya UHUD yang
// punya hotel Cairo; itulah yang dulu bocor ke tier lain lewat penggabungan.
const JBU1500 = {
  harga: {
    UHUD: { Quard: '41700000', Double: '46300000', Infant: '13700000', Single: '62000000', Triple: '43300000' },
    HEMAT: { Quard: '34900000', Double: '38900000', Infant: '13700000', Single: 'N/A', Triple: '36900000' },
    RAHMAH: { Quard: '47500000', Double: '55200000', Infant: '13700000', Single: 'N/A', Triple: '50200000' },
  },
  hotel: {
    UHUD: {
      mekkah_hotel: 'ANJUM', mekkah_bintang: '5', mekkah_jarak: '600m',
      madinah_hotel: 'AL RITZ AL MADINAH', madinah_bintang: '5',
      cairo_hotel: 'TIBA PYRAMID', cairo_bintang: '4',
    },
    HEMAT: {
      mekkah_hotel: 'AL MASSA GRAND/SETARAF', mekkah_bintang: '4',
      madinah_hotel: 'ODST ALMADINAH/SETARAF', madinah_bintang: '4',
    },
    RAHMAH: {
      mekkah_hotel: 'MOVENPICK', mekkah_bintang: '5', mekkah_jarak: '100m',
      madinah_hotel: 'AL RITZ AL MADINAH', madinah_bintang: '5',
    },
  },
};

// Bentuk paling umum (70 dari 85 jadwal): tier tunggal.
const TIER_TUNGGAL = {
  harga: { UHUD: { Quard: '37400000', Triple: '39400000', Double: '42400000', Infant: '13700000' } },
  hotel: { UHUD: { mekkah_hotel: 'RAYYAN AJYAD', mekkah_bintang: '4', madinah_hotel: 'GRAND PLAZA BADR', madinah_bintang: '4' } },
};

test('listPackageTiers: satu entri per tier, urut sesuai API', () => {
  assert.deepEqual(listPackageTiers(JBU1500), ['UHUD', 'HEMAT', 'RAHMAH']);
  assert.deepEqual(listPackageTiers(TIER_TUNGGAL), ['UHUD']);
});

test('listPackageTiers: tier tanpa harga kamar terpakai dilewati', () => {
  const pkg = {
    harga: {
      UHUD: { Quard: '37400000' },
      PRIVATE: { Quard: 'N/A', Triple: 'N/A', Double: '', Single: '0', Infant: '13700000' },
    },
    hotel: {},
  };
  // Infant bukan kamar — tier yang hanya punya harga infant tidak bisa dijual.
  assert.deepEqual(listPackageTiers(pkg), ['UHUD']);
  assert.deepEqual(listPackageTiers({ harga: {}, hotel: {} }), []);
  assert.deepEqual(listPackageTiers({}), []);
  assert.deepEqual(listPackageTiers(null), []);
});

test('cheapestPackageTier: termurah, bukan kunci pertama dari API', () => {
  // Kunci pertama JBU1500 adalah UHUD (41,7 jt); yang termurah HEMAT (34,9 jt).
  assert.equal(cheapestPackageTier(JBU1500), 'HEMAT');
  assert.equal(cheapestPackageTier(TIER_TUNGGAL), 'UHUD');
});

test('cheapestPackageTier: tanpa tier berharga, jatuh ke kunci pertama agar hotel tetap tampil', () => {
  const pkg = {
    harga: { UHUD: { Quard: 'N/A' } },
    hotel: { UHUD: { mekkah_hotel: 'ANJUM', mekkah_bintang: '5' } },
  };
  assert.equal(cheapestPackageTier(pkg), 'UHUD');

  const tanpaHarga = { harga: {}, hotel: { RAHMAH: { mekkah_hotel: 'MOVENPICK' } } };
  assert.equal(cheapestPackageTier(tanpaHarga), 'RAHMAH');

  assert.equal(cheapestPackageTier({ harga: {}, hotel: {} }), '');
  assert.equal(cheapestPackageTier(null), '');
});

test('tierHotelInfo: hotel tier itu saja, tanpa pinjam tier lain', () => {
  const hemat = tierHotelInfo(JBU1500, 'HEMAT');
  assert.equal(hemat.mekkah_hotel, 'AL MASSA GRAND/SETARAF');
  // Inti bugnya: Cairo cuma milik UHUD dan tidak boleh menempel di HEMAT.
  assert.equal(hemat.cairo_hotel, undefined);

  assert.equal(tierHotelInfo(JBU1500, 'UHUD').cairo_hotel, 'TIBA PYRAMID');
  assert.equal(tierHotelInfo(JBU1500, 'RAHMAH').mekkah_hotel, 'MOVENPICK');
  assert.equal(tierHotelInfo(JBU1500, 'TIDAK ADA'), null);
  assert.equal(tierHotelInfo(null, 'UHUD'), null);
});

test('packageCityHotels: gabungan semua tier, dipakai suhu & bendera', () => {
  // Suhu dan bendera ikut jadwal, bukan tier: jamaah HEMAT tetap ke Cairo
  // walau hotel Cairo-nya tidak terdaftar di tier itu.
  const semua = packageCityHotels(JBU1500);
  assert.equal(semua.cairo_hotel, 'TIBA PYRAMID');
  assert.equal(semua.mekkah_hotel, 'ANJUM'); // non-kosong pertama
  assert.deepEqual(packageCityHotels({ harga: {}, hotel: {} }), {});
  assert.deepEqual(packageCityHotels(null), {});
});

test('tierRoomPrice: N/A, tier asing, dan kamar kosong jadi 0', () => {
  assert.equal(tierRoomPrice(JBU1500, 'HEMAT', 'Quard'), 34900000);
  assert.equal(tierRoomPrice(JBU1500, 'RAHMAH', 'Double'), 55200000);
  assert.equal(tierRoomPrice(JBU1500, 'HEMAT', 'Single'), 0);
  assert.equal(tierRoomPrice(JBU1500, 'TIDAK ADA', 'Quard'), 0);
  assert.equal(tierRoomPrice(JBU1500, '', 'Quard'), 0);
  assert.equal(tierRoomPrice(null, 'UHUD', 'Quard'), 0);
});

test('tierStartingPrice: termurah antar kamar, infant tidak ikut', () => {
  assert.equal(tierStartingPrice(JBU1500, 'HEMAT'), 34900000);
  assert.equal(tierStartingPrice(JBU1500, 'UHUD'), 41700000);
  // Infant 13,7 jt lebih murah dari kamar mana pun tapi bukan harga kamar.
  assert.notEqual(tierStartingPrice(JBU1500, 'RAHMAH'), 13700000);
  assert.equal(tierStartingPrice(JBU1500, 'RAHMAH'), 47500000);
  assert.equal(tierStartingPrice(JBU1500, 'TIDAK ADA'), 0);
});

test('resolvePackageTier: tier asing atau kosong jatuh ke termurah', () => {
  assert.equal(resolvePackageTier(JBU1500, 'RAHMAH'), 'RAHMAH');
  assert.equal(resolvePackageTier(JBU1500, 'TIDAK ADA'), 'HEMAT');
  assert.equal(resolvePackageTier(JBU1500, ''), 'HEMAT');
  assert.equal(resolvePackageTier(JBU1500, null), 'HEMAT');
  assert.equal(resolvePackageTier(null, 'UHUD'), '');
});
