/**
 * Pure helpers for turning URLs inside a Teras post/comment body into clickable
 * links, and for hiding a URL from the body text once a `LinkPreviewCard`
 * already represents it (Threads-style: the card replaces the raw link).
 *
 * Kept dependency-free and framework-free on purpose — see lib/teras-share.js
 * for the established pattern of a root `lib/` pure module imported by the FE
 * via `'../../lib/teras-linkify.js'` (TerasPage.tsx already does this for
 * teras-share). This module owns URL detection; mention detection stays in
 * src/lib/communityMentions.ts and must run AFTER this module splits out
 * links (a URL like `https://x.com/@bagas` would otherwise be misread as an
 * `@bagas` mention, since the mention regex allows `@` right after `/`).
 */

// http(s) only, non-whitespace run. Trailing punctuation that's clearly
// closing/sentence punctuation is peeled off below so it renders as normal
// text after the link (e.g. "lihat https://x.id/a." -> link + ".").
const URL_RE = /https?:\/\/\S+/g;
const TRAILING_PUNCT_RE = /[.,;:!?)\]}'"]+$/;

/**
 * Split `text` into `{ type: 'text', value }` and
 * `{ type: 'link', value, href }` segments, in order, preserving every
 * character of the original string across the concatenated segments.
 *
 * @param {string} text
 * @returns {Array<{ type: 'text', value: string } | { type: 'link', value: string, href: string }>}
 */
export function linkifySegments(text) {
  if (!text) return [];
  const segments = [];
  let last = 0;
  URL_RE.lastIndex = 0;
  let match;
  while ((match = URL_RE.exec(text)) !== null) {
    const raw = match[0];
    const trailingMatch = raw.match(TRAILING_PUNCT_RE);
    const trailingLen = trailingMatch ? trailingMatch[0].length : 0;
    const url = trailingLen > 0 ? raw.slice(0, raw.length - trailingLen) : raw;
    // Pathological: the whole match was punctuation right after the scheme
    // (shouldn't happen since `https?:\/\/` itself isn't in the trailing set),
    // but guard anyway rather than emit an empty href.
    if (!url) continue;
    const start = match.index;
    const urlEnd = start + url.length;
    if (start > last) segments.push({ type: 'text', value: text.slice(last, start) });
    segments.push({ type: 'link', value: url, href: url });
    last = urlEnd;
  }
  if (last < text.length) segments.push({ type: 'text', value: text.slice(last) });
  return segments;
}

/**
 * Remove every exact occurrence of `url` from `body` (display purposes only —
 * callers never persist the result) and tidy up the whitespace left behind:
 * collapse runs of spaces/tabs, drop spaces hugging a newline, cap blank-line
 * runs at a single blank line, and trim the ends.
 *
 * @param {string} body
 * @param {string | null | undefined} url
 * @returns {string}
 */
export function stripUrlFromBody(body, url) {
  if (!body) return body;
  if (!url) return body;
  if (!body.includes(url)) return body;

  let result = body.split(url).join(' ');
  result = result.replace(/[ \t]+/g, ' ');
  result = result.replace(/[ \t]*\n[ \t]*/g, '\n');
  result = result.replace(/\n{3,}/g, '\n\n');
  return result.trim();
}
