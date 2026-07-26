// One-account-per-agent guard for legacy/internal Alhijaz accounts.
//
// An "internal account" is the legacy login an agent connects to sync jamaah &
// payments — stored on `agents.jamaah_username` (e.g. "SM406"). Historically the
// same account was shared across multiple agents (SM406 → hastuti+sunu, SM442 →
// ekawati+jan-praba, SM848 → dian-melita-sari+susanto), which causes sync
// conflicts and login IP-blocks (see memory jamaah-sync-9-agents-broken).
//
// Going forward the connect flow (`POST /api/laporan/login`) enforces that an
// account may only be connected to a SINGLE agent at a time. The three legacy
// pairs are grandfathered: each existing owner still matches `isSameInternalAccount`
// so their own re-login/reconnect is never blocked — only a *different* agent
// claiming an in-use account is rejected. No new sharing can form.
//
// These pure helpers hold the correctness-sensitive bits (case handling, LIKE
// escaping, the user-facing message) so they can be unit-tested without booting
// the server or Supabase. The DB lookup itself lives in server.js.

export function normalizeInternalAccount(username) {
  return String(username == null ? '' : username).trim();
}

// True when two account identifiers refer to the same internal account.
// Case-insensitive + trimmed. An empty/blank identifier is never "the same" as
// anything (so an agent with no account saved does not count as its own owner).
export function isSameInternalAccount(a, b) {
  const na = normalizeInternalAccount(a);
  const nb = normalizeInternalAccount(b);
  if (!na || !nb) return false;
  return na.toLowerCase() === nb.toLowerCase();
}

// Escape PostgREST/SQL `ilike` wildcards so a lookup stays an EXACT (but
// case-insensitive) match. Internal usernames are SMxxxx and never contain
// wildcards, but escaping keeps the compare correct if malformed input arrives.
export function escapeInternalAccountLike(username) {
  return normalizeInternalAccount(username).replace(/[\\%_]/g, (c) => '\\' + c);
}

// User-facing rejection message shown when an agent tries to connect an internal
// account already held by someone else.
export function internalAccountTakenMessage(username, claimantName) {
  const holder = normalizeInternalAccount(claimantName) || 'agent lain';
  return `Akun internal ${normalizeInternalAccount(username)} sudah digunakan oleh agent lain (${holder}). Satu akun hanya boleh dipakai oleh satu agent. Hubungi admin jika ini seharusnya akun Anda.`;
}
