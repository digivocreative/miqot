/**
 * Migration: Create analytics_events_daily aggregate table + supporting index.
 *
 * Run: node scripts/migrate-analytics-daily.js
 * Then paste SQL output into Supabase SQL Editor.
 */
const SQL = `
-- Aggregate table (daily rollup)
CREATE TABLE IF NOT EXISTS analytics_events_daily (
  date        DATE NOT NULL,
  agent_id    UUID NOT NULL,
  event_type  TEXT NOT NULL,
  event_name  TEXT NOT NULL,
  count       INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (date, agent_id, event_type, event_name)
);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_date
  ON analytics_events_daily(date DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_agent
  ON analytics_events_daily(agent_id, date DESC);

-- Supporting index on analytics_events.created_at
-- Needed for fast retention DELETE and range queries in /api/analytics/summary.
-- Verify first: SELECT indexname FROM pg_indexes WHERE tablename = 'analytics_events';
CREATE INDEX IF NOT EXISTS idx_analytics_events_created
  ON analytics_events(created_at DESC);
`;

console.log('Paste the following SQL into Supabase SQL Editor:\n');
console.log(SQL);
console.log('\nThen verify:');
console.log(`  SELECT indexname FROM pg_indexes WHERE tablename IN ('analytics_events', 'analytics_events_daily');`);
