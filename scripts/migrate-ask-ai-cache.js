/**
 * Migration: Create ask_ai_cache table for Tanya AI feature
 *
 * Run: node scripts/migrate-ask-ai-cache.js
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SQL = `
CREATE TABLE IF NOT EXISTS ask_ai_cache (
  id BIGSERIAL PRIMARY KEY,
  jadwal_id TEXT NOT NULL,
  question_hash TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  note TEXT,
  attachment_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(jadwal_id, question_hash)
);

ALTER TABLE ask_ai_cache ADD COLUMN IF NOT EXISTS attachment_type TEXT;

CREATE INDEX IF NOT EXISTS idx_ask_ai_cache_lookup
  ON ask_ai_cache(jadwal_id, question_hash);

CREATE INDEX IF NOT EXISTS idx_ask_ai_cache_created
  ON ask_ai_cache(created_at);
`;

async function migrate() {
  console.log('🔄 Creating ask_ai_cache table...');

  const { error: sqlError } = await supabase.rpc('exec_sql', { query: SQL });

  if (sqlError) {
    console.log('⚠️  RPC exec_sql not available. Please run manually in Supabase SQL Editor:');
    console.log('');
    console.log(SQL);
    process.exit(1);
  }

  console.log('✅ ask_ai_cache table created successfully!');

  // Verify table exists by selecting 0 rows
  const { error: verifyError } = await supabase
    .from('ask_ai_cache')
    .select('id', { count: 'exact', head: true });
  if (verifyError) {
    console.warn('⚠️  Verify failed:', verifyError.message);
  } else {
    console.log('✅ Verified: ask_ai_cache is queryable.');
  }
}

migrate().catch(err => {
  console.error('❌ Migration error:', err);
  process.exit(1);
});
