/**
 * Preferensi notifikasi Teras: matriks 4 jenis peristiwa × 2 kanal.
 *
 * Semuanya menumpang kolom `agents.notification_prefs` yang sudah ada, bersama
 * preferensi notifikasi lain (paspor, pelunasan, dst). Karena itu setiap fungsi
 * di sini hanya menyentuh kunci Teras dan mengabaikan sisanya — menulis balik
 * seluruh objek tanpa filter akan menabrak preferensi milik fitur lain.
 */

export const TERAS_BELL_KEYS = {
  mention: 'teras_bell_mention',
  comment: 'teras_bell_comment',
  reaction: 'teras_bell_reaction',
  broadcast: 'teras_bell_broadcast',
};

/**
 * Sebutan memakai kunci lama `community_mentions`, bukan `teras_tg_mention`.
 * Kunci itu sudah dipakai sebagai gerbang Telegram untuk @mention jauh sebelum
 * matriks ini ada, dan agen sudah pernah mengubahnya. Menyeragamkan namanya
 * berarti diam-diam mereset pilihan mereka.
 */
export const TERAS_TELEGRAM_KEYS = {
  mention: 'community_mentions',
  comment: 'teras_tg_comment',
  reaction: 'teras_tg_reaction',
  broadcast: 'teras_tg_broadcast',
};

/** Watermark pengiriman digest Telegram, per agen. */
export const TERAS_TG_SENT_AT_KEY = 'teras_tg_sent_at';

export const DEFAULT_TERAS_NOTIFICATION_PREFS = {
  [TERAS_BELL_KEYS.mention]: true,
  [TERAS_BELL_KEYS.comment]: true,
  [TERAS_BELL_KEYS.reaction]: true,
  [TERAS_BELL_KEYS.broadcast]: true,
  [TERAS_TELEGRAM_KEYS.mention]: true,
  [TERAS_TELEGRAM_KEYS.comment]: true,
  [TERAS_TELEGRAM_KEYS.reaction]: true,
  [TERAS_TELEGRAM_KEYS.broadcast]: true,
};

const TERAS_PREF_KEY_LIST = Object.keys(DEFAULT_TERAS_NOTIFICATION_PREFS);

/** Hanya kunci Teras, default terisi. Kunci fitur lain sengaja dibuang. */
export function normalizeTerasNotificationPrefs(raw = {}) {
  const source = raw || {};
  const merged = {};
  for (const key of TERAS_PREF_KEY_LIST) {
    merged[key] = typeof source[key] === 'boolean'
      ? source[key]
      : DEFAULT_TERAS_NOTIFICATION_PREFS[key];
  }
  return merged;
}

/** Badan PUT dari klien: buang kunci asing dan nilai yang bukan boolean. */
export function filterTerasPrefUpdates(raw = {}) {
  const filtered = {};
  for (const [key, value] of Object.entries(raw || {})) {
    if (TERAS_PREF_KEY_LIST.includes(key) && typeof value === 'boolean') {
      filtered[key] = value;
    }
  }
  return filtered;
}

function flagsFor(keys, prefs) {
  const normalized = normalizeTerasNotificationPrefs(prefs);
  return {
    mentions: normalized[keys.mention],
    comments: normalized[keys.comment],
    reactions: normalized[keys.reaction],
    broadcasts: normalized[keys.broadcast],
  };
}

/** Sumber mana yang boleh di-query untuk lonceng. */
export function bellSourceFlags(prefs) {
  return flagsFor(TERAS_BELL_KEYS, prefs);
}

/** Sumber mana yang boleh dikirim ke Telegram. */
export function telegramSourceFlags(prefs) {
  return flagsFor(TERAS_TELEGRAM_KEYS, prefs);
}

/**
 * Kunci Telegram yang benar-benar dipagari watermark `teras_tg_sent_at` —
 * digest komentar & reaksi. Sebutan (community_mentions) dan broadcast
 * (teras_tg_broadcast) dikirim instan dan tidak pernah dibaca lewat watermark
 * itu, jadi menyalakannya tidak boleh ikut memajukannya.
 */
const WATERMARK_GATED_TELEGRAM_KEYS = [TERAS_TELEGRAM_KEYS.comment, TERAS_TELEGRAM_KEYS.reaction];

/**
 * Saklar Telegram (komentar/reaksi) yang berubah mati→nyala pada satu PUT.
 * Pemanggil memakai ini untuk memajukan watermark ke "sekarang", supaya agen
 * yang baru menyalakan sebuah kanal tidak langsung dibanjiri riwayat sehari ke
 * belakang. Menyalakan community_mentions (sebutan) sengaja TIDAK termasuk —
 * itu instan, bukan digest, dan memajukan watermark karenanya akan membuang
 * digest komentar/reaksi yang sedang menunggu untuk kanal yang tidak disentuh.
 */
export function enabledTelegramKeysTurnedOn(previous = {}, updates = {}) {
  const before = normalizeTerasNotificationPrefs(previous);
  return Object.entries(updates || {})
    .filter(([key, value]) => (
      value === true
      && WATERMARK_GATED_TELEGRAM_KEYS.includes(key)
      && before[key] === false
    ))
    .map(([key]) => key);
}
