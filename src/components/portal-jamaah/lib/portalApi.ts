import { clearPortalSession, getPortalSession } from './portalSession';

const API_BASE = '/api/portal/jamaah';
const PORTAL_MAGIC_CODE_REGEX = /^(?=.*[a-z])(?=.*[2-9])[a-z2-9]{5,6}$/i;

export type PersiapanKind = 'tahapan' | 'spiritual';

export interface ConsumeMagicLinkResult {
  session_token: string;
  id_umroh: string;
  jamaah_name: string;
  agent_slug: string;
  expires_at: string;
}

async function parseJson(res: Response) {
  return res.json().catch(() => ({ error: 'unknown' }));
}

async function authedFetch(path: string, options: RequestInit = {}) {
  const session = getPortalSession();
  if (!session) throw new Error('no_session');

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${session.session_token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
  });

  if (res.status === 401) {
    const loginPath =
      session.access_code && PORTAL_MAGIC_CODE_REGEX.test(session.access_code)
        ? `/${session.slug}/jamaah/${session.access_code}`
        : `/${session.slug}/jamaah`;
    clearPortalSession();
    window.location.href = loginPath;
    throw new Error('session_expired');
  }

  if (!res.ok) {
    throw await parseJson(res);
  }

  if (res.status === 204) return null;
  return parseJson(res);
}

function normalizeConsumeError(error: { error?: string; message?: string }) {
  const code = error?.error;
  if (code === 'expired') return { ...error, code: 'expired' };
  if (code === 'already_used') return { ...error, code: 'consumed' };
  return { ...error, code: 'invalid' };
}

export const portalApi = {
  // Tanpa slug = link pendek /j/{kode}: server mencari token dari kode 6-char
  // yang unik global, lalu mengembalikan agent_slug pemiliknya.
  async consumeMagicLink(slug: string | undefined, token: string): Promise<ConsumeMagicLinkResult> {
    const path = slug
      ? `${API_BASE}/${encodeURIComponent(slug)}/auth/consume/${encodeURIComponent(token)}`
      : `${API_BASE}/auth/consume/${encodeURIComponent(token)}`;
    const res = await fetch(path, {
      credentials: 'include',
    });
    if (!res.ok) {
      throw normalizeConsumeError(await parseJson(res));
    }
    return parseJson(res);
  },

  async requestMagicLinkByBooking(slug: string, id_umroh: string, wa: string) {
    const res = await fetch(`${API_BASE}/${encodeURIComponent(slug)}/magic-link/request-by-booking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_umroh, wa }),
    });
    if (!res.ok) throw await parseJson(res);
    return parseJson(res);
  },

  getMe: () => authedFetch('/me'),
  getPersiapan: () => authedFetch('/persiapan'),
  togglePersiapanItem: (kind: PersiapanKind, item_id: string, checked: boolean) =>
    authedFetch('/persiapan/item', {
      method: 'PUT',
      body: JSON.stringify({ kind, item_id, checked }),
    }),
  logout: () => authedFetch('/auth/logout', { method: 'POST' }),
};
