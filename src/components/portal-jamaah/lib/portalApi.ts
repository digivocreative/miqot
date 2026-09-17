import { clearPortalSession, getPortalSession } from './portalSession';

const API_BASE = '/api/portal/jamaah';
const PORTAL_MAGIC_CODE_REGEX = /^(?=.*[a-z])(?=.*[2-9])[a-z2-9]{5,6}$/i;

export type PersiapanKind = 'tahapan' | 'spiritual';

/** Link memang tidak bisa dipakai — bukan gangguan jaringan/server. */
export type ConsumeLinkErrorKind = 'expired' | 'consumed' | 'invalid' | 'belum_dp';

export interface ConsumeMagicLinkResult {
  session_token: string;
  id_umroh: string;
  jamaah_name: string;
  agent_slug: string;
  expires_at: string;
}

/**
 * Respons non-2xx. Pesannya sengaja berpola "status: NNN" (tanpa teks server) supaya
 * describeLoadError bisa memilih kalimat yang tepat untuk pengguna.
 */
export class PortalApiError extends Error {
  readonly status: number;
  /** Kode galat dari server (`error`), atau jenis link untuk consume. */
  readonly code: string;

  constructor(status: number, code: string) {
    super(`HTTP error! status: ${status}`);
    this.name = 'PortalApiError';
    this.status = status;
    this.code = code;
  }
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
    const body = await parseJson(res);
    throw new PortalApiError(res.status, String(body?.error || 'unknown'));
  }

  if (res.status === 204) return null;
  return parseJson(res);
}

function consumeError(status: number, body: { error?: string }) {
  const code = body?.error;
  if (code === 'expired' || status === 410) return new PortalApiError(status, 'expired');
  if (code === 'already_used') return new PortalApiError(status, 'consumed');
  if (code === 'belum_dp') return new PortalApiError(status, 'belum_dp');
  if (status === 400 || status === 404) return new PortalApiError(status, 'invalid');
  // 429 / 5xx / galat proxy: link-nya belum tentu salah — jamaah perlu bisa mencoba lagi.
  return new PortalApiError(status, 'retry');
}

export function isConsumeLinkError(error: unknown): error is PortalApiError & { code: ConsumeLinkErrorKind } {
  return error instanceof PortalApiError && ['expired', 'consumed', 'invalid', 'belum_dp'].includes(error.code);
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
      throw consumeError(res.status, await parseJson(res));
    }
    return parseJson(res);
  },

  async requestMagicLinkByBooking(slug: string, id_umroh: string, wa: string) {
    const res = await fetch(`${API_BASE}/${encodeURIComponent(slug)}/magic-link/request-by-booking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_umroh, wa }),
    });
    if (!res.ok) {
      const body = await parseJson(res);
      throw new PortalApiError(res.status, String(body?.error || 'unknown'));
    }
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
