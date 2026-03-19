/**
 * Shared auth utilities for checking session validity.
 * Used by main.tsx (auto-redirect) and FilterHeader.tsx (login/dashboard button).
 */

interface StoredSession {
  token: string;
  user: {
    slug: string;
    name: string;
    role: string;
  };
}

/**
 * Check if there is a stored auth session with a token.
 * Does NOT check expiry — agents should never be auto-logged out.
 */
export function isSessionValid(): boolean {
  const raw = localStorage.getItem('auth_session') || sessionStorage.getItem('auth_session');
  if (!raw) return false;

  try {
    const session: StoredSession = JSON.parse(raw);
    return !!session?.token;
  } catch {
    return false;
  }
}
