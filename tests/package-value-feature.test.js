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

test('PackageValueModal keeps the analysed advantages in a disclosure and the prompt always visible', () => {
  const modal = read('src/components/PackageValueModal.tsx');

  // Disclosure analisis: headline, summary, nilai plus (benefit dulu), bestFor.
  assert.match(modal, /result\.headline/);
  assert.match(modal, /result\.summary/);
  assert.match(modal, /item\.benefit \|\| item\.description/);
  assert.match(modal, /Cocok untuk/);
  assert.match(modal, /result\.advantages\.map/);
  assert.match(modal, /result\.bestFor\.join/);
  assert.doesNotMatch(modal, /Analisis Ulang/);
  // Detail nilai plus mengikuti disclosure Info kontak pada modal sibling.
  assert.match(modal, /Nilai plus yang ditonjolkan/);
  assert.match(modal, /aria-expanded=\{detailsOpen\}/);
  // Prompt selalu tampil sebagai textarea siap salin seperti Buat Ulang Brosur.
  assert.match(modal, /Prompt \(siap salin\)/);
  assert.match(modal, /textarea[\s\S]*readOnly/);
  assert.doesNotMatch(modal, /<details/);
  assert.doesNotMatch(modal, /max-h-64 overflow-y-auto/);
});

test('PackageValueModal uses the same compact design-style dropdown as Buat Ulang Brosur', () => {
  const modal = read('src/components/PackageValueModal.tsx');

  assert.match(modal, /Gaya desain/);
  assert.match(modal, /import FilterDropdown/);
  assert.match(modal, /DESIGN_STYLES/);
  assert.match(modal, /options=\{STYLE_OPTIONS\}/);
  assert.match(modal, /variant="compact"/);
  assert.match(modal, /onChange=\{\(value\) => void changeStyle\(value\)\}/);
  assert.match(modal, /style: styleId/);
  assert.match(modal, /package_value_style_change/);
  assert.doesNotMatch(modal, /excludeStyle|Shuffle/);
});

test('PackageValueModal generates a grounded banner prompt ready to copy into ChatGPT', () => {
  const modal = read('src/components/PackageValueModal.tsx');

  assert.match(modal, /fetch\('\/api\/package-value'/);
  assert.match(modal, /getSessionAuthHeaders\(\)/);
  assert.match(modal, /Analisis Nilai Plus/);
  assert.match(modal, /copyPlainText\(result\.bannerPrompt\)/);
  assert.match(modal, /Salin Prompt/);
  assert.match(modal, /siap ditempel ke ChatGPT/);
  assert.match(modal, /fetch\('\/api\/package-value\/agent-card'/);
  assert.match(modal, /buildImageAndPromptShareData\(agentAttachment\.file, result\.bannerPrompt\)/);
  assert.match(modal, /'ChatGPT'/);
  // Lampiran tetap dipersiapkan dan dikirim, tetapi tidak dipajang di modal.
  assert.doesNotMatch(modal, /<img/);
  assert.doesNotMatch(modal, /Unduh PNG/);
  assert.doesNotMatch(modal, /Data acuan/);
  // Label share hanya muncul bila payload benar-benar bisa di-share file.
  assert.match(modal, /canNativeShareWithFile/);
  assert.match(modal, /navigator\.canShare/);
  assert.doesNotMatch(modal, /shareCaption|WhatsAppIcon|Bagikan WA/);
});

test('PackageValueModal uses the same popup shell and footer hierarchy as Buat Ulang Brosur', () => {
  const modal = read('src/components/PackageValueModal.tsx');
  const brochureModal = read('src/components/BrochurePromptModal.tsx');

  assert.match(modal, /Loader2/);
  assert.match(modal, /animate-spin text-emerald-500/);
  // Shell disamakan dengan Buat Ulang Brosur.
  for (const token of ['z-[10001]', 'max-h-[88vh]', 'max-w-md', 'rounded-2xl', 'shadow-2xl']) {
    assert.ok(modal.includes(token), `PackageValueModal harus memakai ${token}`);
    assert.ok(brochureModal.includes(token), `BrochurePromptModal harus memakai ${token}`);
  }
  assert.match(modal, /Wand2 size=\{16\} className="shrink-0 text-emerald-500"/);
  assert.match(modal, /h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100/);
  assert.match(modal, /flex-1 space-y-4 overflow-y-auto px-4 py-4/);
  assert.match(modal, /type: 'spring', damping: 25, stiffness: 300/);
  // Block error DS.
  assert.match(modal, /rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-600 dark:border-red-800\/50 dark:bg-red-900\/20 dark:text-red-400/);
  // Footer: Salin Prompt adalah primary emerald, ChatGPT secondary emerald.
  assert.match(modal, /bg-emerald-500 py-3 text-sm font-bold text-white/);
  assert.match(modal, /border border-emerald-200 bg-emerald-50 py-3 text-sm font-bold text-emerald-700/);
  // Loading/error (muncul setelah klik Analisis) tingginya konsisten;
  // state idle sengaja compact tanpa min-h agar modal tidak boros tinggi.
  const minHeights = modal.match(/min-h-\[\d+px\]/g) || [];
  assert.ok(minHeights.length >= 2 && new Set(minHeights).size === 1, 'state loading/error memakai min-h yang sama');
  assert.match(modal, /flex flex-col items-center gap-3 py-2 text-center/, 'state idle compact tanpa min-h');
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

test('package-value API is authenticated, resolves canonical data, and accepts the selected shared style', () => {
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
  // Dropdown mengirim gaya eksplisit; helper memvalidasi preset sebelum parser.
  assert.match(route, /requestedStyleId/);
  assert.match(route, /pickPackageValueStyle\(\{ preferredId: requestedStyleId \}\)/);
  assert.match(route, /buildPackageValueChatBody\(prompts, \{ repair: true \}\)/);
  assert.match(route, /retrying once/);
  assert.match(route, /allowEvidenceRewrite: true/);
  assert.doesNotMatch(route, /excludeStyle/);
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
  // URL profil selalu kanonis agar informasi share konsisten untuk setiap agent.
  assert.match(route, /`alhijaz\.co\/\$\{agent\.slug\}`/);
  assert.doesNotMatch(route, /custom_domain_status|agent\.website/);
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
