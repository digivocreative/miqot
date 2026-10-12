// Harness SSR CuacaShareTemplate: bundle (esbuild, CJS) lalu renderToStaticMarkup.
// Tes membaca HASIL render, bukan teks sumber. Template murni (tanpa portal/
// framer), jadi tidak perlu shim seperti package-card-render.js.
import { build } from 'esbuild';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const NODE_PATHS = createRequire(import.meta.url).resolve.paths('react').filter((dir) => existsSync(dir));
let loaded = null;

export function loadCuacaTemplateRenderer() {
  loaded ||= (async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cuaca-ssr-'));
    const entry = join(dir, 'entry.tsx');
    const template = join(ROOT, 'src/components/cuaca-share/CuacaShareTemplate.tsx');
    writeFileSync(entry, [
      "import { renderToStaticMarkup } from 'react-dom/server';",
      "import { createElement } from 'react';",
      `import { CuacaShareTemplate } from ${JSON.stringify(template)};`,
      'export const render = (data, assets) => renderToStaticMarkup(createElement(CuacaShareTemplate, { data, assets }));',
    ].join('\n'));
    const outfile = join(dir, 'out.cjs');
    await build({
      entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', outfile,
      jsx: 'automatic', nodePaths: NODE_PATHS, logLevel: 'silent',
      define: { 'process.env.NODE_ENV': '"production"' },
    });
    return createRequire(import.meta.url)(outfile);
  })();
  return loaded;
}
