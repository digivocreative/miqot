/**
 * One-time migration: upload existing agent photos from public/agents/ to Supabase Storage.
 *
 * Prerequisites:
 *   1. Create a PUBLIC bucket called "agent-photos" in Supabase Dashboard
 *      (Storage → New Bucket → name: agent-photos → Public: ON)
 *
 * Usage:
 *   node scripts/migrate-photos-to-supabase.js
 */

import { createClient } from '@supabase/supabase-js';
import { readdirSync, readFileSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const BUCKET = 'agent-photos';
const photosDir = resolve(__dirname, '..', 'public', 'agents');

async function migrate() {
  console.log(`📂 Reading photos from ${photosDir}...\n`);

  const files = readdirSync(photosDir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
  console.log(`Found ${files.length} photo(s) to migrate.\n`);

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const filePath = resolve(photosDir, file);
    const buffer = readFileSync(filePath);
    const slug = basename(file, '.jpg'); // e.g. "andra"

    // Upload (upsert) to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(file, buffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      console.log(`  ❌ ${file}: ${uploadError.message}`);
      failed++;
      continue;
    }

    // Get public URL and update agents table
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(file);
    const photoUrl = `${urlData.publicUrl}?v=${Date.now()}`;

    const { error: dbError } = await supabase
      .from('agents')
      .update({ photo: photoUrl })
      .eq('slug', slug);

    if (dbError) {
      console.log(`  ⚠️  ${file}: uploaded but DB update failed — ${dbError.message}`);
      skipped++;
    } else {
      console.log(`  ✅ ${file} → ${urlData.publicUrl}`);
      success++;
    }
  }

  console.log(`\n── Done ──`);
  console.log(`  ✅ ${success} migrated`);
  if (skipped) console.log(`  ⚠️  ${skipped} uploaded but DB update failed`);
  if (failed) console.log(`  ❌ ${failed} failed`);
}

migrate().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
