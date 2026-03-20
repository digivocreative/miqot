/**
 * Setup Telegram Webhook
 * 
 * Run once after deploy: node scripts/setup-telegram-webhook.js
 */
import 'dotenv/config';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_URL = process.env.TELEGRAM_WEBHOOK_URL || 'https://alhijaz.co/api/telegram/webhook';

if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN not set in .env');
  process.exit(1);
}

async function setup() {
  console.log('Setting webhook to:', WEBHOOK_URL);

  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: WEBHOOK_URL }),
    }
  );

  const data = await res.json();
  console.log('Result:', JSON.stringify(data, null, 2));
}

setup();
