/**
 * Migration: Drop legacy `agent_slug` columns + FKs that reference `agents(slug)`.
 *
 * Background: tables jamaah / ai_credits / flight_shares / jamaah_haji were
 * originally keyed by `agent_slug` (TEXT FK to agents.slug). Server code has
 * since moved to `agent_id` (UUID FK to agents.id) — every business query +
 * upsert in server.js now uses agent_id. The `agent_slug` columns and their
 * FKs are dead weight, and the FKs (ON UPDATE NO ACTION) actively block agents
 * from renaming their slug ("violates foreign key constraint
 * jamaah_agent_slug_fkey").
 *
 * What this migration does, per table:
 *   1. Backfill agent_id from agent_slug (defensive — no-op if already set)
 *   2. Verify zero rows have NULL agent_id (abort otherwise)
 *   3. Set agent_id NOT NULL + enforce FK to agents(id) ON DELETE CASCADE
 *   4. DROP COLUMN agent_slug CASCADE — auto-drops the legacy FK,
 *      legacy UNIQUE constraint, and legacy indexes that depended on it
 *
 * After this runs, agents.slug is a free-floating natural key. Renaming it
 * touches exactly one row (agents) — no FK cascade across millions of jamaah
 * rows. `agent_slug_history` (URL redirect audit trail) is untouched.
 *
 * Idempotent: safe to re-run. All steps use IF EXISTS / DO blocks. The final
 * DROP COLUMN is a no-op once the column is gone.
 *
 * Run: node scripts/migrate-jamaah-fk-to-agent-id.js
 * Then paste the printed SQL into Supabase SQL Editor.
 */

const SQL = `
-- ============================================================
-- jamaah
-- ============================================================
DO $$
DECLARE missing INT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'jamaah' AND column_name = 'agent_slug'
  ) THEN
    UPDATE jamaah j
       SET agent_id = a.id
      FROM agents a
     WHERE j.agent_id IS NULL
       AND j.agent_slug = a.slug;
  END IF;

  SELECT COUNT(*) INTO missing FROM jamaah WHERE agent_id IS NULL;
  IF missing > 0 THEN
    RAISE EXCEPTION 'jamaah: % rows have NULL agent_id — aborting', missing;
  END IF;
END $$;

ALTER TABLE jamaah ALTER COLUMN agent_id SET NOT NULL;

ALTER TABLE jamaah DROP CONSTRAINT IF EXISTS jamaah_agent_id_fkey;
ALTER TABLE jamaah
  ADD CONSTRAINT jamaah_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE jamaah DROP COLUMN IF EXISTS agent_slug CASCADE;

-- ============================================================
-- jamaah_haji
-- ============================================================
DO $$
DECLARE missing INT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'jamaah_haji' AND column_name = 'agent_slug'
  ) THEN
    UPDATE jamaah_haji jh
       SET agent_id = a.id
      FROM agents a
     WHERE jh.agent_id IS NULL
       AND jh.agent_slug = a.slug;
  END IF;

  SELECT COUNT(*) INTO missing FROM jamaah_haji WHERE agent_id IS NULL;
  IF missing > 0 THEN
    RAISE EXCEPTION 'jamaah_haji: % rows have NULL agent_id — aborting', missing;
  END IF;
END $$;

ALTER TABLE jamaah_haji ALTER COLUMN agent_id SET NOT NULL;

ALTER TABLE jamaah_haji DROP CONSTRAINT IF EXISTS jamaah_haji_agent_id_fkey;
ALTER TABLE jamaah_haji
  ADD CONSTRAINT jamaah_haji_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE jamaah_haji DROP COLUMN IF EXISTS agent_slug CASCADE;

-- ============================================================
-- ai_credits  (agent_slug was PRIMARY KEY here; agent_id must already
-- have a unique/PK constraint since server.js upserts with onConflict='agent_id')
-- ============================================================
DO $$
DECLARE missing INT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'ai_credits' AND column_name = 'agent_slug'
  ) THEN
    UPDATE ai_credits ac
       SET agent_id = a.id
      FROM agents a
     WHERE ac.agent_id IS NULL
       AND ac.agent_slug = a.slug;
  END IF;

  SELECT COUNT(*) INTO missing FROM ai_credits WHERE agent_id IS NULL;
  IF missing > 0 THEN
    RAISE EXCEPTION 'ai_credits: % rows have NULL agent_id — aborting', missing;
  END IF;
END $$;

ALTER TABLE ai_credits ALTER COLUMN agent_id SET NOT NULL;

ALTER TABLE ai_credits DROP CONSTRAINT IF EXISTS ai_credits_agent_id_fkey;
ALTER TABLE ai_credits
  ADD CONSTRAINT ai_credits_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE ai_credits DROP COLUMN IF EXISTS agent_slug CASCADE;

-- ============================================================
-- flight_shares
-- ============================================================
DO $$
DECLARE missing INT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'flight_shares' AND column_name = 'agent_slug'
  ) THEN
    UPDATE flight_shares fs
       SET agent_id = a.id
      FROM agents a
     WHERE fs.agent_id IS NULL
       AND fs.agent_slug = a.slug;
  END IF;

  SELECT COUNT(*) INTO missing FROM flight_shares WHERE agent_id IS NULL;
  IF missing > 0 THEN
    RAISE EXCEPTION 'flight_shares: % rows have NULL agent_id — aborting', missing;
  END IF;
END $$;

ALTER TABLE flight_shares ALTER COLUMN agent_id SET NOT NULL;

ALTER TABLE flight_shares DROP CONSTRAINT IF EXISTS flight_shares_agent_id_fkey;
ALTER TABLE flight_shares
  ADD CONSTRAINT flight_shares_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE flight_shares DROP COLUMN IF EXISTS agent_slug CASCADE;
`;

const VERIFY = `
-- Verify: agent_slug columns are gone
SELECT table_name, column_name
  FROM information_schema.columns
 WHERE column_name = 'agent_slug'
   AND table_name IN ('jamaah','jamaah_haji','ai_credits','flight_shares');
-- Expected: 0 rows.

-- Verify: every FK to agents is on agents.id (not agents.slug),
-- and confdeltype = 'c' (CASCADE) or 'n' (SET NULL) — never 'a' (NO ACTION).
SELECT
  cl.relname        AS tbl,
  con.conname,
  fa.attname        AS ref_col,
  con.confdeltype   AS on_delete,
  con.confupdtype   AS on_update
FROM pg_constraint con
JOIN pg_class     cl  ON con.conrelid  = cl.oid
JOIN pg_class     fcl ON con.confrelid = fcl.oid
JOIN pg_attribute fa  ON fa.attrelid   = con.confrelid AND fa.attnum = con.confkey[1]
WHERE con.contype = 'f'
  AND fcl.relname = 'agents'
ORDER BY cl.relname;
-- Expected: every ref_col = 'id'. None pointing to 'slug'.

-- Sanity check: agent slug rename now works without errors.
-- (Don't actually run unless testing — agents row will be touched.)
--   UPDATE agents SET slug = slug WHERE id = '<some-test-agent-id>';
`;

console.log('Paste the following SQL into Supabase SQL Editor:\n');
console.log(SQL);
console.log('\n--- After running, verify with: ---\n');
console.log(VERIFY);
