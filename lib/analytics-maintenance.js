export const ANON_AGENT = '00000000-0000-0000-0000-000000000000';
export const RAW_RETENTION_DAYS = 14;

// Unit Separator — cannot appear in UUIDs or valid event names.
export const KEY_SEP = '\u001F';

// ── Pure helpers ──────────────────────────────────────────────────────

export function buildCountMap(rows) {
  const m = new Map();
  for (const row of rows) {
    const aid = row.agent_id || ANON_AGENT;
    const key = `${aid}${KEY_SEP}${row.event_type}${KEY_SEP}${row.event_name}`;
    m.set(key, (m.get(key) || 0) + 1);
  }
  return m;
}

export function countMapToRows(countMap, dateKey) {
  const now = new Date().toISOString();
  const rows = [];
  for (const [key, count] of countMap.entries()) {
    const [agent_id, event_type, event_name] = key.split(KEY_SEP);
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

// ── DB-integrated functions ───────────────────────────────────────────

const AGGREGATE_FETCH_BATCH = 1000;
const AGGREGATE_UPSERT_CHUNK = 500;

/**
 * Aggregate all analytics_events rows within [startISO, endISO) into
 * analytics_events_daily. Upsert on PK — idempotent.
 *
 * @param {SupabaseClient} supabase
 * @param {string} startISO - inclusive lower bound, e.g. '2026-04-17T00:00:00.000Z'
 * @param {string} endISO   - exclusive upper bound, e.g. '2026-04-18T00:00:00.000Z'
 * @returns {Promise<{scanned: number, upserted: number}>}
 */
export async function aggregateAnalyticsDay(supabase, startISO, endISO) {
  const dateKey = startISO.slice(0, 10);
  const counts = new Map();
  let scanned = 0;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('analytics_events')
      .select('agent_id, event_type, event_name')
      .gte('created_at', startISO)
      .lt('created_at', endISO)
      .range(offset, offset + AGGREGATE_FETCH_BATCH - 1);
    if (error) throw new Error(`aggregateAnalyticsDay fetch error: ${error.message}`);
    if (!data || data.length === 0) break;

    scanned += data.length;
    const pageMap = buildCountMap(data);
    for (const [k, v] of pageMap.entries()) counts.set(k, (counts.get(k) || 0) + v);

    if (data.length < AGGREGATE_FETCH_BATCH) break;
    offset += AGGREGATE_FETCH_BATCH;
  }

  if (counts.size === 0) return { scanned, upserted: 0 };

  const rows = countMapToRows(counts, dateKey);
  let upserted = 0;
  for (let i = 0; i < rows.length; i += AGGREGATE_UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + AGGREGATE_UPSERT_CHUNK);
    const { error } = await supabase
      .from('analytics_events_daily')
      .upsert(chunk, { onConflict: 'date,agent_id,event_type,event_name' });
    if (error) throw new Error(`aggregateAnalyticsDay upsert error: ${error.message}`);
    upserted += chunk.length;
  }
  return { scanned, upserted };
}

/**
 * Full maintenance cycle: aggregate yesterday (UTC day), then delete raw > 14d.
 * Skips cleanup if aggregation fails to avoid data loss.
 */
export async function runAnalyticsMaintenance(supabase) {
  const now = new Date();
  const yesterdayStart = new Date(now);
  yesterdayStart.setUTCHours(0, 0, 0, 0);
  yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);
  const yesterdayEnd = new Date(yesterdayStart);
  yesterdayEnd.setUTCDate(yesterdayEnd.getUTCDate() + 1);

  let aggResult;
  try {
    aggResult = await aggregateAnalyticsDay(
      supabase,
      yesterdayStart.toISOString(),
      yesterdayEnd.toISOString(),
    );
    console.log(`[Analytics] Aggregated ${aggResult.scanned} events into ${aggResult.upserted} daily rows for ${yesterdayStart.toISOString().slice(0,10)}`);
  } catch (err) {
    console.error('[Analytics] Aggregation failed, skipping cleanup:', err.message);
    return { aggregated: false };
  }

  const cutoff = new Date(now.getTime() - RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { error: e1, count: analyticsDeleted } = await supabase
    .from('analytics_events')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff);
  if (e1) console.error('[Analytics] Raw cleanup error:', e1.message);
  else console.log(`[Analytics] Deleted ${analyticsDeleted ?? '?'} raw analytics_events rows older than ${cutoff}`);

  const { error: e2, count: capiDeleted } = await supabase
    .from('capi_event_logs')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff);
  if (e2) console.error('[CAPI] Raw cleanup error:', e2.message);
  else console.log(`[CAPI] Deleted ${capiDeleted ?? '?'} raw capi_event_logs rows older than ${cutoff}`);

  return { aggregated: true, ...aggResult };
}

/**
 * Fetch events for a time range, splitting between raw (analytics_events)
 * and aggregate (analytics_events_daily) based on 14d cutoff.
 *
 * @returns {Promise<{rawEvents: Array, aggEvents: Array}>}
 */
export async function fetchEventsForRange(supabase, startISO, endISO) {
  const split = computeRangeSplit(startISO, endISO, Date.now());
  let rawEvents = [];
  let aggEvents = [];

  if (split.useRaw) {
    const { data, error } = await supabase
      .from('analytics_events')
      .select('agent_id, event_type, event_name, metadata, created_at')
      .gte('created_at', split.rawStartISO)
      .lte('created_at', split.rawEndISO);
    if (error) throw new Error(`fetchEventsForRange raw error: ${error.message}`);
    rawEvents = data || [];
  }

  if (split.useAgg) {
    const { data, error } = await supabase
      .from('analytics_events_daily')
      .select('date, agent_id, event_type, event_name, count')
      .gte('date', split.aggStartDate)
      .lte('date', split.aggEndDate);
    if (error) throw new Error(`fetchEventsForRange agg error: ${error.message}`);
    aggEvents = data || [];
  }

  return { rawEvents, aggEvents };
}
