/**
 * Setup Telegram webhook dan sinkronkan command resmi bot.
 * 
 * Jalankan setiap kali token bot dirotasi:
 *   node scripts/setup-telegram-webhook.js
 */
import 'dotenv/config';
import {
  TELEGRAM_BOT_COMMANDS,
  resolveTelegramWebhookSecret,
} from '../lib/telegram-bot-config.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_URL = process.env.TELEGRAM_WEBHOOK_URL || 'https://alhijaz.co/api/telegram/webhook';
const EXPECTED_BOT_USERNAME = String(process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '').trim();

if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN not set in .env');
  process.exit(1);
}

const API_BASE_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function telegramApi(method, body) {
  const res = await fetch(`${API_BASE_URL}/${method}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(`${method} gagal: ${data.description || `HTTP ${res.status}`}`);
  }
  return data.result;
}

async function setup() {
  const bot = await telegramApi('getMe');
  if (EXPECTED_BOT_USERNAME
    && String(bot.username || '').toLowerCase() !== EXPECTED_BOT_USERNAME.toLowerCase()) {
    throw new Error(
      `Token milik @${bot.username || '(tanpa username)'}, bukan @${EXPECTED_BOT_USERNAME}`
    );
  }

  const webhookSecret = resolveTelegramWebhookSecret({
    explicitSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
    botToken: BOT_TOKEN,
  });

  await telegramApi('setWebhook', {
    url: WEBHOOK_URL,
    secret_token: webhookSecret,
    allowed_updates: ['message', 'callback_query'],
  });
  await telegramApi('setMyCommands', { commands: TELEGRAM_BOT_COMMANDS });

  const [commands, webhook] = await Promise.all([
    telegramApi('getMyCommands'),
    telegramApi('getWebhookInfo'),
  ]);

  if (JSON.stringify(commands) !== JSON.stringify(TELEGRAM_BOT_COMMANDS)) {
    throw new Error('Verifikasi command gagal: hasil Telegram tidak sama dengan konfigurasi resmi');
  }

  console.log(`✅ Bot terverifikasi: @${bot.username}`);
  console.log(`✅ Webhook aktif: ${webhook.url}`);
  console.log(`✅ Commands: ${commands.map(({ command, description }) => `/${command} — ${description}`).join(', ')}`);
}

setup().catch((err) => {
  console.error(`❌ Setup Telegram gagal: ${err.message}`);
  process.exitCode = 1;
});
