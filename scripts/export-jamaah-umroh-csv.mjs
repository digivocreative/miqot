#!/usr/bin/env node

import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import {
  awapiFetchUmrahByKeberangkatan,
  awapiFetchUmrahByPendaftaran,
  normalizeAwapiRow,
} from '../awapi-client.js';

const DEFAULT_FROM_YEAR = 2018;
const DEFAULT_TO_YEAR = 2026;
const DEFAULT_SLUG = 'aulia';

function parseArgs(argv) {
  const args = {};
  for (const part of argv) {
    if (!part.startsWith('--')) continue;
    const eq = part.indexOf('=');
    if (eq === -1) {
      args[part.slice(2)] = true;
    } else {
      args[part.slice(2, eq)] = part.slice(eq + 1);
    }
  }
  return args;
}

function requireYear(value, fallback, label) {
  const n = Number(value ?? fallback);
  if (!Number.isInteger(n) || n < 1900 || n > 2200) {
    throw new Error(`Invalid --${label}: ${value}`);
  }
  return n;
}

function inDateRange(date, fromDate, toDate) {
  if (!date) return false;
  const key = String(date).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && key >= fromDate && key <= toDate;
}

const HIJRIAH_RANGES = [
  { year: '1439', start: '2017-09-22', end: '2018-09-10' },
  { year: '1440', start: '2018-09-11', end: '2019-08-30' },
  { year: '1441', start: '2019-08-31', end: '2020-08-19' },
  { year: '1442', start: '2020-08-20', end: '2021-08-09' },
  { year: '1443', start: '2021-08-10', end: '2022-07-29' },
  { year: '1444', start: '2022-07-30', end: '2023-07-18' },
  { year: '1445', start: '2023-07-19', end: '2024-07-07' },
  { year: '1446', start: '2024-07-08', end: '2025-06-25' },
  { year: '1447', start: '2025-06-26', end: '2026-06-15' },
  { year: '1448', start: '2026-06-16', end: '2027-06-05' },
];

function getHijriahYear(date) {
  if (!date) return null;
  const key = String(date).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  return HIJRIAH_RANGES.find((range) => key >= range.start && key <= range.end)?.year || null;
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(filePath, rows) {
  const columns = [
    'agent_slug',
    'agent_name',
    'id_umroh',
    'jm_id',
    'nama',
    'jk',
    'wa',
    'tgl_lahir',
    'paket',
    'bayar',
    'sisa',
    'tgl_berangkat',
    'tgl_daftar',
    'hijriah_year',
    'no_paspor',
    'paspor_expired',
    'diskon_kantor',
    'diskon_marketing',
    'source_endpoints',
    'perlengkapan_json',
    'dokumen_json',
  ];
  const lines = [
    columns.join(','),
    ...rows.map((row) => columns.map((col) => csvEscape(row[col])).join(',')),
  ];
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

async function getAgentCredentials(slug) {
  const envKey = process.env.AWAPI_KEY;
  if (envKey) {
    return {
      id: process.env.AGENT_ID || '00000000-0000-0000-0000-000000000000',
      slug,
      name: slug,
      awapi_key: envKey,
      awapi_code: process.env.AWAPI_CODE || envKey.split('-')[0],
    };
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required unless AWAPI_KEY is set');
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const { data, error } = await supabase
    .from('agents')
    .select('id, slug, name, awapi_code, awapi_key')
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw new Error(`Agent lookup failed: ${error.message}`);
  if (!data) throw new Error(`Agent not found: ${slug}`);
  if (!data.awapi_key) throw new Error(`Agent ${slug} does not have awapi_key`);
  return {
    ...data,
    awapi_code: data.awapi_code || data.awapi_key.split('-')[0],
  };
}

async function fetchYear({ apiKey, code, agentId, year, source }) {
  const hijriah = false;
  const fetcher = source === 'bm'
    ? awapiFetchUmrahByKeberangkatan
    : awapiFetchUmrahByPendaftaran;
  const { rows } = await fetcher(apiKey, code, { tahun: year, hijriah });
  return rows
    .map((raw) => normalizeAwapiRow(raw, { agentId }))
    .filter(Boolean)
    .map((row) => ({ ...row, source_endpoint: `${source}/${year}` }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const slug = String(args.slug || DEFAULT_SLUG).trim();
  const fromYear = requireYear(args.from, DEFAULT_FROM_YEAR, 'from');
  const toYear = requireYear(args.to, DEFAULT_TO_YEAR, 'to');
  if (fromYear > toYear) throw new Error('--from cannot be greater than --to');

  const fromDate = `${fromYear}-01-01`;
  const toDate = `${toYear}-12-31`;
  const outPath = resolve(
    process.cwd(),
    args.out || `exports/${slug}-jamaah-umroh-${fromYear}-${toYear}.csv`,
  );

  const agent = await getAgentCredentials(slug);
  const apiKey = agent.awapi_key;
  const code = agent.awapi_code;
  const rowsByKey = new Map();
  const errors = [];
  let fetched = 0;
  let skippedOutsideRange = 0;

  for (let year = fromYear; year <= toYear; year++) {
    for (const source of ['bm', 'dm']) {
      try {
        const rows = await fetchYear({
          apiKey,
          code,
          agentId: agent.id,
          year,
          source,
        });
        fetched += rows.length;
        for (const row of rows) {
          const inRange = inDateRange(row.tgl_berangkat, fromDate, toDate)
            || inDateRange(row.tgl_daftar, fromDate, toDate)
            || (!row.tgl_berangkat && !row.tgl_daftar);
          if (!inRange) {
            skippedOutsideRange++;
            continue;
          }
          const key = `${row.id_umroh}_${row.jm_id}`.toLowerCase();
          const prev = rowsByKey.get(key);
          if (prev) {
            prev.source_endpoints = [...new Set([
              ...prev.source_endpoints.split(';').filter(Boolean),
              row.source_endpoint,
            ])].join(';');
            for (const [field, value] of Object.entries(row)) {
              if (field === 'source_endpoint') continue;
              if ((prev[field] === null || prev[field] === undefined || prev[field] === '') && value) {
                prev[field] = value;
              }
            }
            if (!prev.perlengkapan_json && row.perlengkapan) prev.perlengkapan_json = row.perlengkapan;
            if (!prev.dokumen_json && row.dokumen) prev.dokumen_json = row.dokumen;
          } else {
            rowsByKey.set(key, {
              agent_slug: agent.slug,
              agent_name: agent.name || agent.slug,
              ...row,
              hijriah_year: getHijriahYear(row.tgl_berangkat),
              source_endpoints: row.source_endpoint,
              perlengkapan_json: row.perlengkapan || null,
              dokumen_json: row.dokumen || null,
            });
          }
        }
        console.log(`${slug} ${source}/${year}: ${rows.length} rows`);
      } catch (err) {
        errors.push(`${source}/${year}: ${err.message}`);
        console.warn(`${slug} ${source}/${year}: FAILED (${err.message})`);
      }
    }
  }

  if (errors.length && !args['allow-partial']) {
    throw new Error([
      `Export aborted because ${errors.length} endpoint(s) failed.`,
      'Re-run with --allow-partial=true if you intentionally want a partial CSV.',
      ...errors.map((e) => `- ${e}`),
    ].join('\n'));
  }

  const csvRows = Array.from(rowsByKey.values())
    .sort((a, b) => {
      const aDate = a.tgl_berangkat || a.tgl_daftar || '';
      const bDate = b.tgl_berangkat || b.tgl_daftar || '';
      return aDate.localeCompare(bDate)
        || String(a.nama || '').localeCompare(String(b.nama || ''));
    });

  writeCsv(outPath, csvRows);
  console.log('');
  console.log(`CSV written: ${outPath}`);
  console.log(`Rows fetched: ${fetched}`);
  console.log(`Rows exported: ${csvRows.length}`);
  console.log(`Rows skipped outside range: ${skippedOutsideRange}`);
  console.log(`Endpoint failures: ${errors.length}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
