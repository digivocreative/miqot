import { useMemo } from 'react';

import WebItineraryView, { type ItineraryContent } from '@/components/WebItineraryView';
import { useItineraryContent } from '@/hooks/useItineraryContent';
import type { UmrohPackage } from '@/types';

interface Props {
  pkg: UmrohPackage;
}

/**
 * Rail kiri — pratinjau LENGKAP itinerary versi kita.
 *
 * Merender `WebItineraryView` yang sama persis dengan halaman share
 * `/:slug/:jadwalId/itinerary`: ringkasan perjalanan, rail hari beserta foto
 * destinasi, kartu penerbangan, dan kartu hotel. Bukan ringkasan buatan sendiri —
 * kalau rail punya versinya sendiri, dua tampilan itu akan menyimpang diam-diam
 * begitu salah satunya diubah.
 *
 * Loading, galat, dan jalan keluar ke PDF sudah ditangani komponen itu sendiri
 * ("Tampilan web belum tersedia" + tombol dokumen PDF), jadi rail tidak perlu
 * menduplikasi jalur degradasinya.
 *
 * Light-only mengikuti spec itinerary 2026-07-30 — di mode gelap ia terbaca
 * seperti lembar dokumen di atas meja gelap, bukan bug.
 */
export default function ItineraryRail({ pkg }: Props) {
  const { state, days } = useItineraryContent(pkg.jadwalId);

  // Cast di batas, sama seperti SharePage: keduanya membaca endpoint yang sama
  // dan `daysFromResponse` sudah menjaga bentuk luarnya (200 + success + days
  // tidak kosong). Isi tiap hari memang datang apa adanya dari parser PDF.
  const content = useMemo(
    () => (state === 'ready' ? ({ days } as unknown as ItineraryContent) : null),
    [state, days],
  );

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-[0_6px_22px_-8px_rgba(58,42,31,0.18)] dark:shadow-black/40">
      <WebItineraryView
        content={content}
        loading={state === 'loading'}
        error={state === 'unavailable' ? 'Itinerary belum tersinkron dari dokumen sumber.' : null}
        paket={pkg}
        summaryAtBottom
        onRetryPdf={pkg.itineraryUrl ? () => window.open(pkg.itineraryUrl, '_blank', 'noopener') : undefined}
      />
    </div>
  );
}
