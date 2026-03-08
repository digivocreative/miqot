/**
 * Migration: Add jamaah credential columns to agents table
 *
 * Run: node scripts/migrate-jamaah-columns.js
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function migrate() {
  console.log('🔄 Adding jamaah credential columns to agents table...');

  const { error: sqlError } = await supabase.rpc('exec_sql', {
    query: `
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='jamaah_username') THEN
          ALTER TABLE agents ADD COLUMN jamaah_username TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='jamaah_password') THEN
          ALTER TABLE agents ADD COLUMN jamaah_password TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='jamaah_kantor') THEN
          ALTER TABLE agents ADD COLUMN jamaah_kantor TEXT DEFAULT '2';
        END IF;
      END $$;
    `
  });

  if (sqlError) {
    console.log('⚠️  RPC exec_sql not available. Please add the columns manually in Supabase SQL Editor:');
    console.log('');
    console.log('  ALTER TABLE agents ADD COLUMN IF NOT EXISTS jamaah_username TEXT;');
    console.log('  ALTER TABLE agents ADD COLUMN IF NOT EXISTS jamaah_password TEXT;');
    console.log("  ALTER TABLE agents ADD COLUMN IF NOT EXISTS jamaah_kantor TEXT DEFAULT '2';");
    console.log('');
  } else {
    console.log('✅ Columns added successfully!');
  }
}

migrate().catch(console.error);
