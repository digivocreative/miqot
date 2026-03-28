/**
 * Migration: Create flight_status table in Supabase
 *
 * Run: node scripts/migrate-flight-status.js
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
CREATE TABLE IF NOT EXISTS flight_status (
  id TEXT PRIMARY KEY,
  event_date DATE NOT NULL,
  flight_iata TEXT NOT NULL,
  airline_name TEXT,
  airline_iata TEXT,
  airline_logo TEXT,
  group_number TEXT,
  status TEXT DEFAULT 'scheduled',
  dep_iata TEXT,
  dep_city TEXT,
  dep_terminal TEXT,
  dep_gate TEXT,
  dep_scheduled TIMESTAMPTZ,
  dep_actual TIMESTAMPTZ,
  arr_iata TEXT,
  arr_city TEXT,
  arr_terminal TEXT,
  arr_gate TEXT,
  arr_scheduled TIMESTAMPTZ,
  arr_estimated TIMESTAMPTZ,
  pax INTEGER DEFAULT 0,
  tour_leader TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  alt DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  direction DOUBLE PRECISION,
  progress INTEGER DEFAULT 0,
  delayed INTEGER DEFAULT 0,
  raw_api JSONB,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flight_status_date ON flight_status(event_date);
CREATE INDEX IF NOT EXISTS idx_flight_status_status ON flight_status(status);
`;

async function migrate() {
  console.log('🔄 Creating flight_status table...');

  const { error } = await supabase.rpc('exec_sql', { query: SQL });

  if (error) {
    console.log('⚠️  RPC exec_sql not available. Please run this SQL manually in Supabase SQL Editor:');
    console.log('');
    console.log(SQL);
    console.log('');
  } else {
    console.log('✅ flight_status table created successfully!');
  }
}

migrate().catch(console.error);
