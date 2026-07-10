import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rootPath = new URL('..', import.meta.url).pathname;

function read(path) {
  return readFileSync(join(rootPath, path), 'utf8');
}

test('root render is protected from lazy chunk and dev overlay crashes', () => {
  const main = read('src/main.tsx');

  assert.match(main, /class RenderErrorBoundary extends Component/);
  assert.match(main, /function RouteErrorFallback\(\)/);
  assert.match(main, /const LocalAgentation = import\.meta\.env\.DEV && getBrowserStorage\('local'\)/);
  assert.match(main, /<RenderErrorBoundary fallback=\{<RouteErrorFallback \/>\}>[\s\S]*\{page\}[\s\S]*<\/RenderErrorBoundary>/);
  assert.match(main, /<RenderErrorBoundary fallback=\{null\}>[\s\S]*<LocalAgentation \/>[\s\S]*<\/RenderErrorBoundary>/);
});

test('agent schedule tools do not require localStorage to render', () => {
  for (const path of ['src/components/KalkulasiPage.tsx', 'src/components/ComparePage.tsx']) {
    const src = read(path);

    assert.match(src, /function getLocalStorageItem\(key: string\): string \| null/);
    assert.match(src, /function setLocalStorageItem\(key: string, value: string\): void/);
    assert.match(src, /getLocalStorageItem\('darkMode'\)/);
    assert.match(src, /setLocalStorageItem\('darkMode', isDarkMode\.toString\(\)\)/);
  }
});

test('custom-domain and service-worker paths keep stale shells from blanking pages', () => {
  const server = read('server.js');
  const vite = read('vite.config.ts');
  const html = read('index.html');
  const deploy = read('deploy.sh');

  assert.match(server, /function isSharedStaticRequestPath\(path\)/);
  assert.match(server, /if \(isSharedStaticRequestPath\(req\.path \|\| '\/'\)\) return next\(\);/);
  assert.match(server, /async function isCustomDomainDnsHealthyForRedirect\(domain\)/);
  assert.match(server, /if \(!\(await isCustomDomainDnsHealthyForRedirect\(agent\.custom_domain\)\)\) return next\(\);/);
  assert.match(vite, /\/\\\/bio\\\/\?\$\//);
  assert.match(vite, /\^\\\/bio\\\/\?\$/);
  assert.match(html, /\(\?:umroh\|haji\|bio\)/);
  assert.match(deploy, /Retaining previous hashed assets/);
  assert.match(deploy, /cp -an dist\/assets\/\. dist_staging\/assets\//);
});
