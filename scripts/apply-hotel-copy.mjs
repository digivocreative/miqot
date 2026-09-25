#!/usr/bin/env node
// Terapkan tulisan ulang description / faq / agent_note Direktori Hotel dari
// manifest JSON — dipakai untuk penulisan ulang massal 2026-09-25 ke gaya
// pendek & ramah orang tua (description ≤450 karakter, catatan untuk agent
// dipindah ke agent_note).
//
// Manifest = JSON array [{ slug, description, faq, agent_note }]. Kolom lain
// (nama, bintang, jarak, alamat, fasilitas, rating, media) tidak pernah
// disentuh.
//
// Penjaga balapan: snapshot = JSON array baris hotel yang dibaca SEBELUM
// manifest ditulis. Kalau description/faq/agent_note di DB sudah berbeda dari
// snapshot, tulisan ulang itu disusun dari isi basi — hotel dilewati sebagai
// BENTROK dan perlu ditulis ulang dari isi terbarunya. Perubahan kolom lain
// (mis. admin mengunggah foto) sengaja TIDAK dianggap bentrok. Update-nya
// sendiri bersyarat pada updated_at yang baru dibaca, menutup celah baca-tulis.
//
// Jalankan: node --env-file=.env scripts/apply-hotel-copy.mjs <manifest.json> <snapshot.json> [--dry]
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { buildHotelPayload } from '../lib/hotel-directory.js';

const [manifestPath, snapshotPath] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DRY = process.argv.includes('--dry');
if (!manifestPath || !snapshotPath) {
  console.error('Pemakaian: node --env-file=.env scripts/apply-hotel-copy.mjs <manifest.json> <snapshot.json> [--dry]');
  process.exit(1);
}

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Env belum lengkap: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const FIELDS = ['description', 'faq', 'agent_note'];
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const snapshotBySlug = new Map(JSON.parse(readFileSync(snapshotPath, 'utf8')).map((r) => [r.slug, r]));

async function main() {
  const counts = { updated: 0, unchanged: 0, conflict: 0, failed: 0 };
  for (const entry of manifest) {
    const { data: row, error: readError } = await supabase
      .from('hotels')
      .select('*')
      .eq('slug', entry.slug)
      .maybeSingle();
    if (readError) throw readError;
    if (!row) {
      console.error(`  TIDAK ADA       ${entry.slug}`);
      counts.failed += 1;
      continue;
    }
    const base = snapshotBySlug.get(entry.slug);
    if (!base || FIELDS.some((f) => !isDeepStrictEqual(base[f] ?? null, row[f] ?? null))) {
      console.error(`  BENTROK         ${row.name}: disunting setelah snapshot — dilewati`);
      counts.conflict += 1;
      continue;
    }

    // Validasi dengan aturan PUT /api/hotels/:id atas baris gabungan; media
    // dikeluarkan karena tidak ditulis dan validatornya butuh prefix CDN server.
    const { media: _media, ...rowWithoutMedia } = row;
    const built = buildHotelPayload({ ...rowWithoutMedia, ...Object.fromEntries(FIELDS.map((f) => [f, entry[f]])) });
    if (!built.ok) {
      console.error(`  GAGAL VALIDASI  ${row.name}: ${built.error}`);
      counts.failed += 1;
      continue;
    }
    const update = {};
    for (const field of FIELDS) {
      if (!isDeepStrictEqual(built.data[field], row[field])) update[field] = built.data[field];
    }
    if (Object.keys(update).length === 0) {
      counts.unchanged += 1;
      continue;
    }

    if (DRY) {
      console.log(`  [dry] TULIS     ${row.name}: ${Object.keys(update).join(', ')}`);
      counts.updated += 1;
      continue;
    }
    const { data: written, error: writeError } = await supabase
      .from('hotels')
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('updated_at', row.updated_at)
      .select('slug');
    if (writeError) {
      console.error(`  GAGAL UPDATE    ${row.name}: ${writeError.message}`);
      counts.failed += 1;
      continue;
    }
    if (!written || written.length === 0) {
      console.error(`  BENTROK         ${row.name}: berubah saat skrip berjalan — dilewati`);
      counts.conflict += 1;
      continue;
    }
    console.log(`  TULIS           ${row.name}: ${Object.keys(update).join(', ')}`);
    counts.updated += 1;
  }
  console.log(
    `\n${DRY ? '[dry] ' : ''}Selesai: ${counts.updated} ditulis, ${counts.unchanged} sudah sama, ` +
      `${counts.conflict} bentrok, ${counts.failed} gagal.`,
  );
  if (counts.conflict || counts.failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
