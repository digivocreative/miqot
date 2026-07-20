/**
 * Penggabungan pesan digest Telegram untuk Teras.
 *
 * Telegram memakai jalan yang sama dengan lonceng: satu kiriman yang diramaikan
 * 15 reaksi menghasilkan SATU pesan, bukan 15. Aturannya ditaruh di sini —
 * murni, tanpa DB dan tanpa jaringan — supaya bisa diuji sepenuhnya dan tidak
 * menyimpang dari aturan lonceng di lib/community-notifications.js.
 */

import { telegramSourceFlags } from './teras-notification-prefs.js';

/** Jeda kumpul. Angka tebakan tanpa data pendukung — satu tempat untuk diubah. */
export const TERAS_DIGEST_WINDOW_MS = 10 * 60 * 1000;

/** Lantai pengambilan: baris lebih tua dari ini tidak pernah dikirim susulan. */
export const TERAS_DIGEST_LOOKBACK_MS = 24 * 60 * 60 * 1000;

function toTime(value) {
  const time = new Date(value || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function groupByOwnerAndPost(rows, ownerById, isEnabled) {
  const groups = new Map();
  for (const row of rows || []) {
    const owner = ownerById.get(row?.owner_agent_id);
    if (!owner || !owner.chat_id) continue;
    if (!isEnabled(owner)) continue;
    if (!row.post_id) continue;
    // Aksi sendiri tidak memberi tahu diri sendiri.
    if (row.actor_agent_id === owner.id) continue;
    // Watermark: apa pun yang sudah tercakup pengiriman sebelumnya dilewati.
    if (owner.sent_at && toTime(row.created_at) <= toTime(owner.sent_at)) continue;

    const key = `${owner.id}:${row.post_id}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        owner,
        post_id: row.post_id,
        created_at: row.created_at,
        actor_name: row.actor_name || 'Seseorang',
        actors: new Set(row.actor_agent_id ? [row.actor_agent_id] : []),
        count: 1,
      });
      continue;
    }
    existing.count += 1;
    if (row.actor_agent_id) existing.actors.add(row.actor_agent_id);
    if (toTime(row.created_at) > toTime(existing.created_at)) {
      existing.created_at = row.created_at;
      existing.actor_name = row.actor_name || existing.actor_name;
    }
  }
  return [...groups.values()];
}

/**
 * Satu balasan yang sekaligus menyebut pemilik kiriman sudah dikirim instan
 * lewat jalur mention. Yang personal lebih spesifik, jadi sisi komentarnya yang
 * dibuang — aturan yang sama dengan lonceng.
 */
function dropCommentsAlreadySentAsMentions(comments, mentions) {
  const sent = new Set(
    (mentions || [])
      .filter(row => row?.comment_id && row?.mentioned_agent_id)
      .map(row => `${row.mentioned_agent_id}:${row.comment_id}`),
  );
  return (comments || []).filter(row => !sent.has(`${row.owner_agent_id}:${row.id}`));
}

export function buildTerasDigestMessages({ comments, reactions, mentions, owners, origin }) {
  const ownerById = new Map((owners || []).map(row => [row.id, row]));
  const postUrl = postId => `${origin}/dashboard/teras/post/${postId}`;
  const messages = [];

  const commentGroups = groupByOwnerAndPost(
    dropCommentsAlreadySentAsMentions(comments, mentions),
    ownerById,
    owner => telegramSourceFlags(owner.prefs).comments,
  );
  for (const group of commentGroups) {
    const label = group.count === 1
      ? `<b>${escapeHtml(group.actor_name)}</b> membalas kiriman kamu`
      : `<b>${group.count} balasan baru</b> di kiriman kamu`;
    messages.push({
      agent_id: group.owner.id,
      chat_id: group.owner.chat_id,
      post_id: group.post_id,
      type: 'comment',
      text: `💬 ${label}\n\n${postUrl(group.post_id)}`,
    });
  }

  const reactionGroups = groupByOwnerAndPost(
    reactions,
    ownerById,
    owner => telegramSourceFlags(owner.prefs).reactions,
  );
  for (const group of reactionGroups) {
    const others = Math.max(0, group.actors.size - 1);
    const who = others > 0
      ? `<b>${escapeHtml(group.actor_name)}</b> dan ${others} lainnya`
      : `<b>${escapeHtml(group.actor_name)}</b>`;
    messages.push({
      agent_id: group.owner.id,
      chat_id: group.owner.chat_id,
      post_id: group.post_id,
      type: 'reaction',
      text: `❤️ ${who} menyukai kiriman kamu\n\n${postUrl(group.post_id)}`,
    });
  }

  return messages;
}
