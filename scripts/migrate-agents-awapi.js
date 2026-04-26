/**
 * Migration: Add awapi_code + awapi_key columns to agents table.
 *
 * These columns store the per-agent credential for the official Alhijaz API
 * (header `x-api-key`). They will gradually replace the legacy
 * jamaah_username / jamaah_password used for HTML scraping.
 *
 * Run: node scripts/migrate-agents-awapi.js
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function migrate() {
  console.log('🔄 Adding awapi_code + awapi_key columns to agents table...');

  const { error: sqlError } = await supabase.rpc('exec_sql', {
    query: `
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='awapi_code') THEN
          ALTER TABLE agents ADD COLUMN awapi_code TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='awapi_key') THEN
          ALTER TABLE agents ADD COLUMN awapi_key TEXT;
        END IF;
      END $$;
    `
  });

  if (sqlError) {
    console.log('⚠️  RPC exec_sql not available. Run this SQL manually in Supabase SQL Editor:');
    console.log('');
    console.log("  ALTER TABLE agents ADD COLUMN IF NOT EXISTS awapi_code TEXT;");
    console.log("  ALTER TABLE agents ADD COLUMN IF NOT EXISTS awapi_key TEXT;");
    console.log('');
    process.exit(1);
  }

  console.log('✅ Columns added (awapi_code, awapi_key).');

  const { count, error: verifyError } = await supabase
    .from('agents')
    .select('id', { count: 'exact', head: true });

  if (verifyError) {
    console.error('❌ Verification select failed:', verifyError.message);
  } else {
    console.log(`✅ agents table reachable, ${count} rows total.`);
  }
}

migrate().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
