// Bagian murni dari konfigurasi build PWA (vite.config.ts) supaya bisa diuji node:test.
//
// PERHATIAN untuk callback matcher di bawah: Workbox menyerialisasi callback
// runtimeCaching lewat Function.prototype.toString() ke dalam sw.js. Badan fungsi
// tidak boleh memakai variabel/impor di luar dirinya sendiri.

// Modul kecil yang dipakai entry DAN vendor berat wajib punya chunk sendiri. Kalau
// tidak, Rollup menyeretnya ke chunk manual pertama yang memakainya (react-dom →
// leaflet, tslib → @react-pdf, helper preload Vite → react-pdf) dan entry jadi
// mengimpor chunk berat itu secara statis — 3,1 MB JS di setiap halaman (audit 2026-09-17).
export function manualChunkFor(id) {
  if (
    id.includes('vite/preload-helper') ||
    id.includes('commonjsHelpers') ||
    /[\\/]node_modules[\\/](?:react|react-dom|scheduler|tslib)[\\/]/.test(id)
  ) {
    return 'vendor-react';
  }
  if (id.includes('@react-pdf/')) return 'vendor-pdf-renderer';
  if (id.includes('react-pdf') || id.includes('pdfjs-dist')) return 'vendor-pdf-viewer';
  if (id.includes('framer-motion')) return 'vendor-framer';
  if (id.includes('modern-screenshot')) return 'vendor-screenshot';
  // recharts (Analytics/Statistik/HajiPlus) — hanya lewat halaman lazy
  if (id.includes('recharts')) return 'vendor-recharts';
  // leaflet + react-leaflet (FlightSharePage / FlightMap)
  if (id.includes('leaflet')) return 'vendor-leaflet';
  return undefined;
}

// Data jamaah per kloter (src/lib/kloter/*: nama, umur, nomor HP) mendapat nama
// chunk tetap supaya bisa dikecualikan dari precache — precache diunduh SETIAP
// pengunjung. Halaman kloter memuat chunk-nya sendiri (lazy), lalu isHashedAsset
// menyimpannya di cache runtime. Dipanggil Rollup saat build, bukan diserialisasi.
const KLOTER_DATA_CHUNK_PREFIX = 'kloter-data-';

export function chunkFileNameFor(chunk) {
  return chunk.facadeModuleId?.includes('/src/lib/kloter/')
    ? `assets/${KLOTER_DATA_CHUNK_PREFIX}[name]-[hash].js`
    : 'assets/[name]-[hash].js';
}

// Precache = shell aplikasi saja. Gambar OG (untuk crawler), cover brosur, aset
// WordPress landing, dan vendor berat yang hanya dipakai fitur tertentu diambil
// saat dibutuhkan lewat runtime cache.
export const PRECACHE_GLOB_PATTERNS = [
  'index.html',
  'offline.html',
  'assets/**/*.{js,css,png,svg,webp}',
  'icon-*.png',
  'apple-touch-icon.png',
  'favicon.svg',
  // Hanya subset Latin yang di-preload index.html; berkas penuh & latin-ext diambil
  // runtime cache bila ada glyph di luar Latin.
  'fonts/brochure/Inter-{Regular,SemiBold,Bold,ExtraBold}-latin.woff2',
];

export const PRECACHE_GLOB_IGNORES = [
  'assets/vendor-pdf-*',
  'assets/vendor-leaflet-*',
  'assets/vendor-recharts-*',
  'assets/jspdf*',
  'assets/html2canvas*',
  `assets/${KLOTER_DATA_CHUNK_PREFIX}*`,
];

// Navigasi yang TIDAK boleh dijawab shell SPA dari service worker. Workbox menguji
// pathname + search, jadi pola yang berakhir di `$` wajib menerima query (link iklan).
export const NAVIGATE_FALLBACK_DENYLIST = [
  /^\/api\//,
  // Landing server-rendered (functions/[slug]) dan halaman bio ber-OG
  /\/umroh\/?(?:\?.*)?$/,
  /\/haji\/?(?:\?.*)?$/,
  /\/bio\/?(?:\?.*)?$/,
  // Berkas PDF/gambar ber-URL tetap di origin
  /^\/brosur\//,
  /^\/itinerary\//,
  /^\/agents\//,
  /^\/og\//,
  /^\/wp-(?:content|includes)\//,
  // Share penerbangan (OG per kode)
  /^\/f\//,
  // Semua path berakhiran ekstensi berkas (umroh.html, haji-plus.html, *.pdf, …)
  /^[^?]*\/[^/?]+\.[a-z0-9]{2,8}(?:\?.*)?$/i,
];

export const isHashedAsset = ({ url, sameOrigin }) =>
  sameOrigin && url.pathname.startsWith('/assets/');

export const isFontRequest = ({ url, sameOrigin }) =>
  sameOrigin && url.pathname.startsWith('/fonts/');

// Hanya muatan <img> (destination 'image'). Respons <img> lintas-origin bersifat opaque;
// kalau fetch() dari JS (ekspor brosur/kartu memakai blob, mode cors) ikut tertangkap,
// SW menyodorkan respons opaque ke permintaan cors dan fetch-nya ditolak peramban.
export const isAgentPhotoImage = ({ request, url }) =>
  request.destination === 'image' &&
  (url.pathname.startsWith('/agents/') ||
    /\/storage\/v1\/object\/public\/agent-photos\//.test(url.pathname)) &&
  /\.(?:jpe?g|png|webp)$/i.test(url.pathname);

// Foto direktori hotel di Bunny: nama berkas content-addressed (…-<sha256>.<ext>),
// jadi entri cache tidak pernah basi.
export const isHotelMediaImage = ({ request, url }) =>
  request.destination === 'image' &&
  /^https:\/\/[^/]+\.b-cdn\.net\/(?:hotels|hotel-agent-media)\/.*\.(?:jpg|jpeg|png|webp)$/i.test(url.origin + url.pathname);

// Gambar same-origin (bendera kartu paket, logo bank, cover brosur). PDF/gambar
// itinerary & brosur berubah isi tanpa ganti URL — jangan pernah dihidupkan lagi dari cache.
export const isSameOriginImage = ({ request, url, sameOrigin }) =>
  sameOrigin &&
  request.destination === 'image' &&
  !/^\/(?:itinerary|brosur|agents|og|assets)\//.test(url.pathname);

export const isNavigationRequest = ({ request }) => request.mode === 'navigate';
