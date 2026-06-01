/**
 * Repair jamaah rows whose normalized `tgl_berangkat` column was corrupted by the
 * legacy laporan month-parser (Indonesian "Des"/"Desember" silently mapped to
 * January). The authoritative AWAPI value survives in `raw_data.tgl_berangkat`,
 * so we restore the column from it and recompute `hijriah_year`.
 *
 * SOURCE OF TRUTH: raw_data.tgl_berangkat (never written). Only `tgl_berangkat`
 * and `hijriah_year` columns are updated, filtered by (agent_id,id_umroh,jm_id).
 *
 * Dry-run by default. Pass --apply to mutate. Idempotent: a second dry-run after
 * --apply must report 0 candidates.
 *
 * Run the parser fix (laporan-api.js) FIRST so the corruption stops recurring.
 *
 *   node scripts/repair-dec-tgl-berangkat.mjs           # dry-run
 *   node scripts/repair-dec-tgl-berangkat.mjs --apply   # mutate
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Mirror of server.js getHijriahYearFromGregorian (HIJRIAH_RANGES + dynamic fallback).
const HIJRIAH_RANGES = [
  { year: '1446', start: '2024-07-08', end: '2025-06-25' },
  { year: '1447', start: '2025-06-26', end: '2026-06-15' },
  { year: '1448', start: '2026-06-16', end: '2027-06-05' },
  { year: '1449', start: '2027-06-06', end: '2028-05-25' },
  { year: '1450', start: '2028-05-26', end: '2029-05-14' },
];
function hijriahYearFromGregorian(dateKey) {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  for (const r of HIJRIAH_RANGES) {
    if (dateKey >= r.start && dateKey <= r.end) return r.year;
  }
  const refDate = new Date('2026-06-16');
  const d = new Date(dateKey);
  if (Number.isNaN(d.getTime())) return null;
  const daysDiff = (d - refDate) / (1000 * 60 * 60 * 24);
  return String(1448 + Math.floor(daysDiff / 354.37));
}

const isValidDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

// Pull rows that carry a raw_data.tgl_berangkat, paginated, and compare in JS.
async function fetchCandidates() {
  const PAGE = 1000;
  let from = 0;
  const out = [];
  for (;;) {
    const { data, error } = await supabase
      .from('jamaah')
      .select('agent_id, id_umroh, jm_id, nama, tgl_berangkat, hijriah_year, raw_data')
      .not('raw_data->>tgl_berangkat', 'is', null)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const row of data) {
      const rawTgl = row.raw_data?.tgl_berangkat ? String(row.raw_data.tgl_berangkat).slice(0, 10) : null;
      if (!isValidDate(rawTgl)) continue;
      const col = row.tgl_berangkat ? String(row.tgl_berangkat).slice(0, 10) : null;
      const newYear = hijriahYearFromGregorian(rawTgl);
      // Candidate when the column date diverges from the authoritative raw value,
      // or the stored hijriah_year disagrees with the recomputed one.
      if (col !== rawTgl || String(row.hijriah_year || '') !== String(newYear || '')) {
        out.push({
          agent_id: row.agent_id, id_umroh: row.id_umroh, jm_id: row.jm_id, nama: row.nama,
          oldTgl: col, newTgl: rawTgl, oldYear: row.hijriah_year, newYear,
        });
      }
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

const candidates = await fetchCandidates();
console.log(`Mode: ${APPLY ? 'APPLY (will mutate)' : 'DRY-RUN (no writes)'}`);
console.log(`Kandidat divergen: ${candidates.length}\n`);

const byAgent = {};
for (const c of candidates) byAgent[c.agent_id] = (byAgent[c.agent_id] || 0) + 1;
console.log('Per agent_id:'); for (const [a, n] of Object.entries(byAgent)) console.log(`  ${a}: ${n}`);
console.log('\nContoh (maks 20):');
for (const c of candidates.slice(0, 20)) {
  console.log(`  ${c.jm_id} | ${c.nama} | tgl ${c.oldTgl} -> ${c.newTgl} | hijriah ${c.oldYear} -> ${c.newYear}`);
}

if (!APPLY) {
  console.log('\nDry-run selesai. Jalankan ulang dengan --apply untuk menerapkan.');
  process.exit(0);
}

let updated = 0, failed = 0;
for (const c of candidates) {
  const { error } = await supabase
    .from('jamaah')
    .update({ tgl_berangkat: c.newTgl, hijriah_year: c.newYear })
    .eq('agent_id', c.agent_id).eq('id_umroh', c.id_umroh).eq('jm_id', c.jm_id);
  if (error) { failed++; console.error(`  ❌ ${c.jm_id}: ${error.message}`); }
  else updated++;
}
console.log(`\n✅ Updated: ${updated} | ❌ Failed: ${failed}`);
process.exit(0);
