/**
 * Migration: Add role + email columns to agents table
 * and set nikita as admin.
 * 
 * Run: node scripts/migrate-admin-columns.js
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function migrate() {
  console.log('🔄 Adding role + email columns to agents table...');

  // Try adding columns via RPC (SQL)
  const { error: sqlError } = await supabase.rpc('exec_sql', {
    query: `
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='role') THEN
          ALTER TABLE agents ADD COLUMN role TEXT DEFAULT 'agent' CHECK (role IN ('admin', 'agent'));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='email') THEN
          ALTER TABLE agents ADD COLUMN email TEXT;
        END IF;
      END $$;
    `
  });

  if (sqlError) {
    console.log('⚠️  RPC exec_sql not available. Please add the columns manually in Supabase SQL Editor:');
    console.log('');
    console.log('  ALTER TABLE agents ADD COLUMN IF NOT EXISTS role TEXT DEFAULT \'agent\' CHECK (role IN (\'admin\', \'agent\'));');
    console.log('  ALTER TABLE agents ADD COLUMN IF NOT EXISTS email TEXT;');
    console.log('');
    console.log('Then run this script again to set nikita as admin.');
  } else {
    console.log('✅ Columns added successfully!');
  }

  // Set nikita as admin
  console.log('🔄 Setting nikita as admin...');
  const { error: updateError } = await supabase
    .from('agents')
    .update({ role: 'admin' })
    .eq('slug', 'nikita');

  if (updateError) {
    console.error('❌ Failed to set admin:', updateError.message);
    console.log('   → If "role" column doesn\'t exist yet, add it first via SQL Editor');
  } else {
    console.log('✅ nikita is now admin!');
  }
}

migrate().catch(console.error);
