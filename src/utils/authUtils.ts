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

function getStoredSession(): StoredSession | null {
  const raw = localStorage.getItem('auth_session') || sessionStorage.getItem('auth_session');
  if (!raw) return null;

  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

/**
 * Check if there is a stored auth session with a token.
 * Does NOT check expiry — agents should never be auto-logged out.
 */
export function isSessionValid(): boolean {
  return !!getStoredSession()?.token;
}

/**
 * Authorization header from the stored session (empty object when logged out).
 * For public-page components that hit auth-gated endpoints without importing LoginPage.
 */
export function getSessionAuthHeaders(): Record<string, string> {
  const token = getStoredSession()?.token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
