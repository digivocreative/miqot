import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeFlightCode,
  flightKey,
  buildScheduleFlightMap,
  buildJamaahFlightIndex,
  jamaahForFlightCard,
} from '../lib/flight-jamaah.js';

// ── normalizeFlightCode ───────────────────────────────────────────────────────
test('normalizeFlightCode: strips spaces, uppercases, takes first leg of multi-leg', () => {
  assert.equal(normalizeFlightCode('SV 827'), 'SV827');
  assert.equal(normalizeFlightCode('ek 357'), 'EK357');
  assert.equal(normalizeFlightCode('EK 357/809'), 'EK357'); // Dubai transit — first leg only
  assert.equal(normalizeFlightCode(''), '');
  assert.equal(normalizeFlightCode(null), '');
  assert.equal(normalizeFlightCode(undefined), '');
});

test('normalizeFlightCode matches parseFlightFromCalendar output for both separators', () => {
  // calendar "SAUDIA ~ SV 827" → parseFlightFromCalendar → flightIata "SV827"
  assert.equal(normalizeFlightCode('SV827'), 'SV827');
  // schedule "SV 827" must normalize to the same value the card carries
  assert.equal(normalizeFlightCode('SV 827'), normalizeFlightCode('SV827'));
});

test('flightKey: empty when either part missing', () => {
  assert.equal(flightKey('2026-06-20', 'SV 827'), '2026-06-20__SV827');
  assert.equal(flightKey('2026-06-20T00:00:00', 'SV 827'), '2026-06-20__SV827');
  assert.equal(flightKey('', 'SV 827'), '');
  assert.equal(flightKey('2026-06-20', ''), '');
});

// ── The real Nikita scenario (20 Juni) ────────────────────────────────────────
// 22 jamaah, paket "HEMAT", split across two schedules departing the SAME day:
//   JBU1503 → SAUDIA SV 827   (11 jamaah)
//   JBU1539 → EMIRATES EK 357 (11 jamaah)
const NIKITA_SCHEDULES = [
  { jadwal_id: 'JBU1503', berangkat_tgl: '2026-06-20', berangkat_kode_penerbangan: 'SV 827',
    pulang_tgl: '2026-06-28', pulang_kode_penerbangan: 'SV 826' },
  { jadwal_id: 'JBU1539', berangkat_tgl: '2026-06-20', berangkat_kode_penerbangan: 'EK 357/809',
    pulang_tgl: '2026-07-01', pulang_kode_penerbangan: 'EK 358/808' },
];

function nikitaJamaah() {
  const list = [];
  for (let i = 0; i < 11; i++) {
    list.push({ nama: `SV PAX ${String.fromCharCode(90 - i)}`, jk: 'L', wa: `62811${i}`, tgl_berangkat: '2026-06-20', id_jadwal: 'JBU1503' });
    list.push({ nama: `EK PAX ${String.fromCharCode(90 - i)}`, jk: 'P', wa: `62822${i}`, tgl_berangkat: '2026-06-20', id_jadwal: 'JBU1539' });
  }
  return list;
}

test('Nikita 20 Juni: each same-day flight shows ONLY its own jamaah (the bug fix)', () => {
  const scheduleMap = buildScheduleFlightMap(NIKITA_SCHEDULES);
  const index = buildJamaahFlightIndex(nikitaJamaah(), scheduleMap);

  const sv = jamaahForFlightCard(index, { eventType: 'keberangkatan', eventDate: '2026-06-20', flightIata: 'SV827' });
  const ek = jamaahForFlightCard(index, { eventType: 'keberangkatan', eventDate: '2026-06-20', flightIata: 'EK357' });

  // Before the fix both returned all 22; now each returns its own 11.
  assert.equal(sv.length, 11, 'SV 827 should show 11, not 22');
  assert.equal(ek.length, 11, 'EK 357 should show 11, not 22');
  assert.ok(sv.every((j) => j.nama.startsWith('SV')), 'SV card must not contain EK jamaah');
  assert.ok(ek.every((j) => j.nama.startsWith('EK')), 'EK card must not contain SV jamaah');
  // No overlap between the two cards.
  const svSet = new Set(sv.map((j) => j.nama));
  assert.ok(ek.every((j) => !svSet.has(j.nama)), 'no jamaah on both flights');
});

test('alphabetical sort within a card is preserved', () => {
  const scheduleMap = buildScheduleFlightMap(NIKITA_SCHEDULES);
  const index = buildJamaahFlightIndex(nikitaJamaah(), scheduleMap);
  const sv = jamaahForFlightCard(index, { eventType: 'keberangkatan', eventDate: '2026-06-20', flightIata: 'SV827' });
  const names = sv.map((j) => j.nama);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
});

test('return leg: kepulangan card matches by pulang flight code + return date', () => {
  const scheduleMap = buildScheduleFlightMap(NIKITA_SCHEDULES);
  const index = buildJamaahFlightIndex(nikitaJamaah(), scheduleMap);
  // SV return: SV 826 on 2026-06-28
  const svRet = jamaahForFlightCard(index, {
    eventType: 'kepulangan', eventDate: '2026-06-28', flightIata: 'SV826', depDate: '2026-06-20',
  });
  assert.equal(svRet.length, 11);
  assert.ok(svRet.every((j) => j.nama.startsWith('SV')));
});

test('a flight with none of the agent\'s jamaah shows empty (not the whole date cohort)', () => {
  const scheduleMap = buildScheduleFlightMap(NIKITA_SCHEDULES);
  const index = buildJamaahFlightIndex(nikitaJamaah(), scheduleMap);
  // GA 999 on the same day — agent has nobody on it.
  const ga = jamaahForFlightCard(index, { eventType: 'keberangkatan', eventDate: '2026-06-20', flightIata: 'GA999' });
  assert.equal(ga.length, 0);
});

// ── Graceful degradation ──────────────────────────────────────────────────────
test('unresolved jamaah (no id_jadwal / unknown schedule) fall back to date, never dropped', () => {
  const scheduleMap = buildScheduleFlightMap(NIKITA_SCHEDULES);
  const jamaah = [
    { nama: 'RESOLVED SV', jk: 'L', wa: '6280', tgl_berangkat: '2026-06-20', id_jadwal: 'JBU1503' },
    { nama: 'NO JADWAL', jk: 'L', wa: '6281', tgl_berangkat: '2026-06-20', id_jadwal: null },
    { nama: 'UNKNOWN JADWAL', jk: 'P', wa: '6282', tgl_berangkat: '2026-06-20', id_jadwal: 'ZZZ9999' },
  ];
  const index = buildJamaahFlightIndex(jamaah, scheduleMap);

  const sv = jamaahForFlightCard(index, { eventType: 'keberangkatan', eventDate: '2026-06-20', flightIata: 'SV827' });
  const names = sv.map((j) => j.nama).sort();
  // Resolved SV pax + both unresolved (shown best-effort on every same-day flight).
  assert.deepEqual(names, ['NO JADWAL', 'RESOLVED SV', 'UNKNOWN JADWAL']);

  const ek = jamaahForFlightCard(index, { eventType: 'keberangkatan', eventDate: '2026-06-20', flightIata: 'EK357' });
  // EK has no resolved pax, but still surfaces the 2 unresolved ones rather than 0.
  assert.deepEqual(ek.map((j) => j.nama).sort(), ['NO JADWAL', 'UNKNOWN JADWAL']);
});

test('empty / missing inputs do not throw', () => {
  const index = buildJamaahFlightIndex([], new Map());
  assert.equal(jamaahForFlightCard(index, { eventType: 'keberangkatan', eventDate: '2026-06-20', flightIata: 'SV827' }).length, 0);
  assert.equal(jamaahForFlightCard(index, {}).length, 0);
  assert.deepEqual(buildScheduleFlightMap(null).size, 0);
});
