import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveMarkerFlightDate, operationalFlightDate } from '../lib/flight-marker-date.js';

test('direct (+1) return uses the previous local departure date', () => {
  assert.equal(
    effectiveMarkerFlightDate({
      eventDate: '2026-07-26',
      dayOffset: 1,
      route: { dep: 'MED', arr: 'CGK' },
      segmentCount: 1,
    }),
    '2026-07-25',
  );
});

test('Turkey (+7) immediate JED-IST leg stays on the calendar event date', () => {
  assert.equal(
    effectiveMarkerFlightDate({
      eventDate: '2026-07-11',
      dayOffset: 7,
      route: { dep: 'JED', arr: 'IST' },
      segmentCount: 1,
    }),
    '2026-07-11',
  );
});

test('unknown marker shapes preserve the source date instead of guessing', () => {
  assert.equal(
    effectiveMarkerFlightDate({
      eventDate: '2026-07-11',
      dayOffset: 7,
      route: null,
      segmentCount: 3,
    }),
    '2026-07-11',
  );
});

test('all audited 2026 marker schedules resolve to their operational leg date', () => {
  const fixtures = [
    ['JBU1496', '2026-07-11', 7, 'IST', '2026-07-11'],
    ['JBU1484', '2026-07-26', 1, 'CGK', '2026-07-25'],
    ['JBU1577', '2026-07-28', 1, 'CGK', '2026-07-27'],
    ['JBU1493', '2026-08-23', 7, 'IST', '2026-08-23'],
    ['JBU1564', '2026-09-05', 1, 'CGK', '2026-09-04'],
    ['JBU1563', '2026-09-06', 1, 'CGK', '2026-09-05'],
    ['JBU1511', '2026-09-12', 7, 'IST', '2026-09-12'],
    ['JBU1510', '2026-10-21', 7, 'IST', '2026-10-21'],
  ];

  for (const [jadwalId, eventDate, dayOffset, arrival, expected] of fixtures) {
    assert.equal(
      effectiveMarkerFlightDate({
        eventDate,
        dayOffset,
        route: { dep: 'JED', arr: arrival },
        segmentCount: 1,
      }),
      expected,
      jadwalId,
    );
  }
});

test('timed return and later transit legs use their own local departure date', () => {
  assert.equal(operationalFlightDate({
    eventDate: '2026-07-12',
    times: { depDateLocal: '2026-07-11' },
    dayOffset: null,
    route: { dep: 'MED', arr: 'CGK' },
  }), '2026-07-11');
  assert.equal(operationalFlightDate({
    eventDate: '2026-07-12',
    times: { depDateLocal: '2026-07-13' },
    dayOffset: null,
    route: { dep: 'DXB', arr: 'JED' },
    segmentCount: 2,
  }), '2026-07-13');
});

test('zero-layover date estimate for an unanchored transit leg fails closed', () => {
  assert.equal(operationalFlightDate({
    eventDate: '2026-12-23',
    times: {
      depDateLocal: '2026-12-24',
      operationalDateTrusted: false,
    },
    dayOffset: null,
    route: { dep: 'AUH', arr: 'JED' },
    segmentCount: 2,
  }), null);
});
