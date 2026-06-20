import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = new URL('..', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('server exposes DB-backed public top-partner endpoint and reserves the slug', () => {
  const server = read('server.js');

  assert.equal(server.includes('top-partner'), true);
  assert.equal(/RESERVED_SPA_SLUGS = new Set\(\[[^\]]*'top-partner'/s.test(server), true);
  assert.equal(server.includes("app.get('/api/top-partner'"), true);
  assert.equal(server.includes('top_partners_cache'), true);
  assert.equal(server.includes('sanitizePartnerRows'), true);
  assert.equal(server.includes('mirrorTopPartnerPhotos'), true);
  assert.equal(server.includes("cron.schedule('0 4 * * *'"), true);
  assert.equal(server.includes('topPartnerBunnyDeps'), true);
  assert.equal(server.includes('topPartnerBunnyFileExists'), true);
  assert.equal(server.includes('normalizeBunnyDownloadUrl'), true);
});

test('server injects top-partner SEO meta before the SPA fallback', () => {
  const server = read('server.js');
  const routeIndex = server.indexOf("app.get('/top-partner'");
  const fallbackIndex = server.indexOf("app.get('{*path}'");

  assert.notEqual(routeIndex, -1);
  assert.notEqual(fallbackIndex, -1);
  assert.equal(routeIndex < fallbackIndex, true);
  assert.equal(server.includes('TOP_PARTNER_META_TITLE'), true);
  assert.equal(server.includes('TOP_PARTNER_META_DESCRIPTION'), true);
  assert.equal(server.includes('TOP_PARTNER_OG_IMAGE_PATH'), true);
  assert.equal(server.includes('twitter:image'), true);
  assert.equal(server.includes('og:image:width" content="1200"'), true);
  assert.equal(server.includes('og:image:height" content="630"'), true);
});

test('Vite dev top-partner API also mirrors photos to Bunny and seeds DB cache', () => {
  const vite = read('vite.config.ts');

  assert.equal(vite.includes('mirrorTopPartnerPhotos'), true);
  assert.equal(vite.includes('topPartnerBunnyDeps'), true);
  assert.equal(vite.includes('topPartnerBunnyFileExists'), true);
  assert.equal(vite.includes('normalizeBunnyDownloadUrl'), true);
  assert.equal(vite.includes('top_partners_cache'), true);
  assert.equal(vite.includes("dev: true"), true);
});

test('Vite dev top-partner API serves fresh DB cache before slow upstream refresh', () => {
  const vite = read('vite.config.ts');
  const handlerStart = vite.indexOf("server.middlewares.use('/api/top-partner'");
  const handler = vite.slice(handlerStart);

  assert.equal(vite.includes('loadTopPartnerDevCache'), true);
  assert.equal(vite.includes('isTopPartnerCacheFresh'), true);
  assert.equal(vite.includes('sendTopPartnerDevResponse'), true);
  assert.match(handler, /const cached = await loadTopPartnerDevCache\(\);[\s\S]*?if \(cached\?\.partners\?\.length && isTopPartnerCacheFresh\(cached\.syncedAt\)\)/);
  assert.equal(handler.indexOf('loadTopPartnerDevCache') < handler.indexOf('fetch(TOP_PARTNER_ENDPOINT'), true);
});

test('top partner cache migration exists', () => {
  const migrationPath = resolve(new URL('.', root).pathname, 'migrations/20260620000000_top_partners_cache.sql');
  assert.equal(existsSync(migrationPath), true);
  const sql = read('migrations/20260620000000_top_partners_cache.sql');

  assert.match(sql, /CREATE TABLE IF NOT EXISTS top_partners_cache/);
  assert.match(sql, /id TEXT PRIMARY KEY/);
  assert.match(sql, /data JSONB NOT NULL/);
  assert.match(sql, /ALTER TABLE top_partners_cache ENABLE ROW LEVEL SECURITY/);
});

test('SPA routes /top-partner to TopPartnerPage before package slug fallback', () => {
  const main = read('src/main.tsx');

  assert.equal(main.includes('TopPartnerPage'), true);
  assert.equal(main.includes("const isTopPartner = segments.length === 1 && segments[0] === 'top-partner'"), true);
  assert.equal(/knownFirstSegments = \[[^\]]*'top-partner'/s.test(main), true);
  assert.equal(main.includes('if (isTopPartner) return <TopPartnerPage />'), true);
});

test('TopPartnerPage follows the approved mobile-first content constraints', () => {
  const page = read('src/components/TopPartnerPage.tsx');

  assert.equal(page.includes('TOP_PARTNER_META_TITLE'), true);
  assert.equal(page.includes('TOP_PARTNER_META_DESCRIPTION'), true);
  assert.equal(page.includes('TOP_PARTNER_OG_IMAGE_PATH'), true);
  assert.equal(page.includes('setTopPartnerMeta'), true);
  assert.equal(page.includes('og:image'), true);
  assert.match(page, /Partner Pilihan Alhijaz/);
  assert.match(page, /Fast Response/);
  assert.match(page, /Verified Partner/);
  assert.match(page, /logo-alhijaz-white\.png/);
  assert.doesNotMatch(page, /DAFTAR PARTNER/);
  assert.doesNotMatch(page, /Nama, foto, WhatsApp, dan sosial media/);
  assert.doesNotMatch(page, /Urutan bukan ranking/);
  assert.doesNotMatch(page, /YouTube/);
});

test('TopPartnerPage only exposes WhatsApp CTA on partner cards', () => {
  const page = read('src/components/TopPartnerPage.tsx');

  assert.equal(page.includes("import WhatsAppIcon from '@/components/common/WhatsAppIcon'"), true);
  assert.equal(page.includes('<WhatsAppIcon'), true);
  assert.equal(page.includes('function SocialLink'), false);
  assert.equal(page.includes('partner.instagram'), false);
  assert.equal(page.includes('partner.facebook'), false);
  assert.equal(page.includes('partner.tiktok'), false);
  assert.equal(page.includes('partner.website'), false);
  assert.equal(page.includes('Instagram,'), false);
  assert.equal(page.includes('Facebook,'), false);
  assert.equal(page.includes('Music2,'), false);
  assert.equal(page.includes('Globe,'), false);
});

test('TopPartnerPage shows a Meta-style verified badge to the right of the WhatsApp CTA', () => {
  const page = read('src/components/TopPartnerPage.tsx');

  assert.equal(page.includes('BadgeCheck'), true);
  assert.equal(page.includes('aria-label="Partner terverifikasi"'), true);
  assert.equal(page.includes('fill="#1D9BF0"'), true);
  assert.doesNotMatch(page, /<h2[\s\S]*?\{partner\.name\}[\s\S]*?<BadgeCheck[\s\S]*?<\/h2>/);
  assert.match(page, /<WhatsAppIcon[\s\S]*?Hubungi via WhatsApp[\s\S]*?<\/a>[\s\S]*?<span[\s\S]*?aria-label="Partner terverifikasi"[\s\S]*?<BadgeCheck/);
  assert.match(page, /BadgeCheck className="h-5 w-5"/);
});

test('TopPartnerPage progressively reveals partner cards after initial skeleton', () => {
  const page = read('src/components/TopPartnerPage.tsx');

  assert.equal(page.includes('const INITIAL_VISIBLE_PARTNERS = 6'), true);
  assert.equal(page.includes('const REVEAL_PARTNER_STEP = 2'), true);
  assert.equal(page.includes('visibleCount'), true);
  assert.equal(page.includes('IntersectionObserver'), true);
  assert.equal(page.includes('setVisibleCount((current) => Math.min(current + REVEAL_PARTNER_STEP, partners.length))'), true);
  assert.equal(page.includes('partners.slice(0, visibleCount)'), true);
  assert.equal(page.includes('animate-[topPartnerCardIn_'), true);
});

test('TopPartnerPage typography and card gutters follow the design system scale', () => {
  const page = read('src/components/TopPartnerPage.tsx');

  assert.equal(page.includes('font-sans'), true);
  assert.equal(page.includes('text-2xl font-bold'), true);
  assert.equal(page.includes('text-sm font-bold'), true);
  assert.equal(page.includes('text-[11px] font-bold'), true);
  assert.equal(page.includes('text-[9px] font-bold uppercase'), true);
  assert.equal(page.includes('px-2.5 pb-7 pt-3'), true);
  assert.equal(page.includes('text-[15px] font-black'), false);
  assert.equal(page.includes('text-[28px] font-black'), false);
});
