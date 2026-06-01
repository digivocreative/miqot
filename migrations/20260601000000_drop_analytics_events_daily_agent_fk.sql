-- 2026-06-01 — Drop analytics_events_daily.agent_id -> agents(id) foreign key.
--
-- WHY: the daily rollup stores anonymous (no-agent) traffic under the sentinel
-- agent_id 00000000-0000-0000-0000-000000000000, which is NOT a row in `agents`.
-- The FK `analytics_events_daily_agent_id_fkey` (added by migrate-agents-fk-cascade.js
-- during the agents slug->UUID migration) therefore rejected every sentinel upsert
-- with error 23503. Because runAnalyticsMaintenance skips cleanup whenever
-- aggregation throws, this wedged ALL raw-event retention (analytics_events AND
-- capi_event_logs) for weeks: aggregation froze at 2026-05-19 and both raw tables
-- grew back to 2026-04-30.
--
-- The FK is fundamentally incompatible with the anonymous sentinel (agent_id is part
-- of the PK and NOT NULL, so anonymous rows must use the sentinel). Drop it. Agent
-- deletion is not blocked by its absence; orphan rollup rows for a deleted agent are
-- acceptable (they are ephemeral aggregates).
--
-- Applied to prod via SQL on 2026-06-01. This file records it for the repo.
-- See also: lib/analytics-maintenance.js (per-day failure isolation), and
-- scripts/migrate-agents-fk-cascade.js (no longer re-adds this FK).

ALTER TABLE analytics_events_daily
  DROP CONSTRAINT IF EXISTS analytics_events_daily_agent_id_fkey;

-- Verify (should return ONLY the primary key, no agent_id FK):
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint WHERE conrelid = 'analytics_events_daily'::regclass;
