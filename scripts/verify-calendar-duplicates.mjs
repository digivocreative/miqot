#!/usr/bin/env node
// Read-only. Menghitung duplikat (tanggal, tipe, jadwal_id) di calendar_events.
//
// Dua baris pada kombinasi yang sama TIDAK selalu salah: satu jadwal boleh
// punya dua kloter (mis. JBU1542 grup 69 + 70). Pembedanya `synced_at` —
// kalau semuanya berasal dari satu snapshot, itu sah; kalau beda snapshot,
// itu baris hantu sisa penomoran ulang kloter di sistem hulu.
//
// Jalankan: node --env-file=.env scripts/verify-calendar-duplicates.mjs [YYYY-MM-DD]
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const RANGE_START = process.argv[2] || '2026-07-01';

const { data, error } = await supabase
  .from('calendar_events')
  .select('id, event_date, event_type, group_number, jadwal_id, synced_at')
  .gte('event_date', RANGE_START);

if (error) {
  console.error('Query gagal:', error.message);
  process.exit(1);
}

const byKey = new Map();
for (const row of data) {
  if (!row.jadwal_id) continue;
  const key = `${row.event_date}|${row.event_type}|${row.jadwal_id}`;
  if (!byKey.has(key)) byKey.set(key, []);
  byKey.get(key).push(row);
}

const dupes = [...byKey.entries()].filter(([, rows]) => rows.length > 1);
const excess = dupes.reduce((sum, [, rows]) => sum + rows.length - 1, 0);
const ghosts = dupes.filter(([, rows]) => new Set(rows.map(r => r.synced_at)).size > 1);

console.log(`Rentang           : event_date >= ${RANGE_START}`);
console.log(`Total baris       : ${data.length}`);
console.log(`Kombinasi duplikat: ${dupes.length}`);
console.log(`Baris berlebih    : ${excess}`);
console.log('');

for (const [key, rows] of dupes) {
  const verdict = new Set(rows.map(r => r.synced_at)).size === 1
    ? 'SAH   '
    : 'HANTU ';
  const detail = rows
    .map(r => `grp${r.group_number}@${String(r.synced_at).slice(0, 10)}`)
    .join(' | ');
  console.log(`  ${verdict} ${key} -> ${detail}`);
}

console.log('');
console.log(`Kombinasi HANTU tersisa: ${ghosts.length} (target setelah perbaikan: 0)`);
process.exit(ghosts.length === 0 ? 0 : 1);
