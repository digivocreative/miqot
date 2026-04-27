/**
 * One-off backfill: Fire CAPI Purchase events for existing jamaah.
 *
 * Usage:
 *   node scripts/backfill-capi-purchase.js                  # dry-run (default)
 *   BACKFILL_CONFIRM=yes node scripts/backfill-capi-purchase.js
 *
 * Config: edit SLUGS + LIMIT below.
 *
 * Idempotency: only fires for jamaah with capi_purchase_status IS NULL.
 * Already-fired jamaah ('dp' or 'lunas') are skipped automatically. Sets
 * status='lunas' after successful fire so re-runs no-op.
 *
 * Dry-run: prints what WOULD be fired without sending. Set BACKFILL_CONFIRM=yes
 * to actually send. Required because this script ships traffic to Meta.
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

// ── Config ──
const SLUGS = ['ninanasution'];
const LIMIT = 1000;
const DELAY_MS = 120; // ~8 req/sec per agent
const DRY_RUN = process.env.BACKFILL_CONFIRM !== 'yes';

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

async function fireCapiPurchase(config, accessToken, slug, jamaah, agentId) {
  const userName = jamaah.nama || '';
  const userPhone = jamaah.wa || '';
  const value = (jamaah.bayar || 0) + (jamaah.sisa || 0);
  const id = jamaah.id_umroh;

  const userData = { client_user_agent: 'Miqot Server Backfill' };
  if (userName) userData.fn = sha256(userName.split(' ')[0]);
  if (userName && userName.includes(' ')) userData.ln = sha256(userName.split(' ').slice(1).join(' '));
  if (userPhone) userData.ph = sha256(userPhone.replace(/\D/g, ''));
  userData.country = sha256('id');

  // Deterministic event_id: Meta auto-dedupes if same jamaah re-fires later via sync
  const payload = {
    data: [{
      event_name: 'Purchase',
      event_id: `${agentId}-${id}-lunas`,
      event_time: Math.floor(Date.now() / 1000),
      event_source_url: `https://alhijaz.co/${slug}`,
      action_source: 'system_generated',
      user_data: userData,
      custom_data: {
        currency: 'IDR',
        value,
        content_name: jamaah.paket || 'Paket Umroh',
        content_ids: [id],
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
      return { ok: false, error: respData?.error?.message || `HTTP ${resp.status}`, response: respData };
    }
    if (respData?.events_received === 0) {
      return { ok: false, error: 'Meta received 0 events', response: respData };
    }
    return { ok: true, events_received: respData.events_received, value };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function processAgent(slug) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🔄 Processing agent: ${slug}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  // 1. Load agent
  const { data: agent } = await supabase.from('agents').select('id, slug').eq('slug', slug).single();
  if (!agent) {
    console.log(`  ❌ Agent not found: ${slug}`);
    return { slug, success: 0, failed: 0, skipped: 0 };
  }

  // 2. Load CAPI config
  const { data: config } = await supabase.from('capi_configs').select('*').eq('agent_id', agent.id).single();
  if (!config?.pixel_id || !config?.access_token) {
    console.log(`  ⚠️  No CAPI config for ${slug}, skipping`);
    return { slug, success: 0, failed: 0, skipped: 0 };
  }
  const accessToken = capiDecrypt(config.access_token);
  if (!accessToken) {
    console.log(`  ❌ Failed to decrypt token for ${slug}`);
    return { slug, success: 0, failed: 0, skipped: 0 };
  }

  // 3. Fetch jamaah with payment AND status NULL (never fired before).
  // Idempotency guard: skips jamaah with status 'dp' or 'lunas' so re-runs
  // don't duplicate Purchase events. processCapiPurchases in server.js handles
  // re-fires after legitimate payment transitions.
  const { data: jamaahList } = await supabase
    .from('jamaah')
    .select('id_umroh, nama, wa, paket, bayar, sisa, capi_purchase_status, synced_at')
    .eq('agent_id', agent.id)
    .gt('bayar', 0)
    .is('capi_purchase_status', null)
    .order('synced_at', { ascending: false })
    .limit(LIMIT);

  if (!jamaahList || jamaahList.length === 0) {
    console.log(`  ℹ️  No unprocessed jamaah for ${slug} (all already fired or no payment)`);
    return { slug, success: 0, failed: 0, skipped: 0 };
  }

  console.log(`  📋 Found ${jamaahList.length} unprocessed jamaah${DRY_RUN ? ' (DRY-RUN — no events will be sent)' : ''}`);
  console.log(`  🎯 Pixel: ${config.pixel_id} | Test mode: ${config.test_mode || false}`);

  if (DRY_RUN) {
    return { slug, success: 0, failed: 0, skipped: jamaahList.length, dryRun: true };
  }

  let success = 0, failed = 0;
  const errorSamples = [];

  for (let i = 0; i < jamaahList.length; i++) {
    const j = jamaahList[i];
    const result = await fireCapiPurchase(config, accessToken, slug, j, agent.id);

    if (result.ok) {
      success++;
      // Update capi_purchase_status to 'lunas'
      await supabase.from('jamaah')
        .update({ capi_purchase_status: 'lunas' })
        .eq('agent_id', agent.id).eq('id_umroh', j.id_umroh).eq('nama', j.nama);

      // Log to capi_event_logs
      await supabase.from('capi_event_logs').insert({
        agent_id: agent.id,
        event_name: 'Purchase',
        status: 'success',
        value: result.value,
        source: 'sync',
      });

      if (i % 10 === 0 || i === jamaahList.length - 1) {
        process.stdout.write(`  ✓ ${i + 1}/${jamaahList.length}\r`);
      }
    } else {
      failed++;
      if (errorSamples.length < 3) errorSamples.push({ id: j.id_umroh, error: result.error });
      await supabase.from('capi_event_logs').insert({
        agent_id: agent.id,
        event_name: 'Purchase',
        status: 'error',
        value: (j.bayar || 0) + (j.sisa || 0),
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
  return { slug, success, failed, skipped: 0 };
}

async function main() {
  console.log(`\n🚀 CAPI Purchase Backfill${DRY_RUN ? ' [DRY-RUN]' : ''}`);
  console.log(`   Agents: ${SLUGS.join(', ')}`);
  console.log(`   Limit per agent: ${LIMIT}`);
  console.log(`   Rate limit: ${1000 / DELAY_MS} req/sec`);
  if (DRY_RUN) {
    console.log(`   ⚠️  Dry-run mode — set BACKFILL_CONFIRM=yes to actually send events to Meta`);
  }

  const results = [];
  for (const slug of SLUGS) {
    const result = await processAgent(slug);
    results.push(result);
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 SUMMARY`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  let totalSuccess = 0, totalFailed = 0;
  for (const r of results) {
    totalSuccess += r.success;
    totalFailed += r.failed;
    const status = r.dryRun ? `📝 dry-run (would fire ${r.skipped})`
      : r.skipped ? '⏭️  skipped'
      : r.success + r.failed === 0 ? '➖ no data'
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
