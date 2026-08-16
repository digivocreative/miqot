import { extractCommunityMentions } from './community-mentions.js';

/**
 * Bentuk daftar kiriman ringkas untuk ticker Jendela Teras di dashboard.
 * `rows` = kiriman terbaru terurut desc dengan kolom body, photo_url,
 * created_at, dan relasi agent. Mention diresolusi terhadap SNIPPET (bukan
 * body penuh) supaya payload cocok persis dengan yang dirender kartu.
 * Thumb sengaja hanya photo_url: kolom itu dipelihara server sebagai gambar
 * pertama kiriman (create/edit/purge), sedangkan kolom media butuh deteksi
 * skema yang tidak layak untuk teaser.
 */
export function buildCommunityTeaserPosts(rows, {
  authorProfile,
  memberBySlug,
  limit = 3,
  snippetLength = 120,
  mentionLimit = 10,
}) {
  const posts = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== 'object') continue;
    const author = authorProfile(row.agent);
    const snippet = Array.from(String(row.body || '')).slice(0, snippetLength).join('');
    const mentions = extractCommunityMentions(snippet, memberBySlug.keys(), null, mentionLimit)
      .map(slug => ({ slug, name: memberBySlug.get(slug).name }));
    const photoUrl = typeof row.photo_url === 'string' ? row.photo_url.trim() : '';
    posts.push({
      author: { name: author.name, photo: author.photo },
      body_snippet: snippet,
      mentions,
      created_at: row.created_at,
      thumb: photoUrl || null,
    });
    if (posts.length >= limit) break;
  }
  return posts;
}
