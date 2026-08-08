import { useEffect, useRef, lazy, Suspense } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { trackPublicEvent } from '@/utils/analytics';
import type { PortalSession } from '../lib/portalSession';
import { usePortalMe } from '../hooks/usePortalMe';
import { usePortalTheme } from '../hooks/usePortalTheme';
import { usePortalRoute, type PortalRoute } from '../hooks/usePortalRoute';
import { portalApi } from '../lib/portalApi';
import { clearPortalSession } from '../lib/portalSession';
import { clearPortalMeCache } from '../hooks/usePortalMe';
import StickyWhatsAppCta from '../components/StickyWhatsAppCta';
import { PortalPageShell, Card, Button } from '../ui';

// Portal sub-pages are code-split — only the active route's chunk loads.
const BerandaPage = lazy(() => import('./BerandaPage'));
const ItineraryPage = lazy(() => import('./ItineraryPage'));
const PembayaranPage = lazy(() => import('./PembayaranPage'));
const DokumenPage = lazy(() => import('./DokumenPage'));
const AlQuranPage = lazy(() => import('./AlQuranPage'));
const DoaDzikirPage = lazy(() => import('./DoaDzikirPage'));
const FaqPage = lazy(() => import('./FaqPage'));

// Each portal tab maps to a whitelisted public "open" event, fired on route change.
const TAB_OPEN_EVENTS: Record<PortalRoute, string> = {
  beranda: 'open_portal_beranda',
  itinerary: 'open_portal_itinerary',
  pembayaran: 'open_portal_pembayaran',
  dokumen: 'open_portal_dokumen',
  'al-quran': 'open_portal_alquran',
  'doa-dzikir': 'open_portal_doa_dzikir',
  faq: 'open_portal_faq',
};

function LoadingScreen() {
  return (
    <PortalPageShell className="flex items-center justify-center px-4 py-8">
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-burgundy-700/8 text-burgundy-700">
          <Loader2 className="h-8 w-8 animate-spin" strokeWidth={2} />
        </div>
        <p className="mt-4 text-sm font-bold text-ink">Memuat portal jamaah...</p>
      </div>
    </PortalPageShell>
  );
}

function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <PortalPageShell className="flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-lg p-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15 text-amber-700">
          <AlertCircle className="h-7 w-7" strokeWidth={2} />
        </div>
        <h1 className="mt-4 text-xl font-bold text-ink">Data belum bisa dimuat</h1>
        <p className="mt-2 text-sm leading-6 text-ink/70">
          Coba muat ulang. Jika masih gagal, hubungi agent untuk memastikan sesi Anda masih aktif.
        </p>
        <Button type="button" variant="primary" onClick={onRetry} className="mt-5">
          Muat Ulang
        </Button>
      </Card>
    </PortalPageShell>
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

  // Fire once when the authenticated portal dashboard first mounts.
  const portalOpenTracked = useRef(false);
  useEffect(() => {
    if (portalOpenTracked.current) return;
    portalOpenTracked.current = true;
    trackPublicEvent(slug, 'open_portal');
  }, [slug]);

  // Fire a per-tab open event on actual route change (ref-guarded against re-renders).
  const lastTrackedRoute = useRef<PortalRoute | null>(null);
  useEffect(() => {
    if (lastTrackedRoute.current === route) return;
    lastTrackedRoute.current = route;
    trackPublicEvent(slug, TAB_OPEN_EVENTS[route]);
  }, [route, slug]);

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
        {route === 'beranda' && <BerandaPage slug={slug} data={data} onNavigate={navigate} onLogout={handleLogout} />}
        {route === 'itinerary' && <ItineraryPage data={data} onBack={goBack} />}
        {route === 'pembayaran' && <PembayaranPage data={data} onBack={goBack} />}
        {route === 'dokumen' && <DokumenPage data={data} onBack={goBack} />}
        {route === 'al-quran' && <AlQuranPage slug={slug} data={data} onBack={goBack} />}
        {route === 'doa-dzikir' && <DoaDzikirPage data={data} onBack={goBack} />}
        {route === 'faq' && <FaqPage data={data} onBack={goBack} />}
      </Suspense>
      <StickyWhatsAppCta slug={slug} tab={route} agent={data.agent} booking={data.booking} initiator={initiator} />
    </div>
  );
}
