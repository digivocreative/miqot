/**
 * Migration: Add capi_purchase_status column to jamaah and jamaah_haji tables
 * + Backfill existing Umroh jamaah based on capi_last_bayar
 *
 * Run: node scripts/migrate-capi-purchase-status.js
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function migrate() {
  console.log('🔄 Adding capi_purchase_status column to jamaah and jamaah_haji...');

  const { error: sqlError } = await supabase.rpc('exec_sql', {
    query: `
      DO $$ BEGIN
        -- Add column to jamaah (Umroh)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jamaah' AND column_name='capi_purchase_status') THEN
          ALTER TABLE jamaah ADD COLUMN capi_purchase_status TEXT;
        END IF;

        -- Add column to jamaah_haji
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jamaah_haji' AND column_name='capi_purchase_status') THEN
          ALTER TABLE jamaah_haji ADD COLUMN capi_purchase_status TEXT;
        END IF;

        -- Backfill Umroh: jamaah that already had CAPI Purchase fired (capi_last_bayar > 0)
        -- If sisa <= 0, they're already lunas; otherwise they're at DP stage
        UPDATE jamaah SET capi_purchase_status = 'lunas'
          WHERE capi_last_bayar > 0 AND sisa <= 0 AND capi_purchase_status IS NULL;

        UPDATE jamaah SET capi_purchase_status = 'dp'
          WHERE capi_last_bayar > 0 AND sisa > 0 AND capi_purchase_status IS NULL;
      END $$;
    `
  });

  if (sqlError) {
    console.log('⚠️  RPC exec_sql not available. Please run manually in Supabase SQL Editor:');
    console.log('');
    console.log('  ALTER TABLE jamaah ADD COLUMN IF NOT EXISTS capi_purchase_status TEXT;');
    console.log('  ALTER TABLE jamaah_haji ADD COLUMN IF NOT EXISTS capi_purchase_status TEXT;');
    console.log('');
    console.log('  -- Backfill existing Umroh jamaah');
    console.log("  UPDATE jamaah SET capi_purchase_status = 'lunas'");
    console.log('    WHERE capi_last_bayar > 0 AND sisa <= 0 AND capi_purchase_status IS NULL;');
    console.log("  UPDATE jamaah SET capi_purchase_status = 'dp'");
    console.log('    WHERE capi_last_bayar > 0 AND sisa > 0 AND capi_purchase_status IS NULL;');
    console.log('');
  } else {
    console.log('✅ Columns added and backfill complete!');

    // Log backfill stats
    const { count: dpCount } = await supabase
      .from('jamaah').select('*', { count: 'exact', head: true })
      .eq('capi_purchase_status', 'dp');
    const { count: lunasCount } = await supabase
      .from('jamaah').select('*', { count: 'exact', head: true })
      .eq('capi_purchase_status', 'lunas');
    console.log(`   Backfilled: ${dpCount || 0} jamaah as 'dp', ${lunasCount || 0} as 'lunas'`);
  }
}

migrate().catch(console.error);
