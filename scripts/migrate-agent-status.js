/**
 * Migration: Add status and registered_at columns to agents table
 * for self-registration workflow (pending → active/rejected).
 *
 * Run: node scripts/migrate-agent-status.js
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function migrate() {
  console.log('Adding status and registered_at columns to agents...');

  const { error } = await supabase.rpc('exec_sql', {
    query: `
      ALTER TABLE agents ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'
        CHECK (status IN ('pending', 'active', 'rejected'));

      ALTER TABLE agents ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ;

      CREATE UNIQUE INDEX IF NOT EXISTS agents_email_unique
        ON agents (email) WHERE email IS NOT NULL AND email != '';
    `
  });

  if (error) {
    console.warn('RPC exec_sql not available, trying direct column check...');

    const { error: selectErr } = await supabase
      .from('agents')
      .select('status')
      .limit(1);

    if (selectErr && selectErr.message.includes('status')) {
      console.error('Column does not exist and cannot be added via Supabase client.');
      console.log('\nRun this SQL manually in Supabase Dashboard → SQL Editor:\n');
      console.log(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'
  CHECK (status IN ('pending', 'active', 'rejected'));

ALTER TABLE agents ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS agents_email_unique
  ON agents (email) WHERE email IS NOT NULL AND email != '';`);
      process.exit(1);
    } else {
      console.log('✅ Column status already exists!');
    }
  } else {
    console.log('✅ Migration complete!');
  }
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
