import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Masuk ke Direktori Hotel harus punya SATU tampilan tunggu saja.
 *
 * Dulu urutannya: spinner tengah layar (fallback Suspense selagi chunk
 * HotelPage diunduh) → skeleton milik HotelPage (memudar masuk dari opacity 0)
 * → isi, ditambah gambar kartu kategori yang berganti sendiri setelah banner
 * tiba. Empat pergantian tampilan untuk satu kali masuk halaman — itulah yang
 * dikeluhkan sebagai "flickering". Tes ini menjaga ketiga akarnya tetap
 * tertutup.
 */

const layoutSource = readFileSync(
  new URL('../src/components/DashboardLayout.tsx', import.meta.url),
  'utf8',
);
const pageSource = readFileSync(
  new URL('../src/components/HotelPage.tsx', import.meta.url),
  'utf8',
);
const skeletonSource = readFileSync(
  new URL('../src/components/HotelSkeletons.tsx', import.meta.url),
  'utf8',
);

test('fallback Suspense rute hotel memakai skeleton, bukan spinner', () => {
  assert.match(layoutSource, /import HotelRouteSkeleton.*from '\.\/HotelSkeletons'/);
  assert.match(layoutSource, /isHotelRoute \? <HotelRouteSkeleton kind=\{hotelRouteSkeletonKind\(\)\} \/>/);
  // Bentuk skeleton ikut view tujuan supaya deep-link ke daftar/detail tidak
  // memulai dari kerangka kategori.
  assert.match(layoutSource, /function hotelRouteSkeletonKind/);
});

test('skeleton halaman dan skeleton fallback berasal dari berkas yang sama', () => {
  assert.match(pageSource, /HotelSkeletonKategori, HotelSkeletonList, HotelSkeletonDetail,\n\} from '\.\/HotelSkeletons'/);
  // Tidak boleh ada salinan kedua di HotelPage — dua bentuk yang menyimpang =
  // lompatan tata letak saat fallback berganti jadi halaman.
  assert.doesNotMatch(pageSource, /function SkeletonKategori/);
  assert.doesNotMatch(pageSource, /function SkeletonList/);
  assert.doesNotMatch(pageSource, /function SkeletonDetail/);
  // Lembar putih (kelas + tinggi minimum) juga satu sumber.
  assert.match(pageSource, /HOTEL_SHEET_CLASS/);
  assert.match(pageSource, /style=\{solid \? \{ minHeight: HOTEL_SHEET_MIN_HEIGHT \}/);
  assert.match(skeletonSource, /export const HOTEL_SHEET_CLASS/);
  assert.match(skeletonSource, /export const HOTEL_SHEET_MIN_HEIGHT/);
  assert.match(skeletonSource, /animate-pulse/);
  assert.match(skeletonSource, /role="status"/);
});

test('render pertama halaman tidak memudar masuk di atas skeleton yang sama', () => {
  assert.match(pageSource, /animateEntry\?: boolean/);
  assert.match(pageSource, /initial=\{animateEntry \? \{ opacity: 0/);
  assert.match(pageSource, /animateEntry: entered\.current/);
});

test('kartu kategori menunggu banner supaya gambarnya tidak berganti sendiri', () => {
  assert.match(pageSource, /view\.kind === 'kategori' && !banners/);
  // `lazy` pada empat kartu di puncak halaman justru menunda gambar yang sudah
  // terlihat.
  assert.doesNotMatch(pageSource, /alt=\{HOTEL_CITY_LABELS\[city\]\}[^>]*loading="lazy"/);
});

test('data direktori di-cache antar-mount (masuk ulang tanpa skeleton)', () => {
  assert.match(pageSource, /let hotelListCache/);
  assert.match(pageSource, /const hotelDetailCache = new Map/);
  assert.match(pageSource, /useState<HotelListItem\[\] \| null>\(hotelListCache\)/);
  // Detail dipilih saat render — setState di efek akan mencetak satu frame
  // skeleton untuk hotel yang datanya sudah ada.
  assert.match(pageSource, /hotelDetailCache\.get\(detailSlug\)/);
});

test('pindah tool tidak lagi mampir ke tab home (kedipan dashboard)', () => {
  assert.doesNotMatch(layoutSource, /setTimeout\(\(\) => setActiveTab\('ai-tools'\), 0\)/);
  assert.match(layoutSource, /onNavigate=\{\(toolId\) => navigatePath\(`\/dashboard\/ai-tools\/\$\{toolId\}`\)\}/);
});
