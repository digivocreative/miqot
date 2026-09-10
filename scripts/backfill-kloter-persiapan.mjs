// Salin checklist kloter lama dari booking_persiapan.tahapan[slug].jamaah ke
// tabel kloter_persiapan (satu baris per jamaah). Jalankan SETELAH
// migrations/20260910000000_kloter_persiapan.sql dieksekusi di Supabase.
//
//   node scripts/backfill-kloter-persiapan.mjs          # dry-run, cuma laporan
//   node scripts/backfill-kloter-persiapan.mjs --apply  # tulis sungguhan
//
// Idempoten: baris yang sudah ada di kloter_persiapan dan lebih baru dari
// entri lama tidak ditimpa.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { KLOTER_TRIPS } from '../src/lib/kloterLanding.js';

const apply = process.argv.includes('--apply');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);

let planned = 0;
let written = 0;
let skipped = 0;

for (const trip of KLOTER_TRIPS) {
  const memberByNo = new Map(trip.jamaah.map((member) => [member.no, member]));
  const idUmrah = [...new Set(trip.jamaah.map((member) => member.idUmrah))];

  const { data: legacyRows, error: legacyError } = await supabase
    .from('booking_persiapan')
    .select('id_umroh,tahapan')
    .in('id_umroh', idUmrah);
  if (legacyError) throw legacyError;

  const { data: currentRows, error: currentError } = await supabase
    .from('kloter_persiapan')
    .select('jamaah_no,updated_at')
    .eq('trip_slug', trip.slug);
  if (currentError) throw new Error(`kloter_persiapan belum ada? ${currentError.message}`);
  const currentByNo = new Map((currentRows || []).map((row) => [Number(row.jamaah_no), row.updated_at]));

  for (const row of legacyRows || []) {
    const entries = row?.tahapan?.[trip.slug]?.jamaah || {};
    for (const [no, entry] of Object.entries(entries)) {
      const member = memberByNo.get(Number(no));
      if (!member || member.idUmrah !== row.id_umroh) continue;
      const existingAt = currentByNo.get(member.no);
      if (existingAt && entry?.updated_at && existingAt >= entry.updated_at) {
        skipped += 1;
        continue;
      }
      planned += 1;
      console.log(`${apply ? 'TULIS' : 'RENCANA'} ${trip.slug}#${member.no} ${member.name} wa=${entry?.wa_confirmed === true} nusuk=${entry?.nusuk_installed === true}`);
      if (!apply) continue;
      const { error } = await supabase.from('kloter_persiapan').upsert({
        trip_slug: trip.slug,
        jamaah_no: member.no,
        id_umroh: member.idUmrah,
        jamaah_name: member.name,
        phone: typeof entry?.phone === 'string' ? entry.phone : member.phone,
        wa_confirmed: entry?.wa_confirmed === true,
        nusuk_installed: entry?.nusuk_installed === true,
        updated_at: entry?.updated_at || new Date().toISOString(),
      }, { onConflict: 'trip_slug,jamaah_no' });
      if (error) throw error;
      written += 1;
    }
  }
}

console.log(`\n${apply ? 'Ditulis' : 'Akan ditulis'}: ${planned} | dilewati (sudah lebih baru): ${skipped}${apply ? ` | sukses: ${written}` : '  — tambahkan --apply untuk menulis'}`);
