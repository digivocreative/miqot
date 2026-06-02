// Jamaah upsert sizing + change-detection helpers — pure, unit-tested, no I/O.
//
// Incident 2026-06-02 (Disk IO throttling → Cloudflare 522 / "DB melambat"):
// the background sync re-upserted EVERY fetched jamaah row each cycle in batches of
// 50. On this small Supabase instance work_mem is only ~3.4 MB, so each wide-row
// 50-batch overflowed work_mem and spilled ~1.25 MB to TEMP files on disk per call
// (pg_stat_statements: 331 MB temp written — 100% of the DB's temp IO came from this
// one upsert). Sustained temp-file disk writes drained the Disk IO burst budget,
// the instance throttled to baseline IOPS, and queries stalled (8s timeouts / 522).
//
// Two defenses, both pure here so the decision logic is testable without a DB:
//   1) resolveJamaahUpsertBatch(): a small, env-tunable batch (default 20) so a
//      single upsert statement always fits in work_mem and can never spill.
//   2) partitionChangedJamaahRows(): only upsert rows that are new or whose written
//      columns actually changed, so steady-state cycles write real deltas (far less
//      WAL/IO). The bias is ALWAYS safe: a row is skipped ONLY on an exact
//      fingerprint match; any difference, missing existing row, or representation
//      mismatch falls through to an upsert. Worst case = a redundant write, never
//      stale data.

export const DEFAULT_JAMAAH_UPSERT_BATCH = 20;

/**
 * Resolve the jamaah upsert batch size from the environment (JAMAAH_UPSERT_BATCH).
 * Falls back to the default for missing / non-numeric / out-of-range values so a
 * typo can never restore the temp-spilling 50-row batch. Clamped to [1, 100].
 */
export function resolveJamaahUpsertBatch(env = {}) {
  const n = Number(env.JAMAAH_UPSERT_BATCH);
  if (!Number.isFinite(n)) return DEFAULT_JAMAAH_UPSERT_BATCH;
  const floored = Math.floor(n);
  if (floored < 1) return DEFAULT_JAMAAH_UPSERT_BATCH;
  if (floored > 100) return 100;
  return floored;
}

/**
 * Deterministic, key-sorted serialization. Recursively sorts object keys so that
 * JSONB columns (e.g. raw_data) returned by PostgREST in a different key order than
 * the JS payload don't register as a spurious change.
 */
export function stableStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

/** The jamaah upsert conflict key: agent_id + id_umroh + jm_id, lowercased. */
export function jamaahUpsertKey(row) {
  return `${row?.agent_id}_${row?.id_umroh}_${row?.jm_id}`.toLowerCase();
}

// Columns excluded from the change comparison because they are stamped fresh every
// sync regardless of content. This MIRRORS the DB trigger skip_noop_update_jamaah,
// which no-ops an UPDATE when `to_jsonb(NEW) - 'synced_at' = to_jsonb(OLD) - 'synced_at'`.
// Excluding the same key here means a row we skip is exactly a row the trigger would
// already turn into a no-op — so skipping changes nothing except avoiding the wasted
// payload round-trip and its temp-file spill. normalizeAwapiRow stamps synced_at =
// new Date().toISOString() on every row (awapi-client.js), which is why a naive
// all-columns diff never skipped anything.
// Columns excluded from the change comparison because they carry per-fetch-VOLATILE
// data (not business state), so they differ every cycle even when nothing real changed:
//   - synced_at: stamped `new Date().toISOString()` on every row (awapi-client.js).
//   - raw_data: the source-snapshot jsonb. stampPaymentRaw() writes a fresh
//     payment_synced_at into it each sync, AND the AWAPI payload embeds short-lived
//     tokenised document URLs (e.g. dokumen_pernyataan) that regenerate on EVERY
//     fetch. The app never trusts the stored URL — it re-resolves a fresh one
//     just-in-time (server.js resolveFreshUmrohPernyataanUrl) — so a stale raw_data
//     snapshot on a skipped row is harmless. Every business field (bayar, sisa,
//     nama, dates, dokumen status, perlengkapan, diskon, paspor, …) lives in its own
//     column, which IS compared, so real changes are still detected and written.
// This is why an all-columns diff (or one excluding only synced_at) never skipped a
// single row: raw_data changes every cycle, on every row.
export const VOLATILE_JAMAAH_KEYS = new Set(['synced_at', 'raw_data']);

/**
 * True only when every column we are about to WRITE (the payload's own keys), other
 * than the volatile ones, serializes identically to the existing DB row — i.e. the
 * upsert would be a no-op apart from volatile snapshot/timestamp churn. Compares only
 * payload keys, so partial payloads (defaultToNull:false) are handled correctly:
 * columns the sync doesn't write are ignored.
 */
export function jamaahRowUnchanged(payloadRow, existingRow, ignoreKeys = VOLATILE_JAMAAH_KEYS) {
  return firstJamaahDiffKey(payloadRow, existingRow, ignoreKeys) === null;
}

/**
 * Diagnostic counterpart to jamaahRowUnchanged: returns the FIRST payload column
 * whose written value differs from the existing DB row (ignoring volatile keys), or
 * null when the row is unchanged. `existingRow` absent → returns '<no-existing-row>'.
 */
export function firstJamaahDiffKey(payloadRow, existingRow, ignoreKeys = VOLATILE_JAMAAH_KEYS) {
  if (!payloadRow) return '<no-payload>';
  if (!existingRow) return '<no-existing-row>';
  for (const k of Object.keys(payloadRow)) {
    if (ignoreKeys && ignoreKeys.has(k)) continue;
    if (stableStringify(payloadRow[k]) !== stableStringify(existingRow[k])) return k;
  }
  return null;
}

/**
 * Split rows into the ones that must be written vs. the ones safe to skip.
 *
 * @param {Array<object>} rows - the payload rows that would be upserted
 * @param {Map<string,object>|null} existingByKey - current DB rows keyed by
 *        jamaahUpsertKey(). Pass null/undefined to disable skipping entirely
 *        (the safe fallback when the existing-rows fetch failed).
 * @returns {{changed: object[], skippedCount: number}}
 */
export function partitionChangedJamaahRows(rows, existingByKey, ignoreKeys = VOLATILE_JAMAAH_KEYS) {
  const list = Array.isArray(rows) ? rows : [];
  if (!existingByKey || typeof existingByKey.get !== 'function') {
    return { changed: list.slice(), skippedCount: 0 };
  }
  const changed = [];
  let skippedCount = 0;
  for (const row of list) {
    const existing = existingByKey.get(jamaahUpsertKey(row));
    if (existing && jamaahRowUnchanged(row, existing, ignoreKeys)) skippedCount++;
    else changed.push(row);
  }
  return { changed, skippedCount };
}
