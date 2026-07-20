/**
 * Aturan murni untuk mention `@semua` di Teras.
 *
 * `@semua` bukan anggota: ia token khusus yang menandai kirimannya
 * (`community_posts.mentions_everyone`) alih-alih menulis satu baris mention
 * per agent. Modul ini di-import server DAN komposer, seperti
 * lib/teras-share.js, supaya penulisan dan penegakan aturan tak bisa menyimpang.
 */

export const EVERYONE_TOKEN = 'semua';

// `@` tidak boleh didahului alfanumerik/`.`/`_`/`@` (menyingkirkan email dan
// tengah kata) dan tidak boleh diikuti karakter slug (menyingkirkan
// `@semuanya`, `@semua-agent`). Batas kiri sama persis dengan mention biasa
// di lib/community-mentions.js.
const EVERYONE_RE = /(?<![A-Za-z0-9_.@])@semua(?![A-Za-z0-9_-])/i;

/** True bila body memuat token broadcast `@semua`. */
export function hasEveryoneMention(body) {
  if (typeof body !== 'string' || !body) return false;
  return EVERYONE_RE.test(body);
}

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000; // WIB = UTC+7, tanpa DST

/**
 * Awal hari kalender Asia/Jakarta untuk `now`, dikembalikan sebagai ISO UTC —
 * bentuk yang bisa langsung dipakai sebagai batas `created_at >= ...`.
 * Waktu selalu disuntikkan pemanggil supaya bisa diuji tanpa jam sistem.
 */
export function jakartaDayStartIso(now) {
  const ms = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (Number.isNaN(ms)) throw new TypeError('jakartaDayStartIso: waktu tidak valid');
  const shifted = ms + JAKARTA_OFFSET_MS;
  const dayStartShifted = Math.floor(shifted / 86400000) * 86400000;
  return new Date(dayStartShifted - JAKARTA_OFFSET_MS).toISOString();
}

/** Jatah broadcast harian: admin tanpa batas, selain itu satu per hari WIB. */
export const BROADCAST_DAILY_LIMIT = 1;

export function resolveBroadcastQuota({ role, usedToday } = {}) {
  if (role === 'admin') return { unlimited: true, allowed: true, remaining: Infinity };
  const used = Number.isFinite(usedToday) ? Math.max(0, usedToday) : 0;
  const remaining = Math.max(0, BROADCAST_DAILY_LIMIT - used);
  return { unlimited: false, allowed: remaining > 0, remaining };
}

/** Sublabel item `@semua` di picker mention. */
export function broadcastQuotaLabel(quota) {
  if (quota?.unlimited) return 'tanpa batas';
  return quota?.allowed ? '1× sehari' : 'jatah hari ini habis';
}
