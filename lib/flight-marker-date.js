const INDONESIAN_AIRPORTS = new Set([
  'CGK', 'SUB', 'JOG', 'YIA', 'SRG', 'BDO', 'SOC', 'KNO', 'UPG', 'DPS', 'BPN',
]);

function shiftIsoDate(dateString, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateString || ''))) return null;
  const value = new Date(`${dateString}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * Marker-only direct returns use the calendar date as Indonesian arrival day.
 * A tour-extension marker, whose immediate leg still ends abroad, starts on
 * the calendar date itself. Unknown shapes keep the source date (fail closed).
 */
export function effectiveMarkerFlightDate({ eventDate, dayOffset, route, segmentCount = 1 }) {
  const offset = Number(dayOffset);
  if (!Number.isInteger(offset) || offset <= 0) return eventDate || null;
  if (segmentCount !== 1 || !INDONESIAN_AIRPORTS.has(String(route?.arr || '').toUpperCase())) {
    return eventDate || null;
  }
  return shiftIsoDate(eventDate, -offset) || eventDate || null;
}

/**
 * Every status/cache key is based on the local departure date of that leg.
 * Calendar return events commonly store the final Indonesian arrival date,
 * which can be a day later than departure. Marker-only rows have no trusted
 * clock, so they retain the explicit marker convention instead.
 */
export function operationalFlightDate({
  eventDate,
  times,
  dayOffset,
  route,
  segmentCount = 1,
}) {
  const timedDate = String(times?.depDateLocal || '');
  if (times?.operationalDateTrusted !== false && /^\d{4}-\d{2}-\d{2}$/.test(timedDate)) {
    return timedDate;
  }
  if (dayOffset !== null && dayOffset !== undefined) {
    return effectiveMarkerFlightDate({ eventDate, dayOffset, route, segmentCount });
  }
  if (times?.operationalDateTrusted === false) return null;
  return eventDate || null;
}
