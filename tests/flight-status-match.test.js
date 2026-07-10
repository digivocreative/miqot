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
