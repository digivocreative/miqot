// CLI counterpart to POST /api/laporan/jamaah/confirm-lunas: assert a SPECIFIC
// pax is paid off on a partially-paid aggregate booking AWAPI can't allocate.
// Pins the pax lunas with the trusted manual guard (sync-sticky) and re-allocates
// siblings proportionally over the reduced pot so the booking total stays exact.
//
// Usage:
//   node scripts/confirm-jamaah-lunas.mjs <agentSlug> <id_umroh> <jm_id> [--apply]
//   node scripts/confirm-jamaah-lunas.mjs <agentSlug> <id_umroh> <jm_id> --unconfirm --apply

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import {
  buildBookingPriceIndex,
  resolveAggregateBookingLunasRow,
  allocateAggregatePartialRow,
  guardNewSuspiciousAwapiPaymentRow,
  hasSuspiciousAwapiPayment,
  hasTrustedManualPaymentGuard,
} from '../awapi-client.js';

const [slug, idUmroh, jmId] = process.argv.slice(2);
const APPLY = process.argv.includes('--apply');
const CONFIRM = !process.argv.includes('--unconfirm');
if (!slug || !idUmroh || !jmId) {
  console.error('Usage: node scripts/confirm-jamaah-lunas.mjs <agentSlug> <id_umroh> <jm_id> [--apply] [--unconfirm]');
  process.exit(1);
}

const GUARD_KEYS = ['awapi_refresh_snapshot', 'payment_guard', 'payment_normalized', 'payment_neutralized', 'suspicious_awapi_payment_snapshot', 'preserved_payment_snapshot', 'manual_confirmed_by', 'manual_confirmed_at'];
const stripGuard = (raw) => { const o = { ...(raw && typeof raw === 'object' ? raw : {}) }; for (const k of GUARD_KEYS) delete o[k]; return o; };
const num = (v) => { if (v === null || v === undefined || v === '') return null; const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d-]/g, '')); return Number.isFinite(n) ? n : null; };

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: agent } = await sb.from('agents').select('id, slug').eq('slug', slug).single();
if (!agent) { console.error(`agent ${slug} not found`); process.exit(1); }

const { data: paxRows, error } = await sb.from('jamaah')
  .select('id, agent_id, id_umroh, jm_id, nama, bayar, sisa, diskon_kantor, diskon_marketing, raw_data')
  .eq('agent_id', agent.id).eq('id_umroh', idUmroh);
if (error) { console.error(error.message); process.exit(1); }
const target = (paxRows || []).find(r => String(r.jm_id) === String(jmId));
if (!target) { console.error(`jm ${jmId} not in ${idUmroh}`); process.exit(1); }

const targetPaket = num(target.raw_data?.paket_harga);
if (CONFIRM && !(targetPaket > 0)) { console.error('target paket_harga unknown — cannot confirm'); process.exit(1); }
const now = new Date().toISOString();

const reconstructed = (paxRows || []).map(r => {
  const cleanRaw = stripGuard(r.raw_data);
  const isTarget = String(r.jm_id) === String(jmId);
  const raw_data = (isTarget && CONFIRM) ? { ...cleanRaw, payment_guard: 'manual_confirmed_lunas_after_awapi_anomaly' } : cleanRaw;
  return { _id: r.id, _orig: r, _isTarget: isTarget, agent_id: r.agent_id, id_umroh: r.id_umroh, jm_id: r.jm_id, nama: r.nama, bayar: num(cleanRaw.bayar), sisa: num(cleanRaw.bayar_sisa), diskon_kantor: num(r.diskon_kantor), diskon_marketing: num(r.diskon_marketing), raw_data };
});
const booking = buildBookingPriceIndex(reconstructed, []).get(String(idUmroh));

const updates = [];
for (const row of reconstructed) {
  if (row._isTarget) {
    if (CONFIRM) {
      updates.push({ id: row._id, nama: row.nama, bayar: targetPaket, sisa: 0, raw_data: { ...stripGuard(row.raw_data), payment_guard: 'manual_confirmed_lunas_after_awapi_anomaly', manual_confirmed_by: slug, manual_confirmed_at: now, payment_normalized: { reason: 'manual_confirmed_lunas', paket_harga: targetPaket } } });
    } else {
      const resolved = resolveAggregateBookingLunasRow(row, booking);
      const out = resolved || (hasSuspiciousAwapiPayment(row) ? allocateAggregatePartialRow(row, booking) : null) || guardNewSuspiciousAwapiPaymentRow(row);
      updates.push({ id: row._id, nama: row.nama, bayar: out.bayar, sisa: out.sisa, raw_data: out.raw_data });
    }
    continue;
  }
  if (!hasSuspiciousAwapiPayment(row)) continue;
  if (hasTrustedManualPaymentGuard(row._orig)) continue;
  const resolved = resolveAggregateBookingLunasRow(row, booking);
  const out = resolved || allocateAggregatePartialRow(row, booking);
  if (!out) continue;
  if (num(row._orig.bayar) === num(out.bayar) && num(row._orig.sisa) === num(out.sisa)) continue;
  updates.push({ id: row._id, nama: row.nama, bayar: out.bayar, sisa: out.sisa, raw_data: out.raw_data });
}

console.log(`\n=== confirm-lunas ${CONFIRM ? 'CONFIRM' : 'UNCONFIRM'} ${slug} ${idUmroh} ${jmId} (${APPLY ? 'APPLY' : 'DRY RUN'}) ===`);
for (const u of updates) console.log(`  ${String(u.nama).padEnd(26)} bayar→${u.bayar}  sisa→${u.sisa}${u.id === target.id ? '  [TARGET]' : ''}`);
if (!APPLY) { console.log('\nDRY RUN — re-run with --apply.'); process.exit(0); }

for (const u of updates) {
  const { error: e } = await sb.from('jamaah').update({ bayar: u.bayar, sisa: u.sisa, raw_data: u.raw_data }).eq('id', u.id);
  if (e) { console.error(`update ${u.id} failed: ${e.message}`); process.exit(1); }
}
console.log(`\nWrote ${updates.length} row(s).`);
process.exit(0);
