/**
 * Migration: Add diskon_kantor + diskon_marketing columns to jamaah table.
 *
 * The Alhijaz official API (post-fix) exposes two new fields:
 *   - diskon_kantor    : potongan dari kantor
 *   - diskon_marketing : potongan dari marketing/agent
 *
 * Stored as BIGINT (rupiah, no fractional). Nullable — populated by
 * syncUmrahViaApiCore via normalizeAwapiRow.
 *
 * Run: node scripts/migrate-jamaah-diskon.js
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function migrate() {
  console.log('🔄 Adding diskon_kantor + diskon_marketing columns to jamaah...');

  const { error: sqlError } = await supabase.rpc('exec_sql', {
    query: `
      ALTER TABLE jamaah ADD COLUMN IF NOT EXISTS diskon_kantor BIGINT;
      ALTER TABLE jamaah ADD COLUMN IF NOT EXISTS diskon_marketing BIGINT;
    `,
  });

  if (sqlError) {
    console.log('⚠️  RPC exec_sql not available. Run this SQL manually in Supabase SQL Editor:');
    console.log('');
    console.log('  ALTER TABLE jamaah ADD COLUMN IF NOT EXISTS diskon_kantor BIGINT;');
    console.log('  ALTER TABLE jamaah ADD COLUMN IF NOT EXISTS diskon_marketing BIGINT;');
    console.log('');
    process.exit(1);
  }

  console.log('✅ Columns added (diskon_kantor, diskon_marketing).');
}

migrate().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
