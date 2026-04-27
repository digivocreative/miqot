/**
 * One-off backfill: Fire CAPI Purchase events to multiple agents using jamaah data
 * sourced from the ENTIRE `jamaah` pool (not just each agent's own jamaah).
 *
 * Purpose: Warm up Meta pixel for target agents with diverse volume data.
 *
 * Usage:
 *   node scripts/backfill-capi-crossagent.js                       # dry-run (default)
 *   BACKFILL_CONFIRM=yes node scripts/backfill-capi-crossagent.js
 *
 * ⚠️ NON-IDEMPOTENT: this script uses RANDOM sampling and DOES NOT track which
 * jamaah were fired. Each run sends NEW events to Meta. Re-running multiplies
 * volume. The 2026-04-26 incident (~20k duplicate events across 18 agents in
 * one hour) was caused by re-running this script.
 *
 * What it does:
 * - Fetches all jamaah with bayar > 0 across all agents (pool)
 * - For each target slug:
 *   - Pick a random PER_AGENT jamaah from the pool (different per agent)
 *   - Fire Purchase event to that agent's pixel using borrowed jamaah data
 *   - Log to capi_event_logs for visibility
 * - Does NOT update capi_purchase_status (jamaah belong to other agents)
 * - Rate limit: ~8 req/sec per agent, sequential per agent
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

// ── Config ──
const SLUGS = ['ninanasution'];
const PER_AGENT = 200;
const DELAY_MS = 120; // ~8 req/sec per agent
const DRY_RUN = process.env.BACKFILL_CONFIRM !== 'yes';
const MAX_AGENTS_WITHOUT_OVERRIDE = 3; // Refuse multi-agent runs without explicit opt-in

// ── Setup ──
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const CAPI_ENCRYPTION_KEY = process.env.CAPI_ENCRYPTION_KEY || '';

function capiDecrypt(data) {
  if (!CAPI_ENCRYPTION_KEY || !data || !data.includes(':')) return data;
  try {
    const [ivHex, tagHex, encrypted] = data.split(':');
    const key = Buffer.from(CAPI_ENCRYPTION_KEY, 'base64').slice(0, 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch { return data; }
}

const sha256 = (v) => v ? crypto.createHash('sha256').update(v.trim().toLowerCase()).digest('hex') : undefined;

// Fisher-Yates shuffle
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function fireCapiPurchase(config, accessToken, slug, jamaah) {
  const userName = jamaah.nama || '';
  const userPhone = jamaah.wa || '';
  const value = (jamaah.bayar || 0) + (jamaah.sisa || 0);

  const userData = { client_user_agent: 'Miqot Server Backfill' };
  if (userName) userData.fn = sha256(userName.split(' ')[0]);
  if (userName && userName.includes(' ')) userData.ln = sha256(userName.split(' ').slice(1).join(' '));
  if (userPhone) userData.ph = sha256(userPhone.replace(/\D/g, ''));
  userData.country = sha256('id');

  const payload = {
    data: [{
      event_name: 'Purchase',
      event_id: `crossbackfill-${slug}-${jamaah.id_umroh}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      event_time: Math.floor(Date.now() / 1000),
      event_source_url: `https://alhijaz.co/${slug}`,
      action_source: 'system_generated',
      user_data: userData,
      custom_data: {
        currency: 'IDR',
        value,
        content_name: jamaah.paket || 'Paket Umroh',
        content_ids: [jamaah.id_umroh],
        content_type: 'product',
      },
    }],
    ...(config.test_mode && config.test_event_code ? { test_event_code: config.test_event_code } : {}),
  };

  try {
    const resp = await fetch(
      `https://graph.facebook.com/v21.0/${config.pixel_id}/events?access_token=${encodeURIComponent(accessToken)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    );
    const respData = await resp.json();

    if (!resp.ok || respData?.error) {
      return { ok: false, error: respData?.error?.message || `HTTP ${resp.status}`, value };
    }
    if (respData?.events_received === 0) {
      return { ok: false, error: 'Meta received 0 events', value };
    }
    return { ok: true, events_received: respData.events_received, value };
  } catch (err) {
    return { ok: false, error: err.message, value: 0 };
  }
}

async function processAgent(slug, pool) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🔄 Processing agent: ${slug}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  const { data: agent } = await supabase.from('agents').select('id, slug').eq('slug', slug).single();
  if (!agent) {
    console.log(`  ❌ Agent not found: ${slug}`);
    return { slug, success: 0, failed: 0, skipped: true };
  }

  const { data: config } = await supabase.from('capi_configs').select('*').eq('agent_id', agent.id).single();
  if (!config?.pixel_id || !config?.access_token) {
    console.log(`  ⚠️  No CAPI config for ${slug}, skipping`);
    return { slug, success: 0, failed: 0, skipped: true };
  }
  const accessToken = capiDecrypt(config.access_token);
  if (!accessToken) {
    console.log(`  ❌ Failed to decrypt token for ${slug}`);
    return { slug, success: 0, failed: 0, skipped: true };
  }

  // Random sample from pool
  const picked = shuffle(pool).slice(0, PER_AGENT);
  console.log(`  📋 ${DRY_RUN ? 'Would send' : 'Sending'} ${picked.length} Purchase events (randomly sampled from pool of ${pool.length})`);
  console.log(`  🎯 Pixel: ${config.pixel_id} | Test mode: ${config.test_mode || false}`);

  if (DRY_RUN) {
    return { slug, success: 0, failed: 0, skipped: false, dryRun: true, plannedCount: picked.length };
  }

  let success = 0, failed = 0;
  const errorSamples = [];

  for (let i = 0; i < picked.length; i++) {
    const j = picked[i];
    const result = await fireCapiPurchase(config, accessToken, slug, j);

    if (result.ok) {
      success++;
      await supabase.from('capi_event_logs').insert({
        agent_id: agent.id,
        event_name: 'Purchase',
        status: 'success',
        value: result.value,
        source: 'sync',
      });
      if (i % 25 === 0 || i === picked.length - 1) {
        process.stdout.write(`  ✓ ${i + 1}/${picked.length}\r`);
      }
    } else {
      failed++;
      if (errorSamples.length < 3) errorSamples.push({ id: j.id_umroh, error: result.error });
      await supabase.from('capi_event_logs').insert({
        agent_id: agent.id,
        event_name: 'Purchase',
        status: 'error',
        value: result.value,
        error_message: (result.error || '').slice(0, 500),
        source: 'sync',
      });
    }

    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log(`\n  ✅ ${slug}: ${success} success, ${failed} failed`);
  if (errorSamples.length > 0) {
    console.log(`  ❌ Error samples:`);
    errorSamples.forEach(e => console.log(`     - ${e.id}: ${e.error}`));
  }
  return { slug, success, failed, skipped: false };
}

async function main() {
  console.log(`\n🚀 CAPI Purchase Cross-Agent Backfill${DRY_RUN ? ' [DRY-RUN]' : ''}`);
  console.log(`   Target agents: ${SLUGS.join(', ')}`);
  console.log(`   Events per agent: ${PER_AGENT}`);
  console.log(`   Rate limit: ${1000 / DELAY_MS} req/sec`);
  console.log(`   Total events to fire: ${SLUGS.length * PER_AGENT}`);

  if (DRY_RUN) {
    console.log(`\n⚠️  DRY-RUN MODE — no events will be sent to Meta.`);
    console.log(`    Set BACKFILL_CONFIRM=yes to actually send.`);
  } else if (SLUGS.length > MAX_AGENTS_WITHOUT_OVERRIDE && process.env.BACKFILL_ALLOW_MULTI !== 'yes') {
    console.error(`\n❌ Refusing to run on ${SLUGS.length} agents (>${MAX_AGENTS_WITHOUT_OVERRIDE}).`);
    console.error(`   The 2026-04-26 incident was caused by running this on 18 agents.`);
    console.error(`   If you really mean it, set BACKFILL_ALLOW_MULTI=yes.`);
    process.exit(2);
  }

  // Fetch pool (all jamaah with payment) — paginate to bypass 1000-row default limit
  console.log(`\n📦 Loading jamaah pool...`);
  const pool = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('jamaah')
      .select('id_umroh, nama, wa, paket, bayar, sisa')
      .gt('bayar', 0)
      .range(offset, offset + PAGE - 1);
    if (error) { console.error('Pool fetch error:', error.message); break; }
    if (!data || data.length === 0) break;
    pool.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  if (pool.length === 0) {
    console.error('❌ Pool is empty, aborting');
    return;
  }
  console.log(`   ✓ Loaded ${pool.length} jamaah with payment > 0 into pool`);

  const results = [];
  for (const slug of SLUGS) {
    const result = await processAgent(slug, pool);
    results.push(result);
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 SUMMARY`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  let totalSuccess = 0, totalFailed = 0;
  for (const r of results) {
    totalSuccess += r.success;
    totalFailed += r.failed;
    const status = r.skipped ? '⏭️  skipped (no config)'
      : r.dryRun ? `📝 dry-run (would fire ${r.plannedCount})`
      : `✓ ${r.success} / ✗ ${r.failed}`;
    console.log(`  ${r.slug.padEnd(30)} ${status}`);
  }
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  TOTAL: ${totalSuccess} success, ${totalFailed} failed`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
