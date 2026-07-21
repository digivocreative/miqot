import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TERAS_NOTIFICATION_PREFS,
  TERAS_TELEGRAM_KEYS,
  normalizeTerasNotificationPrefs,
  filterTerasPrefUpdates,
  bellSourceFlags,
  telegramSourceFlags,
  enabledTelegramKeysTurnedOn,
} from '../lib/teras-notification-prefs.js';

test('kunci Telegram untuk sebutan memakai nama lama community_mentions', () => {
  assert.equal(TERAS_TELEGRAM_KEYS.mention, 'community_mentions');
});

test('default: lonceng dan Telegram semua menyala', () => {
  assert.deepEqual(DEFAULT_TERAS_NOTIFICATION_PREFS, {
    teras_bell_mention: true,
    teras_bell_comment: true,
    teras_bell_reaction: true,
    teras_bell_broadcast: true,
    community_mentions: true,
    teras_tg_comment: true,
    teras_tg_reaction: true,
    teras_tg_broadcast: true,
  });
});

test('agen tanpa kunci apa pun mendapat perilaku hari ini', () => {
  const prefs = normalizeTerasNotificationPrefs({});
  assert.deepEqual(bellSourceFlags(prefs), {
    mentions: true, comments: true, reactions: true, broadcasts: true,
  });
  assert.deepEqual(telegramSourceFlags(prefs), {
    mentions: true, comments: true, reactions: true, broadcasts: true,
  });
});

test('pilihan community_mentions:false yang tersimpan tetap dihormati', () => {
  const prefs = normalizeTerasNotificationPrefs({ community_mentions: false });
  assert.equal(prefs.community_mentions, false);
  assert.equal(telegramSourceFlags(prefs).mentions, false);
});

test('kunci milik notifikasi lain tidak ikut terbawa', () => {
  const prefs = normalizeTerasNotificationPrefs({ paspor: false, teras_bell_reaction: false });
  assert.equal(prefs.paspor, undefined, 'hanya kunci Teras yang dikembalikan');
  assert.equal(prefs.teras_bell_reaction, false);
});

test('filter menolak kunci asing dan nilai non-boolean', () => {
  const filtered = filterTerasPrefUpdates({
    teras_bell_reaction: false,
    community_mentions: 'ya',
    paspor: false,
    teras_tg_comment: true,
  });
  assert.deepEqual(filtered, { teras_bell_reaction: false, teras_tg_comment: true });
});

test('mendeteksi saklar Telegram komentar/reaksi yang baru dinyalakan, mengabaikan community_mentions yang ikut dinyalakan', () => {
  const turnedOn = enabledTelegramKeysTurnedOn(
    { community_mentions: false, teras_tg_comment: false, teras_tg_reaction: false },
    { community_mentions: true, teras_tg_comment: true, teras_tg_reaction: false },
  );
  assert.deepEqual(turnedOn, ['teras_tg_comment'], 'community_mentions bukan kanal yang dipagari watermark, tidak boleh ikut terhitung');
});

test('saklar Telegram yang sudah menyala tidak dihitung baru', () => {
  assert.deepEqual(
    enabledTelegramKeysTurnedOn({ teras_tg_comment: true }, { teras_tg_comment: true }),
    [],
  );
});

test('menyalakan community_mentions saja tidak memajukan watermark digest', () => {
  // Sebutan dikirim instan, bukan lewat digest teras_tg_sent_at — menyalakannya
  // sendirian tidak boleh membuang digest komentar/reaksi yang masih menunggu.
  const turnedOn = enabledTelegramKeysTurnedOn(
    { community_mentions: false },
    { community_mentions: true },
  );
  assert.deepEqual(turnedOn, []);
});

test('sumber yang dimatikan hilang dari gating lonceng', () => {
  const prefs = normalizeTerasNotificationPrefs({
    teras_bell_reaction: false,
    teras_bell_broadcast: false,
  });
  assert.deepEqual(bellSourceFlags(prefs), {
    mentions: true, comments: true, reactions: false, broadcasts: false,
  });
});

test('gating lonceng tidak terpengaruh saklar Telegram', () => {
  const prefs = normalizeTerasNotificationPrefs({ teras_tg_reaction: true, community_mentions: false });
  assert.equal(bellSourceFlags(prefs).reactions, true);
  assert.equal(bellSourceFlags(prefs).mentions, true);
});
