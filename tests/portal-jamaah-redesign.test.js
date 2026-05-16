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
  assert.match(src, /rounded-xl/);
  assert.match(src, /usePortalTheme/);
  assert.match(src, /active:scale-95/);
});

test('PortalTopBar: uses DESIGN-SYSTEM classes (backdrop-blur, dark mode, no bell)', () => {
  const src = read('src/components/portal-jamaah/components/PortalTopBar.tsx');
  assert.match(src, /backdrop-blur-md/);
  assert.match(src, /bg-white\/90 dark:bg-slate-900\/90/);
  assert.match(src, /sticky top-0 z-30/);
  assert.match(src, /max-w-lg/);
  assert.doesNotMatch(src, /Bell/, 'dummy bell button must be removed');
});

test('PortalBackBar: back button + title + sticky header per DESIGN-SYSTEM', () => {
  const src = read('src/components/portal-jamaah/components/PortalBackBar.tsx');
  assert.match(src, /sticky top-0 z-30/);
  assert.match(src, /backdrop-blur-md/);
  assert.match(src, /ChevronLeft/);
  assert.match(src, /max-w-lg/);
  assert.match(src, /onBack/);
});

test('StickyWhatsAppCta: fixed bottom, emerald-500, shadow', () => {
  const src = read('src/components/portal-jamaah/components/StickyWhatsAppCta.tsx');
  assert.match(src, /fixed bottom-0/);
  assert.match(src, /z-40/);
  assert.match(src, /bg-emerald-500/);
  assert.match(src, /shadow-lg shadow-emerald-500\/30/);
  assert.match(src, /MessageCircle/);
  assert.match(src, /normalizeWaNumber/);
  assert.match(src, /max-w-lg/);
});

test('HeroCountdown: emerald gradient hero with text-6xl countdown', () => {
  const src = read('src/components/portal-jamaah/components/HeroCountdown.tsx');
  assert.match(src, /text-6xl/, 'countdown should be text-6xl');
  assert.match(src, /linear-gradient.*064e3b/i);
  assert.match(src, /Menuju Tanah Suci/i);
  assert.match(src, /rounded-2xl/);
  assert.match(src, /id_umroh/);
});

test('PortalMenuCard: card with icon badge + label + desc + tap handler', () => {
  const src = read('src/components/portal-jamaah/components/PortalMenuCard.tsx');
  assert.match(src, /w-12 h-12/, 'icon container should be 48x48');
  assert.match(src, /rounded-2xl/);
  assert.match(src, /active:scale-\[0\.97\]/);
  assert.match(src, /text-\[13px\] font-bold/);
  assert.match(src, /text-\[11px\]/, 'desc text size');
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

// Helper for design-system parity checks — used by subsequent tests
export { read, exists };
