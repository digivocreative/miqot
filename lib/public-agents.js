// Proyeksi PUBLIK tabel agents untuk GET /api/agents/public.
//
// Tabel agents memuat PII dan kunci (awapi_key, hash password, mcp_api_key,
// telegram_chat_id, kredensial legacy, ...). Frontend cuma butuh lima kolom
// untuk routing /:slug dan kartu agent — dulu diambil browser langsung lewat
// anon key Supabase (`select slug,name,website,phone,photo` +
// `.or('status.eq.active,status.is.null')`). Semantik filter & bentuk nilai
// (mentah, tanpa transformasi) dipertahankan persis di sini; kolom lain tidak
// boleh bocor.

export const PUBLIC_AGENT_FIELDS = Object.freeze(['slug', 'name', 'website', 'phone', 'photo']);

/** Persis semantik PostgREST `status.eq.active,status.is.null`. */
export function isPubliclyListedAgent(agent) {
  if (!agent || typeof agent !== 'object') return false;
  return agent.status === 'active' || agent.status == null;
}

/** Hanya kolom daftar-putih; nilai apa adanya (null tetap null). */
export function toPublicAgent(agent) {
  const out = {};
  for (const field of PUBLIC_AGENT_FIELDS) out[field] = agent[field] ?? null;
  return out;
}

/**
 * @param {Record<string, object> | object[] | null | undefined} agents
 *   Map agent per id (bentuk cache getAgents() di server) atau array baris.
 */
export function listPublicAgents(agents) {
  const rows = Array.isArray(agents) ? agents : Object.values(agents || {});
  return rows.filter(isPubliclyListedAgent).map(toPublicAgent);
}
