import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildBrochureCacheReset,
  buildCdnInvalidationUpdate,
  buildCdnMetadataUpdate,
  buildContentAddressedCdnPath,
  buildItineraryParseCandidates,
  buildSourceDownloadCandidates,
  canonicalScheduleSourceIdentity,
  getCdnFileDecision,
  resolveScheduleBrochureSource,
} from '../lib/cdn-file-sync.js';

test('buildContentAddressedCdnPath: fingerprints the object name to bypass stale edges', () => {
  assert.equal(
    buildContentAddressedCdnPath(
      'brosur',
      'JBU1493',
      '4da61f608ec16fdd074ae3cc35522a00fdbba90abbbbf384ef19c8baf1360d15',
      '.webp',
    ),
    'brosur/JBU1493-4da61f608ec16fdd.webp',
  );
});

test('resolveScheduleBrochureSource: uses the official August brochure for JBU1493', () => {
  assert.equal(
    resolveScheduleBrochureSource({
      jadwal_id: 'JBU1493',
      berangkat_tgl: '2026-08-16',
      brosur: 'https://jadwal.alhijaz.co/brosur/legacy-generated-image',
    }),
    'https://alhijaz.id/storage/2023/05/Umroh-Plus-Turki-2026-Agustus.webp',
  );

  assert.equal(
    resolveScheduleBrochureSource({
      jadwal_id: 'JBU1493',
      berangkat_tgl: '2027-08-16',
      brosur: 'https://jadwal.alhijaz.co/brosur/future-package',
    }),
    'https://jadwal.alhijaz.co/brosur/future-package',
  );
});

test('canonicalScheduleSourceIdentity: treats public host and direct IP as the same asset', () => {
  assert.equal(
    canonicalScheduleSourceIdentity('http://jadwal.alhijaz.co/brosur/paket-baru?x=1'),
    canonicalScheduleSourceIdentity('http://115.124.86.220/brosur/paket-baru?x=1'),
  );
});

// Hulu menerbitkan ulang token di ujung path pada SETIAP panggilan api-get, jadi
// dua bacaan brosur yang sama tidak pernah beridentitas sama kalau token itu ikut
// dihitung. Akibatnya nyata dan terukur: salinan CDN tiap paket dihapus tiap 30
// menit, lalu diunggah ulang byte-per-byte sama — dan selama jeda itu pembaca
// jatuh ke proksi origin yang tak bisa di-cache. Inilah "brosurnya lemot".
test('canonicalScheduleSourceIdentity: abaikan token sekali-pakai di ujung path', () => {
  assert.equal(
    canonicalScheduleSourceIdentity('http://jadwal.alhijaz.co/brosur/umrah-reguler-9hr-kereta-cepat-jkurkKG'),
    canonicalScheduleSourceIdentity('http://115.124.86.220/brosur/umrah-reguler-9hr-kereta-cepat-8qYx4rV'),
  );
  assert.equal(
    canonicalScheduleSourceIdentity('http://jadwal.alhijaz.co/itinerary/umrah-promo-9hr-geGAyST'),
    'schedule:/itinerary/umrah-promo-9hr',
  );

  // Paket yang benar-benar BERBEDA tetap berbeda — yang dibuang hanya tokennya.
  assert.notEqual(
    canonicalScheduleSourceIdentity('http://jadwal.alhijaz.co/brosur/umrah-reguler-9hr-jkurkKG'),
    canonicalScheduleSourceIdentity('http://jadwal.alhijaz.co/brosur/umrah-plus-turki-12hr-8qYx4rV'),
  );

  // Segmen slug biasa (huruf kecil, boleh berangka) bukan token; memotongnya
  // akan menyamakan dua brosur yang berbeda.
  assert.equal(
    canonicalScheduleSourceIdentity('http://jadwal.alhijaz.co/brosur/umrah-promo-12hari'),
    'schedule:/brosur/umrah-promo-12hari',
  );

  // Path di luar brosur/itinerary tidak disentuh sama sekali.
  assert.equal(
    canonicalScheduleSourceIdentity('http://jadwal.alhijaz.co/jadwal/api-get-1448AbCdEf'),
    'schedule:/jadwal/api-get-1448AbCdEf',
  );
});

test('buildBrochureCacheReset: token baru untuk brosur yang sama tidak menghapus apa pun', () => {
  assert.deepEqual(
    buildBrochureCacheReset(
      { brosur: 'http://jadwal.alhijaz.co/brosur/umrah-reguler-9hr-kereta-cepat-jkurkKG' },
      'http://jadwal.alhijaz.co/brosur/umrah-reguler-9hr-kereta-cepat-8qYx4rV',
    ),
    {},
  );
});

test('buildBrochureCacheReset: clears every derived asset when source locator changes', () => {
  assert.deepEqual(
    buildBrochureCacheReset(
      { brosur: 'http://jadwal.alhijaz.co/brosur/versi-lama' },
      'http://jadwal.alhijaz.co/brosur/versi-baru',
    ),
    {
      brosur_cdn: null,
      brosur_thumb_cdn: null,
      brosur_source_sha256: null,
      brosur_source_bytes: null,
      brosur_source_content_type: null,
      brosur_cdn_synced_at: null,
    },
  );

  assert.deepEqual(
    buildBrochureCacheReset(
      { brosur: 'http://jadwal.alhijaz.co/brosur/paket-sama' },
      'http://115.124.86.220/brosur/paket-sama',
    ),
    {},
  );
});

test('buildSourceDownloadCandidates: prefers direct origin for schedule files', () => {
  assert.deepEqual(
    buildSourceDownloadCandidates('http://jadwal.alhijaz.co/brosur/paket-terbaru'),
    [
      'http://115.124.86.220/brosur/paket-terbaru',
      'https://jadwal.alhijaz.co/brosur/paket-terbaru',
    ],
  );
});

test('buildSourceDownloadCandidates: keeps direct-IP HTTP usable', () => {
  assert.deepEqual(
    buildSourceDownloadCandidates('http://115.124.86.220/itinerary/paket.pdf?download=1'),
    ['http://115.124.86.220/itinerary/paket.pdf?download=1'],
  );
});

test('buildSourceDownloadCandidates: can mirror official marketing images behind Cloudflare', () => {
  assert.deepEqual(
    buildSourceDownloadCandidates(
      'https://alhijaz.id/storage/2023/05/Umroh-Plus-Turki-2026-Agustus.webp',
    ),
    [
      'https://alhijaz.id/storage/2023/05/Umroh-Plus-Turki-2026-Agustus.webp',
      'https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Falhijaz.id%2Fstorage%2F2023%2F05%2FUmroh-Plus-Turki-2026-Agustus.webp&f=1&nofb=1',
    ],
  );
});

test('buildSourceDownloadCandidates: preserves HTTPS upgrade for unrelated origins', () => {
  assert.deepEqual(
    buildSourceDownloadCandidates('http://files.example.com/brosur.webp'),
    ['https://files.example.com/brosur.webp'],
  );
  assert.deepEqual(
    buildSourceDownloadCandidates('https://alhijaz.b-cdn.net/brosur/JBU1493.webp?v=abc'),
    ['https://alhijaz.b-cdn.net/brosur/JBU1493.webp?v=abc'],
  );
});

test('schedule sync fingerprints brochures every 30-minute data cycle', () => {
  const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const runScheduleSync = server.slice(
    server.indexOf('async function runScheduleSync()'),
    server.indexOf('if (shouldRunBackgroundJobs()) {', server.indexOf('async function runScheduleSync()')),
  );

  assert.match(runScheduleSync, /await syncUmrohSchedules\(\)/);
  assert.match(runScheduleSync, /await queueFilesToBunny\(\{ kinds: \['brosur'\] \}\)/);
  assert.match(server, /setInterval\([\s\S]*?runScheduleSync\(\)[\s\S]*?30 \* 60 \* 1000\)/);
  assert.match(server, /await queueFilesToBunny\(\)/);
});

test('getCdnFileDecision: uploads when CDN URL is missing', () => {
  const decision = getCdnFileDecision({
    brosur: 'https://origin/brosur.webp',
    brosur_source_sha256: 'abc',
    brosur_source_bytes: 100,
  }, 'brosur', { sha256: 'abc', bytes: 100 });

  assert.deepEqual(decision, { action: 'upload', reason: 'missing_cdn' });
});

test('getCdnFileDecision: skips unchanged CDN file', () => {
  const decision = getCdnFileDecision({
    itinerary: 'https://origin/itinerary.pdf',
    itinerary_cdn: 'https://cdn/itinerary.pdf',
    itinerary_source_sha256: 'abc',
    itinerary_source_bytes: 100,
  }, 'itinerary', { sha256: 'abc', bytes: 100 });

  assert.deepEqual(decision, { action: 'skip', reason: 'unchanged' });
});

test('getCdnFileDecision: verifies existing CDN when fingerprint metadata is missing', () => {
  const decision = getCdnFileDecision({
    brosur: 'https://origin/brosur.webp',
    brosur_cdn: 'https://cdn/brosur.webp',
    brosur_source_sha256: null,
    brosur_source_bytes: null,
  }, 'brosur', { sha256: 'abc', bytes: 100 });

  assert.deepEqual(decision, { action: 'verify_cdn', reason: 'missing_metadata' });
});

test('getCdnFileDecision: uploads when source fingerprint changed', () => {
  const decision = getCdnFileDecision({
    brosur: 'https://origin/brosur.webp',
    brosur_cdn: 'https://cdn/brosur.webp',
    brosur_source_sha256: 'old',
    brosur_source_bytes: 100,
  }, 'brosur', { sha256: 'new', bytes: 100 });

  assert.deepEqual(decision, { action: 'upload', reason: 'source_changed' });
});

test('buildCdnMetadataUpdate: writes CDN and fingerprint metadata for one file type', () => {
  const update = buildCdnMetadataUpdate(
    'itinerary',
    'https://cdn/itinerary.pdf',
    { sha256: 'abc', bytes: 123, contentType: 'application/pdf' },
    '2026-05-22T00:00:00.000Z',
  );

  assert.deepEqual(update, {
    itinerary_cdn: 'https://cdn/itinerary.pdf',
    itinerary_source_sha256: 'abc',
    itinerary_source_bytes: 123,
    itinerary_source_content_type: 'application/pdf',
    itinerary_cdn_synced_at: '2026-05-22T00:00:00.000Z',
  });
});

test('buildCdnInvalidationUpdate: keeps current source fingerprint but removes stale CDN', () => {
  assert.deepEqual(
    buildCdnInvalidationUpdate('brosur', {
      sha256: 'new-source-sha',
      bytes: 456,
      contentType: 'image/webp',
    }),
    {
      brosur_cdn: null,
      brosur_source_sha256: 'new-source-sha',
      brosur_source_bytes: 456,
      brosur_source_content_type: 'image/webp',
      brosur_cdn_synced_at: null,
    },
  );
});

test('schedule sync invalidates brochure cache only for the packages whose source changed', () => {
  const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const sync = server.slice(
    server.indexOf('async function syncUmrohSchedules()'),
    server.indexOf('// Bunny CDN: Sync brosur & itinerary files'),
  );

  assert.match(sync, /\.select\('jadwal_id, brosur'\)/);
  assert.match(sync, /buildBrochureCacheReset\(previousById\.get\(String\(p\.jadwal_id\)\), brochureSource\)/);

  // Kunci reset TIDAK boleh menumpang payload upsert. PostgREST menyatukan kunci
  // seluruh baris lalu mengisi yang absen dengan NULL (supabase-js:
  // defaultToNull = true), jadi SATU paket yang brosurnya diganti akan menghapus
  // brosur_cdn semua paket lain — 19 Sep 2026 itu membuat seluruh mirror CDN
  // hilang tiap sync, dan pembaca jatuh ke proksi origin yang tak bisa di-cache.
  assert.doesNotMatch(
    sync,
    /\.\.\.buildBrochureCacheReset\(/,
    'reset brosur ikut disebar ke baris upsert — satu paket akan menghapus cache paket lain',
  );
  assert.match(
    sync,
    /\.update\(brochureCacheResets\.get\([^)]*\)\)[\s\S]{0,200}?\.in\('jadwal_id', resetIds\)/,
    'reset brosur tidak diterapkan sebagai update terbatas ke paket yang berubah',
  );
});

test('document source proxy bypasses browser and service-worker stale caches', async () => {
  const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const vite = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
  const proxy = server.slice(
    server.indexOf("app.get(['/itinerary/{*path}', '/brosur/{*path}']"),
    server.indexOf('// Landing Page: /:slug/umroh'),
  );

  assert.match(proxy, /buildSourceDownloadCandidates\(targetUrl\)/);
  assert.match(proxy, /cache: 'no-store'/);
  assert.match(proxy, /res\.set\('Cache-Control', 'no-store'\)/);

  // Service worker tidak boleh menyajikan /itinerary/* atau /brosur/* dari cache: byte-nya
  // bisa berubah tanpa ganti URL. Invariannya diuji lewat perilaku matcher (bukan lagi rute
  // RegExp NetworkOnly lama, yang tak pernah cocok karena Workbox mencocokkan URL lengkap).
  const pwa = await import('../src/lib/pwa/buildConfig.js');
  const matchers = [pwa.isAgentPhotoImage, pwa.isHotelMediaImage, pwa.isSameOriginImage, pwa.isHashedAsset, pwa.isFontRequest];
  for (const path of ['/itinerary/umrah-plus-turkey.pdf', '/brosur/katalog.jpg', '/itinerary/JBU1504.png']) {
    const url = new URL(`https://alhijaz.co${path}`);
    for (const destination of ['document', 'image', 'object', 'iframe', '']) {
      const input = { request: { destination, mode: destination === 'document' ? 'navigate' : 'no-cors' }, url, sameOrigin: true };
      for (const matcher of matchers) {
        assert.equal(matcher(input), false, `${matcher.name} tidak boleh meng-cache ${path} (${destination || 'fetch'})`);
      }
    }
    assert.ok(pwa.NAVIGATE_FALLBACK_DENYLIST.some((re) => re.test(path)), `${path} tidak boleh dijawab shell SPA`);
  }
  // Semua rute runtime di vite.config.ts memakai matcher teruji di atas (plus navigasi
  // NetworkOnly), tidak ada RegExp ad-hoc yang bisa menangkap berkas dokumen.
  const patterns = [...vite.matchAll(/urlPattern: ([^,\n]+),/g)].map((m) => m[1].trim());
  assert.ok(patterns.length > 0);
  for (const pattern of patterns) {
    assert.ok(
      ['isAgentPhotoImage', 'isHotelMediaImage', 'isSameOriginImage', 'isHashedAsset', 'isFontRequest', 'isNavigationRequest'].includes(pattern),
      `urlPattern tak dikenal di vite.config.ts: ${pattern}`,
    );
  }
});

// Salinan CDN dulu (byte-nya yang di-fingerprint), origin sebagai jaring
// pengaman. Jaring itu pernah mati diam-diam: naik-paksa ke https:// padahal
// origin jadwal cuma melayani port 80 — JBU1565 (Agu 2026) memegang itinerary
// salah dan tidak punya jalan mundur saat salinan CDN-nya keliru.
test('buildItineraryParseCandidates: keeps the direct-IP origin on HTTP as fallback', () => {
  const candidates = buildItineraryParseCandidates(
    'http://115.124.86.220/itinerary/umrah-plus-turkey-15hr-kereta-cepat-crZKtrM',
    { url: 'https://alhijaz.b-cdn.net/itinerary/JBU1565-45c828f0a9e9fbd9.pdf', sha256: '45c828f0a9e9fbd9dbd1c81ec1da11354b32f567522b741aeeac8cd8e356c6a1' },
  );

  assert.deepEqual(candidates, [
    'https://alhijaz.b-cdn.net/itinerary/JBU1565-45c828f0a9e9fbd9.pdf?v=45c828f0a9e9fbd9',
    'http://115.124.86.220/itinerary/umrah-plus-turkey-15hr-kereta-cepat-crZKtrM',
  ]);
  assert.ok(!candidates.some(url => url.startsWith('https://115.124.86.220')));
});

test('buildItineraryParseCandidates: expands the public jadwal host to origin then HTTPS', () => {
  assert.deepEqual(
    buildItineraryParseCandidates('http://jadwal.alhijaz.co/itinerary/paket', {
      url: 'https://alhijaz.b-cdn.net/itinerary/JBU1493.pdf',
      sha256: null,
    }),
    [
      'https://alhijaz.b-cdn.net/itinerary/JBU1493.pdf',
      'http://115.124.86.220/itinerary/paket',
      'https://jadwal.alhijaz.co/itinerary/paket',
    ],
  );
});

test('buildItineraryParseCandidates: falls back to the source alone without a CDN copy', () => {
  assert.deepEqual(
    buildItineraryParseCandidates('http://115.124.86.220/itinerary/paket', {}),
    ['http://115.124.86.220/itinerary/paket'],
  );
  assert.deepEqual(buildItineraryParseCandidates('', {}), []);
});

test('itinerary sync builds its download candidates from the shared helper', () => {
  const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const parseAndCache = server.slice(
    server.indexOf('async function parseAndCacheCurrentItinerary('),
    server.indexOf('function refreshCurrentItineraryOnce('),
  );

  assert.match(parseAndCache, /buildItineraryParseCandidates\(/);
  // Naik-paksa ke https:// mematikan origin jadwal yang hanya punya port 80.
  assert.doesNotMatch(parseAndCache, /replace\(\/\^http:\\\/\\\/\/, 'https:\/\/'\)/);
  // Hasil fallback origin tidak boleh menimpa cache bila byte-nya bukan versi
  // yang baru saja dicatat oleh fingerprint sync.
  assert.match(parseAndCache, /parsedSha !== expectedSha/);
});
