import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeFlightEntriesByTourLeader } from '../lib/flight-entry-merge.js';

test('transit segments from the same TL/event merge into one card without double pax or jamaah', () => {
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
      _depUTC: 1000,
      _arrUTC: 2000,
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
      _depUTC: 2000,
      _arrUTC: 3000,
    },
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].flightNumber, 'EK 802 / EK 358');
  assert.equal(merged[0].routeLabel, 'JED-DXB / DXB-CGK');
  assert.equal(merged[0].depCode, 'JED');
  assert.equal(merged[0].arrCode, 'CGK');
  assert.equal(merged[0].pax, 28);
  assert.equal(merged[0].jamaah.length, 1);
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
