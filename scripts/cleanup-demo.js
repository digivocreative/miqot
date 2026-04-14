/**
 * Cleanup script: Remove all _DEMO_ tagged dummy data from Supabase.
 * Run after demo is complete: node scripts/cleanup-demo.js
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const AGENT_SLUG = 'bagas';

async function cleanup() {
  console.log('\n=== CLEANUP DEMO DATA ===\n');

  // 1. Jamaah Umroh
  const { data: d1, error: e1 } = await supabase
    .from('jamaah')
    .delete()
    .eq('agent_slug', AGENT_SLUG)
    .like('id_umroh', '_DEMO_%')
    .select('id');
  if (e1) console.error('  GAGAL cleanup jamaah:', e1.message);
  else console.log(`  OK Hapus ${d1?.length || 0} jamaah umroh`);

  // 2. Jamaah Haji
  const { data: d2, error: e2 } = await supabase
    .from('jamaah_haji')
    .delete()
    .eq('agent_slug', AGENT_SLUG)
    .like('id_haji', '_DEMO_%')
    .select('id_haji');
  if (e2) console.error('  GAGAL cleanup jamaah haji:', e2.message);
  else console.log(`  OK Hapus ${d2?.length || 0} jamaah haji`);

  // 3. Calendar Events
  const { data: d3, error: e3 } = await supabase
    .from('calendar_events')
    .delete()
    .like('id', '_DEMO_%')
    .select('id');
  if (e3) console.error('  GAGAL cleanup calendar events:', e3.message);
  else console.log(`  OK Hapus ${d3?.length || 0} calendar events`);

  // 4. Flight Status (seeded dummy flights for Apr 14-15)
  const flightIds = ['2026-04-14_GA982', '2026-04-15_SV821'];
  const { data: d4f, error: e4f } = await supabase
    .from('flight_status')
    .delete()
    .in('id', flightIds)
    .select('id');
  if (e4f) console.error('  GAGAL cleanup flight status:', e4f.message);
  else console.log(`  OK Hapus ${d4f?.length || 0} flight status`);

  // 5. Analytics Events (filter by metadata.source = '_DEMO_')
  const { data: d4, error: e4 } = await supabase
    .from('analytics_events')
    .delete()
    .eq('agent_slug', AGENT_SLUG)
    .eq('metadata->>source', '_DEMO_')
    .select('id');
  if (e4) console.error('  GAGAL cleanup analytics:', e4.message);
  else console.log(`  OK Hapus ${d4?.length || 0} analytics events`);

  // 6. Calendar Insights (demo_bagas)
  const { error: e6 } = await supabase
    .from('calendar_insights')
    .delete()
    .eq('id', 'demo_bagas');
  if (e6) console.error('  GAGAL cleanup calendar insights:', e6.message);
  else console.log('  OK Hapus calendar insight demo_bagas');

  console.log('\nCleanup selesai!\n');
}

cleanup().catch(err => {
  console.error('Cleanup error:', err);
  process.exit(1);
});
