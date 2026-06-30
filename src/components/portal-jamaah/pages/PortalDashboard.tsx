import { useEffect, lazy, Suspense } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import type { PortalSession } from '../lib/portalSession';
import { usePortalMe } from '../hooks/usePortalMe';
import { usePortalTheme } from '../hooks/usePortalTheme';
import { usePortalRoute, type PortalRoute } from '../hooks/usePortalRoute';
import { portalApi } from '../lib/portalApi';
import { clearPortalSession } from '../lib/portalSession';
import { clearPortalMeCache } from '../hooks/usePortalMe';
import StickyWhatsAppCta from '../components/StickyWhatsAppCta';

// Portal sub-pages are code-split — only the active route's chunk loads.
const BerandaPage = lazy(() => import('./BerandaPage'));
const PerjalananPage = lazy(() => import('./PerjalananPage'));
const PembayaranPage = lazy(() => import('./PembayaranPage'));
const DokumenPage = lazy(() => import('./DokumenPage'));
const PerlengkapanPage = lazy(() => import('./PerlengkapanPage'));
const ManasikSpiritualPage = lazy(() => import('./ManasikSpiritualPage'));
const FaqPage = lazy(() => import('./FaqPage'));

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 px-4 py-8 dark:from-slate-900 dark:to-slate-950">
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
          <Loader2 className="h-8 w-8 animate-spin" strokeWidth={2} />
        </div>
        <p className="mt-4 text-sm font-bold text-gray-700 dark:text-slate-200">Memuat portal jamaah...</p>
      </div>
    </div>
  );
}

function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 px-4 py-8 dark:from-slate-900 dark:to-slate-950">
      <section className="w-full max-w-lg rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
          <AlertCircle className="h-7 w-7" strokeWidth={2} />
        </div>
        <h1 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">Data belum bisa dimuat</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-slate-300">
          Coba muat ulang. Jika masih gagal, hubungi agent untuk memastikan sesi Anda masih aktif.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white shadow-md shadow-emerald-500/20"
        >
          Muat Ulang
        </button>
      </section>
    </div>
  );
}

export default function PortalDashboard({
  slug,
  session,
  initialRoute,
  dashboardPath,
}: {
  slug: string;
  session: PortalSession;
  initialRoute: PortalRoute;
  dashboardPath: string;
}) {
  usePortalTheme();
  const { route, navigate, goBack } = usePortalRoute(initialRoute, dashboardPath);
  const { data, loading, error, refetch } = usePortalMe();

  async function handleLogout() {
    try {
      await portalApi.logout();
    } catch {
      // session may already be gone
    } finally {
      clearPortalMeCache();
      clearPortalSession();
      window.location.href = `/${data?.agent?.slug || slug}/jamaah`;
    }
  }

  const initiatorBeforeReady = data?.jamaah.find((j) => j.is_initiator) || data?.jamaah[0];
  const paketName = data?.booking.jadwal?.jadwal_nama || data?.booking.paket || '';
  const maskapai = data?.schedule?.maskapai || '';
  useEffect(() => {
    if (!initiatorBeforeReady) return;
    const parts = [initiatorBeforeReady.nama, paketName, maskapai].filter(Boolean);
    if (parts.length) document.title = parts.join(' | ');
  }, [initiatorBeforeReady, paketName, maskapai]);

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen onRetry={refetch} />;
  if (!data) return null;

  const initiator = data.jamaah.find((j) => j.is_initiator) || data.jamaah[0];

  return (
    <div data-agent-slug={slug} data-booking-id={session.id_umroh}>
      <Suspense fallback={<LoadingScreen />}>
        {route === 'beranda' && <BerandaPage data={data} onNavigate={navigate} onLogout={handleLogout} />}
        {route === 'perjalanan' && <PerjalananPage data={data} onBack={goBack} />}
        {route === 'pembayaran' && <PembayaranPage data={data} onBack={goBack} />}
        {route === 'dokumen' && <DokumenPage data={data} onBack={goBack} />}
        {route === 'perlengkapan' && <PerlengkapanPage data={data} onBack={goBack} />}
        {route === 'manasik' && <ManasikSpiritualPage data={data} onBack={goBack} />}
        {route === 'faq' && <FaqPage data={data} onBack={goBack} />}
      </Suspense>
      <StickyWhatsAppCta agent={data.agent} booking={data.booking} initiator={initiator} />
    </div>
  );
}
