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

export function calendarJamForEvent(event, schedule = null) {
  const eventJam = normalizeCalendarJam(event?.jam);
  if (eventJam) return eventJam;

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
  // A concrete event clock wins over a marker that only exists in schedule.
  if (normalizeCalendarJam(event?.jam)) return null;
  return calendarDayOffset(
    scheduleJamForEventType(schedule, event?.event_type || event?.type),
  );
}
