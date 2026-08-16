import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Building2, Search, Star, Footprints, MapPin, Lock, SlidersHorizontal,
  Play, ImageOff, Image as ImageIcon,
} from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { parseHotelDistanceMeters, hotelAreaCity } from '../../lib/hotel-directory.js';
import { getAuthHeaders } from './LoginPage';
import { trackEvent } from '../utils/analytics';
import PlyrVideo from './PlyrVideo';
import HotelFilterSheet from './HotelFilterSheet';
import SegmentedControl from './common/SegmentedControl';
import { DASHBOARD_SUBPAGE_HEADER_H } from '../constants/dashboard-chrome';

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
  agent_note: string | null;
  media: HotelMediaItem[];
}

export const HOTEL_CITIES = ['mekkah', 'madinah', 'turki', 'dubai'] as const;
export const HOTEL_CITY_LABELS: Record<string, string> = {
  mekkah: 'Mekkah',
  madinah: 'Madinah',
  turki: 'Turki',
  dubai: 'Dubai',
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

// View diturunkan dari URL (/dashboard/ai-tools/hotel[/:city[/:slug]]) supaya
// tombol back header DashboardLayout jadi satu-satunya navigasi mundur —
// tanpa baris back kedua di dalam halaman (keluhan "navigasi double").
function readHotelView(): View {
  const segments = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
  const city = decodeURIComponent(segments[3] || '');
  if (HOTEL_CITIES.includes(city)) {
    const slug = decodeURIComponent(segments[4] || '');
    if (slug && segments[5] === 'media') return { kind: 'media', city, slug };
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
export function HotelViewShell({ viewKey, children }: { viewKey: string; children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      key={viewKey}
      initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="px-4 pt-4 pb-8"
    >
      {children}
    </motion.div>
  );
}

const SKELETON_BLOCK = 'bg-gray-100 dark:bg-slate-800 animate-pulse';

// Chip saringan daftar — mengikuti pola pill filter panel Kelola (aktif emerald).

function SkeletonKategori() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className={`h-40 rounded-2xl ${SKELETON_BLOCK}`} />
      ))}
    </div>
  );
}

function SkeletonList() {
  return (
    <>
      <div className={`h-[42px] rounded-xl ${SKELETON_BLOCK}`} />
      <div className="space-y-3 mt-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="flex items-center gap-3 p-2.5 bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm">
            <div className="h-16 w-16 shrink-0 rounded-xl bg-gray-100 dark:bg-slate-700 animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-3/5 rounded bg-gray-100 dark:bg-slate-700 animate-pulse" />
              <div className="h-3 w-2/5 rounded bg-gray-100 dark:bg-slate-700 animate-pulse" />
              <div className="h-3 w-1/3 rounded bg-gray-100 dark:bg-slate-700 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function SkeletonDetail() {
  return (
    <>
      <div className={`mt-3 h-56 rounded-2xl ${SKELETON_BLOCK}`} />
      <div className={`mt-4 h-4 w-20 rounded-full ${SKELETON_BLOCK}`} />
      <div className={`mt-2 h-6 w-3/4 rounded ${SKELETON_BLOCK}`} />
      <div className={`mt-3 h-12 rounded-xl ${SKELETON_BLOCK}`} />
      <div className={`mt-4 h-24 rounded-2xl ${SKELETON_BLOCK}`} />
    </>
  );
}

export default function HotelPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  // Re-render tiap navigasi datang dari pathTick DashboardLayout.
  const view = readHotelView();
  const [hotels, setHotels] = useState<HotelListItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detail, setDetail] = useState<HotelDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [starFilter, setStarFilter] = useState<number | null>(null);
  const [areaFilter, setAreaFilter] = useState<string | null>(null);
  const [sortByDistance, setSortByDistance] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [mediaTab, setMediaTab] = useState<MediaTab>('foto');
  const [banners, setBanners] = useState<Record<string, string | null>>({});

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
      .then(data => { if (!cancelled) { setHotels(data); setLoadError(null); } })
      .catch(err => { if (!cancelled) setLoadError(err.message); });
    // Banner opsional — gagal memuat = kartu kategori jatuh ke cover hotel.
    fetchHotelJson<Record<string, string | null>>('/api/hotels/banners')
      .then(data => { if (!cancelled) setBanners(data); })
      .catch(() => { /* fallback cover */ });
    return () => { cancelled = true; };
  }, []);

  // Kunci primitif, bukan objek view — readHotelView membuat objek baru tiap render.
  // Halaman media ikut memakai detail yang sama; karena slug-nya identik, pindah
  // detail↔media TIDAK memicu fetch ulang dan mediaIndex terpilih ikut terbawa.
  const detailSlug = view.kind === 'detail' || view.kind === 'media' ? view.slug : null;
  const listCity = view.kind === 'list' ? view.city : null;

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
    setDetail(null);
    setDetailError(null);
    setMediaIndex(0);
    setMediaTab('foto');
    fetchHotelJson<HotelDetail>(`/api/hotels/${encodeURIComponent(detailSlug)}`)
      .then(data => { if (!cancelled) setDetail(data); })
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

  if (loadError) {
    return (
      <HotelViewShell viewKey="error">
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl text-xs text-red-600 dark:text-red-400 font-medium">
          {loadError}
        </div>
      </HotelViewShell>
    );
  }

  // Skeleton mengikuti bentuk view tujuan (termasuk deep link ke daftar/detail).
  if (!hotels) {
    return (
      <HotelViewShell viewKey={viewKey}>
        {view.kind === 'kategori' ? <SkeletonKategori /> : view.kind === 'list' ? <SkeletonList /> : <SkeletonDetail />}
      </HotelViewShell>
    );
  }

  // ── View: Pilih Kategori ──
  if (view.kind === 'kategori') {
    return (
      <HotelViewShell viewKey={viewKey}>
        <div className="flex flex-col gap-3">
          {HOTEL_CITIES.map(city => {
            const bannerSrc = banners[city] || coverByCity[city];
            return (
              <button
                key={city}
                onClick={() => onNavigate(`/dashboard/ai-tools/hotel/${city}`)}
                className="relative h-40 overflow-hidden rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm text-left transition-all hover:shadow-lg active:scale-[0.97]"
              >
                {bannerSrc ? (
                  <img src={bannerSrc} alt={HOTEL_CITY_LABELS[city]} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-teal-400 to-teal-600 dark:from-teal-600 dark:to-teal-800">
                    <Building2 size={32} className="text-white/70" />
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-slate-900/60 px-3 py-2">
                  <p className="text-sm font-bold text-white">{HOTEL_CITY_LABELS[city]}</p>
                  <p className="text-[11px] text-white/80">{countsByCity[city]} hotel</p>
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
      <HotelViewShell viewKey={viewKey}>
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
              onClick={() => onNavigate(`/dashboard/ai-tools/hotel/${hotel.city}/${encodeURIComponent(hotel.slug)}`)}
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
                {/* Hotel tanpa media tidak diberi badge apa pun (feedback user):
                    itu urusan admin, bukan informasi yang berguna bagi agent. */}
                {hotel.photo_count + hotel.video_count > 0 && (
                  <p className="mt-1 text-[11px] text-gray-400 dark:text-slate-500">
                    {hotel.photo_count} foto · {hotel.video_count} video
                  </p>
                )}
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
  const activeMedia = media[mediaIndex] || null;
  const videos = media.filter(m => m.type === 'video');
  const mediaPath = `/dashboard/ai-tools/hotel/${view.city}/${encodeURIComponent(view.slug)}/media`;
  // Tab dibuka mengikuti jenis media yang diklik — masuk lewat video lalu
  // mendarat di tab Foto (yang tak memuatnya) akan terasa seperti salah klik.
  const openMedia = (index: number) => {
    setMediaIndex(index);
    setMediaTab(media[index]?.type === 'video' ? 'video' : 'foto');
    onNavigate(mediaPath);
  };

  // ── View: Semua Media ──
  if (view.kind === 'media') {
    // Indeks GLOBAL tetap dipertahankan (viewer memakai media[mediaIndex]);
    // tab hanya menyaring grid, jadi tidak ada indeks kedua yang bisa geser.
    const entries = media.map((item, index) => ({ item, index }));
    const tabEntries = entries.filter(e => (mediaTab === 'video' ? e.item.type === 'video' : e.item.type === 'image'));
    const photoCount = media.length - videos.length;
    return (
      <HotelViewShell viewKey={viewKey}>
        {detailError && (
          <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl text-xs text-red-600 dark:text-red-400 font-medium">
            {detailError}
          </div>
        )}
        {!detail && !detailError && <SkeletonDetail />}
        {detail && (
          <>
            <div className="relative h-64 overflow-hidden rounded-2xl border border-gray-100 dark:border-slate-700 bg-gray-100 dark:bg-slate-700 shadow-sm">
              {activeMedia ? (
                activeMedia.type === 'video' ? (
                  <PlyrVideo src={activeMedia.url} mode="fit" className="h-full w-full" ariaLabel={`Video ${detail.name}`} />
                ) : (
                  <img src={activeMedia.url} alt={detail.name} className="h-full w-full object-cover" />
                )
              ) : (
                <div className="flex h-full items-center justify-center">
                  <ImageOff size={32} className="text-gray-300 dark:text-slate-500" />
                </div>
              )}
              {media.length > 1 && (
                <span className="absolute right-3 top-3 rounded-full bg-slate-900/70 px-2 py-0.5 text-[10px] font-semibold text-white">
                  {mediaIndex + 1}/{media.length}
                </span>
              )}
            </div>

            {media.length > 0 && (
              <>
                {/* SegmentedControl dalam sub-bar sticky = pola baku halaman
                    anak (SettingsPage/StatistikPage, lihat Kelola Hotel).
                    Sub-bar TIDAK di puncak halaman karena viewer di atasnya
                    ikut menggulung; ia menempel begitu tersentuh header. */}
                <div
                  aria-label="Jenis media"
                  style={{ top: DASHBOARD_SUBPAGE_HEADER_H }}
                  className="sticky z-20 -mx-4 mt-3 border-y border-gray-100 bg-white/90 px-4 py-2 backdrop-blur-md dark:border-slate-700/50 dark:bg-slate-900/90"
                >
                  <SegmentedControl
                    options={[
                      { value: 'foto', label: `Foto · ${photoCount}`, icon: ImageIcon },
                      { value: 'video', label: `Video · ${videos.length}`, icon: Play },
                    ]}
                    value={mediaTab}
                    onChange={value => {
                      const tab = value as MediaTab;
                      setMediaTab(tab);
                      // Viewer mengikuti tab: kalau isinya bukan jenis tab itu,
                      // lompat ke item pertama jenis tersebut (bila ada).
                      const wantVideo = tab === 'video';
                      if (activeMedia && (activeMedia.type === 'video') === wantVideo) return;
                      const first = media.findIndex(m => (m.type === 'video') === wantVideo);
                      if (first >= 0) setMediaIndex(first);
                    }}
                    accent="emerald"
                  />
                </div>

                {tabEntries.length > 0 ? (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {tabEntries.map(({ item, index }) => (
                      <button
                        key={item.url}
                        onClick={() => setMediaIndex(index)}
                        aria-label={item.type === 'video' ? `Putar video ${index + 1}` : `Lihat foto ${index + 1}`}
                        aria-current={index === mediaIndex}
                        className={`relative aspect-square overflow-hidden rounded-xl border-2 transition-all active:scale-[0.97] ${
                          index === mediaIndex ? 'border-teal-500' : 'border-transparent'
                        }`}
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
                      {mediaTab === 'video' ? 'Hotel ini belum punya video.' : 'Hotel ini belum punya foto.'}
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
          </>
        )}
      </HotelViewShell>
    );
  }

  // Tombol back detail → daftar ada di header DashboardLayout.
  return (
    <HotelViewShell viewKey={viewKey}>
      {detailError && (
        <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl text-xs text-red-600 dark:text-red-400 font-medium">
          {detailError}
        </div>
      )}

      {!detail && !detailError && <SkeletonDetail />}

      {detail && (
        <>
          {/* Galeri: satu cover besar + tiga mini di bawahnya (pola tiket.com);
              mini terakhir menjadi pintu "Lihat semua" ke halaman media. */}
          <div className="mt-3">
            <button
              onClick={() => openMedia(0)}
              disabled={media.length === 0}
              aria-label={media.length ? `Lihat semua media ${detail.name}` : undefined}
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
                      onClick={() => openMedia(mediaIdx)}
                      aria-label={isLastSlot ? `Lihat semua media ${detail.name}` : `Lihat media ${mediaIdx + 1}`}
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

          {detail.description && (
            <div className="mt-5">
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Tentang Hotel</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-gray-600 dark:text-slate-300 whitespace-pre-line">{detail.description}</p>
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

          {(detail.address || detail.gmaps_url) && (
            <div className="mt-5">
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Lokasi</h3>
              {detail.address && (
                <p className="mt-1.5 text-[13px] leading-relaxed text-gray-600 dark:text-slate-300">{detail.address}</p>
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
        </>
      )}
    </HotelViewShell>
  );
}
