import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TELEGRAM_BOT_COMMANDS,
  resolveTelegramWebhookSecret,
  telegramWebhookSecretMatches,
} from '../lib/telegram-bot-config.js';

test('Telegram command resmi hanya berisi command Alhijaz', () => {
  assert.deepEqual(TELEGRAM_BOT_COMMANDS, [
    {
      command: 'start',
      description: 'Hubungkan akun Telegram dengan Alhijaz.co',
    },
  ]);
  assert.doesNotMatch(JSON.stringify(TELEGRAM_BOT_COMMANDS), /casino|mini-app/i);
});

test('secret webhook diturunkan stabil dari token dan valid untuk Telegram', () => {
  const first = resolveTelegramWebhookSecret({ botToken: '123456:test-token' });
  const second = resolveTelegramWebhookSecret({ botToken: '123456:test-token' });

  assert.equal(first, second);
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, resolveTelegramWebhookSecret({ botToken: '123456:other-token' }));
});

test('secret webhook eksplisit divalidasi dan diprioritaskan', () => {
  assert.equal(
    resolveTelegramWebhookSecret({ explicitSecret: 'secret_Valid-123', botToken: 'ignored' }),
    'secret_Valid-123'
  );
  assert.throws(
    () => resolveTelegramWebhookSecret({ explicitSecret: 'secret tidak valid', botToken: 'ignored' }),
    /TELEGRAM_WEBHOOK_SECRET/
  );
});

test('perbandingan secret webhook menolak nilai kosong dan tidak cocok', () => {
  assert.equal(telegramWebhookSecretMatches('secret-123', 'secret-123'), true);
  assert.equal(telegramWebhookSecretMatches('secret-123', 'secret-124'), false);
  assert.equal(telegramWebhookSecretMatches('secret-123', ''), false);
  assert.equal(telegramWebhookSecretMatches('', ''), false);
});
