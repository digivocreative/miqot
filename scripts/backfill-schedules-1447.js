/**
 * One-shot backfill: sync umroh_schedules untuk year_code 1447.
 *
 * Cron `syncUmrohSchedules` di server.js historically only ran ['1448', '1449'].
 * Akibatnya 2.892 jamaah year 1447 tidak punya jadwal_nama lookup → fallback ke
 * kategori paket lama. Skrip ini fetch 1447 dari API resmi & upsert ke
 * `umroh_schedules` dengan logic yang sama persis dengan cron (`hasValidPricing`
 * filter + onConflict 'jadwal_id,year_code').
 *
 * Setelah ini jalan, server.js juga sudah di-update agar cron berikutnya
 * include 1447, jadi skrip ini hanya perlu dijalankan sekali untuk seeding.
 *
 * Run: node scripts/backfill-schedules-1447.js
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const YEAR = '1447';
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function hasValidPricing(paket_harga) {
  if (!paket_harga || typeof paket_harga !== 'object') return false;
  for (const hotelTier of Object.values(paket_harga)) {
    if (!hotelTier || typeof hotelTier !== 'object') continue;
    for (const [roomType, price] of Object.entries(hotelTier)) {
      if (!roomType) continue;
      const n = Number(price);
      if (Number.isFinite(n) && n > 0) return true;
    }
  }
  return false;
}

async function backfill() {
  console.log(`[Backfill ${YEAR}] Fetching from upstream...`);
  const res = await fetch(`https://jadwal.alhijaz.co/jadwal/api-get/${YEAR}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`Upstream HTTP ${res.status}`);
  }
  const json = await res.json();
  const packages = json.aaData || [];
  console.log(`[Backfill ${YEAR}] Upstream returned ${packages.length} packages`);

  const validPackages = [];
  const rejected = [];
  for (const p of packages) {
    if (hasValidPricing(p.paket_harga)) {
      validPackages.push(p);
    } else {
      rejected.push({ jadwal_id: p.jadwal_id, jadwal_nama: p.jadwal_nama });
    }
  }
  console.log(`[Backfill ${YEAR}] Valid: ${validPackages.length}, Rejected (no pricing): ${rejected.length}`);
  if (rejected.length > 0) {
    console.log(`[Backfill ${YEAR}] Sample rejected:`, rejected.slice(0, 5));
  }

  const rows = validPackages.map(p => ({
    jadwal_id: p.jadwal_id,
    year_code: YEAR,
    jadwal_nama: p.jadwal_nama,
    promo: p.promo,
    seat_total: p.seat_total,
    seat_sisa: p.seat_sisa,
    maskapai: p.maskapai,
    berangkat_tgl: /^\d{4}-\d{2}-\d{2}$/.test(p.berangkat_tgl) ? p.berangkat_tgl : null,
    berangkat_jam: p.berangkat_jam,
    berangkat_rute: p.berangkat_rute,
    berangkat_kode_penerbangan: p.berangkat_kode_penerbangan,
    pulang_tgl: /^\d{4}-\d{2}-\d{2}$/.test(p.pulang_tgl) ? p.pulang_tgl : null,
    pulang_jam: p.pulang_jam,
    pulang_rute: p.pulang_rute,
    pulang_kode_penerbangan: p.pulang_kode_penerbangan,
    manasik_tgl: p.manasik_tgl,
    manasik_jam: p.manasik_jam,
    brosur: p.brosur,
    itinerary: p.itinerary,
    perlengkapan_harga: p.perlengkapan_harga,
    paket_harga: p.paket_harga,
    paket_hotel: p.paket_hotel,
    synced_at: new Date().toISOString(),
  }));

  if (rows.length === 0) {
    console.log(`[Backfill ${YEAR}] Nothing to upsert. Done.`);
    return;
  }

  console.log(`[Backfill ${YEAR}] Upserting ${rows.length} rows...`);
  const { error } = await supabase
    .from('umroh_schedules')
    .upsert(rows, { onConflict: 'jadwal_id,year_code' });

  if (error) {
    throw new Error(`Upsert failed: ${error.message}`);
  }

  // Verify
  const { count } = await supabase
    .from('umroh_schedules')
    .select('*', { count: 'exact', head: true })
    .eq('year_code', YEAR);

  console.log(`[Backfill ${YEAR}] ✅ Done. ${count} rows in umroh_schedules for year_code=${YEAR}`);
}

backfill().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
