#!/usr/bin/env node
// Impor PDF "LAMPIRAN ESTIMASI" kantor ke menu Dashboard "Calon Haji 2027".
//
//   node scripts/import-calon-haji.mjs <pdf> [--musim 2027] [--write]
//
// Default DRY-RUN: hanya membaca + mencetak ringkasan. Data baru menimpa data
// musim itu hanya dengan --write (penggantian atomik, lihat lib/calon-haji-store.js).
// Parser menolak PDF dengan nilai yang belum dikenal → tidak ada yang ditulis.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { extractPdfText, parseCalonHajiText } from '../lib/calon-haji-parser.js';
import { replaceCalonHaji } from '../lib/calon-haji-store.js';

const args = process.argv.slice(2);
const pdfPath = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--musim');
const WRITE = args.includes('--write');
const musimIdx = args.indexOf('--musim');
const musim = musimIdx >= 0 ? Number(args[musimIdx + 1]) : 2027;

if (!pdfPath || !Number.isInteger(musim)) {
  console.error('Pakai: node scripts/import-calon-haji.mjs <pdf> [--musim 2027] [--write]');
  process.exit(1);
}

const tally = (rows, key) => rows.reduce((acc, r) => {
  const k = r[key] ?? '-';
  acc[k] = (acc[k] || 0) + 1;
  return acc;
}, {});
const line = (r) => `  ${r.no_urut}. ${r.nama} — ${r.status_cadangan}${r.status_jemaah === 'LUNAS' ? ' (LUNAS)' : ''}`;

let parsed;
try {
  parsed = parseCalonHajiText(await extractPdfText(readFileSync(pdfPath)));
} catch (err) {
  console.error(`GAGAL membaca PDF — tidak ada yang ditulis.\n${err.message}`);
  process.exit(1);
}
const { header, rows } = parsed;

console.log(`Berkas        : ${basename(pdfPath)}`);
console.log(`Musim         : ${musim}`);
console.log(`Tanggal data  : ${header.tanggalData}`);
console.log(`Jumlah        : ${rows.length}`);
console.log('Status cadangan:', tally(rows, 'status_cadangan'));
console.log('Kepesertaan JKN:', tally(rows, 'kepesertaan_jkn'));
console.log('Keterangan     :', tally(rows, 'keterangan'));
console.log(`LUNAS          : ${rows.filter((r) => r.status_jemaah === 'LUNAS').length}`);
console.log('3 pertama:');
rows.slice(0, 3).forEach((r) => console.log(line(r)));
console.log('3 terakhir:');
rows.slice(-3).forEach((r) => console.log(line(r)));

if (!WRITE) {
  console.log('\ndry-run — tidak ada yang ditulis. Tambah --write untuk menimpa data musim ini.');
  process.exit(0);
}

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const { importId, replacedImportId } = await replaceCalonHaji(sb, { musim, header, rows, sumber: basename(pdfPath) });
console.log(`\nTERTULIS. importId=${importId}${replacedImportId ? ` (menggantikan ${replacedImportId})` : ''}`);
