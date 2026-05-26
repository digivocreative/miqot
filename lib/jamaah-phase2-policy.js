const JAKARTA_OFFSET_MINUTES = 7 * 60;
const MINUTES_PER_DAY = 24 * 60;

export const DEFAULT_UMROH_PHASE2_TIMES_WIB = Object.freeze(['01:00', '09:00', '14:00']);

function parseTimeToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export function normalizeJakartaScheduleTimes(times = DEFAULT_UMROH_PHASE2_TIMES_WIB) {
  const normalized = [...new Set(
    (Array.isArray(times) ? times : [])
      .map(parseTimeToMinutes)
      .filter((minutes) => minutes !== null)
  )].sort((a, b) => a - b);

  return normalized.length > 0 ? normalized : [60, 14 * 60];
}

export function nextJakartaScheduleDate(now = new Date(), times = DEFAULT_UMROH_PHASE2_TIMES_WIB) {
  const scheduleMinutes = normalizeJakartaScheduleTimes(times);
  const jakartaNowMs = now.getTime() + JAKARTA_OFFSET_MINUTES * 60 * 1000;
  const jakartaNow = new Date(jakartaNowMs);
  const dayStartUtcMs = Date.UTC(
    jakartaNow.getUTCFullYear(),
    jakartaNow.getUTCMonth(),
    jakartaNow.getUTCDate(),
  );
  const minuteOfDay = jakartaNow.getUTCHours() * 60 + jakartaNow.getUTCMinutes();
  const nextMinuteToday = scheduleMinutes.find((minutes) => minutes > minuteOfDay);
  const targetJakartaMs = dayStartUtcMs + (nextMinuteToday ?? scheduleMinutes[0] + MINUTES_PER_DAY) * 60 * 1000;

  return new Date(targetJakartaMs - JAKARTA_OFFSET_MINUTES * 60 * 1000);
}

export function shouldDeferInlineUmrohPhase2({ awapiSyncEnabled, awapiKey, forceInline = false } = {}) {
  if (forceInline) return false;
  return awapiSyncEnabled === true && Boolean(String(awapiKey || '').trim());
}
