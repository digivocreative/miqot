/**
 * Migration: Hash existing plaintext passwords + rename column
 *
 * Prerequisites:
 *   1. Add columns in Supabase SQL Editor first:
 *      ALTER TABLE agents ADD COLUMN IF NOT EXISTS password TEXT;
 *      ALTER TABLE agents ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'agent' CHECK (role IN ('admin', 'agent'));
 *      ALTER TABLE agents ADD COLUMN IF NOT EXISTS email TEXT;
 *
 *   2. Run this script:
 *      node scripts/hash-passwords.js
 *
 *   3. After verifying, drop old column:
 *      ALTER TABLE agents DROP COLUMN IF EXISTS capi_password;
 */
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BCRYPT_ROUNDS = 12;

async function hashPasswords() {
  console.log('🔄 Fetching agents with plaintext passwords...');

  const { data: agents, error } = await supabase
    .from('agents')
    .select('slug, capi_password');

  if (error) {
    console.error('❌ Fetch error:', error.message);
    return;
  }

  console.log(`📋 Found ${agents.length} agents\n`);

  let updated = 0;
  let skipped = 0;

  for (const agent of agents) {
    const plaintext = agent.capi_password;
    if (!plaintext) {
      console.log(`⏭  ${agent.slug}: no password, skipping`);
      skipped++;
      continue;
    }

    // Check if already hashed (bcrypt hashes start with $2b$)
    if (plaintext.startsWith('$2b$') || plaintext.startsWith('$2a$')) {
      console.log(`⏭  ${agent.slug}: already hashed, skipping`);
      skipped++;
      continue;
    }

    const hashed = await bcrypt.hash(plaintext, BCRYPT_ROUNDS);
    const { error: updateError } = await supabase
      .from('agents')
      .update({ password: hashed })
      .eq('slug', agent.slug);

    if (updateError) {
      console.error(`❌ ${agent.slug}: ${updateError.message}`);
    } else {
      console.log(`✅ ${agent.slug}: hashed (${plaintext.substring(0, 3)}***)`);
      updated++;
    }
  }

  console.log(`\n🏁 Done! ${updated} hashed, ${skipped} skipped`);

  // Set nikita as admin
  console.log('\n🔄 Setting nikita as admin...');
  const { error: adminError } = await supabase
    .from('agents')
    .update({ role: 'admin' })
    .eq('slug', 'nikita');

  if (adminError) {
    console.error('❌ Failed to set admin:', adminError.message);
  } else {
    console.log('✅ nikita is now admin!');
  }

  console.log('\n📌 Next steps:');
  console.log('   1. Verify login works with the hashed passwords');
  console.log('   2. Then drop the old column:');
  console.log('      ALTER TABLE agents DROP COLUMN IF EXISTS capi_password;');
}

hashPasswords().catch(console.error);
