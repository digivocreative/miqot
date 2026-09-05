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

// ── Jam kalender vs jam jadwal yang bertentangan berjam-jam ───────────────────
// Satu-satunya pola nyata (11/11): kepulangan SV 818 "6.00" di kalender vs
// "16.00" di jadwal — 16:00 memang jam mendarat CGK, "6.00" take-off Jeddah
// yang dibaca dalam WIB.
test('a return leg takes the schedule clock when the calendar clock cannot be the landing', () => {
  const event = { event_type: 'kepulangan', jam: '6.00' };
  assert.equal(calendarJamForEvent(event, { pulang_jam: '16.00' }), '16:00');
  assert.equal(calendarDayOffsetForEvent(event, { pulang_jam: '16.00' }), null);
});

test('a schedule marker travels with the schedule clock that overrides the calendar', () => {
  const event = { event_type: 'kepulangan', jam: '3.55' };
  assert.equal(calendarJamForEvent(event, { pulang_jam: '13.55 (+1)' }), '13:55');
  assert.equal(calendarDayOffsetForEvent(event, { pulang_jam: '13.55 (+1)' }), 1);
});

test('the calendar keeps winning when the schedule clock is no landing, the gap is small, or the leg departs', () => {
  // Schedule "0.25" without a marker is a Saudi departure clock, not a landing.
  assert.equal(calendarJamForEvent({ event_type: 'kepulangan', jam: '13.55' }, { pulang_jam: '0.25' }), '13:55');
  // Group-level one-minute offsets (SV827 00.40 / 00.41) and rounding are not disagreements.
  assert.equal(calendarJamForEvent({ event_type: 'kepulangan', jam: '15.51' }, { pulang_jam: '15.50' }), '15:51');
  // Departure legs are never overridden.
  assert.equal(calendarJamForEvent({ event_type: 'keberangkatan', jam: '6.00' }, { berangkat_jam: '16.00' }), '06:00');
  assert.equal(calendarDayOffsetForEvent({ event_type: 'keberangkatan', jam: '6.00' }, { berangkat_jam: '16.00 (+1)' }), null);
});
