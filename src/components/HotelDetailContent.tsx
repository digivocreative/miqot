// Isi Detail Hotel (galeri, identitas, jarak, rating, Tentang Hotel, fasilitas,
// FAQ, lokasi, video) — dipakai BERSAMA oleh Direktori Hotel di dashboard
// (HotelPage) dan halaman share publik /:agent/hotel/:slug (HotelSharePage),
// supaya kedua tampilan tidak bisa saling melenceng. Komponen ini murni
// tampilan: lightbox, navigasi, dan analitik diurus pemanggil lewat callback,
// karena dashboard (trackEvent, sesi agent) dan publik (trackPublicEvent)
// berbeda. Varian dark: tetap ada — halaman publik melepas kelas `dark` dari
// <html>, jadi di sana otomatis terang.
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Building2, Star, Footprints, MapPin, Play, ImageOff, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { HOTEL_RATING_PLATFORMS } from '../../lib/hotel-directory.js';

// Lazy: halaman publik tidak pernah menerima video (endpoint publiknya foto
// saja), jadi pemutar tak perlu ikut terunduh di sana.
const PlyrVideo = lazy(() => import('./PlyrVideo'));

export interface HotelMediaItem {
  type: 'image' | 'video';
  url: string;
  // Label kategori (Lobby/Kamar/Restoran/bikinan sendiri). Absen = tanpa
  // kategori; lib membuang string kosong sebelum menyimpan.
  category?: string;
}

export interface HotelRatingItem {
  platform: string;
  score: number;
  reviews?: number | null;
  url?: string | null;
}

export interface HotelFaqItemData {
  q: string;
  a: string;
}

export interface HotelDetail {
  id: string;
  slug: string;
  name: string;
  city: string;
  stars: number | null;
  distance_label: string | null;
  walk_label: string | null;
  area: string | null;
  address: string | null;
  gmaps_url: string | null;
  description: string | null;
  facilities: string[];
  media: HotelMediaItem[];
  // Opsional: baris lama / prod pra-migrasi 20260816050000 belum punya kolom ini.
  ratings?: HotelRatingItem[];
  // Opsional: baris lama / prod pra-migrasi 20260816040000 tidak punya kolom ini.
  faq?: HotelFaqItemData[];
  // Nama lain seperti tertulis di jadwal (migrasi 20261009000000).
  aliases?: string[];
}

export const HOTEL_CITY_LABELS: Record<string, string> = {
  mekkah: 'Mekkah',
  madinah: 'Madinah',
  turki: 'Turki',
  dubai: 'Dubai',
  kairo: 'Kairo',
  haikou: 'Haikou',
};
export const HOTEL_CITY_LANDMARKS: Record<string, string> = {
  mekkah: 'Masjidil Haram',
  madinah: 'Masjid Nabawi',
};

// Bentuk yang dibutuhkan tampilan detail — tanpa id/aliases, sehingga payload
// endpoint publik (yang sengaja tidak mengirim keduanya) juga memenuhinya.
export type HotelDetailView = Omit<HotelDetail, 'id' | 'aliases'>;

export type HotelLinkClick = { kind: 'maps' | 'rating'; platform?: string };

// Hanya bintang terisi (tanpa slot abu-abu — terlihat kusam terutama di dark
// mode), solid penuh tanpa stroke — outline terlihat "kurang menarik" (feedback).
//
// Warna WAJIB lewat `fill="currentColor"` + text-amber-400, BUKAN kelas
// `fill-amber-400`: kelas fill-* itu baru lahir bersama fitur hotel, sehingga
// perangkat yang service worker-nya masih memegang CSS lama merender bintang
// tanpa warna isi — tak berwarna saat masih ada stroke, hilang sama sekali
// setelah stroke dinolkan. `text-amber-400` sudah ada di CSS lama.
export function StarRow({ stars, size = 13 }: { stars: number | null; size?: number }) {
  if (!stars) return null;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: Math.min(stars, 5) }, (_, i) => (
        <Star
          key={i}
          size={size}
          strokeWidth={0}
          fill="currentColor"
          className="text-amber-400"
        />
      ))}
    </div>
  );
}

// Daftar FAQ = garis pemisah tipis, TANPA kartu/bingkai (varian pilihan user
// dari mockup Pencil ~/Downloads/hotel-faq-style.pen). Kartu putih dulu dibuang
// karena lembar konten sendiri sudah putih — kartu di atasnya jadi rata dan
// terasa mengambang tanpa maksud. Hanya satu jawaban terbuka pada satu waktu:
// penanda ada di daftar, bukan di tiap baris, karena itu satu-satunya cara
// baris lain ikut tertutup.
function HotelFaqList({ items }: { items: HotelFaqItemData[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const reduceMotion = useReducedMotion();
  return (
    <div className="mt-1">
      {items.map((item, index) => {
        const open = openIndex === index;
        return (
          <div
            key={`${index}-${item.q}`}
            className={index < items.length - 1 ? 'border-b border-gray-100 dark:border-slate-800' : ''}
          >
            <button
              type="button"
              onClick={() => setOpenIndex(open ? null : index)}
              aria-expanded={open}
              className="group flex w-full items-start gap-3 py-3.5 text-left"
            >
              <span
                className={`flex-1 text-sm font-semibold leading-snug transition-colors ${
                  open
                    ? 'text-teal-700 dark:text-teal-300'
                    : 'text-gray-800 group-hover:text-teal-700 dark:text-slate-100 dark:group-hover:text-teal-300'
                }`}
              >
                {item.q}
              </span>
              <ChevronDown
                size={16}
                className={`mt-0.5 shrink-0 transition-[transform,color] duration-300 ${
                  open ? 'rotate-180 text-teal-600 dark:text-teal-400' : 'text-gray-400 dark:text-slate-500'
                }`}
              />
            </button>
            {/* Pola expand FlightStatusCard: height 0→auto dengan overflow
                terkunci, opacity menyusul sedikit agar teks tidak "melompat". */}
            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  key="jawaban"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={reduceMotion ? { duration: 0 } : {
                    height: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
                    opacity: { duration: 0.2, delay: 0.04, ease: 'easeInOut' },
                  }}
                  style={{ overflow: 'hidden', willChange: 'height' }}
                >
                  <p className="pb-4 text-sm leading-relaxed text-gray-600 dark:text-slate-300 whitespace-pre-line">
                    {item.a}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

// Deskripsi panjang dipangkas ke 3 baris, lalu dibuka penuh lewat "Lihat
// selengkapnya". Pemangkasnya = `line-clamp` bawaan browser, jadi elipsisnya
// digambar mesin teks browser itu sendiri — bukan gradien pudar seperti versi
// lama. Gradien lama berangkat dari `transparent`, yang menurut spesifikasi =
// rgba(0,0,0,0): di browser yang menginterpolasi gradien tanpa premultiplied
// alpha, jalur menuju putih/slate lewat hitam dan meninggalkan noda abu-abu —
// persis "kurang rapih di beberapa browser". Tingginya pun 28px, lebih tinggi
// dari satu baris (22,75px), sehingga baris ke-3 nyaris tak terbaca.
// Tinggi terpangkas tetap DIUKUR dari line-height elemennya sendiri, bukan
// angka px hafalan — ukuran font/leading boleh berubah tanpa memecahkannya.
const DESCRIPTION_CLAMP_LINES = 3;
// Kelasnya WAJIB literal — Tailwind memindai teks sumber, `line-clamp-${n}`
// tidak akan pernah dibangkitkan. Ditaruh berdampingan supaya angkanya tak
// diam-diam berbeda dari tinggi yang diukur.
const DESCRIPTION_CLAMP_CLASS = 'line-clamp-3';
// Satu sumber durasi: transisi tinggi DAN timer pemasangan klem membacanya,
// jadi keduanya tak bisa melenceng sendiri-sendiri.
const DESCRIPTION_EXPAND_MS = 320;

function HotelDescription({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [collapsedHeight, setCollapsedHeight] = useState<number | null>(null);
  const [overflows, setOverflows] = useState(false);
  // Klem hanya dipasang saat wadah sudah DIAM. Selama animasi tutup teks
  // dibiarkan utuh dan dipotong overflow wadah, jadi barisnya ikut turun mulus;
  // kalau diklem sejak frame pertama, teks langsung patah ke 3 baris sementara
  // wadahnya masih tinggi — terbaca seperti rusak.
  const [settled, setSettled] = useState(true);
  const textRef = useRef<HTMLParagraphElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const measure = () => {
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 21;
      const clamped = lineHeight * DESCRIPTION_CLAMP_LINES;
      setCollapsedHeight(clamped);
      // `scrollHeight` tetap tinggi teks PENUH walau line-clamp aktif, jadi
      // deteksi ini sah di kedua keadaan. Toleransi 2px untuk pembulatan
      // sub-piksel: teks 3 baris pas jangan sampai dianggap kepanjangan dan
      // memunculkan tombol yang tak berguna.
      setOverflows(el.scrollHeight > clamped + 2);
    };
    measure();
    // Lebar berubah (rotasi/resize) = jumlah baris berubah.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);

  // Klem dipasang lagi setelah animasi tutup habis waktunya. Pakai timer, BUKAN
  // onAnimationComplete framer: animasinya digerakkan requestAnimationFrame,
  // yang berhenti total saat tab tersembunyi — callback-nya tak pernah datang
  // dan teks menggantung tanpa klem, terpotong mentah di tepi wadah. Timer tetap
  // sampai tujuan (sekadar tertunda), jadi keadaan akhirnya selalu sama.
  useEffect(() => {
    if (open) return;
    const id = setTimeout(() => setSettled(true), reduceMotion ? 0 : DESCRIPTION_EXPAND_MS);
    return () => clearTimeout(id);
  }, [open, reduceMotion]);

  // Klem tidak menunggu hasil ukur: sejak cat pertama teks sudah 3 baris, jadi
  // tak ada kedip "penuh dulu baru mengerut" saat halaman dimuat.
  const clamp = !open && settled;
  const showFull = open || !overflows || collapsedHeight === null;

  return (
    <>
      {/* Jarak atas ada di WADAH, bukan di <p>: tinggi terpangkas dihitung dari
          tinggi teks murni, jadi margin tidak ikut memakan jatah barisnya. */}
      <motion.div
        className="mt-1.5 overflow-hidden"
        animate={{ height: showFull ? 'auto' : collapsedHeight }}
        initial={false}
        transition={reduceMotion
          ? { duration: 0 }
          : { duration: DESCRIPTION_EXPAND_MS / 1000, ease: [0.22, 1, 0.36, 1] }}
      >
        <p
          ref={textRef}
          className={`text-sm leading-relaxed text-gray-600 dark:text-slate-300 whitespace-pre-line${
            clamp ? ` ${DESCRIPTION_CLAMP_CLASS}` : ''
          }`}
        >
          {text}
        </p>
      </motion.div>

      {overflows && (
        <button
          type="button"
          onClick={() => {
            // Lepas klem SEBELUM tinggi bergerak: framer mengukur tinggi 'auto'
            // dari teks utuh, dan animasi tutup memotong lewat overflow wadah
            // (bukan patah ke 3 baris seketika). Klem balik dipasang oleh timer
            // di efek atas.
            setSettled(false);
            setOpen(prev => !prev);
          }}
          aria-expanded={open}
          className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-teal-700 transition-colors hover:text-teal-800 dark:text-teal-300 dark:hover:text-teal-200"
        >
          {open ? 'Lebih ringkas' : 'Lihat selengkapnya'}
          <ChevronDown
            size={14}
            className="transition-transform duration-300"
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          />
        </button>
      )}
    </>
  );
}

// Widget rating platform pemesanan. Skala berbeda per platform, jadi angkanya
// SELALU ditulis "x/maks" — bukan bintang seragam yang membuat 8,6 (Booking)
// terlihat lebih buruk dari 4,3 (Google).
function HotelRatings({ ratings, onLinkClick }: { ratings: HotelRatingItem[]; onLinkClick?: (link: HotelLinkClick) => void }) {
  const known = HOTEL_RATING_PLATFORMS as { id: string; label: string; max: number }[];
  const rows = known
    .map(platform => ({ platform, value: ratings.find(r => r.platform === platform.id) }))
    .filter((row): row is { platform: typeof known[number]; value: HotelRatingItem } => Boolean(row.value));
  if (rows.length === 0) return null;

  return (
    <div className="mt-5">
      <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Rating Platform</h3>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {rows.map(({ platform, value }) => {
          const content = (
            <>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">
                  {value.score.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </span>
                <span className="text-[11px] font-semibold text-gray-400 dark:text-slate-500">/{platform.max}</span>
              </div>
              <p className="mt-0.5 text-[11px] font-semibold text-gray-600 dark:text-slate-300">{platform.label}</p>
              {value.reviews !== null && value.reviews !== undefined && (
                <p className="text-[10px] text-gray-400 dark:text-slate-500">
                  {value.reviews.toLocaleString('id-ID')} ulasan
                </p>
              )}
            </>
          );
          const shell = 'rounded-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 shadow-sm';
          return value.url ? (
            <a
              key={platform.id}
              href={value.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onLinkClick?.({ kind: 'rating', platform: platform.id })}
              className={`${shell} block transition-all hover:shadow-md active:scale-[0.98]`}
            >
              {content}
            </a>
          ) : (
            <div key={platform.id} className={shell}>{content}</div>
          );
        })}
      </div>
    </div>
  );
}

export default function HotelDetailContent({ detail, onOpenViewer, onOpenAll, onLinkClick, titleAction }: {
  detail: HotelDetailView;
  /** Foto di galeri diketuk → lightbox mulai di indeks itu (indeks media[]). */
  onOpenViewer: (index: number) => void;
  /** Kotak "Lihat semua" di ujung strip galeri. */
  onOpenAll: (index: number) => void;
  /** Klik keluar ke Google Maps / platform rating — untuk analitik pemanggil. */
  onLinkClick?: (link: HotelLinkClick) => void;
  /** Slot di samping nama hotel. */
  titleAction?: ReactNode;
}) {
  const landmark = HOTEL_CITY_LANDMARKS[detail.city];
  const media = detail.media || [];
  const videos = media.filter(m => m.type === 'video');

  return (
    <>
      {/* Galeri: satu cover besar + tiga mini di bawahnya (pola tiket.com).
          Foto langsung membuka lightbox; HANYA kotak "Lihat semua" yang
          pindah ke halaman media.
          TANPA margin atas: shell sudah memberi pt-4, dan margin tambahan
          membuat jarak atas (28px) tak sebanding dengan px-4 di sisinya. */}
      <div>
        <button
          onClick={() => onOpenViewer(0)}
          disabled={media.length === 0}
          aria-label={media.length ? `Lihat media ${detail.name}` : undefined}
          aria-haspopup={media.length ? 'dialog' : undefined}
          className="relative block h-56 w-full overflow-hidden rounded-2xl border border-gray-100 dark:border-slate-700 bg-gray-100 dark:bg-slate-700 shadow-sm transition-all enabled:hover:shadow-lg enabled:active:scale-[0.99] disabled:cursor-default"
        >
          {media[0] ? (
            media[0].type === 'video' ? (
              <div className="flex h-full w-full items-center justify-center bg-slate-800">
                <Play size={32} className="text-white" />
              </div>
            ) : (
              <img src={media[0].url} alt={detail.name} className="h-full w-full object-cover" />
            )
          ) : (
            <div className="flex h-full items-center justify-center">
              <ImageOff size={32} className="text-gray-300 dark:text-slate-500" />
            </div>
          )}
        </button>

        {media.length > 1 && (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {media.slice(1, 4).map((item, index) => {
              const mediaIdx = index + 1;
              const isLastSlot = index === Math.min(media.length - 2, 2);
              const hiddenCount = media.length - 4;
              return (
                <button
                  key={item.url}
                  onClick={() => (isLastSlot ? onOpenAll(mediaIdx) : onOpenViewer(mediaIdx))}
                  aria-label={isLastSlot ? `Lihat semua media ${detail.name}` : `Lihat media ${mediaIdx + 1}`}
                  aria-haspopup={isLastSlot ? undefined : 'dialog'}
                  className="relative h-20 overflow-hidden rounded-xl border border-gray-100 dark:border-slate-700 bg-gray-100 dark:bg-slate-700 transition-all hover:shadow-md active:scale-[0.97]"
                >
                  {item.type === 'video' ? (
                    <div className="flex h-full w-full items-center justify-center bg-slate-800">
                      <Play size={18} className="text-white" />
                    </div>
                  ) : (
                    <img src={item.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  )}
                  {isLastSlot && (
                    <span className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/60 px-1 text-center text-[11px] font-bold leading-tight text-white">
                      Lihat semua
                      {hiddenCount > 0 && <span className="text-[10px] font-semibold text-white/80">+{hiddenCount} lagi</span>}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Identitas — slot kanan untuk aksi pemanggil (tombol Bagikan di dashboard). */}
      <div className="mt-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">{detail.name}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-teal-100 dark:border-teal-800/40 bg-teal-50 dark:bg-teal-900/20 px-2.5 py-0.5 text-[10px] font-semibold text-teal-600 dark:text-teal-400">
            <Building2 size={10} />
            {HOTEL_CITY_LABELS[detail.city]}
          </span>
          {detail.stars ? (
            <>
              <StarRow stars={detail.stars} />
              <span className="text-xs text-gray-500 dark:text-slate-400">Hotel bintang {detail.stars}</span>
            </>
          ) : null}
        </div>
        </div>
        {titleAction}
      </div>

      {detail.distance_label && landmark && (
        <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2.5">
          <Footprints size={18} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div>
            <p className="text-[13px] font-bold text-emerald-700 dark:text-emerald-400">
              {detail.distance_label} dari {landmark}
            </p>
            {detail.walk_label && (
              <p className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80">{detail.walk_label}</p>
            )}
          </div>
        </div>
      )}

      <HotelRatings ratings={detail.ratings || []} onLinkClick={onLinkClick} />

      {detail.description && (
        <div className="mt-5">
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Tentang Hotel</h3>
          {/* text-sm = token "Body text" DESIGN-SYSTEM.md; text-[13px] lama
              di bawah standar dan dikeluhkan terlalu kecil untuk dibaca. */}
          <HotelDescription text={detail.description} />
        </div>
      )}

      {detail.facilities.length > 0 && (
        <div className="mt-5">
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Fasilitas</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {detail.facilities.map(facility => (
              <span key={facility} className="rounded-full bg-gray-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-slate-300">
                {facility}
              </span>
            ))}
          </div>
        </div>
      )}

      {detail.faq && detail.faq.length > 0 && (
        <div className="mt-5">
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">
            Pertanyaan Umum
          </h3>
          <HotelFaqList items={detail.faq} />
        </div>
      )}

      {(detail.address || detail.gmaps_url) && (
        <div className="mt-5">
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Lokasi</h3>
          {detail.address && (
            <p className="mt-1.5 text-sm leading-relaxed text-gray-600 dark:text-slate-300">{detail.address}</p>
          )}
          {detail.gmaps_url && (
            <button
              onClick={() => {
                window.open(detail.gmaps_url || '', '_blank', 'noopener');
                onLinkClick?.({ kind: 'maps' });
              }}
              className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-2.5 text-[13px] font-semibold text-gray-700 dark:text-slate-200 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700 active:scale-[0.98]"
            >
              <MapPin size={15} />
              Buka di Google Maps
            </button>
          )}
        </div>
      )}

      {videos.length > 0 && (
        <div className="mt-5">
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Video ({videos.length})</h3>
          <div className="mt-2 space-y-3">
            {videos.map(video => (
              <div key={video.url} className="overflow-hidden rounded-2xl border border-gray-100 dark:border-slate-700 bg-slate-900">
                <Suspense fallback={<div className="aspect-video" />}>
                  <PlyrVideo src={video.url} mode="fit" ariaLabel={`Video ${detail.name}`} />
                </Suspense>
              </div>
            ))}
          </div>
        </div>
      )}

    </>
  );
}
