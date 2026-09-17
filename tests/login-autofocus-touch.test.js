import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Kolom username di halaman login hanya fokus otomatis di perangkat berpointer halus (desktop).
// Di HP, autofocus saat halaman dimuat langsung memunculkan keyboard, dan app terpasang iOS 26
// men-zoom halaman ±5x ke kolom itu (form tak terlihat sampai di-pinch). Terbukti di iPhone 17
// Simulator 2026-09-17 lewat "Masuk" di header publik; Safari biasa & ketuk kolom manual tidak
// ter-zoom. Jalur ini baru terjangkau setelah header app terpasang bebas status bar (audit PWA).
// Yang dikunci: HASIL render LoginPage sungguhan (SSR) per jenis pointer.

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const NODE_PATHS = createRequire(import.meta.url).resolve.paths('react').filter((dir) => existsSync(dir));

let bundleUrl;
let scenario = 0;

before(async () => {
  // realpath: tmpdir() macOS lewat symlink (/var → /private/var).
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'login-autofocus-ssr-')));
  process.once('exit', () => rmSync(dir, { recursive: true, force: true }));
  const entryPath = join(dir, 'entry.tsx');
  // Renderer dibundel BERSAMA komponen: satu salinan React untuk keduanya.
  writeFileSync(entryPath, `
    import { createElement } from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import LoginPage from ${JSON.stringify(join(ROOT, 'src/components/LoginPage.tsx'))};
    export function render() {
      return renderToStaticMarkup(createElement(LoginPage, { onLogin: () => {} }));
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

async function renderLoginSlugInput({ coarsePointer }) {
  globalThis.window = {
    matchMedia: (query) => ({ matches: coarsePointer && query.includes('pointer: coarse') }),
    addEventListener() {},
    removeEventListener() {},
  };
  scenario += 1;
  const mod = await import(`${bundleUrl}?scenario=${scenario}`);
  const html = mod.render();
  const input = html.match(/<input[^>]*id="login-slug"[^>]*>/)?.[0];
  assert.ok(input, 'kolom username login dirender');
  return input;
}

test('desktop (pointer halus): kolom username fokus otomatis', async () => {
  assert.match(await renderLoginSlugInput({ coarsePointer: false }), /\sautofocus=""/);
});

test('HP (pointer kasar): kolom username TIDAK fokus otomatis — keyboard & zoom iOS tak muncul sendiri', async () => {
  assert.doesNotMatch(await renderLoginSlugInput({ coarsePointer: true }), /\sautofocus/);
});
