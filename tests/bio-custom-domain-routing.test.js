import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rootPath = new URL('..', import.meta.url).pathname;

function read(path) {
  return readFileSync(join(rootPath, path), 'utf8');
}

test('server serves /bio directly on custom domains with agent context', () => {
  const server = read('server.js');

  assert.match(server, /app\.get\('\/bio',\s*async\s*\(req,\s*res,\s*next\)\s*=>/);
  assert.match(server, /if \(!req\.customDomain \|\| !req\.customDomainAgent\) return next\(\);/);
  assert.match(server, /const pageUrl = `\$\{origin\}\/bio`;/);
  assert.match(server, /window\.__AGENT_CONTEXT__ = \$\{serializeInlineJson\(buildAgentContextPayload\(agent,\s*customDomain\)\)\};/);
  assert.match(server, /'Cache-Control': 'private, no-store, must-revalidate'/);
});

test('frontend routes custom-domain /bio to BioPage using server agent slug', () => {
  const main = read('src/main.tsx');
  const viteEnv = read('src/vite-env.d.ts');
  const productTile = read('src/components/bio/tiles/TileProduct.tsx');
  const featuredTile = read('src/components/bio/tiles/TileFeatured.tsx');
  const urlHelper = read('src/components/bio/bioUrls.ts');

  // Kesimpulan "lewat custom domain" WAJIB dari flag eksplisit server, bukan
  // dari ada/tidaknya field customDomain — lihat src/lib/agent-context.js dan
  // tests/agent-context-custom-domain.test.js.
  assert.match(main, /const serverAgentContext = readAgentContext\(\)/);
  assert.match(main, /const isCustomDomainHost = isViaCustomDomain\(serverAgentContext\)/);
  assert.match(main, /const customDomainSlug = \(customDomainSlugFrom\(serverAgentContext\) \|\| ''\)\.toLowerCase\(\)/);
  assert.match(main, /const isCustomDomainBio = isCustomDomainHost && segments\.length === 1 && segments\[0\] === 'bio'/);
  assert.match(main, /const bioSlug = isBio \? \(isCustomDomainBio \? customDomainSlug : segments\[0\]\?\.toLowerCase\(\)\) : null/);
  assert.match(main, /if \(isBio && bioSlug\) return <BioPage slug=\{bioSlug\} \/>/);
  assert.match(viteEnv, /customDomain\?: string \| null;/);
  assert.match(viteEnv, /viaCustomDomain\?: boolean;/);
  assert.match(urlHelper, /isViaCustomDomain\(context\)/);
  assert.match(urlHelper, /context\?\.slug\?\.toLowerCase\(\) === agentSlug\.toLowerCase\(\)/);
  assert.match(urlHelper, /return normalizedPath \? `\/\$\{normalizedPath\}` : '\/';/);
  assert.match(urlHelper, /return normalizedPath \? `\/\$\{agentSlug\}\/\$\{normalizedPath\}` : `\/\$\{agentSlug\}`;/);
  assert.match(productTile, /import \{ getBioAgentPath \} from '\.\.\/bioUrls';/);
  assert.match(productTile, /const href = getBioAgentPath\(agent\.slug,\s*meta\.path\);/);
  assert.match(featuredTile, /const href = getBioAgentPath\(agent\.slug,\s*data\.jadwal_id\);/);
});
