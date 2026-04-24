/**
 * Migration: Fix agent deletion blocked by FK constraints.
 *
 * Drops + re-adds FKs on tables that reference `agents` so that deleting
 * an agent no longer fails with "violates foreign key constraint".
 *
 *   analytics_events.agent_id       -> ON DELETE SET NULL  (preserve history)
 *   analytics_events_daily.agent_id -> ON DELETE CASCADE   (derivative rollup)
 *   capi_event_logs.agent_id        -> ON DELETE CASCADE   (logs)
 *   capi_configs.agent_id           -> ON DELETE CASCADE   (owned by agent)
 *   jamaah.agent_slug               -> ON DELETE CASCADE   (owned by agent)
 *   ai_credits.agent_slug           -> ON DELETE CASCADE   (owned by agent)
 *
 * flight_shares.agent_slug already has ON DELETE CASCADE — skipped.
 *
 * Run: node scripts/migrate-agents-fk-cascade.js
 * Then paste the output into Supabase SQL Editor.
 */

// NOT VALID: skip validating existing rows. New ON DELETE behavior still
// applies to future deletes. Prevents migration failure if orphan rows exist
// (e.g. events pointing to already-deleted agents).
const SQL = `
-- analytics_events.agent_id -> SET NULL (preserve historical events)
ALTER TABLE analytics_events
  DROP CONSTRAINT IF EXISTS analytics_events_agent_id_fkey;
ALTER TABLE analytics_events
  ALTER COLUMN agent_id DROP NOT NULL;
ALTER TABLE analytics_events
  ADD CONSTRAINT analytics_events_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL NOT VALID;

-- analytics_events_daily.agent_id -> CASCADE (rollup; NOT NULL so can't SET NULL)
ALTER TABLE analytics_events_daily
  DROP CONSTRAINT IF EXISTS analytics_events_daily_agent_id_fkey;
ALTER TABLE analytics_events_daily
  ADD CONSTRAINT analytics_events_daily_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE NOT VALID;

-- capi_event_logs.agent_id -> CASCADE (logs)
ALTER TABLE capi_event_logs
  DROP CONSTRAINT IF EXISTS capi_event_logs_agent_id_fkey;
ALTER TABLE capi_event_logs
  ADD CONSTRAINT capi_event_logs_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE NOT VALID;

-- capi_configs.agent_id -> CASCADE (config owned by agent)
ALTER TABLE capi_configs
  DROP CONSTRAINT IF EXISTS capi_configs_agent_id_fkey;
ALTER TABLE capi_configs
  ADD CONSTRAINT capi_configs_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE NOT VALID;

-- jamaah.agent_slug -> CASCADE (agent's customer list)
ALTER TABLE jamaah
  DROP CONSTRAINT IF EXISTS jamaah_agent_slug_fkey;
ALTER TABLE jamaah
  ADD CONSTRAINT jamaah_agent_slug_fkey
  FOREIGN KEY (agent_slug) REFERENCES agents(slug) ON DELETE CASCADE NOT VALID;

-- ai_credits.agent_slug -> CASCADE (usage tracking)
ALTER TABLE ai_credits
  DROP CONSTRAINT IF EXISTS ai_credits_agent_slug_fkey;
ALTER TABLE ai_credits
  ADD CONSTRAINT ai_credits_agent_slug_fkey
  FOREIGN KEY (agent_slug) REFERENCES agents(slug) ON DELETE CASCADE NOT VALID;
`;

console.log('Paste the following SQL into Supabase SQL Editor:\n');
console.log(SQL);
console.log('\nVerify afterwards:');
console.log(`  SELECT conname, confdeltype FROM pg_constraint
    WHERE conname IN (
      'analytics_events_agent_id_fkey',
      'analytics_events_daily_agent_id_fkey',
      'capi_event_logs_agent_id_fkey',
      'capi_configs_agent_id_fkey',
      'jamaah_agent_slug_fkey',
      'ai_credits_agent_slug_fkey'
    );`);
console.log(`\n  confdeltype legend: 'a' = NO ACTION (bad), 'n' = SET NULL, 'c' = CASCADE.`);
