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
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error ?? `Request failed: ${response.status}`);
  }
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
  // Bumped on every openPanel() call (and on closePanel) so a stale in-flight
  // fetch can recognize it's no longer the latest request and skip its state
  // updates — guards against both the close-then-reopen race and updates
  // after unmount racing with the mountedRef check below.
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
    // Invalidate any in-flight openPanel() fetch so its response can't land
    // after the user has already closed the panel.
    requestIdRef.current += 1;
    openRef.current = false;
    setOpen(false);
  }, []);

  const openPanel = useCallback(async () => {
    if (!enabled) return;
    const requestId = (requestIdRef.current += 1);
    const isStale = () => !mountedRef.current || requestIdRef.current !== requestId;

    openRef.current = true;
    setOpen(true);
    setLoading(true);
    setError(null);
    let fetchedAt: string | undefined;
    try {
      const data = await getJson<{ items: TerasNotification[]; fetched_at?: string }>('/api/community/notifications');
      if (isStale()) return;
      setItems(Array.isArray(data?.items) ? data.items : []);
      fetchedAt = data?.fetched_at;
    } catch {
      if (isStale()) return;
      setError('Gagal memuat notifikasi.');
      return;
    } finally {
      if (!isStale()) setLoading(false);
    }
    if (isStale()) return;
    // Opening the panel clears the badge; the server stamps the watermark
    // using the fetch-time stamp we hand back here, so anything that arrived
    // between fetch and this call stays unread instead of a blind spot. A
    // failed stamp is not rolled back — the next head poll corrects it.
    setUnread(0);
    void fetch('/api/community/notifications/seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(fetchedAt ? { seen_at: fetchedAt } : {}),
    }).catch(() => {});
  }, [enabled]);

  // Tandai semua terbaca tanpa mengosongkan daftar: hapus sorotan `unread` pada
  // item yang tampil dan nolkan badge. Membuka panel sudah memajukan watermark
  // seen, tapi item yang sedang tampil menahan sorotannya sampai refetch — tombol
  // ini menuntaskannya seketika. POST /seen lagi (idempoten, monotonik) untuk
  // menutup kemungkinan item baru masuk sejak panel dibuka.
  const markAllRead = useCallback(() => {
    setItems(prev => prev.some(it => it.unread) ? prev.map(it => (it.unread ? { ...it, unread: false } : it)) : prev);
    setUnread(0);
    void fetch('/api/community/notifications/seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({}),
    }).catch(() => {});
  }, []);

  // Bersihkan panel. Baru mengosongkan UI SETELAH server menerima — clear yang
  // gagal tidak boleh menyapu daftar seakan berhasil. Notifikasi baru tetap masuk.
  const clearAll = useCallback(async () => {
    try {
      const response = await fetch('/api/community/notifications/clear', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const payload = (await response.json()) as Envelope<unknown>;
      if (!response.ok || payload.success === false) throw new Error(payload.error ?? 'clear failed');
      setItems([]);
      setUnread(0);
    } catch {
      /* biarkan daftar apa adanya — kegagalan tak boleh menghapus tampilan */
    }
  }, []);

  return {
    unread,
    open,
    items,
    loading,
    error,
    openPanel: useCallback(() => { void openPanel(); }, [openPanel]),
    closePanel,
    markAllRead,
    clearAll: useCallback(() => { void clearAll(); }, [clearAll]),
  };
}
