const STORAGE_KEY = 'jamaah_portal_session';
const COOKIE_NAME = 'jamaah_session';
const NINETY_DAYS_SECONDS = 90 * 24 * 60 * 60;

export interface PortalSession {
  session_token: string;
  id_umroh: string;
  slug: string;
  expires_at: string;
  access_code?: string;
}

function hasExpired(expiresAt: string): boolean {
  const t = new Date(expiresAt).getTime();
  return !Number.isFinite(t) || t <= Date.now();
}

export function savePortalSession(session: PortalSession) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(session.session_token)}; path=/; max-age=${NINETY_DAYS_SECONDS}; SameSite=Lax${secure}`;
}

export function getPortalSession(): PortalSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Partial<PortalSession>;
    if (!session.session_token || !session.id_umroh || !session.slug || !session.expires_at) {
      clearPortalSession();
      return null;
    }
    if (hasExpired(session.expires_at)) {
      clearPortalSession();
      return null;
    }
    return session as PortalSession;
  } catch {
    clearPortalSession();
    return null;
  }
}

export function clearPortalSession() {
  localStorage.removeItem(STORAGE_KEY);
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`;
}
