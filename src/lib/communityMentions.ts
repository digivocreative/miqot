/**
 * Client-side helpers for Teras @mentions. The parsing rules mirror the server
 * (lib/community-mentions.js) so compose-time autocomplete, pill rendering, and
 * the `mentions` payload all agree with what the server records.
 */

export interface MentionMember {
  slug: string;
  name: string;
  photo: string | null;
  phone?: string | null;
}

// `@` must not follow an alphanumeric, `.`, `_`, or `@` (rules out emails and
// mid-word), matching the server boundary. Greedy slug capture; the member-set
// intersection is the real filter.
const MENTION_RE = /(?<![A-Za-z0-9_.@])@([A-Za-z0-9][A-Za-z0-9_-]*)/g;
const SLUG_CHAR_RE = /[A-Za-z0-9_-]/;

function toSlugSet(slugs: Iterable<string>): Set<string> {
  const set = new Set<string>();
  for (const slug of slugs) {
    const norm = String(slug || '').trim().toLowerCase();
    if (norm) set.add(norm);
  }
  return set;
}

/** Distinct member slugs mentioned in `body`, in first-seen order. */
export function extractMentionSlugs(
  body: string,
  allowedSlugs: Iterable<string>,
  authorSlug: string | null = null,
  limit = 10,
): string[] {
  if (!body) return [];
  const allowed = toSlugSet(allowedSlugs);
  if (!allowed.size) return [];
  const author = authorSlug ? authorSlug.trim().toLowerCase() : null;
  const seen = new Set<string>();
  const out: string[] = [];
  MENTION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MENTION_RE.exec(body)) !== null) {
    const slug = m[1].toLowerCase();
    if (!allowed.has(slug) || (author && slug === author) || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Split `body` into raw substrings, flagging which ones are mentions — preserving
 * the exact characters (e.g. `@nikita`, not `@Nikita Sari`). Used by the compose
 * highlight layer, where the overlay must line up glyph-for-glyph with the
 * textarea's real text.
 */
export function toRawMentionSegments(
  body: string,
  memberBySlug: Map<string, MentionMember>,
): { value: string; isMention: boolean }[] {
  if (!body) return [];
  const out: { value: string; isMention: boolean }[] = [];
  let last = 0;
  MENTION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MENTION_RE.exec(body)) !== null) {
    if (!memberBySlug.has(m[1].toLowerCase())) continue;
    const start = m.index; // lookbehind is zero-width, so index points at '@'
    const end = m.index + m[0].length;
    if (start > last) out.push({ value: body.slice(last, start), isMention: false });
    out.push({ value: body.slice(start, end), isMention: true });
    last = end;
  }
  if (last < body.length) out.push({ value: body.slice(last), isMention: false });
  return out;
}

export type MentionSegment =
  | { type: 'text'; value: string }
  | { type: 'mention'; slug: string; name: string };

/**
 * Split `body` into text + mention segments for pill rendering. A `@slug` only
 * becomes a mention when the slug maps to a known member; otherwise it stays as
 * plain text (so the pill shows the current display name).
 */
export function toMentionSegments(
  body: string,
  memberBySlug: Map<string, MentionMember>,
): MentionSegment[] {
  if (!body) return [];
  const segments: MentionSegment[] = [];
  let last = 0;
  MENTION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MENTION_RE.exec(body)) !== null) {
    const slug = m[1].toLowerCase();
    const member = memberBySlug.get(slug);
    if (!member) continue; // leave unknown @tokens as plain text
    const start = m.index + m[0].length - m[1].length - 1; // index of '@'
    if (start > last) segments.push({ type: 'text', value: body.slice(last, start) });
    segments.push({ type: 'mention', slug, name: member.name });
    last = m.index + m[0].length;
  }
  if (last < body.length) segments.push({ type: 'text', value: body.slice(last) });
  return segments;
}

/**
 * Given the full text and caret index, detect an in-progress `@query` the caret
 * sits at the end of. Returns the query (without `@`) and the `@` index, or null.
 */
export function detectMentionQuery(
  text: string,
  caret: number,
): { query: string; start: number } | null {
  let i = caret - 1;
  while (i >= 0 && SLUG_CHAR_RE.test(text[i])) i -= 1;
  if (i < 0 || text[i] !== '@') return null;
  const before = i > 0 ? text[i - 1] : '';
  if (before && /[A-Za-z0-9_.@]/.test(before)) return null; // email / mid-word
  const query = text.slice(i + 1, caret);
  if (/\s/.test(query)) return null;
  return { query: query.toLowerCase(), start: i };
}

/** Replace the `@query` span [start, caret) with `@slug ` and report the caret. */
export function applyMentionSelection(
  text: string,
  start: number,
  caret: number,
  slug: string,
): { text: string; caret: number } {
  const token = `@${slug} `;
  return {
    text: text.slice(0, start) + token + text.slice(caret),
    caret: start + token.length,
  };
}

/** Rank members for the popover: thread participants first, then by name. */
export function rankMentionCandidates(
  members: MentionMember[],
  query: string,
  participantSlugs: Iterable<string> = [],
): MentionMember[] {
  const participants = toSlugSet(participantSlugs);
  const q = query.trim().toLowerCase();
  const matches = members.filter(
    (m) => !q || m.slug.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
  );
  return matches.sort((a, b) => {
    const pa = participants.has(a.slug.toLowerCase()) ? 0 : 1;
    const pb = participants.has(b.slug.toLowerCase()) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name);
  });
}
