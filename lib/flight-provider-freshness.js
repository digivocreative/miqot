const FRESHNESS_MS = {
  'en-route': 75 * 60 * 1000,
  delayed: 75 * 60 * 1000,
  scheduled: 5 * 60 * 60 * 1000,
  landed: 2 * 60 * 60 * 1000,
  cancelled: 2 * 60 * 60 * 1000,
};

export function isFreshProviderFlight(row, nowMs = Date.now()) {
  const syncedAt = Date.parse(row?.synced_at || '');
  if (!Number.isFinite(syncedAt) || syncedAt > nowMs + 60 * 1000) return false;
  const maxAge = FRESHNESS_MS[row?.status] ?? 75 * 60 * 1000;
  return nowMs - syncedAt <= maxAge;
}

/**
 * "Live" means the provider is currently tracking an active flight. A recent
 * scheduled or terminal snapshot is useful provider evidence, but it must not
 * produce a LIVE badge.
 */
export function isLiveProviderFlight(row, nowMs = Date.now()) {
  return (row?.status === 'en-route' || row?.status === 'delayed')
    && isFreshProviderFlight(row, nowMs);
}

function providerDepartureMs(row) {
  const raw = row?.raw_api || {};
  const value = Number(raw.dep_actual_ts || raw.dep_estimated_ts || raw.dep_time_ts);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value > 1e12 ? value : value * 1000;
}

export function providerBackedDisplayStatus(row, nowMs = Date.now()) {
  const status = row?.status || 'scheduled';
  if (status === 'scheduled') {
    const depMs = providerDepartureMs(row);
    if (!Number.isFinite(depMs) || nowMs >= depMs) return 'unverified';
  }
  if (isFreshProviderFlight(row, nowMs)) return status;
  if (status === 'en-route' || status === 'delayed' || status === 'scheduled') return 'unverified';
  return status;
}
