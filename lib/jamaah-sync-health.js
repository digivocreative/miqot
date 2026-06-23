// Pure decision helper: classify an agent's jamaah-sync health from persisted
// fields only. No IO. Single source of truth for THREE consumers:
//   1. the profile "SISTEM INTERNAL" badge (honest connected vs. needs-relogin)
//   2. the admin agent-management watchlist
//   3. the daily Telegram ops alert
//
// Why staleness of last_jamaah_sync_at is a robust, mode-agnostic signal:
// a healthy agent bumps last_jamaah_sync_at on EVERY completed background cycle
// (full or partial), even when 0 rows changed (see lib/awapi-sync-outcome.js →
// shouldBump). An agent whose internal-system login is rejected never obtains an
// AWAPI key (server.js ensureAwapiCredentials → "[awapi/lazy] … login failed"),
// and one whose every endpoint 403s hits `hardfail` (no bump). In both failure
// modes the timestamp simply freezes — so "how long since the last bump" cleanly
// separates flowing from stuck without needing per-mode error columns.

// Background sync pauses overnight (~11h: jobs run ~08–21 WIB) and on shorter
// weekend hours, so the threshold must comfortably exceed the longest legitimate
// quiet stretch. 48h spans a full quiet gap without false-flagging a healthy
// agent, while genuinely stuck agents are stale by days/weeks.
export const SYNC_STALE_HOURS = Number(process.env.JAMAAH_SYNC_STALE_HOURS) || 48;

// Status values (exported for callers that prefer constants over string literals).
export const SYNC_HEALTH = {
  OK: 'ok',                         // credentials present, synced within threshold
  STALE: 'stale',                   // credentials present, sync older than threshold → needs re-login
  PENDING: 'pending',               // credentials present, never synced yet (fresh connect)
  DISCONNECTED: 'disconnected',     // NO credentials now, but synced before → had data, creds lost/removed
  NO_CREDENTIALS: 'no_credentials', // no credentials and never synced — never onboarded
};

const HOUR_MS = 3600 * 1000;

// agent: any object exposing { jamaah_username, jamaah_password, last_jamaah_sync_at }.
// jamaah_password may be a masked placeholder (e.g. '••••••' from the admin list) —
// only its truthiness is used, never its value.
export function classifyJamaahSyncHealth(agent, { now = Date.now(), staleHours = SYNC_STALE_HOURS } = {}) {
  const hasCredentials = !!(agent && agent.jamaah_username && agent.jamaah_password);
  const lastSync = (agent && agent.last_jamaah_sync_at) || null;
  const ts = lastSync == null ? null : (typeof lastSync === 'number' ? lastSync : Date.parse(lastSync));
  const ageHours = (ts != null && Number.isFinite(ts)) ? (now - ts) / HOUR_MS : null;

  if (!hasCredentials) {
    // A prior sync timestamp means the agent WAS connected and accumulating
    // jamaah, so credentials were since removed/lost and their data is now going
    // stale — surface as 'disconnected'. With no history they simply never
    // onboarded — 'no_credentials' (ignored by watchlists).
    if (lastSync) {
      return { status: SYNC_HEALTH.DISCONNECTED, hasCredentials: false, lastSync, ageHours };
    }
    return { status: SYNC_HEALTH.NO_CREDENTIALS, hasCredentials: false, lastSync: null, ageHours: null };
  }

  if (ageHours == null) {
    // Credentials present but no parseable sync yet — first sync pending.
    return { status: SYNC_HEALTH.PENDING, hasCredentials: true, lastSync, ageHours: null };
  }

  const status = ageHours > staleHours ? SYNC_HEALTH.STALE : SYNC_HEALTH.OK;
  return { status, hasCredentials: true, lastSync, ageHours };
}

// Convenience predicate: does this status mean jamaah data has stopped flowing
// and warrants operator attention? Both 'stale' (creds rejected) and
// 'disconnected' (creds gone) stop the data; 'pending' is excluded because a
// just-connected agent legitimately has no sync yet.
export function isSyncStuck(status) {
  return status === SYNC_HEALTH.STALE || status === SYNC_HEALTH.DISCONNECTED;
}

// ── Payment-representation invariants (2026-06-23) ──
//
// AWAPI reports multi-pax booking payment as a booking-level aggregate replicated
// on every pax row (per-pax paket_harga → negative bayar_sisa / "LEBIH BAYAR")
// with NO per-pax allocation. When the sync mis-reconciles that into the per-pax
// bayar/sisa COLUMNS, jamaah silently show the wrong payment status in BOTH
// directions — the Yulianti Kusuma report (paid jamaah shown belum-bayar) and its
// dangerous inverse (unpaid jamaah shown lunas → agent never collects). Neither
// shows up in sync-freshness; this invariant catches them directly. Had it run,
// it would have surfaced the 252 false-unpaid rows on day one.
//
// Pure: pass plain rows already projected from the DB. Each row needs:
//   { jm_id, id_umroh, nama, bayar, sisa, raw_bayar, raw_bayar_sisa,
//     raw_paket_harga, payment_guard }
// where raw_* come from raw_data->>'bayar' / 'bayar_sisa' / 'paket_harga'.
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

export function findPaymentRepresentationAnomalies(rows) {
  const list = Array.isArray(rows) ? rows : [];

  // INV-1 (false-unpaid): the row's booking reported real AWAPI payment
  // (raw bayar>0, aggregate shape) yet the row shows belum-bayar (bayar=0, sisa>0).
  // Per-row — no booking context needed; the strongest, cheapest signal.
  const falseUnpaid = [];

  // Group by booking for INV-2 (needs the booking-level money model).
  const byBooking = new Map();
  for (const r of list) {
    const rawBayar = num(r.raw_bayar);
    const rawSisa = num(r.raw_bayar_sisa);
    const colBayar = num(r.bayar) || 0;
    const colSisa = num(r.sisa) || 0;
    if (colBayar === 0 && colSisa > 0 && rawBayar !== null && rawBayar > 0 && rawSisa !== null && rawSisa < 0) {
      falseUnpaid.push({ jm_id: r.jm_id, id_umroh: r.id_umroh, nama: r.nama, raw_bayar: rawBayar });
    }
    const key = r.id_umroh || `row:${falseUnpaid.length}`;
    let b = byBooking.get(key);
    if (!b) { b = { rows: [] }; byBooking.set(key, b); }
    b.rows.push(r);
  }

  // INV-2 (false-lunas): on a UNIFORM single-aggregate booking that is genuinely
  // partial (0 < aggregate < Σpaket), any pax shown lunas (sisa<=0) that the agent
  // did NOT manually confirm is phantom payment. Multi-subgroup / price-unknown
  // bookings are skipped (ambiguous — mirror allocateAggregatePartialRow's gate).
  const falseLunas = [];
  for (const [id_umroh, b] of byBooking) {
    const aggValues = new Set();
    let sumPaket = 0;
    let priceKnown = true;
    for (const r of b.rows) {
      const rawSisa = num(r.raw_bayar_sisa);
      const rawBayar = num(r.raw_bayar);
      const paket = num(r.raw_paket_harga);
      if (paket === null || paket <= 0) priceKnown = false; else sumPaket += paket;
      if (rawSisa !== null && rawSisa < 0 && rawBayar !== null && rawBayar > 0) aggValues.add(rawBayar);
    }
    if (aggValues.size !== 1 || !priceKnown || sumPaket <= 0) continue; // not a clean uniform partial
    const aggregate = [...aggValues][0];
    if (aggregate <= 0 || aggregate >= sumPaket) continue; // not partial
    for (const r of b.rows) {
      const colSisa = num(r.sisa) || 0;
      const paket = num(r.raw_paket_harga);
      const isManual = r.payment_guard === 'manual_confirmed_lunas_after_awapi_anomaly';
      if (colSisa <= 0 && paket !== null && paket > 0 && !isManual) {
        falseLunas.push({ jm_id: r.jm_id, id_umroh, nama: r.nama, aggregate, sum_paket: sumPaket });
      }
    }
  }

  return {
    falseUnpaid,
    falseLunas,
    falseUnpaidCount: falseUnpaid.length,
    falseLunasCount: falseLunas.length,
    clean: falseUnpaid.length === 0 && falseLunas.length === 0,
  };
}
