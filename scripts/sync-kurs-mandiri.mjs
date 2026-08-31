// Scrape kurs Bank Mandiri dari luar VPS produksi, lalu tulis ke tabel
// `kurs_cache` di Supabase.
//
// Kenapa ada: Akamai di depan www.bankmandiri.co.id memblokir egress VPS
// produksi. Bukan sekadar sidik jari TLS klien — curl pun ditolak dari sana,
// padahal curl yang sama berhasil dari jaringan lain. Jadi blokirnya mengikuti
// reputasi IP, dan tidak ada trik sisi klien yang bisa menolong. Scrape-nya
// dipindah ke runner GitHub Actions; server tinggal membaca barisnya.
//
// Dijalankan oleh .github/workflows/kurs-mandiri.yml.
// Manual: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/sync-kurs-mandiri.mjs

import { createClient } from '@supabase/supabase-js';
import {
  fetchMandiriKursHtml,
  isKursToday,
  parseMandiriKursHtml,
  shouldReplaceKursCache,
} from '../lib/kurs-mandiri.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diset.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function readCurrentCache() {
  const { data, error } = await supabase
    .from('kurs_cache')
    .select('data')
    .eq('id', 'mandiri')
    .single();
  if (error || !data?.data) return null;
  return { rates: data.data.rates, updatedAt: data.data.updatedAt };
}

async function main() {
  const { html, via } = await fetchMandiriKursHtml({
    onAttemptFail: (label, err) => console.warn(`percobaan "${label}" gagal: ${err.message}`),
  });
  console.log(`halaman terambil lewat klien "${via}"`);

  const { rates, updatedAt } = parseMandiriKursHtml(html);
  if (Object.keys(rates).length === 0) {
    throw new Error('halaman terbaca tapi tidak ada rate yang bisa diparse');
  }

  const current = await readCurrentCache();
  const next = { rates, updatedAt };

  // Jangan pernah memundurkan cache. Halaman Mandiri sesekali menyajikan
  // snapshot lama dari edge cache Akamai; menimpanya akan membuat dashboard
  // melompat mundur.
  if (!shouldReplaceKursCache(current, next)) {
    console.log(`data lebih lama (${updatedAt}); mempertahankan ${current?.updatedAt}`);
    return;
  }

  const { error } = await supabase.from('kurs_cache').upsert({
    id: 'mandiri',
    data: next,
    synced_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (error) throw new Error(`gagal menulis ke Supabase: ${error.message}`);

  console.log(
    `tersimpan: ${Object.keys(rates).length} mata uang, ${updatedAt}, ` +
    `USD=${rates.USD}, SAR=${rates.SAR}`
  );

  // Akhir pekan dan hari libur wajar memakai kurs hari kerja terakhir, jadi ini
  // catatan saja — bukan kegagalan. Yang membuat run merah hanyalah fetch atau
  // parse yang gagal, supaya notifikasi Actions tidak jadi kebisingan mingguan.
  if (!isKursToday(updatedAt)) {
    console.log('catatan: data ini belum terbit hari ini (wajar di akhir pekan/libur)');
  }
}

main().catch((err) => {
  console.error(`GAGAL: ${err.message}`);
  process.exit(1);
});
