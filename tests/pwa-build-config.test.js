import { test } from 'node:test';
import assert from 'node:assert/strict';
import { minimatch } from 'minimatch';
import {
  manualChunkFor,
  PRECACHE_GLOB_PATTERNS,
  PRECACHE_GLOB_IGNORES,
  NAVIGATE_FALLBACK_DENYLIST,
  isHashedAsset,
  isFontRequest,
  isAgentPhotoImage,
  isHotelMediaImage,
  isSameOriginImage,
  isNavigationRequest,
} from '../src/lib/pwa/buildConfig.js';

// Audit 2026-09-17: manualChunks menyeret modul kecil yang dipakai entry (react-dom,
// tslib, helper preload Vite) ke chunk vendor PDF/Leaflet → 3,1 MB JS dimuat di SETIAP
// halaman. Modul-modul bersama itu wajib punya chunk sendiri.
test('modul runtime bersama masuk vendor-react, bukan chunk vendor berat', () => {
  for (const id of [
    '/repo/node_modules/react/index.js',
    '/repo/node_modules/react/jsx-runtime.js',
    '/repo/node_modules/react-dom/cjs/react-dom.production.min.js',
    '/repo/node_modules/scheduler/index.js',
    '/repo/node_modules/tslib/tslib.es6.mjs',
    '\0vite/preload-helper',
    '\0vite/preload-helper.js',
    '\0commonjsHelpers.js',
  ]) {
    assert.equal(manualChunkFor(id), 'vendor-react', id);
  }
});

test('grup vendor lama tetap di chunk masing-masing', () => {
  assert.equal(manualChunkFor('/repo/node_modules/@react-pdf/renderer/lib/react-pdf.browser.js'), 'vendor-pdf-renderer');
  assert.equal(manualChunkFor('/repo/node_modules/react-pdf/dist/esm/index.js'), 'vendor-pdf-viewer');
  assert.equal(manualChunkFor('/repo/node_modules/pdfjs-dist/build/pdf.mjs'), 'vendor-pdf-viewer');
  assert.equal(manualChunkFor('/repo/node_modules/react-leaflet/lib/index.js'), 'vendor-leaflet');
  assert.equal(manualChunkFor('/repo/node_modules/leaflet/dist/leaflet-src.js'), 'vendor-leaflet');
  assert.equal(manualChunkFor('/repo/node_modules/framer-motion/dist/es/index.mjs'), 'vendor-framer');
  assert.equal(manualChunkFor('/repo/node_modules/recharts/es6/index.js'), 'vendor-recharts');
  assert.equal(manualChunkFor('/repo/node_modules/modern-screenshot/dist/index.mjs'), 'vendor-screenshot');
  assert.equal(manualChunkFor('/repo/src/components/PackageCard.tsx'), undefined);
});

function precached(path) {
  return PRECACHE_GLOB_PATTERNS.some((p) => minimatch(path, p))
    && !PRECACHE_GLOB_IGNORES.some((p) => minimatch(path, p));
}

// Audit: precache 17,4 MB terkompresi, 79% bukan aplikasi. Precache = shell saja.
test('precache hanya memuat shell aplikasi', () => {
  for (const path of [
    'index.html',
    'offline.html',
    'assets/index-f9f752b8.js',
    'assets/index-d4fa2390.css',
    'assets/vendor-react-b56e0638.js',
    'assets/new-logo-alhijaz-colored-b3a9635c.png',
    'icon-192x192.png',
    'icon-maskable-512x512.png',
    'apple-touch-icon.png',
    'favicon.svg',
    'fonts/brochure/Inter-Regular.woff2',
    'fonts/brochure/Inter-SemiBold.woff2',
    'fonts/brochure/Inter-Bold.woff2',
  ]) {
    assert.equal(precached(path), true, `${path} harus di-precache`);
  }
  for (const path of [
    'assets/vendor-pdf-renderer-9b5318e3.js',
    'assets/vendor-pdf-viewer-17fd9023.js',
    'assets/vendor-pdf-viewer-201afb46.css',
    'assets/vendor-leaflet-97fb6f48.js',
    'assets/vendor-recharts-c6c9e651.js',
    'assets/jspdf.es.min-2b573246.js',
    'assets/html2canvas.esm-e0a7d97b.js',
    // Data jamaah per kloter (nama, umur, nomor HP): hanya untuk pengunjung halaman kloter.
    'assets/kloter-data-kloter45-20ec795c.js',
    'assets/pdf.worker.min-dbcae78a.mjs',
    'og/bagas.png',
    'img-brosur/cover-katalog.png',
    'wp-content/plugins/elementor/assets/lib/swiper/swiper.min.js',
    'wp-includes/js/jquery.min.js',
    'umroh.html',
    'haji-plus.html',
    'maintenance.html',
    'flags/turkey.webp',
    'screenshots/jadwal-narrow.webp',
    'logo-alhijaz-besar.png',
    'fonts/brochure/Oswald-Bold.woff2',
    'agents/bagas.jpg',
  ]) {
    assert.equal(precached(path), false, `${path} TIDAK boleh di-precache`);
  }
});

// Workbox NavigationRoute menguji pathname + search terhadap denylist.
function deniedNavigation(pathAndSearch) {
  return NAVIGATE_FALLBACK_DENYLIST.some((re) => re.test(pathAndSearch));
}

test('shell SW melayani rute SPA termasuk dashboard, login, portal, dan sub-halaman kloter', () => {
  for (const path of [
    '/',
    '/bagas',
    '/bagas?promo=1',
    '/bagas/JBU1504',
    '/bagas/kalkulasi',
    '/dashboard',
    '/dashboard/jamaah',
    '/dashboard/brosur',
    '/dashboard/teras/post/abc123',
    '/login',
    '/26SEP2026',
    '/26SEP2026/doa',
    '/26SEP2026/itinerary',
    '/bagas/jamaah/abc23/dashboard',
    '/j/abc23',
    '/top-partner',
  ]) {
    assert.equal(deniedNavigation(path), false, `${path} harus dilayani shell`);
  }
});

test('halaman server-rendered dan berkas tetap langsung ke jaringan', () => {
  for (const path of [
    '/api/version',
    '/bagas/umroh',
    '/bagas/haji/',
    '/bagas/bio',
    '/bio',
    // Denylist diuji terhadap pathname + search: link iklan (fbclid/utm) tetap harus
    // mendarat di landing server, bukan shell SPA + reload paksa.
    '/bagas/umroh?fbclid=IwAR0abc',
    '/bagas/haji?utm_source=facebook',
    '/bagas/bio?igsh=abc',
    '/itinerary/jbu1504.pdf',
    '/brosur/katalog.pdf',
    '/agents/bagas.jpg',
    '/f/abc123',
    '/haji-plus.html',
    '/umroh.html',
    '/og/bagas.png',
    '/wp-content/uploads/2026/03/itinerary-haji.webp',
  ]) {
    assert.equal(deniedNavigation(path), true, `${path} harus ke jaringan`);
  }
});

const req = (props) => props;
const u = (href) => new URL(href);

test('matcher rute runtime: aset ber-hash dan font same-origin', () => {
  assert.equal(isHashedAsset({ url: u('https://alhijaz.co/assets/vendor-pdf-renderer-9b5318e3.js'), sameOrigin: true }), true);
  assert.equal(isHashedAsset({ url: u('https://alhijaz.co/assets/index-d4fa2390.css'), sameOrigin: true }), true);
  assert.equal(isHashedAsset({ url: u('https://cdn.example.com/assets/x.js'), sameOrigin: false }), false);
  assert.equal(isHashedAsset({ url: u('https://alhijaz.co/fonts/brochure/Inter-Bold.woff2'), sameOrigin: true }), false);
  assert.equal(isFontRequest({ url: u('https://alhijaz.co/fonts/brochure/Oswald-Bold.woff2'), sameOrigin: true }), true);
  assert.equal(isFontRequest({ url: u('https://alhijaz.co/assets/index.js'), sameOrigin: true }), false);
});

// Audit: pola lama `(?:^\/agents\/|…)` tak pernah cocok (Workbox mencocokkan url.href,
// dan kecocokan lintas-origin wajib mulai di index 0) → cache agent-photos tak pernah ada.
test('matcher foto agent cocok untuk <img> lokal & Supabase, tidak untuk fetch()', () => {
  const img = req({ destination: 'image' });
  const fetchReq = req({ destination: '' });
  assert.equal(isAgentPhotoImage({ request: img, url: u('https://sb.alhijaz.co/storage/v1/object/public/agent-photos/bagas.jpg?v=1784597736198') }), true);
  assert.equal(isAgentPhotoImage({ request: img, url: u('https://abcd.supabase.co/storage/v1/object/public/agent-photos/nikita.webp') }), true);
  assert.equal(isAgentPhotoImage({ request: img, url: u('https://alhijaz.co/agents/bagas.jpg') }), true);
  // fetch() mode cors (ekspor brosur/foto via blob) tidak boleh diberi respons opaque dari cache.
  assert.equal(isAgentPhotoImage({ request: fetchReq, url: u('https://sb.alhijaz.co/storage/v1/object/public/agent-photos/bagas.jpg') }), false);
  assert.equal(isAgentPhotoImage({ request: img, url: u('https://sb.alhijaz.co/storage/v1/object/public/hotel-media/a.jpg') }), false);
});

test('matcher media hotel dan gambar same-origin', () => {
  const img = req({ destination: 'image' });
  assert.equal(isHotelMediaImage({ request: img, url: u('https://alhijaz.b-cdn.net/hotels/makkah/a-1234.webp') }), true);
  assert.equal(isHotelMediaImage({ request: req({ destination: '' }), url: u('https://alhijaz.b-cdn.net/hotels/makkah/a-1234.webp') }), false);
  assert.equal(isSameOriginImage({ request: img, url: u('https://alhijaz.co/flags/turkey.webp'), sameOrigin: true }), true);
  assert.equal(isSameOriginImage({ request: img, url: u('https://alhijaz.co/img-brosur/kabah.png'), sameOrigin: true }), true);
  for (const path of ['/itinerary/a.jpg', '/brosur/a.png', '/agents/bagas.jpg', '/og/bagas.png']) {
    assert.equal(isSameOriginImage({ request: img, url: u(`https://alhijaz.co${path}`), sameOrigin: true }), false, path);
  }
  assert.equal(isSameOriginImage({ request: img, url: u('https://other.example/flags/a.webp'), sameOrigin: false }), false);
  assert.equal(isNavigationRequest({ request: req({ mode: 'navigate' }) }), true);
  assert.equal(isNavigationRequest({ request: req({ mode: 'cors' }) }), false);
});

// Workbox menyerialisasi callback lewat Function.prototype.toString() ke dalam sw.js,
// jadi callback tidak boleh bergantung pada variabel di luar badan fungsinya.
test('callback matcher mandiri (aman diserialisasi ke sw.js)', () => {
  for (const fn of [isHashedAsset, isFontRequest, isAgentPhotoImage, isHotelMediaImage, isSameOriginImage, isNavigationRequest]) {
    const rebuilt = new Function(`return (${fn.toString()})`)();
    assert.equal(typeof rebuilt, 'function', fn.name);
  }
  const rebuilt = new Function(`return (${isAgentPhotoImage.toString()})`)();
  assert.equal(rebuilt({ request: { destination: 'image' }, url: u('https://alhijaz.co/agents/bagas.jpg') }), true);
});
