/**
 * Migration: Add notification_prefs JSONB column to agents table
 *
 * Run: node scripts/migrate-notification-prefs.js
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function migrate() {
  console.log('Adding notification_prefs column to agents...');

  const { error } = await supabase.rpc('exec_sql', {
    query: `
      ALTER TABLE agents ADD COLUMN IF NOT EXISTS notification_prefs JSONB DEFAULT '{
        "departure": true,
        "paspor": true,
        "pelunasan": true,
        "perlengkapan": true,
        "manasik": true,
        "jamaah_baru": true,
        "seat_alert": true,
        "paket_baru": true,
        "perubahan_harga": true,
        "pembayaran_masuk": true,
        "pembayaran_cicilan": true,
        "pembayaran_pelunasan": true,
        "ringkasan_mingguan": true
      }'::jsonb;
    `
  });

  if (error) {
    // Fallback: try direct SQL if RPC not available
    console.warn('RPC exec_sql not available, trying direct column add via update...');

    // Check if column exists by trying to select it
    const { error: selectErr } = await supabase
      .from('agents')
      .select('notification_prefs')
      .limit(1);

    if (selectErr && selectErr.message.includes('notification_prefs')) {
      console.error('Column does not exist and cannot be added via Supabase client.');
      console.log('\nRun this SQL manually in Supabase Dashboard → SQL Editor:\n');
      console.log(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS notification_prefs JSONB DEFAULT '{
  "departure": true,
  "paspor": true,
  "pelunasan": true,
  "perlengkapan": true,
  "manasik": true,
  "jamaah_baru": true,
  "seat_alert": true,
  "paket_baru": true,
  "perubahan_harga": true,
  "pembayaran_masuk": true,
  "pembayaran_cicilan": true,
  "pembayaran_pelunasan": true,
  "ringkasan_mingguan": true
}'::jsonb;`);
      process.exit(1);
    } else {
      console.log('✅ Column notification_prefs already exists!');
    }
  } else {
    console.log('✅ Migration complete!');
  }
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
