#!/usr/bin/env node
/**
 * Sync Umroh Landing Page Dates
 * 
 * Fetches package data from Alhijaz API, categorises each package
 * into the landing-page card buckets, then writes the available
 * departure dates to functions/umroh-dates.json.
 *
 * Usage:  node scripts/sync-umroh-dates.mjs
 * Cron:   0 3 * * * cd /home/ubuntu/miqot && node scripts/sync-umroh-dates.mjs >> /var/log/umroh-sync.log 2>&1
 */

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_URL = 'https://jadwal.alhijaz.co/jadwal/api-get/1448';
const OUTPUT = resolve(__dirname, '..', 'functions', 'umroh-dates.json');

// ── Category rules ──
// Each rule has a key (used in JSON), a label (for logs), and a match function.
// Order matters — first match wins.
const CATEGORIES = [
  {
    key: 'promo-akbar',
    label: 'Promo Akbar',
    match: (n) => /PROMO\s+UM(?:RAH|ROH)\s+AKBAR/i.test(n),
  },
  {
    key: 'haikou',
    label: 'Plus Haikou (China)',
    match: (n) => /HAIKOU/i.test(n),
  },
  {
    key: 'cairo',
    label: 'Plus Cairo & Alexandria',
    match: (n) => /CAIRO/i.test(n),
  },
  {
    key: 'turkey',
    label: 'Plus Turkey',
    match: (n) => /TURKEY/i.test(n),
  },
  {
    key: 'thaif',
    label: 'Plus Thaif',
    match: (n) => /TAIF/i.test(n),
  },
  {
    // "REGULER 9HR" but NOT plus-redsea-rahmah (which is a different product)
    key: 'reguler',
    label: 'Umroh Reguler',
    match: (n) => /REGULER/i.test(n) && !/REDSEA|CAIRO|TURKEY|TAIF|HAIKOU/i.test(n),
  },
];

// ── Date formatting ──
const BULAN = [
  '', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des',
];

function formatDate(isoDate) {
  // "2026-07-04" → "4 Jul"
  const [y, m, d] = isoDate.split('-').map(Number);
  const bulan = BULAN[m] || m;
  // Include year only for the first half of the year to avoid ambiguity
  return `${d} ${bulan}`;
}

function categorise(nama) {
  for (const cat of CATEGORIES) {
    if (cat.match(nama)) return cat;
  }
  return null;
}

// ── Main ──
async function main() {
  const now = new Date().toISOString();
  console.log(`[${now}] 🔄 Syncing Umroh dates from API...`);

  const res = await fetch(API_URL);
  if (!res.ok) throw new Error(`API returned ${res.status}`);

  const data = await res.json();
  if (data.status !== 'ok') throw new Error('API status not ok');

  console.log(`  📦 Total packages from API: ${data.aaData.length}`);

  // Buckets: key → [{ date, sisa, nama }]
  const buckets = {};
  for (const cat of CATEGORIES) buckets[cat.key] = [];

  let matched = 0;
  let skippedSoldOut = 0;
  let unmatched = 0;

  for (const pkg of data.aaData) {
    const cat = categorise(pkg.jadwal_nama);
    if (!cat) {
      unmatched++;
      console.log(`  ⚠️  Unmatched: "${pkg.jadwal_nama}" (${pkg.berangkat_tgl})`);
      continue;
    }

    // Skip sold-out packages
    if (parseInt(pkg.seat_sisa, 10) <= 0) {
      skippedSoldOut++;
      console.log(`  ❌ Sold out: "${pkg.jadwal_nama}" (${pkg.berangkat_tgl}) → ${cat.label}`);
      continue;
    }

    matched++;
    buckets[cat.key].push({
      date: pkg.berangkat_tgl,
      formatted: formatDate(pkg.berangkat_tgl),
      sisa: parseInt(pkg.seat_sisa, 10),
    });
  }

  // Sort each bucket by date and extract formatted strings
  const result = { lastUpdated: now, packages: {} };
  for (const cat of CATEGORIES) {
    const sorted = buckets[cat.key]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((item) => item.formatted);
    result.packages[cat.key] = sorted;
    console.log(`  ✅ ${cat.label}: ${sorted.length} dates → [${sorted.join(', ')}]`);
  }

  // Write JSON
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`\n  📝 Written to: ${OUTPUT}`);
  console.log(`  📊 Summary: ${matched} matched, ${skippedSoldOut} sold out, ${unmatched} unmatched`);
  console.log(`  ✨ Done!\n`);
}

main().catch((err) => {
  console.error('❌ Sync failed:', err.message);
  process.exit(1);
});
