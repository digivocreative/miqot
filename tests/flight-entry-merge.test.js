import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareFlightDepartureTimestamp,
  departureTimestampMs,
  mergeFlightEntriesByTourLeader,
} from '../lib/flight-entry-merge.js';

test('flight order compares absolute departure time across CGK and JED', () => {
  const sv819 = {
    flightNumber: 'SV 819',
    eventDate: '2026-07-18',
    depCode: 'CGK',
    depScheduled: '17:30',
    _depUTC: Date.parse('2026-07-18T10:30:00Z'),
  };
  const sv816 = {
    flightNumber: 'SV 816',
    eventDate: '2026-07-18',
    depCode: 'JED',
    depScheduled: '17:30',
    _depUTC: Date.parse('2026-07-18T14:30:00Z'),
  };

  assert.equal(departureTimestampMs(sv819), Date.parse('2026-07-18T10:30:00Z'));
  assert.equal(departureTimestampMs(sv816), Date.parse('2026-07-18T14:30:00Z'));
  assert.ok(compareFlightDepartureTimestamp(sv819, sv816) < 0);
  assert.deepEqual([sv816, sv819].sort(compareFlightDepartureTimestamp), [sv819, sv816]);
});

test('provider epoch takes precedence and is normalized from seconds to milliseconds', () => {
  const providerEpoch = Date.parse('2026-07-18T10:35:00Z') / 1000;
  assert.equal(
    departureTimestampMs({
      depTs: providerEpoch,
      _depUTC: Date.parse('2026-07-18T10:30:00Z'),
    }),
    providerEpoch * 1000,
  );
});

test('equal absolute departures stay tied even when airport clocks differ', () => {
  const departureTimestamp = Date.parse('2026-07-18T10:30:00Z');
  assert.equal(
    compareFlightDepartureTimestamp(
      { departureTimestamp, eventDate: '2026-07-18', depScheduled: '17:30' },
      { departureTimestamp, eventDate: '2026-07-18', depScheduled: '13:30' },
    ),
    0,
  );
});

test('transit segments from the same TL/event merge into one card without double pax or jamaah', () => {
  const firstDepUTC = Date.parse('2026-07-01T17:40:00Z');
  const firstArrUTC = Date.parse('2026-07-01T20:30:00Z');
  const secondDepUTC = Date.parse('2026-07-01T23:00:00Z');
  const secondArrUTC = Date.parse('2026-07-02T07:35:00Z');

  const merged = mergeFlightEntriesByTourLeader([
    {
      id: '2026-07-02_EK802_g5',
      flightNumber: 'EK 802',
      eventDate: '2026-07-02',
      group: '5',
      tourLeader: '• LENI AULIANINGSIH',
      pax: 28,
      status: 'scheduled',
      depCode: 'JED',
      depCity: 'Jeddah',
      depScheduled: '20:40',
      depDate: '2026-07-01T17:40:00.000Z',
      arrCode: 'DXB',
      arrCity: 'Dubai',
      arrScheduled: '00:30',
      duration: 170,
      jamaah: [{ nama: 'PAX A', jk: 'P', wa: '6281' }],
      routeLabel: 'JED-DXB',
      _mergeSourceKey: 'calendar-row-1',
      _segmentIndex: 0,
      _segmentCount: 2,
      _depUTC: firstDepUTC,
      _arrUTC: firstArrUTC,
    },
    {
      id: '2026-07-02_EK358_g5',
      flightNumber: 'EK 358',
      eventDate: '2026-07-02',
      group: '5',
      tourLeader: 'LENI AULIANINGSIH',
      pax: 28,
      status: 'scheduled',
      depCode: 'DXB',
      depCity: 'Dubai',
      depScheduled: '03:00',
      depDate: '2026-07-02T23:00:00.000Z',
      arrCode: 'CGK',
      arrCity: 'Jakarta',
      arrScheduled: '14:35',
      duration: 515,
      jamaah: [{ nama: 'PAX A', jk: 'P', wa: '6281' }],
      routeLabel: 'DXB-CGK',
      _mergeSourceKey: 'calendar-row-1',
      _segmentIndex: 1,
      _segmentCount: 2,
      _depUTC: secondDepUTC,
      _arrUTC: secondArrUTC,
    },
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].flightNumber, 'EK 802');
  assert.equal(merged[0].routeLabel, 'JED-DXB');
  assert.equal(merged[0].depCode, 'JED');
  assert.equal(merged[0].arrCode, 'DXB');
  assert.equal(merged[0].duration, 170);
  assert.equal(merged[0].departureTimestamp, firstDepUTC);
  assert.equal(merged[0].pax, 28);
  assert.equal(merged[0].jamaah.length, 1);
  assert.equal(merged[0].transitLabel, 'Menuju Dubai');
  assert.equal(merged[0].segments.length, 2);
  assert.deepEqual(
    merged[0].segments.map(segment => segment.departureTimestamp),
    [firstDepUTC, secondDepUTC],
  );
  assert.deepEqual(
    merged[0].segments.map(s => ({
      flightNumber: s.flightNumber,
      routeLabel: s.routeLabel,
      status: s.status,
      depCode: s.depCode,
      arrCode: s.arrCode,
    })),
    [
      { flightNumber: 'EK 802', routeLabel: 'JED-DXB', status: 'scheduled', depCode: 'JED', arrCode: 'DXB' },
      { flightNumber: 'EK 358', routeLabel: 'DXB-CGK', status: 'scheduled', depCode: 'DXB', arrCode: 'CGK' },
    ]
  );
  assert.equal(merged[0]._mergeSourceKey, undefined);
});

test('transit card summary switches to the active or next flight code instead of the whole journey', () => {
  const merged = mergeFlightEntriesByTourLeader([
    {
      id: 'return_EK802',
      flightNumber: 'EK 802',
      eventDate: '2026-07-10',
      group: '8',
      tourLeader: 'NIKITA SARI',
      pax: 46,
      status: 'landed',
      depCode: 'JED',
      depCity: 'Jeddah',
      depTerminal: '1',
      depScheduled: '03:57',
      arrCode: 'DXB',
      arrCity: 'Dubai',
      arrScheduled: '08:04',
      progress: 100,
      duration: 247,
      routeLabel: 'JED-DXB',
      _mergeSourceKey: 'return-event',
      _segmentIndex: 0,
      _segmentCount: 2,
    },
    {
      id: 'return_EK358',
      flightNumber: 'EK 358',
      eventDate: '2026-07-10',
      group: '8',
      tourLeader: 'NIKITA SARI',
      pax: 46,
      status: 'scheduled',
      depCode: 'DXB',
      depCity: 'Dubai',
      depTerminal: '3',
      depScheduled: '10:50',
      arrCode: 'CGK',
      arrCity: 'Jakarta',
      arrScheduled: '22:25',
      progress: 0,
      duration: 515,
      routeLabel: 'DXB-CGK',
      _mergeSourceKey: 'return-event',
      _segmentIndex: 1,
      _segmentCount: 2,
    },
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].flightNumber, 'EK 358');
  assert.equal(merged[0].status, 'scheduled');
  assert.equal(merged[0].depCode, 'DXB');
  assert.equal(merged[0].arrCode, 'CGK');
  assert.equal(merged[0].depScheduled, '10:50');
  assert.equal(merged[0].arrScheduled, '22:25');
  assert.equal(merged[0].depTerminal, '3');
  assert.equal(merged[0].duration, 515);
  assert.equal(merged[0].progress, 0);
  assert.deepEqual(merged[0].segments.map(segment => segment.flightNumber), ['EK 802', 'EK 358']);
});

test('same flight and same TL rows merge while pax remains per source row', () => {
  const merged = mergeFlightEntriesByTourLeader([
    {
      id: '2026-07-02_SV818_g5',
      flightNumber: 'SV 818',
      eventDate: '2026-07-02',
      group: '5',
      tourLeader: 'LENI AULIANINGSIH',
      pax: 20,
      status: 'scheduled',
      depCode: 'JED',
      arrCode: 'CGK',
      jamaah: [{ nama: 'PAX A', jk: 'P', wa: '6281' }],
      _mergeSourceKey: 'calendar-row-1',
      _segmentIndex: 0,
      _segmentCount: 1,
    },
    {
      id: '2026-07-02_SV818_g6',
      flightNumber: 'SV 818',
      eventDate: '2026-07-02',
      group: '6',
      tourLeader: '• LENI AULIANINGSIH',
      pax: 15,
      status: 'scheduled',
      depCode: 'JED',
      arrCode: 'CGK',
      jamaah: [
        { nama: 'PAX A', jk: 'P', wa: '6281' },
        { nama: 'PAX B', jk: 'L', wa: '6282' },
      ],
      _mergeSourceKey: 'calendar-row-2',
      _segmentIndex: 0,
      _segmentCount: 1,
    },
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].group, '5, 6');
  assert.equal(merged[0].pax, 35);
  assert.deepEqual(merged[0].jamaah.map(j => j.nama), ['PAX A', 'PAX B']);
});

test('same transit journey and same TL can merge across source rows without losing pax', () => {
  const base = {
    eventDate: '2026-07-02',
    tourLeader: 'LENI AULIANINGSIH',
    status: 'scheduled',
    _mergeCardKey: '2026-07-02__kepulangan__LENI AULIANINGSIH__EK802_EK358',
    _segmentCount: 2,
  };
  const merged = mergeFlightEntriesByTourLeader([
    {
      ...base,
      id: 'row1_EK802',
      flightNumber: 'EK 802',
      group: '5',
      pax: 20,
      depCode: 'JED',
      arrCode: 'DXB',
      jamaah: [{ nama: 'PAX A', jk: 'P', wa: '6281' }],
      _mergeSourceKey: 'row1',
      _segmentIndex: 0,
    },
    {
      ...base,
      id: 'row1_EK358',
      flightNumber: 'EK 358',
      group: '5',
      pax: 20,
      depCode: 'DXB',
      arrCode: 'CGK',
      jamaah: [{ nama: 'PAX A', jk: 'P', wa: '6281' }],
      _mergeSourceKey: 'row1',
      _segmentIndex: 1,
    },
    {
      ...base,
      id: 'row2_EK802',
      flightNumber: 'EK 802',
      group: '6',
      pax: 15,
      depCode: 'JED',
      arrCode: 'DXB',
      jamaah: [{ nama: 'PAX B', jk: 'L', wa: '6282' }],
      _mergeSourceKey: 'row2',
      _segmentIndex: 0,
    },
    {
      ...base,
      id: 'row2_EK358',
      flightNumber: 'EK 358',
      group: '6',
      pax: 15,
      depCode: 'DXB',
      arrCode: 'CGK',
      jamaah: [{ nama: 'PAX B', jk: 'L', wa: '6282' }],
      _mergeSourceKey: 'row2',
      _segmentIndex: 1,
    },
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].group, '5, 6');
  assert.equal(merged[0].pax, 35);
  assert.equal(merged[0].segments.length, 2);
  assert.deepEqual(merged[0].segments.map(s => s.flightNumber), ['EK 802', 'EK 358']);
  assert.deepEqual(merged[0].jamaah.map(j => j.nama), ['PAX A', 'PAX B']);
});

test('tour stopover segments are labeled as tour, not short transit', () => {
  const merged = mergeFlightEntriesByTourLeader([
    {
      id: 'nikita_EK357',
      flightNumber: 'EK 357',
      eventDate: '2026-06-30',
      group: '8',
      tourLeader: 'NIKITA SARI',
      pax: 46,
      status: 'landed',
      depCode: 'CGK',
      depCity: 'Jakarta',
      arrCode: 'DXB',
      arrCity: 'Dubai',
      jamaah: [{ nama: 'PAX A', jk: 'P', wa: '6281' }],
      _mergeSourceKey: 'calendar-row-nikita',
      _mergeCardKey: '2026-06-30__keberangkatan__NIKITA SARI__EK357_EK809',
      _segmentIndex: 0,
      _segmentCount: 2,
      _depUTC: Date.parse('2026-06-30T10:40:00Z'),
      _arrUTC: Date.parse('2026-06-30T18:30:00Z'),
      _stopoverCity: 'DXB',
      _stopoverCityName: 'Dubai',
    },
    {
      id: 'nikita_EK809',
      flightNumber: 'EK 809',
      eventDate: '2026-06-30',
      group: '8',
      tourLeader: 'NIKITA SARI',
      pax: 46,
      status: 'landed',
      depCode: 'DXB',
      depCity: 'Dubai',
      arrCode: 'MED',
      arrCity: 'Madinah',
      jamaah: [{ nama: 'PAX A', jk: 'P', wa: '6281' }],
      _mergeSourceKey: 'calendar-row-nikita',
      _mergeCardKey: '2026-06-30__keberangkatan__NIKITA SARI__EK357_EK809',
      _segmentIndex: 1,
      _segmentCount: 2,
      _depUTC: Date.parse('2026-06-30T18:30:00Z'),
      _arrUTC: Date.parse('2026-06-30T21:25:00Z'),
    },
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].transitLabel, 'Tour di Dubai');
});

test('tour stopover label includes days when actual segment gap is available', () => {
  const merged = mergeFlightEntriesByTourLeader([
    {
      id: 'tour_EK357',
      flightNumber: 'EK 357',
      eventDate: '2026-06-30',
      group: '8',
      tourLeader: 'NIKITA SARI',
      pax: 46,
      status: 'landed',
      depCode: 'CGK',
      depCity: 'Jakarta',
      arrCode: 'DXB',
      arrCity: 'Dubai',
      jamaah: [{ nama: 'PAX A', jk: 'P', wa: '6281' }],
      _mergeSourceKey: 'calendar-row-tour',
      _mergeCardKey: '2026-06-30__keberangkatan__NIKITA SARI__EK357_EK809',
      _segmentIndex: 0,
      _segmentCount: 2,
      _depUTC: Date.parse('2026-06-30T10:40:00Z'),
      _arrUTC: Date.parse('2026-06-30T18:30:00Z'),
      _stopoverCity: 'DXB',
      _stopoverCityName: 'Dubai',
    },
    {
      id: 'tour_EK809',
      flightNumber: 'EK 809',
      eventDate: '2026-06-30',
      group: '8',
      tourLeader: 'NIKITA SARI',
      pax: 46,
      status: 'landed',
      depCode: 'DXB',
      depCity: 'Dubai',
      arrCode: 'MED',
      arrCity: 'Madinah',
      jamaah: [{ nama: 'PAX A', jk: 'P', wa: '6281' }],
      _mergeSourceKey: 'calendar-row-tour',
      _mergeCardKey: '2026-06-30__keberangkatan__NIKITA SARI__EK357_EK809',
      _segmentIndex: 1,
      _segmentCount: 2,
      _depUTC: Date.parse('2026-07-02T18:30:00Z'),
      _arrUTC: Date.parse('2026-07-02T21:25:00Z'),
    },
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].transitLabel, 'Tour 2 hari di Dubai');
});

test('an unverified next leg is selected ahead of an already landed leg', () => {
  const merged = mergeFlightEntriesByTourLeader([
    {
      id: 'leg-1', flightNumber: 'SV 261', eventDate: '2026-07-11', group: '10',
      tourLeader: 'MERRY SUSANTY', pax: 45, status: 'landed', depCode: 'JED', arrCode: 'IST',
      _mergeSourceKey: 'tour', _mergeCardKey: 'tour', _segmentIndex: 0, _segmentCount: 2,
    },
    {
      id: 'leg-2', flightNumber: 'SV 278', eventDate: '2026-07-17', group: '10',
      tourLeader: 'MERRY SUSANTY', pax: 45, status: 'unverified', depCode: 'IST', arrCode: 'JED',
      _mergeSourceKey: 'tour', _mergeCardKey: 'tour', _segmentIndex: 1, _segmentCount: 2,
    },
  ]);

  assert.equal(merged[0].flightNumber, 'SV 278');
  assert.equal(merged[0].status, 'unverified');
});

test('an unverified current leg is not hidden by a later scheduled leg', () => {
  const base = {
    eventDate: '2026-07-10',
    group: '8',
    tourLeader: 'TEST LEADER',
    pax: 1,
    _mergeSourceKey: 'journey-test',
    _segmentCount: 3,
  };
  const [merged] = mergeFlightEntriesByTourLeader([
    { ...base, id: 'leg1', flightNumber: 'EK 802', status: 'landed', depCode: 'JED', arrCode: 'DXB', _segmentIndex: 0 },
    { ...base, id: 'leg2', flightNumber: 'EK 358', status: 'unverified', depCode: 'DXB', arrCode: 'CGK', _segmentIndex: 1 },
    { ...base, id: 'leg3', flightNumber: 'GA 001', status: 'scheduled', depCode: 'CGK', arrCode: 'SUB', _segmentIndex: 2 },
  ]);
  assert.equal(merged.flightNumber, 'EK 358');
  assert.equal(merged.status, 'unverified');
});

test('the earliest upcoming scheduled leg is not skipped for a later unverified leg', () => {
  const base = {
    eventDate: '2026-07-10', group: '8', tourLeader: 'TEST LEADER', pax: 1,
    _mergeSourceKey: 'journey-order', _segmentCount: 2,
  };
  const [merged] = mergeFlightEntriesByTourLeader([
    { ...base, id: 'leg1', flightNumber: 'EK 802', status: 'scheduled', depCode: 'JED', arrCode: 'DXB', _segmentIndex: 0 },
    { ...base, id: 'leg2', flightNumber: 'EK 358', status: 'unverified', depCode: 'DXB', arrCode: 'CGK', _segmentIndex: 1 },
  ]);
  assert.equal(merged.flightNumber, 'EK 802');
  assert.equal(merged.status, 'scheduled');
});
