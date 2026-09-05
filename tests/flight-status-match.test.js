import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  flightStatusRowMatchesSegment,
  providerFlightMatchesSegment,
} from '../lib/flight-status-match.js';

const segment = {
  flightIata: 'SV261',
  flightDate: '2026-07-11',
  route: { dep: 'JED', arr: 'IST' },
};

test('provider row must match flight number, operational date, and route', () => {
  assert.equal(flightStatusRowMatchesSegment({
    id: '2026-07-11_SV261',
    flight_iata: 'SV261',
    dep_iata: 'JED',
    arr_iata: 'IST',
    dep_scheduled: '2026-07-11 17:20',
  }, segment), true);
});

test('wrong date or route cannot be attached to the group card', () => {
  assert.equal(flightStatusRowMatchesSegment({
    id: '2026-07-10_SV261', flight_iata: 'SV261', dep_iata: 'JED', arr_iata: 'IST',
  }, segment), false);
  assert.equal(flightStatusRowMatchesSegment({
    id: '2026-07-11_SV261', flight_iata: 'SV261', dep_iata: 'JED', arr_iata: 'CGK',
  }, segment), false);
  assert.equal(flightStatusRowMatchesSegment({
    id: '2026-07-11_SV261', flight_iata: 'SV278', dep_iata: 'JED', arr_iata: 'IST',
  }, segment), false);
});

test('formatted in-memory cache rows are validated with the same invariants', () => {
  assert.equal(flightStatusRowMatchesSegment({
    id: '2026-07-11_SV261',
    flightNumber: 'SV 261',
    depCode: 'JED',
    arrCode: 'IST',
    depDate: '2026-07-11T00:00:00',
  }, segment), true);
});

test('raw provider evidence must include matching code, local departure date, and both airports', () => {
  const raw = {
    flight_iata: 'SV261',
    dep_time: '2026-07-11 17:20',
    dep_iata: 'JED',
    arr_iata: 'IST',
  };
  assert.equal(providerFlightMatchesSegment(raw, segment), true);
  for (const missing of ['flight_iata', 'dep_time', 'dep_iata', 'arr_iata']) {
    const incomplete = { ...raw };
    delete incomplete[missing];
    assert.equal(providerFlightMatchesSegment(incomplete, segment), false, missing);
  }
  assert.equal(providerFlightMatchesSegment({ ...raw, dep_time: '2026-07-10 17:20' }, segment), false);
  assert.equal(providerFlightMatchesSegment({ ...raw, arr_iata: 'CGK' }, segment), false);
});

test('DB row with locally enriched fields still fails when its raw provider evidence is incomplete', () => {
  assert.equal(flightStatusRowMatchesSegment({
    id: '2026-07-11_SV261',
    event_date: '2026-07-11',
    flight_iata: 'SV261',
    dep_iata: 'JED',
    arr_iata: 'IST',
    raw_api: { status: 'active' },
  }, segment), false);
});

// ── Lintas tengah malam ───────────────────────────────────────────────────────
// SV820 MED–CGK 2026-09-05: kalender menurunkan take-off 00:25 tanggal 5 (jam
// mendarat 13:55 dikurangi durasi tabel 570 mnt), AirLabs menjadwalkannya 23:55
// tanggal 4 (durasi nyata 600 mnt). Pesawat yang sama, tanggal beda satu hari.
const midnightSegment = {
  flightIata: 'SV820',
  flightDate: '2026-09-05',
  route: { dep: 'MED', arr: 'CGK' },
  times: { depDateLocal: '2026-09-05', depLocal: '00:25' },
};
const sv820Provider = {
  flight_iata: 'SV820',
  dep_iata: 'MED',
  arr_iata: 'CGK',
  dep_time: '2026-09-04 23:55',
  dep_actual: '2026-09-05 00:25',
};

test('a departure derived just after midnight accepts provider evidence scheduled the evening before', () => {
  assert.equal(providerFlightMatchesSegment(sv820Provider, midnightSegment), true);
  assert.equal(flightStatusRowMatchesSegment({
    id: '2026-09-05_SV820',
    event_date: '2026-09-05',
    flight_iata: 'SV820',
    dep_iata: 'MED',
    arr_iata: 'CGK',
    dep_scheduled: '2026-09-04 23:55',
    raw_api: sv820Provider,
  }, midnightSegment), true);
  // The formatted cache row carries the provider's scheduled date only.
  assert.equal(flightStatusRowMatchesSegment({
    id: '2026-09-05_SV820',
    flightNumber: 'SV 820',
    depCode: 'MED',
    arrCode: 'CGK',
    depScheduled: '23:55',
    depDate: '2026-09-04T00:00:00',
  }, midnightSegment), true);
});

test('a departure derived just before midnight accepts provider evidence dated the next day', () => {
  const lateSegment = {
    ...midnightSegment,
    times: { depDateLocal: '2026-09-04', depLocal: '23:40' },
    flightDate: '2026-09-04',
  };
  assert.equal(providerFlightMatchesSegment({ ...sv820Provider, dep_time: '2026-09-05 00:10' }, lateSegment), true);
  assert.equal(providerFlightMatchesSegment({ ...sv820Provider, dep_time: '2026-09-03 23:55' }, lateSegment), false);
});

test('the midnight band never reaches another instance of a daily flight', () => {
  // Derived mid-day: the exact-date rule stands in both directions.
  const middaySegment = { ...midnightSegment, times: { depDateLocal: '2026-09-05', depLocal: '12:00' } };
  assert.equal(providerFlightMatchesSegment(sv820Provider, middaySegment), false);
  assert.equal(providerFlightMatchesSegment({ ...sv820Provider, dep_time: '2026-09-06 12:00' }, middaySegment), false);
  // Derived 00:25 only opens the previous day, never the next one.
  assert.equal(providerFlightMatchesSegment({ ...sv820Provider, dep_time: '2026-09-06 00:25' }, midnightSegment), false);
  assert.equal(providerFlightMatchesSegment({ ...sv820Provider, dep_time: '2026-09-03 23:55' }, midnightSegment), false);
});

test('a segment without a derived clock keeps the exact-date rule unless the caller widens it', () => {
  const keyOnly = { flightIata: 'SV820', flightDate: '2026-09-05', route: { dep: 'MED', arr: 'CGK' } };
  const row = {
    id: '2026-09-05_SV820', flight_iata: 'SV820', dep_iata: 'MED', arr_iata: 'CGK',
    dep_scheduled: '2026-09-04 23:55', raw_api: sv820Provider,
  };
  assert.equal(flightStatusRowMatchesSegment(row, keyOnly), false);
  assert.equal(flightStatusRowMatchesSegment(row, keyOnly, { dateToleranceDays: 1 }), true);
  assert.equal(flightStatusRowMatchesSegment(
    { ...row, dep_scheduled: '2026-09-03 23:55', raw_api: { ...sv820Provider, dep_time: '2026-09-03 23:55' } },
    keyOnly,
    { dateToleranceDays: 1 },
  ), false);
});
