// Halaman share publik Detail Hotel /:slug/hotel/:hotelSlug (custom domain:
// /hotel/:hotelSlug) — dibuka calon jamaah dari link yang dibagikan agent,
// tanpa auth. Isinya dari GET /api/hotels/public/:slug (daftar-putih server:
// tanpa catatan internal, rating hanya skor bagus); OG meta disuntik server.js.
// Light-only seperti share itinerary.
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Building2, RefreshCw } from 'lucide-react';
import logoAlhijazWhite from '@/new-logo/new-logo-alhijaz-white.png';
import { trackPublicEvent } from '@/utils/analytics';
import { describeLoadError } from '@/lib/loadError';
import { AGENTS_DATA, loadAgentsFromSupabase, type AgentData } from '@/data/agents';
import HotelDetailContent, { type HotelDetailView } from './HotelDetailContent';
import { HotelSkeletonDetail } from './HotelSkeletons';
import { agentWatermarkText } from './PhotoWatermark';
import FloatingAgentBar from './FloatingAgentBar';

const MediaViewerModal = lazy(() => import('./MediaViewerModal'));

// Tombol "Coba lagi" yang gagal seketika (tanpa sinyal) tetap berputar sebentar.
const RETRY_MIN_MS = 600;

// 404 = hotel memang tidak ada (slug salah/hotel dihapus), bukan galat jaringan.
async function readHotelResponse(response: Response): Promise<HotelDetailView | null> {
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  const json = await response.json();
  return json?.success ? json.data : null;
}

export default function HotelSharePage({ slug, hotelSlug }: { slug: string; hotelSlug: string }) {
  const [hotel, setHotel] = useState<HotelDetailView | null>(null);
  const [agent, setAgent] = useState<AgentData | null>(AGENTS_DATA[slug] || null);
  const [state, setState] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading');
  const [failure, setFailure] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [viewer, setViewer] = useState<{ index: number; thumbnails: boolean } | null>(null);

  // Light-only — jangan warisi kelas `dark` dari sesi app agent di browser yang sama.
  useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, []);

  useEffect(() => {
    trackPublicEvent(slug, 'open_hotel_share', { hotel: hotelSlug });
    loadAgentsFromSupabase().then(map => setAgent(map[slug] || null)).catch(() => {});
  }, [slug, hotelSlug]);

  useEffect(() => {
    let cancelled = false;
    const minDelay = attempt > 0 ? new Promise(resolve => window.setTimeout(resolve, RETRY_MIN_MS)) : null;
    Promise.allSettled([
      fetch(`/api/hotels/public/${encodeURIComponent(hotelSlug)}`).then(readHotelResponse),
      minDelay,
    ]).then(([result]) => {
      if (cancelled) return;
      setRetrying(false);
      if (result.status === 'rejected') {
        setFailure(result.reason);
        setState('error');
      } else if (result.value) {
        setHotel(result.value);
        setState('ready');
      } else {
        setState('notfound');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [hotelSlug, attempt]);

  const retry = useCallback(() => {
    setRetrying(true);
    setAttempt(value => value + 1);
  }, []);

  // Gagal karena sinyal: muat ulang sendiri begitu koneksi kembali.
  useEffect(() => {
    if (state !== 'error') return;
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [state, retry]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto min-h-screen max-w-md bg-white pb-[calc(6rem+env(safe-area-inset-bottom))] sm:border-x sm:border-gray-100">
        {/* Bar merek — tona burgundy yang sama dengan share itinerary. Logo →
            halaman jadwal si agent (di custom domain, middleware canonicalize
            meneruskan /slug ke akarnya). */}
        <header
          className="sticky top-0 z-30 px-4 pb-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))] shadow-[0_2px_10px_rgba(40,10,8,0.28)]"
          style={{ background: 'linear-gradient(145deg, #4A0805, #8A0F0A)' }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <a href={`/${slug}`} aria-label={`Lihat jadwal ${agent?.name || 'agent'}`}>
                <img src={logoAlhijazWhite} alt="Alhijaz Indowisata" className="h-7 w-auto object-contain" />
              </a>
            </div>
            <span className="rounded-md border border-white/30 px-2 py-1 text-[10px] font-bold tracking-[0.14em] text-white/80">
              INFO HOTEL
            </span>
          </div>
        </header>

        <main className="px-4 pt-4">
          {state === 'loading' && <HotelSkeletonDetail />}

          {state === 'error' && (
            <div role="alert" className="mt-10 rounded-2xl border border-gray-100 p-6 text-center">
              <p className="text-sm font-bold text-gray-900">Info hotel belum bisa dimuat</p>
              <p className="mt-1 text-xs leading-5 text-gray-500">{describeLoadError(failure)}</p>
              <button
                type="button"
                onClick={retry}
                disabled={retrying}
                className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-burgundy px-5 text-xs font-bold text-white disabled:opacity-60"
              >
                <RefreshCw size={14} strokeWidth={2.4} className={retrying ? 'animate-spin' : undefined} />
                {retrying ? 'Memuat...' : 'Coba lagi'}
              </button>
            </div>
          )}

          {state === 'notfound' && (
            <div className="mt-10 rounded-2xl border border-gray-100 p-6 text-center">
              <Building2 size={32} className="mx-auto text-gray-300" />
              <p className="mt-2 text-sm font-bold text-gray-900">Hotel tidak ditemukan</p>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                Link ini mungkin sudah tidak berlaku. Silakan lihat jadwal umroh untuk info lengkap.
              </p>
              <a
                href={`/${slug}`}
                className="mt-4 inline-block rounded-xl bg-gradient-burgundy px-4 py-2.5 text-xs font-bold text-white"
              >
                Lihat jadwal umroh
              </a>
            </div>
          )}

          {state === 'ready' && hotel && (
            <HotelDetailContent
              detail={hotel}
              onOpenViewer={index => setViewer({ index, thumbnails: false })}
              // Tak ada halaman "Semua Media" di sini: lightbox + strip thumbnail
              // sudah cukup untuk menelusuri seluruh foto.
              onOpenAll={index => setViewer({ index, thumbnails: true })}
            />
          )}
        </main>
      </div>

      <AnimatePresence>
        {viewer && hotel && (
          <Suspense fallback={null}>
            <MediaViewerModal
              media={hotel.media}
              initialIndex={viewer.index}
              label={hotel.name}
              watermark={agentWatermarkText(slug)}
              showThumbnails={viewer.thumbnails}
              allowSave={false}
              onClose={() => setViewer(null)}
            />
          </Suspense>
        )}
      </AnimatePresence>

      {agent?.phone && (
        <FloatingAgentBar
          agent={agent}
          slug={slug}
          message={`Assalamualaikum, saya mau tanya soal hotel ${hotel?.name || ''}`.trim()}
          eventName="wa_click_hotel"
          eventMeta={{ hotel: hotelSlug }}
        />
      )}
    </div>
  );
}
