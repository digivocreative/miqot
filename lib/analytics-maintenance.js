export const ANON_AGENT = '00000000-0000-0000-0000-000000000000';
export const RAW_RETENTION_DAYS = 14;

// CAPI event logs are noisy and read-only (no aggregate rollup), so they are
// pruned far more aggressively than analytics_events. Kept separate from
// RAW_RETENTION_DAYS so shortening CAPI retention never shrinks the analytics
// raw window the 7-day drill-down depends on.
export const CAPI_RETENTION_DAYS = 5;

/**
 * UTC-midnight-aligned retention cutoff: the start of the UTC day that falls
 * `retentionDays` before `nowMs`. Rows with created_at < this are eligible for
 * deletion. Aligning to midnight keeps the cutoff deterministic regardless of
 * what time of day the maintenance job runs.
 */
export function retentionCutoffISO(nowMs, retentionDays) {
  const cutoff = new Date(nowMs - retentionDays * 24 * 60 * 60 * 1000);
  cutoff.setUTCHours(0, 0, 0, 0);
  return cutoff.toISOString();
}

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

function dateKeyFromMs(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function dateKeyToUtcMs(dateKey) {
  return new Date(`${dateKey}T00:00:00.000Z`).getTime();
}

export function addUtcDays(dateKey, days) {
  return dateKeyFromMs(dateKeyToUtcMs(dateKey) + days * 24 * 60 * 60 * 1000);
}

function startOfUtcDayISO(dateKey) {
  return `${dateKey}T00:00:00.000Z`;
}

function isStartOfUtcDay(iso) {
  return iso.endsWith('T00:00:00.000Z');
}

function isEndOfUtcDay(iso) {
  return iso.endsWith('T23:59:59.999Z');
}

function minDateKey(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a <= b ? a : b;
}

/**
 * Build a read plan that uses analytics_events_daily for complete UTC days that
 * are known to be aggregated, and raw analytics_events for the uncovered edges.
 *
 * `latestAggregateDate` is the newest complete daily rollup available globally.
 * It is capped to yesterday so an accidental same-day rollup is never treated as
 * final.
 */
export function computeDailyReadPlan(startISO, endISO, nowMs, latestAggregateDate) {
  const startMs = new Date(startISO).getTime();
  const endMs = new Date(endISO).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) {
    return { useAgg: false, rawRanges: [] };
  }

  const today = new Date(nowMs);
  today.setUTCHours(0, 0, 0, 0);
  const yesterdayKey = dateKeyFromMs(today.getTime() - 24 * 60 * 60 * 1000);
  const cappedLatestAgg = latestAggregateDate
    ? minDateKey(String(latestAggregateDate).slice(0, 10), yesterdayKey)
    : null;

  const startKey = String(startISO).slice(0, 10);
  const endKey = String(endISO).slice(0, 10);
  const firstFullDay = isStartOfUtcDay(startISO) ? startKey : addUtcDays(startKey, 1);
  const lastFullDayUncapped = isEndOfUtcDay(endISO) ? endKey : addUtcDays(endKey, -1);
  const lastFullDay = cappedLatestAgg ? minDateKey(lastFullDayUncapped, cappedLatestAgg) : null;

  let aggStartDate = null;
  let aggEndDate = null;
  if (cappedLatestAgg && firstFullDay <= lastFullDay) {
    aggStartDate = firstFullDay;
    aggEndDate = lastFullDay;
  }

  const rawRanges = [];
  if (!aggStartDate || !aggEndDate) {
    rawRanges.push({ startISO, endISO });
  } else {
    const aggStartISO = startOfUtcDayISO(aggStartDate);
    const aggEndNextISO = startOfUtcDayISO(addUtcDays(aggEndDate, 1));
    const beforeEndMs = new Date(aggStartISO).getTime() - 1;
    if (startMs <= beforeEndMs) {
      rawRanges.push({ startISO, endISO: new Date(Math.min(endMs, beforeEndMs)).toISOString() });
    }
    const afterStartISO = new Date(Math.max(startMs, new Date(aggEndNextISO).getTime())).toISOString();
    if (new Date(afterStartISO).getTime() <= endMs) {
      rawRanges.push({ startISO: afterStartISO, endISO });
    }
  }

  return {
    useAgg: Boolean(aggStartDate && aggEndDate),
    aggStartDate,
    aggEndDate,
    rawRanges,
  };
}

async function fetchAllPages(queryBuilder, errorLabel) {
  const rows = [];
  let offset = 0;
  while (true) {
    const { data, error } = await queryBuilder.range(offset, offset + AGGREGATE_FETCH_BATCH - 1);
    if (error) throw new Error(`${errorLabel}: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < AGGREGATE_FETCH_BATCH) break;
    offset += AGGREGATE_FETCH_BATCH;
  }
  return rows;
}

export async function fetchLatestAggregateDate(supabase, maxDateKey) {
  const { data, error } = await supabase
    .from('analytics_events_daily')
    .select('date')
    .lte('date', maxDateKey)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`fetchLatestAggregateDate error: ${error.message}`);
  return data?.date || null;
}

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
 * Full maintenance cycle. Prunes capi_event_logs > CAPI_RETENTION_DAYS (5d)
 * unconditionally (they are never aggregated). Then aggregates yesterday (UTC day)
 * and, only on aggregation success, deletes analytics_events > RAW_RETENTION_DAYS
 * (14d) — analytics raw cleanup is skipped if aggregation fails to avoid data loss.
 */
export async function runAnalyticsMaintenance(supabase) {
  const now = new Date();

  // CAPI event logs are never aggregated, so their cleanup must run unconditionally
  // and must NOT be gated behind analytics aggregation success. (A stalled/failing
  // aggregation previously skipped all cleanup, letting CAPI logs pile up indefinitely.)
  // Prune them first, isolated in their own try/catch.
  const capiCutoff = retentionCutoffISO(now.getTime(), CAPI_RETENTION_DAYS);
  try {
    const { error: capiErr, count: capiDeleted } = await supabase
      .from('capi_event_logs')
      .delete({ count: 'exact' })
      .lt('created_at', capiCutoff);
    if (capiErr) console.error('[CAPI] Raw cleanup error:', capiErr.message);
    else console.log(`[CAPI] Deleted ${capiDeleted ?? '?'} raw capi_event_logs rows older than ${capiCutoff}`);
  } catch (err) {
    console.error('[CAPI] Raw cleanup threw:', err.message);
  }

  const cutoffDate = new Date(now.getTime() - RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  cutoffDate.setUTCHours(0, 0, 0, 0);
  const yesterdayStart = new Date(now);
  yesterdayStart.setUTCHours(0, 0, 0, 0);
  yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);

  let aggResult = { scanned: 0, upserted: 0, days: 0 };
  try {
    const yesterdayKey = yesterdayStart.toISOString().slice(0, 10);
    const latestAggDate = await fetchLatestAggregateDate(supabase, yesterdayKey);
    const catchupStartKey = latestAggDate
      ? (addUtcDays(latestAggDate, 1) > cutoffDate.toISOString().slice(0, 10)
          ? addUtcDays(latestAggDate, 1)
          : cutoffDate.toISOString().slice(0, 10))
      : cutoffDate.toISOString().slice(0, 10);

    let cursorKey = catchupStartKey;
    while (cursorKey <= yesterdayKey) {
      const nextKey = addUtcDays(cursorKey, 1);
      const dayResult = await aggregateAnalyticsDay(
        supabase,
        startOfUtcDayISO(cursorKey),
        startOfUtcDayISO(nextKey),
      );
      aggResult.scanned += dayResult.scanned;
      aggResult.upserted += dayResult.upserted;
      aggResult.days++;
      if (dayResult.scanned > 0) {
        console.log(`[Analytics] Aggregated ${dayResult.scanned} events into ${dayResult.upserted} daily rows for ${cursorKey}`);
      }
      cursorKey = nextKey;
    }
    if (aggResult.days === 0) {
      console.log('[Analytics] Daily aggregate already current');
    } else {
      console.log(`[Analytics] Catch-up complete: ${aggResult.days} day(s), ${aggResult.scanned} events, ${aggResult.upserted} daily rows`);
    }
  } catch (err) {
    console.error('[Analytics] Aggregation failed, skipping cleanup:', err.message);
    return { aggregated: false };
  }

  // Align DELETE cutoff to UTC midnight so cleanup never deletes a partial day
  // before it has been eligible for daily aggregation.
  const cutoff = cutoffDate.toISOString();

  const { error: e1, count: analyticsDeleted } = await supabase
    .from('analytics_events')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff);
  if (e1) console.error('[Analytics] Raw cleanup error:', e1.message);
  else console.log(`[Analytics] Deleted ${analyticsDeleted ?? '?'} raw analytics_events rows older than ${cutoff}`);

  return { aggregated: true, ...aggResult };
}

/**
 * Fetch events for a time range, using daily aggregate rows for complete days
 * that are already rolled up and raw analytics_events for the uncovered edges.
 *
 * The maintenance cron catch-up keeps the daily aggregate current through
 * yesterday. If it falls behind, this read path starts raw reads after the last
 * known aggregate date, preserving correctness while the cron catches up.
 *
 * @returns {Promise<{rawEvents: Array, aggEvents: Array}>}
 */
export async function fetchEventsForRange(supabase, startISO, endISO) {
  const nowMs = Date.now();
  const today = new Date(nowMs);
  today.setUTCHours(0, 0, 0, 0);
  const yesterdayKey = dateKeyFromMs(today.getTime() - 24 * 60 * 60 * 1000);
  const latestAggDate = await fetchLatestAggregateDate(supabase, yesterdayKey);
  const split = computeDailyReadPlan(startISO, endISO, nowMs, latestAggDate);
  let rawEvents = [];
  let aggEvents = [];

  for (const rawRange of split.rawRanges || []) {
    const rows = await fetchAllPages(
      supabase
        .from('analytics_events')
        .select('agent_id, event_type, event_name, metadata, created_at')
        .gte('created_at', rawRange.startISO)
        .lte('created_at', rawRange.endISO),
      'fetchEventsForRange raw error',
    );
    rawEvents.push(...rows);
  }

  if (split.useAgg) {
    aggEvents = await fetchAllPages(
      supabase
        .from('analytics_events_daily')
        .select('date, agent_id, event_type, event_name, count')
        .gte('date', split.aggStartDate)
        .lte('date', split.aggEndDate),
      'fetchEventsForRange agg error',
    );
  }

  // Return raw DESC by created_at — the natural ordering for read-path consumers.
  rawEvents.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return { rawEvents, aggEvents };
}
