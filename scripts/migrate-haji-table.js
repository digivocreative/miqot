/**
 * Migration: Create jamaah_haji table in Supabase
 *
 * Run: node scripts/migrate-haji-table.js
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
CREATE TABLE IF NOT EXISTS jamaah_haji (
  agent_slug         TEXT NOT NULL,
  id_haji            TEXT NOT NULL,
  id_jamaah          TEXT NOT NULL,
  nama               TEXT,
  jk                 TEXT,
  alamat             TEXT,
  telp               TEXT,
  thn_hijriyah       TEXT,
  thn_masehi         TEXT,
  perwakilan         TEXT,
  marketing          TEXT,
  paket              TEXT,
  staff              TEXT,
  jenis              TEXT,
  status_bayar       TEXT,
  status_berangkat   TEXT,
  bpih_url           TEXT,
  surat_pernyataan_url TEXT,
  synced_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_slug, id_haji, id_jamaah)
);

CREATE INDEX IF NOT EXISTS idx_jamaah_haji_agent ON jamaah_haji(agent_slug);
CREATE INDEX IF NOT EXISTS idx_jamaah_haji_thn ON jamaah_haji(thn_hijriyah);
`;

async function migrate() {
  console.log('🔄 Creating jamaah_haji table...');

  const { error } = await supabase.rpc('exec_sql', { query: SQL });

  if (error) {
    console.log('⚠️  RPC exec_sql not available. Please run this SQL manually in Supabase SQL Editor:');
    console.log('');
    console.log(SQL);
    console.log('');
  } else {
    console.log('✅ jamaah_haji table created successfully!');
  }
}

migrate().catch(console.error);
