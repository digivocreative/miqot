import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Building2, Search, Star, Footprints, MapPin, Lock, SlidersHorizontal,
  Play, ImageOff, Image as ImageIcon, ChevronDown,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { parseHotelDistanceMeters, hotelAreaCity, hotelMediaCategories, HOTEL_RATING_PLATFORMS, HOTEL_MAX_FAQ_ITEMS } from '../../lib/hotel-directory.js';
import { getAuthHeaders } from './LoginPage';
import { trackEvent } from '../utils/analytics';
import PlyrVideo from './PlyrVideo';
import HotelFilterSheet from './HotelFilterSheet';
import MediaViewerModal from './MediaViewerModal';
import HotelAgentGallerySection from './HotelAgentGallery';
import { agentWatermarkText } from './PhotoWatermark';
import SegmentedControl from './common/SegmentedControl';
import { DASHBOARD_SUBPAGE_HEADER_H } from '../constants/dashboard-chrome';
import {
  HOTEL_SHEET_CLASS, HOTEL_SHEET_MIN_HEIGHT,
  HotelSkeletonKategori, HotelSkeletonList, HotelSkeletonDetail,
} from './HotelSkeletons';

export interface HotelListItem {
  id: string;
  slug: string;
  name: string;
  city: string;
  stars: number | null;
  distance_label: string | null;
  walk_label: string | null;
  area: string | null;
  cover: string | null;
  photo_count: number;
  video_count: number;
}

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

// Diteruskan dari lib/ lewat berkas ini supaya panel Kelola tidak perlu impor
// kedua ke modul JS tanpa tipe — batas tetap satu sumber di lib/hotel-directory.js.
export const HOTEL_FAQ_MAX: number = HOTEL_MAX_FAQ_ITEMS;

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
  agent_note: string | null;
  media: HotelMediaItem[];
  // Opsional: baris lama / prod pra-migrasi 20260816050000 belum punya kolom ini.
  ratings?: HotelRatingItem[];
  // Opsional: baris lama / prod pra-migrasi 20260816040000 tidak punya kolom ini.
  faq?: HotelFaqItemData[];
}

export const HOTEL_CITIES = ['mekkah', 'madinah', 'turki', 'dubai', 'kairo', 'haikou'] as const;
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

type MediaTab = 'foto' | 'video';

type View =
  | { kind: 'kategori' }
  | { kind: 'list'; city: string }
  | { kind: 'detail'; slug: string; city: string }
  | { kind: 'media'; slug: string; city: string };

// View diturunkan dari URL (/dashboard/hotel[/:city[/:slug]]) supaya
// tombol back header DashboardLayout jadi satu-satunya navigasi mundur —
// tanpa baris back kedua di dalam halaman (keluhan "navigasi double").
function readHotelView(): View {
  const segments = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
  // Indeks segmen mengikuti rute menu mandiri /dashboard/hotel/:city/:slug —
  // WAJIB sejalan dengan getHotelPathInfo di DashboardLayout (dua pembaca URL
  // yang sama); dulu rutenya /dashboard/ai-tools/hotel jadi indeksnya 3/4/5.
  const city = decodeURIComponent(segments[2] || '');
  // Cast ke readonly string[]: HOTEL_CITIES adalah tuple literal (as const),
  // dan .includes()-nya menolak `string` biasa meski secara runtime aman —
  // `city` datang dari URL, bukan dari union literalnya.
  if ((HOTEL_CITIES as readonly string[]).includes(city)) {
    const slug = decodeURIComponent(segments[3] || '');
    if (slug && segments[4] === 'media') return { kind: 'media', city, slug };
    if (slug) return { kind: 'detail', city, slug };
    return { kind: 'list', city };
  }
  return { kind: 'kategori' };
}

async function fetchHotelJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: getAuthHeaders() });
  let json: { success?: boolean; data?: T; error?: string } = {};
  try {
    json = await res.json();
  } catch {
    /* body bukan JSON — pakai pesan generik di bawah */
  }
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Gagal memuat direktori hotel');
  }
  return json.data as T;
}

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

// Shell transisi antar-view (kategori/daftar/detail): fade + geser halus per
// aturan DS (280-450ms, easing [0.22,1,0.36,1]). Kunci = identitas view, dan
// skeleton memakai kunci yang SAMA dengan konten finalnya supaya pergantian
// skeleton → data tidak memicu animasi kedua.
// `solid` = lembar putih penuh untuk area konten (permintaan user), meniru
// tab Teras di DashboardLayout: bg putih + border samping di layar lebar.
// Panel Kelola sengaja TIDAK memakainya — action bar di sana dijangkar ke
// minHeight hasil ukur sendiri, jadi menambah minHeight kedua akan menggesernya.
// `animateEntry=false` untuk render PERTAMA halaman: saat itu skeleton yang
// sama sudah tampil sebagai fallback Suspense, jadi memulai dari opacity 0
// justru terlihat sebagai kedipan — bukan transisi. Antar-view (kunci berubah)
// animasinya tetap hidup.
export function HotelViewShell({ viewKey, children, solid = false, animateEntry = true }: {
  viewKey: string;
  children: ReactNode;
  solid?: boolean;
  animateEntry?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      key={viewKey}
      initial={animateEntry ? { opacity: 0, y: reduceMotion ? 0 : 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={`px-4 pt-4 pb-8${solid ? ` ${HOTEL_SHEET_CLASS}` : ''}`}
      style={solid ? { minHeight: HOTEL_SHEET_MIN_HEIGHT } : undefined}
    >
      {children}
    </motion.div>
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
function HotelRatings({ ratings }: { ratings: HotelRatingItem[] }) {
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

// Cache antar-mount (umur proses, sengaja BUKAN localStorage). Direktori hotel
// jarang berubah, tapi halamannya di-unmount tiap kali agent keluar ke daftar
// Tools — tanpa cache, tiap masuk kembali mengulang skeleton walau datanya
// persis sama. Pola stale-while-revalidate: tampilkan cache seketika, muat
// ulang di latar (hasil edit panel Kelola menyusul di kunjungan berikutnya).
let hotelListCache: HotelListItem[] | null = null;
let hotelBannerCache: Record<string, string | null> | null = null;
const hotelDetailCache = new Map<string, HotelDetail>();

export default function HotelPage({ onNavigate, agentSlug }: {
  onNavigate: (path: string) => void;
  /** Slug agent yang sedang login — sumber teks watermark di setiap foto. */
  agentSlug?: string | null;
}) {
  const watermark = agentWatermarkText(agentSlug);
  // Re-render tiap navigasi datang dari pathTick DashboardLayout.
  const view = readHotelView();
  const [hotels, setHotels] = useState<HotelListItem[] | null>(hotelListCache);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<HotelDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [starFilter, setStarFilter] = useState<number | null>(null);
  const [areaFilter, setAreaFilter] = useState<string | null>(null);
  const [sortByDistance, setSortByDistance] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  // null = lightbox tertutup. Tidak ada lagi indeks "media aktif" di halaman:
  // preview besar dibuang, jadi grid saja yang menentukan apa yang dibuka.
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [mediaTab, setMediaTab] = useState<MediaTab>('foto');
  // '' = Semua. Hanya berlaku di tab Foto; video sengaja tidak berkategori.
  const [photoCategory, setPhotoCategory] = useState('');
  // null = belum diketahui (bukan "tidak ada banner"). Kartu kategori menunggu
  // nilainya: kalau digambar duluan dengan cover hotel, gambar kartu berganti
  // sendiri beberapa ratus milidetik kemudian saat banner tiba — persis kedipan
  // yang dikeluhkan. Gagal muat = {} (jatuh ke cover, tanpa menggantung).
  const [banners, setBanners] = useState<Record<string, string | null> | null>(hotelBannerCache);

  const tracked = useRef(false);
  useEffect(() => {
    if (!tracked.current) {
      trackEvent('feature', 'open_hotel_directory');
      tracked.current = true;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchHotelJson<HotelListItem[]>('/api/hotels')
      .then(data => { hotelListCache = data; if (!cancelled) { setHotels(data); setLoadError(null); } })
      .catch(err => { if (!cancelled) setLoadError(err.message); });
    // Banner opsional — gagal memuat = kartu kategori jatuh ke cover hotel.
    // Katup pengaman: kalau permintaannya menggantung, kartu kategori tidak ikut
    // tertahan selamanya menunggu banner (lebih baik cover dulu daripada
    // skeleton terus).
    const bannerGiveUp = setTimeout(() => { if (!cancelled) setBanners(prev => prev || {}); }, 1500);
    fetchHotelJson<Record<string, string | null>>('/api/hotels/banners')
      .then(data => { hotelBannerCache = data; if (!cancelled) setBanners(data); })
      .catch(() => { if (!cancelled) setBanners(prev => prev || {}); })
      .finally(() => clearTimeout(bannerGiveUp));
    return () => { cancelled = true; clearTimeout(bannerGiveUp); };
  }, []);

  // Kunci primitif, bukan objek view — readHotelView membuat objek baru tiap render.
  // Halaman media ikut memakai detail yang sama; karena slug-nya identik,
  // pindah detail↔media TIDAK memicu fetch ulang.
  const detailSlug = view.kind === 'detail' || view.kind === 'media' ? view.slug : null;
  const listCity = view.kind === 'list' ? view.city : null;

  // Detail dipilih saat RENDER, bukan lewat setState di efek: efek berjalan
  // setelah frame pertama tercat, jadi "kosongkan detail lalu isi dari cache"
  // akan menampilkan satu frame skeleton untuk hotel yang datanya sudah ada.
  // Penjaga slug memastikan detail hotel sebelumnya tidak ikut terbawa.
  const detail = detailSlug
    ? (detailData && detailData.slug === detailSlug ? detailData : hotelDetailCache.get(detailSlug) || null)
    : null;

  // Ganti kota (termasuk via back/forward browser) = mulai dari saringan kosong.
  useEffect(() => {
    setQuery('');
    setStarFilter(null);
    setAreaFilter(null);
    setSortByDistance(false);
    setFilterOpen(false);
  }, [listCity]);
  useEffect(() => {
    if (!detailSlug) return;
    let cancelled = false;
    setDetailError(null);
    setViewerIndex(null);
    setMediaTab('foto');
    setPhotoCategory('');
    fetchHotelJson<HotelDetail>(`/api/hotels/${encodeURIComponent(detailSlug)}`)
      .then(data => { hotelDetailCache.set(detailSlug, data); if (!cancelled) setDetailData(data); })
      .catch(err => { if (!cancelled) setDetailError(err.message); });
    trackEvent('action', 'hotel_view', { slug: detailSlug });
    return () => { cancelled = true; };
  }, [detailSlug]);

  const countsByCity = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const city of HOTEL_CITIES) counts[city] = 0;
    for (const hotel of hotels || []) counts[hotel.city] = (counts[hotel.city] || 0) + 1;
    return counts;
  }, [hotels]);

  const coverByCity = useMemo(() => {
    const covers: Record<string, string | null> = {};
    for (const hotel of hotels || []) {
      if (!covers[hotel.city] && hotel.cover) covers[hotel.city] = hotel.cover;
    }
    return covers;
  }, [hotels]);

  // Semua hotel kota ini (sebelum filter) — sumber opsi chip.
  const cityPool = useMemo(
    () => (listCity ? (hotels || []).filter(h => h.city === listCity) : []),
    [hotels, listCity]
  );

  // Chip hanya muncul kalau benar-benar memilah: satu nilai saja tidak menyaring apa pun.
  const starOptions = useMemo(() => {
    const values = [...new Set(cityPool.map(h => h.stars).filter((s): s is number => !!s))];
    return values.length > 1 ? values.sort((a, b) => b - a) : [];
  }, [cityPool]);

  const areaOptions = useMemo(() => {
    const values = [...new Set(cityPool.map(h => hotelAreaCity(h.area)).filter((v): v is string => !!v))];
    return values.length > 1 ? values.sort((a, b) => a.localeCompare(b)) : [];
  }, [cityPool]);

  const canSortByDistance = cityPool.some(h => parseHotelDistanceMeters(h.distance_label) !== null);
  const hasFilterChips = canSortByDistance || starOptions.length > 0 || areaOptions.length > 0;
  const activeFilterCount = (sortByDistance ? 1 : 0) + (starFilter !== null ? 1 : 0) + (areaFilter !== null ? 1 : 0);

  const cityHotels = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = cityPool
      .filter(h => !q || h.name.toLowerCase().includes(q))
      .filter(h => starFilter === null || h.stars === starFilter)
      .filter(h => areaFilter === null || hotelAreaCity(h.area) === areaFilter);
    if (!sortByDistance) return rows;
    // Hotel tanpa jarak terbaca didorong ke belakang, bukan dianggap 0 meter.
    return [...rows].sort((a, b) => {
      const da = parseHotelDistanceMeters(a.distance_label);
      const db = parseHotelDistanceMeters(b.distance_label);
      if (da === null && db === null) return a.name.localeCompare(b.name);
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db || a.name.localeCompare(b.name);
    });
  }, [cityPool, query, starFilter, areaFilter, sortByDistance]);

  const viewKey =
    view.kind === 'kategori' ? 'kategori'
    : view.kind === 'list' ? `list-${view.city}`
    : view.kind === 'media' ? `media-${view.slug}`
    : `detail-${view.slug}`;

  // Posisi scroll per view: pindah ke detail selalu mulai dari atas, dan
  // kembali ke daftar mendarat di baris yang tadi dibuka. Tanpa ini halaman
  // detail terbuka di tengah-tengah (scroll daftar ikut terbawa) — terbaca
  // seperti halaman melompat sendiri.
  const scrollMemory = useRef<Record<string, number>>({});
  const scrollViewKey = useRef(viewKey);
  scrollViewKey.current = viewKey;
  useEffect(() => {
    const onScroll = () => { scrollMemory.current[scrollViewKey.current] = window.scrollY; };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useLayoutEffect(() => {
    window.scrollTo(0, scrollMemory.current[viewKey] ?? 0);
  }, [viewKey]);

  // Render pertama halaman ini datang tepat setelah skeleton fallback Suspense
  // yang bentuknya sama — memudarkannya masuk lagi hanya terlihat sebagai
  // kedipan. Animasi shell baru dinyalakan untuk perpindahan view berikutnya.
  const entered = useRef(false);
  useEffect(() => { entered.current = true; }, []);
  const shellProps = { viewKey, solid: true, animateEntry: entered.current };

  if (loadError && !hotels) {
    return (
      <HotelViewShell {...shellProps} viewKey="error">
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl text-xs text-red-600 dark:text-red-400 font-medium">
          {loadError}
        </div>
      </HotelViewShell>
    );
  }

  // Skeleton mengikuti bentuk view tujuan (termasuk deep link ke daftar/detail).
  // Kartu kategori menunggu banner juga (kedua permintaan berjalan berbarengan,
  // jadi tidak menambah waktu tunggu berarti) supaya gambarnya tidak berganti
  // sendiri setelah tampil.
  if (!hotels || (view.kind === 'kategori' && !banners)) {
    return (
      <HotelViewShell {...shellProps}>
        {view.kind === 'kategori' ? <HotelSkeletonKategori /> : view.kind === 'list' ? <HotelSkeletonList /> : <HotelSkeletonDetail />}
      </HotelViewShell>
    );
  }

  // ── View: Pilih Kategori ──
  if (view.kind === 'kategori') {
    return (
      <HotelViewShell {...shellProps}>
        <div className="flex flex-col gap-3">
          {HOTEL_CITIES.map(city => {
            const bannerSrc = (banners && banners[city]) || coverByCity[city];
            return (
              <button
                key={city}
                onClick={() => onNavigate(`/dashboard/hotel/${city}`)}
                className="relative h-40 overflow-hidden rounded-2xl border border-gray-100 bg-gray-100 shadow-sm text-left transition-all hover:shadow-lg active:scale-[0.97] dark:border-slate-700 dark:bg-slate-800"
              >
                {/* Semua kartu kategori tampil di puncak halaman: `lazy` di
                    sini justru menunda gambar yang sudah terlihat, sehingga
                    kartu tampil abu-abu dulu baru terisi. Latar abu-abu di
                    tombol = warna skeleton, jadi jeda decode tidak terlihat
                    sebagai kilatan putih. */}
                {bannerSrc ? (
                  <img src={bannerSrc} alt={HOTEL_CITY_LABELS[city]} className="absolute inset-0 h-full w-full object-cover" decoding="async" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-teal-400 to-teal-600 dark:from-teal-600 dark:to-teal-800">
                    <Building2 size={32} className="text-white/70" />
                  </div>
                )}
                {/* Scrim membias ke atas, bukan bilah pekat — pt-10 memberi
                    landasan gradasi supaya batasnya tak terlihat sebagai garis.
                    Nama & jumlah sebaris: items-baseline menyejajarkan garis
                    alas 14px dan 11px (items-end akan tampak meleset). */}
                <div className="absolute inset-x-0 bottom-0 flex items-baseline justify-between gap-3 bg-gradient-to-t from-slate-900/85 via-slate-900/60 to-transparent px-3 pb-2 pt-10">
                  <p className="text-sm font-bold text-white">{HOTEL_CITY_LABELS[city]}</p>
                  <p className="shrink-0 text-[11px] text-white/90">{countsByCity[city]} hotel</p>
                </div>
              </button>
            );
          })}
        </div>
      </HotelViewShell>
    );
  }

  // ── View: Daftar Hotel per kategori ──
  // Judul & tombol back kota ada di header DashboardLayout ("Hotel Madinah").
  if (view.kind === 'list') {
    return (
      <HotelViewShell {...shellProps}>
        {/* Pencarian + satu tombol Filter (opsinya di bottom sheet). Tombol
            hanya muncul bila datanya memang memilah — Dubai yang berisi satu
            hotel tidak diberi tombol yang tak menyaring apa pun. */}
        <div className="flex items-center gap-2">
          {/* Kotak cari memakai kelas input baku DESIGN-SYSTEM.md (pl-9 memberi
              ruang ikon), tombol Filter memakai geometri + skin trigger
              FilterDropdown varian default — keduanya py-2.5 rounded-xl
              sehingga tingginya sejajar tanpa nilai tinggi karangan. */}
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Cari..."
              className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400 disabled:opacity-50"
            />
          </div>

          {hasFilterChips && (
            <button
              onClick={() => setFilterOpen(true)}
              aria-haspopup="dialog"
              className={`shrink-0 flex items-center gap-2 border px-3 py-2.5 rounded-xl text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${
                activeFilterCount > 0
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30'
                  : 'bg-gray-100/80 dark:bg-slate-800/80 border-transparent dark:border-transparent text-gray-700 dark:text-slate-200 hover:bg-gray-200/80 dark:hover:bg-slate-700/80'
              }`}
            >
              <SlidersHorizontal size={16} />
              Filter
              {activeFilterCount > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          )}
        </div>

        {(starFilter !== null || areaFilter !== null || query.trim()) && (
          <p className="mt-1.5 text-[11px] font-medium text-gray-400 dark:text-slate-500">
            {cityHotels.length} dari {cityPool.length} hotel
          </p>
        )}

        <div className="space-y-3 mt-3">
          {cityHotels.length === 0 && (
            <div className="py-10 text-center">
              <Building2 size={32} className="mx-auto text-gray-300 dark:text-slate-600" />
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-2">
                {query || starFilter !== null || areaFilter !== null
                  ? 'Tidak ada hotel yang cocok dengan saringan ini.'
                  : 'Belum ada hotel di kategori ini.'}
              </p>
            </div>
          )}
          {cityHotels.map(hotel => (
            <button
              key={hotel.id}
              onClick={() => onNavigate(`/dashboard/hotel/${hotel.city}/${encodeURIComponent(hotel.slug)}`)}
              className="w-full flex items-center gap-3 p-2.5 bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm text-left transition-all hover:shadow-lg active:scale-[0.98]"
            >
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
                {hotel.cover ? (
                  <img src={hotel.cover} alt={hotel.name} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <ImageOff size={18} className="text-gray-300 dark:text-slate-500" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{hotel.name}</p>
                <div className="mt-1"><StarRow stars={hotel.stars} /></div>
                {hotel.distance_label ? (
                  <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    <Footprints size={10} />
                    {hotel.distance_label} dari {HOTEL_CITY_LANDMARKS[hotel.city]}
                  </span>
                ) : hotel.area ? (
                  <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-gray-50 dark:bg-slate-700/60 px-2 py-0.5 text-[10px] font-semibold text-gray-500 dark:text-slate-300">
                    <MapPin size={10} />
                    {hotel.area}
                  </span>
                ) : null}
                {/* Kelengkapan media TIDAK ditampilkan di baris daftar (feedback
                    user, dua kali): itu urusan admin — panel Kelola yang
                    menandainya, bukan layar agent yang sedang mencari hotel. */}
              </div>
            </button>
          ))}
        </div>

        {filterOpen && (
          <HotelFilterSheet
            landmark={HOTEL_CITY_LANDMARKS[view.city]}
            canSortByDistance={canSortByDistance}
            starOptions={starOptions}
            areaOptions={areaOptions}
            sortByDistance={sortByDistance}
            starFilter={starFilter}
            areaFilter={areaFilter}
            resultCount={cityHotels.length}
            activeCount={activeFilterCount}
            onChangeSort={setSortByDistance}
            onChangeStar={setStarFilter}
            onChangeArea={setAreaFilter}
            onReset={() => { setSortByDistance(false); setStarFilter(null); setAreaFilter(null); }}
            onClose={() => setFilterOpen(false)}
          />
        )}
      </HotelViewShell>
    );
  }

  // ── View: Detail Hotel ──
  const landmark = detail ? HOTEL_CITY_LANDMARKS[detail.city] : undefined;
  const media = detail?.media || [];
  const videos = media.filter(m => m.type === 'video');
  const mediaPath = `/dashboard/hotel/${view.city}/${encodeURIComponent(view.slug)}/media`;
  // Tab dibuka mengikuti jenis media yang diklik — masuk lewat video lalu
  // mendarat di tab Foto (yang tak memuatnya) akan terasa seperti salah klik.
  const openMedia = (index: number) => {
    setMediaTab(media[index]?.type === 'video' ? 'video' : 'foto');
    onNavigate(mediaPath);
  };

  // ── View: Semua Media ──
  if (view.kind === 'media') {
    // Indeks yang dibawa ke lightbox tetap indeks GLOBAL (posisi di media[]),
    // sehingga geser kiri/kanan di dalam modal melintasi seluruh media —
    // bukan cuma isi tab yang sedang tampil.
    const entries = media.map((item, index) => ({ item, index }));
    // Chip kategori hanya hidup di tab Foto, dan hanya kategori yang benar-benar
    // punya foto yang muncul — aturan "chip hanya bila bermakna" seperti saringan
    // daftar hotel. Foto tanpa kategori hanya terlihat lewat chip "Semua".
    const photoCategories = hotelMediaCategories(media.filter(m => m.type === 'image'));
    const activeCategory = mediaTab === 'foto' ? photoCategory : '';
    const tabEntries = entries
      .filter(e => (mediaTab === 'video' ? e.item.type === 'video' : e.item.type === 'image'))
      .filter(e => !activeCategory || (e.item.category || '').toLowerCase() === activeCategory.toLowerCase());
    const photoCount = media.length - videos.length;
    return (
      <HotelViewShell {...shellProps}>
        {detailError && !detail && (
          <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl text-xs text-red-600 dark:text-red-400 font-medium">
            {detailError}
          </div>
        )}
        {!detail && !detailError && <HotelSkeletonDetail />}
        {detail && (
          <>
            {media.length > 0 && (
              <>
                {/* SegmentedControl dalam sub-bar sticky = pola baku halaman
                    anak (SettingsPage/StatistikPage, lihat Kelola Hotel). */}
                <div
                  aria-label="Jenis media"
                  style={{ top: DASHBOARD_SUBPAGE_HEADER_H }}
                  className="sticky z-20 -mx-4 -mt-4 mb-3 border-b border-gray-100 bg-white/90 px-4 py-2 backdrop-blur-md dark:border-slate-700/50 dark:bg-slate-900/90"
                >
                  <SegmentedControl
                    options={[
                      { value: 'foto', label: `Foto · ${photoCount}`, icon: ImageIcon },
                      { value: 'video', label: `Video · ${videos.length}`, icon: Play },
                    ]}
                    value={mediaTab}
                    onChange={value => setMediaTab(value as MediaTab)}
                    accent="emerald"
                  />
                </div>

                {mediaTab === 'foto' && photoCategories.length > 0 && (
                  <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                    {['', ...photoCategories].map(category => {
                      const active = photoCategory === category;
                      return (
                        <button
                          key={category || '__semua__'}
                          onClick={() => setPhotoCategory(category)}
                          aria-pressed={active}
                          className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                            active
                              ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                              : 'border border-gray-200 bg-gray-50 text-gray-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
                          }`}
                        >
                          {category || 'Semua'}
                        </button>
                      );
                    })}
                  </div>
                )}

                {tabEntries.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {tabEntries.map(({ item, index }) => (
                      <button
                        key={item.url}
                        onClick={() => setViewerIndex(index)}
                        aria-label={item.type === 'video' ? `Putar video ${index + 1}` : `Lihat foto ${index + 1}`}
                        aria-haspopup="dialog"
                        className="relative aspect-square overflow-hidden rounded-xl border border-gray-100 dark:border-slate-700 bg-gray-100 dark:bg-slate-700 transition-all hover:shadow-md active:scale-[0.97]"
                      >
                        {item.type === 'video' ? (
                          <div className="flex h-full w-full items-center justify-center bg-slate-800">
                            <Play size={18} className="text-white" />
                          </div>
                        ) : (
                          <img src={item.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="py-10 text-center">
                    <ImageOff size={32} className="mx-auto text-gray-300 dark:text-slate-600" />
                    <p className="mt-2 text-xs text-gray-400 dark:text-slate-500">
                      {mediaTab === 'video'
                        ? 'Hotel ini belum punya video.'
                        : activeCategory
                        ? `Belum ada foto ${activeCategory}.`
                        : 'Hotel ini belum punya foto.'}
                    </p>
                  </div>
                )}
              </>
            )}

            {media.length === 0 && (
              <div className="py-10 text-center">
                <ImageOff size={32} className="mx-auto text-gray-300 dark:text-slate-600" />
                <p className="mt-2 text-xs text-gray-400 dark:text-slate-500">Hotel ini belum punya foto atau video.</p>
              </div>
            )}

            {/* Klik thumbnail → lightbox layar penuh (pola viewer media Teras):
                geser kiri/kanan, panah, Escape, kunci scroll. */}
            <AnimatePresence>
              {viewerIndex !== null && (
                <MediaViewerModal
                  media={media}
                  initialIndex={viewerIndex}
                  label={detail.name}
                  watermark={watermark}
                  onClose={() => setViewerIndex(null)}
                />
              )}
            </AnimatePresence>
          </>
        )}
      </HotelViewShell>
    );
  }

  // Tombol back detail → daftar ada di header DashboardLayout.
  return (
    <HotelViewShell {...shellProps}>
      {detailError && !detail && (
        <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl text-xs text-red-600 dark:text-red-400 font-medium">
          {detailError}
        </div>
      )}

      {!detail && !detailError && <HotelSkeletonDetail />}

      {detail && (
        <>
          {/* Galeri: satu cover besar + tiga mini di bawahnya (pola tiket.com).
              Foto langsung membuka lightbox; HANYA kotak "Lihat semua" yang
              pindah ke halaman media.
              TANPA margin atas: shell sudah memberi pt-4, dan margin tambahan
              membuat jarak atas (28px) tak sebanding dengan px-4 di sisinya. */}
          <div>
            <button
              onClick={() => setViewerIndex(0)}
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
                      onClick={() => (isLastSlot ? openMedia(mediaIdx) : setViewerIndex(mediaIdx))}
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

          {/* Identitas */}
          <div className="mt-4">
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

          <HotelRatings ratings={detail.ratings || []} />

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
                  onClick={() => window.open(detail.gmaps_url || '', '_blank', 'noopener')}
                  className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-2.5 text-[13px] font-semibold text-gray-700 dark:text-slate-200 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700 active:scale-[0.98]"
                >
                  <MapPin size={15} />
                  Buka di Google Maps
                </button>
              )}
            </div>
          )}

          {detail.agent_note && (
            <div className="mt-5 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 p-3">
              <div className="flex items-center gap-1.5">
                <Lock size={13} className="text-amber-700 dark:text-amber-400" />
                <span className="text-xs font-bold text-amber-800 dark:text-amber-400">Catatan Agent</span>
                <span className="rounded-full bg-amber-200/70 dark:bg-amber-800/50 px-1.5 py-px text-[9px] font-semibold text-amber-800 dark:text-amber-300">
                  internal
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-amber-900 dark:text-amber-200 whitespace-pre-line">{detail.agent_note}</p>
            </div>
          )}

          {videos.length > 0 && (
            <div className="mt-5">
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Video ({videos.length})</h3>
              <div className="mt-2 space-y-3">
                {videos.map(video => (
                  <div key={video.url} className="overflow-hidden rounded-2xl border border-gray-100 dark:border-slate-700 bg-slate-900">
                    <PlyrVideo src={video.url} mode="fit" ariaLabel={`Video ${detail.name}`} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Galeri terpisah dari media resmi di atas: tiap agent boleh
              menambahkan foto/video versi mereka sendiri (lihat
              HotelAgentGallery.tsx), bukan cuma satu galeri kurasi admin. */}
          <HotelAgentGallerySection hotelSlug={detail.slug} hotelName={detail.name} currentAgentSlug={agentSlug} />

          {/* Lightbox yang sama dengan halaman media — foto di galeri detail
              dibuka langsung, tanpa mampir ke halaman media dulu. */}
          <AnimatePresence>
            {viewerIndex !== null && (
              <MediaViewerModal
                media={media}
                initialIndex={viewerIndex}
                label={detail.name}
                watermark={watermark}
                onClose={() => setViewerIndex(null)}
              />
            )}
          </AnimatePresence>
        </>
      )}
    </HotelViewShell>
  );
}
