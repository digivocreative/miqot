import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), 'utf8');

test('Brochure AI Tools exposes Nilai Plus Paket as a third grounded action', () => {
  const brochure = read('src/components/BrochureModal.tsx');
  const card = read('src/components/PackageCard.tsx');

  assert.match(brochure, /onPackageValue\?: \(\) => void/);
  assert.match(brochure, /label: 'Nilai Plus Paket'/);
  assert.match(brochure, /desc: 'Prompt banner dari brosur & itinerary'/);
  assert.match(card, /<PackageValueModal/);
  assert.match(card, /jadwalId=\{pkg\.jadwalId\}/);
  assert.match(card, /tier=\{activeTier\}/);
  assert.match(card, /agent=\{currentAgent \? \{/);
  assert.match(card, /photo: currentAgent\.photo/);
});

test('PackageValueModal puts the analysed advantages first and the prompt second', () => {
  const modal = read('src/components/PackageValueModal.tsx');

  // Hero hasil analisis: headline, summary, nilai plus (benefit dulu), bestFor.
  assert.match(modal, /Hasil analisis nilai plus/);
  assert.match(modal, /result\.headline/);
  assert.match(modal, /result\.summary/);
  assert.match(modal, /item\.benefit \|\| item\.description/);
  assert.match(modal, /Pesan Utama/);
  assert.match(modal, /Cocok untuk/);
  assert.match(modal, /result\.bestFor\.map/);
  // Prompt jadi disclosure sekunder dengan textarea siap salin (tanpa scroll-trap div).
  assert.match(modal, /Prompt untuk ChatGPT/);
  assert.match(modal, /aria-expanded=\{promptOpen\}/);
  assert.match(modal, /textarea[\s\S]*readOnly/);
  assert.doesNotMatch(modal, /<details/);
  assert.doesNotMatch(modal, /max-h-64 overflow-y-auto/);
});

test('PackageValueModal rotates design styles without re-running the AI analysis', () => {
  const modal = read('src/components/PackageValueModal.tsx');

  assert.match(modal, /Gaya Desain/);
  assert.match(modal, /Ganti Gaya/);
  assert.match(modal, /excludeStyle: result\.style\?\.id/);
  assert.match(modal, /package_value_style_change/);
  assert.match(modal, /result\.style\?\.name/);
});

test('PackageValueModal generates a grounded banner prompt ready to copy into ChatGPT', () => {
  const modal = read('src/components/PackageValueModal.tsx');

  assert.match(modal, /fetch\('\/api\/package-value'/);
  assert.match(modal, /getSessionAuthHeaders\(\)/);
  assert.match(modal, /Analisis Nilai Plus/);
  assert.match(modal, /copyPlainText\(result\.bannerPrompt\)/);
  assert.match(modal, /Salin Prompt/);
  assert.match(modal, /siap ditempel ke ChatGPT/);
  assert.match(modal, /Hanya Brosur/);
  assert.match(modal, /fetch\('\/api\/package-value\/agent-card'/);
  assert.match(modal, /buildImageAndPromptShareData\(agentAttachment\.file, result\.bannerPrompt\)/);
  assert.match(modal, /Bagikan \+ Lampiran/);
  assert.match(modal, /Lampiran Identitas Agent/);
  // Label share hanya muncul bila payload benar-benar bisa di-share file.
  assert.match(modal, /canNativeShareWithFile/);
  assert.match(modal, /navigator\.canShare/);
  assert.doesNotMatch(modal, /shareCaption|WhatsAppIcon|Bagikan WA/);
});

test('PackageValueModal follows AI Tools, loading, card, and error design-system patterns', () => {
  const modal = read('src/components/PackageValueModal.tsx');

  assert.match(modal, /Loader2/);
  assert.match(modal, /animate-spin text-purple-600 dark:text-purple-400/);
  // Panel modal selaras sibling AI modals: max-w-md + spring.
  assert.match(modal, /max-w-md/);
  assert.match(modal, /type: 'spring', damping: 25, stiffness: 300/);
  // Block error DS.
  assert.match(modal, /rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-600 dark:border-red-800\/50 dark:bg-red-900\/20 dark:text-red-400/);
  // CTA footer memakai token Primary CTA (text-sm), bukan text-xs.
  assert.match(modal, /bg-emerald-500 py-3 text-sm font-bold text-white/);
  // Badge memakai token DS text-[9px] uppercase tracking-wide.
  assert.match(modal, /text-\[9px\] font-bold uppercase tracking-wide/);
  // Tinggi state konsisten (no layout shift antar idle/loading/error).
  const minHeights = modal.match(/min-h-\[\d+px\]/g) || [];
  assert.ok(minHeights.length >= 3 && new Set(minHeights).size === 1, 'semua state memakai min-h yang sama');
  // Backdrop bukan button (satu kontrol tutup saja) + aria dialog.
  assert.match(modal, /aria-hidden="true" className="absolute inset-0 bg-black\/50 backdrop-blur-sm"/);
  assert.match(modal, /aria-label="Tutup"/);
  assert.match(modal, /aria-modal="true"/);
  assert.doesNotMatch(modal, /bg-gradient-to-(?:tr|br) from-(?:amber|emerald)/);
});

test('PackageValueModal summarizes stale route and proxy HTML errors', () => {
  const modal = read('src/components/PackageValueModal.tsx');

  assert.match(modal, /const rawBody = await response\.text\(\)/);
  assert.match(modal, /response\.status === 404/);
  assert.match(modal, /contentType\.includes\('text\/html'\)/);
  assert.doesNotMatch(modal, /response\.json\(\)\.catch/);
});

test('package-value API is authenticated, resolves canonical data, and rotates styles server-side', () => {
  const server = read('server.js');
  const routeStart = server.indexOf("app.post('/api/package-value'");
  const routeEnd = server.indexOf("app.options('/api/package-value'", routeStart);
  const route = server.slice(routeStart, routeEnd);

  assert.ok(routeStart > -1);
  assert.match(route, /authMiddleware/);
  assert.match(route, /fetchPackageValueSchedule\(jadwalId\)/);
  assert.match(route, /getItineraryContext\(jadwalId\)/);
  assert.doesNotMatch(route, /pdfUrl|req\.body\?\.brosur|req\.body\?\.itinerary/);
  assert.match(route, /readPackageValueCache/);
  assert.match(route, /writePackageValueCache/);
  assert.match(route, /packageData: context\.package/);
  // Rotasi gaya: dipilih per request, exclude gaya sebelumnya, diteruskan ke parser.
  assert.match(route, /pickPackageValueStyle\(\{ excludeId: excludeStyleId \}\)/);
  assert.match(route, /excludeStyle/);
  assert.match(route, /style \}/);
});

test('package-value cache stores only the canonical analysis so style rotation works on cache hits', () => {
  const server = read('server.js');
  const helperStart = server.indexOf('async function writePackageValueCache');
  const helperEnd = server.indexOf('async function fetchPackageValueSchedule', helperStart);
  const helper = server.slice(helperStart, helperEnd);

  assert.ok(helperStart > -1);
  assert.match(helper, /bannerPrompt: _prompt, style: _style, \.\.\.analysis/);
  assert.match(helper, /content: analysis/);
  // Cache read merakit ulang prompt dengan gaya request saat ini.
  assert.match(server, /readPackageValueCache\(cacheKey, context, style\)/);
});

test('agent identity attachment is authenticated and built only from canonical agent data', () => {
  const server = read('server.js');
  const routeStart = server.indexOf("app.get('/api/package-value/agent-card'");
  const routeEnd = server.indexOf("app.post('/api/package-value'", routeStart);
  const route = server.slice(routeStart, routeEnd);

  assert.ok(routeStart > -1);
  assert.match(route, /authMiddleware/);
  assert.match(route, /getAgentById\(req\.user\.id\)/);
  assert.match(route, /loadAgentPhotoBuffer\(hasRealPhoto \? agent\.photo : null, agent\.slug\)/);
  // Avatar generated bukan wajah asli → jatuh ke mode tanpa foto.
  assert.match(route, /ui-avatars/);
  assert.match(route, /hasRealPhoto/);
  assert.match(route, /generatePackageValueAgentCardPng/);
  // Website: custom domain aktif menang atas kolom website lama.
  assert.match(route, /custom_domain_status === 'active'/);
  assert.match(route, /website/);
  assert.doesNotMatch(route, /req\.body|req\.query/);
  assert.match(route, /'Content-Type': 'image\/png'/);
});

test('package-value cache migration keys results by package documents and prompt version', () => {
  const migration = read('migrations/20260717000000_package_value_cache.sql');
  assert.match(migration, /cache_key TEXT PRIMARY KEY/);
  assert.match(migration, /document_hash TEXT NOT NULL/);
  assert.match(migration, /prompt_version TEXT NOT NULL/);
  assert.match(migration, /content JSONB NOT NULL/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
});
