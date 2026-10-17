import { ARRIVAL_GRACE_MS } from './flight-provider-freshness.js';

export function hasReliableFlightTimes(times) {
  if (times?.operationalTimeTrusted === false) return false;
  const depUTC = times?.depUTC;
  const arrUTC = times?.arrUTC;
  return Number.isFinite(depUTC) && Number.isFinite(arrUTC) && arrUTC > depUTC;
}

/**
 * Status menurut jadwal saja, tanpa data pelacak. Tak pernah 'unverified'
 * (user 2026-10-17: "Perlu Cek" tidak ditampilkan lagi) dan tak pernah
 * mengklaim terbang tanpa konfirmasi pelacak — sampai jam tiba + tenggang
 * tetap terjadwal, sesudahnya dianggap mendarat (user-approved 2026-08-14;
 * tenggang sama dengan penjaga klaim provider).
 */
export function scheduleWindowFlightState(depUTC, arrUTC, nowMs = Date.now()) {
  if (Number.isFinite(depUTC) && Number.isFinite(arrUTC) && arrUTC > depUTC
    && nowMs >= arrUTC + ARRIVAL_GRACE_MS) {
    return { status: 'landed', progress: 100 };
  }
  return { status: 'scheduled', progress: 0 };
}

export function computeFallbackFlightState(times, nowMs = Date.now()) {
  // Jam yang tak tepercaya (marker-only, rusak) tak boleh mengarang jam
  // lepas landas — tanpa jam, kartu tetap terjadwal.
  if (!hasReliableFlightTimes(times)) return { status: 'scheduled', progress: 0 };
  return scheduleWindowFlightState(Number(times.depUTC), Number(times.arrUTC), nowMs);
}
