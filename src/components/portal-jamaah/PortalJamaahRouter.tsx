import LandingPage from './pages/LandingPage';
import AuthConsumePage from './pages/AuthConsumePage';
import PortalDashboard from './pages/PortalDashboard';
import { getPortalSession } from './lib/portalSession';
import type { PortalRoute } from './hooks/usePortalRoute';
import { usePortalTheme } from './hooks/usePortalTheme';
import { Card, PortalPageShell } from './ui';

interface Props {
  slug: string;
  subPath: string[];
}

const PORTAL_MAGIC_CODE_REGEX = /^(?=.*[a-z])(?=.*[2-9])[a-z2-9]{5,6}$/i;
const PORTAL_DASHBOARD_ROUTES: PortalRoute[] = [
  'beranda',
  'itinerary',
  'pembayaran',
  'dokumen',
  'al-quran',
  'doa-dzikir',
  'faq',
];

function isSessionForSlug(slug: string) {
  const session = getPortalSession();
  return session && session.slug === slug ? session : null;
}

function getDashboardPath(slug: string, accessCode?: string) {
  return accessCode && PORTAL_MAGIC_CODE_REGEX.test(accessCode)
    ? `/${slug}/jamaah/${accessCode}/dashboard`
    : `/${slug}/jamaah/dashboard`;
}

function parseDashboardRoute(segment?: string): PortalRoute | null {
  if (!segment) return 'beranda';
  return PORTAL_DASHBOARD_ROUTES.includes(segment as PortalRoute) ? segment as PortalRoute : null;
}

function appendDashboardRoute(path: string, route: PortalRoute) {
  return route === 'beranda' ? path : `${path}/${route}`;
}

function NotFoundPage() {
  return (
    <PortalPageShell className="flex items-center justify-center px-4 py-8 font-sans">
      <Card className="w-full max-w-lg p-6 text-center">
        <h1 className="font-display text-xl text-ink">Halaman tidak ditemukan</h1>
        <p className="mt-2 text-sm leading-6 text-ink/60">Pastikan alamat portal yang Anda buka sudah benar.</p>
      </Card>
    </PortalPageShell>
  );
}

export default function PortalJamaahRouter({ slug, subPath }: Props) {
  usePortalTheme();

  const session = isSessionForSlug(slug);

  if (subPath.length === 0) {
    if (session) {
      window.location.replace(getDashboardPath(slug, session.access_code));
      return null;
    }
    return <LandingPage slug={slug} />;
  }

  if ((subPath.length === 2 || subPath.length === 3) && PORTAL_MAGIC_CODE_REGEX.test(subPath[0]) && subPath[1] === 'dashboard') {
    if (!session) {
      window.location.replace(`/${slug}/jamaah/${subPath[0]}`);
      return null;
    }
    const initialRoute = parseDashboardRoute(subPath[2]);
    if (!initialRoute) return <NotFoundPage />;
    const dashboardPath = getDashboardPath(slug, subPath[0]);
    return <PortalDashboard slug={slug} session={session} initialRoute={initialRoute} dashboardPath={dashboardPath} />;
  }

  if (subPath.length === 1 && PORTAL_MAGIC_CODE_REGEX.test(subPath[0])) {
    if (session) {
      window.location.replace(`/${slug}/jamaah/${subPath[0]}/dashboard`);
      return null;
    }
    return <AuthConsumePage slug={slug} token={subPath[0]} />;
  }

  if (subPath[0] === 'auth' && subPath[1]) {
    return <AuthConsumePage slug={slug} token={subPath[1]} />;
  }

  if (subPath[0] === 'dashboard') {
    if (!session) {
      window.location.replace(`/${slug}/jamaah`);
      return null;
    }
    const initialRoute = parseDashboardRoute(subPath[1]);
    if (!initialRoute || subPath.length > 2) return <NotFoundPage />;
    const dashboardPath = getDashboardPath(slug, session.access_code);
    if (dashboardPath !== `/${slug}/jamaah/dashboard`) {
      window.location.replace(appendDashboardRoute(dashboardPath, initialRoute));
      return null;
    }
    return <PortalDashboard slug={slug} session={session} initialRoute={initialRoute} dashboardPath={dashboardPath} />;
  }

  return <NotFoundPage />;
}
