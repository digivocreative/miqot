import { ARRIVAL_GRACE_MS } from './flight-provider-freshness.js';

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
  // Well past the trusted arrival clock the flight is presumed landed
  // (user-approved 2026-08-14); the grace mirrors the provider-claim guard so
  // a late aircraft is not declared down while it could still be airborne.
  if (nowMs >= Number(times.arrUTC) + ARRIVAL_GRACE_MS) return { status: 'landed', progress: 100 };
  // Between departure and that point, only a matching provider response may
  // claim en-route, delayed, cancelled, or landed.
  return { status: 'unverified', progress: 0 };
}

export function scheduledSnapshotDisplayStatus(depUTC, nowMs = Date.now()) {
  return Number.isFinite(depUTC) && nowMs < depUTC ? 'scheduled' : 'unverified';
}
