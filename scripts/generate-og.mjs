/**
 * Generate static OG images (1200x630) for every agent in the database.
 *
 * Usage:
 *   node scripts/generate-og.mjs            # all active agents
 *   node scripts/generate-og.mjs nikita     # one specific slug
 *   node scripts/generate-og.mjs --all      # include pending + rejected
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { regenerateOgForAgent } from '../lib/og-generator.mjs';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function fetchAgents({ includeInactive, slugFilter }) {
  let query = supabase
    .from('agents')
    .select('slug, name, website, phone, photo, status')
    .order('slug');
  if (!includeInactive) {
    // Active agents only (exclude rejected/pending unless --all)
    query = query.or('status.is.null,status.eq.active');
  }
  if (slugFilter) {
    query = query.eq('slug', slugFilter.toLowerCase());
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function main() {
  const args = process.argv.slice(2);
  const includeInactive = args.includes('--all');
  const slugFilter = args.find((a) => !a.startsWith('--'));

  console.log('🎨 Generating OG images from Supabase…');
  if (slugFilter) console.log(`   Filter: slug=${slugFilter}`);
  if (includeInactive) console.log('   Including pending + rejected agents');

  const agents = await fetchAgents({ includeInactive, slugFilter });
  if (!agents.length) {
    console.log('No agents matched.');
    return;
  }
  console.log(`Found ${agents.length} agent(s)\n`);

  let ok = 0;
  let fail = 0;
  let noPhoto = 0;
  for (const agent of agents) {
    const result = await regenerateOgForAgent(agent);
    if (!result.ok) fail += 1;
    else {
      ok += 1;
      if (!result.hadPhoto) noPhoto += 1;
    }
  }

  console.log(`\n✨ Done. ${ok} generated, ${fail} failed${noPhoto ? `, ${noPhoto} without photo (placeholder used)` : ''}.`);
}

main().catch((err) => {
  console.error('Generation failed:', err);
  process.exit(1);
});
