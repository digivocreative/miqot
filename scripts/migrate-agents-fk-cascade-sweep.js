/**
 * Migration (follow-up): sweep ALL remaining FKs pointing to `agents`.
 *
 * The first migration only fixed FKs we knew about. Tables created directly in
 * Supabase SQL Editor (e.g. jamaah.agent_id) were missed. This DO block
 * queries pg_constraint for every FK that references `agents` and still has
 * NO ACTION on delete (confdeltype='a'), then rewrites each one to CASCADE.
 *
 * Idempotent: running again finds nothing to fix.
 * Non-destructive to our earlier choices: FKs already set to SET NULL ('n')
 * or CASCADE ('c') are left alone.
 *
 * Run: node scripts/migrate-agents-fk-cascade-sweep.js
 * Then paste output into Supabase SQL Editor.
 */

const SQL = `
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      con.conname,
      cl.relname  AS tbl,
      a.attname   AS src_col,
      fa.attname  AS ref_col
    FROM pg_constraint con
    JOIN pg_class     cl  ON con.conrelid  = cl.oid
    JOIN pg_class     fcl ON con.confrelid = fcl.oid
    JOIN pg_attribute a   ON a.attrelid    = con.conrelid  AND a.attnum  = con.conkey[1]
    JOIN pg_attribute fa  ON fa.attrelid   = con.confrelid AND fa.attnum = con.confkey[1]
    WHERE con.contype     = 'f'
      AND fcl.relname     = 'agents'
      AND con.confdeltype = 'a'    -- only NO ACTION (unfixed); leaves 'n'/'c' alone
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES agents(%I) ON DELETE CASCADE NOT VALID',
      r.tbl, r.conname, r.src_col, r.ref_col
    );
    RAISE NOTICE 'Fixed: %.% -> agents(%) now CASCADE', r.tbl, r.src_col, r.ref_col;
  END LOOP;
END $$;
`;

console.log('Paste the following SQL into Supabase SQL Editor:\n');
console.log(SQL);
console.log("Verify afterwards (should list ALL FKs pointing to agents, none with confdeltype='a'):");
console.log(`  SELECT con.conname, cl.relname AS tbl, con.confdeltype
    FROM pg_constraint con
    JOIN pg_class cl ON con.conrelid = cl.oid
    JOIN pg_class fcl ON con.confrelid = fcl.oid
    WHERE con.contype = 'f' AND fcl.relname = 'agents'
    ORDER BY cl.relname;`);
