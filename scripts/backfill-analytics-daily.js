/**
 * One-shot backfill: populate analytics_events_daily from historical
 * analytics_events rows, up to (today - 14 days).
 *
 * Run: node scripts/backfill-analytics-daily.js
 * Safe to re-run — aggregateAnalyticsDay is idempotent via upsert on PK.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { aggregateAnalyticsDay, RAW_RETENTION_DAYS } from '../lib/analytics-maintenance.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function main() {
  console.log('[Backfill] Fetching oldest analytics_events row...');
  const { data: oldest, error: oldErr } = await supabase
    .from('analytics_events')
    .select('created_at')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (oldErr || !oldest) {
    console.error('[Backfill] No events found or error:', oldErr?.message);
    return;
  }

  const firstDay = new Date(oldest.created_at);
  firstDay.setUTCHours(0, 0, 0, 0);
  const cutoff = new Date(Date.now() - RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  cutoff.setUTCHours(0, 0, 0, 0);

  console.log(`[Backfill] Date range: ${firstDay.toISOString().slice(0,10)} → ${cutoff.toISOString().slice(0,10)} (exclusive)`);

  let cursor = new Date(firstDay);
  let totalScanned = 0;
  let totalUpserted = 0;
  let dayCount = 0;

  while (cursor < cutoff) {
    const dayStart = new Date(cursor);
    const dayEnd = new Date(cursor);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    try {
      const { scanned, upserted } = await aggregateAnalyticsDay(
        supabase,
        dayStart.toISOString(),
        dayEnd.toISOString(),
      );
      totalScanned += scanned;
      totalUpserted += upserted;
      dayCount++;
      if (scanned > 0) {
        console.log(`[Backfill] ${dayStart.toISOString().slice(0,10)}: scanned=${scanned}, upserted=${upserted}`);
      }
    } catch (err) {
      console.error(`[Backfill] Failed for ${dayStart.toISOString().slice(0,10)}:`, err.message);
      // Continue with next day instead of aborting — safe because agg is idempotent.
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  console.log(`[Backfill] Done. ${dayCount} days processed, ${totalScanned} events scanned, ${totalUpserted} daily rows upserted.`);
}

main().catch(err => {
  console.error('[Backfill] Fatal:', err);
  process.exit(1);
});
