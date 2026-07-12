import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isLandingBuilderEnabledForAgent,
  requireLandingBuilderAccess,
} from '../lib/landing-builder-access.js';

test('landing page builder is enabled only for agent Nikita', () => {
  assert.equal(isLandingBuilderEnabledForAgent({ slug: 'nikita' }), true);
  assert.equal(isLandingBuilderEnabledForAgent({ slug: ' Nikita ' }), true);
  assert.equal(isLandingBuilderEnabledForAgent({ slug: 'agent-lain' }), false);
  assert.equal(isLandingBuilderEnabledForAgent({}), false);
});

test('landing page builder access guard returns a generic 403 for other agents', () => {
  let responseStatus = 0;
  let responseBody = null;
  const response = {
    status(status) {
      responseStatus = status;
      return this;
    },
    json(body) {
      responseBody = body;
      return this;
    },
  };

  assert.equal(requireLandingBuilderAccess({ slug: 'agent-lain' }, response), false);
  assert.equal(responseStatus, 403);
  assert.deepEqual(responseBody, { error: 'Fitur Landing Page Builder belum tersedia untuk agent ini' });
});

test('builder card and direct editor route use the Nikita feature gate', () => {
  const pageSource = readFileSync(new URL('../src/components/LandingPagePage.tsx', import.meta.url), 'utf8');
  const layoutSource = readFileSync(new URL('../src/components/DashboardLayout.tsx', import.meta.url), 'utf8');
  const serverSource = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

  assert.match(pageSource, /landingBuilderEnabled\s*&&\s*\(\s*<LandingBuilderEntryCard type="umroh"/);
  assert.match(pageSource, /landingBuilderEnabled\s*&&\s*\(\s*<LandingBuilderEntryCard type="haji"/);
  assert.match(layoutSource, /landingEditorType && !landingBuilderEnabled/);
  assert.match(layoutSource, /landing-page\/\$\{landingEditorType\}/);
  assert.equal(
    serverSource.match(/if \(!requireLandingBuilderAccess\(agent, res\)\) return;/g)?.length,
    5,
  );

  for (const route of [
    /app\.get\('\/api\/landing-builder\/:type'[\s\S]*?requireLandingBuilderAccess\(agent, res\)/,
    /app\.put\('\/api\/landing-builder\/:type\/draft'[\s\S]*?requireLandingBuilderAccess\(agent, res\)/,
    /app\.post\('\/api\/landing-builder\/:type\/publish'[\s\S]*?requireLandingBuilderAccess\(agent, res\)/,
    /app\.post\('\/api\/landing-builder\/:type\/preview'[\s\S]*?requireLandingBuilderAccess\(agent, res\)/,
    /app\.post\('\/api\/landing-builder\/:type\/hero-image'[\s\S]*?requireLandingBuilderAccess\(agent, res\)/,
  ]) {
    assert.match(serverSource, route);
  }
});
