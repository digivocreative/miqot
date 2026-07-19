/**
 * Pure helpers for Teras (community) @mentions.
 *
 * A mention is an `@<slug>` token at a word boundary (start of body or after
 * whitespace) whose slug matches a current Teras member. The body is the source
 * of truth — the client-sent `mentions` array is only ever an extra cross-check.
 *
 * The same extractor powers two paths:
 *   - recording/notifying: pass the author slug so self-mentions are excluded.
 *   - rendering pills:      pass `null` so the author's own mentions still render.
 */

// A mention `@` must not be preceded by an alphanumeric, `.`, `_`, or `@` — that
// rules out emails (`bagas@bagas.com`) and mid-word `@`, while still allowing
// opening punctuation like `(@nikita)`. This boundary matches the client-side
// autocomplete trigger so compose-time and render-time parsing stay consistent.
// Slug chars mirror agent slugs; the capture is greedy but the member-set
// intersection below is the real filter, so over-capture is harmless.
const MENTION_RE = /(?<![A-Za-z0-9_.@])@([A-Za-z0-9][A-Za-z0-9_-]*)/g;

function toSlugSet(allowedSlugs) {
  const source = allowedSlugs instanceof Set ? allowedSlugs : (allowedSlugs || []);
  const set = new Set();
  for (const slug of source) {
    const norm = String(slug || '').trim().toLowerCase();
    if (norm) set.add(norm);
  }
  return set;
}

/**
 * @param {string} body
 * @param {Iterable<string>|Set<string>} allowedSlugs  current Teras member slugs
 * @param {string|null} authorSlug  excluded from the result when non-null
 * @param {number} [limit=10]  max distinct mentions returned
 * @returns {string[]}  canonical member slugs, in first-seen order
 */
export function extractCommunityMentions(body, allowedSlugs, authorSlug, limit = 10) {
  if (typeof body !== 'string' || !body) return [];
  const allowed = toSlugSet(allowedSlugs);
  if (!allowed.size) return [];
  const author = authorSlug ? String(authorSlug).trim().toLowerCase() : null;

  const seen = new Set();
  const result = [];
  MENTION_RE.lastIndex = 0;
  let match;
  while ((match = MENTION_RE.exec(body)) !== null) {
    const slug = match[1].toLowerCase();
    if (!allowed.has(slug)) continue;
    if (author && slug === author) continue;
    if (seen.has(slug)) continue;
    seen.add(slug);
    result.push(slug);
    if (result.length >= limit) break;
  }
  return result;
}

/**
 * Idempotency filter for mention recording. The uniqueness guards in the DB are
 * *partial* unique indexes (post-level vs comment-level), which Postgres cannot
 * infer from an `ON CONFLICT (columns)` list, so recording reads what is already
 * stored and inserts only the remainder instead of upserting.
 *
 * @param {Array<{mentioned_agent_id: string}>} rows  candidate rows for one source
 * @param {Iterable<string>|null|undefined} recordedAgentIds  already-stored targets
 * @returns {Array<{mentioned_agent_id: string}>}  rows still to insert, in order
 */
export function unrecordedMentionRows(rows, recordedAgentIds) {
  const recorded = new Set();
  for (const id of recordedAgentIds || []) {
    if (id) recorded.add(String(id));
  }
  return (rows || []).filter(row => !recorded.has(String(row?.mentioned_agent_id)));
}

export const COMMUNITY_MENTION_LIMIT = 10;
