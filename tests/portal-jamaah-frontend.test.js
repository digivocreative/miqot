import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const rootPath = new URL('..', import.meta.url).pathname;

function read(path) {
  return readFileSync(join(rootPath, path), 'utf8');
}

test('portal jamaah frontend files exist', () => {
  const files = [
    'src/components/portal-jamaah/PortalJamaahRouter.tsx',
    'src/components/portal-jamaah/pages/LandingPage.tsx',
    'src/components/portal-jamaah/pages/AuthConsumePage.tsx',
    'src/components/portal-jamaah/pages/AuthErrorPage.tsx',
    'src/components/portal-jamaah/components/AgentHeaderBar.tsx',
    'src/components/portal-jamaah/components/KodeBookingForm.tsx',
    'src/components/portal-jamaah/components/MagicLinkSuccessCard.tsx',
    'src/components/portal-jamaah/lib/portalSession.ts',
    'src/components/portal-jamaah/lib/portalApi.ts',
    'src/components/portal-jamaah/lib/fetchAgentBySlug.ts',
    'src/components/portal-jamaah/pages/PortalDashboard.tsx',
    'src/components/portal-jamaah/tabs/persiapan/ProgressRing.tsx',
    'src/components/portal-jamaah/tabs/persiapan/SpiritualSubTab.tsx',
    'src/components/portal-jamaah/tabs/persiapan/DokumenSubTab.tsx',
    'src/components/portal-jamaah/tabs/persiapan/PerlengkapanSubTab.tsx',
    'src/components/portal-jamaah/tabs/persiapan/JamaahSelector.tsx',
    'src/components/portal-jamaah/tabs/persiapan/PhaseSection.tsx',
    'src/components/portal-jamaah/tabs/persiapan/ChecklistItem.tsx',
    'src/components/portal-jamaah/tabs/persiapan/PerlengkapanItem.tsx',
    'src/components/portal-jamaah/components/PortalTopBar.tsx',
    'src/components/portal-jamaah/components/RosterItem.tsx',
    'src/components/portal-jamaah/components/JamaahPaymentCard.tsx',
    'src/components/portal-jamaah/components/HotelCard.tsx',
    'src/components/portal-jamaah/components/FlightCard.tsx',
    'src/components/portal-jamaah/components/ItineraryList.tsx',
    'src/components/portal-jamaah/hooks/usePortalMe.ts',
    'src/components/portal-jamaah/hooks/usePortalPersiapan.ts',
    'src/components/portal-jamaah/hooks/usePortalTheme.ts',
    'src/components/portal-jamaah/hooks/usePortalRoute.ts',
    'src/components/portal-jamaah/lib/faq.ts',
    'src/components/portal-jamaah/lib/portalMenu.ts',
    'src/components/portal-jamaah/lib/portalAlerts.ts',
    'src/components/portal-jamaah/lib/portalTasks.ts',
    'src/components/portal-jamaah/utils/formatDate.ts',
    'src/components/portal-jamaah/utils/formatRupiah.ts',
    'src/components/portal-jamaah/components/ThemeToggle.tsx',
    'src/components/portal-jamaah/components/PortalBackBar.tsx',
    'src/components/portal-jamaah/components/StickyWhatsAppCta.tsx',
    'src/components/portal-jamaah/components/HeroCountdown.tsx',
    'src/components/portal-jamaah/components/PortalMenuCard.tsx',
    'src/components/portal-jamaah/components/PortalMenuGrid.tsx',
    'src/components/portal-jamaah/components/SmartAlertsStrip.tsx',
    'src/components/portal-jamaah/components/TaskListWidget.tsx',
    'src/components/portal-jamaah/pages/BerandaPage.tsx',
    'src/components/portal-jamaah/pages/PerjalananPage.tsx',
    'src/components/portal-jamaah/pages/PembayaranPage.tsx',
    'src/components/portal-jamaah/pages/DokumenPage.tsx',
    'src/components/portal-jamaah/pages/PerlengkapanPage.tsx',
    'src/components/portal-jamaah/pages/ManasikSpiritualPage.tsx',
    'src/components/portal-jamaah/pages/FaqPage.tsx',
    'src/components/dashboard/portal-jamaah-tools/MagicLinkButton.tsx',
    'src/components/dashboard/portal-jamaah-tools/MagicLinkModal.tsx',
    'src/lib/portalJamaahAdmin.ts',
  ];

  for (const file of files) {
    assert.equal(existsSync(join(rootPath, file)), true, `${file} should exist`);
  }
  assert.equal(existsSync(join(rootPath, 'src/components/portal-jamaah/tabs/PersiapanTabPlaceholder.tsx')), false);
  assert.equal(existsSync(join(rootPath, 'src/components/dashboard/portal-jamaah-tools/PortalSessionsPage.tsx')), false);
  assert.equal(existsSync(join(rootPath, 'src/components/dashboard/portal-jamaah-tools/PortalSessionRow.tsx')), false);
  assert.equal(existsSync(join(rootPath, 'src/components/dashboard/portal-jamaah-tools/JamaahMoreActionsButton.tsx')), false);
  assert.equal(existsSync(join(rootPath, 'src/hooks/usePortalSessions.ts')), false);
});

test('PortalJamaahRouter wires /dashboard to the authenticated dashboard page', () => {
  const router = read('src/components/portal-jamaah/PortalJamaahRouter.tsx');
  const consume = read('src/components/portal-jamaah/pages/AuthConsumePage.tsx');
  const session = read('src/components/portal-jamaah/lib/portalSession.ts');
  const api = read('src/components/portal-jamaah/lib/portalApi.ts');

  assert.match(router, /import\s+PortalDashboard\s+from\s+['"]\.\/pages\/PortalDashboard['"]/);
  assert.match(router, /<PortalDashboard\s+slug=\{slug\}\s+session=\{session\}/);
  assert.match(router, /PORTAL_MAGIC_CODE_REGEX/);
  assert.match(router, /\(\?=\.\*\[a-z\]\)\(\?=\.\*\[2-9\]\)\[a-z2-9\]\{5\}/);
  assert.match(router, /<AuthConsumePage\s+slug=\{slug\}\s+token=\{subPath\[0\]\}/);
  assert.match(router, /subPath\[1\]\s*===\s*'dashboard'/);
  assert.match(router, /\/\$\{slug\}\/jamaah\/\$\{subPath\[0\]\}\/dashboard/);
  assert.match(router, /\/\$\{slug\}\/jamaah\/\$\{subPath\[0\]\}/);
  assert.match(consume, /getPortalDashboardPath\(slug,\s*token\)/);
  assert.match(consume, /access_code:\s*PORTAL_MAGIC_CODE_REGEX\.test\(token\)\s*\?\s*token\s*:\s*undefined/);
  assert.match(session, /access_code\?:\s*string/);
  assert.match(api, /PORTAL_MAGIC_CODE_REGEX/);
  assert.match(api, /session\.access_code\s*&&\s*PORTAL_MAGIC_CODE_REGEX\.test\(session\.access_code\)/);
  assert.match(api, /\/\$\{session\.slug\}\/jamaah\/\$\{session\.access_code\}/);
  assert.doesNotMatch(router, /PortalDashboardPlaceholder/);
});

test('PortalJamaahRouter and usePortalRoute preserve menu slugs for reloads', () => {
  const router = read('src/components/portal-jamaah/PortalJamaahRouter.tsx');
  const dashboard = read('src/components/portal-jamaah/pages/PortalDashboard.tsx');
  const routeHook = read('src/components/portal-jamaah/hooks/usePortalRoute.ts');

  assert.match(router, /PORTAL_DASHBOARD_ROUTES/);
  assert.match(router, /parseDashboardRoute/);
  assert.match(router, /subPath\[2\]/);
  assert.match(router, /subPath\[1\]/);
  assert.match(router, /initialRoute=\{initialRoute\}/);
  assert.match(router, /dashboardPath=\{dashboardPath\}/);
  assert.match(router, /appendDashboardRoute\(dashboardPath,\s*initialRoute\)/);

  assert.match(dashboard, /initialRoute:\s*PortalRoute/);
  assert.match(dashboard, /dashboardPath:\s*string/);
  assert.match(dashboard, /usePortalRoute\(initialRoute,\s*dashboardPath\)/);

  assert.match(routeHook, /dashboardPath/);
  assert.match(routeHook, /window\.history\.pushState/);
  assert.match(routeHook, /popstate/);
  assert.match(routeHook, /routeFromPath/);
  assert.match(routeHook, /next === 'beranda'\s*\?\s*base\s*:/);
});

test('portal dashboard shell uses pages and manages routing', () => {
  const dashboard = read('src/components/portal-jamaah/pages/PortalDashboard.tsx');

  assert.match(dashboard, /usePortalMe/);
  assert.match(dashboard, /BerandaPage/);
  assert.match(dashboard, /usePortalRoute/);
});

test('portal pages include required payment, journey, and formatting helpers', () => {
  const pembayaran = read('src/components/portal-jamaah/pages/PembayaranPage.tsx');
  const perjalanan = read('src/components/portal-jamaah/pages/PerjalananPage.tsx');
  const rupiah = read('src/components/portal-jamaah/utils/formatRupiah.ts');
  const date = read('src/components/portal-jamaah/utils/formatDate.ts');

  assert.match(pembayaran, /paket|pembayaran/i);
  assert.match(perjalanan, /paket|perjalanan/i);
  assert.match(rupiah, /toLocaleString\('id-ID'\)/);
  assert.match(date, /Intl\.DateTimeFormat\('id-ID'/);
});

test('Persiapan page and sub-tabs use hooks and shared components correctly', () => {
  const hook = read('src/components/portal-jamaah/hooks/usePortalPersiapan.ts');
  const ring = read('src/components/portal-jamaah/tabs/persiapan/ProgressRing.tsx');
  const spiritual = read('src/components/portal-jamaah/tabs/persiapan/SpiritualSubTab.tsx');

  assert.match(ring, /strokeDasharray/);
  assert.match(ring, /113\.097/);
  assert.match(hook, /portalApi\.getPersiapan/);
  assert.match(hook, /portalApi\.togglePersiapanItem/);
  assert.match(hook, /setPersiapan\(\(prev\)/);
  assert.match(spiritual, /resourceUrl/);
  assert.match(spiritual, /Pelajari/);
});

test('Dokumen and Perlengkapan sub-tabs are per-jamaah, read-only, and WhatsApp based', () => {
  const dokumen = read('src/components/portal-jamaah/tabs/persiapan/DokumenSubTab.tsx');
  const perlengkapan = read('src/components/portal-jamaah/tabs/persiapan/PerlengkapanSubTab.tsx');
  const selector = read('src/components/portal-jamaah/tabs/persiapan/JamaahSelector.tsx');
  const perlengkapanItem = read('src/components/portal-jamaah/tabs/persiapan/PerlengkapanItem.tsx');

  for (const docId of ['paspor', 'ktp', 'vaksin', 'foto_46', 'buku_nikah']) {
    assert.match(dokumen, new RegExp(docId));
  }
  assert.match(dokumen, /wa\.me/);
  assert.match(dokumen, /Upload Dokumen Baru/);
  assert.match(selector, /jamaah\.length <= 1/);
  assert.match(selector, /paspor_expired/);
  assert.match(perlengkapan, /PERLENGKAPAN_DEFAULTS/);
  assert.match(perlengkapan, /Sudah Diambil/);
  assert.match(perlengkapan, /Akan Diambil Saat Manasik/);
  assert.match(perlengkapan, /Belum Siap/);
  assert.match(perlengkapanItem, /status === 'diambil'/);
  assert.doesNotMatch(perlengkapanItem, /onToggle/);
});

test('App.tsx routes /:slug/jamaah to PortalJamaahRouter', () => {
  const app = read('src/App.tsx');
  assert.match(app, /PortalJamaahRouter/);
  assert.match(app, /pathSegments\[1\]\s*===\s*'jamaah'/);
  assert.match(app, /subPath=\{pathSegments\.slice\(2\)\}/);
});

test('portal API client covers auth consume and booking fallback request', () => {
  const api = read('src/components/portal-jamaah/lib/portalApi.ts');
  const consume = read('src/components/portal-jamaah/pages/AuthConsumePage.tsx');

  assert.match(api, /consumeMagicLink/);
  assert.match(api, /\/\$\{encodeURIComponent\(slug\)\}\/auth\/consume\/\$\{encodeURIComponent\(token\)\}/);
  assert.match(consume, /portalApi\.consumeMagicLink\(slug,\s*token\)/);
  assert.match(api, /requestMagicLinkByBooking/);
  assert.match(api, /\/magic-link\/request-by-booking/);
  assert.match(api, /Authorization.*Bearer/);
});

test('server exposes public agent lookup and booking fallback endpoint', () => {
  const server = read('server.js');
  assert.match(server, /app\.get\('\/api\/agents\/:slug\/public'/);
  assert.match(server, /app\.post\('\/api\/portal\/jamaah\/:slug\/magic-link\/request-by-booking'/);
  assert.match(server, /portalRequestBookingRateLimits/);
});

test('dashboard portal jamaah admin client only covers magic link generation', () => {
  const api = read('src/lib/portalJamaahAdmin.ts');

  assert.match(api, /getAuthHeaders/);
  assert.match(api, /generateMagicLink/);
  assert.match(api, /magicLinkCache/);
  assert.match(api, /magicLinkInFlight/);
  assert.match(api, /retry_after/);
  assert.match(api, /\/magic-link\/generate/);
  assert.doesNotMatch(api, /listSessions/);
  assert.doesNotMatch(api, /listUnusedTokens/);
  assert.doesNotMatch(api, /revokeSession/);
});

test('dashboard magic link modal generates link, previews WhatsApp message, and supports copy/send', () => {
  const button = read('src/components/dashboard/portal-jamaah-tools/MagicLinkButton.tsx');
  const modal = read('src/components/dashboard/portal-jamaah-tools/MagicLinkModal.tsx');

  assert.match(button, /Magic Link/);
  assert.match(button, /Kirim Akses Portal/);
  assert.match(button, /ENABLED_PORTAL_AGENT_SLUGS/);
  assert.match(button, /'nikita'/);
  assert.match(button, /Portal Jamaah Segera Hadir/);
  assert.match(button, /Manfaat fitur ini/);
  assert.match(button, /pantau pembayaran, persiapan, dokumen, dan perlengkapan/);
  assert.match(button, /<MagicLinkModal/);
  assert.match(modal, /Membuat link akses/);
  assert.match(modal, /portalJamaahAdmin\.generateMagicLink/);
  assert.match(modal, /portal_magic_link_generated/);
  assert.match(modal, /retryAfter/);
  assert.match(modal, /Tunggu/);
  assert.match(modal, /formatJamaahName/);
  assert.match(modal, /displayJamaahName/);
  assert.match(modal, /semoga sehat selalu/);
  assert.match(modal, /\*Portal Jamaah\*/);
  assert.match(modal, /\*Alhijaz Indowisata\*/);
  assert.match(modal, /🔗/);
  assert.match(modal, /🕋/);
  assert.match(modal, /📄/);
  assert.match(modal, /💳/);
  assert.match(modal, /✈️/);
  assert.match(modal, /✅/);
  assert.match(modal, /\*7 hari setelah kepulangan\*/);
  assert.match(modal, /jangan dibagikan ke orang di luar keluarga/);
  assert.doesNotMatch(modal, /Link berlaku 30 hari & hanya untuk satu kali pakai/);
  assert.doesNotMatch(modal, /booking/i);
  assert.match(modal, /Phone/);
  assert.match(modal, /Ticket/);
  assert.match(modal, /<Phone/);
  assert.match(modal, /<Ticket/);
  assert.match(modal, /generated\.id_umroh \|\| idUmroh/);
  assert.match(modal, /rounded-full bg-gray-300/);
  assert.doesNotMatch(modal, /items-start justify-between gap-3/);
  assert.match(modal, /textarea/);
  assert.match(modal, /Kirim via WhatsApp/);
  assert.match(modal, /Copy Link/);
  assert.match(modal, /Copy Pesan Lengkap/);
  assert.match(modal, /navigator\.clipboard\.writeText/);
  assert.match(modal, /wa\.me/);
});

test('dashboard has no portal jamaah menu or sessions page route, but jamaah cards keep magic link tools', () => {
  const layout = read('src/components/DashboardLayout.tsx');
  const jamaah = read('src/components/JamaahPage.tsx');

  assert.doesNotMatch(layout, /PortalSessionsPage/);
  assert.doesNotMatch(layout, /'portal-jamaah'/);
  assert.doesNotMatch(layout, /\/dashboard\/portal-jamaah/);
  assert.doesNotMatch(layout, /KeyRound/);
  assert.doesNotMatch(jamaah, /JamaahMoreActionsButton/);
  assert.match(jamaah, /MagicLinkButton/);
  assert.match(jamaah, /grid-cols-\[15fr_40fr_45fr\]/);
  assert.match(jamaah, /grid-cols-\[15fr_85fr\]/);
  assert.match(jamaah, /bg-violet-50/);
  assert.match(jamaah, /agentSlug=\{agentSlug/);
  assert.match(jamaah, /jamaahId=\{item\.id\}/);
});

test('dashboard hides magic link action for Belum DP jamaah cards', () => {
  const jamaah = read('src/components/JamaahPage.tsx');
  const belumDpBlockStart = jamaah.indexOf('key={`bdp-');
  const belumDpBlockEnd = jamaah.indexOf('const { item, grpSize, memberIndex } = entry;', belumDpBlockStart);
  const belumDpBlock = jamaah.slice(belumDpBlockStart, belumDpBlockEnd);

  assert.notEqual(belumDpBlockStart, -1, 'Belum DP grouped card should exist');
  assert.notEqual(belumDpBlockEnd, -1, 'Belum DP block should have a clear end');
  assert.match(jamaah, /function isBelumDPJamaah/);
  assert.doesNotMatch(belumDpBlock, /MagicLinkButton/);
  assert.match(jamaah, /paymentStatus !== 'belum' && \(/);
});

test('vite dev server proxies portal jamaah API routes to local Express', () => {
  const vite = read('vite.config.ts');

  assert.match(vite, /['"]\/api\/portal['"]:\s*\{/);
  assert.match(vite, /target:\s*['"]http:\/\/localhost:3000['"]/);
});
