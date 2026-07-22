import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getRiyadhNow,
  parseHHMM,
  formatHHMM,
  computeNextPrayer,
  formatCountdown,
  formatHijri,
  buildTimingsUrl,
  tripDayIndex,
  resolvePrimaryCity,
} from '../lib/prayer-times.js';

const TIMINGS = { Fajr: '04:25', Dhuhr: '12:27', Asr: '15:44', Maghrib: '19:04', Isha: '20:34' };

test('getRiyadhNow: pukul 12:27 Riyadh dari UTC 09:27', () => {
  const now = getRiyadhNow(Date.parse('2026-07-22T09:27:00Z'));
  assert.equal(now.dateKey, '22-07-2026');
  assert.equal(now.isoDate, '2026-07-22');
  assert.equal(now.minutesOfDay, 12 * 60 + 27);
});

test('getRiyadhNow: pakai tanggal Riyadh, bukan WIB (lintas tengah malam)', () => {
  // UTC 21:30 = Riyadh 00:30 tanggal 23 (WIB sudah 04:30 tgl 23 juga, tapi kita uji zona Riyadh)
  const now = getRiyadhNow(Date.parse('2026-07-22T21:30:00Z'));
  assert.equal(now.dateKey, '23-07-2026');
  assert.equal(now.minutesOfDay, 30);
});

test('parseHHMM: menit sejak tengah malam, toleran suffix, tolak invalid', () => {
  assert.equal(parseHHMM('19:04'), 19 * 60 + 4);
  assert.equal(parseHHMM('04:25'), 265);
  assert.equal(parseHHMM('19:04 (+03)'), 1144);
  assert.equal(parseHHMM('bukan jam'), null);
  assert.equal(parseHHMM('25:00'), null);
});

test('formatHHMM: normalisasi ke HH:MM dua digit', () => {
  assert.equal(formatHHMM('4:25'), '04:25');
  assert.equal(formatHHMM('19:04 (+03)'), '19:04');
  assert.equal(formatHHMM('rusak'), '--:--');
});

test('computeNextPrayer: tepat di waktu Dzuhur → berikutnya Ashar', () => {
  const next = computeNextPrayer(TIMINGS, 12 * 60 + 27);
  assert.equal(next.name, 'Asr');
  assert.equal(next.label, 'Ashar');
  assert.equal(next.timeLabel, '15:44');
  assert.equal(next.minutesUntil, 197);
  assert.equal(next.tomorrow, false);
});

test('computeNextPrayer: dini hari → Subuh hari ini', () => {
  const next = computeNextPrayer(TIMINGS, 100);
  assert.equal(next.name, 'Fajr');
  assert.equal(next.tomorrow, false);
  assert.equal(next.minutesUntil, 165);
});

test('computeNextPrayer: setelah Isya → Subuh besok', () => {
  const next = computeNextPrayer(TIMINGS, 21 * 60 + 40);
  assert.equal(next.name, 'Fajr');
  assert.equal(next.tomorrow, true);
  assert.equal(next.minutesUntil, (1440 - (21 * 60 + 40)) + 265);
});

test('formatCountdown', () => {
  assert.equal(formatCountdown(197), '3 jam 17 mnt lagi');
  assert.equal(formatCountdown(45), '45 mnt lagi');
  assert.equal(formatCountdown(0), 'kurang dari 1 mnt');
});

test('formatHijri: nomor bulan → nama Indonesia', () => {
  assert.equal(formatHijri({ day: 8, month: { number: 2, en: 'Safar' }, year: 1448 }), '8 Safar 1448 H');
  assert.equal(formatHijri(null), null);
});

test('buildTimingsUrl: koordinat + method=4', () => {
  const url = buildTimingsUrl('mekkah', '22-07-2026');
  assert.match(url, /\/timings\/22-07-2026\?/);
  assert.match(url, /latitude=21\.4225/);
  assert.match(url, /longitude=39\.8262/);
  assert.match(url, /method=4/);
});

test('tripDayIndex: indeks hari dalam rentang, null di luar', () => {
  assert.equal(tripDayIndex('2026-07-20', '2026-07-29', '2026-07-22'), 2);
  assert.equal(tripDayIndex('2026-07-20', '2026-07-29', '2026-07-20'), 0);
  assert.equal(tripDayIndex('2026-07-20', '2026-07-29', '2026-07-19'), null); // sebelum berangkat
  assert.equal(tripDayIndex('2026-07-20', '2026-07-29', '2026-07-30'), null); // sesudah pulang
  assert.equal(tripDayIndex('2026-07-20', null, '2026-07-25'), 5);            // tanpa batas atas
  assert.equal(tripDayIndex(null, '2026-07-29', '2026-07-25'), null);         // mulai tak valid
});

test('tripDayIndex: toleran timestamp berimbuh waktu', () => {
  assert.equal(tripDayIndex('2026-07-20T00:00:00Z', '2026-07-29', '2026-07-22T10:00:00Z'), 2);
});

test('resolvePrimaryCity: default Mekkah, naik ke Madinah saat cocok', () => {
  const days = [{ location: 'Makkah' }, { location: 'Madinah, Masjid Nabawi' }];
  assert.equal(resolvePrimaryCity({ itineraryDays: days, dayIndex: 1 }), 'madinah');
  assert.equal(resolvePrimaryCity({ itineraryDays: days, dayIndex: 0 }), 'mekkah');
  assert.equal(resolvePrimaryCity({ itineraryDays: days, dayIndex: null }), 'mekkah');
  assert.equal(resolvePrimaryCity({ itineraryDays: [{ location: null }], dayIndex: 0 }), 'mekkah');
  assert.equal(resolvePrimaryCity(), 'mekkah');
});
