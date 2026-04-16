/**
 * Migration: Create capi_event_logs table for tracking CAPI events
 *
 * Run: node scripts/migrate-capi-event-logs.js
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function migrate() {
  console.log('🔄 Creating capi_event_logs table...');

  const { error: sqlError } = await supabase.rpc('exec_sql', {
    query: `
      CREATE TABLE IF NOT EXISTS capi_event_logs (
        id BIGSERIAL PRIMARY KEY,
        agent_id UUID NOT NULL,
        event_name TEXT NOT NULL,
        status TEXT NOT NULL,
        value BIGINT,
        error_message TEXT,
        source TEXT NOT NULL DEFAULT 'browser',
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_capi_event_logs_agent
        ON capi_event_logs(agent_id, created_at DESC);
    `
  });

  if (sqlError) {
    console.log('⚠️  RPC exec_sql not available. Please run manually in Supabase SQL Editor:');
    console.log('');
    console.log('  CREATE TABLE IF NOT EXISTS capi_event_logs (');
    console.log('    id BIGSERIAL PRIMARY KEY,');
    console.log('    agent_id UUID NOT NULL,');
    console.log('    event_name TEXT NOT NULL,');
    console.log('    status TEXT NOT NULL,');
    console.log('    value BIGINT,');
    console.log('    error_message TEXT,');
    console.log("    source TEXT NOT NULL DEFAULT 'browser',");
    console.log('    created_at TIMESTAMPTZ DEFAULT now()');
    console.log('  );');
    console.log('');
    console.log('  CREATE INDEX IF NOT EXISTS idx_capi_event_logs_agent');
    console.log('    ON capi_event_logs(agent_id, created_at DESC);');
    console.log('');
  } else {
    console.log('✅ capi_event_logs table created successfully!');
  }
}

migrate().catch(console.error);
