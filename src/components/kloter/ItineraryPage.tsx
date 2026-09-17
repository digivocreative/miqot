import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Route, WifiOff } from 'lucide-react';
import type { UmrohPackage } from '@/types';
import { getPackageById } from '@/services/data-service';
import { describeLoadError } from '@/lib/loadError';
import WebItineraryView, { type ItineraryContent } from '@/components/WebItineraryView';
import KloterSubPageShell from '@/components/kloter/SubPageShell';
import type { KloterTrip } from '@/lib/kloterLanding.js';

type LoadState = 'loading' | 'ready' | 'notfound' | 'error';

// Tombol "Coba lagi" yang gagal seketika (tanpa sinyal) tetap berputar sebentar.
const RETRY_MIN_MS = 600;

// 404 / hari kosong = itinerary memang belum tersusun. Jaringan putus atau server
// bermasalah (5xx, balasan rusak) = galat yang bisa dicoba lagi — jangan dikatakan
// "belum tersedia", karena jamaah akan mengira itinerary-nya memang tidak ada.
async function readItineraryResponse(response: Response): Promise<ItineraryContent | null> {
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  const json = await response.json();
  const days: ItineraryContent | null = json?.success ? json.data : null;
  return days?.days?.length ? days : null;
}

// Itinerary kloter = itinerary paket JBU1569 yang sudah ada di app (tampilan
// yang sama dengan halaman share /:agent/:jadwalId/itinerary), dibungkus
// kerangka sub-halaman supaya tombol kembali dan judulnya konsisten.
export default function KloterItineraryPage({ trip, onBack }: { trip: KloterTrip; onBack: () => void }) {
  const [content, setContent] = useState<ItineraryContent | null>(null);
  const [paket, setPaket] = useState<UmrohPackage | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [failure, setFailure] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const packageId = trip.code;
    const minDelay = attempt > 0 ? new Promise((resolve) => window.setTimeout(resolve, RETRY_MIN_MS)) : null;
    Promise.allSettled([
      fetch(`/api/itinerary/${encodeURIComponent(packageId)}`).then(readItineraryResponse),
      getPackageById(packageId),
      minDelay,
    ]).then(([itin, pkg]) => {
      if (cancelled) return;
      setRetrying(false);
      if (pkg.status === 'fulfilled' && pkg.value) setPaket(pkg.value);
      if (itin.status === 'rejected') {
        setFailure(itin.reason);
        setState('error');
      } else if (itin.value) {
        setContent(itin.value);
        setState('ready');
      } else {
        setState('notfound');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [trip.code, attempt]);

  const retry = useCallback(() => {
    setRetrying(true);
    setAttempt((value) => value + 1);
  }, []);

  // Gagal karena sinyal: muat ulang sendiri begitu koneksi kembali.
  useEffect(() => {
    if (state !== 'error') return;
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [state, retry]);

  return (
    <KloterSubPageShell title="Itinerary" icon={Route} onBack={onBack} homePath={trip.publicPath} flush>
      <div data-itinerary-page={trip.code}>
        {state === 'notfound' ? (
          <section
            data-itinerary-empty
            className="mx-4 mt-4 rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-300">
              <Route size={22} strokeWidth={2.2} />
            </span>
            <p className="mt-3 text-sm font-bold text-gray-900 dark:text-slate-100">Itinerary belum tersedia</p>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-slate-400">
              Rencana perjalanan {trip.code} belum tersusun di sistem. Coba lagi nanti.
            </p>
          </section>
        ) : state === 'error' ? (
          <section
            role="alert"
            data-itinerary-error
            className="mx-4 mt-4 rounded-2xl border border-amber-200 bg-white p-6 text-center shadow-sm dark:border-amber-900/40 dark:bg-slate-900"
          >
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300">
              <WifiOff size={22} strokeWidth={2.2} />
            </span>
            <p className="mt-3 text-sm font-bold text-gray-900 dark:text-slate-100">Itinerary belum bisa dimuat</p>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-slate-400">{describeLoadError(failure)}</p>
            <button
              type="button"
              onClick={retry}
              disabled={retrying}
              className="mx-auto mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 text-xs font-bold text-white shadow-sm shadow-emerald-500/20 transition active:scale-95 disabled:opacity-60"
            >
              <RefreshCw size={14} strokeWidth={2.4} className={retrying ? 'animate-spin' : undefined} />
              {retrying ? 'Memuat...' : 'Coba lagi'}
            </button>
          </section>
        ) : (
          // WebItineraryView memakai palet terang sendiri (itin-*), jadi dibungkus
          // permukaan putih apa pun tema halamannya. Di HP menempel tepi layar
          // (seperti halaman share) — bingkai kartu + px-4 halaman di atas mx-3
          // kartu hari membuat teks mulai 56px dari tepi. Bingkai hanya di sm+.
          <div className="overflow-hidden bg-white sm:rounded-2xl sm:border sm:border-gray-100 sm:shadow-sm sm:dark:border-slate-800">
            <WebItineraryView
              content={content}
              loading={state === 'loading'}
              error={null}
              paket={paket}
              hideDocActions
              hideHotelCard
            />
          </div>
        )}
      </div>
    </KloterSubPageShell>
  );
}
