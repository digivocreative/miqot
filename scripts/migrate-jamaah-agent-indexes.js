/**
 * Migration: add indexes for current agent_id-based jamaah queries.
 *
 * Run: node scripts/migrate-jamaah-agent-indexes.js
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
CREATE INDEX IF NOT EXISTS idx_jamaah_agent_id
  ON jamaah(agent_id);

CREATE INDEX IF NOT EXISTS idx_jamaah_agent_id_tgl_lahir
  ON jamaah(agent_id, tgl_lahir)
  WHERE tgl_lahir IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jamaah_agent_id_tgl_berangkat
  ON jamaah(agent_id, tgl_berangkat);

CREATE INDEX IF NOT EXISTS idx_agent_slug_history_old_slug_changed
  ON agent_slug_history(old_slug, changed_at DESC);
`;

async function migrate() {
  console.log('Adding jamaah agent_id indexes...');
  const { error } = await supabase.rpc('exec_sql', { query: SQL });

  if (error) {
    console.log('RPC exec_sql not available.');
    console.log('Run this SQL manually in Supabase SQL Editor:');
    console.log('');
    console.log(SQL);
    return;
  }

  console.log('Indexes created successfully.');
}

migrate().catch((err) => {
  console.error(err);
  console.log('');
  console.log('Run this SQL manually in Supabase SQL Editor:');
  console.log(SQL);
});
