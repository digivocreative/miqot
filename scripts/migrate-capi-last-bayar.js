import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function migrate() {
  const { error } = await supabase.rpc('exec_sql', {
    query: `ALTER TABLE jamaah ADD COLUMN IF NOT EXISTS capi_last_bayar INTEGER DEFAULT 0;`
  });
  if (error) {
    console.log('Run this SQL manually in Supabase Dashboard:');
    console.log('ALTER TABLE jamaah ADD COLUMN IF NOT EXISTS capi_last_bayar INTEGER DEFAULT 0;');
  } else {
    console.log('Migration done: capi_last_bayar column added');
  }
}
migrate();
