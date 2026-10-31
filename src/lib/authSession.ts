/**
 * Sesi login agent di browser (localStorage "ingat saya" / sessionStorage).
 *
 * Dipindahkan apa adanya dari components/LoginPage.tsx: ±35 pemakai helper ini
 * (hooks, widget dashboard, analytics) dulu ikut menarik seluruh halaman login
 * ke chunk entry yang diunduh setiap pengunjung publik. LoginPage.tsx tetap
 * me-re-export nama yang sama untuk kompatibilitas.
 */

interface AuthUser {
  slug: string;
  name: string;
  role: 'admin' | 'agent';
  photo: string;
  website: string;
  phone: string;
  email: string;
  /** Akun AIW tersimpan di server. Kosong = belum terbaca (lihat lib/aiw-account.js). */
  has_aiw_account?: boolean;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

export function getBrowserStorage(kind: 'local' | 'session'): Storage | null {
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

function isStoredAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<AuthSession>;
  const user = session.user as Partial<AuthUser> | undefined;

  return typeof session.token === 'string'
    && session.token.trim().length > 0
    && !!user
    && typeof user.slug === 'string'
    && user.slug.trim().length > 0
    && typeof user.name === 'string'
    && user.name.trim().length > 0
    && (user.role === 'admin' || user.role === 'agent');
}

function readStoredSession(storage: Storage | null): AuthSession | null {
  if (!storage) return null;
  const raw = storage.getItem('auth_session');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (isStoredAuthSession(parsed)) return parsed;
  } catch {
    // malformed JSON, clear below
  }
  storage.removeItem('auth_session');
  return null;
}

export function getStoredSession(): AuthSession | null {
  return readStoredSession(getBrowserStorage('local')) || readStoredSession(getBrowserStorage('session'));
}

/** Timpa sebagian data user di sesi tersimpan, di penyimpanan tempat sesi itu berada. */
export function updateStoredUser(patch: Partial<AuthUser>) {
  for (const kind of ['local', 'session'] as const) {
    const storage = getBrowserStorage(kind);
    const session = readStoredSession(storage);
    if (!session) continue;
    storage?.setItem('auth_session', JSON.stringify({ ...session, user: { ...session.user, ...patch } }));
    return;
  }
}

export function clearSession() {
  const local = getBrowserStorage('local');
  const session = getBrowserStorage('session');

  // Remove auth session
  local?.removeItem('auth_session');
  session?.removeItem('auth_session');
  // Clear session-scoped UI state
  session?.removeItem('insightDismissed'); // legacy cleanup
  local?.removeItem('insightDismissedDate');
  session?.removeItem('pin_unlocked');
}

export function getAuthHeaders(): Record<string, string> {
  const session = getStoredSession();
  if (!session) return {};
  return { Authorization: `Bearer ${session.token}` };
}
