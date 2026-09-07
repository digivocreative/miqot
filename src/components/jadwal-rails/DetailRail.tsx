import { AnimatePresence } from 'framer-motion';
import { Footprints, Images, MapPin, Star } from 'lucide-react';
import { Suspense, lazy, useState } from 'react';

import { agentWatermarkText } from '@/components/PhotoWatermark';
import { usePublicHotels } from '@/hooks/usePublicHotels';
import { matchHotelPhoto } from '@/lib/hotelThumbs';
import { extraHotelsOf, hotelDistanceOf, hotelStarsOf } from '@/lib/packageDetail';
import { cheapestTierOf } from '@/lib/packagePricing';
import type { UmrohPackage } from '@/types';

// Viewer menyeret PlyrVideo + pipa watermark; halaman publik tidak boleh
// membayarnya sebelum ada yang benar-benar mengetuk foto.
const MediaViewerModal = lazy(() => import('@/components/MediaViewerModal'));

interface Props {
  pkg: UmrohPackage;
  /** Slug agent — dipakai sebagai watermark foto yang diunduh/dibagikan. */
  agentSlug?: string | null;
}

const CARD =
  'overflow-hidden rounded-2xl bg-white shadow-[0_6px_22px_-8px_rgba(58,42,31,0.15)] dark:bg-slate-900 dark:shadow-black/40';

/**
 * Jarak DITULIS PENUH di rail, tidak disingkat seperti di kartu.
 * Kartu punya 512px untuk enam blok sekaligus; rail punya satu kolom untuk satu
 * hotel, dan "±300 m ke pelataran Masjidil Haram" itulah yang sebenarnya
 * dijual — bukan "±300m" yang masih harus diterjemahkan agent.
 */
function distanceSentence(city: string, distance: string): string | null {
  if (!distance) return null;
  const spaced = distance.replace(/(\d)\s*m$/i, '$1 m').replace(/(\d)\s*km$/i, '$1 km');
  const masjid = city === 'MEKKAH' ? 'Masjidil Haram' : city === 'MADINAH' ? 'Masjid Nabawi' : null;
  return masjid ? `${spaced} ke pelataran ${masjid}` : spaced;
}

interface HotelBlockProps {
  city: string;
  name: string;
  stars: string;
  distance: string;
  photos: string[];
  area: string | null;
  onOpenGallery: () => void;
}

function HotelBlock({ city, name, stars, distance, photos, area, onOpenGallery }: HotelBlockProps) {
  const [failed, setFailed] = useState(false);
  const count = Number.parseInt(stars, 10);
  const sentence = distanceSentence(city, distance);
  const cover = photos[0] ?? null;

  return (
    <div className={CARD}>
      {cover && !failed && (
        <button
          type="button"
          onClick={onOpenGallery}
          aria-label={`Buka galeri foto ${name}, ${photos.length} foto`}
          // Rasio dipaku supaya tinggi rail tidak melompat saat foto mendarat.
          className="group relative block aspect-[16/10] w-full overflow-hidden bg-[#EFE7E1] dark:bg-slate-800"
        >
          <img
            src={cover}
            alt={`Foto ${name}`}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
          {photos.length > 1 && (
            <span className="pointer-events-none absolute bottom-2.5 right-2.5 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[10.5px] font-semibold text-white backdrop-blur-sm">
              <Images size={12} />
              {photos.length} foto
            </span>
          )}
        </button>
      )}
      <div className="p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="rounded-[5px] bg-emerald-50 px-2 py-[3px] text-[8.5px] font-extrabold uppercase tracking-[0.09em] text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
            {city}
          </span>
          {Number.isFinite(count) && count > 0 && (
            <span className="flex gap-[2px]">
              {Array.from({ length: count }).map((_, i) => (
                // fill lewat ATRIBUT + currentColor, bukan kelas fill-amber-400:
                // kelas yang baru lahir bareng fitur tidak ada di CSS lama yang
                // masih dipegang service worker di perangkat user.
                <Star key={i} size={12} fill="currentColor" className="text-amber-400" />
              ))}
            </span>
          )}
        </div>

        <p className="text-[14.5px] font-bold leading-tight text-gray-900 dark:text-white">{name}</p>

        {sentence && (
          <p className="mt-2 flex items-start gap-1.5 text-[11.5px] font-semibold leading-snug text-emerald-700 dark:text-emerald-400">
            <Footprints size={13} className="mt-[1px] shrink-0" />
            {sentence}
          </p>
        )}

        {area && (
          <p className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-gray-500 dark:text-slate-400">
            <MapPin size={11} className="shrink-0" />
            {area}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Rail kanan — informasi hotel paket yang sedang dibahas, dengan foto.
 *
 * HANYA hotel. Rincian biaya dan brosur sengaja tetap tinggal di dalam kartu:
 * keduanya sudah punya tempat yang bekerja di sana, dan memindahkannya cuma
 * memecah satu hal jadi dua tempat tanpa menambah apa pun.
 *
 * Foto datang dari GET /api/hotels/public — endpoint baca-saja berisi subset
 * aman Direktori Hotel. Hotel yang tidak ada di direktori tampil TANPA foto,
 * bukan dengan placeholder palsu. Mengetuk foto membuka galeri penuh lewat
 * MediaViewerModal yang sama dipakai halaman Direktori Hotel.
 */
export default function DetailRail({ pkg, agentSlug }: Props) {
  const directory = usePublicHotels();
  const [galeri, setGaleri] = useState<{ name: string; photos: string[] } | null>(null);

  const tier = cheapestTierOf(pkg.harga) ?? Object.keys(pkg.harga || {})[0] ?? '';
  // HotelInfo adalah union per-jenis paket (Saudi/Cairo/Turki); kolom kota plus
  // hanya ada di sebagian anggotanya.
  const hotelInfo = pkg.hotel?.[tier] as unknown as Record<string, string | undefined> | undefined;

  const rows = [
    {
      city: 'MEKKAH',
      name: hotelInfo?.mekkah_hotel || '',
      stars: hotelStarsOf(hotelInfo?.mekkah_hotel, hotelInfo?.mekkah_bintang),
      distance: hotelDistanceOf(hotelInfo?.mekkah_hotel, hotelInfo?.mekkah_jarak),
    },
    {
      city: 'MADINAH',
      name: hotelInfo?.madinah_hotel || '',
      stars: hotelStarsOf(hotelInfo?.madinah_hotel, hotelInfo?.madinah_bintang),
      distance: hotelDistanceOf(hotelInfo?.madinah_hotel, hotelInfo?.madinah_jarak),
    },
    ...extraHotelsOf(hotelInfo, pkg.hotel).map((h) => ({
      city: h.city.toUpperCase(),
      name: h.name,
      stars: h.star,
      distance: '',
    })),
  ].filter((r) => r.name);

  return (
    // px-3 menyamai sisipan horizontal milik WebItineraryView (mx-3 pada kartu
    // hari) di rail kiri, jadi lebar isi kedua rail sama persis.
    <div className="space-y-3 px-3">
      {rows.map((row) => {
        const hit = matchHotelPhoto(row.name, directory);
        const photos = hit?.photos?.length ? hit.photos : hit?.cover ? [hit.cover] : [];
        return (
          <HotelBlock
            key={`${row.city}-${row.name}`}
            city={row.city}
            name={row.name}
            stars={row.stars}
            distance={row.distance}
            photos={photos}
            area={hit?.area ?? null}
            onOpenGallery={() => setGaleri({ name: row.name, photos })}
          />
        );
      })}

      <AnimatePresence>
        {galeri && (
          <Suspense fallback={null}>
            <MediaViewerModal
              media={galeri.photos.map((url) => ({ type: 'image' as const, url }))}
              label={galeri.name}
              watermark={agentWatermarkText(agentSlug)}
              onClose={() => setGaleri(null)}
            />
          </Suspense>
        )}
      </AnimatePresence>
    </div>
  );
}
