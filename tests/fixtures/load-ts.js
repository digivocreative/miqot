/**
 * Memuat modul TypeScript dari src/ ke dalam tes node.
 *
 * node tidak bisa mengimpor `.ts` langsung, jadi berkasnya di-bundle dulu lewat
 * esbuild — bundler yang sudah ikut terpasang bersama vite. Pola resolusinya
 * sengaja disamakan dengan tests/fixtures/package-card-render.js:
 * NODE_PATHS diturunkan dari `resolve.paths()`, BUKAN join(ROOT, 'node_modules'),
 * supaya tes tetap jalan di git worktree yang tidak punya node_modules sendiri.
 * Tanpa itu setiap impor gagal dengan "Could not resolve react" — galat yang
 * muncul lebih dulu dan menutupi galat yang sebenarnya sedang dicari.
 *
 * Hanya untuk modul MURNI (tanpa React, tanpa aset). Untuk komponen, pakai
 * harness SSR di package-card-render.js.
 */
import { build } from 'esbuild';
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

const NODE_PATHS = createRequire(import.meta.url)
  .resolve.paths('esbuild')
  .filter((dir) => existsSync(dir));

/**
 * @param {string} rel jalur modul relatif terhadap akar repo, mis. 'src/lib/wideLayout.ts'
 * @returns {Promise<Record<string, unknown>>} namespace modul hasil bundling
 */
export async function loadTs(rel) {
  // realpath: di macOS tmpdir() adalah symlink (/var → /private/var). Tanpa ini
  // jalur impor dinamis dan jalur berkas hasil build bisa berbeda.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'alhijaz-ts-')));
  const outfile = join(dir, 'mod.mjs');
  try {
    await build({
      entryPoints: [join(ROOT, rel)],
      outfile,
      format: 'esm',
      platform: 'node',
      bundle: true,
      nodePaths: NODE_PATHS,
      alias: { '@': join(ROOT, 'src') },
      logLevel: 'silent',
    });
    return await import(outfile);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
