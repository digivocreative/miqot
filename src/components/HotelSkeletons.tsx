import { DASHBOARD_SUBPAGE_HEADER_H } from '../constants/dashboard-chrome';

// Skeleton Direktori Hotel — SENGAJA di berkas sendiri (eager, ~1KB) alih-alih
// di dalam HotelPage: DashboardLayout memakainya sebagai fallback Suspense
// selagi chunk HotelPage diunduh, sementara HotelPage memakai komponen yang
// SAMA saat datanya belum tiba. Satu sumber bentuk = pergantian
// fallback → halaman tidak berkedip (dulu: spinner tengah layar dulu, baru
// skeleton — dua keadaan visual berbeda untuk satu kali masuk halaman).

// Lembar putih halaman Hotel. Dipakai bareng HotelViewShell supaya kelas
// lembarnya tidak bercabang dua.
export const HOTEL_SHEET_CLASS =
  'bg-white dark:bg-slate-900 sm:border-x sm:border-gray-100 dark:sm:border-slate-800';
export const HOTEL_SHEET_MIN_HEIGHT = `calc(100dvh - ${DASHBOARD_SUBPAGE_HEADER_H}px)`;

const BLOCK = 'bg-gray-100 dark:bg-slate-800 animate-pulse motion-reduce:animate-none';
const INNER_BLOCK = 'bg-gray-100 dark:bg-slate-700 animate-pulse motion-reduce:animate-none';

export function HotelSkeletonKategori() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className={`h-40 rounded-2xl ${BLOCK}`} />
      ))}
    </div>
  );
}

export function HotelSkeletonList() {
  return (
    <div aria-hidden="true">
      <div className={`h-[42px] rounded-xl ${BLOCK}`} />
      <div className="space-y-3 mt-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="flex items-center gap-3 p-2.5 bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm">
            <div className={`h-16 w-16 shrink-0 rounded-xl ${INNER_BLOCK}`} />
            <div className="flex-1 space-y-2">
              <div className={`h-3.5 w-3/5 rounded ${INNER_BLOCK}`} />
              <div className={`h-3 w-2/5 rounded ${INNER_BLOCK}`} />
              <div className={`h-3 w-1/3 rounded ${INNER_BLOCK}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Tanpa margin atas pada blok pertama: galeri detail yang asli pun menempel di
// pt-4 milik lembar, jadi jarak tambahan di sini akan terlihat sebagai
// pergeseran saat skeleton berganti konten.
export function HotelSkeletonDetail() {
  return (
    <div aria-hidden="true">
      <div className={`h-56 rounded-2xl ${BLOCK}`} />
      <div className="mt-2 grid grid-cols-3 gap-2">
        {[0, 1, 2].map(i => (
          <div key={i} className={`h-20 rounded-xl ${BLOCK}`} />
        ))}
      </div>
      <div className={`mt-4 h-6 w-3/4 rounded ${BLOCK}`} />
      <div className={`mt-2 h-4 w-24 rounded-full ${BLOCK}`} />
      <div className={`mt-3 h-12 rounded-xl ${BLOCK}`} />
      <div className={`mt-5 h-24 rounded-2xl ${BLOCK}`} />
    </div>
  );
}

export type HotelSkeletonKind = 'kategori' | 'list' | 'detail';

// Fallback Suspense DashboardLayout: bentuknya mengikuti view tujuan supaya
// deep-link ke daftar/detail tidak memulai dari kerangka kategori dulu.
export default function HotelRouteSkeleton({ kind }: { kind: HotelSkeletonKind }) {
  return (
    <div
      className={`px-4 pt-4 pb-8 ${HOTEL_SHEET_CLASS}`}
      style={{ minHeight: HOTEL_SHEET_MIN_HEIGHT }}
      role="status"
      aria-live="polite"
      aria-label="Memuat direktori hotel"
    >
      <span className="sr-only">Memuat direktori hotel...</span>
      {kind === 'kategori' ? <HotelSkeletonKategori />
        : kind === 'list' ? <HotelSkeletonList />
        : <HotelSkeletonDetail />}
    </div>
  );
}
