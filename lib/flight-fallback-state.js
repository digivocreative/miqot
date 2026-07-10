export function hasReliableFlightTimes(times) {
  if (times?.operationalTimeTrusted === false) return false;
  const depUTC = times?.depUTC;
  const arrUTC = times?.arrUTC;
  return Number.isFinite(depUTC) && Number.isFinite(arrUTC) && arrUTC > depUTC;
}

export function computeFallbackFlightState(times, nowMs = Date.now()) {
  if (!hasReliableFlightTimes(times)) return { status: 'unverified', progress: 0 };
  const depUTC = Number(times.depUTC);
  if (nowMs < depUTC) return { status: 'scheduled', progress: 0 };
  // Once scheduled departure has passed, only a matching provider response may
  // claim en-route, delayed, cancelled, or landed.
  return { status: 'unverified', progress: 0 };
}

export function scheduledSnapshotDisplayStatus(depUTC, nowMs = Date.now()) {
  return Number.isFinite(depUTC) && nowMs < depUTC ? 'scheduled' : 'unverified';
}
