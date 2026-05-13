/**
 * Migration: Add custom_domain columns to agents table
 *
 * Adds:
 *   - custom_domain TEXT
 *   - custom_domain_status TEXT  (NULL | 'pending' | 'active' | 'error')
 *   - custom_domain_verified_at TIMESTAMPTZ
 *   - unique index on LOWER(custom_domain) where not null
 *
 * Run: node scripts/migrate-custom-domain.js
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SQL = `
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS custom_domain TEXT,
  ADD COLUMN IF NOT EXISTS custom_domain_status TEXT,
  ADD COLUMN IF NOT EXISTS custom_domain_verified_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_custom_domain
  ON agents (LOWER(custom_domain))
  WHERE custom_domain IS NOT NULL;
`;

async function migrate() {
  console.log('Adding custom_domain columns to agents...');

  const { error } = await supabase.rpc('exec_sql', { query: SQL });

  if (error) {
    console.warn('RPC exec_sql not available, checking if columns already exist...');

    const { error: selectErr } = await supabase
      .from('agents')
      .select('custom_domain, custom_domain_status, custom_domain_verified_at')
      .limit(1);

    if (selectErr && /custom_domain/.test(selectErr.message)) {
      console.error('Columns do not exist and cannot be added via Supabase client.');
      console.log('\nRun this SQL manually in Supabase Dashboard → SQL Editor:\n');
      console.log(SQL);
      process.exit(1);
    } else {
      console.log('✅ Columns custom_domain* already exist!');
    }
  } else {
    console.log('✅ Migration complete!');
  }
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
