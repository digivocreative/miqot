import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeFlightEntriesByTourLeader } from '../lib/flight-entry-merge.js';

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
  assert.equal(merged[0].routeLabel, null);
  assert.equal(merged[0].depCode, 'JED');
  assert.equal(merged[0].arrCode, 'CGK');
  assert.equal(merged[0].pax, 28);
  assert.equal(merged[0].jamaah.length, 1);
  assert.equal(merged[0].transitLabel, 'Transit 2 jam 30 menit di Dubai');
  assert.equal(merged[0].segments.length, 2);
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
