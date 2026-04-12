/**
 * Migration: Create umroh_schedules table in Supabase
 *
 * Run: node scripts/migrate-umroh-schedules-table.js
 *
 * If RPC is not available, copy the SQL below into Supabase SQL Editor.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SQL = `
CREATE TABLE IF NOT EXISTS umroh_schedules (
  jadwal_id                    TEXT NOT NULL,
  year_code                    TEXT NOT NULL,
  jadwal_nama                  TEXT NOT NULL,
  promo                        TEXT DEFAULT '0',
  seat_total                   TEXT DEFAULT '0',
  seat_sisa                    TEXT DEFAULT '0',
  maskapai                     TEXT,
  berangkat_tgl                DATE,
  berangkat_jam                TEXT,
  berangkat_rute               TEXT,
  berangkat_kode_penerbangan   TEXT,
  pulang_tgl                   DATE,
  pulang_jam                   TEXT,
  pulang_rute                  TEXT,
  pulang_kode_penerbangan      TEXT,
  manasik_tgl                  TEXT,
  manasik_jam                  TEXT,
  brosur                       TEXT,
  itinerary                    TEXT,
  perlengkapan_harga           TEXT,
  paket_harga                  JSONB,
  paket_hotel                  JSONB,
  synced_at                    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (jadwal_id, year_code)
);

CREATE INDEX IF NOT EXISTS idx_umroh_schedules_year ON umroh_schedules(year_code);
CREATE INDEX IF NOT EXISTS idx_umroh_schedules_depart ON umroh_schedules(berangkat_tgl);
`;

const ALTER_SQL = `
ALTER TABLE umroh_schedules
ADD COLUMN IF NOT EXISTS brosur_cdn TEXT,
ADD COLUMN IF NOT EXISTS itinerary_cdn TEXT;
`;

async function migrate() {
  console.log('Creating umroh_schedules table...');

  const { error } = await supabase.rpc('exec_sql', { query: SQL });

  if (error) {
    console.log('RPC exec_sql not available. Please run this SQL manually in Supabase SQL Editor:');
    console.log('');
    console.log(SQL);
    console.log('');
    console.log('-- Then run this ALTER to add CDN columns:');
    console.log(ALTER_SQL);
  } else {
    console.log('umroh_schedules table created successfully!');
    // Add CDN columns
    const { error: alterErr } = await supabase.rpc('exec_sql', { query: ALTER_SQL });
    if (alterErr) {
      console.log('Run this ALTER manually:');
      console.log(ALTER_SQL);
    } else {
      console.log('CDN columns added successfully!');
    }
  }
}

migrate().catch(console.error);
