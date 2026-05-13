import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuthHeaders } from '../components/LoginPage';
import type { CustomDomainConfig } from '../types/customDomain';

const POLL_INTERVAL_MS = 30_000;

interface UseCustomDomainOptions {
  enabled?: boolean;
}

export function useCustomDomain({ enabled = true }: UseCustomDomainOptions = {}) {
  const [config, setConfig] = useState<CustomDomainConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchConfig = useCallback(async () => {
    if (!enabled) {
      if (mountedRef.current) {
        setConfig(null);
        setError(null);
        setLoading(false);
      }
      return;
    }

    try {
      const res = await fetch('/api/agent/custom-domain', { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as CustomDomainConfig;
      if (mountedRef.current) {
        setConfig(json);
        setError(null);
      }
    } catch (err: any) {
      if (mountedRef.current) setError(err.message || 'Gagal memuat domain');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  useEffect(() => {
    if (!enabled) return;
    if (config?.status !== 'pending') return;
    const id = setInterval(fetchConfig, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [config?.status, enabled, fetchConfig]);

  return { config, loading, error, refetch: fetchConfig };
}
