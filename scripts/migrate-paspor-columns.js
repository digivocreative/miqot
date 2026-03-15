// Migration: add no_paspor and paspor_expired columns to jamaah table
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function migrate() {
  console.log('Adding no_paspor and paspor_expired columns to jamaah table...');

  const { error: e1 } = await supabase.rpc('exec_sql', {
    sql: `ALTER TABLE jamaah ADD COLUMN IF NOT EXISTS no_paspor TEXT;`
  }).maybeSingle();

  const { error: e2 } = await supabase.rpc('exec_sql', {
    sql: `ALTER TABLE jamaah ADD COLUMN IF NOT EXISTS paspor_expired DATE;`
  }).maybeSingle();

  // Fallback: try direct SQL if rpc doesn't work
  if (e1 || e2) {
    console.log('RPC failed, trying direct approach...');
    // Test if columns already exist by doing a select
    const { error: testErr } = await supabase
      .from('jamaah')
      .select('no_paspor, paspor_expired')
      .limit(1);

    if (testErr) {
      console.error('Columns do not exist and could not be created automatically.');
      console.log('\nPlease run this SQL in Supabase Dashboard → SQL Editor:\n');
      console.log('ALTER TABLE jamaah ADD COLUMN IF NOT EXISTS no_paspor TEXT;');
      console.log('ALTER TABLE jamaah ADD COLUMN IF NOT EXISTS paspor_expired DATE;');
    } else {
      console.log('✅ Columns already exist!');
    }
  } else {
    console.log('✅ Columns added successfully!');
  }
}

migrate().catch(console.error);
