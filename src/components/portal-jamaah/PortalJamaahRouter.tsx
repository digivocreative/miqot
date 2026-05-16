import { useEffect } from 'react';
import LandingPage from './pages/LandingPage';
import AuthConsumePage from './pages/AuthConsumePage';
import PortalDashboard from './pages/PortalDashboard';
import { getPortalSession } from './lib/portalSession';

interface Props {
  slug: string;
  subPath: string[];
}

const PORTAL_MAGIC_CODE_REGEX = /^(?=.*[a-z])(?=.*[2-9])[a-z2-9]{5}$/i;

function isSessionForSlug(slug: string) {
  const session = getPortalSession();
  return session && session.slug === slug ? session : null;
}

function getDashboardPath(slug: string, accessCode?: string) {
  return accessCode && PORTAL_MAGIC_CODE_REGEX.test(accessCode)
    ? `/${slug}/jamaah/${accessCode}/dashboard`
    : `/${slug}/jamaah/dashboard`;
}

function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8 font-sans">
      <section className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold text-slate-950">Halaman tidak ditemukan</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Pastikan alamat portal yang Anda buka sudah benar.</p>
      </section>
    </div>
  );
}

export default function PortalJamaahRouter({ slug, subPath }: Props) {
  useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, []);

  const session = isSessionForSlug(slug);

  if (subPath.length === 0) {
    if (session) {
      window.location.replace(getDashboardPath(slug, session.access_code));
      return null;
    }
    return <LandingPage slug={slug} />;
  }

  if (subPath.length === 2 && PORTAL_MAGIC_CODE_REGEX.test(subPath[0]) && subPath[1] === 'dashboard') {
    if (!session) {
      window.location.replace(`/${slug}/jamaah/${subPath[0]}`);
      return null;
    }
    return <PortalDashboard slug={slug} session={session} />;
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
    const dashboardPath = getDashboardPath(slug, session.access_code);
    if (dashboardPath !== `/${slug}/jamaah/dashboard`) {
      window.location.replace(dashboardPath);
      return null;
    }
    return <PortalDashboard slug={slug} session={session} />;
  }

  return <NotFoundPage />;
}
