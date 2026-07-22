import { useCallback, useEffect, useState } from 'react';
import { fetchSurahList, type QuranSurahMeta } from '../lib/quranApi';

export function useQuranSurahList() {
  const [data, setData] = useState<QuranSurahMeta[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      const list = await fetchSurahList();
      setData(list);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}
