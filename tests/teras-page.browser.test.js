import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import sharp from 'sharp';
import { createServer } from 'vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const ONE_PIXEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const LANDSCAPE_SVG = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#0f766e"/></svg>')}`;
// Accessible name of the feed "buat kiriman" trigger (the visible rotating
// TypingPrompt is aria-hidden, so the sr-only label is the stable name).
const COMPOSER_TRIGGER = 'Buat kiriman baru';
// Placeholder of the composer textarea.
const COMPOSER_PLACEHOLDER = 'Apa yang ingin dibagikan?';

let viteServer;
let browser;
let appOrigin;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeAgent(overrides = {}) {
  return {
    slug: 'nikita',
    name: 'Nikita Test',
    role: 'agent',
    photo: ONE_PIXEL_PNG,
    website: 'https://example.test',
    phone: '628123456789',
    email: 'nikita@example.test',
    ...overrides,
  };
}

function makePost(overrides = {}) {
  return {
    id: 'post-1',
    body: 'Kiriman awal Teras',
    photo_url: null,
    media: [],
    is_system: false,
    created_at: '2026-07-18T08:00:00.000Z',
    author: {
      name: 'Agent Lain',
      slug: 'agent-lain',
      photo: null,
    },
    reactions: {
      suka: 0,
      selamat: 0,
      aamiin: 0,
    },
    my_reaction: null,
    reaction_sample_name: null,
    comment_count: 0,
    is_own: false,
    ...overrides,
  };
}

function makeComment(overrides = {}) {
  return {
    id: 'comment-1',
    body: 'Komentar awal',
    created_at: '2026-07-18T08:05:00.000Z',
    author: {
      name: 'Agent Lain',
      slug: 'agent-lain',
      photo: null,
    },
    is_own: false,
    ...overrides,
  };
}

function responseJson(route, payload, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(payload),
  });
}

function parseRequestBody(request) {
  const raw = request.postData();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function createCommunityApi({
  agent = makeAgent(),
  posts = [],
  nextCursor = null,
  morePages = new Map(),
  comments = {},
  onRequest,
} = {}) {
  const api = {
    agent: clone(agent),
    posts: clone(posts),
    nextCursor,
    morePages,
    comments: new Map(Object.entries(comments).map(([postId, value]) => [postId, clone(value)])),
    requests: [],
    createSequence: 0,
    commentSequence: 0,
  };

  api.handle = async route => {
    const request = route.request();
    const url = new URL(request.url());
    const record = {
      method: request.method(),
      pathname: url.pathname,
      search: url.search,
      authorization: request.headers().authorization || '',
      contentType: request.headers()['content-type'] || '',
      uploadId: request.headers()['x-upload-id'] || '',
      body: (request.headers()['content-type'] || '').includes('application/json')
        ? parseRequestBody(request)
        : null,
      bodyBuffer: (request.headers()['content-type'] || '').includes('application/json')
        ? null
        : request.postDataBuffer(),
    };
    api.requests.push(record);

    if (onRequest) {
      const handled = await onRequest({ api, record, route });
      if (handled) return;
    }

    if (record.method === 'GET' && record.pathname === '/api/community/feed') {
      const before = url.searchParams.get('before');
      if (before) {
        const page = api.morePages.get(before) || { data: [], nextCursor: null };
        await responseJson(route, {
          success: true,
          data: clone(page.data),
          next_cursor: page.nextCursor ?? null,
        });
        return;
      }
      await responseJson(route, {
        success: true,
        data: clone(api.posts),
        next_cursor: api.nextCursor,
      });
      return;
    }

    if (record.method === 'GET' && record.pathname === '/api/community/teaser') {
      await responseJson(route, {
        success: true,
        data: {
          latest: null,
          today_count: 0,
          recent_avatars: [],
          unread_count: 0,
        },
      });
      return;
    }

    if (record.method === 'POST' && record.pathname === '/api/community/posts') {
      api.createSequence += 1;
      const created = makePost({
        id: `created-${api.createSequence}`,
        body: record.body?.body || '',
        photo_url: record.body?.photo_url || null,
        media: clone(record.body?.media || []),
        created_at: new Date(Date.parse('2026-07-18T09:00:00.000Z') + api.createSequence * 1000).toISOString(),
        author: {
          name: api.agent.name,
          slug: api.agent.slug,
          photo: api.agent.photo,
        },
        is_own: true,
      });
      api.posts = [created, ...api.posts.filter(post => post.id !== created.id)];
      await responseJson(route, { success: true, data: clone(created) });
      return;
    }

    if (record.method === 'POST' && record.pathname === '/api/community/media') {
      const extension = record.contentType.startsWith('video/') ? 'mp4' : 'jpg';
      await responseJson(route, {
        success: true,
        type: record.contentType.startsWith('video/') ? 'video' : 'image',
        url: `https://cdn.example.test/community/media-${api.requests.filter(item => item.pathname === '/api/community/media').length}.${extension}`,
      });
      return;
    }

    const reactionMatch = record.pathname.match(/^\/api\/community\/posts\/([^/]+)\/reaction$/);
    if (record.method === 'POST' && reactionMatch) {
      await responseJson(route, { success: true });
      return;
    }

    const postCommentsMatch = record.pathname.match(/^\/api\/community\/posts\/([^/]+)\/comments$/);
    if (record.method === 'GET' && postCommentsMatch) {
      const postId = decodeURIComponent(postCommentsMatch[1]);
      await responseJson(route, {
        success: true,
        data: clone(api.comments.get(postId) || []),
      });
      return;
    }

    if (record.method === 'POST' && postCommentsMatch) {
      const postId = decodeURIComponent(postCommentsMatch[1]);
      api.commentSequence += 1;
      const created = makeComment({
        id: `created-comment-${api.commentSequence}`,
        body: record.body?.body || '',
        created_at: new Date(Date.parse('2026-07-18T09:30:00.000Z') + api.commentSequence * 1000).toISOString(),
        author: {
          name: api.agent.name,
          slug: api.agent.slug,
          photo: api.agent.photo,
        },
        is_own: true,
      });
      api.comments.set(postId, [...(api.comments.get(postId) || []), created]);
      await responseJson(route, { success: true, data: clone(created) });
      return;
    }

    const deleteCommentMatch = record.pathname.match(/^\/api\/community\/comments\/([^/]+)$/);
    if (record.method === 'DELETE' && deleteCommentMatch) {
      const commentId = decodeURIComponent(deleteCommentMatch[1]);
      for (const [postId, postComments] of api.comments) {
        api.comments.set(postId, postComments.filter(comment => comment.id !== commentId));
      }
      await responseJson(route, { success: true });
      return;
    }

    const deletePostMatch = record.pathname.match(/^\/api\/community\/posts\/([^/]+)$/);
    if (record.method === 'DELETE' && deletePostMatch) {
      const postId = decodeURIComponent(deletePostMatch[1]);
      api.posts = api.posts.filter(post => post.id !== postId);
      await responseJson(route, { success: true });
      return;
    }

    const reportMatch = record.pathname.match(/^\/api\/community\/posts\/([^/]+)\/report$/);
    if (record.method === 'POST' && reportMatch) {
      await responseJson(route, { success: true });
      return;
    }

    await responseJson(route, { success: false, error: `Unhandled test route: ${record.method} ${record.pathname}` }, 500);
  };

  return api;
}

async function openApp({
  path = '/dashboard/teras',
  agent = makeAgent(),
  api = createCommunityApi({ agent }),
  waitForTeras = true,
  installClock = false,
  darkMode = false,
  viewport = { width: 360, height: 800 },
} = {}) {
  const context = await browser.newContext({
    serviceWorkers: 'block',
    viewport,
  });
  const page = await context.newPage();
  const session = { token: 'browser-test-token', user: agent };

  try {
    await page.addInitScript(({ storedSession, storedDarkMode }) => {
      window.localStorage.setItem('auth_session', JSON.stringify(storedSession));
      window.localStorage.setItem('darkMode', String(storedDarkMode));
      window.sessionStorage.setItem('agentation-session-toolbar-hidden', '1');
    }, { storedSession: session, storedDarkMode: darkMode });

    if (installClock) await page.clock.install();

    await page.route('**/api/**', async route => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.pathname === '/api/auth/me') {
        await responseJson(route, clone(agent));
        return;
      }
      if (requestUrl.pathname.startsWith('/api/community/')) {
        await api.handle(route);
        return;
      }
      if (requestUrl.pathname === '/api/jamaah/birthdays') {
        await responseJson(route, { success: true, birthdays: [] });
        return;
      }
      if (requestUrl.pathname === '/api/version') {
        await responseJson(route, {});
        return;
      }
      await responseJson(route, { success: true, data: [] });
    });

    await page.goto(`${appOrigin}${path}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    if (waitForTeras) {
      await page.getByRole('button', {
        name: COMPOSER_TRIGGER,
        exact: true,
      }).waitFor({ timeout: 30_000 });
    }
  } catch (error) {
    await context.close();
    throw error;
  }

  return {
    api,
    context,
    page,
    async close() {
      await context.close();
    },
  };
}

function matchingRequests(api, method, pathname) {
  return api.requests.filter(request => (
    request.method === method && request.pathname === pathname
  ));
}

async function submitTextPost(page, body) {
  await page.getByRole('button', {
    name: COMPOSER_TRIGGER,
    exact: true,
  }).click();
  const dialog = page.getByRole('dialog', { name: 'Buat Kiriman' });
  await dialog.waitFor();
  await dialog.getByPlaceholder(COMPOSER_PLACEHOLDER).fill(body);
  await dialog.getByRole('button', { name: 'Kirim kiriman' }).click();
  await dialog.waitFor({ state: 'detached', timeout: 10_000 });
}

describe('Teras frontend browser contracts', { concurrency: false }, () => {
  before(async () => {
    viteServer = await createServer({
      root: projectRoot,
      logLevel: 'silent',
      server: {
        host: '127.0.0.1',
        port: 0,
        strictPort: true,
      },
    });
    await viteServer.listen();
    const address = viteServer.httpServer?.address();
    assert.ok(address && typeof address === 'object', 'Vite harus membuka HTTP port');
    appOrigin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true });
  }, { timeout: 30_000 });

  after(async () => {
    await browser?.close();
    await viteServer?.close();
  });

  test('Nikita sees Teras while another agent has no card and is redirected before feed fetch', { timeout: 45_000 }, async () => {
    const opened = [];
    try {
      const nikitaApi = createCommunityApi({
        posts: [makePost({ body: 'Feed khusus Nikita' })],
      });
      const nikita = await openApp({
        path: '/dashboard',
        api: nikitaApi,
        waitForTeras: false,
      });
      opened.push(nikita);

      const terasCard = nikita.page.locator('main').getByRole('button', { name: 'Teras', exact: true });
      await terasCard.waitFor();
      assert.equal(await terasCard.count(), 1);
      assert.equal(matchingRequests(nikitaApi, 'GET', '/api/community/feed').length, 0);

      const directAllowed = await openApp({ api: nikitaApi });
      opened.push(directAllowed);
      await directAllowed.page.getByText('Feed khusus Nikita', { exact: true }).waitFor();
      assert.equal(matchingRequests(nikitaApi, 'GET', '/api/community/feed').length, 1);

      const otherAgent = makeAgent({ slug: 'agent-lain', name: 'Agent Lain' });
      const otherHomeApi = createCommunityApi({ agent: otherAgent });
      const otherHome = await openApp({
        path: '/dashboard',
        agent: otherAgent,
        api: otherHomeApi,
        waitForTeras: false,
      });
      opened.push(otherHome);
      await otherHome.page.getByText('Agent Lain', { exact: true }).waitFor();
      assert.equal(await otherHome.page.getByRole('button', { name: 'Teras', exact: true }).count(), 0);

      const directApi = createCommunityApi({ agent: otherAgent });
      const direct = await openApp({
        path: '/dashboard/teras',
        agent: otherAgent,
        api: directApi,
        waitForTeras: false,
      });
      opened.push(direct);
      await direct.page.waitForURL(`${appOrigin}/dashboard`, { timeout: 10_000 });
      assert.equal(
        directApi.requests.filter(request => request.pathname.startsWith('/api/community/')).length,
        0,
        'guard harus redirect sebelum Teras membuat request',
      );
    } finally {
      await Promise.all(opened.map(instance => instance.close()));
    }
  });

  test('two posts created before a stale initial feed remain newest-first after the feed resolves', { timeout: 30_000 }, async () => {
    let initialFeedRoute;
    const api = createCommunityApi({
      onRequest: ({ record, route }) => {
        if (record.method === 'GET' && record.pathname === '/api/community/feed' && !initialFeedRoute) {
          initialFeedRoute = route;
          return true;
        }
        return false;
      },
    });
    const app = await openApp({ api });
    try {
      const loadingFeed = app.page.getByLabel('Memuat kiriman');
      await loadingFeed.waitFor();
      assert.ok(initialFeedRoute, 'initial feed request harus tertahan');
      const mediaSkeleton = loadingFeed.locator('[data-teras-skeleton-media]');
      assert.equal(await mediaSkeleton.count(), 1, 'skeleton pertama harus mencadangkan ruang media');
      const mediaSkeletonBox = await mediaSkeleton.boundingBox();
      assert.ok(mediaSkeletonBox && mediaSkeletonBox.x >= 67 && mediaSkeletonBox.x + mediaSkeletonBox.width <= 345);

      await submitTextPost(app.page, 'Kiriman A');
      await submitTextPost(app.page, 'Kiriman B');
      const createRequests = matchingRequests(api, 'POST', '/api/community/posts');
      assert.equal(createRequests.length, 2);
      assert.deepEqual(createRequests.map(request => request.body.body), ['Kiriman A', 'Kiriman B']);
      assert.equal(createRequests[0].authorization, 'Bearer browser-test-token');
      assert.match(createRequests[0].body.client_id, /^[0-9a-f-]{36}$/i);
      assert.match(createRequests[1].body.client_id, /^[0-9a-f-]{36}$/i);
      assert.notEqual(createRequests[0].body.client_id, createRequests[1].body.client_id);

      await responseJson(initialFeedRoute, {
        success: true,
        data: [makePost({ id: 'server-old', body: 'Kiriman server lama' })],
        next_cursor: null,
      });
      await app.page.getByText('Kiriman server lama', { exact: true }).waitFor();

      const articles = app.page.locator('article');
      assert.match(await articles.nth(0).innerText(), /Kiriman B/);
      assert.match(await articles.nth(1).innerText(), /Kiriman A/);
      assert.match(await articles.nth(2).innerText(), /Kiriman server lama/);
    } finally {
      await app.close();
    }
  });

  test('closing the composer releases the page lock immediately, not only when the exit animation completes', { timeout: 30_000 }, async () => {
    const api = createCommunityApi({ posts: [makePost({ body: 'Kiriman lama' })] });
    const app = await openApp({ api });
    try {
      const appRoot = app.page.locator('#root');
      await app.page.getByText('Kiriman lama', { exact: true }).waitFor();

      await app.page.getByRole('button', { name: COMPOSER_TRIGGER, exact: true }).click();
      const dialog = app.page.getByRole('dialog', { name: 'Buat Kiriman' });
      await dialog.waitFor();
      assert.equal(await appRoot.evaluate(el => el.inert), true, 'membuka composer harus mengunci #root (inert)');

      // Close with an empty body (no discard confirm) and, from the same tick,
      // watch every frame of the exit animation. inert must already be false
      // while the composer is still mounted/animating out — the lock release must
      // not wait for AnimatePresence#onExitComplete (which can fail to fire and
      // strand #root inert → whole app unclickable but still scrollable).
      await dialog.getByRole('button', { name: 'Batal' }).click();
      const heldInertDuringExit = await app.page.evaluate(() => new Promise(resolve => {
        const root = document.getElementById('root');
        const dialogPresent = () => !!document.querySelector('[role="dialog"][aria-modal="true"]');
        let held = false;
        const tick = () => {
          const present = dialogPresent();
          if (present && root?.inert === true) held = true;
          if (!present) { resolve(held); return; }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }));
      assert.equal(heldInertDuringExit, false, 'inert harus dilepas saat composer mulai menutup, bukan menunggu animasi keluar selesai');

      await dialog.waitFor({ state: 'detached' });
      assert.equal(await appRoot.evaluate(el => el.inert), false);
      assert.equal(await app.page.evaluate(() => document.body.style.overflow), '');
      assert.equal(await app.page.locator('[data-teras-root]').getAttribute('aria-hidden'), null);

      // The feed must be interactive again: a reaction click reaches the network.
      const reactionRequest = app.page.waitForRequest(
        request => request.method() === 'POST'
          && request.url().includes('/api/community/posts/post-1/reaction'),
        { timeout: 3000 },
      );
      await app.page.locator('article').filter({ hasText: 'Kiriman lama' })
        .getByRole('button', { name: 'Suka' }).click();
      await reactionRequest;
    } finally {
      await app.close();
    }
  });

  test('media trigger opens the picker, resizes a photo to JPEG, and keeps upload and post idempotency keys separate', { timeout: 30_000 }, async () => {
    const api = createCommunityApi();
    const app = await openApp({
      api,
      viewport: { width: 400, height: 816 },
    });
    try {
      const sourcePhoto = await sharp({
        create: {
          width: 2000,
          height: 1000,
          channels: 3,
          background: { r: 19, g: 150, b: 122 },
        },
      }).png().toBuffer();
      const fileChooserPromise = app.page.waitForEvent('filechooser');
      await app.page.getByRole('button', { name: 'Tambahkan foto atau video' }).click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles({
        name: 'teras-source.png',
        mimeType: 'image/png',
        buffer: sourcePhoto,
      });

      const dialog = app.page.getByRole('dialog', { name: 'Buat Kiriman' });
      await dialog.waitFor();
      const preview = dialog.getByAltText('Pratinjau foto kiriman');
      await preview.waitFor();
      const textarea = dialog.getByLabel('Isi kiriman');
      const attachment = dialog.getByRole('button', { name: 'Tambahkan foto atau video' });
      const [textareaBox, attachmentBox, previewBox] = await Promise.all([
        textarea.boundingBox(),
        attachment.boundingBox(),
        preview.boundingBox(),
      ]);
      assert.ok(textareaBox && attachmentBox && previewBox, 'geometri composer dengan media harus dapat diukur');
      assert.ok(
        Math.abs(attachmentBox.y - (textareaBox.y + textareaBox.height)) < 40,
        'setelah media dipilih, tombol tambah media harus tetap dekat dengan area tulis',
      );
      assert.ok(
        attachmentBox.y + attachmentBox.height <= previewBox.y + 4,
        'toolbar media harus berada sebelum preview agar tidak terdorong ke bawah',
      );
      assert.equal(await dialog.getByText('1/4', { exact: true }).count(), 1);
      await dialog.getByPlaceholder(COMPOSER_PLACEHOLDER).fill('Kiriman dengan foto');
      const sendButton = dialog.getByRole('button', { name: 'Kirim kiriman' });
      await sendButton.waitFor({ state: 'visible' });
      await app.page.waitForFunction(button => !button.disabled, await sendButton.elementHandle());
      await sendButton.click();
      await dialog.waitFor({ state: 'detached', timeout: 10_000 });

      const mediaRequests = matchingRequests(api, 'POST', '/api/community/media');
      const postRequests = matchingRequests(api, 'POST', '/api/community/posts');
      assert.equal(mediaRequests.length, 1);
      assert.equal(postRequests.length, 1);
      assert.equal(mediaRequests[0].authorization, 'Bearer browser-test-token');
      assert.equal(postRequests[0].authorization, 'Bearer browser-test-token');
      assert.equal(mediaRequests[0].contentType, 'image/jpeg');
      assert.match(mediaRequests[0].uploadId, /^[0-9a-f-]{36}$/i);
      assert.notEqual(postRequests[0].body.client_id, mediaRequests[0].uploadId);
      assert.equal(postRequests[0].body.body, 'Kiriman dengan foto');
      assert.equal(postRequests[0].body.photo_url, 'https://cdn.example.test/community/media-1.jpg');
      assert.deepEqual(postRequests[0].body.media, [{
        type: 'image',
        url: 'https://cdn.example.test/community/media-1.jpg',
      }]);
      assert.ok(
        api.requests.indexOf(mediaRequests[0]) < api.requests.indexOf(postRequests[0]),
        'foto harus selesai diunggah sebelum post dibuat',
      );

      const resizedMetadata = await sharp(mediaRequests[0].bodyBuffer).metadata();
      assert.equal(resizedMetadata.format, 'jpeg');
      assert.equal(resizedMetadata.width, 1600);
      assert.equal(resizedMetadata.height, 800);

      const createdArticle = app.page.locator('article').filter({ hasText: 'Kiriman dengan foto' });
      await createdArticle.waitFor();
      const renderedPhoto = createdArticle.getByRole('img', { name: 'Foto kiriman Nikita Test' });
      await renderedPhoto.waitFor();
      assert.equal(await renderedPhoto.getAttribute('src'), 'https://cdn.example.test/community/media-1.jpg');
    } finally {
      await app.close();
    }
  });

  test('multiple uploads keep selection order when responses finish out of order and render side by side', { timeout: 30_000 }, async () => {
    const pendingMediaRoutes = {};
    const api = createCommunityApi({
      onRequest: async ({ record, route }) => {
        if (record.method !== 'POST' || record.pathname !== '/api/community/media') return false;
        const stats = await sharp(record.bodyBuffer).stats();
        const [red, green, blue] = stats.channels;
        const selection = green.mean > red.mean && green.mean > blue.mean ? 'first' : 'second';
        pendingMediaRoutes[selection] = route;
        if (!pendingMediaRoutes.first || !pendingMediaRoutes.second) return true;

        await responseJson(pendingMediaRoutes.second, {
          success: true,
          type: 'image',
          url: 'https://cdn.example.test/community/second.jpg',
        });
        await responseJson(pendingMediaRoutes.first, {
          success: true,
          type: 'image',
          url: 'https://cdn.example.test/community/first.jpg',
        });
        return true;
      },
    });
    const app = await openApp({ api });
    try {
      const [firstPhoto, secondPhoto] = await Promise.all([
        sharp({
          create: { width: 900, height: 1200, channels: 3, background: { r: 18, g: 121, b: 92 } },
        }).png().toBuffer(),
        sharp({
          create: { width: 900, height: 1200, channels: 3, background: { r: 124, g: 58, b: 237 } },
        }).png().toBuffer(),
      ]);
      const fileChooserPromise = app.page.waitForEvent('filechooser');
      await app.page.getByRole('button', { name: 'Tambahkan foto atau video' }).click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles([
        { name: 'first.png', mimeType: 'image/png', buffer: firstPhoto },
        { name: 'second.png', mimeType: 'image/png', buffer: secondPhoto },
      ]);

      const dialog = app.page.getByRole('dialog', { name: 'Buat Kiriman' });
      await dialog.getByAltText('Pratinjau foto 1').waitFor();
      await dialog.getByAltText('Pratinjau foto 2').waitFor();
      const composerMediaGroup = dialog.getByRole('group', { name: '2 media kiriman dipilih' });
      assert.equal(await composerMediaGroup.getAttribute('data-composer-media-layout'), 'pair');
      const [firstPreviewBox, secondPreviewBox] = await Promise.all([
        dialog.getByAltText('Pratinjau foto 1').boundingBox(),
        dialog.getByAltText('Pratinjau foto 2').boundingBox(),
      ]);
      assert.ok(firstPreviewBox && secondPreviewBox, 'preview composer dua media harus dapat diukur');
      assert.ok(Math.abs(firstPreviewBox.y - secondPreviewBox.y) < 1,
        'preview composer dua media harus sejajar vertikal');
      assert.ok(secondPreviewBox.x > firstPreviewBox.x + firstPreviewBox.width,
        'preview kedua harus berada di sisi kanan preview pertama');
      assert.ok(Math.abs(firstPreviewBox.width - secondPreviewBox.width) < 1,
        'preview composer dua media harus berbagi lebar secara seimbang');
      await dialog.getByPlaceholder(COMPOSER_PLACEHOLDER).fill('Dua foto berurutan');
      const sendButton = dialog.getByRole('button', { name: 'Kirim kiriman' });
      await app.page.waitForFunction(button => !button.disabled, await sendButton.elementHandle());
      await sendButton.click();
      await dialog.waitFor({ state: 'detached', timeout: 10_000 });

      const uploads = matchingRequests(api, 'POST', '/api/community/media');
      const postRequest = matchingRequests(api, 'POST', '/api/community/posts')[0];
      assert.equal(uploads.length, 2);
      assert.equal(new Set(uploads.map(upload => upload.uploadId)).size, 2);
      assert.ok(uploads.every(upload => upload.contentType === 'image/jpeg'));
      assert.ok(uploads.every(upload => upload.uploadId !== postRequest.body.client_id));
      assert.deepEqual(postRequest.body.media, [
        { type: 'image', url: 'https://cdn.example.test/community/first.jpg' },
        { type: 'image', url: 'https://cdn.example.test/community/second.jpg' },
      ]);

      const article = app.page.locator('article').filter({ hasText: 'Dua foto berurutan' });
      const firstRendered = article.getByRole('img', { name: 'Foto 1 dari 2 kiriman Nikita Test' });
      const secondRendered = article.getByRole('img', { name: 'Foto 2 dari 2 kiriman Nikita Test' });
      await firstRendered.waitFor();
      const [firstBox, secondBox] = await Promise.all([
        firstRendered.boundingBox(),
        secondRendered.boundingBox(),
      ]);
      assert.ok(firstBox && secondBox);
      assert.ok(Math.abs(firstBox.y - secondBox.y) < 1, 'dua media harus sejajar vertikal');
      assert.ok(secondBox.x > firstBox.x + firstBox.width, 'media kedua harus berada di sisi kanan');
      assert.ok(Math.abs(firstBox.width - secondBox.width) < 1, 'dua media harus berbagi lebar secara seimbang');
      assert.equal(
        await app.page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth),
        true,
        'dua media berdampingan tidak boleh membuat viewport mobile overflow',
      );
    } finally {
      await app.close();
    }
  });

  test('video selection uploads the original binary and creates a native video media post', { timeout: 30_000 }, async () => {
    const api = createCommunityApi();
    const app = await openApp({ api });
    try {
      const sourceVideo = Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x18]),
        Buffer.from('ftypisom'),
        Buffer.alloc(16),
      ]);
      const fileChooserPromise = app.page.waitForEvent('filechooser');
      await app.page.getByRole('button', { name: 'Tambahkan foto atau video' }).click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles({
        name: 'clip.mp4',
        mimeType: 'video/mp4',
        buffer: sourceVideo,
      });

      const dialog = app.page.getByRole('dialog', { name: 'Buat Kiriman' });
      await dialog.getByLabel('Pratinjau video 1').waitFor();
      await dialog.getByPlaceholder(COMPOSER_PLACEHOLDER).fill('Video singkat perjalanan');
      await dialog.getByRole('button', { name: 'Kirim kiriman' }).click();
      await dialog.waitFor({ state: 'detached', timeout: 10_000 });

      const upload = matchingRequests(api, 'POST', '/api/community/media')[0];
      const postRequest = matchingRequests(api, 'POST', '/api/community/posts')[0];
      assert.equal(upload.contentType, 'video/mp4');
      assert.deepEqual(upload.bodyBuffer, sourceVideo);
      assert.deepEqual(postRequest.body.media, [{
        type: 'video',
        url: 'https://cdn.example.test/community/media-1.mp4',
      }]);
      assert.equal(postRequest.body.photo_url, undefined);

      const createdArticle = app.page.locator('article').filter({ hasText: 'Video singkat perjalanan' });
      const renderedVideo = createdArticle.getByLabel('Video 1 dari 1 kiriman Nikita Test');
      await renderedVideo.waitFor();
      assert.equal(await renderedVideo.getAttribute('controls'), '');
      assert.equal(await renderedVideo.getAttribute('playsinline'), '');
    } finally {
      await app.close();
    }
  });

  test('Threads-style feed fills the wide column and mixed media carousel stays fluid without page overflow', { timeout: 30_000 }, async () => {
    const api = createCommunityApi({
      posts: [makePost({
        id: 'mixed-media-post',
        body: 'Dokumentasi perjalanan hari ini',
        media: [
          { type: 'image', url: ONE_PIXEL_PNG },
          { type: 'video', url: 'https://cdn.example.test/community/clip.mp4' },
          { type: 'image', url: ONE_PIXEL_PNG },
        ],
      })],
    });
    const app = await openApp({
      api,
      viewport: { width: 714, height: 875 },
    });
    try {
      const article = app.page.locator('article').filter({ hasText: 'Dokumentasi perjalanan hari ini' });
      await article.waitFor();
      const articleBox = await article.boundingBox();
      assert.ok(articleBox && articleBox.width >= 650, 'feed Teras harus memakai kolom lebar, bukan kartu 512px');

      const rail = article.getByRole('region', { name: '3 media. Geser ke samping untuk melihat semuanya.' });
      await rail.waitFor();
      assert.equal(await article.locator('[data-media-layout="carousel"]').count(), 1);
      const geometry = await rail.evaluate(element => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        scrollSnapType: getComputedStyle(element).scrollSnapType,
      }));
      assert.ok(geometry.scrollWidth > geometry.clientWidth, 'tiga media harus dapat digeser horizontal');
      assert.match(geometry.scrollSnapType, /mandatory/, 'carousel harus memakai mandatory snap');
      const [railBox, firstSlideBox, secondSlideBox] = await Promise.all([
        rail.boundingBox(),
        rail.locator('[data-media-slide]').nth(0).boundingBox(),
        rail.locator('[data-media-slide]').nth(1).boundingBox(),
      ]);
      assert.ok(railBox && firstSlideBox && secondSlideBox, 'geometri carousel harus dapat diukur');
      assert.ok(firstSlideBox.width / railBox.width >= 0.84 && firstSlideBox.width / railBox.width <= 0.88,
        'slide carousel harus memakai sekitar 86% lebar rail');
      assert.ok(firstSlideBox.width / firstSlideBox.height >= 1.3,
        'carousel multi-media harus memakai rasio ringkas mendekati 4:3');
      assert.ok(secondSlideBox.x < railBox.x + railBox.width,
        'sebagian slide berikutnya harus terlihat sebagai affordance swipe');

      const video = article.getByLabel('Video 2 dari 3 kiriman Agent Lain', { exact: true });
      assert.equal(await video.getAttribute('controls'), '');
      assert.equal(await video.getAttribute('playsinline'), '');
      assert.equal(await video.getAttribute('autoplay'), null);

      await video.focus();
      const mediaScrollBeforeVideoKey = await rail.evaluate(element => element.scrollLeft);
      await app.page.keyboard.press('ArrowRight');
      assert.equal(
        await rail.evaluate(element => element.scrollLeft),
        mediaScrollBeforeVideoKey,
        'panah pada kontrol video tidak boleh mengganti slide carousel',
      );

      await rail.evaluate(element => element.scrollTo({ left: 0, behavior: 'auto' }));
      await article.getByText('1/3', { exact: true }).waitFor();
      const pageScrollBeforeCarouselKey = await app.page.evaluate(() => window.scrollY);
      await rail.focus();
      await app.page.keyboard.press('ArrowRight');
      await article.getByText('2/3', { exact: true }).waitFor();
      assert.equal(
        await app.page.evaluate(() => window.scrollY),
        pageScrollBeforeCarouselKey,
        'navigasi carousel tidak boleh menggeser halaman secara vertikal',
      );
      assert.equal(
        await app.page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth),
        true,
        'carousel tidak boleh membuat halaman ikut overflow horizontal',
      );
    } finally {
      await app.close();
    }
  });

  test('post chrome keeps time at the right edge and shows Threads-style action counts', { timeout: 30_000 }, async () => {
    const agent = makeAgent({ name: 'Nikita Test Dengan Nama Sangat Panjang' });
    const createdAt = new Date(Date.now() - 125_000).toISOString();
    const api = createCommunityApi({
      agent,
      posts: [
        makePost({
          id: 'compact-text',
          body: 'Teks ringkas',
          created_at: createdAt,
          reactions: { suka: 2, selamat: 3, aamiin: 1 },
          comment_count: 4,
          is_own: true,
          author: {
            name: agent.name,
            slug: agent.slug,
            photo: agent.photo,
          },
        }),
        makePost({
          id: 'compact-media',
          body: 'Teks dengan media',
          created_at: createdAt,
          media: [{ type: 'image', url: LANDSCAPE_SVG }],
        }),
      ],
    });
    const app = await openApp({
      agent,
      api,
      viewport: { width: 360, height: 800 },
    });
    try {
      const textArticle = app.page.locator('article').filter({ hasText: 'Teks ringkas' });
      const mediaArticle = app.page.locator('article').filter({ hasText: 'Teks dengan media' });
      await textArticle.waitFor();
      await mediaArticle.waitFor();

      assert.doesNotMatch(await textArticle.innerText(), /\(Anda\)/);
      assert.equal(await textArticle.locator('svg.lucide-globe').count(), 0);
      assert.equal(
        await textArticle.locator('[data-thread-connector], div[aria-hidden="true"].absolute.w-px').count(),
        0,
        'post top-level tidak boleh memiliki garis thread tanpa relasi reply',
      );

      const author = textArticle.getByText(agent.name, { exact: true });
      const relativeTime = textArticle.getByText('2 menit', { exact: true });
      const textBody = textArticle.locator('[data-post-body]');
      const [authorBox, timeBox, bodyBox] = await Promise.all([
        author.boundingBox(),
        relativeTime.boundingBox(),
        textBody.boundingBox(),
      ]);
      assert.ok(authorBox && timeBox && bodyBox, 'nama, waktu, dan isi post harus dapat diukur');
      assert.ok(
        Math.abs((authorBox.y + authorBox.height / 2) - (timeBox.y + timeBox.height / 2)) <= 3,
        'waktu harus satu baris dengan nama',
      );
      assert.ok(timeBox.x >= authorBox.x + authorBox.width, 'waktu harus berada di kanan nama');
      assert.ok(timeBox.x >= 250, 'waktu harus terdorong ke ujung kanan baris nama');
      assert.ok(timeBox.x + timeBox.width <= 305, 'waktu tidak boleh bertabrakan dengan menu post');
      assert.ok(Math.abs(bodyBox.x - authorBox.x) <= 1, 'isi post harus sejajar dengan nama agent');
      assert.ok(bodyBox.y - (authorBox.y + authorBox.height) <= 10,
        'isi post harus langsung mengikuti nama tanpa ruang vertikal berlebih');
      assert.ok(bodyBox.width >= 270 && bodyBox.x + bodyBox.width <= 345,
        'isi post harus tetap memakai lebar kolom penuh pada viewport 360px');

      const articlePadding = await textArticle.evaluate(element => {
        const style = getComputedStyle(element);
        return {
          top: style.paddingTop,
          right: style.paddingRight,
          bottom: style.paddingBottom,
          left: style.paddingLeft,
        };
      });
      assert.deepEqual(articlePadding, {
        top: '14px',
        right: '16px',
        bottom: '10px',
        left: '16px',
      }, 'padding post harus mengikuti density mockup Threads');

      const [textStyle, mediaStyle] = await Promise.all([
        textArticle.getByText('Teks ringkas', { exact: true }).evaluate(element => {
          const style = getComputedStyle(element);
          return { fontSize: style.fontSize, lineHeight: style.lineHeight, fontWeight: style.fontWeight };
        }),
        mediaArticle.getByText('Teks dengan media', { exact: true }).evaluate(element => {
          const style = getComputedStyle(element);
          return { fontSize: style.fontSize, lineHeight: style.lineHeight, fontWeight: style.fontWeight };
        }),
      ]);
      assert.deepEqual(textStyle, mediaStyle, 'tipografi text-only dan post bermedia harus identik');
      assert.equal(textStyle.fontSize, '16px');
      assert.ok(parseFloat(textStyle.lineHeight) <= 24, 'line-height post harus tetap nyaman dan kompak');

      const landscapeImage = mediaArticle.getByRole('img', { name: 'Foto kiriman Agent Lain' });
      await landscapeImage.waitFor();
      await app.page.waitForFunction(image => image.complete && image.naturalWidth > 0, await landscapeImage.elementHandle());
      const landscapeBox = await landscapeImage.boundingBox();
      assert.ok(landscapeBox && landscapeBox.width / landscapeBox.height > 1.7,
        'media tunggal landscape harus mempertahankan rasio intrinsik, bukan dipotong ke 4:5');
      assert.ok(Math.abs(landscapeBox.x - bodyBox.x) <= 2,
        'media harus tetap sejajar dengan kolom isi post');

      const likeButton = textArticle.getByRole('button', { name: 'Suka', exact: true });
      const commentButton = textArticle.getByRole('button', { name: 'Komentari', exact: true });
      assert.equal((await likeButton.innerText()).trim(), '6');
      assert.equal((await commentButton.innerText()).trim(), '4');
      assert.equal(await likeButton.locator('svg.lucide-heart').count(), 1);
      assert.equal(await commentButton.locator('svg.lucide-message-circle').count(), 1);
      const replySummaryButton = textArticle.getByRole('button', { name: '4 balasan', exact: true });
      await replySummaryButton.waitFor();
      const [replySummaryRowBox, replySummaryButtonBox, likeBox, commentBox] = await Promise.all([
        textArticle.locator('[data-reply-summary-row]').boundingBox(),
        replySummaryButton.boundingBox(),
        likeButton.boundingBox(),
        commentButton.boundingBox(),
      ]);
      assert.ok(replySummaryRowBox && replySummaryRowBox.height >= 44,
        'ringkasan balasan harus menyediakan baris sentuh penuh');
      assert.ok(replySummaryButtonBox && replySummaryButtonBox.height >= 44,
        'ringkasan balasan tetap harus memiliki hit-area minimal 44px');
      assert.ok(likeBox && commentBox && replySummaryButtonBox
        && replySummaryButtonBox.y >= Math.max(
          likeBox.y + likeBox.height,
          commentBox.y + commentBox.height,
        ) - 0.5,
      'hit-area ringkasan balasan tidak boleh menimpa aksi Suka atau Komentari');
      assert.ok(likeBox && Math.abs(likeBox.x - bodyBox.x) <= 1,
        'aksi post harus tetap sejajar dengan isi post');
      for (const button of [likeButton, commentButton]) {
        const box = await button.boundingBox();
        assert.ok(box && box.width >= 44 && box.height >= 44, 'aksi ikon harus memiliki hit-area minimal 44px');
      }
    } finally {
      await app.close();
    }
  });

  test('360px dark layout contains long content, four media, menus, and all touch targets', { timeout: 30_000 }, async () => {
    const agent = makeAgent({ role: 'admin' });
    const longToken = `DETAIL_${'TANPAJEDA'.repeat(90)}`;
    const createdAt = new Date(Date.now() - 3_600_000).toISOString();
    const api = createCommunityApi({
      agent,
      posts: [
        makePost({
          id: 'four-media-layout',
          body: longToken,
          created_at: createdAt,
          author: {
            name: 'Nama Agent Sangat Panjang Untuk Menguji Header Mobile Tiga Ratus Enam Puluh',
            slug: 'agent-panjang',
            photo: null,
          },
          media: [
            { type: 'image', url: ONE_PIXEL_PNG },
            { type: 'image', url: ONE_PIXEL_PNG },
            { type: 'image', url: ONE_PIXEL_PNG },
            { type: 'video', url: 'https://cdn.example.test/community/final-clip.mp4' },
          ],
          reactions: { suka: 12345, selamat: 678, aamiin: 90 },
          reaction_sample_name: 'Nama Reaktor Yang Juga Sangat Panjang',
          comment_count: 12345,
        }),
        makePost({
          id: 'system-layout',
          body: 'Sorotan sistem tetap ringkas pada layar kecil',
          created_at: createdAt,
          is_system: true,
          author: { name: null, slug: null, photo: null },
        }),
      ],
    });
    const app = await openApp({
      agent,
      api,
      darkMode: true,
      viewport: { width: 360, height: 800 },
    });
    try {
      await app.page.waitForFunction(() => document.documentElement.classList.contains('dark'));
      const root = app.page.locator('[data-teras-root]');
      const rootBox = await root.boundingBox();
      assert.ok(rootBox && rootBox.x >= -1 && rootBox.x + rootBox.width <= 361);

      for (const button of [
        app.page.getByRole('button', { name: 'Kembali ke dashboard' }),
        app.page.getByRole('button', { name: 'Gunakan mode terang' }),
        app.page.getByRole('button', { name: COMPOSER_TRIGGER, exact: true }),
        app.page.getByRole('button', { name: 'Tambahkan foto atau video' }),
      ]) {
        const box = await button.boundingBox();
        assert.ok(box && box.width >= 44 && box.height >= 44, 'chrome Teras harus memiliki hit-area 44px');
      }

      const article = app.page.locator('[data-post-id="four-media-layout"]');
      const body = article.getByText(longToken, { exact: true });
      const bodyMetrics = await body.evaluate(element => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        right: element.getBoundingClientRect().right,
      }));
      assert.ok(bodyMetrics.scrollWidth <= bodyMetrics.clientWidth + 1, 'token panjang harus membungkus di body post');
      assert.ok(bodyMetrics.right <= 344.5);

      const rail = article.getByRole('region', { name: '4 media. Geser ke samping untuk melihat semuanya.' });
      const railBox = await rail.boundingBox();
      const railMetrics = await rail.evaluate(element => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
      assert.ok(railBox && railBox.x >= 67 && railBox.x + railBox.width <= 345);
      assert.ok(railMetrics.scrollWidth > railMetrics.clientWidth, 'empat media harus tetap berupa rail yang dapat digeser');

      await rail.focus();
      await app.page.keyboard.press('ArrowRight');
      await app.page.keyboard.press('ArrowRight');
      await app.page.keyboard.press('ArrowRight');
      const lastCounter = article.getByRole('status', { name: 'Media 4 dari 4' });
      await lastCounter.waitFor();
      await app.page.waitForFunction((element) => {
        const slides = element.querySelectorAll('[data-media-slide]');
        const lastSlide = slides.item(slides.length - 1);
        return lastSlide
          ? Math.abs(lastSlide.getBoundingClientRect().left - element.getBoundingClientRect().left) <= 2
          : false;
      }, await rail.elementHandle());
      const fullscreenButton = article.getByRole('button', { name: /Buka video 4 dari 4 .* layar penuh/ });
      const [counterBox, fullscreenBox] = await Promise.all([
        lastCounter.boundingBox(),
        fullscreenButton.boundingBox(),
      ]);
      assert.ok(counterBox && fullscreenBox && counterBox.x + counterBox.width < fullscreenBox.x,
        'counter rail tidak boleh menutupi tombol fullscreen video terakhir');

      assert.doesNotMatch(await article.innerText(), /Nama Reaktor Yang Juga Sangat Panjang|12345 komentar/,
        'ringkasan engagement tidak perlu ditampilkan di feed');

      const menuButton = article.getByRole('button', { name: 'Buka menu kiriman' });
      await menuButton.press('ArrowDown');
      const menu = article.getByRole('menu', { name: 'Menu kiriman' });
      await menu.waitFor();
      const menuBox = await menu.boundingBox();
      assert.ok(menuBox && menuBox.x >= 0 && menuBox.x + menuBox.width <= 360);
      await app.page.keyboard.press('End');
      assert.equal(
        await menu.getByRole('menuitem', { name: 'Hapus' }).evaluate(element => document.activeElement === element),
        true,
      );
      await app.page.keyboard.press('Tab');
      await menu.waitFor({ state: 'detached' });
      await app.page.waitForFunction(element => document.activeElement === element, await menuButton.elementHandle());

      await app.page.setViewportSize({ width: 360, height: 260 });
      await menuButton.evaluate(element => {
        window.scrollTo({
          top: window.scrollY + element.getBoundingClientRect().top - (window.innerHeight - 56),
          behavior: 'auto',
        });
      });
      await menuButton.click();
      const flippedMenu = article.getByRole('menu', { name: 'Menu kiriman' });
      const [shortMenuBox, shortTriggerBox] = await Promise.all([
        flippedMenu.boundingBox(),
        menuButton.boundingBox(),
      ]);
      assert.ok(shortMenuBox && shortTriggerBox);
      assert.ok(shortMenuBox.y >= 0 && shortMenuBox.y + shortMenuBox.height <= 260,
        'menu post harus tetap utuh di viewport pendek');
      assert.ok(shortMenuBox.y + shortMenuBox.height <= shortTriggerBox.y + 1,
        'menu post harus berbalik ke atas ketika ruang bawah tidak cukup');
      await app.page.keyboard.press('Escape');
      await app.page.setViewportSize({ width: 360, height: 800 });

      const likeButton = article.getByRole('button', { name: 'Suka', exact: true });
      assert.equal((await likeButton.innerText()).trim(), String(12345 + 678 + 90));
      assert.equal(await app.page.getByRole('menu', { name: 'Pilih reaksi' }).count(), 0);

      const visibleButtons = article.locator('button:visible');
      for (let index = 0; index < await visibleButtons.count(); index += 1) {
        const box = await visibleButtons.nth(index).boundingBox();
        assert.ok(box && box.width >= 44 && box.height >= 44, `target sentuh post ke-${index + 1} harus minimal 44px`);
      }

      const systemArticle = app.page.locator('[data-post-id="system-layout"]');
      const systemBadge = systemArticle.getByText('Sorotan', { exact: true });
      const systemTime = systemArticle.locator('time');
      const [badgeBox, systemTimeBox] = await Promise.all([systemBadge.boundingBox(), systemTime.boundingBox()]);
      assert.ok(badgeBox && systemTimeBox);
      assert.ok(Math.abs((badgeBox.y + badgeBox.height / 2) - (systemTimeBox.y + systemTimeBox.height / 2)) <= 3);

      assert.equal(
        await app.page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth),
        true,
      );
    } finally {
      await app.close();
    }
  });

  test('media opens an animated full-screen viewer with navigation and focus restoration', { timeout: 30_000 }, async () => {
    const api = createCommunityApi({
      posts: [makePost({
        id: 'viewer-post',
        body: 'Galeri layar penuh',
        media: [
          { type: 'image', url: ONE_PIXEL_PNG },
          { type: 'video', url: 'https://cdn.example.test/community/viewer.mp4' },
          { type: 'image', url: ONE_PIXEL_PNG },
        ],
      })],
    });
    const app = await openApp({
      api,
      viewport: { width: 360, height: 800 },
    });
    try {
      const article = app.page.locator('article').filter({ hasText: 'Galeri layar penuh' });
      const trigger = article.getByRole('button', {
        name: 'Buka foto 1 dari 3 kiriman Agent Lain layar penuh',
      });
      const triggerHandle = await trigger.elementHandle();
      assert.ok(triggerHandle, 'trigger viewer harus tersedia');
      const pageRoot = app.page.locator('[data-teras-root]');
      const appRoot = app.page.locator('#root');
      await trigger.click();

      const viewer = app.page.getByRole('dialog', { name: 'Media kiriman Agent Lain' });
      await viewer.waitFor();
      assert.equal(await viewer.getAttribute('aria-modal'), 'true');
      assert.equal(await app.page.evaluate(() => document.body.style.overflow), 'hidden');
      assert.equal(await pageRoot.getAttribute('aria-hidden'), 'true');
      assert.equal(await appRoot.getAttribute('aria-hidden'), 'true');
      assert.equal(await appRoot.evaluate(element => element.inert), true);
      await app.page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Tutup media');

      const viewerBox = await viewer.boundingBox();
      assert.ok(viewerBox, 'viewer harus dapat diukur');
      assert.ok(Math.abs(viewerBox.x) <= 1 && Math.abs(viewerBox.y) <= 1);
      assert.ok(Math.abs(viewerBox.width - 360) <= 1 && Math.abs(viewerBox.height - 800) <= 1);
      const viewportMeta = await app.page.locator('meta[name="viewport"]').getAttribute('content');
      assert.doesNotMatch(viewportMeta || '', /maximum-scale|user-scalable\s*=\s*no/i);
      const fullImage = viewer.getByRole('img', { name: 'Foto 1 layar penuh dari kiriman Agent Lain' });
      await fullImage.waitFor();
      assert.equal(await fullImage.evaluate(element => getComputedStyle(element).objectFit), 'contain');
      await viewer.getByText('1/3', { exact: true }).waitFor();

      await viewer.getByRole('button', { name: 'Media layar penuh berikutnya' }).click();
      await viewer.getByText('2/3', { exact: true }).waitFor();
      const fullVideo = viewer.getByLabel('Video 2 layar penuh dari kiriman Agent Lain');
      await fullVideo.waitFor();
      assert.equal(await fullVideo.getAttribute('controls'), '');
      assert.equal(await fullVideo.getAttribute('playsinline'), '');
      assert.equal(await fullVideo.getAttribute('autoplay'), null);
      await fullVideo.focus();
      await app.page.keyboard.press('ArrowRight');
      assert.equal(await viewer.getByText('2/3', { exact: true }).count(), 1, 'panah pada video tidak boleh mengganti media');

      await app.page.keyboard.press('Escape');
      await viewer.waitFor({ state: 'detached' });
      assert.equal(await app.page.evaluate(() => document.body.style.overflow), '');
      assert.equal(await pageRoot.getAttribute('aria-hidden'), null);
      assert.equal(await appRoot.getAttribute('aria-hidden'), null);
      assert.equal(await appRoot.evaluate(element => element.inert), false);
      await app.page.waitForFunction(element => document.activeElement === element, triggerHandle);

      await trigger.click();
      await viewer.waitFor();
      await viewer.click({ position: { x: 180, y: 120 } });
      await viewer.waitFor({ state: 'detached' });
      await app.page.waitForFunction(element => document.activeElement === element, triggerHandle);
    } finally {
      await app.close();
    }
  });

  test('Heart sends only suka/null, keeps legacy totals, ignores long-press, and rolls back failures', { timeout: 30_000 }, async () => {
    let failedReactionRoute;
    let reactionAttempt = 0;
    const api = createCommunityApi({
      posts: [makePost({
        id: 'reaction-post',
        body: 'Uji reaksi',
        reactions: { suka: 1, selamat: 2, aamiin: 3 },
      })],
      onRequest: ({ record, route }) => {
        if (
          record.method === 'POST'
          && record.pathname === '/api/community/posts/reaction-post/reaction'
        ) {
          reactionAttempt += 1;
          if (reactionAttempt === 3 && record.body?.reaction === 'suka') {
            failedReactionRoute = route;
            return true;
          }
        }
        return false;
      },
    });
    const app = await openApp({ api });
    try {
      const article = app.page.locator('article').filter({ hasText: 'Uji reaksi' });
      const reactionButton = article.getByRole('button', { name: 'Suka', exact: true });
      await article.waitFor();
      assert.equal((await reactionButton.innerText()).trim(), '6', 'reaksi lama harus dihitung dalam total Heart');
      assert.equal(await reactionButton.getAttribute('aria-pressed'), 'false');

      await reactionButton.dispatchEvent('pointerdown', {
        button: 0,
        buttons: 1,
        pointerId: 1,
        pointerType: 'touch',
        isPrimary: true,
      });
      await app.page.waitForTimeout(500);
      await reactionButton.dispatchEvent('pointerup', {
        button: 0,
        buttons: 0,
        pointerId: 1,
        pointerType: 'touch',
        isPrimary: true,
      });
      assert.equal(await app.page.getByRole('menu', { name: 'Pilih reaksi' }).count(), 0);
      assert.equal(matchingRequests(api, 'POST', '/api/community/posts/reaction-post/reaction').length, 0,
        'long-press sendiri tidak boleh membuka picker atau mengirim reaksi');

      await reactionButton.click();
      await app.page.waitForFunction(button => (
        button.getAttribute('aria-pressed') === 'true'
        && button.getAttribute('aria-disabled') === 'false'
        && button.textContent?.trim() === '7'
      ), await reactionButton.elementHandle());
      assert.equal(await reactionButton.locator('svg.lucide-heart').getAttribute('fill'), 'currentColor');

      await reactionButton.click();
      await app.page.waitForFunction(button => (
        button.getAttribute('aria-pressed') === 'false'
        && button.getAttribute('aria-disabled') === 'false'
        && button.textContent?.trim() === '6'
      ), await reactionButton.elementHandle());

      await reactionButton.click();
      await app.page.waitForFunction(button => (
        button.getAttribute('aria-pressed') === 'true' && button.textContent?.trim() === '7'
      ), await reactionButton.elementHandle());
      assert.ok(failedReactionRoute, 'request suka ketiga harus tertahan agar rollback optimistic dapat diuji');

      await responseJson(failedReactionRoute, { success: false, error: 'Reaksi gagal' }, 500);
      await app.page.waitForFunction(button => (
        button.getAttribute('aria-pressed') === 'false'
        && button.getAttribute('aria-disabled') === 'false'
        && button.textContent?.trim() === '6'
      ), await reactionButton.elementHandle());
      await app.page.getByText('Reaksi gagal', { exact: true }).waitFor();

      const reactionBodies = matchingRequests(api, 'POST', '/api/community/posts/reaction-post/reaction')
        .map(request => request.body);
      assert.deepEqual(reactionBodies, [
        { reaction: 'suka' },
        { reaction: null },
        { reaction: 'suka' },
      ]);
    } finally {
      await app.close();
    }
  });

  test('comments load once, Enter appends a server comment, and deleting removes it', { timeout: 30_000 }, async () => {
    let pendingCommentRoute;
    const post = makePost({
      id: 'comments-post',
      body: 'Uji komentar',
      comment_count: 1,
    });
    const api = createCommunityApi({
      posts: [post],
      comments: {
        'comments-post': [makeComment({ body: 'Komentar dari server' })],
      },
      onRequest: ({ record, route }) => {
        if (record.method === 'POST' && record.pathname === '/api/community/posts/comments-post/comments') {
          pendingCommentRoute = route;
          return true;
        }
        return false;
      },
    });
    const app = await openApp({ api });
    try {
      const article = app.page.locator('article').filter({ hasText: 'Uji komentar' });
      await article.getByRole('button', { name: '1 balasan', exact: true }).click();
      const serverComment = article.getByText('Komentar dari server', { exact: true });
      await serverComment.waitFor();
      const threadRails = article.locator('[data-thread-rail]');
      assert.ok(await threadRails.count() >= 3,
        'rail thread harus menyambungkan post, balasan, dan input saat panel terbuka');
      const railCenters = await Promise.all(['post', 'comment', 'input'].map(kind => (
        article.locator(`[data-thread-rail="${kind}"]`).first().evaluate(element => {
          const rect = element.getBoundingClientRect();
          return rect.left + rect.width / 2;
        })
      )));
      assert.ok(Math.max(...railCenters) - Math.min(...railCenters) <= 1,
        'semua segmen rail thread harus berada pada sumbu avatar yang sama');
      assert.equal(
        await article.locator('[data-comment-row]').first().evaluate(element => getComputedStyle(element).marginTop),
        '8px',
        'jarak antarbalasan harus kompak',
      );
      assert.equal(
        await article.locator('[data-thread-input]').evaluate(element => getComputedStyle(element).marginTop),
        '8px',
        'jarak menuju input balasan harus kompak',
      );
      assert.doesNotMatch(await serverComment.evaluate(element => element.parentElement?.className || ''), /rounded|bg-|border/,
        'isi balasan harus flat tanpa bubble');
      assert.equal(matchingRequests(api, 'GET', '/api/community/posts/comments-post/comments').length, 1);

      await article.getByRole('button', { name: 'Komentari', exact: true }).click();
      assert.equal(await article.locator('[data-thread-rail]').count(), 0);
      await article.getByRole('button', { name: '1 balasan', exact: true }).waitFor();
      await article.getByRole('button', { name: 'Komentari', exact: true }).click();
      await article.getByText('Komentar dari server', { exact: true }).waitFor();
      assert.equal(
        matchingRequests(api, 'GET', '/api/community/posts/comments-post/comments').length,
        1,
        'panel yang sudah dimuat tidak boleh fetch ulang',
      );

      const input = article.getByRole('textbox', { name: 'Tulis komentar' });
      assert.equal(await input.getAttribute('placeholder'), 'Balas ke Agent Lain…');
      assert.doesNotMatch(await input.getAttribute('class'), /rounded|border-gray|bg-white/,
        'input balasan harus transparan tanpa kapsul');
      const sendCommentButton = article.getByRole('button', { name: 'Kirim komentar' });
      assert.equal((await sendCommentButton.innerText()).trim(), 'Kirim');
      await input.fill('Komentar baru');
      await input.press('Enter');
      const commentStatus = article.getByRole('status').filter({ hasText: 'Sedang mengirim komentar.' });
      await commentStatus.waitFor();
      assert.ok(pendingCommentRoute, 'request komentar harus tertahan untuk menguji status sibuk');
      assert.equal(await input.getAttribute('readonly'), '');
      assert.equal(await input.getAttribute('aria-disabled'), 'true');
      assert.equal(await input.evaluate(element => document.activeElement === element), true,
        'fokus input komentar harus bertahan selama request');
      await responseJson(pendingCommentRoute, {
        success: true,
        data: makeComment({
          id: 'created-comment-1',
          body: 'Komentar baru',
          author: { name: api.agent.name, slug: api.agent.slug, photo: api.agent.photo },
          is_own: true,
        }),
      });
      await article.getByText('Komentar baru', { exact: true }).waitFor();
      assert.equal(await input.evaluate(element => document.activeElement === element), true,
        'fokus input komentar harus tetap siap untuk komentar berikutnya');
      const commentRequest = matchingRequests(api, 'POST', '/api/community/posts/comments-post/comments')[0];
      assert.equal(commentRequest.body.body, 'Komentar baru');
      assert.match(commentRequest.body.client_id, /^[0-9a-f-]{36}$/i);

      app.page.once('dialog', dialog => dialog.accept());
      await article.getByRole('button', { name: 'Hapus komentar' }).click();
      await article.getByText('Komentar baru', { exact: true }).waitFor({ state: 'detached' });
      assert.equal(matchingRequests(api, 'DELETE', '/api/community/comments/created-comment-1').length, 1);
      await article.getByRole('button', { name: 'Komentari', exact: true }).click();
      await article.getByRole('button', { name: '1 balasan', exact: true }).waitFor();
    } finally {
      await app.close();
    }
  });

  test('empty comments keep a one-pixel thread rail aligned with the reply input', { timeout: 30_000 }, async () => {
    const api = createCommunityApi({
      posts: [makePost({
        id: 'empty-comments-post',
        body: 'Uji komentar kosong',
        comment_count: 0,
      })],
      comments: { 'empty-comments-post': [] },
    });
    const app = await openApp({ api, viewport: { width: 360, height: 800 } });
    try {
      const article = app.page.locator('article').filter({ hasText: 'Uji komentar kosong' });
      await article.getByRole('button', { name: 'Komentari', exact: true }).click();
      await article.getByText('Belum ada komentar.', { exact: true }).waitFor();

      const [emptyRailBox, inputRailBox] = await Promise.all([
        article.locator('[data-thread-rail="empty"]').boundingBox(),
        article.locator('[data-thread-rail="input"]').boundingBox(),
      ]);
      assert.ok(emptyRailBox && emptyRailBox.width <= 1.5 && emptyRailBox.height > 0,
        'rail komentar kosong harus tetap berupa garis vertikal satu piksel');
      assert.ok(inputRailBox
        && Math.abs(
          (emptyRailBox.x + emptyRailBox.width / 2)
          - (inputRailBox.x + inputRailBox.width / 2),
        ) <= 1,
      'rail komentar kosong dan input harus berada pada sumbu avatar yang sama');
    } finally {
      await app.close();
    }
  });

  test('foreign posts can be reported, own posts can be deleted, and system posts have no menu', { timeout: 30_000 }, async () => {
    const agent = makeAgent();
    const api = createCommunityApi({
      agent,
      posts: [
        makePost({ id: 'own-post', body: 'Kiriman milik sendiri', is_own: true, author: { name: agent.name, slug: agent.slug, photo: agent.photo } }),
        makePost({ id: 'foreign-post', body: 'Kiriman agent lain' }),
        makePost({ id: 'system-post', body: 'Sorotan sistem', is_system: true, author: { name: null, slug: null, photo: null } }),
      ],
    });
    const app = await openApp({ agent, api });
    try {
      const foreignArticle = app.page.locator('article').filter({ hasText: 'Kiriman agent lain' });
      await foreignArticle.getByRole('button', { name: 'Buka menu kiriman' }).click();
      await foreignArticle.getByRole('menuitem', { name: 'Laporkan' }).click();
      await app.page.getByText('Laporan terkirim ke admin', { exact: true }).waitFor();
      assert.equal(matchingRequests(api, 'POST', '/api/community/posts/foreign-post/report').length, 1);

      const ownArticle = app.page.locator('article').filter({ hasText: 'Kiriman milik sendiri' });
      await ownArticle.getByRole('button', { name: 'Buka menu kiriman' }).click();
      await ownArticle.getByRole('menuitem', { name: 'Hapus' }).click();
      await ownArticle.getByRole('button', { name: 'Konfirmasi hapus kiriman' }).click();
      await ownArticle.waitFor({ state: 'detached' });
      assert.equal(matchingRequests(api, 'DELETE', '/api/community/posts/own-post').length, 1);

      const systemArticle = app.page.locator('article').filter({ hasText: 'Sorotan sistem' });
      assert.equal(await systemArticle.getByRole('button', { name: 'Buka menu kiriman' }).count(), 0);
    } finally {
      await app.close();
    }
  });

  test('pagination is manual, sends the cursor, deduplicates posts, and never polls the feed', { timeout: 30_000 }, async () => {
    const first = makePost({ id: 'page-1', body: 'Halaman pertama' });
    const second = makePost({ id: 'page-2', body: 'Halaman kedua' });
    const api = createCommunityApi({
      posts: [first],
      nextCursor: 'cursor-1',
      morePages: new Map([
        ['cursor-1', { data: [first, second], nextCursor: null }],
      ]),
    });
    const app = await openApp({ api, installClock: true });
    try {
      await app.page.getByText('Halaman pertama', { exact: true }).waitFor();
      assert.equal(matchingRequests(api, 'GET', '/api/community/feed').length, 1);

      await app.page.clock.fastForward(3_600_000);
      assert.equal(
        matchingRequests(api, 'GET', '/api/community/feed').length,
        1,
        'feed tidak boleh polling atau memuat halaman berikutnya otomatis',
      );

      await app.page.getByRole('button', { name: 'Muat Lebih Banyak' }).click();
      await app.page.getByText('Halaman kedua', { exact: true }).waitFor();
      assert.equal(await app.page.locator('article').count(), 2, 'duplicate dari halaman berikutnya harus dibuang');
      assert.equal(await app.page.getByRole('button', { name: 'Muat Lebih Banyak' }).count(), 0);

      const feedRequests = matchingRequests(api, 'GET', '/api/community/feed');
      assert.equal(feedRequests.length, 2);
      assert.equal(feedRequests[1].search, '?before=cursor-1');

      await app.page.clock.fastForward(3_600_000);
      assert.equal(matchingRequests(api, 'GET', '/api/community/feed').length, 2);
    } finally {
      await app.close();
    }
  });

  test('360px error and empty states wrap safely instead of hiding horizontal overflow', { timeout: 30_000 }, async () => {
    const longError = `ERROR_${'TOKENPANJANGTANPAJEDA'.repeat(60)}`;
    const opened = [];
    try {
      const feedApi = createCommunityApi({
        onRequest: async ({ record, route }) => {
          if (record.method !== 'GET' || record.pathname !== '/api/community/feed') return false;
          await responseJson(route, { success: false, error: longError }, 500);
          return true;
        },
      });
      const feedApp = await openApp({ api: feedApi, viewport: { width: 360, height: 800 } });
      opened.push(feedApp);
      const feedAlert = feedApp.page.getByRole('alert').filter({ hasText: longError });
      await feedAlert.waitFor();
      const feedMessage = feedAlert.getByText(longError, { exact: true });
      const feedMetrics = await feedMessage.evaluate(element => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        right: element.getBoundingClientRect().right,
      }));
      assert.ok(feedMetrics.scrollWidth <= feedMetrics.clientWidth + 1);
      assert.ok(feedMetrics.right <= 344.5);
      const retryBox = await feedAlert.getByRole('button', { name: 'Coba Lagi' }).boundingBox();
      assert.ok(retryBox && retryBox.height >= 44);

      const emptyApp = await openApp({
        api: createCommunityApi(),
        viewport: { width: 360, height: 800 },
      });
      opened.push(emptyApp);
      const emptyState = emptyApp.page.getByText('Belum ada kiriman di Teras.', { exact: true });
      await emptyState.waitFor();
      const emptyBox = await emptyState.boundingBox();
      assert.ok(emptyBox && emptyBox.x >= 0 && emptyBox.x + emptyBox.width <= 360);

      const composerApi = createCommunityApi({
        onRequest: async ({ record, route }) => {
          if (record.method !== 'POST' || record.pathname !== '/api/community/posts') return false;
          await responseJson(route, { success: false, error: longError }, 500);
          return true;
        },
      });
      const composerApp = await openApp({ api: composerApi, viewport: { width: 360, height: 800 } });
      opened.push(composerApp);
      await composerApp.page.getByRole('button', { name: COMPOSER_TRIGGER, exact: true }).click();
      const dialog = composerApp.page.getByRole('dialog', { name: 'Buat Kiriman' });
      await dialog.getByPlaceholder(COMPOSER_PLACEHOLDER).fill('Uji error panjang');
      await dialog.getByRole('button', { name: 'Kirim kiriman' }).click();
      const composerAlert = dialog.getByRole('alert').filter({ hasText: longError });
      await composerAlert.waitFor();
      const composerMetrics = await composerAlert.evaluate(element => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        right: element.getBoundingClientRect().right,
      }));
      assert.ok(composerMetrics.scrollWidth <= composerMetrics.clientWidth + 1);
      assert.ok(composerMetrics.right <= 344.5);
      const dialogMetrics = await dialog.evaluate(element => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      assert.ok(dialogMetrics.scrollWidth <= dialogMetrics.clientWidth + 1);

      composerApp.page.once('dialog', confirmation => confirmation.accept());
      await dialog.getByRole('button', { name: 'Batal', exact: true }).click();
      await dialog.waitFor({ state: 'detached' });
    } finally {
      await Promise.all(opened.map(instance => instance.close()));
    }
  });

  test('360px composer keeps an accessible focus target while media upload is busy', { timeout: 30_000 }, async () => {
    let heldMediaRoute;
    const api = createCommunityApi({
      onRequest: ({ record, route }) => {
        if (record.method !== 'POST' || record.pathname !== '/api/community/media') return false;
        heldMediaRoute = route;
        return true;
      },
    });
    const app = await openApp({ api, viewport: { width: 360, height: 800 } });
    try {
      const sourcePhoto = await sharp({
        create: {
          width: 320,
          height: 320,
          channels: 3,
          background: { r: 16, g: 185, b: 129 },
        },
      }).png().toBuffer();
      const chooserPromise = app.page.waitForEvent('filechooser');
      await app.page.getByRole('button', { name: 'Tambahkan foto atau video' }).click();
      const chooser = await chooserPromise;
      await chooser.setFiles({ name: 'busy.png', mimeType: 'image/png', buffer: sourcePhoto });

      const dialog = app.page.getByRole('dialog', { name: 'Buat Kiriman' });
      await dialog.getByAltText('Pratinjau foto kiriman').waitFor();
      await app.page.waitForFunction(
        element => getComputedStyle(element).transform === 'none',
        await dialog.elementHandle(),
      );
      await dialog.getByPlaceholder(COMPOSER_PLACEHOLDER).fill('Uji fokus saat upload');
      const sendButton = dialog.getByRole('button', { name: 'Kirim kiriman' });
      await app.page.waitForFunction(button => !button.disabled, await sendButton.elementHandle());

      const visibleButtons = dialog.locator('button:visible');
      for (let index = 0; index < await visibleButtons.count(); index += 1) {
        const button = visibleButtons.nth(index);
        const box = await button.boundingBox();
        const identity = await button.evaluate(element => ({
          label: element.getAttribute('aria-label'),
          text: element.textContent?.trim(),
        }));
        assert.ok(
          box && box.width >= 44 && box.height >= 44,
          `target sentuh composer harus minimal 44px: ${JSON.stringify({ identity, box })}`,
        );
      }

      await sendButton.click();
      await app.page.waitForFunction(() => Boolean(document.querySelector('[role="dialog"][aria-busy="true"]')));
      assert.ok(heldMediaRoute, 'upload media harus tertahan untuk menguji state busy');
      const busyStatus = dialog.getByRole('status');
      await busyStatus.getByText('Sedang mengirim kiriman. Mohon tunggu.', { exact: true }).waitFor();
      const statusHandle = await busyStatus.elementHandle();
      assert.ok(statusHandle);
      await app.page.waitForFunction(element => document.activeElement === element, statusHandle);
      await app.page.keyboard.press('Tab');
      assert.equal(await busyStatus.evaluate(element => document.activeElement === element), true);
      await app.page.keyboard.press('Shift+Tab');
      assert.equal(await busyStatus.evaluate(element => document.activeElement === element), true);

      await responseJson(heldMediaRoute, {
        success: true,
        type: 'image',
        url: 'https://cdn.example.test/community/busy.jpg',
      });
      await dialog.waitFor({ state: 'detached', timeout: 10_000 });
    } finally {
      await app.close();
    }
  });

  test('composer is a focus-trapped modal, confirms draft discard, and restores page focus', { timeout: 30_000 }, async () => {
    const app = await openApp({
      api: createCommunityApi(),
      viewport: { width: 400, height: 816 },
    });
    try {
      const trigger = app.page.getByRole('button', {
        name: COMPOSER_TRIGGER,
        exact: true,
      });
      const triggerHandle = await trigger.elementHandle();
      assert.ok(triggerHandle, 'trigger composer harus tersedia');
      const pageRoot = app.page.locator('[data-teras-root]');
      const appRoot = app.page.locator('#root');
      const pageRootHandle = await pageRoot.elementHandle();
      assert.ok(pageRootHandle, 'root halaman Teras harus tersedia');
      await trigger.focus();
      await trigger.click();

      let dialog = app.page.getByRole('dialog', { name: 'Buat Kiriman' });
      await dialog.waitFor();
      assert.equal(await dialog.getAttribute('aria-modal'), 'true');
      assert.equal(await pageRootHandle.evaluate(element => element.getAttribute('aria-hidden')), 'true');
      assert.equal(await appRoot.getAttribute('aria-hidden'), 'true');
      assert.equal(await appRoot.evaluate(element => element.inert), true);
      assert.equal(await app.page.evaluate(() => document.body.style.overflow), 'hidden');
      await app.page.waitForFunction(() => document.activeElement?.tagName === 'TEXTAREA');

      const textarea = dialog.getByPlaceholder(COMPOSER_PLACEHOLDER);
      const attachment = dialog.getByRole('button', { name: 'Tambahkan foto atau video' });
      const cancelButton = dialog.getByRole('button', { name: 'Batal', exact: true });
      const audienceMessage = dialog.getByText('Tampil untuk semua agent Alhijaz', { exact: true });
      const sendButton = dialog.getByRole('button', { name: 'Kirim kiriman' });
      const [dialogBox, textareaBox, attachmentBox, cancelBox, audienceBox, sendBox] = await Promise.all([
        dialog.boundingBox(),
        textarea.boundingBox(),
        attachment.boundingBox(),
        cancelButton.boundingBox(),
        audienceMessage.boundingBox(),
        sendButton.boundingBox(),
      ]);
      assert.ok(
        dialogBox && textareaBox && attachmentBox && cancelBox && audienceBox && sendBox,
        'geometri composer harus dapat diukur',
      );
      assert.ok(cancelBox.y < textareaBox.y, 'Batal harus berada di header composer');
      assert.ok(sendBox.y > attachmentBox.y + attachmentBox.height, 'tombol kirim harus berada di bar bawah');
      assert.ok(audienceBox.y >= sendBox.y, 'pesan audience harus berada bersama tombol kirim');
      assert.ok(
        attachmentBox.y > textareaBox.y + textareaBox.height / 2,
        `tombol media harus berada setelah area tulis: ${JSON.stringify({ textareaBox, attachmentBox })}`,
      );
      assert.ok(
        Math.abs(attachmentBox.y - (textareaBox.y + textareaBox.height)) < 40,
        `tombol media harus tetap dekat dengan area tulis seperti Threads: ${JSON.stringify({ textareaBox, attachmentBox })}`,
      );
      assert.ok(
        dialogBox.y + dialogBox.height - (attachmentBox.y + attachmentBox.height) > 300,
        `tombol media tidak boleh dipin ke dasar composer mobile: ${JSON.stringify({ dialogBox, attachmentBox })}`,
      );
      await attachment.focus();
      await app.page.keyboard.press('Tab');
      assert.equal(
        await app.page.evaluate(() => document.activeElement?.textContent?.trim()),
        'Batal',
      );
      await app.page.keyboard.press('Shift+Tab');
      assert.equal(
        await app.page.evaluate(() => document.activeElement?.getAttribute('aria-label')),
        'Tambahkan foto atau video',
      );

      await app.page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      await app.page.waitForFunction(element => document.activeElement === element, triggerHandle);
      assert.equal(await pageRootHandle.evaluate(element => element.getAttribute('aria-hidden')), null);
      assert.equal(await appRoot.getAttribute('aria-hidden'), null);
      assert.equal(await appRoot.evaluate(element => element.inert), false);
      assert.equal(await app.page.evaluate(() => document.body.style.overflow), '');

      await trigger.click();
      dialog = app.page.getByRole('dialog', { name: 'Buat Kiriman' });
      await dialog.getByPlaceholder(COMPOSER_PLACEHOLDER).fill('Draft belum dikirim');

      app.page.once('dialog', confirmation => confirmation.dismiss());
      await app.page.keyboard.press('Escape');
      assert.equal(await dialog.count(), 1, 'draft tetap terbuka bila konfirmasi dibatalkan');

      app.page.once('dialog', confirmation => confirmation.accept());
      await app.page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      await app.page.waitForFunction(element => document.activeElement === element, triggerHandle);
    } finally {
      await app.close();
    }
  });

  test('composer textarea grows with content and shows the counter only near the limit', { timeout: 30_000 }, async () => {
    const app = await openApp({
      api: createCommunityApi(),
      viewport: { width: 360, height: 800 },
    });
    try {
      await app.page.getByRole('button', { name: COMPOSER_TRIGGER, exact: true }).click();
      const dialog = app.page.getByRole('dialog', { name: 'Buat Kiriman' });
      await dialog.waitFor();
      const textarea = dialog.getByPlaceholder(COMPOSER_PLACEHOLDER);
      const textareaHandle = await textarea.elementHandle();
      assert.ok(textareaHandle, 'textarea composer harus tersedia');

      const initialHeight = await textarea.evaluate(element => element.clientHeight);
      assert.ok(initialHeight >= 80, 'textarea kosong harus mempertahankan tinggi minimum');
      assert.equal(await dialog.getByText('/2000').count(), 0,
        'counter karakter tidak perlu tampil saat masih jauh dari batas');

      await textarea.fill(Array.from({ length: 14 }, (_, index) => `Baris ${index + 1}`).join('\n'));
      await app.page.waitForFunction(
        element => element.clientHeight > 200,
        textareaHandle,
      );
      const grownMetrics = await textarea.evaluate(element => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      }));
      assert.ok(grownMetrics.scrollHeight <= grownMetrics.clientHeight + 1,
        'textarea harus tumbuh mengikuti isi, bukan scroll internal');

      const attachment = dialog.getByRole('button', { name: 'Tambahkan foto atau video' });
      const [textareaBox, attachmentBox] = await Promise.all([
        textarea.boundingBox(),
        attachment.boundingBox(),
      ]);
      assert.ok(textareaBox && attachmentBox, 'geometri composer yang tumbuh harus dapat diukur');
      assert.ok(Math.abs(attachmentBox.y - (textareaBox.y + textareaBox.height)) < 40,
        'toolbar media harus tetap menempel di bawah teks yang tumbuh');

      await textarea.fill('a'.repeat(1850));
      await dialog.getByText('1850/2000', { exact: true }).waitFor();
    } finally {
      await app.close();
    }
  });

  test('Bagikan shares a short /teras/<code> link via Web Share, with a copy fallback', { timeout: 30_000 }, async () => {
    const fullId = '9fc969b0-2465-4ae0-bbba-56e606a84914';
    const api = createCommunityApi({
      posts: [makePost({ id: fullId, body: 'Kiriman untuk dibagikan' })],
    });
    const app = await openApp({ api, waitForTeras: false });
    try {
      await app.page.getByText('Kiriman untuk dibagikan', { exact: true }).waitFor({ timeout: 30_000 });

      // Every card exposes a Bagikan control alongside Suka/Komentari/Quote.
      const shareButton = app.page.getByRole('button', { name: 'Bagikan' }).first();
      await shareButton.waitFor();

      // Primary path: Web Share API receives the short, dashboard-less URL.
      await app.page.evaluate(() => {
        window.__shared = [];
        navigator.share = data => {
          window.__shared.push(data);
          return Promise.resolve();
        };
      });
      await shareButton.click();
      const shared = await app.page.evaluate(() => window.__shared);
      assert.equal(shared.length, 1, 'navigator.share dipanggil sekali');
      assert.match(shared[0].url, /^https?:\/\/[^/]+\/teras\/9fc969b0$/,
        'URL share = /teras/<8 hex pertama id>, tanpa /dashboard');

      // Sharing is client-only — it must not hit any API endpoint.
      assert.equal(
        api.requests.filter(r => r.pathname.startsWith('/api/community/posts/')
          && r.method !== 'GET').length,
        0,
        'Bagikan tidak melakukan mutasi server',
      );

      // Fallback path: no Web Share → copy to clipboard + toast.
      await app.page.evaluate(() => {
        delete navigator.share;
        window.__copied = [];
        navigator.clipboard.writeText = text => {
          window.__copied.push(text);
          return Promise.resolve();
        };
      });
      await shareButton.click();
      await app.page.getByText('Link disalin', { exact: true }).waitFor();
      const copied = await app.page.evaluate(() => window.__copied);
      assert.equal(copied.length, 1);
      assert.match(copied[0], /\/teras\/9fc969b0$/);
    } finally {
      await app.close();
    }
  });
});
