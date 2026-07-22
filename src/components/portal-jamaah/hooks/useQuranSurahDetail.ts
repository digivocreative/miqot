import { useCallback, useEffect, useState } from 'react';
import { fetchSurahDetail, type QuranSurahDetail } from '../lib/quranApi';

export function useQuranSurahDetail(nomor: number | null) {
  const [data, setData] = useState<QuranSurahDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const refetch = useCallback(async () => {
    if (nomor == null) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const detail = await fetchSurahDetail(nomor);
      setData(detail);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [nomor]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}
