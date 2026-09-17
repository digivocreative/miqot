// Halaman share publik /:slug/:packageId/itinerary — dilihat jamaah, tanpa auth.
// Light-only, tona Alhijaz (spec 2026-07-30). OG meta disuntik server.js (rute SSR).
import { useCallback, useEffect, useState } from 'react';
import { CalendarRange, ChevronLeft, Moon, Plane, RefreshCw } from 'lucide-react';
import type { UmrohPackage } from '@/types';
import logoAlhijazWhite from '@/new-logo/new-logo-alhijaz-white.png';
import { trackPublicEvent } from '@/utils/analytics';
import { describeLoadError } from '@/lib/loadError';
import { canGoBackInApp } from '@/lib/appHistory';
import { getPackageById } from '@/services/data-service';
import { AGENTS_DATA, loadAgentsFromSupabase, type AgentData } from '@/data/agents';
import WebItineraryView, { type ItineraryContent } from '../WebItineraryView';
import FloatingAgentBar from '../FloatingAgentBar';

// Tombol "Coba lagi" yang gagal seketika (tanpa sinyal) tetap berputar sebentar.
const RETRY_MIN_MS = 600;

// 404 / hari kosong = itinerary memang belum tersusun (404 lembut, spec bagian State).
// Jaringan putus atau server bermasalah = galat yang bisa dicoba lagi, bukan "belum tersedia".
async function readItineraryResponse(response: Response): Promise<ItineraryContent | null> {
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  const json = await response.json();
  const days: ItineraryContent | null = json?.success ? json.data : null;
  return days?.days?.length ? days : null;
}

// Tombol kembali hanya kalau halaman ini dibuka dari halaman lain di situs yang sama
// (mis. halaman paket) dan ada riwayat untuk dituju. Link share yang dibuka langsung dari
// WhatsApp tidak punya "kembali" yang bermakna.
function cameFromSameSite(): boolean {
  try {
    if (canGoBackInApp()) return true;
    return (
      !!document.referrer &&
      new URL(document.referrer).origin === window.location.origin &&
      window.history.length > 1
    );
  } catch {
    return false;
  }
}

export default function ItinerarySharePage({ slug, packageId }: { slug: string; packageId: string }) {
  const [content, setContent] = useState<ItineraryContent | null>(null);
  const [paket, setPaket] = useState<UmrohPackage | null>(null);
  const [agent, setAgent] = useState<AgentData | null>(AGENTS_DATA[slug] || null);
  const [state, setState] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading');
  const [failure, setFailure] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [canGoBack] = useState(cameFromSameSite);
  // Bar logo melayang muncul setelah baris logo hero tergulung keluar viewport
  const [floatBar, setFloatBar] = useState(false);

  useEffect(() => {
    const onScroll = () => setFloatBar(window.scrollY > 64);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Halaman share light-only — jangan warisi kelas `dark` dari sesi app agent di browser yang sama
  useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, []);

  useEffect(() => {
    trackPublicEvent(slug, 'open_itinerary_share', { paket: packageId });
    loadAgentsFromSupabase().then(map => setAgent(map[slug] || null)).catch(() => {});
  }, [slug, packageId]);

  useEffect(() => {
    let cancelled = false;
    const minDelay = attempt > 0 ? new Promise(resolve => window.setTimeout(resolve, RETRY_MIN_MS)) : null;
    Promise.allSettled([
      fetch(`/api/itinerary/${encodeURIComponent(packageId)}`).then(readItineraryResponse),
      getPackageById(packageId),
      minDelay,
    ]).then(([itin, pkg]) => {
      if (cancelled) return;
      setRetrying(false);
      const p = pkg.status === 'fulfilled' ? pkg.value : null;
      if (p) setPaket(p);
      if (itin.status === 'rejected') {
        setFailure(itin.reason);
        setState('error');
      } else if (itin.value) {
        setContent(itin.value);
        setState('ready');
      } else {
        // Share tanpa itinerary tersusun = 404 lembut (spec, bagian State)
        setState('notfound');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [slug, packageId, attempt]);

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

  const backButton = canGoBack ? (
    <button
      type="button"
      onClick={() => window.history.back()}
      aria-label="Kembali"
      className="touch-hit relative flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-white/15 text-white transition-colors hover:bg-white/25 active:scale-95"
    >
      <ChevronLeft size={18} strokeWidth={2.4} />
    </button>
  ) : null;

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-white">
        <div className="mx-auto max-w-md px-4 pt-[calc(2.5rem+env(safe-area-inset-top))]">
          <div className="h-36 animate-pulse rounded-2xl bg-itin-canvas" />
          <div className="mt-4 h-20 animate-pulse rounded-2xl bg-itin-canvas" />
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-itin-canvas px-4">
        <div role="alert" className="w-full max-w-sm rounded-2xl border border-itin-line bg-white p-6 text-center">
          <p className="text-sm font-bold text-itin-ink">Itinerary belum bisa dimuat</p>
          <p className="mt-1 text-xs leading-5 text-itin-ink3">{describeLoadError(failure)}</p>
          <button
            type="button"
            onClick={retry}
            disabled={retrying}
            className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-burgundy px-5 text-xs font-bold text-white disabled:opacity-60"
          >
            <RefreshCw size={14} strokeWidth={2.4} className={retrying ? 'animate-spin' : undefined} />
            {retrying ? 'Memuat...' : 'Coba lagi'}
          </button>
          <a href={`/${slug}/${packageId}`} className="mt-3 block text-xs font-semibold text-itin-ink3 underline underline-offset-2">
            Buka halaman paket
          </a>
        </div>
      </div>
    );
  }

  if (state === 'notfound') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-itin-canvas px-4">
        <div className="w-full max-w-sm rounded-2xl border border-itin-line bg-white p-6 text-center">
          <p className="text-sm font-bold text-itin-ink">Itinerary belum tersedia</p>
          <p className="mt-1 text-xs leading-5 text-itin-ink3">
            Silakan buka halaman paket untuk info lengkap.
          </p>
          <a
            href={`/${slug}/${packageId}`}
            className="mt-4 inline-block rounded-xl bg-gradient-burgundy px-4 py-2.5 text-xs font-bold text-white"
          >
            Buka halaman paket
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F1EA]">
      <div className="mx-auto max-w-md pb-[calc(6rem+env(safe-area-inset-bottom))]">
        {/* Bar logo melayang — overlay terpisah yang baru muncul setelah baris logo hero
            lewat dari viewport, jadi hero tetap satu blok utuh (tak ada sambungan terlihat) */}
        <div
          className={`fixed inset-x-0 top-0 z-30 transition-all duration-200 ${
            floatBar ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'}`}
        >
          <div
            className="relative mx-auto max-w-md overflow-hidden px-5 pb-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))] shadow-[0_2px_10px_rgba(40,10,8,0.28)]"
            style={{ background: 'linear-gradient(145deg, #4A0805, #8A0F0A)' }}
          >
            {/* Pakai ulang pattern hero (#itin-hero-pattern) — hero selalu ter-render di state ready */}
            <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full">
              <rect width="100%" height="100%" fill="url(#itin-hero-pattern)" />
            </svg>
            <div className="relative flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                {backButton}
                <a href={`/${slug}`} aria-label={`Lihat jadwal ${agent?.name || 'agent'}`}>
                  <img src={logoAlhijazWhite} alt="" aria-hidden className="h-6 w-auto object-contain" />
                </a>
              </div>
              <span className="rounded-md border border-white/30 px-2 py-1 text-[10px] font-bold tracking-[0.14em] text-white/80">
                ITINERARY
              </span>
            </div>
          </div>
        </div>
        {/* Hero burgundy gelap (900→700, lebih dalam dari token global) + pola geometri islami */}
        <header
          className="relative overflow-hidden px-5 pb-5 pt-[calc(1.5rem+env(safe-area-inset-top))] text-white"
          style={{ background: 'linear-gradient(145deg, #4A0805, #8A0F0A)' }}
        >
          <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full">
            <defs>
              <pattern id="itin-hero-pattern" width="72" height="72" patternUnits="userSpaceOnUse">
                {/* Bintang 8: dua persegi bertumpuk, satu diputar 45° (rub el hizb) — samar */}
                <rect x="18" y="18" width="36" height="36" fill="none" stroke="white" strokeOpacity="0.045" />
                <rect x="18" y="18" width="36" height="36" fill="none" stroke="white" strokeOpacity="0.045" transform="rotate(45 36 36)" />
                {/* Belah ketupat kecil di tiap sudut tile — membentuk silang saat berulang */}
                <rect x="-6" y="-6" width="12" height="12" fill="none" stroke="white" strokeOpacity="0.035" transform="rotate(45 0 0)" />
                <rect x="66" y="-6" width="12" height="12" fill="none" stroke="white" strokeOpacity="0.035" transform="rotate(45 72 0)" />
                <rect x="-6" y="66" width="12" height="12" fill="none" stroke="white" strokeOpacity="0.035" transform="rotate(45 0 72)" />
                <rect x="66" y="66" width="12" height="12" fill="none" stroke="white" strokeOpacity="0.035" transform="rotate(45 72 72)" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#itin-hero-pattern)" />
          </svg>
          <div className="relative">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              {backButton}
              {/* Logo → halaman jadwal si agent (di custom domain, middleware
                  canonicalize meneruskan /slug ke akarnya) */}
              <a href={`/${slug}`} aria-label={`Lihat jadwal ${agent?.name || 'agent'}`}>
                <img src={logoAlhijazWhite} alt="Alhijaz Indowisata" className="h-7 w-auto object-contain" />
              </a>
            </div>
            <span className="rounded-md border border-white/30 px-2 py-1 text-[10px] font-bold tracking-[0.14em] text-white/80">
              ITINERARY
            </span>
          </div>
          <h1 className="mt-3 text-[17px] font-bold leading-[1.5]">{paket?.nama || packageId}</h1>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {paket?.keberangkatan?.tgl && (
              <span className="flex items-center gap-1.5 rounded-lg bg-white/15 px-2 py-1 text-[11px] font-semibold">
                <CalendarRange size={11} className="text-white/80" />
                {new Date(paket.keberangkatan.tgl).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
            {paket?.maskapai && (
              <span className="flex items-center gap-1.5 rounded-lg bg-white/15 px-2 py-1 text-[11px] font-semibold">
                <Plane size={11} className="text-white/80" />
                <span className="capitalize">{paket.maskapai.toLowerCase()}</span>
              </span>
            )}
            {content && content.days.length > 1 && (
              <span className="flex items-center gap-1.5 rounded-lg bg-white/15 px-2 py-1 text-[11px] font-semibold">
                <Moon size={11} className="text-white/80" /> {content.days.length} hari
              </span>
            )}
          </div>
          </div>
        </header>

        <WebItineraryView
          content={content}
          loading={false}
          error={null}
          paket={paket}
          onPdfDownload={() => trackPublicEvent(slug, 'itinerary_pdf_download_share', { paket: packageId })}
        />

        <div className="px-4">
          <p className="mt-3 text-center text-[10.5px] leading-[1.45] text-itin-ink3">
            Jadwal dapat berubah menyesuaikan kondisi di lapangan.
          </p>
        </div>
      </div>

      {/* Profil agent melayang — komponen yang sama dengan jadwal (FloatingAgentBar) */}
      {agent?.phone && (
        <FloatingAgentBar
          agent={agent}
          slug={slug}
          tone="burgundy"
          message={`Assalamualaikum, saya mau tanya terkait paket ${paket?.nama || packageId}`}
          eventName="wa_click_itinerary"
          eventMeta={{ paket: packageId }}
        />
      )}
    </div>
  );
}
