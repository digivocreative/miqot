import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFlightCodeList,
  parseFlightSegmentsFromCalendar,
  parseRouteLegs,
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
