// One-off: kirim sample kurs notification ke agent Nikita lewat Telegram.
// Usage: node scripts/test-kurs-telegram-nikita.mjs
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { closeKursBrowser } from '../lib/kurs-image-generator.mjs';
import { getOrCreateKursShareImage } from '../lib/kurs-share-cache.mjs';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const BASE_URL = process.env.NOTIFIER_BASE_URL || 'http://localhost:3000';

if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN missing in .env');
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env');
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 1) Fetch Nikita's record
const { data: nikita, error } = await supabase
  .from('agents')
  .select('slug, name, phone, photo, website, telegram_chat_id')
  .ilike('slug', 'nikita')
  .single();

if (error || !nikita) throw new Error(`Agent nikita not found: ${error?.message || ''}`);
if (!nikita.telegram_chat_id) throw new Error('Nikita has no telegram_chat_id');

console.log(`Found agent: ${nikita.name} (slug=${nikita.slug}, chat_id=${nikita.telegram_chat_id})`);

// 2) Fetch live kurs from running server
const kursRes = await fetch(`${BASE_URL}/api/kurs`);
const kursJson = await kursRes.json();
if (!kursJson.success || !kursJson.data?.rates?.USD) {
  throw new Error('Could not fetch live kurs from /api/kurs');
}
const usd = kursJson.data.rates.USD;
const sar = kursJson.data.rates.SAR;
const updatedAt = kursJson.data.updatedAt;
console.log(`Kurs: USD=${usd}  SAR=${sar}  updated=${updatedAt}`);

// Format updatedAt to "Hari, D Bulan YYYY" (matches dashboard + production broadcast)
function formatKursDateForShare(raw) {
  const m = String(raw || '').match(/(\d{2})\/(\d{2})\/(\d{2})\s+\d{2}:\d{2}\s*WIB/);
  if (!m) return raw || '';
  const dt = new Date(2000 + parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
  const dayName = dt.toLocaleDateString('id-ID', { weekday: 'long' });
  const monthName = dt.toLocaleDateString('id-ID', { month: 'long' });
  return `${dayName}, ${dt.getDate()} ${monthName} ${dt.getFullYear()}`;
}
const updatedAtFormatted = formatKursDateForShare(updatedAt);

// 3) Generate image
console.time('generate');
const image = await getOrCreateKursShareImage({
  kurs: { usd, updatedAt: updatedAtFormatted },
  agent: {
    slug: nikita.slug,
    name: nikita.name,
    phone: nikita.phone || '',
    photo: nikita.photo || '',
    website: nikita.website || '',
  },
});
const buf = image.buffer;
console.timeEnd('generate');
console.log(`Image: ${(buf.length / 1024).toFixed(1)} KB (cache ${image.cacheHit ? 'hit' : 'miss'})`);

// 4) Build caption (mirror sendKursUpdate format)
const dateStr = new Date().toLocaleDateString('id-ID', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  timeZone: 'Asia/Jakarta',
});
const fmtIDR = n => 'Rp ' + new Intl.NumberFormat('id-ID').format(n);
const caption =
  `💱 <b>Kurs Hari Ini</b>\n` +
  `📅 ${dateStr}\n\n` +
  `🇺🇸 <b>USD:</b> ${fmtIDR(usd)}` +
  (sar ? `\n🇸🇦 <b>SAR:</b> ${fmtIDR(sar)}` : '') +
  `\n\n<i>Sumber: Bank Mandiri TT Counter</i>`;

// 5) Send via Telegram /sendPhoto (multipart)
const form = new FormData();
form.append('chat_id', String(nikita.telegram_chat_id));
form.append('caption', caption);
form.append('parse_mode', 'HTML');
form.append('photo', new Blob([buf], { type: 'image/jpeg' }), `kurs-${nikita.slug}.jpg`);

console.time('telegram');
const tgRes = await fetch(`${TELEGRAM_API}/sendPhoto`, { method: 'POST', body: form });
console.timeEnd('telegram');

if (!tgRes.ok) {
  const errBody = await tgRes.text();
  console.error('Telegram error:', tgRes.status, errBody);
  process.exit(1);
}
const tgBody = await tgRes.json();
console.log('Sent OK. message_id=', tgBody.result?.message_id);

await closeKursBrowser();
