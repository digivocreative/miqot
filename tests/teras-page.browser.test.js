import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import sharp from 'sharp';
import { createServer } from 'vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const ONE_PIXEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

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
      body: parseRequestBody(request),
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

    if (record.method === 'POST' && record.pathname === '/api/community/photo') {
      await responseJson(route, { success: true, url: 'https://cdn.example.test/community/photo.jpg' });
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
} = {}) {
  const context = await browser.newContext({
    serviceWorkers: 'block',
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const session = { token: 'browser-test-token', user: agent };

  try {
    await page.addInitScript(({ storedSession }) => {
      window.localStorage.setItem('auth_session', JSON.stringify(storedSession));
      window.localStorage.setItem('darkMode', 'false');
      window.sessionStorage.setItem('agentation-session-toolbar-hidden', '1');
    }, { storedSession: session });

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
        name: 'Apa yang ingin Anda bagikan, Bu?',
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
    name: 'Apa yang ingin Anda bagikan, Bu?',
    exact: true,
  }).click();
  const dialog = page.getByRole('dialog', { name: 'Buat Kiriman' });
  await dialog.waitFor();
  await dialog.getByPlaceholder('Apa yang ingin Anda bagikan?').fill(body);
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
      await app.page.getByLabel('Memuat kiriman').waitFor();
      assert.ok(initialFeedRoute, 'initial feed request harus tertahan');

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

  test('photo trigger opens the picker, resizes to JPEG, uploads once, and creates the post with the same idempotency key', { timeout: 30_000 }, async () => {
    const api = createCommunityApi();
    const app = await openApp({ api });
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
      await app.page.getByRole('button', { name: 'Bagikan foto' }).click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles({
        name: 'teras-source.png',
        mimeType: 'image/png',
        buffer: sourcePhoto,
      });

      const dialog = app.page.getByRole('dialog', { name: 'Buat Kiriman' });
      await dialog.waitFor();
      await dialog.getByAltText('Pratinjau foto kiriman').waitFor();
      await dialog.getByPlaceholder('Apa yang ingin Anda bagikan?').fill('Kiriman dengan foto');
      const sendButton = dialog.getByRole('button', { name: 'Kirim kiriman' });
      await sendButton.waitFor({ state: 'visible' });
      await app.page.waitForFunction(button => !button.disabled, await sendButton.elementHandle());
      await sendButton.click();
      await dialog.waitFor({ state: 'detached', timeout: 10_000 });

      const photoRequests = matchingRequests(api, 'POST', '/api/community/photo');
      const postRequests = matchingRequests(api, 'POST', '/api/community/posts');
      assert.equal(photoRequests.length, 1);
      assert.equal(postRequests.length, 1);
      assert.equal(photoRequests[0].authorization, 'Bearer browser-test-token');
      assert.equal(postRequests[0].authorization, 'Bearer browser-test-token');
      assert.match(photoRequests[0].body.image_data, /^data:image\/jpeg;base64,/);
      assert.match(photoRequests[0].body.upload_id, /^[0-9a-f-]{36}$/i);
      assert.equal(postRequests[0].body.client_id, photoRequests[0].body.upload_id);
      assert.equal(postRequests[0].body.body, 'Kiriman dengan foto');
      assert.equal(postRequests[0].body.photo_url, 'https://cdn.example.test/community/photo.jpg');
      assert.ok(
        api.requests.indexOf(photoRequests[0]) < api.requests.indexOf(postRequests[0]),
        'foto harus selesai diunggah sebelum post dibuat',
      );

      const encodedJpeg = photoRequests[0].body.image_data.split(',')[1];
      const resizedMetadata = await sharp(Buffer.from(encodedJpeg, 'base64')).metadata();
      assert.equal(resizedMetadata.format, 'jpeg');
      assert.equal(resizedMetadata.width, 1600);
      assert.equal(resizedMetadata.height, 800);

      const createdArticle = app.page.locator('article').filter({ hasText: 'Kiriman dengan foto' });
      await createdArticle.waitFor();
      const renderedPhoto = createdArticle.getByRole('img', { name: 'Foto kiriman Nikita Test' });
      await renderedPhoto.waitFor();
      assert.equal(await renderedPhoto.getAttribute('src'), 'https://cdn.example.test/community/photo.jpg');
    } finally {
      await app.close();
    }
  });

  test('tap and long-press reactions send exact values and a failed optimistic change rolls back', { timeout: 30_000 }, async () => {
    let failedReactionRoute;
    const api = createCommunityApi({
      posts: [makePost({ id: 'reaction-post', body: 'Uji reaksi' })],
      onRequest: ({ record, route }) => {
        if (
          record.method === 'POST'
          && record.pathname === '/api/community/posts/reaction-post/reaction'
          && record.body?.reaction === 'aamiin'
        ) {
          failedReactionRoute = route;
          return true;
        }
        return false;
      },
    });
    const app = await openApp({ api });
    try {
      const article = app.page.locator('article').filter({ hasText: 'Uji reaksi' });
      const reactionButton = article.locator('button[aria-controls^="teras-reaction-picker-"]');
      await article.waitFor();

      await reactionButton.click();
      await app.page.waitForFunction(() => (
        document.querySelector('button[aria-controls^="teras-reaction-picker-"]')?.getAttribute('aria-pressed') === 'true'
      ));
      await article.getByText('Anda', { exact: true }).waitFor();
      await app.page.waitForFunction(() => (
        document.querySelector('button[aria-controls^="teras-reaction-picker-"]')?.getAttribute('aria-disabled') === 'false'
      ));

      await reactionButton.click();
      await app.page.waitForFunction(() => (
        document.querySelector('button[aria-controls^="teras-reaction-picker-"]')?.getAttribute('aria-pressed') === 'false'
      ));
      await app.page.waitForFunction(() => {
        const button = document.querySelector('button[aria-controls^="teras-reaction-picker-"]');
        return button instanceof HTMLButtonElement && button.getAttribute('aria-disabled') === 'false';
      });

      await reactionButton.dispatchEvent('pointerdown', {
        button: 0,
        buttons: 1,
        pointerId: 1,
        pointerType: 'touch',
        isPrimary: true,
      });
      await app.page.waitForTimeout(450);
      await reactionButton.dispatchEvent('pointerup', {
        button: 0,
        buttons: 0,
        pointerId: 1,
        pointerType: 'touch',
        isPrimary: true,
      });
      const picker = app.page.getByRole('menu', { name: 'Pilih reaksi' });
      await picker.waitFor();
      assert.equal(
        matchingRequests(api, 'POST', '/api/community/posts/reaction-post/reaction').length,
        2,
        'long-press sendiri tidak boleh mengirim reaksi',
      );

      await picker.getByRole('menuitemradio', { name: 'Pilih reaksi Selamat' }).click();
      await article.getByRole('button', { name: 'Selamat', exact: true }).waitFor();
      await app.page.waitForFunction(() => (
        document.activeElement === document.querySelector('button[aria-controls^="teras-reaction-picker-"]')
      ));
      await app.page.waitForFunction(() => {
        const button = document.querySelector('button[aria-controls^="teras-reaction-picker-"]');
        return button instanceof HTMLButtonElement && button.getAttribute('aria-disabled') === 'false';
      });

      const selectedButton = article.locator('button[aria-controls^="teras-reaction-picker-"]');
      await selectedButton.press('ArrowDown');
      const keyboardPicker = app.page.getByRole('menu', { name: 'Pilih reaksi' });
      await keyboardPicker.waitFor();
      await keyboardPicker.getByRole('menuitemradio', { name: 'Pilih reaksi Aamiin' }).click();
      await article.getByRole('button', { name: 'Aamiin', exact: true }).waitFor();
      await app.page.waitForFunction(() => (
        document.activeElement === document.querySelector('button[aria-controls^="teras-reaction-picker-"]')
      ));
      assert.ok(failedReactionRoute, 'request Aamiin harus tertahan agar optimistic state dapat diuji');

      await responseJson(failedReactionRoute, { success: false, error: 'Reaksi gagal' }, 500);
      await article.getByRole('button', { name: 'Selamat', exact: true }).waitFor();
      await app.page.getByText('Reaksi gagal', { exact: true }).waitFor();

      const reactionBodies = matchingRequests(api, 'POST', '/api/community/posts/reaction-post/reaction')
        .map(request => request.body);
      assert.deepEqual(reactionBodies, [
        { reaction: 'suka' },
        { reaction: null },
        { reaction: 'selamat' },
        { reaction: 'aamiin' },
      ]);
    } finally {
      await app.close();
    }
  });

  test('comments load once, Enter appends a server comment, and deleting it decrements the count', { timeout: 30_000 }, async () => {
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
    });
    const app = await openApp({ api });
    try {
      const article = app.page.locator('article').filter({ hasText: 'Uji komentar' });
      await article.getByRole('button', { name: 'Komentari', exact: true }).click();
      await article.getByText('Komentar dari server', { exact: true }).waitFor();
      assert.equal(matchingRequests(api, 'GET', '/api/community/posts/comments-post/comments').length, 1);

      await article.getByRole('button', { name: 'Komentari', exact: true }).click();
      await article.getByRole('button', { name: 'Komentari', exact: true }).click();
      await article.getByText('Komentar dari server', { exact: true }).waitFor();
      assert.equal(
        matchingRequests(api, 'GET', '/api/community/posts/comments-post/comments').length,
        1,
        'panel yang sudah dimuat tidak boleh fetch ulang',
      );

      const input = article.getByRole('textbox', { name: 'Tulis komentar' });
      await input.fill('Komentar baru');
      await input.press('Enter');
      await article.getByText('Komentar baru', { exact: true }).waitFor();
      await article.getByRole('button', { name: '2 komentar', exact: true }).waitFor();
      const commentRequest = matchingRequests(api, 'POST', '/api/community/posts/comments-post/comments')[0];
      assert.equal(commentRequest.body.body, 'Komentar baru');
      assert.match(commentRequest.body.client_id, /^[0-9a-f-]{36}$/i);

      app.page.once('dialog', dialog => dialog.accept());
      await article.getByRole('button', { name: 'Hapus komentar' }).click();
      await article.getByText('Komentar baru', { exact: true }).waitFor({ state: 'detached' });
      await article.getByRole('button', { name: '1 komentar', exact: true }).waitFor();
      assert.equal(matchingRequests(api, 'DELETE', '/api/community/comments/created-comment-1').length, 1);
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

  test('composer is a focus-trapped modal, confirms draft discard, and restores page focus', { timeout: 30_000 }, async () => {
    const app = await openApp({ api: createCommunityApi() });
    try {
      const trigger = app.page.getByRole('button', {
        name: 'Apa yang ingin Anda bagikan, Bu?',
        exact: true,
      });
      const triggerHandle = await trigger.elementHandle();
      assert.ok(triggerHandle, 'trigger composer harus tersedia');
      const pageRoot = trigger.locator('xpath=ancestor::section/parent::div');
      const pageRootHandle = await pageRoot.elementHandle();
      assert.ok(pageRootHandle, 'root halaman Teras harus tersedia');
      await trigger.focus();
      await trigger.click();

      let dialog = app.page.getByRole('dialog', { name: 'Buat Kiriman' });
      await dialog.waitFor();
      assert.equal(await dialog.getAttribute('aria-modal'), 'true');
      assert.equal(await pageRootHandle.evaluate(element => element.getAttribute('aria-hidden')), 'true');
      assert.equal(await app.page.evaluate(() => document.body.style.overflow), 'hidden');
      await app.page.waitForFunction(() => document.activeElement?.tagName === 'TEXTAREA');

      const attachment = dialog.getByRole('button', { name: 'Foto / Video' });
      await attachment.focus();
      await app.page.keyboard.press('Tab');
      assert.equal(
        await app.page.evaluate(() => document.activeElement?.getAttribute('aria-label')),
        'Tutup buat kiriman',
      );
      await app.page.keyboard.press('Shift+Tab');
      assert.equal(await app.page.evaluate(() => document.activeElement?.textContent?.trim()), 'Foto / Video');

      await app.page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      await app.page.waitForFunction(element => document.activeElement === element, triggerHandle);
      assert.equal(await pageRootHandle.evaluate(element => element.getAttribute('aria-hidden')), null);
      assert.equal(await app.page.evaluate(() => document.body.style.overflow), '');

      await trigger.click();
      dialog = app.page.getByRole('dialog', { name: 'Buat Kiriman' });
      await dialog.getByPlaceholder('Apa yang ingin Anda bagikan?').fill('Draft belum dikirim');

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
});
