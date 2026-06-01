-- 2026-06-01 — Drop the redundant single-column index jamaah(agent_id).
--
-- WHY: jamaah carried SIX indexes; every INSERT/UPSERT during the background sync
-- (which re-upserts the whole fleet's jamaah on a cooldown) maintains all of them.
-- `idx_jamaah_agent_id` (agent_id) is a prefix of multiple composites that lead
-- with agent_id — idx_jamaah_agent_id_hijriah (agent_id, hijriah_year) and
-- idx_jamaah_agent_id_tgl_berangkat (agent_id, tgl_berangkat) — so any agent_id-only
-- lookup (and the agent_id FK cascade) is already served by a composite. Usage stats
-- confirmed it was the least-used index (idx_scan ~23 vs 41k on the unique key), so
-- dropping it removes ~568 kB of per-write index maintenance with no read regression.
--
-- Part of the 2026-06-01 Disk IO mitigation (see also: lib/sync-schedule.js for the
-- sync cooldown change, and 20260601000000_drop_analytics_events_daily_agent_fk.sql).
--
-- Redundancy was verified against the LIVE prod index set via pg_indexes on
-- 2026-06-01 (both agent_id-leading composites confirmed present in prod) — note
-- some jamaah indexes were created in prod outside the repo's index scripts, so
-- pg_indexes (not the scripts) is the source of truth for what exists.
--
-- Applied to prod via SQL on 2026-06-01. This file records it for the repo.

DROP INDEX IF EXISTS public.idx_jamaah_agent_id;

-- Verify (idx_jamaah_agent_id should be absent; composites leading with agent_id remain):
--   SELECT indexname FROM pg_indexes WHERE tablename = 'jamaah' ORDER BY indexname;
