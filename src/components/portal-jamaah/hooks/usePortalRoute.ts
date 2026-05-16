import { useCallback, useEffect, useState } from 'react';

export type PortalRoute =
  | 'beranda'
  | 'perjalanan'
  | 'pembayaran'
  | 'dokumen'
  | 'perlengkapan'
  | 'manasik'
  | 'faq';

export function usePortalRoute(initial: PortalRoute = 'beranda') {
  const [route, setRoute] = useState<PortalRoute>(initial);

  const navigate = useCallback((next: PortalRoute) => {
    setRoute(next);
  }, []);

  const goBack = useCallback(() => {
    setRoute('beranda');
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [route]);

  return { route, navigate, goBack };
}
