import { useEffect, useState } from 'react';
import { Route } from 'lucide-react';
import type { UmrohPackage } from '@/types';
import { getPackageById } from '@/services/data-service';
import WebItineraryView, { type ItineraryContent } from '@/components/WebItineraryView';
import KloterSubPageShell from '@/components/kloter/SubPageShell';
import type { KloterTrip } from '@/lib/kloterLanding.js';

type LoadState = 'loading' | 'ready' | 'notfound';

// Itinerary kloter = itinerary paket JBU1569 yang sudah ada di app (tampilan
// yang sama dengan halaman share /:agent/:jadwalId/itinerary), dibungkus
// kerangka sub-halaman supaya tombol kembali dan judulnya konsisten.
export default function KloterItineraryPage({ trip, onBack }: { trip: KloterTrip; onBack: () => void }) {
  const [content, setContent] = useState<ItineraryContent | null>(null);
  const [paket, setPaket] = useState<UmrohPackage | null>(null);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    let cancelled = false;
    const packageId = trip.code;
    Promise.allSettled([
      fetch(`/api/itinerary/${encodeURIComponent(packageId)}`).then((response) => response.json()),
      getPackageById(packageId),
    ]).then(([itin, pkg]) => {
      if (cancelled) return;
      const days: ItineraryContent | null =
        itin.status === 'fulfilled' && itin.value?.success ? itin.value.data : null;
      if (pkg.status === 'fulfilled' && pkg.value) setPaket(pkg.value);
      if (days?.days?.length) {
        setContent(days);
        setState('ready');
      } else {
        setState('notfound');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [trip.code]);

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
