/**
 * Migration Script: Seed static agent data to Supabase
 *
 * Run: node scripts/migrate-agents-to-supabase.js
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Agent data from src/data/agents.ts ──
const AGENTS = [
  { slug: 'nikita', name: 'Nikita', website: 'alhijazindonesia.com', phone: '62822900020', photo: '/agents/nikita.jpg', capi_password: 'elanggagah' },
  { slug: 'nila', name: 'Nila', website: 'alhijaztourtravels.com', phone: '6285211209049', photo: '/agents/nila.jpg', capi_password: 'kucingberani' },
  { slug: 'andra', name: 'Andra', website: 'travelalhijazwisata.com', phone: '628129909795', photo: '/agents/andra.jpg', capi_password: 'rubahsetia' },
  { slug: 'dyah', name: 'Dyah', website: 'alhijaztraveltours.com', phone: '6281385975678', photo: '/agents/dyah.jpg', capi_password: 'sapiganteng' },
  { slug: 'widi', name: 'Widi', website: 'alhijaz-hajiumroh.com', phone: '6287820813228', photo: '/agents/widi.jpg', capi_password: 'kudagigih' },
  { slug: 'aulia', name: 'Aulia', website: 'alhijazumrohtravel.com', phone: '6282110407229', photo: '/agents/aulia.jpg', capi_password: 'rusaanggun' },
  { slug: 'selfiah', name: 'Selfiah', website: 'alhijaztourtravel.co.id', phone: '6281410478212', photo: '/agents/selfiah.jpg', capi_password: 'merakgemilang' },
  { slug: 'zakia', name: 'Zakia', website: 'alhijazbirowisata.com', phone: '6285158005623', photo: '/agents/zakia.jpg', capi_password: 'dombaramai' },
  { slug: 'dianwahyuni', name: 'Dian', website: 'alhijazindowisatatours.com', phone: '6283197968407', photo: '/agents/dianwahyuni.jpg', capi_password: 'rajawaliperkasa' },
  { slug: 'anne', name: 'Anne', website: 'hajialhijaz.com', phone: '628129953424', photo: '/agents/anne.jpg', capi_password: 'lumbalincah' },
  { slug: 'evi', name: 'Evi', website: 'alhijazbirohajiumroh.com', phone: '6281806742789', photo: '/agents/evi.jpg', capi_password: 'pandaemas' },
  { slug: 'yenita', name: 'Yenita', website: 'alhijazumrahtravel.com', phone: '6281316803128', photo: '/agents/yenita.jpg', capi_password: 'bangausakti' },
  { slug: 'indah', name: 'Indah', website: 'alhijaztraveltour.com', phone: '6281943631008', photo: '/agents/indah.jpg', capi_password: 'kelincipintar' },
  { slug: 'aisyah', name: 'Aisyah', website: 'travelalhijazumrah.com', phone: '6281225600900', photo: '/agents/aisyah.jpg', capi_password: 'angsagemari' },
  { slug: 'siska', name: 'Siska', website: 'alhijazumroh.com', phone: '6281188885291', photo: '/agents/siska.jpg', capi_password: 'harimauberkah' },
  { slug: 'linda', name: 'Linda', website: 'alhijazcallcenter.com', phone: '6282112094089', photo: '/agents/linda.jpg', capi_password: 'falconcemerlang' },
  { slug: 'nina', name: 'Nina', website: 'alhijazumrahtours.com', phone: '6285943191075', photo: '/agents/nina.jpg', capi_password: 'burungjelita' },
  { slug: 'sari', name: 'Sari', website: 'alhijaz.co/sari', phone: '6281907018220', photo: '/agents/sari.jpg', capi_password: 'merpatiluhur' },
  { slug: 'isti', name: 'Isti', website: 'al-hijaztravelumroh.com', phone: '6281315002460', photo: '/agents/isti.jpg', capi_password: 'gajahpandai' },
  { slug: 'ferra', name: 'Ferra', website: 'alhijaztourtravel.id', phone: '62811802789', photo: '/agents/ferra.jpg', capi_password: 'singasejati' },
  { slug: 'jan-praba', name: 'Jan Praba', website: 'alhijaz.co/jan-praba', phone: '62816728940', photo: '/agents/jan-praba.jpg', capi_password: 'garudaberani' },
  { slug: 'ekawati', name: 'Ekawati', website: 'alhijaz.co/ekawati', phone: '62816728904', photo: '/agents/ekawati.jpg', capi_password: 'kancilcemerlang' },
];

async function migrate() {
  console.log('🚀 Starting migration to Supabase...\n');

  // ── Step 1: Seed agents ──
  console.log('🌱 Seeding agent data...');
  const { data, error: insertErr } = await supabase
    .from('agents')
    .upsert(AGENTS, { onConflict: 'slug' })
    .select();

  if (insertErr) {
    console.error('❌ Error inserting agents:', insertErr.message);
    console.error('   Detail:', JSON.stringify(insertErr, null, 2));
    process.exit(1);
  }

  console.log(`✅ ${data.length} agents seeded successfully!\n`);

  // ── Step 2: Migrate CAPI configs from JSON files ──
  console.log('📦 Migrating CAPI configs from data/capi/*.json ...');

  const { readdirSync, readFileSync, existsSync } = await import('fs');
  const { resolve } = await import('path');
  const capiDir = resolve(process.cwd(), 'data', 'capi');

  if (!existsSync(capiDir)) {
    console.log('   No data/capi directory found, skipping CAPI migration.\n');
  } else {
    const files = readdirSync(capiDir).filter(f => f.endsWith('.json'));
    let migratedCount = 0;

    for (const file of files) {
      const slug = file.replace('.json', '');
      try {
        const config = JSON.parse(readFileSync(resolve(capiDir, file), 'utf8'));
        const { error } = await supabase
          .from('capi_configs')
          .upsert({
            slug,
            pixel_id: config.pixelId || '',
            access_token: config.accessToken || '',
            test_event_code: config.testEventCode || '',
            test_mode: config.testMode || false,
            events: config.events || {},
            updated_at: config.updatedAt || new Date().toISOString(),
          }, { onConflict: 'slug' });

        if (error) {
          console.error(`   ❌ ${file}: ${error.message}`);
        } else {
          console.log(`   ✅ ${file} → migrated`);
          migratedCount++;
        }
      } catch (err) {
        console.error(`   ❌ ${file}: ${err.message}`);
      }
    }
    console.log(`\n📦 ${migratedCount}/${files.length} CAPI configs migrated.\n`);
  }

  console.log('🎉 Migration complete!\n');
}

migrate().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
