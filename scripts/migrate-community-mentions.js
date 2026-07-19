/**
 * Migration: Teras @mentions table (community_mentions).
 *   20260723000000_community_mentions.sql
 * Idempotent — safe to re-run.
 *
 * Run: node scripts/migrate-community-mentions.js
 *
 * DDL cannot be applied from the dev machine (no exec_sql RPC / no DB password),
 * so this prints the SQL for you to paste into the Supabase SQL Editor.
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MIGRATION_FILES = ['20260723000000_community_mentions.sql'];

const migrations = MIGRATION_FILES.map(file => ({
  file,
  sql: readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'),
}));

function printManual() {
  console.log('Run this SQL manually in Supabase SQL Editor:');
  for (const migration of migrations) {
    console.log(`\n-- ===== ${migration.file} =====\n`);
    console.log(migration.sql);
  }
}

async function migrate() {
  for (const { file, sql } of migrations) {
    console.log(`Applying ${file}...`);
    const { error } = await supabase.rpc('exec_sql', { query: sql });
    if (error) {
      console.log('RPC exec_sql not available:', error.message);
      printManual();
      process.exitCode = 1;
      return;
    }
    console.log(`${file} applied successfully.`);
  }
}

migrate().catch((err) => {
  console.error(err);
  console.log('');
  printManual();
  process.exitCode = 1;
});
