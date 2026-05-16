import { getAuthHeaders } from '../components/LoginPage';

export interface PortalMagicLinkResponse {
  url: string;
  expires_at: string;
  jamaah_name: string;
  id_umroh: string;
  anggota_count?: number;
  reused?: boolean;
}

const MAGIC_LINK_CACHE_TTL_MS = 2 * 60 * 1000;
const magicLinkCache = new Map<string, { data: PortalMagicLinkResponse; cachedAt: number }>();
const magicLinkInFlight = new Map<string, Promise<PortalMagicLinkResponse>>();

async function authedFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
    ...options.headers,
  };

  const res = await fetch(path, {
    ...options,
    headers,
  });

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const retryAfter = Number(res.headers.get('Retry-After') || body?.retry_after || 0);
    const message = body?.message
      || (body?.error === 'rate_limited'
        ? `Terlalu sering membuat link. Coba lagi dalam ${Math.ceil((retryAfter || 60) / 60)} menit.`
        : body?.error || `Request gagal (${res.status})`);
    throw Object.assign(new Error(message), body || { error: message }, {
      status: res.status,
      retry_after: retryAfter,
    });
  }

  return body as T;
}

function getCachedMagicLink(key: string) {
  const cached = magicLinkCache.get(key);
  if (!cached) return null;
  const isFresh = Date.now() - cached.cachedAt < MAGIC_LINK_CACHE_TTL_MS;
  const isUnexpired = new Date(cached.data.expires_at).getTime() > Date.now();
  if (!isFresh || !isUnexpired) {
    magicLinkCache.delete(key);
    return null;
  }
  return cached.data;
}

export const portalJamaahAdmin = {
  generateMagicLink: (slug: string, jamaah_id: number) => {
    const key = `${slug}:${jamaah_id}`;
    const cached = getCachedMagicLink(key);
    if (cached) return Promise.resolve(cached);

    const inFlight = magicLinkInFlight.get(key);
    if (inFlight) return inFlight;

    const request = authedFetch<PortalMagicLinkResponse>(`/api/portal/jamaah/${encodeURIComponent(slug)}/magic-link/generate`, {
      method: 'POST',
      body: JSON.stringify({ jamaah_id }),
    }).then((data) => {
      magicLinkCache.set(key, { data, cachedAt: Date.now() });
      return data;
    }).finally(() => {
      magicLinkInFlight.delete(key);
    });

    magicLinkInFlight.set(key, request);
    return request;
  },
};
