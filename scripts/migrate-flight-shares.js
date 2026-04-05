import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function migrate() {
  const { error } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS flight_shares (
        code          TEXT PRIMARY KEY,
        agent_slug    TEXT NOT NULL REFERENCES agents(slug) ON DELETE CASCADE,
        flight_number TEXT NOT NULL,
        flight_date   DATE NOT NULL,
        dep_iata      TEXT NOT NULL,
        arr_iata      TEXT NOT NULL,
        dep_city      TEXT,
        arr_city      TEXT,
        dep_time      TEXT,
        arr_time      TEXT,
        duration      TEXT,
        group_number  TEXT,
        pax           INTEGER,
        tour_leader   TEXT,
        airline_code  TEXT,
        created_at    TIMESTAMPTZ DEFAULT now(),
        
        UNIQUE(agent_slug, flight_number, flight_date)
      );
      
      CREATE INDEX IF NOT EXISTS idx_flight_shares_agent ON flight_shares(agent_slug);
      CREATE INDEX IF NOT EXISTS idx_flight_shares_date ON flight_shares(flight_date);
    `
  });

  if (error) {
    console.error('Migration error:', error.message);
    console.log('Jalankan SQL di atas secara manual di Supabase Dashboard → SQL Editor');
  } else {
    console.log('✅ Tabel flight_shares berhasil dibuat');
  }
}

migrate();
