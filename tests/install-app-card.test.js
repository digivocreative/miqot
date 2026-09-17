import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Kartu ajakan pasang aplikasi di beranda dashboard (audit PWA 2026-09-17). Yang dikunci
// adalah HASIL render komponen sungguhan (SSR) per keadaan peramban, bukan ejaan kodenya:
//  - app terpasang / sudah terpasang / baru ditutup (< 30 hari) → tidak tampil sama sekali;
//  - Android/desktop hanya tampil kalau beforeinstallprompt sudah tertangkap (tombol
//    tanpa event = tombol mati);
//  - iOS (tanpa event) menampilkan langkah Bagikan → Tambahkan ke Layar Utama;
//  - penyimpanan yang diblokir tidak boleh membuat dashboard gagal dirender.

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const NODE_PATHS = createRequire(import.meta.url).resolve.paths('react').filter((dir) => existsSync(dir));

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-A155F) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36';
const DISMISSED_KEY = 'pwa-install-card-dismissed-at';
const DAY = 24 * 60 * 60 * 1000;

let bundleUrl;
let scenario = 0;

before(async () => {
  // realpath: tmpdir() macOS lewat symlink (/var → /private/var).
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'install-app-card-ssr-')));
  process.once('exit', () => rmSync(dir, { recursive: true, force: true }));
  const entryPath = join(dir, 'entry.tsx');
  // Renderer dibundel BERSAMA komponen: satu salinan React untuk keduanya.
  writeFileSync(entryPath, `
    import { createElement } from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import InstallAppCard from ${JSON.stringify(join(ROOT, 'src/components/pwa/InstallAppCard.tsx'))};
    export { getInstallPromptStore } from ${JSON.stringify(join(ROOT, 'src/lib/pwa/installPrompt.ts'))};
    export function render() {
      return renderToStaticMarkup(createElement(InstallAppCard));
    }
  `);
  const outfile = join(dir, 'bundle.mjs');
  await build({
    entryPoints: [entryPath],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    absWorkingDir: ROOT,
    nodePaths: NODE_PATHS,
    define: { 'process.env.NODE_ENV': '"production"' },
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    logLevel: 'silent',
  });
  bundleUrl = pathToFileURL(outfile).href;
});

/**
 * Pasang peramban tiruan lalu muat modul SEGAR (singleton store install per skenario).
 * `events` ditembakkan ke window setelah store dibuat, sebelum render — sama seperti
 * main.tsx yang menangkap beforeinstallprompt sebelum React mount.
 */
async function renderCard({
  userAgent,
  maxTouchPoints = 5,
  iosStandalone = false,
  displayStandalone = false,
  storage = {},
  storageBlocked = false,
  events = [],
}) {
  const handlers = {};
  const nav = { userAgent, maxTouchPoints, standalone: iosStandalone };
  const store = {
    getItem: (key) => (key in storage ? storage[key] : null),
    setItem: (key, value) => { storage[key] = String(value); },
  };
  globalThis.window = {
    location: { pathname: '/dashboard' },
    navigator: nav,
    addEventListener: (type, fn) => { handlers[type] = fn; },
    matchMedia: (query) => ({ matches: displayStandalone && query.includes('standalone') }),
    get localStorage() {
      if (storageBlocked) throw new Error('SecurityError: storage diblokir');
      return store;
    },
  };
  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });

  scenario += 1;
  const mod = await import(`${bundleUrl}?scenario=${scenario}`);
  mod.getInstallPromptStore();
  for (const [type, event] of events) handlers[type]?.(event);
  return mod.render();
}

const promptEvent = () => ({
  preventDefault() {},
  prompt: () => Promise.resolve(),
  userChoice: Promise.resolve({ outcome: 'dismissed' }),
});

const INSTALL_BUTTON = /Pasang aplikasi<\/button>/;
const IOS_STEPS = /Tambahkan ke Layar Utama/;

test('iOS Safari (belum terpasang) menampilkan langkah Bagikan, tanpa tombol pasang', async () => {
  const html = await renderCard({ userAgent: IPHONE });
  assert.match(html, IOS_STEPS);
  assert.match(html, /Bagikan/);
  assert.doesNotMatch(html, INSTALL_BUTTON);
  assert.match(html, /aria-label="Tutup ajakan pasang aplikasi"/);
});

test('Android tanpa beforeinstallprompt tidak menampilkan kartu (tombol akan mati)', async () => {
  assert.equal(await renderCard({ userAgent: ANDROID }), '');
});

test('Android dengan beforeinstallprompt tertangkap menampilkan tombol Pasang aplikasi', async () => {
  const html = await renderCard({ userAgent: ANDROID, events: [['beforeinstallprompt', promptEvent()]] });
  assert.match(html, INSTALL_BUTTON);
  assert.doesNotMatch(html, IOS_STEPS);
});

test('app yang sudah dibuka sebagai app terpasang tidak menampilkan kartu', async () => {
  assert.equal(await renderCard({ userAgent: IPHONE, iosStandalone: true }), '');
  assert.equal(
    await renderCard({ userAgent: ANDROID, displayStandalone: true, events: [['beforeinstallprompt', promptEvent()]] }),
    '',
  );
});

test('appinstalled menyembunyikan kartu', async () => {
  const html = await renderCard({
    userAgent: ANDROID,
    events: [['beforeinstallprompt', promptEvent()], ['appinstalled', {}]],
  });
  assert.equal(html, '');
});

test('ditutup kurang dari 30 hari lalu → tersembunyi; lewat 30 hari → tampil lagi', async () => {
  const recent = { [DISMISSED_KEY]: String(Date.now() - 5 * DAY) };
  assert.equal(await renderCard({ userAgent: IPHONE, storage: recent }), '');
  const old = { [DISMISSED_KEY]: String(Date.now() - 31 * DAY) };
  assert.match(await renderCard({ userAgent: IPHONE, storage: old }), IOS_STEPS);
});

test('localStorage diblokir tidak membuat kartu (dan dashboard) gagal dirender', async () => {
  assert.match(await renderCard({ userAgent: IPHONE, storageBlocked: true }), IOS_STEPS);
});
