function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const CALENDAR_PUBLIC_MIN_EVENT_COUNT = parsePositiveInt(
  process.env.CALENDAR_PUBLIC_MIN_EVENT_COUNT,
  20,
);

export const CALENDAR_PUBLIC_REQUIRED_EVENT_TYPES = (process.env.CALENDAR_PUBLIC_REQUIRED_EVENT_TYPES
  || 'manasik,keberangkatan,kepulangan')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

export function validatePublicCalendarSnapshot(
  events,
  {
    minimumEventCount = CALENDAR_PUBLIC_MIN_EVENT_COUNT,
    requiredEventTypes = CALENDAR_PUBLIC_REQUIRED_EVENT_TYPES,
  } = {},
) {
  if (!Array.isArray(events) || events.length < minimumEventCount) {
    return `sumber publik hanya memuat ${events?.length || 0} event; minimum aman ${minimumEventCount}`;
  }

  const availableTypes = new Set(events.map(event => event.type));
  const missingTypes = requiredEventTypes.filter(type => !availableTypes.has(type));
  if (missingTypes.length > 0) {
    return `sumber publik tidak memuat tipe wajib: ${missingTypes.join(', ')}`;
  }

  return null;
}
