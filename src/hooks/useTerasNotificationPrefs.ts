import { useCallback, useState } from 'react';

import { getAuthHeaders } from '../components/LoginPage';

export type TerasPrefKey =
  | 'teras_bell_mention' | 'teras_bell_comment' | 'teras_bell_reaction' | 'teras_bell_broadcast'
  | 'community_mentions' | 'teras_tg_comment' | 'teras_tg_reaction' | 'teras_tg_broadcast';

export type TerasPrefs = Record<TerasPrefKey, boolean>;

const DEFAULT_PREFS: TerasPrefs = {
  teras_bell_mention: true,
  teras_bell_comment: true,
  teras_bell_reaction: true,
  teras_bell_broadcast: true,
  community_mentions: true,
  teras_tg_comment: false,
  teras_tg_reaction: false,
  teras_tg_broadcast: false,
};

interface PrefsPayload {
  success?: boolean;
  data?: { prefs: TerasPrefs; telegram_connected: boolean };
  error?: string;
}

/**
 * Menyimpan optimistis per saklar: nilainya berubah seketika, dan dikembalikan
 * ke posisi semula bila PUT gagal. Tidak ada tombol "Simpan" — satu saklar satu
 * permintaan.
 */
export function useTerasNotificationPrefs(enabled: boolean) {
  const [prefs, setPrefs] = useState<TerasPrefs>(DEFAULT_PREFS);
  const [telegramConnected, setTelegramConnected] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openSheet = useCallback(async () => {
    if (!enabled) return;
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/community/notification-prefs', { headers: getAuthHeaders() });
      const payload = (await response.json()) as PrefsPayload;
      if (!response.ok || payload.success === false || !payload.data) {
        throw new Error(payload.error ?? `Request failed: ${response.status}`);
      }
      setPrefs(payload.data.prefs);
      setTelegramConnected(payload.data.telegram_connected);
    } catch {
      setError('Gagal memuat pengaturan.');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  const closeSheet = useCallback(() => {
    setOpen(false);
    setError(null);
  }, []);

  const toggle = useCallback(async (key: TerasPrefKey) => {
    const previous = prefs[key];
    setPrefs(current => ({ ...current, [key]: !previous }));
    setError(null);
    try {
      const response = await fetch('/api/community/notification-prefs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ [key]: !previous }),
      });
      const payload = (await response.json()) as PrefsPayload;
      if (!response.ok || payload.success === false || !payload.data) {
        throw new Error(payload.error ?? `Request failed: ${response.status}`);
      }
      setPrefs(payload.data.prefs);
    } catch {
      setPrefs(current => ({ ...current, [key]: previous }));
      setError('Gagal menyimpan. Coba lagi.');
    }
  }, [prefs]);

  return { prefs, telegramConnected, open, loading, error, openSheet, closeSheet, toggle };
}
