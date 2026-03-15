// Migration: Add perlengkapan and dokumen JSONB columns to jamaah table
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function migrate() {
  console.log('Adding perlengkapan and dokumen columns...');

  // Use rpc to run raw SQL
  const { error: e1 } = await supabase.rpc('exec_sql', {
    sql: "ALTER TABLE jamaah ADD COLUMN IF NOT EXISTS perlengkapan JSONB DEFAULT '{}';"
  });

  const { error: e2 } = await supabase.rpc('exec_sql', {
    sql: "ALTER TABLE jamaah ADD COLUMN IF NOT EXISTS dokumen JSONB DEFAULT '{}';"
  });

  if (e1 || e2) {
    console.log('RPC method not available, trying direct insert test...');
    // Try a direct upsert with the new columns to see if they exist
    const { error: testErr } = await supabase
      .from('jamaah')
      .select('perlengkapan,dokumen')
      .limit(1);

    if (testErr) {
      console.log('⚠️  Columns do not exist yet. Please run this SQL in your Supabase dashboard:');
      console.log(`
ALTER TABLE jamaah ADD COLUMN IF NOT EXISTS perlengkapan JSONB DEFAULT '{}';
ALTER TABLE jamaah ADD COLUMN IF NOT EXISTS dokumen JSONB DEFAULT '{}';
      `);
    } else {
      console.log('✅ Columns already exist!');
    }
  } else {
    console.log('✅ Migration complete!');
  }
}

migrate().catch(console.error);
