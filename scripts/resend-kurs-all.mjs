// One-off: re-broadcast today's kurs image to ALL agents.
// Mirrors the per-agent loop inside telegram-notifier.js sendKursUpdate(),
// but skips the group admin message (already sent earlier today).
// Usage: node scripts/resend-kurs-all.mjs
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

const kursRes = await fetch(`${BASE_URL}/api/kurs`);
const kursJson = await kursRes.json();
if (!kursJson.success || !kursJson.data?.rates?.USD) {
  throw new Error('Could not fetch live kurs from /api/kurs');
}
const usd = kursJson.data.rates.USD;
const sar = kursJson.data.rates.SAR;
const updatedAt = kursJson.data.updatedAt;
console.log(`Kurs: USD=${usd}  SAR=${sar}  updated=${updatedAt}`);

function formatKursDateForShare(raw) {
  const m = String(raw || '').match(/(\d{2})\/(\d{2})\/(\d{2})\s+\d{2}:\d{2}\s*WIB/);
  if (!m) return raw || '';
  const dt = new Date(2000 + parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
  const dayName = dt.toLocaleDateString('id-ID', { weekday: 'long' });
  const monthName = dt.toLocaleDateString('id-ID', { month: 'long' });
  return `${dayName}, ${dt.getDate()} ${monthName} ${dt.getFullYear()}`;
}
const updatedAtFormatted = formatKursDateForShare(updatedAt);

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

const FOOTER = '\n\n<i>— Miqot by Alhijaz</i>';

const { data: agents, error } = await supabase
  .from('agents')
  .select('slug, name, phone, photo, website, telegram_chat_id, notification_prefs')
  .not('telegram_chat_id', 'is', null);
if (error) throw new Error(`Failed to load agents: ${error.message}`);

console.log(`Loaded ${agents.length} agents with telegram_chat_id`);

let sent = 0, skipped = 0, fallback = 0, failed = 0;
console.time('total');
for (const agent of agents) {
  if (agent.notification_prefs?.kurs_dollar === false) {
    console.log(`  SKIP ${agent.slug} (opted out)`);
    skipped++;
    continue;
  }
  try {
    const image = await getOrCreateKursShareImage({
      kurs: { usd, updatedAt: updatedAtFormatted },
      agent: {
        slug: agent.slug,
        name: agent.name || '',
        phone: agent.phone || '',
        photo: agent.photo || '',
        website: agent.website || '',
      },
    });
    const buf = image.buffer;
    const form = new FormData();
    form.append('chat_id', String(agent.telegram_chat_id));
    form.append('caption', caption + FOOTER);
    form.append('parse_mode', 'HTML');
    form.append('photo', new Blob([buf], { type: 'image/jpeg' }), `kurs-${agent.slug}.jpg`);
    const tgRes = await fetch(`${TELEGRAM_API}/sendPhoto`, { method: 'POST', body: form });
    if (!tgRes.ok) {
      const body = await tgRes.text();
      console.warn(`  IMG-FAIL ${agent.slug}: ${tgRes.status} ${body.slice(0, 160)}`);
      failed++;
    } else {
      console.log(`  OK   ${agent.slug} (${(buf.length / 1024).toFixed(1)} KB)`);
      sent++;
    }
  } catch (err) {
    console.warn(`  GEN-FAIL ${agent.slug}: ${err.message} — fallback to text`);
    try {
      const tgRes = await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: agent.telegram_chat_id,
          text: caption.replace(/<[^>]+>/g, '') + '\n— Miqot by Alhijaz',
          parse_mode: 'HTML',
        }),
      });
      if (tgRes.ok) {
        fallback++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }
  await new Promise(r => setTimeout(r, 300));
}
console.timeEnd('total');
console.log(`\nResult: image=${sent}, text-fallback=${fallback}, skipped=${skipped}, failed=${failed}`);

await closeKursBrowser();
