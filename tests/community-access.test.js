import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isCommunityEnabledForAgent,
  requireCommunityAccess,
} from '../lib/community-access.js';

test('ruang komunitas is enabled only for agent Nikita', () => {
  assert.equal(isCommunityEnabledForAgent('nikita'), true);
  assert.equal(isCommunityEnabledForAgent(' Nikita '), true);
  assert.equal(isCommunityEnabledForAgent('agent-lain'), false);
  assert.equal(isCommunityEnabledForAgent({}), false);
  assert.equal(isCommunityEnabledForAgent(undefined), false);
});

test('ruang komunitas access guard allows Nikita without writing a response', () => {
  let statusCalls = 0;
  const response = {
    status() {
      statusCalls += 1;
      return this;
    },
  };

  assert.equal(requireCommunityAccess({ slug: 'nikita' }, response), true);
  assert.equal(statusCalls, 0);
});

test('ruang komunitas access guard returns a generic 403 for other agents', () => {
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

  assert.equal(requireCommunityAccess({ slug: 'agent-lain' }, response), false);
  assert.equal(responseStatus, 403);
  assert.deepEqual(responseBody, { error: 'Fitur Ruang Komunitas belum tersedia untuk agent ini' });
});

test('every community API route uses the Nikita feature gate', () => {
  const serverSource = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

  assert.ok(
    (serverSource.match(/if \(!requireCommunityAccess\(agent, res\)\) return;/g)?.length ?? 0) >= 9,
  );

  for (const [label, declaration] of [
    ['GET /api/community/feed', /app\.get\('\/api\/community\/feed'/],
    ['POST /api/community/posts', /app\.post\('\/api\/community\/posts'/],
    ['POST /api/community/photo', /app\.post\('\/api\/community\/photo'/],
    ['POST /api/community/posts/:id/reaction', /app\.post\('\/api\/community\/posts\/:id\/reaction'/],
    ['GET /api/community/posts/:id/comments', /app\.get\('\/api\/community\/posts\/:id\/comments'/],
    ['POST /api/community/posts/:id/comments', /app\.post\('\/api\/community\/posts\/:id\/comments'/],
    ['DELETE /api/community/posts/:id', /app\.delete\('\/api\/community\/posts\/:id'/],
    ['DELETE /api/community/comments/:id', /app\.delete\('\/api\/community\/comments\/:id'/],
    ['POST /api/community/posts/:id/report', /app\.post\('\/api\/community\/posts\/:id\/report'/],
  ]) {
    const match = declaration.exec(serverSource);
    assert.ok(match, `${label} harus dideklarasikan`);

    const followingSource = serverSource.slice(match.index + match[0].length);
    const nextRouteIndex = followingSource.search(/\napp\.(?:get|post|put|patch|delete)\(/);
    const routeSource = nextRouteIndex === -1
      ? followingSource
      : followingSource.slice(0, nextRouteIndex);

    assert.match(
      routeSource,
      /const agent = await getAgentById\(req\.user\.id\);\s*if \(!agent\) return res\.status\(404\)\.json\(\{ error: 'Agent not found' \}\);\s*if \(!requireCommunityAccess\(agent, res\)\) return;/,
      `${label} harus memuat agent canonical dan menggunakan gate Ruang Komunitas`,
    );
  }

  assert.match(
    serverSource,
    /app\.get\('\/api\/community\/feed', dbLoadShedGuard, authMiddleware/,
  );
});

test('dashboard community UI uses the Nikita feature gate', () => {
  const layoutSource = readFileSync(
    new URL('../src/components/DashboardLayout.tsx', import.meta.url),
    'utf8',
  );
  const accessSource = readFileSync(
    new URL('../src/lib/communityAccess.ts', import.meta.url),
    'utf8',
  );

  assert.match(layoutSource, /isCommunityEnabledForAgent/);
  assert.match(
    layoutSource,
    /c\.id !== 'komunitas' \|\| communityEnabled/,
  );
  assert.match(
    layoutSource,
    /activeTab === 'komunitas' && !communityEnabled/,
  );
  assert.match(accessSource, /COMMUNITY_AGENT_SLUG = 'nikita'/);
});
