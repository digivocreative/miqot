import crypto from 'node:crypto';

export const TELEGRAM_BOT_COMMANDS = Object.freeze([
  Object.freeze({
    command: 'start',
    description: 'Hubungkan akun Telegram dengan Alhijaz.co',
  }),
]);

const TELEGRAM_WEBHOOK_SECRET_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;

/**
 * Telegram menerima secret webhook dari charset yang terbatas. Jika override
 * tidak disediakan, turunkan secret satu-arah dari token bot supaya rotasi token
 * otomatis ikut merotasi secret tanpa menambah secret wajib lain di deployment.
 */
export function resolveTelegramWebhookSecret({ explicitSecret, botToken } = {}) {
  const configuredSecret = String(explicitSecret || '').trim();
  if (configuredSecret) {
    if (!TELEGRAM_WEBHOOK_SECRET_PATTERN.test(configuredSecret)) {
      throw new Error('TELEGRAM_WEBHOOK_SECRET harus 1-256 karakter: A-Z, a-z, 0-9, _ atau -');
    }
    return configuredSecret;
  }

  const normalizedBotToken = String(botToken || '').trim();
  if (!normalizedBotToken) return '';

  return crypto
    .createHash('sha256')
    .update(`alhijaz-telegram-webhook:v1:${normalizedBotToken}`)
    .digest('base64url');
}

export function telegramWebhookSecretMatches(expectedSecret, providedSecret) {
  const expected = Buffer.from(String(expectedSecret || ''));
  const provided = Buffer.from(String(providedSecret || ''));
  return expected.length > 0
    && expected.length === provided.length
    && crypto.timingSafeEqual(expected, provided);
}
