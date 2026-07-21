/**
 * Backfill: stamp `teras_tg_sent_at` = now() on Telegram-connected agents that
 * don't have it yet.
 *
 * WHY: the Teras Telegram digest defaults for komentar/reaksi flipped from OFF
 * to ON. The 10-minute digest sweep (server.js) only skips rows older than an
 * agent's `teras_tg_sent_at` watermark; an agent with no watermark picks up the
 * full 24h lookback window. Without this backfill, the first sweep after deploy
 * would blast every connected+active agent a one-time backlog of up to 24h of
 * comment/reaction activity. Stamping the watermark to "now" makes those agents
 * start receiving digests only for activity going forward — the same thing the
 * PUT path already does via enabledTelegramKeysTurnedOn when a channel is
 * manually turned on.
 *
 * SAFE TO RE-RUN: only fills the key where it is absent; never moves an existing
 * watermark, and merges into notification_prefs without touching other keys.
 * Agents without a Telegram chat never enter the sweep, so they're left alone
 * (if one connects later it's a lone trickle, not a deploy-wide blast).
 *
 * Run BEFORE (or together with) the deploy that ships the new defaults:
 *   node scripts/backfill-teras-tg-watermark.js
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TERAS_TG_SENT_AT_KEY = 'teras_tg_sent_at';
const PAGE_SIZE = 1000;

async function backfill() {
  // One timestamp for the whole run so every agent gets the same watermark.
  const nowIso = new Date().toISOString();
  console.log(`Backfilling ${TERAS_TG_SENT_AT_KEY} = ${nowIso} for Telegram-connected agents that lack it...`);

  let from = 0;
  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  for (;;) {
    const { data: rows, error } = await supabase
      .from('agents')
      .select('id, notification_prefs')
      .not('telegram_chat_id', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      scanned += 1;
      const prefs = row.notification_prefs || {};
      // Never move an existing watermark — only fill when absent.
      if (typeof prefs[TERAS_TG_SENT_AT_KEY] === 'string' && prefs[TERAS_TG_SENT_AT_KEY]) {
        skipped += 1;
        continue;
      }
      const merged = { ...prefs, [TERAS_TG_SENT_AT_KEY]: nowIso };
      const { error: updateError } = await supabase
        .from('agents')
        .update({ notification_prefs: merged })
        .eq('id', row.id);
      if (updateError) {
        console.warn(`  ✗ gagal update ${row.id}: ${updateError.message}`);
        continue;
      }
      updated += 1;
    }

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  console.log(`✅ Selesai. Dipindai ${scanned}, distempel ${updated}, dilewati ${skipped} (sudah punya watermark).`);
}

backfill().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
