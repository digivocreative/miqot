export const ANON_AGENT = '00000000-0000-0000-0000-000000000000';
export const RAW_RETENTION_DAYS = 14;

// ── Pure helpers ──────────────────────────────────────────────────────

export function buildCountMap(rows) {
  const m = new Map();
  for (const row of rows) {
    const aid = row.agent_id || ANON_AGENT;
    const key = `${aid}|${row.event_type}|${row.event_name}`;
    m.set(key, (m.get(key) || 0) + 1);
  }
  return m;
}

export function countMapToRows(countMap, dateKey) {
  const now = new Date().toISOString();
  const rows = [];
  for (const [key, count] of countMap.entries()) {
    const [agent_id, event_type, event_name] = key.split('|');
    rows.push({ date: dateKey, agent_id, event_type, event_name, count, updated_at: now });
  }
  return rows;
}

/**
 * Given a request range [startISO, endISO] and "now", decide which sub-ranges
 * to read from raw vs aggregate. Cutoff = now - 14 days (midnight UTC of that day).
 *
 * Returns:
 *   useRaw:       whether to query analytics_events
 *   rawStartISO:  lower bound for raw query (inclusive)
 *   rawEndISO:    upper bound for raw query (inclusive)
 *   useAgg:       whether to query analytics_events_daily
 *   aggStartDate: 'YYYY-MM-DD' lower bound for agg (inclusive)
 *   aggEndDate:   'YYYY-MM-DD' upper bound for agg (inclusive) — day BEFORE cutoff date
 */
export function computeRangeSplit(startISO, endISO, nowMs) {
  const cutoffMs = nowMs - RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  // Normalize cutoff to start of its UTC day (makes "cutoff date" deterministic)
  const cutoffDate = new Date(cutoffMs);
  cutoffDate.setUTCHours(0, 0, 0, 0);
  const cutoffMidnightMs = cutoffDate.getTime();

  const startMs = new Date(startISO).getTime();
  const endMs = new Date(endISO).getTime();

  const useRaw = endMs >= cutoffMidnightMs;
  const useAgg = startMs < cutoffMidnightMs;

  const result = { useRaw, useAgg };

  if (useRaw) {
    result.rawStartISO = new Date(Math.max(startMs, cutoffMidnightMs)).toISOString();
    result.rawEndISO = new Date(endMs).toISOString();
  }

  if (useAgg) {
    // Agg covers up to the day BEFORE cutoff (cutoff day itself is raw territory).
    const aggEndMs = Math.min(endMs, cutoffMidnightMs - 1);
    result.aggStartDate = new Date(startMs).toISOString().slice(0, 10);
    result.aggEndDate = new Date(aggEndMs).toISOString().slice(0, 10);
  }

  return result;
}

export function countMatches(rawEvents, aggEvents, predicate) {
  let n = 0;
  for (const e of rawEvents) if (predicate(e)) n++;
  for (const a of aggEvents) if (predicate(a)) n += a.count;
  return n;
}

export function tallyBy(rawEvents, aggEvents, keyFn, predicate) {
  const map = {};
  for (const e of rawEvents) {
    if (predicate && !predicate(e)) continue;
    const k = keyFn(e);
    map[k] = (map[k] || 0) + 1;
  }
  for (const a of aggEvents) {
    if (predicate && !predicate(a)) continue;
    const k = keyFn(a);
    map[k] = (map[k] || 0) + a.count;
  }
  return map;
}
