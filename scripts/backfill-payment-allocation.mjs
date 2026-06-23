// One-off backfill: re-reconcile per-pax bayar/sisa for PURE-UNIFORM aggregate
// bookings using the SAME production functions the sync now uses, so backfilled
// rows match steady-state output exactly.
//
// Scope (provably safe subset only): bookings where EVERY pax row is aggregate-
// shape (raw bayar_sisa < 0), all rows share ONE aggregate value, and every paket
// is known (>0). For these:
//   - full-paid (aggregate >= Σpaket)      → resolveAggregateBookingLunasRow → lunas
//   - partial   (0 < aggregate < Σpaket)   → allocateAggregatePartialRow → proportional
// Mixed / multi-subgroup / price-unknown bookings are LEFT UNTOUCHED and reported
// for manual review (the conservative direction — never risk a false-lunas).
// Manual-confirmed-lunas pax are skipped (authoritative).
//
// Bypasses the sync path entirely (direct Supabase update by id) so it does NOT
// trip detectUmrohJamaahSyncEvents → no synthetic "pembayaran masuk" Telegram.
// Idempotent: recomputes from the raw aggregate each run; only changed rows write.
//
// Usage:
//   node scripts/backfill-payment-allocation.mjs           # DRY RUN (default)
//   node scripts/backfill-payment-allocation.mjs --apply   # write changes
//   node scripts/backfill-payment-allocation.mjs --apply --booking AIW0028669

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import {
  buildBookingPriceIndex,
  resolveAggregateBookingLunasRow,
  allocateAggregatePartialRow,
  hasSuspiciousAwapiPayment,
} from '../awapi-client.js';

const APPLY = process.argv.includes('--apply');
const ONLY_BOOKING = (() => {
  const i = process.argv.indexOf('--booking');
  return i >= 0 ? process.argv[i + 1] : null;
})();

const GUARD_KEYS = [
  'awapi_refresh_snapshot', 'payment_guard', 'payment_normalized',
  'payment_neutralized', 'suspicious_awapi_payment_snapshot', 'preserved_payment_snapshot',
];
function stripGuard(raw) {
  const o = { ...(raw && typeof raw === 'object' ? raw : {}) };
  for (const k of GUARD_KEYS) delete o[k];
  return o;
}
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

async function main() {
  // Page through jamaah (or one booking) and keep only pure-uniform bookings.
  const all = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = sb.from('jamaah')
      .select('id, agent_id, id_umroh, jm_id, nama, bayar, sisa, diskon_kantor, diskon_marketing, raw_data')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (ONLY_BOOKING) q = sb.from('jamaah')
      .select('id, agent_id, id_umroh, jm_id, nama, bayar, sisa, diskon_kantor, diskon_marketing, raw_data')
      .eq('id_umroh', ONLY_BOOKING);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (ONLY_BOOKING || data.length < PAGE) break;
  }

  // 2. Group by (agent_id, id_umroh) — the sync reconciles per-agent, so two
  //    agents that both synced the same booking must NOT be merged (it would
  //    inflate Σpaket / trip the pure-uniform gate and skip a clean booking).
  const byBooking = new Map();
  for (const r of all) {
    const k = `${r.agent_id}|${r.id_umroh}`;
    if (!byBooking.has(k)) byBooking.set(k, []);
    byBooking.get(k).push(r);
  }

  let pureUniformBk = 0, fullBk = 0, partialBk = 0, skippedBk = 0;
  const changes = [];

  for (const [, rows] of byBooking) {
    const idUmroh = rows[0].id_umroh;
    // Pure-uniform gate: every row aggregate-shape (raw bayar_sisa<0), one aggregate
    // value, all paket>0, no manual-confirmed pax.
    const aggVals = new Set();
    let pureUniform = true;
    for (const r of rows) {
      const raw = r.raw_data || {};
      const rawSisa = num(raw.bayar_sisa);
      const rawBayar = num(raw.bayar);
      const rawPaket = num(raw.paket_harga);
      const guard = raw.payment_guard;
      if (guard === 'manual_confirmed_lunas_after_awapi_anomaly') { pureUniform = false; break; }
      if (rawSisa === null || rawSisa >= 0) { pureUniform = false; break; }
      if (rawBayar === null || rawBayar <= 0) { pureUniform = false; break; }
      if (rawPaket === null || rawPaket <= 0) { pureUniform = false; break; }
      aggVals.add(rawBayar);
    }
    if (!pureUniform || aggVals.size !== 1) { skippedBk++; continue; }
    pureUniformBk++;

    // 3. Reconstruct each row to its raw AWAPI shape, build the price index.
    const reconstructed = rows.map(r => {
      const cleanRaw = stripGuard(r.raw_data);
      return {
        _id: r.id, _orig: r,
        agent_id: r.agent_id, id_umroh: r.id_umroh, jm_id: r.jm_id, nama: r.nama,
        bayar: num(cleanRaw.bayar), sisa: num(cleanRaw.bayar_sisa),
        diskon_kantor: num(r.diskon_kantor), diskon_marketing: num(r.diskon_marketing),
        raw_data: cleanRaw,
      };
    });
    const index = buildBookingPriceIndex(reconstructed, []);
    const booking = index.get(idUmroh);
    const isFull = booking && booking.priceKnown && booking.priceTotal > 0
      && (num(booking.priceTotal) <= [...aggVals][0]);
    if (isFull) fullBk++; else partialBk++;

    for (const row of reconstructed) {
      let out = null;
      const resolved = resolveAggregateBookingLunasRow(row, booking);
      if (resolved) out = resolved;
      else if (hasSuspiciousAwapiPayment(row)) {
        const alloc = allocateAggregatePartialRow(row, booking);
        if (alloc) out = alloc;
      }
      if (!out) continue; // unprovable → leave original row untouched

      const orig = row._orig;
      // Only write rows whose per-pax bayar/sisa VALUE actually changes (the real
      // corrections: false-unpaid 0→positive, false-lunas lunas→cicilan). Skip
      // cosmetic raw_data-only re-stamps — they upgrade format on the next real
      // sync and writing ~900 of them would burn Disk-IO budget for nothing.
      const valueChanged = num(orig.bayar) !== num(out.bayar) || num(orig.sisa) !== num(out.sisa);
      if (!valueChanged) continue;
      changes.push({
        id: row._id, id_umroh: idUmroh, jm_id: row.jm_id, nama: row.nama,
        from: { bayar: num(orig.bayar), sisa: num(orig.sisa) },
        to: { bayar: out.bayar, sisa: out.sisa },
        kind: resolved ? 'lunas' : 'partial',
        raw_data: out.raw_data, bayar: out.bayar, sisa: out.sisa,
      });
    }
  }

  // 4. Report.
  console.log(`\n=== Backfill payment allocation (${APPLY ? 'APPLY' : 'DRY RUN'}${ONLY_BOOKING ? ` booking=${ONLY_BOOKING}` : ''}) ===`);
  console.log(`bookings scanned: ${byBooking.size} | pure-uniform: ${pureUniformBk} (full ${fullBk}, partial ${partialBk}) | skipped (mixed/multisub/price-unknown): ${skippedBk}`);
  console.log(`rows to change: ${changes.length} (${changes.filter(c => c.kind === 'lunas').length} → lunas, ${changes.filter(c => c.kind === 'partial').length} → proportional)`);
  const falseUnpaidFix = changes.filter(c => c.from.bayar === 0);
  const falseLunasFix = changes.filter(c => c.from.sisa <= 0 && c.to.sisa > 0);
  console.log(`  ↳ false-unpaid fixed (bayar 0→+): ${falseUnpaidFix.length} | false-lunas fixed (lunas→owing, will (re)enable pelunasan reminders): ${falseLunasFix.length}`);
  console.log(`  ↳ bookings touched: ${new Set(changes.map(c => c.id_umroh)).size}`);
  const sample = changes.slice(0, 12);
  for (const c of sample) {
    console.log(`  ${c.id_umroh} ${String(c.nama).padEnd(26)} bayar ${c.from.bayar}→${c.to.bayar}  sisa ${c.from.sisa}→${c.to.sisa}  [${c.kind}]`);
  }
  if (changes.length > sample.length) console.log(`  … and ${changes.length - sample.length} more`);

  if (!APPLY) {
    console.log('\nDRY RUN — no writes. Re-run with --apply to commit.');
    return;
  }

  // 5. Snapshot the affected rows, then write (direct update by id — bypasses sync events).
  if (changes.length === 0) { console.log('\nNothing to write.'); return; }
  const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const ids = changes.map(c => c.id);
  const { data: snapRows } = await sb.from('jamaah')
    .select('id, jm_id, id_umroh, nama, bayar, sisa, raw_data').in('id', ids);
  await sb.from('jamaah_payment_backfill_snapshot').insert(
    (snapRows || []).map(r => ({ ...r, snapshot_tag: stamp })),
  );
  console.log(`\nSnapshotted ${snapRows?.length || 0} rows into jamaah_payment_backfill_snapshot (tag ${stamp}).`);

  let written = 0, failed = 0;
  for (const c of changes) {
    const { error } = await sb.from('jamaah')
      .update({ bayar: c.bayar, sisa: c.sisa, raw_data: c.raw_data })
      .eq('id', c.id);
    if (error) { failed++; if (failed <= 5) console.warn(`  update ${c.id} failed: ${error.message}`); }
    else written++;
  }
  console.log(`\nWrote ${written} rows, ${failed} failed.`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
