/**
 * Migration: Create quiz_leads table in Supabase
 *
 * Run: node scripts/migrate-quiz-leads.js
 *
 * If RPC is not available, copy the SQL below into Supabase SQL Editor.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SQL = `
CREATE TABLE IF NOT EXISTS quiz_leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_slug TEXT NOT NULL REFERENCES agents(slug),
  nama TEXT NOT NULL,
  wa TEXT NOT NULL,
  answers JSONB NOT NULL,
  recommended JSONB NOT NULL,
  status TEXT DEFAULT 'baru',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_leads_agent ON quiz_leads(agent_slug);
CREATE INDEX IF NOT EXISTS idx_quiz_leads_status ON quiz_leads(status);
CREATE INDEX IF NOT EXISTS idx_quiz_leads_created ON quiz_leads(created_at DESC);
`;

async function migrate() {
  console.log('🔄 Creating quiz_leads table...');

  const { error } = await supabase.rpc('exec_sql', { query: SQL });

  if (error) {
    console.log('⚠️  RPC exec_sql not available. Please run this SQL manually in Supabase SQL Editor:');
    console.log('');
    console.log(SQL);
    console.log('');
  } else {
    console.log('✅ quiz_leads table created successfully!');
  }
}

migrate().catch(console.error);
