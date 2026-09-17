import { useCallback, useEffect, useState } from 'react';
import { backOr, pushAppState, replaceAppState } from '@/lib/appHistory';

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

export function routeFromPath(dashboardPath: string | undefined, path: string): PortalRoute {
  if (!dashboardPath) return 'beranda';
  const base = normalizePath(dashboardPath);
  const current = normalizePath(path);
  if (current === base) return 'beranda';
  if (!current.startsWith(`${base}/`)) return 'beranda';
  const segment = current.slice(base.length + 1).split('/')[0];
  return PORTAL_ROUTES.includes(segment as PortalRoute) ? segment as PortalRoute : 'beranda';
}

/** Buka halaman portal lain sebagai entri riwayat baru (gestur back kembali ke sini). */
export function pushPortalRoute(dashboardPath: string | undefined, next: PortalRoute) {
  const nextPath = routePath(dashboardPath, next);
  if (!nextPath || window.location.pathname === nextPath) return;
  pushAppState({ portalRoute: next }, nextPath);
}

/**
 * Tombol Kembali = mundur di riwayat (sama dengan gestur back Android), bukan entri
 * 'beranda' baru — kalau didorong, back berikutnya membuka lagi halaman yang baru
 * ditinggal. Halaman yang dibuka langsung (link, app diluncurkan) diganti ke beranda;
 * `showBeranda` hanya dipanggil di jalur itu, jalur mundur diselesaikan popstate.
 */
export function backToPortalBeranda(dashboardPath: string | undefined, showBeranda: () => void) {
  backOr(() => {
    showBeranda();
    const homePath = routePath(dashboardPath, 'beranda');
    if (homePath && window.location.pathname !== homePath) replaceAppState({ portalRoute: 'beranda' }, homePath);
  });
}

export function usePortalRoute(initial: PortalRoute = 'beranda', dashboardPath?: string) {
  const [route, setRoute] = useState<PortalRoute>(initial);

  const navigate = useCallback((next: PortalRoute) => {
    setRoute(next);
    pushPortalRoute(dashboardPath, next);
  }, [dashboardPath]);

  const goBack = useCallback(() => {
    backToPortalBeranda(dashboardPath, () => setRoute('beranda'));
  }, [dashboardPath]);

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
