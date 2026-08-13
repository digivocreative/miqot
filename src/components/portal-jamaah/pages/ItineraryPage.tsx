import { useEffect, useState } from 'react';
import { BookOpenCheck, Map } from 'lucide-react';
import type { UmrohPackage } from '@/types';
import { trackPublicEvent } from '@/utils/analytics';
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
    fetch(url.toString())
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled) return;
        setContent(asItineraryContent(json?.data));
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [jadwalId, yearCode, pdfUrl, seeded]);

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
          <p className="mt-3 text-center text-[11px] leading-5 text-ink/50">
            Jadwal dapat berubah menyesuaikan kondisi di lapangan.
          </p>
        </section>
      </main>
    </PortalPageShell>
  );
}
