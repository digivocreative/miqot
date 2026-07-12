import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const rootPath = new URL('..', import.meta.url).pathname;

function read(path) {
  return readFileSync(join(rootPath, path), 'utf8');
}

function exists(path) {
  return existsSync(join(rootPath, path));
}

// New file presence — added incrementally per task
test('redesign: new files exist', () => {
  const newFiles = [
    'src/components/portal-jamaah/hooks/usePortalTheme.ts',
    'src/components/portal-jamaah/hooks/usePortalRoute.ts',
    'src/components/portal-jamaah/lib/faq.ts',
    'src/components/portal-jamaah/lib/portalMenu.ts',
    'src/components/portal-jamaah/lib/portalAlerts.ts',
    'src/components/portal-jamaah/lib/portalTasks.ts',
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
  ];
  for (const f of newFiles) {
    assert.ok(exists(f), `expected ${f} to exist`);
  }
});

test('redesign: deleted files no longer exist', () => {
  const deleted = [
    'src/components/portal-jamaah/components/PortalBottomNav.tsx',
    'src/components/portal-jamaah/components/StatusCard.tsx',
    'src/components/portal-jamaah/tabs/BerandaTab.tsx',
    'src/components/portal-jamaah/tabs/PerjalananTab.tsx',
    'src/components/portal-jamaah/tabs/BayarTab.tsx',
    'src/components/portal-jamaah/tabs/PersiapanTab.tsx',
    'src/components/portal-jamaah/tabs/persiapan/PersiapanHeader.tsx',
    'src/components/portal-jamaah/tabs/persiapan/TahapanSubTab.tsx',
  ];
  for (const f of deleted) {
    assert.ok(!exists(f), `expected ${f} to be deleted`);
  }
});

test('usePortalTheme: persists in sessionStorage and toggles dark class', () => {
  const src = read('src/components/portal-jamaah/hooks/usePortalTheme.ts');
  assert.match(src, /STORAGE_KEY\s*=\s*['"]portalDarkMode['"]/);
  assert.match(src, /sessionStorage\.getItem\(STORAGE_KEY\)/);
  assert.match(src, /sessionStorage\.setItem\(STORAGE_KEY/);
  assert.doesNotMatch(src, /localStorage/);
  assert.match(src, /classList\.toggle\(['"]dark['"]/);
  assert.match(src, /prefers-color-scheme/);
  assert.match(src, /export function usePortalTheme/);
});

test('usePortalRoute: exposes 7 route IDs + navigation helpers', () => {
  const src = read('src/components/portal-jamaah/hooks/usePortalRoute.ts');
  for (const id of ['beranda', 'perjalanan', 'pembayaran', 'dokumen', 'perlengkapan', 'manasik', 'faq']) {
    assert.match(src, new RegExp(`['"]${id}['"]`), `route ${id} missing`);
  }
  assert.match(src, /export type PortalRoute/);
  assert.match(src, /export function usePortalRoute/);
  assert.match(src, /navigate/);
  assert.match(src, /goBack/);
});

test('portalMenu: 6 menus with semantic colors and lucide icons', () => {
  const src = read('src/components/portal-jamaah/lib/portalMenu.ts');
  assert.match(src, /export const PORTAL_MENUS/);
  const menuTones = {
    perjalanan: 'emerald',
    pembayaran: 'amber',
    dokumen: 'blue',
    perlengkapan: 'violet',
    manasik: 'fuchsia',
    faq: 'rose',
  };
  for (const [id, tone] of Object.entries(menuTones)) {
    assert.match(src, new RegExp(`id:\\s*['"]${id}['"]`), `menu ${id} missing`);
    assert.match(src, new RegExp(`from-${tone}-400`), `icon gradient ${tone} missing`);
    assert.match(src, new RegExp(`from-${tone}-50`), `card gradient ${tone} missing`);
  }
  assert.match(src, /iconShadow/);
  assert.match(src, /hoverShadow/);
});

test('portalAlerts: deriveAlerts returns max 2 alerts in priority order', () => {
  const src = read('src/components/portal-jamaah/lib/portalAlerts.ts');
  assert.match(src, /export function deriveAlerts/);
  assert.match(src, /export interface PortalAlert/);
  assert.match(src, /payment|pembayaran/i);
  assert.match(src, /dokumen/i);
  assert.match(src, /ktp/);
  assert.match(src, /foto_46/);
  assert.match(src, /Lengkapi paspor, KTP, vaksin, atau foto/);
  assert.doesNotMatch(src, /['"]visa['"]/);
  assert.match(src, /perlengkapan/i);
  assert.match(src, /manasik/i);
  // Max 2 sliced
  assert.match(src, /slice\(\s*0\s*,\s*2\s*\)/);
});

test('portalTasks: derives top 3 pending tasks with category mapping', () => {
  const src = read('src/components/portal-jamaah/lib/portalTasks.ts');
  assert.match(src, /export function deriveTopTasks/);
  assert.match(src, /export type TaskCategory/);
  assert.match(src, /slice\(\s*0\s*,\s*3\s*\)/);
  assert.match(src, /pembayaran|dokumen|perlengkapan|manasik/);
});

test('faq: exports 8 FAQ entries with question + answer', () => {
  const src = read('src/components/portal-jamaah/lib/faq.ts');
  assert.match(src, /export const PORTAL_FAQ/);
  // Count question entries (each entry has a 'question:' field)
  const matches = src.match(/question:\s*['"]/g) || [];
  assert.equal(matches.length, 8, `expected 8 FAQ entries, got ${matches.length}`);
});

test('ThemeToggle: renders Sun/Moon icon button with DESIGN-SYSTEM classes', () => {
  const src = read('src/components/portal-jamaah/components/ThemeToggle.tsx');
  assert.match(src, /Moon/);
  assert.match(src, /Sun/);
  assert.match(src, /bg-gray-100\/80/);
  assert.match(src, /dark:bg-slate-800\/80/);
  assert.match(src, /rounded-(xl|lg)/);
  assert.match(src, /usePortalTheme/);
  assert.match(src, /active:scale-95/);
});

test('PortalTopBar: uses DESIGN-SYSTEM classes (backdrop-blur, dark mode, no bell)', () => {
  const src = read('src/components/portal-jamaah/components/PortalTopBar.tsx');
  assert.match(src, /backdrop-blur-xl/);
  assert.match(src, /backdrop-saturate-150/);
  assert.match(src, /bg-white\/70/);
  assert.match(src, /dark:bg-slate-950\/70/);
  assert.match(src, /border-white\/60/);
  assert.match(src, /shadow-slate-900\/5/);
  assert.match(src, /sticky top-0 z-30/);
  assert.match(src, /max-w-lg/);
  assert.match(src, /px-4 py-3/);
  assert.match(src, /Portal Jamaah/);
  assert.match(src, /agent\?\.name/);
  assert.doesNotMatch(src, /Bell/, 'dummy bell button must be removed');
});

test('Portal shell: landing/auth fallback widths use max-w-lg layout', () => {
  const router = read('src/components/portal-jamaah/PortalJamaahRouter.tsx');
  const landing = read('src/components/portal-jamaah/pages/LandingPage.tsx');
  const consume = read('src/components/portal-jamaah/pages/AuthConsumePage.tsx');
  const error = read('src/components/portal-jamaah/pages/AuthErrorPage.tsx');
  const agentHeader = read('src/components/portal-jamaah/components/AgentHeaderBar.tsx');
  const dashboard = read('src/components/portal-jamaah/pages/PortalDashboard.tsx');

  for (const src of [router, landing, consume, error, agentHeader, dashboard]) {
    assert.match(src, /max-w-lg/);
    assert.doesNotMatch(src, /max-w-md/);
  }
});

test('PortalBackBar: back button + title + sticky header per DESIGN-SYSTEM', () => {
  const src = read('src/components/portal-jamaah/components/PortalBackBar.tsx');
  assert.match(src, /sticky top-0 z-30/);
  assert.match(src, /backdrop-blur-xl/);
  assert.match(src, /backdrop-saturate-150/);
  assert.match(src, /bg-white\/70/);
  assert.match(src, /border-white\/60/);
  assert.match(src, /ChevronLeft/);
  assert.match(src, /max-w-lg/);
  assert.match(src, /onBack/);
  assert.match(src, /px-4 py-3/, 'sub-page header should use portal header spacing');
  assert.match(src, /grid-cols-\[36px_minmax\(0,1fr\)_36px\]/);
  assert.match(src, /h-9 w-9/, 'back button should use compact design-system control sizing');
  assert.match(src, /rounded-xl/);
  assert.match(src, /bg-gray-100\/80/);
  assert.match(src, /text-gray-500/);
  assert.doesNotMatch(src, />Halaman</);
  assert.match(src, /text-left/);
  assert.match(src, /icon: Icon/);
  assert.match(src, /truncate text-sm font-bold text-slate-900/);
  assert.match(src, /ThemeToggle/);
  assert.match(src, /rightSlot \?\? <ThemeToggle \/>/);
});

test('StickyWhatsAppCta: floating pill with agent photo + WhatsApp Chat button', () => {
  const src = read('src/components/portal-jamaah/components/StickyWhatsAppCta.tsx');
  assert.match(src, /fixed left-4 right-4/);
  assert.match(src, /safe-area-inset-bottom/);
  assert.match(src, /z-40/, 'contact pill must stay below z-50 dialogs');
  assert.match(src, /rounded-full/);
  assert.match(src, /backdrop-blur-md/);
  assert.match(src, /bg-emerald-500/);
  assert.match(src, /shadow-lg shadow-emerald-500\/20/);
  assert.match(src, /normalizeWaNumber/);
  assert.match(src, /max-w-lg/);
  assert.match(src, /SHOW_AFTER_SCROLL_Y\s*=\s*160/, 'should not cover first viewport content');
  assert.match(src, /useState\(false\)/, 'starts hidden until scroll intent is clear');
  assert.match(src, /pointer-events-none translate-y-24 opacity-0/, 'smart scroll hide');
});

test('HeroCountdown: emerald gradient hero with compact countdown', () => {
  const src = read('src/components/portal-jamaah/components/HeroCountdown.tsx');
  assert.match(src, /text-\[34px\]/, 'countdown should use compact mobile-first sizing');
  assert.match(src, /radial-gradient\(circle at 82% 72%/);
  assert.match(src, /linear-gradient\(145deg, #022c22 0%, #064e3b 34%, #0f766e 68%, #065f46 100%\)/i);
  assert.match(src, /relative overflow-hidden rounded-2xl/);
  assert.match(src, /viewBox="0 0 420 420"/);
  assert.match(src, /opacity-\[0\.10\]/);
  assert.match(src, /preserveAspectRatio="none"/);
  assert.match(src, /translate\(356 58\) scale\(0\.62\)/);
  assert.match(src, /translate\(48 390\) scale\(0\.72\)/);
  assert.match(src, /M0 -72 18 -18 72 0/);
  assert.match(src, /M-70 58v-126/);
  assert.match(src, /via-amber-200\/10/);
  assert.match(src, /rgba\(251,191,36,0\.08\)/);
  assert.doesNotMatch(src, /translate\(356 262\) scale\(0\.62\)/);
  assert.doesNotMatch(src, /opacity="0\.(05|08|12|13|14|18|22|26|28|35|45)"/);
  assert.doesNotMatch(src, /backgroundSize:\s*['"]48px 84px['"]/);
  assert.match(src, />Berangkat</i);
  assert.doesNotMatch(src, /Menuju Tanah Suci/i);
  assert.match(src, /rounded-2xl/);
  assert.match(src, /id_umroh/);
  assert.match(src, /greetingName/);
  assert.match(src, /Assalamualaikum/);
  assert.match(src, /booking\.jadwal\?\.jadwal_nama \|\| booking\.paket \|\| 'Paket Umroh'/);
  assert.match(src, /leading-snug/);
  assert.match(src, /images\.kiwi\.com\/airlines\/64\/\$\{prefix\}\.png/);
  assert.match(src, /airline\.name/);
  assert.match(src, /flightCodeText/);
  assert.match(src, /Penerbangan/);
  assert.match(src, /grid grid-cols-2 gap-2/);
  assert.match(src, /line-clamp-2/);
  assert.doesNotMatch(src, /function flightLabel/);
  assert.doesNotMatch(src, /\$\{normalized\}\s*·/);
  assert.doesNotMatch(src, /tripDurationDays/);
  assert.doesNotMatch(src, /Durasi/);
  assert.doesNotMatch(src, /truncate text-sm font-bold">\{booking\.paket/);
});

test('PortalMenuCard: card with icon badge + label-only tap handler', () => {
  const src = read('src/components/portal-jamaah/components/PortalMenuCard.tsx');
  assert.doesNotMatch(src, /aspect-square/);
  assert.match(src, /w-11 h-11/, 'icon container should match dashboard menu tiles');
  assert.match(src, /rounded-2xl/);
  assert.match(src, /flex flex-col items-center text-center/);
  assert.doesNotMatch(src, /min-h-\[96px\]/);
  assert.match(src, /active:scale-\[0\.97\]/);
  assert.match(src, /text-\[12px\] font-bold/);
  assert.match(src, /aria-label=\{menu\.label\}/);
  assert.match(src, /title=\{menu\.desc\}/);
  assert.match(src, /menu\.iconBg/);
  assert.match(src, /blur-2xl/);
  assert.match(src, /menu\.iconShadow/);
  assert.match(src, /hover:-translate-y-0\.5/);
});

test('PortalMenuGrid: 3-col grid wiring PORTAL_MENUS', () => {
  const src = read('src/components/portal-jamaah/components/PortalMenuGrid.tsx');
  assert.match(src, /grid grid-cols-3 gap-3/);
  assert.match(src, /PORTAL_MENUS/);
  assert.match(src, /onNavigate/);
});

test('SmartAlertsStrip: renders alerts via deriveAlerts', () => {
  const src = read('src/components/portal-jamaah/components/SmartAlertsStrip.tsx');
  assert.match(src, /deriveAlerts/);
  assert.match(src, /onNavigate/);
  assert.match(src, /ChevronRight/);
  // Tone classes
  assert.match(src, /bg-red-50/);
  assert.match(src, /bg-amber-50/);
});

test('TaskListWidget: renders deriveTopTasks output + empty-state', () => {
  const src = read('src/components/portal-jamaah/components/TaskListWidget.tsx');
  assert.match(src, /deriveTopTasks/);
  assert.match(src, /Semua tugas tuntas/i);
  assert.match(src, /ChevronRight/);
  assert.match(src, /Yang Perlu Anda Lakukan/i);
});

test('RosterItem: gender ring + payment overlay + visual progress bar', () => {
  const src = read('src/components/portal-jamaah/components/RosterItem.tsx');
  assert.match(src, /ring-pink-300/);
  assert.match(src, /ring-blue-300/);
  assert.match(src, /bg-emerald-500/, 'lunas overlay');
  assert.match(src, /bg-blue-500/, 'dp overlay');
  assert.match(src, /bg-amber-500/, 'belum overlay');
  assert.match(src, /h-1\.5[^"']*rounded-full/, 'progress bar');
});

test('BerandaPage: composes hero + alerts + menu grid + tasks + roster', () => {
  const src = read('src/components/portal-jamaah/pages/BerandaPage.tsx');
  assert.match(src, /PortalTopBar/);
  assert.match(src, /HeroCountdown/);
  assert.match(src, /SmartAlertsStrip/);
  assert.match(src, /PortalMenuGrid/);
  assert.match(src, /TaskListWidget/);
  assert.match(src, /RosterItem/);
  assert.match(src, /ThemeToggle/);
  assert.match(src, /usePortalPersiapan/);
  assert.match(src, /getCompactJamaahName/);
  assert.match(src, /greetingName=\{`\$\{greetingPrefix\} \$\{compactName\}`\}/);
  assert.doesNotMatch(src, /getInitials/);
  assert.doesNotMatch(src, /Semoga persiapan Umroh berjalan lancar/);
  assert.doesNotMatch(src, /Kode Perjalanan/);
  assert.doesNotMatch(src, /Rombongan/);
  assert.doesNotMatch(src, /Ticket/);
  assert.doesNotMatch(src, /Users/);
  assert.doesNotMatch(src, /text-2xl font-bold tracking-tight text-gray-900/);
  assert.match(src, /bg-gradient-to-b from-gray-50 to-gray-100/);
  assert.match(src, /max-w-lg/);
  assert.match(src, /pb-24/);
});

test('PerjalananPage: emerald hero + FlightCard + HotelCard + ItineraryList', () => {
  const src = read('src/components/portal-jamaah/pages/PerjalananPage.tsx');
  const itinerary = read('src/components/portal-jamaah/components/ItineraryList.tsx');
  const hotel = read('src/components/portal-jamaah/components/HotelCard.tsx');
  assert.match(src, /PortalBackBar/);
  assert.match(src, /FlightCard/);
  assert.match(src, /HotelCard/);
  assert.match(src, /ItineraryList/);
  assert.match(src, /data\.booking\.jadwal\?\.jadwal_nama \|\| data\.booking\.paket \|\| 'Paket Umroh'/);
  assert.match(src, /linear-gradient.*064e3b/i, 'emerald hero gradient');
  assert.match(src, /formatPackageTitle/);
  assert.match(src, /displayPackageName/);
  assert.match(src, /className="rounded-2xl p-5 text-white shadow-sm"/);
  assert.match(src, /text-xl font-bold leading-tight tracking-tight/);
  assert.match(src, /Rencana perjalanan/);
  assert.match(src, /itineraryUrl=\{schedule\?\.itinerary_url\}/);
  assert.doesNotMatch(src, /AI-generated/);
  assert.doesNotMatch(src, /Durasi sesuai itinerary/);
  assert.doesNotMatch(src, /Tipe kamar sesuai paket/);
  assert.doesNotMatch(src, /schedule\?\.itinerary_url && \(/);
  assert.match(itinerary, /itineraryUrl\?: string \| null/);
  assert.match(itinerary, /Buka itinerary lengkap/);
  assert.match(itinerary, /href=\{itineraryUrl\}/);
  assert.match(hotel, /\[duration, roomType\]\.filter\(Boolean\)\.join\(' · '\)/);
  assert.match(src, /max-w-lg/);
  assert.match(src, /pb-24/);
});

test('PembayaranPage: blue hero + JamaahPaymentCard + CTAs', () => {
  const src = read('src/components/portal-jamaah/pages/PembayaranPage.tsx');
  assert.match(src, /PortalBackBar/);
  assert.match(src, /JamaahPaymentCard/);
  assert.match(src, /linear-gradient.*1e3a8a/i, 'blue hero');
  assert.match(src, /Cara Transfer/i);
  assert.match(src, /Konfirmasi/i);
  assert.match(src, /max-w-lg/);
  assert.match(src, /pb-24/);
});

test('DokumenPage: amber-themed, JamaahSelector + 5 dokumen wajib', () => {
  const src = read('src/components/portal-jamaah/pages/DokumenPage.tsx');
  assert.match(src, /PortalBackBar/);
  assert.match(src, /JamaahSelector/);
  for (const doc of ['Paspor', 'KTP', 'Vaksin Meningitis', 'Foto 4x6', 'Buku Nikah']) {
    assert.match(src, new RegExp(doc));
  }
  assert.doesNotMatch(src, /Visa Umroh/);
  assert.doesNotMatch(src, /Kartu Keluarga/);
  assert.match(src, /amber/);
});

test('PerlengkapanPage: violet-themed, uses existing PerlengkapanSubTab content', () => {
  const src = read('src/components/portal-jamaah/pages/PerlengkapanPage.tsx');
  assert.match(src, /PortalBackBar/);
  assert.match(src, /JamaahSelector/);
  assert.match(src, /PerlengkapanItem/);
  assert.match(src, /perlengkapan/i);
});

test('ManasikSpiritualPage: purple manasik info + spiritual checklist', () => {
  const src = read('src/components/portal-jamaah/pages/ManasikSpiritualPage.tsx');
  assert.match(src, /PortalBackBar/);
  assert.match(src, /manasik/i);
  assert.match(src, /spiritual/i);
  assert.match(src, /usePortalPersiapan/);
  assert.match(src, /linear-gradient.*581c87/i, 'purple gradient');
});

test('FaqPage: accordion of PORTAL_FAQ + escalation CTA', () => {
  const src = read('src/components/portal-jamaah/pages/FaqPage.tsx');
  assert.match(src, /PortalBackBar/);
  assert.match(src, /PORTAL_FAQ/);
  assert.match(src, /Hubungi \{data\.agent\?\.name \|\| 'Agent'\} via WhatsApp/);
  assert.match(src, /useState/);
});

test('PortalDashboard: wires 7 routes + StickyWhatsAppCta + no PortalBottomNav', () => {
  const src = read('src/components/portal-jamaah/pages/PortalDashboard.tsx');
  assert.doesNotMatch(src, /PortalBottomNav/, 'bottom nav removed');
  assert.match(src, /BerandaPage/);
  assert.match(src, /PerjalananPage/);
  assert.match(src, /PembayaranPage/);
  assert.match(src, /DokumenPage/);
  assert.match(src, /PerlengkapanPage/);
  assert.match(src, /ManasikSpiritualPage/);
  assert.match(src, /FaqPage/);
  assert.match(src, /StickyWhatsAppCta/);
  assert.match(src, /usePortalRoute/);
  assert.match(src, /usePortalTheme/);
});

// Helper for design-system parity checks — used by subsequent tests
export { read, exists };
