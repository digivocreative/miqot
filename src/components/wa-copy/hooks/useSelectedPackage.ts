import { useCallback, useEffect, useState } from 'react';
import { getPackages } from '@/services';
import type { UmrohPackage } from '@/types/umroh-package';
import { buildPackageContext } from '../lib/placeholders';
import type { PackageContext } from '../lib/types';

export interface UseSelectedPackage {
  packages: UmrohPackage[];
  selected: UmrohPackage | null;
  selectedCtx: PackageContext | null;
  loading: boolean;
  error: unknown;
  select: (jadwalId: string | null) => void;
  reload: () => Promise<void>;
}

/**
 * Loads umroh packages (cached service) and exposes the currently selected
 * package plus its derived placeholder context for the caption engine.
 */
export function useSelectedPackage(): UseSelectedPackage {
  const [packages, setPackages] = useState<UmrohPackage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getPackages({ yearCode: '1448' });
      if (result.success) {
        setPackages(result.packages);
        setError(null);
      } else {
        setError(result.error || 'Gagal memuat paket');
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const selected = selectedId ? packages.find(p => p.jadwalId === selectedId) || null : null;
  const selectedCtx = selected ? buildPackageContext(selected) : null;
  const select = useCallback((jadwalId: string | null) => setSelectedId(jadwalId), []);

  return { packages, selected, selectedCtx, loading, error, select, reload };
}
