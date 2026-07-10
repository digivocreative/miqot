import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFlightCodeList,
  parseFlightSegmentsFromCalendar,
  parseRouteLegs,
  selectCalendarReportedSegments,
} from '../lib/flight-segments.js';

test('parseFlightCodeList expands slash-separated same-airline transit codes', () => {
  assert.deepEqual(parseFlightCodeList('EK 802/358'), ['EK802', 'EK358']);
  assert.deepEqual(parseFlightCodeList('EK802 / EK 358'), ['EK802', 'EK358']);
  assert.deepEqual(parseFlightCodeList('SV 827'), ['SV827']);
});

test('parseFlightSegmentsFromCalendar prefers schedule code so hidden transit leg is shown', () => {
  const segments = parseFlightSegmentsFromCalendar('EMIRATES ~ EK 802', {
    eventType: 'kepulangan',
    schedule: {
      maskapai: 'EMIRATES',
      pulang_kode_penerbangan: 'EK 802/358',
    },
  });

  assert.deepEqual(segments.map(s => s.flightIata), ['EK802', 'EK358']);
  assert.deepEqual(segments.map(s => `${s.airlineCode} ${s.flightNumber}`), ['EK 802', 'EK 358']);
  assert.ok(segments.every(s => s.airline === 'EMIRATES'));
});

test('parseFlightSegmentsFromCalendar falls back to calendar code when schedule code is unusable', () => {
  const segments = parseFlightSegmentsFromCalendar('SAUDIA ~ SV 827', {
    eventType: 'keberangkatan',
    schedule: {
      maskapai: 'SAUDIA',
      berangkat_kode_penerbangan: '-',
    },
  });

  assert.deepEqual(segments.map(s => s.flightIata), ['SV827']);
});

test('parseRouteLegs expands transit route pairs', () => {
  assert.deepEqual(parseRouteLegs('JED-DXB/DXB-CGK'), [
    { dep: 'JED', arr: 'DXB' },
    { dep: 'DXB', arr: 'CGK' },
  ]);
});

test('day-marker event keeps only the flight reported by calendar and its schedule index', () => {
  const segments = selectCalendarReportedSegments('SAUDIA ~ SV 261', {
    eventType: 'kepulangan',
    schedule: {
      maskapai: 'SAUDIA',
      pulang_kode_penerbangan: 'SV 261/278/818',
    },
  });

  assert.deepEqual(
    segments.map(segment => ({ flightIata: segment.flightIata, segmentIndex: segment.segmentIndex })),
    [{ flightIata: 'SV261', segmentIndex: 0 }],
  );
});

test('calendar-reported later leg retains its matching schedule route index', () => {
  const segments = selectCalendarReportedSegments('SAUDIA ~ SV 278', {
    eventType: 'kepulangan',
    schedule: {
      maskapai: 'SAUDIA',
      pulang_kode_penerbangan: 'SV 261/278/818',
    },
  });

  assert.equal(segments[0].flightIata, 'SV278');
  assert.equal(segments[0].segmentIndex, 1);
});

test('marker segment selection fails closed for missing or unknown calendar flight code', () => {
  const schedule = {
    maskapai: 'SAUDIA',
    pulang_kode_penerbangan: 'SV 261/278/818',
  };
  assert.deepEqual(selectCalendarReportedSegments('SAUDIA ~ -', {
    eventType: 'kepulangan', schedule,
  }), []);
  assert.deepEqual(selectCalendarReportedSegments('SAUDIA ~ SV 999', {
    eventType: 'kepulangan', schedule,
  }), []);
});
