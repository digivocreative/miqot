export function normalizeCalendarJam(value) {
  const match = String(value || '').trim().match(/\b(\d{1,2})[.:](\d{2})\b/);
  if (!match) return null;
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function calendarDayOffset(value) {
  const match = String(value || '').match(/\(\s*\+\s*(\d+)\s*\)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

export function scheduleJamForEventType(schedule, eventType) {
  if (!schedule) return null;
  if (eventType === 'kepulangan') return schedule.pulang_jam || null;
  if (eventType === 'manasik') return schedule.manasik_jam || null;
  return schedule.berangkat_jam || null;
}

function clockMinutes(hhmm) {
  const [hours, minutes] = String(hhmm || '').split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
}

/**
 * A calendar clock and a schedule clock hours apart cannot both be the trip's
 * Indonesia-side time. Every real disagreement so far is one shape: the
 * calendar files an SV818 return as "6.00" (its 01:55 Jeddah take-off read in
 * WIB) while `pulang_jam` says "16.00" — the landing, which itineraries
 * confirm (survey 2026-08-13: 91 of 99 packages' `pulang_jam` = arrival in
 * Jakarta, see lib/itinerary-pdf.js). Read as a landing, "6.00" moved the
 * derived departure ten hours back and pinned the group to the previous
 * day's aircraft.
 *
 * The schedule wins a return leg only when its clock can be a landing: a
 * Saudi/Gulf/Turkey → Jakarta flight lands before noon WIB only if it left
 * the day before, which the schedule marks "(+1)". Anything else keeps the
 * calendar, which is per-group and admin-edited.
 */
const CLOCK_DISAGREEMENT_MINUTES = 60;
const EARLIEST_SAME_DAY_LANDING_MINUTES = 12 * 60;

function clocksDisagree(a, b) {
  const x = clockMinutes(a);
  const y = clockMinutes(b);
  if (x === null || y === null) return false;
  const diff = Math.abs(x - y);
  return Math.min(diff, 24 * 60 - diff) > CLOCK_DISAGREEMENT_MINUTES;
}

function scheduleClockCanBeLanding(scheduleJam) {
  const minutes = clockMinutes(normalizeCalendarJam(scheduleJam));
  if (minutes === null) return false;
  return minutes >= EARLIEST_SAME_DAY_LANDING_MINUTES || calendarDayOffset(scheduleJam) !== null;
}

function scheduleReturnClockOverride(event, schedule) {
  if ((event?.event_type || event?.type) !== 'kepulangan') return null;
  const eventJam = normalizeCalendarJam(event?.jam);
  const scheduleJam = schedule?.pulang_jam;
  const scheduleClock = normalizeCalendarJam(scheduleJam);
  if (!eventJam || !scheduleClock || !clocksDisagree(eventJam, scheduleClock)) return null;
  return scheduleClockCanBeLanding(scheduleJam) ? scheduleClock : null;
}

export function calendarJamForEvent(event, schedule = null) {
  const eventJam = normalizeCalendarJam(event?.jam);
  if (eventJam) return scheduleReturnClockOverride(event, schedule) || eventJam;

  // Marker-only values such as "(+1)" and "(+7)" describe a day offset,
  // not a clock. The schedule-side value is ambiguous for these events, so
  // fail closed instead of turning e.g. 10:25 into a fabricated 00:25.
  if (calendarDayOffset(event?.jam) !== null) return null;

  return normalizeCalendarJam(
    scheduleJamForEventType(schedule, event?.event_type || event?.type),
  );
}

export function calendarDayOffsetForEvent(event, schedule = null) {
  const eventOffset = calendarDayOffset(event?.jam);
  if (eventOffset !== null) return eventOffset;
  // A concrete event clock wins over a marker that only exists in schedule —
  // unless the schedule clock has just overridden that event clock, in which
  // case its marker travels with it.
  if (normalizeCalendarJam(event?.jam) && !scheduleReturnClockOverride(event, schedule)) return null;
  return calendarDayOffset(
    scheduleJamForEventType(schedule, event?.event_type || event?.type),
  );
}
