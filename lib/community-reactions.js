// Sumber tunggal set reaksi Teras — dipakai server.js DAN frontend (via .d.ts).
// Enum HANYA bertambah (jangan hapus kunci lama: baris DB lama tersimpan sebagai
// 'suka'/'selamat'/'aamiin'). Urutan array = urutan tampil di picker + tie-break jumlah.
export const COMMUNITY_REACTIONS = [
  { key: 'suka', emoji: '👍', label: 'Suka' },
  { key: 'cinta', emoji: '❤️', label: 'Cinta' },
  { key: 'aamiin', emoji: '🤲', label: 'Aamiin' },
  { key: 'selamat', emoji: '🎉', label: 'Barakallah' },
  { key: 'senang', emoji: '😊', label: 'Senang' },
  { key: 'masyaallah', emoji: '😮', label: 'Masyaallah' },
  { key: 'semangat', emoji: '🔥', label: 'Semangat' },
];

export const COMMUNITY_REACTION_TYPES = COMMUNITY_REACTIONS.map(r => r.key);
export const REACTION_EMOJI = Object.fromEntries(COMMUNITY_REACTIONS.map(r => [r.key, r.emoji]));
export const REACTION_LABEL = Object.fromEntries(COMMUNITY_REACTIONS.map(r => [r.key, r.label]));

export function emptyReactionCounts() {
  const counts = {};
  for (const { key } of COMMUNITY_REACTIONS) counts[key] = 0;
  return counts;
}

export function sumReactions(counts) {
  if (!counts) return 0;
  let total = 0;
  for (const { key } of COMMUNITY_REACTIONS) total += counts[key] || 0;
  return total;
}

// Emoji distinct dengan count>0, urut jumlah desc; tie mempertahankan urutan
// definisi (filter menjaga urutan + Array.sort stabil). Maks `limit` emoji.
export function topReactionEmojis(counts, limit = 3) {
  if (!counts) return [];
  return COMMUNITY_REACTIONS
    .filter(r => (counts[r.key] || 0) > 0)
    .sort((a, b) => (counts[b.key] || 0) - (counts[a.key] || 0))
    .slice(0, limit)
    .map(r => r.emoji);
}
