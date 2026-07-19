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

// http(s) only (case-insensitive scheme — `HTTPS://…` links too), non-
// whitespace run. Trailing punctuation that's clearly closing/sentence
// punctuation is peeled off below so it renders as normal text after the
// link (e.g. "lihat https://x.id/a." -> link + ".").
const URL_RE = /https?:\/\/\S+/gi;

const SIMPLE_TRAILING_CHARS = new Set(['.', ',', ';', ':', '!', '?', "'", '"']);
const BRACKET_OPEN_FOR_CLOSE = { ')': '(', ']': '[', '}': '{' };

function countChar(str, ch) {
  let count = 0;
  for (let i = 0; i < str.length; i += 1) if (str[i] === ch) count += 1;
  return count;
}

/**
 * Peel trailing punctuation off a raw regex match so it renders as plain
 * text after the link instead of being swallowed into the href.
 *
 * Closing brackets `)]}` are balance-aware: a trailing `)` is only stripped
 * when the URL itself doesn't contain an unmatched `(` earlier — otherwise
 * a real URL like `.../wiki/Foo_(disambiguation)` would lose its closing
 * paren and 404. A `)` from simple wrapping punctuation, e.g. `(https://x.id/a)`
 * (the `(` sits outside the match, so it never counts here), still strips.
 */
function trimTrailingPunctuation(raw) {
  let end = raw.length;
  while (end > 0) {
    const ch = raw[end - 1];
    if (SIMPLE_TRAILING_CHARS.has(ch)) {
      end -= 1;
      continue;
    }
    const openCh = BRACKET_OPEN_FOR_CLOSE[ch];
    if (openCh) {
      const prefix = raw.slice(0, end - 1);
      if (countChar(prefix, openCh) > countChar(prefix, ch)) break; // unmatched opener earlier — belongs to the URL
      end -= 1;
      continue;
    }
    break;
  }
  return raw.slice(0, end);
}

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
    const url = trimTrailingPunctuation(raw);
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
 * The first URL in `text`, as the SAME authoritative detector used to render
 * links (`linkifySegments`) sees it — i.e. exactly the href of the first
 * `type: 'link'` segment, or `null` if there isn't one.
 *
 * This is the single source of truth for "what is a URL" in Teras post/
 * comment bodies. Do not reimplement URL detection elsewhere (composer link-
 * preview trigger, server-side OG-fetch trigger, etc.) — import this instead,
 * so the URL a preview card is built for is always exactly the URL
 * `stripUrlFromBody` (and the renderer) agree is linkifiable. Two independent
 * regexes disagreeing on edge cases (trailing punctuation, balanced brackets,
 * URLs immediately followed by more text) previously caused the preview
 * fetch, the rendered link, and the body-strip to pick three different
 * substrings for the same sentence.
 *
 * @param {string} text
 * @returns {string | null}
 */
export function firstUrl(text) {
  if (!text) return null;
  const segments = linkifySegments(text);
  const first = segments.find(segment => segment.type === 'link');
  return first ? first.href : null;
}

// Characters that mean "a URL keeps going here" when found immediately
// before/after a candidate occurrence — used by stripUrlFromBody to avoid
// deleting just a prefix (or suffix) of a longer, DIFFERENT url/token, e.g.
// removing "https://x.id/a" must not corrupt "https://x.id/abc" into "bc".
const URL_CONTINUATION_RE = /[A-Za-z0-9/\-_?&=.#%+~:]/;

/**
 * True when `body[pos]` continues a URL, so an occurrence ending at `pos`
 * must NOT be treated as a standalone, removable token.
 *
 * `.` is ambiguous — as common as a mid-URL path/file separator
 * ("...a.html") as it is ordinary sentence punctuation ("...a. Selesai.") —
 * so it only counts as "still part of the URL" when more URL-continuation
 * characters immediately follow it; a lone trailing `.` (end-of-string or
 * followed by whitespace/punctuation) does not block removal.
 */
function continuesUrl(body, pos) {
  if (pos >= body.length) return false;
  const ch = body[pos];
  if (!URL_CONTINUATION_RE.test(ch)) return false;
  if (ch !== '.') return true;
  return pos + 1 < body.length && URL_CONTINUATION_RE.test(body[pos + 1]);
}

/** True when the exact `url` match starting at `start` is a whole token. */
function isRemovableOccurrence(body, start, url) {
  if (start > 0 && URL_CONTINUATION_RE.test(body[start - 1])) return false;
  if (continuesUrl(body, start + url.length)) return false;
  return true;
}

/**
 * Remove every exact, whole-token occurrence of `url` from `body` (display
 * purposes only — callers never persist the result) and tidy up the
 * whitespace left behind: collapse runs of spaces/tabs, drop spaces hugging
 * a newline, cap blank-line runs at a single blank line, and trim the ends.
 *
 * An occurrence is only removed when it isn't a prefix/suffix of a longer,
 * different URL or token (see isRemovableOccurrence) — otherwise a post
 * linking both `https://x.id/a` and `https://x.id/abc` would have the
 * second URL mangled into a dangling "bc" when the first is hidden.
 *
 * @param {string} body
 * @param {string | null | undefined} url
 * @returns {string}
 */
export function stripUrlFromBody(body, url) {
  if (!body) return body;
  if (!url) return body;

  let result = '';
  let cursor = 0;
  let removedAny = false;
  for (;;) {
    const idx = body.indexOf(url, cursor);
    if (idx === -1) {
      result += body.slice(cursor);
      break;
    }
    if (isRemovableOccurrence(body, idx, url)) {
      result += body.slice(cursor, idx) + ' ';
      cursor = idx + url.length;
      removedAny = true;
    } else {
      // Not a standalone occurrence — keep it, and resume scanning just
      // past this character so we don't re-match the same spot forever.
      result += body.slice(cursor, idx + 1);
      cursor = idx + 1;
    }
  }
  if (!removedAny) return body;

  result = result.replace(/[ \t]+/g, ' ');
  result = result.replace(/[ \t]*\n[ \t]*/g, '\n');
  result = result.replace(/\n{3,}/g, '\n\n');
  return result.trim();
}
