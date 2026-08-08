import { useCallback, useEffect, useState } from 'react';

export type PortalRoute =
  | 'beranda'
  | 'itinerary'
  | 'pembayaran'
  | 'dokumen'
  | 'al-quran'
  | 'doa-dzikir'
  | 'faq';

const PORTAL_ROUTES: PortalRoute[] = [
  'beranda',
  'itinerary',
  'pembayaran',
  'dokumen',
  'al-quran',
  'doa-dzikir',
  'faq',
];

function normalizePath(path: string) {
  return path.replace(/\/+$/, '') || '/';
}

function routePath(dashboardPath: string | undefined, next: PortalRoute) {
  if (!dashboardPath) return null;
  const base = normalizePath(dashboardPath);
  return next === 'beranda' ? base : `${base}/${next}`;
}

function routeFromPath(dashboardPath: string | undefined, path: string): PortalRoute {
  if (!dashboardPath) return 'beranda';
  const base = normalizePath(dashboardPath);
  const current = normalizePath(path);
  if (current === base) return 'beranda';
  if (!current.startsWith(`${base}/`)) return 'beranda';
  const segment = current.slice(base.length + 1).split('/')[0];
  return PORTAL_ROUTES.includes(segment as PortalRoute) ? segment as PortalRoute : 'beranda';
}

export function usePortalRoute(initial: PortalRoute = 'beranda', dashboardPath?: string) {
  const [route, setRoute] = useState<PortalRoute>(initial);

  const updateUrl = useCallback((next: PortalRoute) => {
    const nextPath = routePath(dashboardPath, next);
    if (!nextPath || window.location.pathname === nextPath) return;
    window.history.pushState(null, '', nextPath);
  }, [dashboardPath]);

  const navigate = useCallback((next: PortalRoute) => {
    setRoute(next);
    updateUrl(next);
  }, [updateUrl]);

  const goBack = useCallback(() => {
    setRoute('beranda');
    updateUrl('beranda');
  }, [updateUrl]);

  useEffect(() => {
    setRoute(routeFromPath(dashboardPath, window.location.pathname) || initial);
  }, [dashboardPath, initial]);

  useEffect(() => {
    function onPopState() {
      setRoute(routeFromPath(dashboardPath, window.location.pathname));
    }

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [dashboardPath]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [route]);

  return { route, navigate, goBack };
}
