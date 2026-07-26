/**
 * Polling Teras ala Threads — helper murni (tanpa Supabase) supaya bisa diuji
 * langsung. Satu poll per kiriman (identitas segmen pertama utas), 2–4 opsi
 * teks, durasi tetap 24 jam. Suara satu per agent, boleh diganti selama
 * polling terbuka, tidak bisa dicabut.
 */

export const COMMUNITY_POLL_MIN_OPTIONS = 2;
export const COMMUNITY_POLL_MAX_OPTIONS = 4;
export const COMMUNITY_POLL_MAX_OPTION_CHARS = 60;
export const COMMUNITY_POLL_DURATION_MS = 24 * 60 * 60 * 1000;

function fail(error) {
  return { options: null, error };
}

/**
 * Validasi input poll dari klien (`body.poll`). Menerima `{ options: [...] }`,
 * mengembalikan `{ options: string[], error: null }` atau `{ options: null,
 * error: string }`. Teks di-trim; kosong/duplikat/kepanjangan ditolak dengan
 * pesan yang bisa langsung dipakai sebagai respons 400.
 */
export function normalizeCommunityPollInput(raw) {
  if (raw === undefined || raw === null) return { options: null, error: null };
  if (typeof raw !== 'object' || Array.isArray(raw)) return fail('Format polling tidak valid');
  const list = raw.options;
  if (!Array.isArray(list)) return fail('Format polling tidak valid');
  if (list.length < COMMUNITY_POLL_MIN_OPTIONS || list.length > COMMUNITY_POLL_MAX_OPTIONS) {
    return fail(`Polling wajib ${COMMUNITY_POLL_MIN_OPTIONS}–${COMMUNITY_POLL_MAX_OPTIONS} opsi`);
  }

  const options = [];
  const seen = new Set();
  for (let i = 0; i < list.length; i += 1) {
    const text = typeof list[i] === 'string' ? list[i].trim() : '';
    const length = Array.from(text).length;
    if (length < 1) return fail(`Opsi ke-${i + 1} polling masih kosong`);
    if (length > COMMUNITY_POLL_MAX_OPTION_CHARS) {
      return fail(`Opsi polling maksimal ${COMMUNITY_POLL_MAX_OPTION_CHARS} karakter`);
    }
    const key = text.toLowerCase();
    if (seen.has(key)) return fail('Opsi polling tidak boleh kembar');
    seen.add(key);
    options.push(text);
  }
  return { options, error: null };
}

/** True bila polling sudah lewat ends_at (atau ends_at tidak bisa dibaca). */
export function isCommunityPollClosed(endsAt, now = new Date()) {
  const ends = Date.parse(endsAt);
  if (Number.isNaN(ends)) return true;
  return now.getTime() >= ends;
}

/**
 * Susun payload poll untuk klien dari baris `community_polls` + baris suara
 * `community_poll_votes` (post yang sama). Baris opsi rusak/di luar rentang
 * diabaikan defensif — jangan 500 hanya karena jsonb tercemar. Kembalikan
 * null bila baris poll tidak layak render (opsi < 2).
 */
export function communityPollPayload(pollRow, voteRows, viewerAgentId, now = new Date()) {
  if (!pollRow || !pollRow.ends_at) return null;
  const texts = Array.isArray(pollRow.options)
    ? pollRow.options.filter(item => typeof item === 'string' && item.length > 0)
      .slice(0, COMMUNITY_POLL_MAX_OPTIONS)
    : [];
  if (texts.length < COMMUNITY_POLL_MIN_OPTIONS) return null;

  const votes = texts.map(() => 0);
  let myVote = null;
  let total = 0;
  for (const row of voteRows || []) {
    const index = row?.option_index;
    if (!Number.isInteger(index) || index < 0 || index >= texts.length) continue;
    votes[index] += 1;
    total += 1;
    if (row.agent_id === viewerAgentId) myVote = index;
  }

  return {
    options: texts.map((text, index) => ({ text, votes: votes[index] })),
    total_votes: total,
    my_vote: myVote,
    ends_at: pollRow.ends_at,
    closed: isCommunityPollClosed(pollRow.ends_at, now),
  };
}
