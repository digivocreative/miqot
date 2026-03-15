import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fix() {
  console.log('Fixing hijriah_year based on tgl_berangkat...\n');

  // 1448 H: berangkat >= 2026-06-16
  const { count: c1448, error: e1 } = await supabase
    .from('jamaah')
    .update({ hijriah_year: '1448' })
    .gte('tgl_berangkat', '2026-06-16')
    .lte('tgl_berangkat', '2027-06-05');
  console.log(`1448 H: ${c1448 ?? 'done'}`, e1 ? `ERROR: ${e1.message}` : '✅');

  // 1447 H: berangkat >= 2025-06-26 AND < 2026-06-16
  const { count: c1447, error: e2 } = await supabase
    .from('jamaah')
    .update({ hijriah_year: '1447' })
    .gte('tgl_berangkat', '2025-06-26')
    .lt('tgl_berangkat', '2026-06-16');
  console.log(`1447 H: ${c1447 ?? 'done'}`, e2 ? `ERROR: ${e2.message}` : '✅');

  // 1446 H: berangkat < 2025-06-26
  const { count: c1446, error: e3 } = await supabase
    .from('jamaah')
    .update({ hijriah_year: '1446' })
    .lt('tgl_berangkat', '2025-06-26');
  console.log(`1446 H: ${c1446 ?? 'done'}`, e3 ? `ERROR: ${e3.message}` : '✅');

  console.log('\nDone!');
}

fix().catch(console.error);
