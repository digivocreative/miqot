/**
 * Migration: Teras multi-media columns.
 *   1. community_posts.media    (20260720000000_community_post_media.sql)
 *   2. community_post_comments.media (20260721000000_community_comment_media.sql)
 * Idempotent — safe to re-run; order matters (comments reuse the shape-check
 * function created by the posts migration).
 *
 * Run: node scripts/migrate-community-post-media.js
 *
 * If RPC is not available, copy the printed SQL into Supabase SQL Editor.
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MIGRATION_FILES = [
  '20260720000000_community_post_media.sql',
  '20260721000000_community_comment_media.sql',
];

const migrations = MIGRATION_FILES.map(file => ({
  file,
  sql: readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'),
}));

async function migrate() {
  for (const { file, sql } of migrations) {
    console.log(`Applying ${file}...`);
    const { error } = await supabase.rpc('exec_sql', { query: sql });
    if (error) {
      console.log('RPC exec_sql not available:', error.message);
      console.log('Run this SQL manually in Supabase SQL Editor (in this order):');
      for (const migration of migrations) {
        console.log(`\n-- ===== ${migration.file} =====\n`);
        console.log(migration.sql);
      }
      process.exitCode = 1;
      return;
    }
    console.log(`${file} applied successfully.`);
  }
}

migrate().catch((err) => {
  console.error(err);
  console.log('');
  console.log('Run this SQL manually in Supabase SQL Editor (in this order):');
  for (const migration of migrations) {
    console.log(`\n-- ===== ${migration.file} =====\n`);
    console.log(migration.sql);
  }
  process.exitCode = 1;
});
