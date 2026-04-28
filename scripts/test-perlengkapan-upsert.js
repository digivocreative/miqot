/**
 * Diagnostic: replicate exactly what syncUmrahViaApiCore does for ONE jamaah,
 * then read back to see whether perlengkapan was actually written.
 *
 * Usage: AWAPI_KEY=SM01078-... node scripts/test-perlengkapan-upsert.js
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
import { awapiFetchUmrahById, normalizeAwapiRow } from '../awapi-client.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const apiKey = process.env.AWAPI_KEY;
const code = 'SM01078';
const ID_UMRAH = 'AIW0025677';

(async () => {
  const { data: agent } = await supabase.from('agents').select('id, slug').eq('slug', 'nikita').single();
  const agentId = agent.id;

  const { rows } = await awapiFetchUmrahById(apiKey, code, ID_UMRAH);
  console.log(`API returned ${rows.length} rows for ${ID_UMRAH}`);

  for (const raw of rows) {
    const norm = normalizeAwapiRow(raw, { agentId });
    norm.hijriah_year = '1447';
    console.log(`\nUpsert ${norm.nama}:`);
    console.log(`  perlengkapan in payload:`, JSON.stringify(norm.perlengkapan));

    const { error } = await supabase
      .from('jamaah')
      .upsert([norm], { onConflict: 'agent_id,id_umroh,jm_id' });
    if (error) {
      console.error('  UPSERT ERROR:', error.message);
      continue;
    }

    // Read back
    const { data } = await supabase
      .from('jamaah')
      .select('perlengkapan, raw_data->\'perlengkapan\' as raw_perlengkapan, synced_at')
      .eq('agent_id', agentId).eq('id_umroh', norm.id_umroh).eq('jm_id', norm.jm_id).single();
    console.log(`  AFTER upsert, perlengkapan in DB:`, JSON.stringify(data?.perlengkapan));
    console.log(`  raw_data.perlengkapan:`, JSON.stringify(data?.raw_perlengkapan));
    console.log(`  synced_at:`, data?.synced_at);
  }
})();
