import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDepartureDateLookup,
  departureDateForCalendarEvent,
} from '../lib/calendar-return-departure.js';

test('departureDateForCalendarEvent prefers jadwal_id over reused group number', () => {
  const lookup = buildDepartureDateLookup([
    { event_date: '2026-07-01', group_number: '7', paket: 'REGULER 9HR', jadwal_id: 'JBU1' },
    { event_date: '2026-08-01', group_number: '7', paket: 'PLUS TURKEY 15HR', jadwal_id: 'JBU2' },
  ]);

  assert.equal(
    departureDateForCalendarEvent({ group_number: '7', paket: 'REGULER 9HR', jadwal_id: 'JBU2' }, lookup),
    '2026-08-01'
  );
});

test('departureDateForCalendarEvent falls back to group+package when jadwal_id is absent', () => {
  const lookup = buildDepartureDateLookup([
    { event_date: '2026-07-01', group_number: '7', paket: 'REGULER 9HR', jadwal_id: 'JBU1' },
    { event_date: '2026-08-01', group_number: '7', paket: 'PLUS TURKEY 15HR', jadwal_id: 'JBU2' },
  ]);

  assert.equal(
    departureDateForCalendarEvent({ group_number: '7', paket: 'PLUS TURKEY 15HR' }, lookup),
    '2026-08-01'
  );
});

test('departureDateForCalendarEvent refuses group-only fallback when group is ambiguous', () => {
  const lookup = buildDepartureDateLookup([
    { event_date: '2026-07-01', group_number: '7', paket: 'REGULER 9HR' },
    { event_date: '2026-08-01', group_number: '7', paket: 'PLUS TURKEY 15HR' },
  ]);

  assert.equal(departureDateForCalendarEvent({ group_number: '7', paket: '' }, lookup), '');
});

test('departureDateForCalendarEvent allows group-only fallback when group is unique', () => {
  const lookup = buildDepartureDateLookup([
    { event_date: '2026-07-01', group_number: '7', paket: 'REGULER 9HR' },
  ]);

  assert.equal(departureDateForCalendarEvent({ group_number: '7', paket: '' }, lookup), '2026-07-01');
});
