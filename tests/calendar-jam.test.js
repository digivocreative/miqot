import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarJamForEvent, normalizeCalendarJam } from '../lib/calendar-jam.js';

test('normalizeCalendarJam accepts dot and colon times', () => {
  assert.equal(normalizeCalendarJam('0.25'), '00:25');
  assert.equal(normalizeCalendarJam('07:35 (+1)'), '07:35');
});

test('calendarJamForEvent falls back to schedule when calendar only contains +1 marker', () => {
  assert.equal(
    calendarJamForEvent(
      { event_type: 'kepulangan', jam: '( +1)' },
      { pulang_jam: '0.25' },
    ),
    '00:25',
  );
});

test('calendarJamForEvent keeps valid calendar time before schedule fallback', () => {
  assert.equal(
    calendarJamForEvent(
      { event_type: 'kepulangan', jam: '07.35' },
      { pulang_jam: '0.25' },
    ),
    '07:35',
  );
});
