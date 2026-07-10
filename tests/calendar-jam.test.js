import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calendarDayOffset,
  calendarDayOffsetForEvent,
  calendarJamForEvent,
  normalizeCalendarJam,
} from '../lib/calendar-jam.js';

test('normalizeCalendarJam accepts dot and colon times', () => {
  assert.equal(normalizeCalendarJam('0.25'), '00:25');
  assert.equal(normalizeCalendarJam('07:35 (+1)'), '07:35');
});

test('normalizeCalendarJam rejects impossible clocks', () => {
  assert.equal(normalizeCalendarJam('24:00'), null);
  assert.equal(normalizeCalendarJam('12:60'), null);
  assert.equal(normalizeCalendarJam('99.99'), null);
});

test('calendar day-offset markers are metadata, not clock times', () => {
  assert.equal(calendarDayOffset('(+7)'), 7);
  assert.equal(calendarDayOffset('( +1)'), 1);
  assert.equal(calendarDayOffset('5(+3)'), 3);
  assert.equal(calendarDayOffset('07:35'), null);
});

test('calendarJamForEvent fails closed when calendar only contains a day marker', () => {
  assert.equal(
    calendarJamForEvent(
      { event_type: 'kepulangan', jam: '( +1)' },
      { pulang_jam: '0.25' },
    ),
    null,
  );
  assert.equal(
    calendarJamForEvent(
      { event_type: 'kepulangan', jam: '(+7)' },
      { pulang_jam: '(+7)' },
    ),
    null,
  );
});

test('calendarJamForEvent keeps an explicit clock even when it includes a day marker', () => {
  assert.equal(
    calendarJamForEvent(
      { event_type: 'kepulangan', jam: '10:25 (+1)' },
      { pulang_jam: '0.25' },
    ),
    '10:25',
  );
});

test('calendarJamForEvent can still use schedule time when no day marker exists', () => {
  assert.equal(
    calendarJamForEvent(
      { event_type: 'kepulangan', jam: '' },
      { pulang_jam: '07.35' },
    ),
    '07:35',
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

test('day-offset marker is recovered from schedule only when event has no clock', () => {
  const schedule = { pulang_jam: '(+1)' };
  assert.equal(calendarDayOffsetForEvent({ event_type: 'kepulangan', jam: '' }, schedule), 1);
  assert.equal(calendarDayOffsetForEvent({ event_type: 'kepulangan', jam: '10.25' }, schedule), null);
});
