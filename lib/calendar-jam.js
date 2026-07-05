export function normalizeCalendarJam(value) {
  const match = String(value || '').trim().match(/\b(\d{1,2})[.:](\d{2})\b/);
  if (!match) return null;
  return `${String(parseInt(match[1], 10)).padStart(2, '0')}:${match[2]}`;
}

export function scheduleJamForEventType(schedule, eventType) {
  if (!schedule) return null;
  if (eventType === 'kepulangan') return schedule.pulang_jam || null;
  if (eventType === 'manasik') return schedule.manasik_jam || null;
  return schedule.berangkat_jam || null;
}

export function calendarJamForEvent(event, schedule = null) {
  return normalizeCalendarJam(event?.jam)
    || normalizeCalendarJam(scheduleJamForEventType(schedule, event?.event_type || event?.type))
    || event?.jam
    || null;
}
