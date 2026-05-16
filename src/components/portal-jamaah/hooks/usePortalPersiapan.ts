import { useEffect, useState } from 'react';
import { portalApi, type PersiapanKind } from '../lib/portalApi';

export type { PersiapanKind } from '../lib/portalApi';

export type PersiapanPhase = 'sekarang' | 'h30' | 'h7' | 'h1';
export type PersiapanCategory = 'niat_doa' | 'ilmu_manasik' | 'persiapan_hati';
export type PersiapanCrossLink = 'bayar' | 'perlengkapan' | 'dokumen';

export interface PortalPersiapanItem {
  id: string;
  title: string;
  description: string;
  phase?: PersiapanPhase;
  category?: PersiapanCategory;
  autoSyncFrom?: string;
  crossLink?: PersiapanCrossLink;
  resourceUrl?: string;
  checked: boolean;
  checked_at?: string | null;
  auto_synced?: boolean;
}

export interface PortalPerlengkapanStateItem {
  id: string;
  title: string;
  icon: string;
  handover: 'dp' | 'manasik';
  status: 'diambil' | 'tersedia' | 'belum_siap';
  diambil_at?: string | null;
}

export interface PortalPersiapanProgress {
  overall_pct: number;
  tahapan_pct: number;
  spiritual_pct: number;
  dokumen_pct: number;
  perlengkapan_pct: number;
  pending_count?: number;
}

export interface PortalPersiapanData {
  tahapan: PortalPersiapanItem[];
  spiritual: PortalPersiapanItem[];
  perlengkapan_per_jamaah: Record<string, PortalPerlengkapanStateItem[]>;
  progress: PortalPersiapanProgress;
}

function pct(items: PortalPersiapanItem[]) {
  if (!items.length) return 0;
  return Math.round((items.filter((item) => item.checked).length / items.length) * 100);
}

function optimisticProgress(next: PortalPersiapanData): PortalPersiapanProgress {
  const tahapanPct = pct(next.tahapan);
  const spiritualPct = pct(next.spiritual);
  const dokumenPct = next.progress.dokumen_pct || 0;
  const perlengkapanPct = next.progress.perlengkapan_pct || 0;
  const pendingDelta = next.progress.pending_count ?? 0;

  return {
    ...next.progress,
    tahapan_pct: tahapanPct,
    spiritual_pct: spiritualPct,
    overall_pct: Math.round((tahapanPct + spiritualPct + dokumenPct + perlengkapanPct) / 4),
    pending_count: Math.max(0, pendingDelta),
  };
}

export function usePortalPersiapan() {
  const [persiapan, setPersiapan] = useState<PortalPersiapanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  async function fetchPersiapan() {
    try {
      setLoading(true);
      const res = await portalApi.getPersiapan();
      setPersiapan(res as PortalPersiapanData);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  async function toggleItem(kind: PersiapanKind, itemId: string, checked: boolean) {
    let rollback: PortalPersiapanData | null = null;

    setPersiapan((prev) => {
      if (!prev) return prev;
      const item = prev[kind].find((entry) => entry.id === itemId);
      if (!item || item.auto_synced) return prev;

      rollback = prev;
      const next = {
        ...prev,
        [kind]: prev[kind].map((entry) =>
          entry.id === itemId
            ? { ...entry, checked, checked_at: checked ? new Date().toISOString() : null }
            : entry
        ),
      } as PortalPersiapanData;
      const pendingChange = checked ? -1 : 1;
      next.progress = optimisticProgress({
        ...next,
        progress: {
          ...next.progress,
          pending_count: (next.progress.pending_count ?? 0) + pendingChange,
        },
      });
      return next;
    });

    try {
      const res = await portalApi.togglePersiapanItem(kind, itemId, checked);
      setPersiapan((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tahapan: Array.isArray(res?.tahapan) ? res.tahapan : prev.tahapan,
          spiritual: Array.isArray(res?.spiritual) ? res.spiritual : prev.spiritual,
          progress: res?.progress || prev.progress,
        };
      });
    } catch (err) {
      if (rollback) setPersiapan(rollback);
      setError(err);
      console.error('Toggle failed:', err);
    }
  }

  useEffect(() => {
    fetchPersiapan();
  }, []);

  return { persiapan, loading, error, toggleItem, refetch: fetchPersiapan };
}
