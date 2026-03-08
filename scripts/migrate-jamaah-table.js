/**
 * Migration: Create jamaah table in Supabase
 *
 * Run: node scripts/migrate-jamaah-table.js
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
CREATE TABLE IF NOT EXISTS jamaah (
  id            SERIAL PRIMARY KEY,
  agent_slug    TEXT NOT NULL REFERENCES agents(slug),
  id_umroh      TEXT NOT NULL,
  nama          TEXT NOT NULL,
  jk            TEXT,
  wa            TEXT,
  tgl_lahir     DATE,
  paket         TEXT,
  bayar         BIGINT DEFAULT 0,
  sisa          BIGINT DEFAULT 0,
  tgl_berangkat DATE,
  tgl_daftar    DATE,
  hijriah_year  TEXT,
  raw_data      JSONB,
  synced_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_slug, id_umroh, nama)
);

CREATE INDEX IF NOT EXISTS idx_jamaah_agent ON jamaah(agent_slug);
CREATE INDEX IF NOT EXISTS idx_jamaah_hijriah ON jamaah(agent_slug, hijriah_year);
`;

async function migrate() {
  console.log('🔄 Creating jamaah table...');

  const { error } = await supabase.rpc('exec_sql', { query: SQL });

  if (error) {
    console.log('⚠️  RPC exec_sql not available. Please run this SQL manually in Supabase SQL Editor:');
    console.log('');
    console.log(SQL);
    console.log('');
  } else {
    console.log('✅ jamaah table created successfully!');
  }
}

migrate().catch(console.error);
