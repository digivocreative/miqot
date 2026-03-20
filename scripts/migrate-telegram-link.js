/**
 * Migration: Add telegram_chat_id + telegram_link_token columns to agents table
 * 
 * Run: node scripts/migrate-telegram-link.js
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function migrate() {
  console.log('🔄 Adding telegram columns to agents table...');

  const { error: sqlError } = await supabase.rpc('exec_sql', {
    query: `
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='telegram_chat_id') THEN
          ALTER TABLE agents ADD COLUMN telegram_chat_id TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='telegram_link_token') THEN
          ALTER TABLE agents ADD COLUMN telegram_link_token TEXT;
        END IF;
      END $$;
    `
  });

  if (sqlError) {
    console.log('⚠️  RPC exec_sql not available. Please run this SQL manually in Supabase SQL Editor:');
    console.log('');
    console.log('  ALTER TABLE agents ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;');
    console.log('  ALTER TABLE agents ADD COLUMN IF NOT EXISTS telegram_link_token TEXT;');
    console.log('');
  } else {
    console.log('✅ Columns added successfully!');
  }
}

migrate().catch(console.error);
