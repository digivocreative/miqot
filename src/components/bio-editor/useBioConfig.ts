import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuthHeaders } from '../LoginPage';
import type { BioConfig, BioTile, BioTheme } from '../bio/types';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const DEFAULT_DEBOUNCE_MS = 800;

/**
 * Editor hook for a bio config.
 *   - Loads the authoritative config on mount (also triggers server-side
 *     auto-populate on first access).
 *   - updateConfig() mutates locally and debounces a PUT to the server.
 *   - The response replaces local state so orphan-flags, normalized order,
 *     and the computed `_wa_link_preview` stay in sync with the backend.
 */
export function useBioConfig(slug: string) {
  const [config, setConfig] = useState<BioConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBodyRef = useRef<BioConfig | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);

  const doLoad = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/bio/${encodeURIComponent(slug)}/config`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('failed');
      const d = await res.json();
      setConfig(d.data as BioConfig);
      setError(null);
    } catch (e) {
      setError('Gagal memuat konfigurasi');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { doLoad(); }, [doLoad]);

  const flushSave = useCallback(async () => {
    const body = pendingBodyRef.current;
    if (!body) return;
    pendingBodyRef.current = null;
    setSaveStatus('saving');
    try {
      const res = await fetch(`/api/bio/${encodeURIComponent(slug)}/config`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || 'save failed');
      setConfig(d.data as BioConfig);
      setLastSaved(new Date());
      setSaveStatus('saved');
      setError(null);
    } catch (e: any) {
      setSaveStatus('error');
      setError(e?.message || 'Gagal menyimpan');
    }
  }, [slug]);

  const scheduleSave = useCallback((body: BioConfig, debounceMs = DEFAULT_DEBOUNCE_MS) => {
    pendingBodyRef.current = body;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const p = flushSave();
      inFlightRef.current = p;
    }, debounceMs);
  }, [flushSave]);

  // Cleanup: flush pending save on unmount so debounced edits aren't lost.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        // best-effort synchronous fire-and-forget
        const body = pendingBodyRef.current;
        if (body) {
          fetch(`/api/bio/${encodeURIComponent(slug)}/config`, {
            method: 'PUT',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            keepalive: true,
          }).catch(() => {});
        }
      }
    };
  }, [slug]);

  const updateConfig = useCallback((updater: (prev: BioConfig) => BioConfig) => {
    setConfig(prev => {
      if (!prev) return prev;
      const next = updater(prev);
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  const addTile = useCallback((tile: Omit<BioTile, 'order'>) => {
    updateConfig(prev => {
      const maxOrder = prev.tiles.length
        ? Math.max(...prev.tiles.map(t => t.order))
        : -1;
      return {
        ...prev,
        tiles: [...prev.tiles, { ...tile, order: maxOrder + 1 }],
      };
    });
  }, [updateConfig]);

  const updateTile = useCallback((id: string, patch: Partial<BioTile>) => {
    updateConfig(prev => ({
      ...prev,
      tiles: prev.tiles.map(t => t.id === id ? { ...t, ...patch } : t),
    }));
  }, [updateConfig]);

  const updateTileConfig = useCallback((id: string, configPatch: Record<string, unknown>) => {
    updateConfig(prev => ({
      ...prev,
      tiles: prev.tiles.map(t => t.id === id
        ? { ...t, config: { ...t.config, ...configPatch } }
        : t),
    }));
  }, [updateConfig]);

  const deleteTile = useCallback((id: string) => {
    updateConfig(prev => ({
      ...prev,
      tiles: prev.tiles
        .filter(t => t.id !== id)
        .map((t, i) => ({ ...t, order: i })),
    }));
  }, [updateConfig]);

  const reorderTiles = useCallback((orderedIds: string[]) => {
    updateConfig(prev => {
      const byId = new Map(prev.tiles.map(t => [t.id, t]));
      const reordered = orderedIds
        .map((id, i) => {
          const t = byId.get(id);
          return t ? { ...t, order: i } : null;
        })
        .filter((t): t is BioTile => !!t);
      return { ...prev, tiles: reordered };
    });
  }, [updateConfig]);

  const setTheme = useCallback((theme: BioTheme) => {
    updateConfig(prev => ({ ...prev, theme }));
  }, [updateConfig]);

  return {
    config,
    loading,
    saveStatus,
    lastSaved,
    error,
    reload: doLoad,
    updateConfig,
    addTile,
    updateTile,
    updateTileConfig,
    deleteTile,
    reorderTiles,
    setTheme,
  };
}

export function bioEditorNewId() {
  const uuid = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  return String(uuid).replace(/-/g, '').slice(0, 16);
}

export function buildBioLink(slug: string): string {
  const host = typeof window !== 'undefined' ? window.location.host : 'alhijaz.co';
  // Always emit alhijaz.co in the shared link so agents can paste it anywhere,
  // even if they happen to be editing on localhost or a staging host.
  const canonicalHost = /alhijaz\.co$/i.test(host) ? host : 'alhijaz.co';
  return `https://${canonicalHost}/${slug}/bio`;
}

export async function copyBioLink(slug: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(buildBioLink(slug));
    return true;
  } catch {
    return false;
  }
}
