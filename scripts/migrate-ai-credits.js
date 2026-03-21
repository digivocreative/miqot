/**
 * Migration: Create ai_credits table for tracking TTS character usage
 * 
 * Run: node scripts/migrate-ai-credits.js
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function migrate() {
  console.log('🔄 Creating ai_credits table...');

  const { error: sqlError } = await supabase.rpc('exec_sql', {
    query: `
      CREATE TABLE IF NOT EXISTS ai_credits (
        agent_slug       TEXT PRIMARY KEY REFERENCES agents(slug),
        chars_used       INTEGER DEFAULT 0,
        first_used_at    TIMESTAMPTZ
      );
    `
  });

  if (sqlError) {
    console.log('⚠️  RPC exec_sql not available. Please run this SQL manually in Supabase SQL Editor:');
    console.log('');
    console.log('  CREATE TABLE IF NOT EXISTS ai_credits (');
    console.log('    agent_slug       TEXT PRIMARY KEY REFERENCES agents(slug),');
    console.log('    chars_used       INTEGER DEFAULT 0,');
    console.log('    first_used_at    TIMESTAMPTZ');
    console.log('  );');
    console.log('');
  } else {
    console.log('✅ ai_credits table created successfully!');
  }
}

migrate().catch(console.error);
