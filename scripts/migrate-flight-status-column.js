/**
 * Migration: Add flight_status column to flight_shares table
 * 
 * Run this SQL in Supabase SQL Editor:
 * 
 * ALTER TABLE flight_shares ADD COLUMN IF NOT EXISTS flight_status text DEFAULT 'scheduled';
 * 
 * Or run this script which verifies the column exists.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  // Test if column exists
  const { error } = await supabase
    .from('flight_shares')
    .select('flight_status')
    .limit(1);

  if (error && error.message.includes('does not exist')) {
    console.error('❌ Column flight_status does NOT exist in flight_shares table.');
    console.log('\nRun this SQL in Supabase SQL Editor:\n');
    console.log("  ALTER TABLE flight_shares ADD COLUMN IF NOT EXISTS flight_status text DEFAULT 'scheduled';\n");
  } else if (!error) {
    console.log('✅ Column flight_status already exists in flight_shares table.');
  } else {
    console.error('Error:', error.message);
  }
}

main();
