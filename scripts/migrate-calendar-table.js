/**
 * Migration: Create calendar_events table in Supabase
 *
 * Run: node scripts/migrate-calendar-table.js
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
CREATE TABLE IF NOT EXISTS calendar_events (
  id            TEXT PRIMARY KEY,
  event_date    DATE NOT NULL,
  event_type    TEXT NOT NULL,
  group_number  TEXT,
  pesawat       TEXT,
  jam           TEXT,
  paket         TEXT,
  pax           INTEGER DEFAULT 0,
  staff         TEXT,
  mutawif       TEXT,
  tour_leader   TEXT,
  jam_kumpul    TEXT,
  titik_kumpul  TEXT,
  raw_data      JSONB,
  synced_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendar_date ON calendar_events(event_date);
CREATE INDEX IF NOT EXISTS idx_calendar_type ON calendar_events(event_type);
`;

const ALTER_SQL = `
ALTER TABLE calendar_events
ADD COLUMN IF NOT EXISTS jam_kumpul TEXT,
ADD COLUMN IF NOT EXISTS titik_kumpul TEXT,
ADD COLUMN IF NOT EXISTS mutawif TEXT;
`;

async function migrate() {
  console.log('🔄 Creating calendar_events table...');

  const { error } = await supabase.rpc('exec_sql', { query: SQL });

  if (error) {
    console.log('⚠️  RPC exec_sql not available. Please run this SQL manually in Supabase SQL Editor:');
    console.log('');
    console.log(SQL);
    console.log('');
  } else {
    console.log('✅ calendar_events table created successfully!');
  }
}

migrate().catch(console.error);
