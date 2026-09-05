const FRESHNESS_MS = {
  'en-route': 75 * 60 * 1000,
  delayed: 75 * 60 * 1000,
  scheduled: 5 * 60 * 60 * 1000,
  landed: 2 * 60 * 60 * 1000,
  cancelled: 2 * 60 * 60 * 1000,
};

/** Statuses that assert the aircraft is airborne right now. */
const ACTIVE_STATUSES = new Set(['en-route', 'delayed']);

/**
 * A `delayed` row whose departure is still ahead is a schedule claim, not an
 * airborne one: the provider reports `scheduled` plus delay minutes, and its
 * `updated` stamp only moves when the estimate changes. Judge it on the
 * scheduled window. SV821 CGK–MED 2026-09-05: delay 20m announced 12:39 WIB,
 * card fell to "Perlu Cek" 75 minutes later with the aircraft still at the gate.
 */
function isPreDepartureDelay(row, nowMs) {
  if (row?.status !== 'delayed') return false;
  const depMs = providerDepartureMs(row);
  return depMs !== null && nowMs < depMs;
}

/**
 * A tracked flight that is genuinely late keeps pushing its arrival estimate
 * forward; a record the provider has stopped following does not. Past this
 * margin, an unmoved estimate is evidence of a frozen record, not of a late
 * aircraft. Shared with the calendar fallback so "sudah pasti sampai" means
 * the same thing on every path.
 */
export const ARRIVAL_GRACE_MS = 90 * 60 * 1000;

function epochMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return number > 1e12 ? number : number * 1000;
}

export function isFreshProviderFlight(row, nowMs = Date.now()) {
  const syncedAt = Date.parse(row?.synced_at || '');
  if (!Number.isFinite(syncedAt) || syncedAt > nowMs + 60 * 1000) return false;
  const preDeparture = isPreDepartureDelay(row, nowMs);
  const maxAge = preDeparture
    ? FRESHNESS_MS.scheduled
    : FRESHNESS_MS[row?.status] ?? 75 * 60 * 1000;
  if (nowMs - syncedAt > maxAge) return false;
  // `synced_at` is OUR fetch clock. Re-polling a record the provider has stopped
  // updating refreshes the stamp but never the evidence behind it, so an active
  // claim must also be backed by a recent provider-side update. A payload with
  // no `updated` field carries no evidence either way — the arrival guard in
  // isExpiredActiveProviderClaim covers that case.
  if (ACTIVE_STATUSES.has(row?.status) && !preDeparture) {
    const updatedMs = epochMs(row?.raw_api?.updated);
    if (updatedMs !== null && nowMs - updatedMs > maxAge) return false;
  }
  return true;
}

/**
 * True once an in-flight claim has outlived the provider's own arrival estimate
 * by more than the grace window. Mirrors the departure guard on scheduled rows:
 * an operational claim expires on its own clock, however fresh our sync is.
 */
export function isExpiredActiveProviderClaim(row, nowMs = Date.now()) {
  if (!ACTIVE_STATUSES.has(row?.status)) return false;
  const raw = row?.raw_api || {};
  const arrivalMs = epochMs(raw.arr_estimated_ts || raw.arr_time_ts);
  return arrivalMs !== null && nowMs >= arrivalMs + ARRIVAL_GRACE_MS;
}

/** Field payload provider yang benar-benar dibaca penjaga di modul ini. */
const PROVIDER_EVIDENCE_FIELDS = [
  'updated',
  'arr_estimated_ts',
  'arr_time_ts',
  'dep_actual_ts',
  'dep_estimated_ts',
  'dep_time_ts',
];

/**
 * Perkecil payload provider jadi bukti yang masih bisa dinilai penjaga di atas.
 *
 * Pemanggil yang MEN-CACHE baris provider wajib menyimpan proyeksi ini, bukan
 * memetik sendiri satu-dua field. Cache di server.js dulu hanya membawa
 * `dep_time_ts`, sehingga di jalur cache `updated` dan kedua stempel kedatangan
 * lenyap — kedua penjaga jadi tak bersenjata dan status hasil cache menimpa
 * 'unverified' balik jadi 'en-route'. Satu penerbangan menjawab beda tergantung
 * permintaannya kena cache atau tidak.
 */
export function projectProviderEvidence(rawApi) {
  if (!rawApi) return null;
  const evidence = {};
  for (const field of PROVIDER_EVIDENCE_FIELDS) {
    if (rawApi[field] != null) evidence[field] = rawApi[field];
  }
  return Object.keys(evidence).length > 0 ? evidence : null;
}

/**
 * "Live" means the provider is currently tracking an active flight. A recent
 * scheduled or terminal snapshot — or a delay announced before departure —
 * is useful provider evidence, but it must not produce a LIVE badge.
 */
export function isLiveProviderFlight(row, nowMs = Date.now()) {
  return ACTIVE_STATUSES.has(row?.status)
    && !isPreDepartureDelay(row, nowMs)
    && !isExpiredActiveProviderClaim(row, nowMs)
    && isFreshProviderFlight(row, nowMs);
}

function providerDepartureMs(row) {
  const raw = row?.raw_api || {};
  return epochMs(raw.dep_actual_ts || raw.dep_estimated_ts || raw.dep_time_ts);
}

export function providerBackedDisplayStatus(row, nowMs = Date.now()) {
  const status = row?.status || 'scheduled';
  if (status === 'scheduled') {
    const depMs = providerDepartureMs(row);
    if (!Number.isFinite(depMs) || nowMs >= depMs) return 'unverified';
  }
  // Well past the record's own arrival estimate the aircraft is on the ground,
  // whatever the frozen claim says — present it as landed so the card reads
  // right and ages out with the other landed flights. Only the status is
  // presumed; operational details of the dead claim stay untrusted.
  if (isExpiredActiveProviderClaim(row, nowMs)) return 'landed';
  if (isFreshProviderFlight(row, nowMs)) return status;
  if (status === 'en-route' || status === 'delayed' || status === 'scheduled') return 'unverified';
  return status;
}
