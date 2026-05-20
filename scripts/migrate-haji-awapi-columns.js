/**
 * Migration: add official AWAPI Haji fields to jamaah_haji.
 *
 * Run: node scripts/migrate-haji-awapi-columns.js
 *
 * If RPC is not available, copy the printed SQL into Supabase SQL Editor.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SQL = `
ALTER TABLE jamaah_haji ADD COLUMN IF NOT EXISTS nomor_porsi TEXT;
ALTER TABLE jamaah_haji ADD COLUMN IF NOT EXISTS nomor_spph TEXT;
ALTER TABLE jamaah_haji ADD COLUMN IF NOT EXISTS tgl_lahir DATE;
ALTER TABLE jamaah_haji ADD COLUMN IF NOT EXISTS no_paspor TEXT;
ALTER TABLE jamaah_haji ADD COLUMN IF NOT EXISTS paspor_expired DATE;
ALTER TABLE jamaah_haji ADD COLUMN IF NOT EXISTS paket_harga BIGINT;
ALTER TABLE jamaah_haji ADD COLUMN IF NOT EXISTS diskon_marketing BIGINT;
ALTER TABLE jamaah_haji ADD COLUMN IF NOT EXISTS diskon_kantor BIGINT;
ALTER TABLE jamaah_haji ADD COLUMN IF NOT EXISTS bayar BIGINT;
ALTER TABLE jamaah_haji ADD COLUMN IF NOT EXISTS sisa BIGINT;
ALTER TABLE jamaah_haji ADD COLUMN IF NOT EXISTS tgl_daftar DATE;
ALTER TABLE jamaah_haji ADD COLUMN IF NOT EXISTS tgl_berangkat DATE;
ALTER TABLE jamaah_haji ADD COLUMN IF NOT EXISTS dokumen JSONB;

CREATE INDEX IF NOT EXISTS idx_jamaah_haji_agent_masehi
  ON jamaah_haji(agent_id, thn_masehi);

CREATE INDEX IF NOT EXISTS idx_jamaah_haji_agent_tgl_berangkat
  ON jamaah_haji(agent_id, tgl_berangkat)
  WHERE tgl_berangkat IS NOT NULL;

NOTIFY pgrst, 'reload schema';
`;

async function migrate() {
  console.log('Adding AWAPI Haji columns to jamaah_haji...');
  const { error } = await supabase.rpc('exec_sql', { query: SQL });

  if (error) {
    console.log('RPC exec_sql not available.');
    console.log('Run this SQL manually in Supabase SQL Editor:');
    console.log('');
    console.log(SQL);
    return;
  }

  console.log('AWAPI Haji columns added successfully.');
}

migrate().catch((err) => {
  console.error(err);
  console.log('');
  console.log('Run this SQL manually in Supabase SQL Editor:');
  console.log(SQL);
});
