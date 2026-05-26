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

test('usePortalTheme: persists in localStorage and toggles dark class', () => {
  const src = read('src/components/portal-jamaah/hooks/usePortalTheme.ts');
  assert.match(src, /STORAGE_KEY\s*=\s*['"]portalDarkMode['"]/);
  assert.match(src, /localStorage\.getItem\(STORAGE_KEY\)/);
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
  for (const id of ['perjalanan', 'pembayaran', 'dokumen', 'perlengkapan', 'manasik', 'faq']) {
    assert.match(src, new RegExp(`id:\\s*['"]${id}['"]`), `menu ${id} missing`);
  }
  assert.match(src, /from-emerald-400/);
  assert.match(src, /from-sky-400/);
  assert.match(src, /from-amber-400/);
  assert.match(src, /from-violet-400/);
  assert.match(src, /from-purple-400/);
  assert.match(src, /from-rose-400/);
});

test('portalAlerts: deriveAlerts returns max 2 alerts in priority order', () => {
  const src = read('src/components/portal-jamaah/lib/portalAlerts.ts');
  assert.match(src, /export function deriveAlerts/);
  assert.match(src, /export interface PortalAlert/);
  assert.match(src, /payment|pembayaran/i);
  assert.match(src, /dokumen/i);
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
  assert.match(src, /bg-gray-100\/80 dark:bg-slate-800\/80/);
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
  assert.doesNotMatch(src, /Bell/, 'dummy bell button must be removed');
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
  assert.match(src, /px-4 py-2/, 'sub-page header should match dashboard header height');
  assert.match(src, /h-9 w-9/, 'back button should use compact dashboard-height control sizing');
  assert.match(src, /bg-gray-100\/80/);
  assert.match(src, /text-gray-700/);
  assert.match(src, /min-w-0 flex-1 truncate text-sm font-bold text-gray-900/);
  assert.match(src, /ThemeToggle/);
  assert.match(src, /rightSlot \?\? <ThemeToggle \/>/);
  assert.doesNotMatch(src, />Halaman</);
  assert.doesNotMatch(src, /text-center/);
});

test('StickyWhatsAppCta: floating pill with agent photo + WhatsApp Chat button', () => {
  const src = read('src/components/portal-jamaah/components/StickyWhatsAppCta.tsx');
  assert.match(src, /fixed bottom-6/);
  assert.match(src, /z-50/);
  assert.match(src, /rounded-full/);
  assert.match(src, /backdrop-blur-md/);
  assert.match(src, /bg-emerald-500/);
  assert.match(src, /shadow-lg shadow-emerald-500\/20/);
  assert.match(src, /normalizeWaNumber/);
  assert.match(src, /max-w-lg/);
  assert.match(src, /translate-y-\[200%\]/, 'smart scroll hide');
});

test('HeroCountdown: emerald gradient hero with text-6xl countdown', () => {
  const src = read('src/components/portal-jamaah/components/HeroCountdown.tsx');
  assert.match(src, /text-6xl/, 'countdown should be text-6xl');
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
  assert.match(src, /Menuju Tanah Suci/i);
  assert.match(src, /rounded-2xl/);
  assert.match(src, /id_umroh/);
  assert.match(src, /greetingName/);
  assert.match(src, /Assalamualaikum/);
  assert.match(src, /booking\.jadwal\?\.jadwal_nama \|\| booking\.paket \|\| 'Paket Umroh'/);
  assert.match(src, /leading-snug/);
  assert.match(src, /images\.kiwi\.com\/airlines\/64\/\$\{prefix\}\.png/);
  assert.match(src, /airline\.name/);
  assert.match(src, /flightCodeText/);
  assert.match(src, /flex-col items-end text-right/);
  assert.doesNotMatch(src, /function flightLabel/);
  assert.doesNotMatch(src, /\$\{normalized\}\s*·/);
  assert.doesNotMatch(src, /tripDurationDays/);
  assert.doesNotMatch(src, /Durasi/);
  assert.doesNotMatch(src, /truncate text-sm font-bold">\{booking\.paket/);
});

test('PortalMenuCard: card with icon badge + label-only tap handler', () => {
  const src = read('src/components/portal-jamaah/components/PortalMenuCard.tsx');
  assert.match(src, /aspect-square/);
  assert.match(src, /w-12 h-12/, 'icon container should be 48x48');
  assert.match(src, /rounded-2xl/);
  assert.match(src, /h-full flex-col items-center justify-center/);
  assert.doesNotMatch(src, /min-h-\[96px\]/);
  assert.match(src, /active:scale-\[0\.97\]/);
  assert.match(src, /text-\[13px\] font-bold/);
  assert.doesNotMatch(src, /menu\.desc/);
  assert.doesNotMatch(src, /text-\[11px\]/, 'desc text should not render');
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
  assert.match(src, /Semua persiapan up-to-date/i);
  assert.match(src, /ChevronRight/);
  assert.match(src, /YANG PERLU ANDA LAKUKAN/);
});

test('RosterItem: gender ring + payment overlay + visual progress bar', () => {
  const src = read('src/components/portal-jamaah/components/RosterItem.tsx');
  assert.match(src, /ring-pink-300/);
  assert.match(src, /ring-blue-300/);
  assert.match(src, /bg-emerald-500/, 'lunas overlay');
  assert.match(src, /bg-blue-500/, 'dp overlay');
  assert.match(src, /bg-amber-500/, 'belum overlay');
  assert.match(src, /h-1\.5 rounded-full/, 'progress bar');
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

test('DokumenPage: amber-themed, JamaahSelector + 6 dokumen wajib', () => {
  const src = read('src/components/portal-jamaah/pages/DokumenPage.tsx');
  assert.match(src, /PortalBackBar/);
  assert.match(src, /JamaahSelector/);
  for (const doc of ['Paspor', 'Visa', 'Vaksin Meningitis', 'KTP', 'Kartu Keluarga', 'Foto']) {
    assert.match(src, new RegExp(doc));
  }
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
  assert.match(src, /Tidak menemukan jawaban/i);
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
