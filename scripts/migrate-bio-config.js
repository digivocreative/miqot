/**
 * Migration: Add bio_config JSONB column to agents table
 *
 * Run: node scripts/migrate-bio-config.js
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function migrate() {
  console.log('Adding bio_config column to agents...');

  const { error } = await supabase.rpc('exec_sql', {
    query: `ALTER TABLE agents ADD COLUMN IF NOT EXISTS bio_config JSONB DEFAULT '{}'::jsonb;`
  });

  if (error) {
    console.warn('RPC exec_sql not available, checking if column already exists...');

    const { error: selectErr } = await supabase
      .from('agents')
      .select('bio_config')
      .limit(1);

    if (selectErr && selectErr.message.includes('bio_config')) {
      console.error('Column does not exist and cannot be added via Supabase client.');
      console.log('\nRun this SQL manually in Supabase Dashboard → SQL Editor:\n');
      console.log(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS bio_config JSONB DEFAULT '{}'::jsonb;`);
      process.exit(1);
    } else {
      console.log('✅ Column bio_config already exists!');
    }
  } else {
    console.log('✅ Migration complete!');
  }
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
