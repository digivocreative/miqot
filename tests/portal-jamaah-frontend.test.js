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
    'src/components/portal-jamaah/tabs/BerandaTab.tsx',
    'src/components/portal-jamaah/tabs/PerjalananTab.tsx',
    'src/components/portal-jamaah/tabs/BayarTab.tsx',
    'src/components/portal-jamaah/tabs/PersiapanTab.tsx',
    'src/components/portal-jamaah/tabs/persiapan/PersiapanHeader.tsx',
    'src/components/portal-jamaah/tabs/persiapan/ProgressRing.tsx',
    'src/components/portal-jamaah/tabs/persiapan/TahapanSubTab.tsx',
    'src/components/portal-jamaah/tabs/persiapan/SpiritualSubTab.tsx',
    'src/components/portal-jamaah/tabs/persiapan/DokumenSubTab.tsx',
    'src/components/portal-jamaah/tabs/persiapan/PerlengkapanSubTab.tsx',
    'src/components/portal-jamaah/tabs/persiapan/JamaahSelector.tsx',
    'src/components/portal-jamaah/tabs/persiapan/PhaseSection.tsx',
    'src/components/portal-jamaah/tabs/persiapan/ChecklistItem.tsx',
    'src/components/portal-jamaah/tabs/persiapan/PerlengkapanItem.tsx',
    'src/components/portal-jamaah/components/PortalBottomNav.tsx',
    'src/components/portal-jamaah/components/PortalTopBar.tsx',
    'src/components/portal-jamaah/components/StatusCard.tsx',
    'src/components/portal-jamaah/components/RosterItem.tsx',
    'src/components/portal-jamaah/components/JamaahPaymentCard.tsx',
    'src/components/portal-jamaah/components/HotelCard.tsx',
    'src/components/portal-jamaah/components/FlightCard.tsx',
    'src/components/portal-jamaah/components/ItineraryList.tsx',
    'src/components/portal-jamaah/components/LogoutMenu.tsx',
    'src/components/portal-jamaah/hooks/usePortalMe.ts',
    'src/components/portal-jamaah/hooks/usePortalPersiapan.ts',
    'src/components/portal-jamaah/utils/formatDate.ts',
    'src/components/portal-jamaah/utils/formatRupiah.ts',
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
  assert.match(router, /import\s+PortalDashboard\s+from\s+['"]\.\/pages\/PortalDashboard['"]/);
  assert.match(router, /<PortalDashboard\s+slug=\{slug\}\s+session=\{session\}/);
  assert.doesNotMatch(router, /PortalDashboardPlaceholder/);
});

test('portal dashboard shell exposes four bottom tabs and logout flow', () => {
  const dashboard = read('src/components/portal-jamaah/pages/PortalDashboard.tsx');
  const bottomNav = read('src/components/portal-jamaah/components/PortalBottomNav.tsx');
  const beranda = read('src/components/portal-jamaah/tabs/BerandaTab.tsx');

  assert.match(dashboard, /activeTab/);
  assert.match(dashboard, /usePortalMe/);
  assert.match(dashboard, /PersiapanTab/);
  assert.doesNotMatch(dashboard, /PersiapanTabPlaceholder/);
  for (const tab of ['beranda', 'perjalanan', 'bayar', 'persiapan']) {
    assert.match(bottomNav, new RegExp(tab));
  }
  assert.match(beranda, /portalApi\.logout/);
  assert.match(beranda, /clearPortalSession/);
});

test('portal dashboard tabs include required payment, journey, and formatting helpers', () => {
  const bayar = read('src/components/portal-jamaah/tabs/BayarTab.tsx');
  const perjalanan = read('src/components/portal-jamaah/tabs/PerjalananTab.tsx');
  const rupiah = read('src/components/portal-jamaah/utils/formatRupiah.ts');
  const date = read('src/components/portal-jamaah/utils/formatDate.ts');

  assert.match(bayar, /Konfirmasi Pembayaran/);
  assert.match(bayar, /H-30/);
  assert.match(bayar, /wa\.me/);
  assert.match(perjalanan, /AI-generated/);
  assert.match(perjalanan, /paket_hotel/);
  assert.match(rupiah, /toLocaleString\('id-ID'\)/);
  assert.match(date, /Intl\.DateTimeFormat\('id-ID'/);
});

test('Persiapan tab implements four sub-tabs with optimistic toggle and cross-link navigation', () => {
  const tab = read('src/components/portal-jamaah/tabs/PersiapanTab.tsx');
  const hook = read('src/components/portal-jamaah/hooks/usePortalPersiapan.ts');
  const header = read('src/components/portal-jamaah/tabs/persiapan/PersiapanHeader.tsx');
  const ring = read('src/components/portal-jamaah/tabs/persiapan/ProgressRing.tsx');
  const tahapan = read('src/components/portal-jamaah/tabs/persiapan/TahapanSubTab.tsx');
  const spiritual = read('src/components/portal-jamaah/tabs/persiapan/SpiritualSubTab.tsx');

  for (const subTab of ['tahapan', 'spiritual', 'dokumen', 'perlengkapan']) {
    assert.match(tab, new RegExp(subTab));
    assert.match(header, new RegExp(subTab));
  }
  assert.match(ring, /strokeDasharray/);
  assert.match(ring, /113\.097/);
  assert.match(hook, /portalApi\.getPersiapan/);
  assert.match(hook, /portalApi\.togglePersiapanItem/);
  assert.match(hook, /setPersiapan\(\(prev\)/);
  assert.match(tahapan, /PhaseSection/);
  assert.match(tahapan, /onNavigate\('bayar'\)/);
  assert.match(tahapan, /onSubTabChange\('dokumen'\)/);
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
  assert.match(api, /consumeMagicLink/);
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
  assert.match(jamaah, /grid grid-cols-\[15fr_40fr_45fr\]/);
  assert.match(jamaah, /bg-violet-50/);
  assert.match(jamaah, /agentSlug=\{agentSlug/);
  assert.match(jamaah, /jamaahId=\{item\.id\}/);
});

test('vite dev server proxies portal jamaah API routes to local Express', () => {
  const vite = read('vite.config.ts');

  assert.match(vite, /['"]\/api\/portal['"]:\s*\{/);
  assert.match(vite, /target:\s*['"]http:\/\/localhost:3000['"]/);
});
