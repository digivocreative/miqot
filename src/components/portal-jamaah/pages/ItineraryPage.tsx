import { useEffect, useState } from 'react';
import { AlertCircle, BookOpenCheck, Map, RefreshCw } from 'lucide-react';
import type { UmrohPackage } from '@/types';
import { trackPublicEvent } from '@/utils/analytics';
import { describeLoadError } from '@/lib/loadError';
import { getPackageById } from '@/services/data-service';
import PortalBackBar from '../components/PortalBackBar';
import WebItineraryView, { type ItineraryContent } from '../../WebItineraryView';
import type { PortalMeData } from '../hooks/usePortalMe';
import { formatLongDate, formatPortalTime } from '../utils/formatDate';
import { Card, IconTile, PortalPageShell, SectionLabel } from '../ui';

/**
 * Itinerary jamaah memakai model yang sama dengan Jadwal (WebItineraryView):
 * JourneyStrip + rail harian berfoto + FlightCard + HotelCard. Halaman
 * Perjalanan lama menampilkan isi yang sama dengan komponen portal sendiri
 * yang lebih miskin, jadi dilebur ke sini.
 */
// Tombol "Coba lagi" yang gagal seketika (tanpa sinyal) tetap memutar kerangka muat sebentar.
const RETRY_MIN_MS = 600;

function asItineraryContent(raw: unknown): ItineraryContent | null {
  const days = (raw as { days?: unknown[] } | null)?.days;
  return Array.isArray(days) && days.length ? (raw as ItineraryContent) : null;
}

export default function ItineraryPage({
  slug,
  data,
  onBack,
}: {
  slug: string;
  data: PortalMeData;
  onBack: () => void;
}) {
  const schedule = data.schedule;
  const jadwalId = data.booking.jadwal?.jadwal_id ? String(data.booking.jadwal.jadwal_id) : '';
  const yearCode = data.booking.jadwal?.year_code ? String(data.booking.jadwal.year_code) : undefined;
  const pdfUrl = schedule?.itinerary_url || null;

  // /me sudah membawa `itineraries.content` — sumber yang sama dengan Jadwal —
  // jadi hari-harinya bisa langsung dirender tanpa menunggu fetch tambahan.
  const seeded = asItineraryContent(schedule?.itinerary);
  const [content, setContent] = useState<ItineraryContent | null>(seeded);
  const [paket, setPaket] = useState<UmrohPackage | null>(null);
  const [loading, setLoading] = useState(!seeded);
  // Hanya permintaan yang gagal sampai ke server (tanpa sinyal). Balasan server yang
  // bukan 2xx tetap jatuh ke tampilan "belum tersedia" + PDF milik WebItineraryView.
  const [networkError, setNetworkError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!jadwalId) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    // Paket dipakai FlightCard / HotelCard / JourneyStrip. year_code booking
    // dikirim eksplisit — default data-service belum tentu tahun jadwal ini.
    getPackageById(jadwalId, yearCode ? { yearCode } : {})
      .then((pkg) => { if (!cancelled && pkg) setPaket(pkg); })
      .catch(() => {});

    if (seeded) return () => { cancelled = true; };

    const url = new URL(`/api/itinerary/${encodeURIComponent(jadwalId)}`, window.location.origin);
    if (pdfUrl) url.searchParams.set('pdfUrl', pdfUrl);
    const minDelay = attempt > 0 ? new Promise((resolve) => window.setTimeout(resolve, RETRY_MIN_MS)) : null;
    Promise.allSettled([
      fetch(url.toString()).then((res) => (res.ok ? res.json().catch(() => null) : null)),
      minDelay,
    ]).then(([outcome]) => {
      if (cancelled) return;
      if (outcome.status === 'rejected') {
        setNetworkError(outcome.reason);
      } else {
        setNetworkError(null);
        setContent(asItineraryContent(outcome.value?.data));
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [jadwalId, yearCode, pdfUrl, seeded, attempt]);

  // Sinyal kembali: coba muat lagi sendiri.
  useEffect(() => {
    if (!networkError || content) return;
    const retry = () => setAttempt((value) => value + 1);
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [networkError, content]);

  return (
    <PortalPageShell>
      <PortalBackBar title="Itinerary" onBack={onBack} icon={Map} iconClassName="bg-burgundy-700/8 text-burgundy-700" />
      <main className="mx-auto w-full max-w-lg space-y-4 pb-24 pt-4">
        {schedule?.manasik_tgl && (
          <section className="px-4">
            <SectionLabel className="mb-3">Manasik</SectionLabel>
            <Card className="flex items-center gap-3 p-4">
              <IconTile tint="neutral" size="md">
                <BookOpenCheck className="h-5 w-5" strokeWidth={2} />
              </IconTile>
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink">Manasik Bersama</p>
                <p className="mt-0.5 text-xs leading-5 text-ink/70">
                  {formatLongDate(schedule.manasik_tgl)}
                  {schedule.manasik_jam ? ` · ${formatPortalTime(schedule.manasik_jam)}` : ''}
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-ink/50">Lokasi & detail diinfokan agent</p>
              </div>
            </Card>
          </section>
        )}

        <section className="px-4">
          <SectionLabel className="mb-3">Rencana Perjalanan</SectionLabel>
          {/* Card membungkus agar kanvas itinerary (#F6F1EA) tidak beradu
              langsung dengan kanvas portal; isinya persis model Jadwal. */}
          {networkError && !content && !loading ? (
            <div className="rounded-lega border border-red-200 bg-red-50 p-4" role="alert" data-itinerary-network-error>
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-none text-red-500" strokeWidth={2} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-red-700">Itinerary belum bisa dimuat</p>
                  <p className="mt-1 text-xs leading-5 text-red-600">{describeLoadError(networkError)}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setLoading(true);
                      setAttempt((value) => value + 1);
                    }}
                    className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-white px-3 text-xs font-bold text-red-600 shadow-soft transition-colors hover:bg-red-100 active:scale-95"
                  >
                    <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.2} />
                    Coba lagi
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <Card className="overflow-hidden">
              <WebItineraryView
                content={content}
                loading={loading}
                error={null}
                paket={paket}
                onRetryPdf={pdfUrl ? () => window.open(pdfUrl, '_blank', 'noopener,noreferrer') : undefined}
                onPdfDownload={() => trackPublicEvent(slug, 'itinerary_pdf_download_portal', { paket: jadwalId })}
              />
            </Card>
          )}
          <p className="mt-3 text-center text-[11px] leading-5 text-ink/50">
            Jadwal dapat berubah menyesuaikan kondisi di lapangan.
          </p>
        </section>
      </main>
    </PortalPageShell>
  );
}
