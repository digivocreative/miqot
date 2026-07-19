/**
 * Pure helpers for the Teras notification bell.
 *
 * Notifications are derived, not fanned out: the server reads three existing
 * tables (mentions, comments on my posts, reactions on my posts) and hands the
 * raw rows to these helpers, which merge them into one feed. Keeping the merge
 * rules here means they are testable without a database — and swapping the
 * derived model for a fan-out table later would not change this contract.
 */

export const NOTIFICATION_LIMIT = 30;
export const NOTIFICATION_BADGE_CAP = 99;

function toTime(value) {
  const time = new Date(value || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/**
 * Collapse reaction rows into one entry per post: newest actor is the face,
 * distinct actors are the count. A single post reacted to by five agents is
 * one notification, not five.
 */
export function groupReactionRows(rows) {
  const byPost = new Map();
  for (const row of rows || []) {
    if (!row?.post_id) continue;
    const existing = byPost.get(row.post_id);
    if (!existing) {
      byPost.set(row.post_id, {
        post_id: row.post_id,
        created_at: row.created_at,
        actor: row.actor || null,
        snippet: row.snippet || '',
        actors: new Set(row.agent_id ? [row.agent_id] : []),
      });
      continue;
    }
    if (row.agent_id) existing.actors.add(row.agent_id);
    if (toTime(row.created_at) > toTime(existing.created_at)) {
      existing.created_at = row.created_at;
      existing.actor = row.actor || existing.actor;
    }
  }
  return [...byPost.values()].map(entry => ({
    post_id: entry.post_id,
    created_at: entry.created_at,
    actor: entry.actor,
    actor_count: Math.max(1, entry.actors.size),
    snippet: entry.snippet,
  }));
}

/**
 * @param {{mentions?: object[], comments?: object[], reactions?: object[]}} sources
 * @param {string|null} seenAt  watermark; rows newer than this are unread
 * @param {number} [limit=NOTIFICATION_LIMIT]
 */
export function mergeNotifications(sources, seenAt, limit = NOTIFICATION_LIMIT) {
  const seenTime = seenAt ? toTime(seenAt) : 0;
  const unreadAll = !seenAt;
  const items = [];

  for (const row of sources?.mentions || []) {
    items.push({
      id: `mention:${row.id}`,
      type: 'mention',
      post_id: row.post_id,
      comment_id: row.comment_id || null,
      actor: row.actor || null,
      actor_count: 1,
      snippet: row.snippet || '',
      created_at: row.created_at,
      unread: unreadAll || toTime(row.created_at) > seenTime,
    });
  }

  for (const row of sources?.comments || []) {
    items.push({
      id: `comment:${row.id}`,
      type: 'comment',
      post_id: row.post_id,
      comment_id: row.id,
      actor: row.actor || null,
      actor_count: 1,
      snippet: row.snippet || '',
      created_at: row.created_at,
      unread: unreadAll || toTime(row.created_at) > seenTime,
    });
  }

  for (const row of groupReactionRows(sources?.reactions)) {
    items.push({
      id: `reaction:${row.post_id}`,
      type: 'reaction',
      post_id: row.post_id,
      comment_id: null,
      actor: row.actor,
      actor_count: row.actor_count,
      snippet: row.snippet,
      created_at: row.created_at,
      unread: unreadAll || toTime(row.created_at) > seenTime,
    });
  }

  items.sort((a, b) => toTime(b.created_at) - toTime(a.created_at));
  return items.slice(0, limit);
}

/**
 * Badge count. The caller has already filtered each source to rows newer than
 * the watermark, so everything passed in counts — reactions after grouping.
 */
export function countUnreadNotifications(sources) {
  const total = (sources?.mentions || []).length
    + (sources?.comments || []).length
    + groupReactionRows(sources?.reactions).length;
  return Math.min(NOTIFICATION_BADGE_CAP, Math.max(0, total));
}
