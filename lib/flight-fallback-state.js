import { ARRIVAL_GRACE_MS } from './flight-provider-freshness.js';

export function hasReliableFlightTimes(times) {
  if (times?.operationalTimeTrusted === false) return false;
  const depUTC = times?.depUTC;
  const arrUTC = times?.arrUTC;
  return Number.isFinite(depUTC) && Number.isFinite(arrUTC) && arrUTC > depUTC;
}

/**
 * Status menurut jadwal saja, tanpa data pelacak. Tak pernah 'unverified'
 * (keputusan user 2026-10-17: "Perlu Cek" tidak ditampilkan lagi) — di antara
 * jam berangkat dan tiba penerbangan dianggap terbang menurut jadwal, dan lewat
 * jam tiba + tenggang dianggap mendarat (user-approved 2026-08-14; tenggang
 * sama dengan penjaga klaim provider). Tanpa jam berangkat: tetap terjadwal.
 */
export function scheduleWindowFlightState(depUTC, arrUTC, nowMs = Date.now()) {
  if (!Number.isFinite(depUTC) || nowMs < depUTC) return { status: 'scheduled', progress: 0 };
  if (!Number.isFinite(arrUTC) || arrUTC <= depUTC) return { status: 'en-route', progress: 0 };
  if (nowMs >= arrUTC + ARRIVAL_GRACE_MS) return { status: 'landed', progress: 100 };
  const pct = Math.round(((nowMs - depUTC) / (arrUTC - depUTC)) * 100);
  return { status: 'en-route', progress: Math.min(99, Math.max(1, pct)) };
}

export function computeFallbackFlightState(times, nowMs = Date.now()) {
  // Jam yang tak tepercaya (marker-only, rusak) tak boleh mengarang jam
  // lepas landas — tanpa jam, kartu tetap terjadwal.
  if (!hasReliableFlightTimes(times)) return { status: 'scheduled', progress: 0 };
  return scheduleWindowFlightState(Number(times.depUTC), Number(times.arrUTC), nowMs);
}
