/**
 * Pure helpers for the Teras "Bagikan" (share) feature.
 *
 * A shared post link is intentionally short so it reads cleanly when pasted
 * into a WhatsApp group: `/teras/<code>` where `<code>` is the first 8 hex
 * characters of the post UUID (the first UUID group, before the first dash).
 *
 * The 8-char code is a *prefix* of the full UUID, so the server resolves it
 * back to a post with a range query (see communityShortCodeBounds) — no extra
 * column or migration required. 8 hex = 2^32 space; collisions are negligible
 * at community scale, and a collision merely resolves to the oldest match.
 *
 * This module is shared by both sides of the feature so the contract lives in
 * one place: the frontend builds the URL, the server resolves the code.
 */

export const TERAS_SHORT_CODE_LEN = 8;

const SHORT_CODE_REGEX = /^[0-9a-f]{8}$/;

/** First 8 hex of a post UUID, lowercased. Empty string for falsy input. */
export function terasShortCode(postId) {
  return String(postId || '')
    .toLowerCase()
    .slice(0, TERAS_SHORT_CODE_LEN);
}

/** Path portion of a share link, e.g. "/teras/9fc969b0". */
export function terasSharePath(postId) {
  return `/teras/${terasShortCode(postId)}`;
}

/** Absolute share URL, e.g. "https://app.example.com/teras/9fc969b0". */
export function terasShareUrl(postId, origin) {
  return `${String(origin || '').replace(/\/+$/, '')}${terasSharePath(postId)}`;
}

/** True when value is exactly an 8-char lowercase-hex Teras share code. */
export function isTerasShortCode(value) {
  return typeof value === 'string' && SHORT_CODE_REGEX.test(value.toLowerCase());
}

/**
 * Inclusive UUID range that a share code maps to. Postgres orders UUIDs
 * byte-wise, matching hex order, so `id BETWEEN lo AND hi` selects every post
 * whose id starts with the code's 8 hex digits.
 */
export function communityShortCodeBounds(code) {
  const c = String(code).toLowerCase();
  return {
    lo: `${c}-0000-0000-0000-000000000000`,
    hi: `${c}-ffff-ffff-ffff-ffffffffffff`,
  };
}
