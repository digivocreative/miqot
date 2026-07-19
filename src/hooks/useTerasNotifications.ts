import { useCallback, useEffect, useRef, useState } from 'react';

import { getAuthHeaders } from '../components/LoginPage';
import type { TerasNotification } from '../lib/communityNotifications';

const HEAD_POLL_INTERVAL_MS = 30_000;

interface Envelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

async function getJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url, { headers: getAuthHeaders() });
  const payload = (await response.json()) as Envelope<T>;
  if (!response.ok || payload.success === false) return null;
  return payload.data ?? null;
}

/**
 * Owns the bell's state. Called ONCE from DashboardLayout — the bell renders in
 * two mutually exclusive headers, and polling from the component would double
 * the request rate the day both are ever on screen together.
 */
export function useTerasNotifications(enabled: boolean) {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<TerasNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openRef = useRef(false);

  const checkHead = useCallback(async () => {
    if (!enabled || document.visibilityState !== 'visible') return;
    try {
      const data = await getJson<{ unread_count: number }>('/api/community/notifications/head');
      if (typeof data?.unread_count === 'number' && !openRef.current) setUnread(data.unread_count);
    } catch {
      /* silent — the badge keeps its last value until the next poll */
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void checkHead();
    const interval = window.setInterval(() => { void checkHead(); }, HEAD_POLL_INTERVAL_MS);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void checkHead();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [enabled, checkHead]);

  const closePanel = useCallback(() => {
    openRef.current = false;
    setOpen(false);
  }, []);

  const openPanel = useCallback(async () => {
    openRef.current = true;
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const data = await getJson<{ items: TerasNotification[] }>('/api/community/notifications');
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setError('Gagal memuat notifikasi.');
    } finally {
      setLoading(false);
    }
    // Opening the panel clears the badge; the server stamps the watermark. A
    // failed stamp is not rolled back — the next head poll corrects it.
    setUnread(0);
    void fetch('/api/community/notifications/seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: '{}',
    }).catch(() => {});
  }, []);

  return {
    unread,
    open,
    items,
    loading,
    error,
    openPanel: useCallback(() => { void openPanel(); }, [openPanel]),
    closePanel,
  };
}
