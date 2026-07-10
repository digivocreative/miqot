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

function getBrowserStorage(kind: 'local' | 'session'): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    const storage = kind === 'local' ? window.localStorage : window.sessionStorage;
    const key = '__storage_probe__';
    storage.setItem(key, key);
    storage.removeItem(key);
    return storage;
  } catch {
    return null;
  }
}

function isStoredSession(value: unknown): value is StoredSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<StoredSession>;
  const user = session.user as Partial<StoredSession['user']> | undefined;

  return typeof session.token === 'string'
    && session.token.trim().length > 0
    && !!user
    && typeof user.slug === 'string'
    && user.slug.trim().length > 0
    && typeof user.name === 'string'
    && user.name.trim().length > 0
    && (user.role === 'admin' || user.role === 'agent');
}

function readStoredSession(storage: Storage | null): StoredSession | null {
  if (!storage) return null;
  const raw = storage.getItem('auth_session');
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (isStoredSession(parsed)) return parsed;
  } catch {
    // malformed JSON, clear below
  }
  storage.removeItem('auth_session');
  return null;
}

function getStoredSession(): StoredSession | null {
  return readStoredSession(getBrowserStorage('local')) || readStoredSession(getBrowserStorage('session'));
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
