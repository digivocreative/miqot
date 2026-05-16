import { getAuthHeaders } from '../components/LoginPage';

export interface PortalMagicLinkResponse {
  url: string;
  expires_at: string;
  jamaah_name: string;
  id_umroh: string;
  anggota_count?: number;
}

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
    const message = body?.message || body?.error || `Request gagal (${res.status})`;
    throw Object.assign(new Error(message), body || { error: message });
  }

  return body as T;
}

export const portalJamaahAdmin = {
  generateMagicLink: (slug: string, jamaah_id: number) =>
    authedFetch<PortalMagicLinkResponse>(`/api/portal/jamaah/${encodeURIComponent(slug)}/magic-link/generate`, {
      method: 'POST',
      body: JSON.stringify({ jamaah_id }),
    }),
};
