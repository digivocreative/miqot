import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isCommunityEnabledForAgent,
  requireCommunityAccess,
  canModerateCommunityContent,
} from '../lib/community-access.js';

test('admin dapat menghapus konten agent lain, agent biasa hanya miliknya', () => {
  const admin = { id: 'admin-id', slug: 'bagas', role: 'admin' };
  const agent = { id: 'agent-id', slug: 'agent-lain', role: 'agent' };
  const foreignRow = { id: 'post-1', agent_id: 'orang-lain' };
  const ownRow = { id: 'post-2', agent_id: 'agent-id' };

  assert.equal(canModerateCommunityContent(admin, foreignRow), true);
  assert.equal(canModerateCommunityContent(admin, ownRow), true);
  assert.equal(canModerateCommunityContent(agent, ownRow), true);
  assert.equal(canModerateCommunityContent(agent, foreignRow), false);
  // Baris tanpa penulis (mis. post sistem) tetap hanya boleh disentuh admin.
  assert.equal(canModerateCommunityContent(agent, { id: 'post-3', agent_id: null }), false);
  assert.equal(canModerateCommunityContent(admin, { id: 'post-3', agent_id: null }), true);
  // Tanpa agent terautentikasi, tidak ada yang boleh menghapus.
  assert.equal(canModerateCommunityContent(null, ownRow), false);
  assert.equal(canModerateCommunityContent({ role: 'admin' }, foreignRow), false);
});

test('Teras is enabled for every agent with a slug', () => {
  assert.equal(isCommunityEnabledForAgent('nikita'), true);
  assert.equal(isCommunityEnabledForAgent('bagas'), true);
  assert.equal(isCommunityEnabledForAgent('agent-lain'), true);
  assert.equal(isCommunityEnabledForAgent({ slug: 'admin-lain', role: 'admin' }), true);
  assert.equal(isCommunityEnabledForAgent({ slug: 'yenita', role: 'agent' }), true);
  // Tanpa slug tetap ditolak — itu bukan agent yang bisa dirujuk di Teras.
  assert.equal(isCommunityEnabledForAgent({}), false);
  assert.equal(isCommunityEnabledForAgent('   '), false);
  assert.equal(isCommunityEnabledForAgent(undefined), false);
});

test('Teras access guard allows agents without writing a response', () => {
  let statusCalls = 0;
  const response = {
    status() {
      statusCalls += 1;
      return this;
    },
  };

  assert.equal(requireCommunityAccess({ slug: 'nikita', role: 'admin' }, response), true);
  assert.equal(requireCommunityAccess({ slug: 'agent-lain', role: 'agent' }, response), true);
  assert.equal(statusCalls, 0);
});

test('Teras access guard returns 403 when the agent has no slug', () => {
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

  assert.equal(requireCommunityAccess({ slug: '' }, response), false);
  assert.equal(responseStatus, 403);
  assert.deepEqual(responseBody, { error: 'Fitur Teras belum tersedia untuk agent ini' });
});

test('every community API route uses the Teras feature gate', () => {
  const serverSource = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

  assert.ok(
    (serverSource.match(/if \(!requireCommunityAccess\(agent, res\)\) return;/g)?.length ?? 0) >= 12,
  );

  for (const [label, declaration] of [
    ['GET /api/community/teaser', /app\.get\('\/api\/community\/teaser'/],
    ['POST /api/community/read', /app\.post\('\/api\/community\/read'/],
    ['GET /api/community/feed', /app\.get\('\/api\/community\/feed'/],
    ['POST /api/community/posts', /app\.post\('\/api\/community\/posts'/],
    ['POST /api/community/media', /app\.post\('\/api\/community\/media'/],
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

    if (label === 'POST /api/community/media') {
      assert.match(routeSource, /^, authMiddleware, prepareCommunityMediaUpload, parseCommunityMediaBody/);
      continue;
    }

    assert.match(
      routeSource,
      /const agent = await getAgentById\(req\.user\.id\);\s*if \(!agent\) return res\.status\(404\)\.json\(\{ error: 'Agent not found' \}\);\s*if \(!requireCommunityAccess\(agent, res\)\) return;/,
      `${label} harus memuat agent canonical dan menggunakan gate Teras`,
    );
  }

  assert.match(
    serverSource,
    /async function prepareCommunityMediaUpload[\s\S]*?const agent = await getAgentById\(req\.user\.id\);[\s\S]*?if \(!agent\) return res\.status\(404\)[\s\S]*?if \(!requireCommunityAccess\(agent, res\)\) return;/,
    'middleware upload media harus memuat agent canonical dan menggunakan gate Teras sebelum body diparse',
  );

  assert.match(
    serverSource,
    /app\.get\('\/api\/community\/feed', dbLoadShedGuard, authMiddleware/,
  );
  assert.match(
    serverSource,
    /app\.get\('\/api\/community\/teaser', dbLoadShedGuard, authMiddleware/,
  );
  assert.match(
    serverSource,
    /app\.post\('\/api\/community\/read', authMiddleware, express\.json\(\{ limit: '2kb' \}\)/,
  );
  const readParserIndex = serverSource.indexOf("app.use('/api/community/read', express.json({ limit: '2kb' }));");
  const globalParserIndex = serverSource.indexOf("app.use(express.json({ limit: '10mb' }));");
  assert.ok(readParserIndex >= 0 && readParserIndex < globalParserIndex);
});

test('community reads migration creates a gated per-agent read cursor table', () => {
  const migrationSource = readFileSync(
    new URL('../migrations/20260719000000_community_reads.sql', import.meta.url),
    'utf8',
  );

  assert.match(
    migrationSource,
    /CREATE TABLE IF NOT EXISTS community_reads\s*\(\s*agent_id UUID PRIMARY KEY REFERENCES agents\(id\) ON DELETE CASCADE,\s*last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now\(\)\s*\);/i,
  );
  assert.match(migrationSource, /ALTER TABLE community_reads ENABLE ROW LEVEL SECURITY;/i);
  assert.match(migrationSource, /NOTIFY pgrst, 'reload schema';/i);
});

test('community media migration is additive, bounded, and backfills legacy photos', () => {
  const migrationSource = readFileSync(
    new URL('../migrations/20260720000000_community_post_media.sql', import.meta.url),
    'utf8',
  );

  assert.match(
    migrationSource,
    /ALTER TABLE community_posts\s+ADD COLUMN IF NOT EXISTS media JSONB NOT NULL DEFAULT '\[\]'::jsonb/i,
  );
  assert.match(
    migrationSource,
    /CREATE OR REPLACE FUNCTION community_post_media_is_valid\(value JSONB\)[\s\S]*?jsonb_typeof\(value\) <> 'array'[\s\S]*?jsonb_array_length\(value\) > 4[\s\S]*?item->>'type' NOT IN \('image', 'video'\)[\s\S]*?jsonb_typeof\(item->'url'\) IS DISTINCT FROM 'string'/i,
  );
  assert.match(
    migrationSource,
    /DROP CONSTRAINT IF EXISTS community_posts_media_shape_check[\s\S]*?ADD CONSTRAINT community_posts_media_shape_check[\s\S]*?CHECK \(community_post_media_is_valid\(media\)\)/i,
  );
  assert.match(
    migrationSource,
    /jsonb_build_object\(\s*'type', 'image',\s*'url', photo_url\s*\)[\s\S]*?media = '\[\]'::jsonb/i,
  );
  assert.match(migrationSource, /NOTIFY pgrst, 'reload schema';/i);
  assert.doesNotMatch(migrationSource, /DROP COLUMN\s+photo_url/i);
});

test('dashboard Teras UI uses the same feature gate as the server', () => {
  const layoutSource = readFileSync(
    new URL('../src/components/DashboardLayout.tsx', import.meta.url),
    'utf8',
  );
  const accessSource = readFileSync(
    new URL('../src/lib/communityAccess.ts', import.meta.url),
    'utf8',
  );

  assert.match(
    layoutSource,
    /isCommunityEnabledForAgent[\s\S]*c\.id !== 'teras' \|\| terasEnabled/,
  );
  assert.match(layoutSource, /activeTab === 'teras' && !terasEnabled/);
  // Gate klien tidak boleh punya allowlist slug lagi — Teras terbuka untuk semua agent.
  assert.doesNotMatch(accessSource, /COMMUNITY_AGENT_SLUGS/);
  assert.doesNotMatch(accessSource, /'nikita'|'bagas'/);
});

test('frontend community gate executes after TypeScript transpilation', async (t) => {
  let transform;
  try {
    ({ transform } = await import('esbuild'));
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') {
      t.skip('esbuild tidak tersedia di environment test');
      return;
    }
    throw error;
  }

  const accessSource = readFileSync(
    new URL('../src/lib/communityAccess.ts', import.meta.url),
    'utf8',
  );
  const transformed = await transform(accessSource, {
    loader: 'ts',
    format: 'esm',
    target: 'node18',
  });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(transformed.code).toString('base64')}`;
  const frontendAccess = await import(moduleUrl);

  assert.equal(frontendAccess.isCommunityEnabledForAgent('nikita'), true);
  assert.equal(frontendAccess.isCommunityEnabledForAgent('agent-lain'), true);
  assert.equal(frontendAccess.isCommunityEnabledForAgent('yenita'), true);
  assert.equal(frontendAccess.isCommunityEnabledForAgent(''), false);
  assert.equal(frontendAccess.isCommunityEnabledForAgent('   '), false);
  assert.equal(frontendAccess.isCommunityEnabledForAgent(null), false);
});

test('dashboard registers Teras at all eight integration points', () => {
  const layoutSource = readFileSync(
    new URL('../src/components/DashboardLayout.tsx', import.meta.url),
    'utf8',
  );
  const registrationChecks = [
    [
      'TabId',
      /type TabId\s*=\s*[^;]*\|\s*'teras'\s*;/,
    ],
    [
      'slug maps',
      /const SLUG_TO_TAB[\s\S]*?\bteras:\s*'teras'[\s\S]*?const TAB_TO_SLUG[\s\S]*?\bteras:\s*'teras'/,
    ],
    [
      'tab title',
      /const TAB_TITLES[\s\S]*?\bteras:\s*'Teras'/,
    ],
    [
      'MessagesSquare icon import',
      /import\s*\{[\s\S]*?\bMessagesSquare\b[\s\S]*?\}\s*from 'lucide-react'/,
    ],
    [
      'community gate import',
      /import \{ isCommunityEnabledForAgent \} from '\.\.\/lib\/communityAccess';/,
    ],
    [
      'lazy Teras page',
      /const TerasPage = lazy\(\(\) => import\('\.\/TerasPage'\)\);/,
    ],
    [
      'teal menu card between Brosur and Tools',
      /id:\s*'brosur'[\s\S]*?id:\s*'teras',\s*label:\s*'Teras',\s*desc:\s*'Ruang berbagi agent'[\s\S]*?icon:\s*MessagesSquare[\s\S]*?text-teal-600[\s\S]*?id:\s*'ai-tools'/,
    ],
    [
      'menu filter, direct-route guard, loader, and guarded render',
      /const terasEnabled = isCommunityEnabledForAgent\(agentData\.slug\);[\s\S]*?c\.id !== 'teras' \|\| terasEnabled[\s\S]*?if \(activeTab === 'teras' && !terasEnabled\)[\s\S]*?navigatePath\('\/dashboard', \{ replace: true \}\)[\s\S]*?if \(activeTab === 'teras' && !terasEnabled\)[\s\S]*?<Loader2[\s\S]*?activeTab === 'teras' && terasEnabled[\s\S]*?<TerasPage agent=\{\{[\s\S]*?slug: agentData\.slug[\s\S]*?name: agentData\.name[\s\S]*?photo: agentData\.photo[\s\S]*?role: agentData\.role/,
    ],
  ];

  assert.equal(registrationChecks.length, 8);
  for (const [label, pattern] of registrationChecks) {
    assert.match(layoutSource, pattern, `registrasi Dashboard belum lengkap: ${label}`);
  }
});

test('dashboard registers the gated Jendela Teras card and read tracking', () => {
  const layoutSource = readFileSync(
    new URL('../src/components/DashboardLayout.tsx', import.meta.url),
    'utf8',
  );
  const pageSource = readFileSync(
    new URL('../src/components/TerasPage.tsx', import.meta.url),
    'utf8',
  );
  const cardSource = readFileSync(
    new URL('../src/components/TerasCard.tsx', import.meta.url),
    'utf8',
  );
  const terasEntryStart = layoutSource.indexOf("id: 'teras'");
  const terasEntryEnd = layoutSource.indexOf('\n  },', terasEntryStart);

  assert.ok(terasEntryStart >= 0 && terasEntryEnd > terasEntryStart);
  assert.match(layoutSource.slice(terasEntryStart, terasEntryEnd), /hidden:\s*true/);
  assert.match(
    layoutSource,
    /\{terasEnabled && \(\s*<div className="col-span-3">[\s\S]*?<TerasCard onOpen=\{\(\) => navigateTab\('teras'\)\} \/>/,
  );
  assert.match(
    layoutSource,
    /function TerasPageSkeleton\(\)[\s\S]*?aria-label="Memuat halaman Teras"/,
  );
  assert.match(
    layoutSource,
    /activeTab === 'teras'\s*\? <TerasPageSkeleton \/>/,
  );
  assert.match(pageSource, /\/api\/community\/read/);
  assert.match(cardSource, /\/api\/community\/teaser/);
  assert.doesNotMatch(cardSource, /setInterval\s*\(/);
});

test('Teras Threads presentation uses a single Heart reaction and the new composer prompt', () => {
  const pageSource = readFileSync(
    new URL('../src/components/TerasPage.tsx', import.meta.url),
    'utf8',
  );

  assert.match(pageSource, /'Apa yang baru, Bu\?'/);
  assert.match(
    pageSource,
    /import\s*\{[\s\S]*?\bHeart\b[\s\S]*?\}\s*from 'lucide-react'/,
  );
  assert.doesNotMatch(pageSource, /PartyPopper|HandHeart|startLongPress|menuitemradio/);
  assert.match(
    pageSource,
    /const nextReaction: 'suka' \| null = post\.my_reaction \? null : 'suka'/,
  );
});

test('Teras thread rail uses a continuous grid instead of an absolute connector', () => {
  const layoutSource = readFileSync(
    new URL('../src/components/DashboardLayout.tsx', import.meta.url),
    'utf8',
  );
  const pageSource = readFileSync(
    new URL('../src/components/TerasPage.tsx', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(pageSource, /ml-\[68px\]/);
  assert.doesNotMatch(pageSource, /left-\[35px\]/);
  assert.match(pageSource, /grid-cols-\[40px_minmax\(0,1fr\)\]/);
  assert.match(pageSource, /data-thread-rail="post"/);
  assert.match(pageSource, /data-thread-rail="comment"/);
  assert.match(pageSource, /data-thread-rail="input"/);
  assert.match(pageSource, /data-comment-row/);
  assert.match(pageSource, /data-reply-summary-row/);
  assert.match(pageSource, /data-media-layout="pair"/);
  assert.match(pageSource, /data-media-layout="carousel"/);
  assert.match(pageSource, /data-composer-media-layout/);
  assert.match(layoutSource, /data-teras-skeleton-post/);
  assert.doesNotMatch(layoutSource, /ml-\[68px\]/);
});

test('Vite proxies community API to local Express before the generic API fallback', () => {
  const viteSource = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
  const communityProxyIndex = viteSource.indexOf("'/api/community':");
  const genericProxyIndex = viteSource.indexOf("'/api':");

  assert.notEqual(communityProxyIndex, -1, 'proxy /api/community harus dideklarasikan');
  assert.notEqual(genericProxyIndex, -1, 'fallback /api harus tetap dideklarasikan');
  assert.ok(
    communityProxyIndex < genericProxyIndex,
    'proxy /api/community harus berada sebelum fallback /api',
  );
  assert.match(
    viteSource.slice(communityProxyIndex, genericProxyIndex),
    /target:\s*'http:\/\/localhost:3000'/,
  );
});

test('community mutations preserve idempotency keys and handle retry conflicts', () => {
  const pageSource = readFileSync(
    new URL('../src/components/TerasPage.tsx', import.meta.url),
    'utf8',
  );
  const serverSource = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const postRouteStart = serverSource.indexOf("app.post('/api/community/posts',");
  const mediaRouteStart = serverSource.indexOf("app.post('/api/community/media',");
  const reactionRouteStart = serverSource.indexOf("app.post('/api/community/posts/:id/reaction',");
  const commentRouteStart = serverSource.indexOf("app.post('/api/community/posts/:id/comments',");
  const deletePostRouteStart = serverSource.indexOf("app.delete('/api/community/posts/:id',");

  assert.ok(postRouteStart >= 0 && mediaRouteStart > postRouteStart);
  assert.ok(mediaRouteStart >= 0 && reactionRouteStart > mediaRouteStart);
  assert.ok(reactionRouteStart >= 0 && commentRouteStart > reactionRouteStart);
  assert.ok(commentRouteStart >= 0 && deletePostRouteStart > commentRouteStart);

  const postRouteSource = serverSource.slice(postRouteStart, mediaRouteStart);
  const mediaRouteSource = serverSource.slice(mediaRouteStart, reactionRouteStart);
  const reactionRouteSource = serverSource.slice(reactionRouteStart, commentRouteStart);
  const commentRouteSource = serverSource.slice(commentRouteStart, deletePostRouteStart);

  assert.match(
    pageSource,
    /composerRequestIdRef\.current \|\| window\.crypto\.randomUUID\(\)[\s\S]*?composerRequestIdRef\.current = requestId/,
  );
  assert.match(
    pageSource,
    /mapWithConcurrency\(mediaSnapshot, 2,[\s\S]*?'\/api\/community\/media'[\s\S]*?'X-Upload-ID': item\.uploadId[\s\S]*?body: item\.uploadBlob/,
  );
  assert.match(
    pageSource,
    /body,\s*client_id: requestId,\s*\.\.\.\(uploadedMedia\.length > 0 \? \{ media: uploadedMedia \} : \{\}\)[\s\S]*?photo_url: legacyPhotoUrl/,
  );
  assert.match(
    pageSource,
    /commentRequestIdsRef\.current\.get\(postId\) \|\| window\.crypto\.randomUUID\(\)[\s\S]*?commentRequestIdsRef\.current\.set\(postId, requestId\)[\s\S]*?JSON\.stringify\(\{ body, client_id: requestId \}\)/,
  );

  assert.match(
    postRouteSource,
    /const clientId = req\.body\?\.client_id;[\s\S]*?isCommunityUuid\(clientId\)[\s\S]*?normalizeCommunityMediaInput[\s\S]*?const photoUrl = media\.find[\s\S]*?\.insert\(postPayload\)[\s\S]*?Migrasi media Teras belum diterapkan[\s\S]*?insertError\?\.code === '23505' && clientId[\s\S]*?communityMediaEquals\(existingMedia, media\)[\s\S]*?status\(409\)\.json\(\{ error: 'ID kiriman sudah digunakan' \}\)/,
  );
  assert.match(
    mediaRouteSource,
    /req\.communityAgent[\s\S]*?hasExpectedCommunityMediaSignature\(buffer, mime\)[\s\S]*?createHash\('sha256'\)[\s\S]*?`community\/\$\{agent\.slug\}-\$\{uploadId\}-\$\{contentHash\}\.\$\{mediaConfig\.ext\}`[\s\S]*?upsert:\s*false[\s\S]*?isCommunityStorageConflict\(uploadError\)[\s\S]*?success: true, url: urlData\.publicUrl, type: mediaConfig\.type/,
  );
  assert.match(
    serverSource,
    /async function prepareCommunityMediaUpload[\s\S]*?req\.get\('X-Upload-ID'\)[\s\S]*?COMMUNITY_MEDIA_MIME_TYPES\[mime\][\s\S]*?COMMUNITY_MEDIA_RATE_MAX_UPLOADS[\s\S]*?COMMUNITY_MEDIA_RATE_MAX_BYTES/,
  );
  assert.match(serverSource, /const expectedAgentPath = `\$\{expectedPrefix\.pathname\}\$\{agentSlug\}-`/);
  assert.match(serverSource, /if \(!\['42703', 'PGRST204'\]\.includes\(code\)\) return false/);
  assert.match(serverSource, /COMMUNITY_MAX_MEDIA_ITEMS = 4/);
  assert.match(serverSource, /COMMUNITY_IMAGE_MAX_BYTES = 6 \* 1024 \* 1024/);
  assert.match(serverSource, /COMMUNITY_VIDEO_MAX_BYTES = 24 \* 1024 \* 1024/);
  assert.match(
    serverSource,
    /'image\/jpeg'[\s\S]*?'image\/png'[\s\S]*?'image\/webp'[\s\S]*?'video\/mp4'[\s\S]*?'video\/quicktime'[\s\S]*?'video\/webm'/,
  );
  assert.match(
    serverSource,
    /buildPostsQuery = \(includeMedia\)[\s\S]*?isCommunityMediaSchemaMissing\(postsError\)[\s\S]*?buildPostsQuery\(false\)[\s\S]*?normalizeStoredCommunityMedia\(post\.media, post\.photo_url\)/,
  );
  assert.match(
    commentRouteSource,
    /const clientId = req\.body\?\.client_id;[\s\S]*?ID komentar tidak valid[\s\S]*?error\?\.code === '23505' && clientId[\s\S]*?existingComment\.body === body[\s\S]*?status\(409\)\.json\(\{ error: 'ID komentar sudah digunakan' \}\)/,
  );
  assert.match(
    reactionRouteSource,
    /error\?\.code === '42P10'[\s\S]*?community_post_reactions[\s\S]*?\.delete\(\)[\s\S]*?community_post_reactions[\s\S]*?\.insert\(/,
  );
});

test('community migration reconciles the pre-final type column and reaction primary key', () => {
  const migrationSource = readFileSync(
    new URL('../migrations/20260718010000_community_feed_reconcile.sql', import.meta.url),
    'utf8',
  );

  assert.match(
    migrationSource,
    /ALTER TABLE community_posts\s+ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ/i,
  );
  assert.match(
    migrationSource,
    /ALTER TABLE community_posts\s+DROP COLUMN IF EXISTS type/i,
  );
  assert.match(
    migrationSource,
    /ALTER TABLE community_post_reactions\s+DROP CONSTRAINT IF EXISTS community_post_reactions_pkey/i,
  );
  assert.match(
    migrationSource,
    /ALTER TABLE community_post_reactions\s+ADD CONSTRAINT community_post_reactions_pkey\s+PRIMARY KEY \(post_id, agent_id\)/i,
  );
});
