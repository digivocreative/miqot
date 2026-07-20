/**
 * Slugs an agent may not claim.
 *
 * Beyond the app's own top-level routes, two Teras rules apply:
 * `teras` owns a whole path branch (/teras/<slug> profiles, /teras/<code>
 * share links), and any 8-char hex slug would be indistinguishable from a
 * Teras share code (see lib/teras-share.js) and so unreachable as a profile.
 * `semua` dipakai sebagai token broadcast Teras (`@semua`), jadi tidak boleh
 * menjadi slug agent — kalau tidak, mention personal dan broadcast bertabrakan.
 */
import { isTerasShortCode } from './teras-share.js';

const RESERVED_EXACT = new Set([
  'admin',
  'login',
  'register',
  'dashboard',
  'api',
  'compare',
  'reset-password',
  'f',
  'teras',
  'semua',
]);

export function isReservedAgentSlug(slug) {
  const value = String(slug || '').trim().toLowerCase();
  if (!value) return true;
  if (RESERVED_EXACT.has(value)) return true;
  return isTerasShortCode(value);
}
