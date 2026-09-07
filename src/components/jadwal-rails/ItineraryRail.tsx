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
    // -mt-3 menetralkan 12px milik WebItineraryView sendiri (pt-0.5 pada
    // pembungkus hari + mt-2.5 pada kartu hari pertama). Tanpa itu isi rail kiri
    // mulai 12px lebih rendah daripada rail kanan dan kartu di kolom tengah —
    // terukur 204 lawan 192. Vertikal saja: margin negatif horizontal akan
    // meluber keluar kotak rail yang `overflow-y: auto`.
    <div className="-mt-3">
      <WebItineraryView
        content={content}
        loading={state === 'loading'}
        error={state === 'unavailable' ? 'Itinerary belum tersinkron dari dokumen sumber.' : null}
        paket={pkg}
        summaryAtBottom
        transparentSurface
        onRetryPdf={pkg.itineraryUrl ? () => window.open(pkg.itineraryUrl, '_blank', 'noopener') : undefined}
      />
    </div>
  );
}
