/**
 * Gerbang Akun AIW — SATU sumber aturan untuk server.js (status di /api/auth/me)
 * dan klien (dashboard + halaman /:slug).
 *
 * Yang dikunci: agent yang sudah login dashboard tapi belum menyimpan Akun AIW.
 * Pengunjung tanpa sesi dan admin tidak pernah kena gerbang ini.
 *
 * Bawaannya TERKUNCI: tab dan halaman baru ikut terkunci sampai sengaja dibuka.
 */

// Tab dashboard yang tetap terbuka. Beranda menampilkan kartu bergembok, Jamaah
// memuat form login Akun AIW, Settings untuk profil dan logout.
const OPEN_TABS = new Set(['home', 'jamaah', 'settings']);

// Segmen pertama yang bukan halaman agent.
const OPEN_FIRST_SEGMENTS = new Set([
  'login', 'register', 'admin', 'reset-password', 'f', 'j',
  'teras', 'top-partner', 'oauth', 'mcp', 'dev-mcp', 'api',
]);

// src/main.tsx mengenali dua halaman ini di segmen kedua, apa pun segmen pertamanya.
const TOOL_PAGES = new Set(['kalkulasi', 'compare']);

// Segmen sesudah slug yang terbuka, berapa pun kedalamannya.
const OPEN_ANY_DEPTH = new Set(['bio', 'jamaah', 'capi']);

// Segmen sesudah slug yang terbuka hanya sebagai halaman tunggal.
const OPEN_SINGLE = new Set(['umroh', 'haji']);

/**
 * '/bagas/kalkulasi/' → ['bagas', 'kalkulasi'] (tanpa query/hash, segmen kosong dibuang).
 * Huruf besar dipertahankan: src/main.tsx peka huruf, jadi /bagas/BIO bukan Bio melainkan jadwal.
 */
function segmentsOf(pathname) {
  if (typeof pathname !== 'string') return [];
  return pathname.split(/[?#]/)[0].split('/').filter(Boolean);
}

/** Apakah `rest` (segmen sesudah slug agent) adalah halaman untuk jamaah, bukan alat agent. */
function isOpenRest(rest) {
  if (rest.length === 0) return false;
  const first = rest[0];
  if (OPEN_ANY_DEPTH.has(first)) return true;
  if (OPEN_SINGLE.has(first) && rest.length === 1) return true;
  if (first.toLowerCase() === 'hotel' && rest.length === 2) return true;
  if (rest.length === 2 && rest[1].toLowerCase() === 'itinerary') return true;
  return false;
}

/** Baris agent menyimpan Akun AIW. Terima objek apa pun yang punya dua kolom ini. */
export function hasAiwAccount(agent) {
  return !!(agent?.jamaah_username && agent?.jamaah_password);
}

/**
 * 'locked' = agent yang pasti belum punya Akun AIW.
 * 'unknown' = status belum terbaca (sesi lama, server versi lama) — jangan dikunci.
 * 'open' = admin, atau agent yang sudah punya Akun AIW.
 */
export function aiwGateStatus(user) {
  if (!user || user.role !== 'agent') return 'open';
  if (user.has_aiw_account === false) return 'locked';
  if (user.has_aiw_account === true) return 'open';
  return 'unknown';
}

/** Tab dashboard ini tertutup bagi agent yang belum punya Akun AIW. */
export function isAiwLockedTab(tab) {
  return !OPEN_TABS.has(tab);
}

/** Halaman di luar dashboard ini tertutup bagi agent yang belum punya Akun AIW. */
export function isAiwLockedPath(pathname) {
  const segs = segmentsOf(pathname);
  if (segs.length === 0 || segs[0] === 'dashboard') return false;
  if (segs[0] === 'compare' || TOOL_PAGES.has(segs[1])) return true;
  if (OPEN_FIRST_SEGMENTS.has(segs[0])) return false;
  return !isOpenRest(segs.slice(1));
}
