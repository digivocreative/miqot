import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanBrochurePackageName,
  countBrochureTripDays,
  isUmrohFirstRoute,
  parseSeatSisa,
  pickBrochurePackageDetails,
  pickBrochurePrice,
  pickBrochurePriceRoom,
} from '../lib/brochure-schedule.js';

test('pickBrochurePrice: single hotel tier with Quard', () => {
  const harga = { 'Hotel Bintang 5': { Quard: 33900000, Triple: 35000000, Double: 38000000, Infant: 5000000 } };
  assert.equal(pickBrochurePrice(harga), 33900000);
});

test('pickBrochurePrice: multiple hotel tiers picks min Quard', () => {
  const harga = {
    'Hotel Bintang 5': { Quard: 38000000, Triple: 40000000 },
    'Hotel Bintang 4': { Quard: 33900000, Triple: 35500000 },
  };
  assert.equal(pickBrochurePrice(harga), 33900000);
});

test('pickBrochurePrice: no Quard, falls back to Triple', () => {
  const harga = { 'Hotel Bintang 5': { Triple: 35000000, Double: 38000000 } };
  assert.equal(pickBrochurePrice(harga), 35000000);
});

test('pickBrochurePrice: Quard=0 treated as missing, falls back to Triple', () => {
  const harga = { 'Hotel Bintang 5': { Quard: 0, Triple: 35000000 } };
  assert.equal(pickBrochurePrice(harga), 35000000);
});

test('pickBrochurePrice: skips Infant entirely', () => {
  const harga = { 'Hotel Bintang 5': { Infant: 5000000 } };
  assert.equal(pickBrochurePrice(harga), null);
});

test('pickBrochurePrice: null/undefined input returns null', () => {
  assert.equal(pickBrochurePrice(null), null);
  assert.equal(pickBrochurePrice(undefined), null);
  assert.equal(pickBrochurePrice({}), null);
});

test('pickBrochurePrice: non-numeric string price ignored', () => {
  const harga = { 'Hotel Bintang 5': { Quard: 'tba', Triple: 35000000 } };
  assert.equal(pickBrochurePrice(harga), 35000000);
});

test('pickBrochurePackageDetails: returns matching hotel tier for selected price', () => {
  const harga = {
    RAHMAH: { Quard: 39900000 },
    UHUD: { Quard: 33900000 },
  };
  const hotel = {
    RAHMAH: { mekkah: 'PULLMAN ZAMZAM/SETARAF (⭐5)', madinah: 'ANWAR AL MADINAH (⭐5)' },
    UHUD: { mekkah: 'ELAF AL MASHAER/SETARAF (★4)', madinah: 'GRAND PLAZA (★4)' },
  };
  assert.deepEqual(pickBrochurePackageDetails(harga, hotel), {
    harga: 33900000,
    tier: 'UHUD',
    room: 'Quard',
    hotel: [
      { city: 'Mekkah', name: 'ELAF AL MASHAER / SETARAF', stars: 4 },
      { city: 'Madinah', name: 'GRAND PLAZA', stars: 4 },
    ],
  });
});

test('cleanBrochurePackageName: removes mix Rahmah/Uhud and duration labels', () => {
  assert.equal(
    cleanBrochurePackageName('PLUS CAIRO + ALEXANDRIA 12HR MIX  PAKET RAHMAH & UHUD( KERETA CEPAT)'),
    'PLUS CAIRO + ALEXANDRIA (KERETA CEPAT)'
  );
  assert.equal(
    cleanBrochurePackageName("JUM'ATAIN PLUS TAIF + BADAR MIX PAKET UHUD & RAHMAH 12HR"),
    "JUM'ATAIN PLUS TAIF + BADAR"
  );
  assert.equal(
    cleanBrochurePackageName('REGULER PAKET RAHMAH 9HR'),
    'REGULER PAKET RAHMAH'
  );
});

test('countBrochureTripDays: counts departure and return days inclusively', () => {
  assert.equal(countBrochureTripDays('2026-06-13', '2026-06-21'), 9);
  assert.equal(countBrochureTripDays('2026-06-30', '2026-07-10'), 11);
  assert.equal(countBrochureTripDays('invalid', '2026-07-10'), null);
});

test('parseSeatSisa: blank values are unknown, numeric zero means sold out', () => {
  assert.equal(parseSeatSisa(''), null);
  assert.equal(parseSeatSisa(null), null);
  assert.equal(parseSeatSisa('0'), 0);
  assert.equal(parseSeatSisa(12), 12);
});

test('isUmrohFirstRoute: final departure arrival (tanpa info rute pulang)', () => {
  assert.equal(isUmrohFirstRoute('CGK - JED'), true);
  assert.equal(isUmrohFirstRoute('CGK-DXB/DXB-JED'), true);
  assert.equal(isUmrohFirstRoute('CGK - MED'), false);
  assert.equal(isUmrohFirstRoute('CGK-JED/JED-CAI/CAI-MED'), false);
  assert.equal(isUmrohFirstRoute(''), false);
});

test('isUmrohFirstRoute: landing Jeddah dikonfirmasi lewat rute pulang (logika Urutan Perjalanan)', () => {
  // Pulang dari Madinah → Umroh memang dulu (Mekkah → Madinah → pulang).
  assert.equal(isUmrohFirstRoute('CGK - JED', 'MED - CGK'), true);
  // pp Jeddah→Jeddah: urutan Mekkah/Madinah tak bisa dipastikan dari rute → jangan klaim.
  assert.equal(isUmrohFirstRoute('CGK - JED', 'JED - CGK'), false);
  assert.equal(isUmrohFirstRoute('CGK-DXB/DXB-JED', 'JED-DXB/DXB-CGK'), false);
  // Landing Madinah tetap "Madinah dulu" apa pun rute pulangnya.
  assert.equal(isUmrohFirstRoute('CGK - MED', 'JED - CGK'), false);
});

import { groupPackagesByMonth } from '../lib/brochure-schedule.js';

const today = new Date('2026-05-07T00:00:00.000Z');

test('groupPackagesByMonth: groups by YYYY-MM and sorts asc', () => {
  const rows = [
    { jadwal_id: 'a', jadwal_nama: 'PAKET A', maskapai: 'SAUDIA', berangkat_tgl: '2026-06-20', pulang_tgl: '2026-06-27', price: 33900000 },
    { jadwal_id: 'b', jadwal_nama: 'PAKET B', maskapai: 'EMIRATES', berangkat_tgl: '2026-06-13', pulang_tgl: '2026-06-20', price: 41700000 },
    { jadwal_id: 'c', jadwal_nama: 'PAKET C', maskapai: 'SAUDIA', berangkat_tgl: '2026-07-05', pulang_tgl: '2026-07-12', price: 35000000 },
  ];
  const out = groupPackagesByMonth(rows, today, 24);
  assert.equal(out.length, 2);
  assert.equal(out[0].key, '2026-06');
  assert.equal(out[0].label, 'Juni 2026');
  assert.equal(out[0].monthIndexId, 5);
  assert.equal(out[0].year, 2026);
  assert.equal(out[0].packages.length, 2);
  assert.equal(out[0].packages[0].jadwal_id, 'b'); // sorted asc by berangkat_tgl
  assert.equal(out[0].packages[1].jadwal_id, 'a');
  assert.equal(out[0].truncatedCount, 0);
  assert.equal(out[1].key, '2026-07');
  assert.equal(out[1].packages.length, 1);
});

test('groupPackagesByMonth: filters out past berangkat_tgl', () => {
  const rows = [
    { jadwal_id: 'past', jadwal_nama: 'PAKET LAMA', berangkat_tgl: '2026-05-01' }, // before today 2026-05-07
    { jadwal_id: 'cur', jadwal_nama: 'PAKET INI', berangkat_tgl: '2026-05-15' },
  ];
  const out = groupPackagesByMonth(rows, today, 24);
  assert.equal(out.length, 1);
  assert.equal(out[0].key, '2026-05');
  assert.equal(out[0].packages.length, 1);
  assert.equal(out[0].packages[0].jadwal_id, 'cur');
});

test('groupPackagesByMonth: filters beyond monthsAhead window', () => {
  const rows = [
    { jadwal_id: 'within', berangkat_tgl: '2026-08-01' },
    { jadwal_id: 'beyond', berangkat_tgl: '2027-08-01' },
  ];
  const out = groupPackagesByMonth(rows, today, 6); // only 6 months ahead
  assert.equal(out.length, 1);
  assert.equal(out[0].packages[0].jadwal_id, 'within');
});

test('groupPackagesByMonth: drops months with zero packages', () => {
  const rows = [{ jadwal_id: 'a', berangkat_tgl: '2026-06-13' }];
  const out = groupPackagesByMonth(rows, today, 24);
  // No 2026-05 in result even if today is in May, because no packages match
  assert.equal(out.length, 1);
  assert.equal(out[0].key, '2026-06');
});

test('groupPackagesByMonth: keeps all packages so frontend can split brochure pages', () => {
  const rows = Array.from({ length: 13 }, (_, i) => ({
    jadwal_id: `p${i}`,
    berangkat_tgl: `2026-06-${String(i + 1).padStart(2, '0')}`,
  }));
  const out = groupPackagesByMonth(rows, today, 24);
  assert.equal(out[0].packages.length, 13);
  assert.equal(out[0].packages[0].jadwal_id, 'p0');
  assert.equal(out[0].packages[12].jadwal_id, 'p12');
  assert.equal(out[0].truncatedCount, 0);
});

test('groupPackagesByMonth: skips rows with invalid berangkat_tgl', () => {
  const rows = [
    { jadwal_id: 'good', berangkat_tgl: '2026-06-13' },
    { jadwal_id: 'null', berangkat_tgl: null },
    { jadwal_id: 'bad', berangkat_tgl: 'not a date' },
  ];
  const out = groupPackagesByMonth(rows, today, 24);
  assert.equal(out[0].packages.length, 1);
  assert.equal(out[0].packages[0].jadwal_id, 'good');
});

test('groupPackagesByMonth: empty input returns []', () => {
  assert.deepEqual(groupPackagesByMonth([], today, 24), []);
});

test('groupPackagesByMonth: monthsAhead=0 returns []', () => {
  const rows = [{ jadwal_id: 'a', berangkat_tgl: '2026-06-13' }];
  assert.deepEqual(groupPackagesByMonth(rows, today, 0), []);
});

test('groupPackagesByMonth: month-end overflow does not extend window', () => {
  const jan31 = new Date('2026-01-31T00:00:00.000Z');
  const rows = [
    { jadwal_id: 'feb', berangkat_tgl: '2026-02-15' },
    { jadwal_id: 'mar', berangkat_tgl: '2026-03-02' }, // would slip in if endDate overflows to Mar 3
  ];
  const out = groupPackagesByMonth(rows, jan31, 1);
  // monthsAhead=1 from Jan 31 should END on Feb 28 (clamped), not roll over to Mar
  assert.equal(out.length, 1);
  assert.equal(out[0].key, '2026-02');
  assert.equal(out[0].packages.length, 1);
  assert.equal(out[0].packages[0].jadwal_id, 'feb');
});

test('pickBrochurePackageDetails: room = tipe kamar yang harganya dipakai', () => {
  // Quard kosong → ROOM_PRIORITY jatuh ke Triple; `room` HARUS ikut turun,
  // bukan tetap 'Quard'. Payload Caption AI melabeli harga dengan nilai ini.
  const harga = { UHUD: { Quard: 0, Triple: 41000000, Double: 45000000 } };
  const picked = pickBrochurePackageDetails(harga, null);
  assert.equal(picked.harga, 41000000);
  assert.equal(picked.room, 'Triple');
  assert.equal(picked.tier, 'UHUD');
});

test('pickBrochurePriceRoom: null saat tidak ada harga valid', () => {
  assert.equal(pickBrochurePriceRoom({ UHUD: { Quard: 'tba' } }), null);
  assert.equal(pickBrochurePriceRoom({ UHUD: { Double: 45000000 } }), 'Double');
});
