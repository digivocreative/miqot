import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import sharp from 'sharp';
import { createServer } from 'vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const ONE_PIXEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const LANDSCAPE_SVG = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#0f766e"/></svg>')}`;
// WebM VP8 64×48 sungguhan (6 frame, 1 dtk) yang TERDECODE oleh Chromium —
// dipakai test yang butuh captureVideoPoster benar-benar menghasilkan
// poster + dimensi (byte ftyp sintetis menjaga jalur mundur capture-gagal).
const TINY_WEBM_BASE64 = 'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAKBEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggEnTbuMU6uEHFO7a1OsggJr7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjEuMS4xMDBXQYxMYXZmNjEuMS4xMDBEiYhAj0AAAAAAABZUrmvMrgEAAAAAAABD14EBc8WI6wwTTHieDMacgQAitZyDdW5kiIEAhoVWX1ZQOIOBASPjg4QJ7yGq4JSwgUC6gTCagQJVsIhVt4ECVbiBAhJUw2f6c3OfY8CAZ8iZRaOHRU5DT0RFUkSHjExhdmY2MS4xLjEwMHNz1WPAi2PFiOsME0x4ngzGZ8igRaOHRU5DT0RFUkSHk0xhdmM2MS4zLjEwMCBsaWJ2cHhnyKFFo4hEVVJBVElPTkSHkzAwOjAwOjAxLjAwMDAwMDAwMAAfQ7Z1QL/ngQCjwoEAAIBQAwCdASpAADAAAEcIhYWIhYSIAgICdaoD+AIHCNVnmY830gD++7Ar/2M36M36M39gD/+H/fw/7+H/f/DpAKOWgQCnANEBAAEQEAAYABhYL/QACIwAAKOWgQFNANEBAAEQEAAYABhYL/QACIwAAKOWgQH0ANEBAAEQEAAYABhYL/QACIwAAKOWgQKbANEBAAEQEAAYABhYL/QACIwAAKOWgQNBANEBAAEQEAAYABhYL/QACIwAABxTu2uRu4+zgQC3iveBAfGCAabwgQM=';

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
  pollVoters = {},
  // postId -> { title, body, char_count } untuk GET .../snippet.
  snippetBodies = {},
  members = [],
  broadcastQuota = {
    unlimited: false,
    used_today: 0,
    remaining: 1,
    resets_at: '2026-07-21T17:00:00.000Z',
  },
  onRequest,
} = {}) {
  const api = {
    agent: clone(agent),
    posts: clone(posts),
    nextCursor,
    morePages,
    members: clone(members),
    broadcastQuota: clone(broadcastQuota),
    comments: new Map(Object.entries(comments).map(([postId, value]) => [postId, clone(value)])),
    pollVoters: new Map(Object.entries(pollVoters).map(([postId, value]) => [postId, clone(value)])),
    snippetBodies: new Map(Object.entries(snippetBodies).map(([postId, value]) => [postId, clone(value)])),
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

    if (record.method === 'GET' && record.pathname === '/api/community/members') {
      await responseJson(route, { success: true, data: clone(api.members) });
      return;
    }

    if (record.method === 'GET' && record.pathname === '/api/community/broadcast-quota') {
      await responseJson(route, { success: true, data: clone(api.broadcastQuota) });
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
      // Komposer selalu mengirim `segments[]` (satu elemen untuk kiriman
      // biasa) dan server membalas SEGMEN PERTAMA rantai. Bentuk lama
      // (`body`/`media` di akar) tetap didukung supaya stub ini bisa dipakai
      // untuk memalsukan respons gaya lama.
      const segments = Array.isArray(record.body?.segments) ? record.body.segments : null;
      const firstSegment = segments?.[0] || record.body || {};
      const created = makePost({
        id: `created-${api.createSequence}`,
        body: firstSegment.body || '',
        photo_url: firstSegment.photo_url || null,
        media: clone(firstSegment.media || []),
        thread_count: segments ? segments.length : 1,
        created_at: new Date(Date.parse('2026-07-18T09:00:00.000Z') + api.createSequence * 1000).toISOString(),
        author: {
          name: api.agent.name,
          slug: api.agent.slug,
          photo: api.agent.photo,
        },
        is_own: true,
      });
      if (record.body?.poll) {
        const pollDurations = { '1d': 1, '3d': 3, '7d': 7 };
        const durationDays = pollDurations[record.body.poll.duration] || 1;
        created.poll = {
          options: (record.body.poll.options || []).map(text => ({ text, votes: 0 })),
          total_votes: 0,
          my_vote: null,
          // Relatif ke jam NYATA (bukan created_at beku 2026-07-18) — klien
          // menilai closed dari ends_at vs Date.now, jadi ends_at basi membuat
          // poll baru langsung tampak berakhir.
          ends_at: new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString(),
          closed: false,
        };
      }
      api.posts = [created, ...api.posts.filter(post => post.id !== created.id)];
      await responseJson(route, { success: true, data: clone(created) });
      return;
    }

    // Body lampiran hidup di endpoint terpisah — feed hanya membawa cuplikan,
    // jadi stub ini harus memisahkannya persis seperti server.
    const snippetMatch = record.pathname.match(/^\/api\/community\/posts\/([^/]+)\/snippet$/);
    if (record.method === 'GET' && snippetMatch) {
      const postId = decodeURIComponent(snippetMatch[1]);
      const stored = api.snippetBodies.get(postId);
      if (!stored) {
        await responseJson(route, { success: false, error: 'Lampiran teks tidak ditemukan' }, 404);
        return;
      }
      await responseJson(route, { success: true, data: clone(stored) });
      return;
    }

    const pollVotersMatch = record.pathname.match(/^\/api\/community\/posts\/([^/]+)\/poll-voters$/);
    if (record.method === 'GET' && pollVotersMatch) {
      const postId = decodeURIComponent(pollVotersMatch[1]);
      await responseJson(route, { success: true, data: clone(api.pollVoters.get(postId) || []) });
      return;
    }

    const pollVoteMatch = record.pathname.match(/^\/api\/community\/posts\/([^/]+)\/poll-vote$/);
    if (record.method === 'POST' && pollVoteMatch) {
      const postId = decodeURIComponent(pollVoteMatch[1]);
      const poll = api.posts.find(post => post.id === postId)?.poll;
      if (!poll) {
        await responseJson(route, { success: false, error: 'Polling tidak ditemukan' }, 404);
        return;
      }
      const option = record.body?.option;
      if (Number.isInteger(poll.my_vote)) {
        poll.options[poll.my_vote].votes -= 1;
      } else {
        poll.total_votes += 1;
      }
      poll.options[option].votes += 1;
      poll.my_vote = option;
      await responseJson(route, { success: true, data: clone(poll) });
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
  initScript = null,
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

    // Extra page setup that must land before app scripts (e.g. faking browser
    // capabilities the UI probes on mount).
    if (initScript) await page.addInitScript(initScript);

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

  test('Teras terbuka untuk semua agent dan kartu dashboard tidak memicu fetch feed', { timeout: 45_000 }, async () => {
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

      // Kartu Teras tampil di dashboard, tapi feed BARU di-fetch saat Teras
      // benar-benar dibuka — bukan saat dashboard dirender.
      const terasCard = nikita.page.locator('main').getByRole('button', { name: 'Teras', exact: true });
      await terasCard.waitFor();
      assert.equal(await terasCard.count(), 1);
      assert.equal(matchingRequests(nikitaApi, 'GET', '/api/community/feed').length, 0);

      const directAllowed = await openApp({ api: nikitaApi });
      opened.push(directAllowed);
      await directAllowed.page.getByText('Feed khusus Nikita', { exact: true }).waitFor();
      assert.equal(matchingRequests(nikitaApi, 'GET', '/api/community/feed').length, 1);

      // Sejak 19 Jul 2026 Teras terbuka untuk SEMUA agent ber-slug
      // (lib/community-access.js) — agent non-pilot juga langsung bisa masuk,
      // tidak ada lagi redirect ke /dashboard.
      const otherAgent = makeAgent({ slug: 'agent-lain', name: 'Agent Lain' });
      const otherApi = createCommunityApi({
        agent: otherAgent,
        posts: [makePost({ body: 'Feed untuk agent lain' })],
      });
      const other = await openApp({
        path: '/dashboard/teras',
        agent: otherAgent,
        api: otherApi,
      });
      opened.push(other);
      await other.page.getByText('Feed untuk agent lain', { exact: true }).waitFor();
      assert.equal(matchingRequests(otherApi, 'GET', '/api/community/feed').length, 1);
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
      // Scope ke root TerasPage: DashboardLayout punya skeleton kembar sebagai
      // fallback lazy-load yang bisa masih terpasang sesaat — tanpa scope,
      // pengukuran bisa jatuh ke skeleton fallback itu (flaky).
      const loadingFeed = app.page.locator('[data-teras-root]').getByLabel('Memuat kiriman');
      await loadingFeed.waitFor();
      assert.ok(initialFeedRoute, 'initial feed request harus tertahan');
      const mediaSkeleton = loadingFeed.locator('[data-teras-skeleton-media]');
      assert.equal(await mediaSkeleton.count(), 1, 'skeleton pertama harus mencadangkan ruang media');
      // Layar feed masuk dengan animasi slide (x: -16 -> 0). Tunggu seluruh
      // rantai transform settle dulu — mengukur mid-animasi menggeser x
      // beberapa piksel ke kiri dan membuat asersi geometri flaky.
      await app.page.waitForFunction(element => {
        for (let node = element; node; node = node.parentElement) {
          if (getComputedStyle(node).transform !== 'none') return false;
        }
        return true;
      }, await mediaSkeleton.elementHandle());
      const mediaSkeletonBox = await mediaSkeleton.boundingBox();
      assert.ok(mediaSkeletonBox && mediaSkeletonBox.x >= 67 && mediaSkeletonBox.x + mediaSkeletonBox.width <= 345);

      await submitTextPost(app.page, 'Kiriman A');
      await submitTextPost(app.page, 'Kiriman B');
      const createRequests = matchingRequests(api, 'POST', '/api/community/posts');
      assert.equal(createRequests.length, 2);
      assert.deepEqual(createRequests.map(request => request.body.segments[0].body), ['Kiriman A', 'Kiriman B']);
      assert.equal(createRequests[0].authorization, 'Bearer browser-test-token');
      assert.match(createRequests[0].body.segments[0].client_id, /^[0-9a-f-]{36}$/i);
      assert.match(createRequests[1].body.segments[0].client_id, /^[0-9a-f-]{36}$/i);
      assert.notEqual(createRequests[0].body.segments[0].client_id, createRequests[1].body.segments[0].client_id);

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
      // Toolbar media di dalam composer kini berlabel "Foto/Video".
      const attachment = dialog.getByRole('button', { name: 'Foto/Video' });
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
      // Kuota media kini 10 per kiriman (MAX_COMMUNITY_MEDIA).
      assert.equal(await dialog.getByText('1/10', { exact: true }).count(), 1);
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
      assert.notEqual(postRequests[0].body.segments[0].client_id, mediaRequests[0].uploadId);
      assert.equal(postRequests[0].body.segments[0].body, 'Kiriman dengan foto');
      assert.equal(postRequests[0].body.segments[0].photo_url, 'https://cdn.example.test/community/media-1.jpg');
      assert.deepEqual(postRequests[0].body.segments[0].media, [{
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
      // Multi-media di composer kini strip horizontal (tinggi seragam), bukan
      // grid pair — feed yang tetap memakai layout pair untuk 2 media.
      const composerMediaGroup = dialog.getByRole('group', { name: '2 media kiriman dipilih' });
      assert.equal(await composerMediaGroup.getAttribute('data-composer-media-layout'), 'strip');
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
      assert.ok(uploads.every(upload => upload.uploadId !== postRequest.body.segments[0].client_id));
      assert.deepEqual(postRequest.body.segments[0].media, [
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
      assert.deepEqual(postRequest.body.segments[0].media, [{
        type: 'video',
        url: 'https://cdn.example.test/community/media-1.mp4',
      }]);
      assert.equal(postRequest.body.segments[0].photo_url, undefined);

      const createdArticle = app.page.locator('article').filter({ hasText: 'Video singkat perjalanan' });
      const renderedVideo = createdArticle.getByLabel('Video 1 dari 1 kiriman Nikita Test');
      await renderedVideo.waitFor();
      // Kontrol native diambil alih Plyr (atribut `controls` dicopot saat player
      // terpasang) — kontraknya kini: player kustom hadir + tetap playsInline.
      assert.equal(await createdArticle.locator('[data-media-content="video"] .plyr').count(), 1,
        'video feed harus dibungkus player Plyr');
      assert.equal(await renderedVideo.getAttribute('playsinline'), '');
    } finally {
      await app.close();
    }
  });

  test('video terdecode ikut mengunggah poster frame-grab + dimensi di payload', { timeout: 30_000 }, async () => {
    const api = createCommunityApi();
    const app = await openApp({ api });
    try {
      const sourceVideo = Buffer.from(TINY_WEBM_BASE64, 'base64');
      // Layani file poster dari mock supaya skeleton settle lewat jalur
      // onload sungguhan (bukan onerror karena host mock tak melayani file).
      const posterJpeg = await sharp({
        create: { width: 8, height: 8, channels: 3, background: { r: 16, g: 92, b: 66 } },
      }).jpeg().toBuffer();
      await app.page.route('https://cdn.example.test/community/*.jpg', route => route.fulfill({
        contentType: 'image/jpeg',
        body: posterJpeg,
      }));

      const fileChooserPromise = app.page.waitForEvent('filechooser');
      await app.page.getByRole('button', { name: 'Tambahkan foto atau video' }).click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles({
        name: 'clip.webm',
        mimeType: 'video/webm',
        buffer: sourceVideo,
      });

      const dialog = app.page.getByRole('dialog', { name: 'Buat Kiriman' });
      await dialog.getByLabel('Pratinjau video 1').waitFor();
      await dialog.getByPlaceholder(COMPOSER_PLACEHOLDER).fill('Video dengan poster');
      await dialog.getByRole('button', { name: 'Kirim kiriman' }).click();
      await dialog.waitFor({ state: 'detached', timeout: 10_000 });

      const uploads = matchingRequests(api, 'POST', '/api/community/media');
      assert.equal(uploads.length, 2, 'video + poster JPEG harus terunggah');
      assert.equal(uploads[0].contentType, 'video/webm');
      assert.deepEqual(uploads[0].bodyBuffer, sourceVideo);
      assert.equal(uploads[1].contentType, 'image/jpeg');
      assert.deepEqual([...uploads[1].bodyBuffer.subarray(0, 3)], [0xff, 0xd8, 0xff],
        'poster harus JPEG asli (magic bytes)');

      const postRequest = matchingRequests(api, 'POST', '/api/community/posts')[0];
      assert.deepEqual(postRequest.body.segments[0].media, [{
        type: 'video',
        url: 'https://cdn.example.test/community/media-1.mp4',
        poster: 'https://cdn.example.test/community/media-2.jpg',
        width: 64,
        height: 48,
      }]);

      // Feed memakai poster + aspect-ratio dari dimensi tersimpan — kontrak
      // anti "kotak hitam 300×150" di perangkat yang tak mem-preload video.
      const createdArticle = app.page.locator('article').filter({ hasText: 'Video dengan poster' });
      const renderedVideo = createdArticle.getByLabel('Video 1 dari 1 kiriman Nikita Test');
      await renderedVideo.waitFor();
      assert.equal(await renderedVideo.getAttribute('poster'), 'https://cdn.example.test/community/media-2.jpg');
      assert.equal(await renderedVideo.evaluate(el => el.style.aspectRatio), '64 / 48');
      // Rasio juga dipegang wrapper (kotak skeleton) — skeleton dan media
      // tidak boleh pernah berukuran beda lalu melompat saat poster tiba.
      assert.equal(
        await createdArticle.locator('[data-media-content="video"]').evaluate(el => el.style.aspectRatio),
        '64 / 48',
      );

      // Skeleton placeholder hadir di area media dan memudar setelah poster
      // termuat — kontrak anti-"ngejedug": tidak ada pop-in tanpa shimmer,
      // dan shimmer tidak boleh abadi.
      const skeleton = createdArticle.locator('[data-video-skeleton]');
      await skeleton.waitFor({ state: 'attached' });
      await app.page.waitForFunction(
        element => element instanceof Element && element.classList.contains('opacity-0'),
        await skeleton.elementHandle(),
        { timeout: 5000 },
      );
    } finally {
      await app.close();
    }
  });

  test('thumbnail video di kiriman kutipan memakai poster + rasio + skeleton', { timeout: 30_000 }, async () => {
    const api = createCommunityApi({
      posts: [makePost({
        id: 'post-quote-video',
        body: 'Mengutip kiriman bervideo',
        quoted_post: {
          available: true,
          id: 'quoted-video-1',
          body: 'Video asli',
          media: [{
            type: 'video',
            url: 'https://cdn.example.test/community/quoted.mp4',
            poster: 'https://cdn.example.test/community/quoted-poster.jpg',
            width: 720,
            height: 1280,
          }],
          created_at: '2026-07-18T08:00:00.000Z',
          is_system: false,
          author: { name: 'Agent Lain', slug: 'agent-lain', photo: null },
        },
      })],
    });
    const app = await openApp({ api });
    try {
      const thumb = app.page.getByRole('button', { name: 'Lihat video 1 kiriman Agent Lain' });
      await thumb.waitFor();

      // Poster dipakai sebagai thumbnail (bukan <video> preload="metadata"
      // yang tampil hitam di perangkat hemat data), dengan rasio dari dimensi
      // tersimpan supaya lebar kotak benar sebelum poster termuat.
      const posterImg = thumb.locator('img');
      assert.equal(await posterImg.count(), 1, 'thumbnail kutipan harus <img> poster');
      assert.match(await posterImg.getAttribute('src'), /quoted-poster\.jpg$/);
      assert.equal(await posterImg.evaluate(el => el.style.aspectRatio), '720 / 1280');
      assert.equal(await thumb.locator('video').count(), 0);

      // Skeleton hadir dan settle (poster tidak dilayani host mock → onerror;
      // kontraknya: shimmer tidak boleh abadi).
      const skeleton = thumb.locator('[data-video-skeleton]');
      await skeleton.waitFor({ state: 'attached' });
      await app.page.waitForFunction(
        element => element instanceof Element && element.classList.contains('opacity-0'),
        await skeleton.elementHandle(),
        { timeout: 5000 },
      );
    } finally {
      await app.close();
    }
  });

  test('pratinjau video komentar memakai skeleton + rasio hasil capture', { timeout: 30_000 }, async () => {
    const api = createCommunityApi({
      posts: [makePost({ id: 'post-komentar-video', body: 'Uji pratinjau video komentar' })],
    });
    const app = await openApp({ api });
    try {
      const article = app.page.locator('article').filter({ hasText: 'Uji pratinjau video komentar' });
      await article.getByRole('button', { name: 'Komentari', exact: true }).click();

      const fileChooserPromise = app.page.waitForEvent('filechooser');
      await article.getByRole('button', { name: 'Tambah foto atau video ke komentar' }).click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles({
        name: 'clip.webm',
        mimeType: 'video/webm',
        buffer: Buffer.from(TINY_WEBM_BASE64, 'base64'),
      });

      const preview = article.getByLabel('Pratinjau video komentar 1');
      await preview.waitFor();
      // Rasio dari dimensi hasil captureVideoPoster terpasang setelah fase
      // processing selesai — kotak pratinjau tidak melompat.
      await app.page.waitForFunction(
        element => element instanceof Element && element.style.aspectRatio === '64 / 48',
        await preview.elementHandle(),
        { timeout: 5000 },
      );
      // Skeleton hadir dan settle begitu blob lokal terlukis.
      const skeleton = article.locator('[data-video-skeleton]');
      await skeleton.waitFor({ state: 'attached' });
      await app.page.waitForFunction(
        element => element instanceof Element && element.classList.contains('opacity-0'),
        await skeleton.elementHandle(),
        { timeout: 5000 },
      );
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
      // Slide kini selebar kontennya (tinggi rail seragam, lebar mengikuti
      // rasio media) dengan plafon 88% lebar rail — bukan lagi 86% tetap.
      assert.ok(firstSlideBox.width <= railBox.width * 0.88 + 1,
        'slide carousel tidak boleh melebihi 88% lebar rail');
      assert.ok(Math.abs(firstSlideBox.height - railBox.height) <= 2,
        'slide carousel harus setinggi rail (strip tinggi seragam)');
      assert.ok(secondSlideBox.x < railBox.x + railBox.width,
        'sebagian slide berikutnya harus terlihat sebagai affordance swipe');

      const video = article.getByLabel('Video 2 dari 3 kiriman Agent Lain', { exact: true });
      // Kontrol native diambil alih Plyr — cukup pastikan player terpasang dan
      // video tetap playsInline tanpa autoplay.
      assert.equal(await article.locator('[data-media-content="video"] .plyr').count(), 1);
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

  test('isi kiriman panjang dibatasi 4 baris dengan tombol Selengkapnya', { timeout: 30_000 }, async () => {
    const agent = makeAgent();
    const longBody = Array.from({ length: 6 }, (_, index) =>
      `Baris ${index + 1}: konten panjang nih konten panjang nih konten panjang nih.`).join('\n');
    // Tiga paragraf: dengan jarak penuh tidak muat 4 baris, jadi jaraknya
    // dipersempit — tetap ada, supaya strukturnya jujur.
    const spacedBody = ['Paragraf satu.', 'Paragraf dua.', 'Paragraf tiga.'].join('\n\n');
    // Dua paragraf: muat dengan jarak penuh, jadi tidak boleh dipersempit.
    const roomyBody = ['Paragraf awal.', 'Paragraf akhir.'].join('\n\n');
    const api = createCommunityApi({
      agent,
      posts: [
        makePost({ id: 'panjang', body: longBody }),
        makePost({ id: 'berjarak', body: spacedBody }),
        makePost({ id: 'lega', body: roomyBody }),
        makePost({ id: 'pendek', body: 'Teks ringkas' }),
      ],
    });
    const app = await openApp({ agent, api, viewport: { width: 360, height: 800 } });
    try {
      const longArticle = app.page.locator('article').filter({ hasText: 'Baris 1:' });
      const shortArticle = app.page.locator('article').filter({ hasText: 'Teks ringkas' });
      await longArticle.waitFor();
      await shortArticle.waitFor();

      assert.equal(
        await shortArticle.locator('[data-post-body-toggle]').count(),
        0,
        'kiriman pendek tidak boleh menampilkan tombol Selengkapnya',
      );

      // Tinggi body dianimasikan, jadi ukur setelah nilainya berhenti berubah.
      const settledHeight = async locator => {
        let last = -1;
        for (let attempt = 0; attempt < 60; attempt += 1) {
          const height = (await locator.boundingBox())?.height ?? 0;
          if (Math.abs(height - last) < 0.5) return height;
          last = height;
          await app.page.waitForTimeout(25);
        }
        return last;
      };

      const toggle = longArticle.locator('[data-post-body-toggle]');
      await toggle.waitFor();
      assert.equal((await toggle.innerText()).trim(), 'Selengkapnya');

      const body = longArticle.locator('[data-post-body]');
      const collapsedHeight = await settledHeight(body);
      const lineHeight = await body.evaluate(element => parseFloat(getComputedStyle(element).lineHeight));
      assert.ok(
        collapsedHeight > 0 && collapsedHeight <= lineHeight * 4 + 1,
        `isi kiriman terlipat harus maksimal 4 baris (${collapsedHeight}px vs ${lineHeight * 4}px)`,
      );

      await toggle.click();
      assert.equal((await toggle.innerText()).trim(), 'Lebih sedikit');
      // Sesaat setelah diklik tingginya harus masih di tengah jalan — bukan
      // langsung melompat ke tinggi penuh.
      const midHeight = (await body.boundingBox())?.height ?? 0;
      const expandedHeight = await settledHeight(body);
      assert.ok(
        expandedHeight > collapsedHeight + lineHeight,
        'isi kiriman harus tampil penuh setelah Selengkapnya diklik',
      );
      assert.ok(
        midHeight >= collapsedHeight - 1 && midHeight < expandedHeight - 1,
        `buka/tutup harus dianimasikan, bukan melompat (${midHeight}px antara ${collapsedHeight}px dan ${expandedHeight}px)`,
      );
      assert.equal(
        await app.page.locator('article').count(),
        4,
        'klik Selengkapnya tidak boleh membuka halaman detail kiriman',
      );

      await toggle.click();
      assert.equal((await toggle.innerText()).trim(), 'Selengkapnya');
      assert.equal(
        await settledHeight(body),
        collapsedHeight,
        'kiriman harus bisa dilipat kembali',
      );

      // Isyarat terpotong: baris terakhir dibuat memudar hanya saat terlipat.
      assert.equal(await body.getAttribute('data-post-body-faded'), 'true');
      const collapsedMask = await body.evaluate(element =>
        getComputedStyle(element).webkitMaskImage || getComputedStyle(element).maskImage);
      assert.match(String(collapsedMask), /gradient/,
        'baris terakhir kiriman terlipat harus memudar');
      assert.equal(
        await shortArticle.locator('[data-post-body][data-post-body-faded="true"]').count(),
        0,
        'kiriman yang tidak terpotong tidak boleh memudar',
      );

      // Tiga paragraf: jarak dipersempit tapi tetap ada, dan kembali penuh saat dibuka.
      const spacedArticle = app.page.locator('article').filter({ hasText: 'Paragraf satu.' });
      const spacedBodyLocator = spacedArticle.locator('[data-post-body]');
      const spacedToggle = spacedArticle.locator('[data-post-body-toggle]');
      await spacedToggle.waitFor();
      assert.equal(await spacedBodyLocator.getAttribute('data-post-body-compact'), 'true');
      const spacedCollapsed = await settledHeight(spacedBodyLocator);
      const fullSpacedHeight = lineHeight * 3 + lineHeight * 2;
      assert.ok(
        spacedCollapsed > lineHeight * 3 + 1,
        `jarak antar-paragraf harus tetap terlihat saat terlipat (${spacedCollapsed}px)`,
      );
      assert.ok(
        spacedCollapsed < fullSpacedHeight - 1,
        `jarak antar-paragraf harus dipersempit saat terlipat (${spacedCollapsed}px vs ${fullSpacedHeight}px)`,
      );
      await spacedToggle.click();
      const spacedExpanded = await settledHeight(spacedBodyLocator);
      assert.ok(
        Math.abs(spacedExpanded - fullSpacedHeight) <= 1,
        `jarak paragraf asli harus kembali penuh setelah dibuka (${spacedExpanded}px vs ${fullSpacedHeight}px)`,
      );

      // Dua paragraf yang muat: jarak asli dipertahankan, tanpa tombol.
      const roomyArticle = app.page.locator('article').filter({ hasText: 'Paragraf awal.' });
      const roomyBodyLocator = roomyArticle.locator('[data-post-body]');
      assert.equal(await roomyBodyLocator.getAttribute('data-post-body-compact'), 'false');
      assert.equal(
        await roomyArticle.locator('[data-post-body-toggle]').count(),
        0,
        'kiriman yang muat dengan jarak penuh tidak boleh menampilkan tombol',
      );
      assert.ok(
        Math.abs((await settledHeight(roomyBodyLocator)) - lineHeight * 3) <= 1,
        'dua paragraf yang muat harus memakai jarak satu baris penuh',
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
      // Density pass Jul 2026: body post 15px (satu tingkat di bawah 16px lama).
      assert.equal(textStyle.fontSize, '15px');
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
      // Baris ringkasan "N balasan" sudah dihapus dari desain — jumlah balasan
      // kini hanya tampil sebagai angka di tombol Komentari (di-assert di atas).
      // Sejajar dinilai dari IKON hati (visual), bukan kotak tombol — baris
      // aksi memakai -ml-2 supaya hit-area 44px meluber ke kiri tanpa
      // menggeser ikonnya dari kolom isi.
      const likeIconBox = await likeButton.locator('svg.lucide-heart').boundingBox();
      assert.ok(likeIconBox && Math.abs(likeIconBox.x - bodyBox.x) <= 2,
        'ikon aksi post harus tetap sejajar dengan isi post');
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
        // Target uji flip menu: berada di bawah kartu tinggi supaya bisa
        // digulir hingga trigger-nya dekat dasar viewport (ruang bawah sempit).
        makePost({
          id: 'flip-menu-post',
          body: 'Kiriman untuk uji flip menu',
          created_at: createdAt,
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

      // Flip diuji pada kiriman yang PUNYA konten tinggi di atasnya — kartu
      // pertama mustahil flip (trigger selalu di puncak halaman, ruang atas
      // tidak pernah lebih besar dari ruang bawah). Menu admin juga makin
      // tinggi (item Sematkan), jadi viewport pendek memakai 320px.
      await app.page.setViewportSize({ width: 360, height: 320 });
      const flipArticle = app.page.locator('[data-post-id="flip-menu-post"]');
      const flipTrigger = flipArticle.getByRole('button', { name: 'Buka menu kiriman' });
      await flipTrigger.evaluate(element => element.scrollIntoView({ block: 'end', behavior: 'auto' }));
      await flipTrigger.click();
      const flippedMenu = flipArticle.getByRole('menu', { name: 'Menu kiriman' });
      const [shortMenuBox, shortTriggerBox] = await Promise.all([
        flippedMenu.boundingBox(),
        flipTrigger.boundingBox(),
      ]);
      assert.ok(shortMenuBox && shortTriggerBox);
      assert.ok(shortMenuBox.y >= 0 && shortMenuBox.y + shortMenuBox.height <= 320,
        'menu post harus tetap utuh di viewport pendek');
      // Toleransi setengah tinggi trigger: menu flip menempel tepat di atas
      // trigger (overlap 1-3px karena origin animasi), yang penting BUKAN
      // membuka ke bawah (kasus gagal berada jauh di bawah ambang ini).
      assert.ok(shortMenuBox.y + shortMenuBox.height <= shortTriggerBox.y + shortTriggerBox.height / 2,
        'menu post harus berbalik ke atas ketika ruang bawah tidak cukup');
      await app.page.keyboard.press('Escape');
      await app.page.setViewportSize({ width: 360, height: 800 });

      const likeButton = article.getByRole('button', { name: 'Suka', exact: true });
      assert.equal((await likeButton.innerText()).trim(), String(12345 + 678 + 90));
      assert.equal(await app.page.getByRole('menu', { name: 'Pilih reaksi' }).count(), 0);

      // Toggle "Selengkapnya" dikecualikan: kontrol teks INLINE di ujung body
      // (pengecualian target-size WCAG 2.5.8 "inline") — memaksa 44px membuat
      // hitbox-nya menimpa baris teks di sekitarnya.
      // Dikecualikan dari 44px: (1) toggle "Selengkapnya" — kontrol teks INLINE
      // (pengecualian target-size WCAG 2.5.8); (2) tombol control-bar Plyr —
      // UI pihak ketiga yang targetnya sekunder (target primer video = poster
      // tap/play-large + tombol fullscreen 44px milik kita).
      const visibleButtons = article.locator('button:visible:not([data-post-body-toggle]):not(.plyr__controls *)');
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
      // Plyr mencopot atribut controls native dan memasang kontrolnya sendiri.
      assert.equal(await fullVideo.getAttribute('controls'), null);
      assert.equal(
        await viewer.locator('[data-media-content="video"] .plyr__controls [data-plyr="play"]').count(),
        1,
        'kontrol Plyr harus terpasang di viewer',
      );
      assert.equal(await fullVideo.getAttribute('playsinline'), '');
      assert.equal(await fullVideo.getAttribute('autoplay'), null);
      // Fokus mendarat di kontrol Plyr, bukan di <video>: Plyr mencopot atribut
      // controls sehingga elemen videonya sendiri tidak dapat difokus. Saat fokus
      // ada di dalam player, panah milik Plyr (seek) — Plyr menahan propagasinya
      // sehingga viewer tidak ikut berpindah media.
      await viewer.locator('[data-media-content="video"] .plyr__controls [data-plyr="play"]').focus();
      await app.page.keyboard.press('ArrowRight');
      assert.equal(await viewer.getByText('2/3', { exact: true }).count(), 1, 'panah di dalam player tidak boleh mengganti media');

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

  test('full-screen viewer stays open when the video player area is clicked', { timeout: 30_000 }, async () => {
    const api = createCommunityApi({
      posts: [makePost({
        id: 'viewer-video-post',
        body: 'Video layar penuh',
        media: [{ type: 'video', url: 'https://cdn.example.test/community/viewer.mp4' }],
      })],
    });
    const app = await openApp({ api, viewport: { width: 360, height: 800 } });
    try {
      const article = app.page.locator('article').filter({ hasText: 'Video layar penuh' });
      await article.getByRole('button', { name: /Buka video.*layar penuh/ }).click();
      const viewer = app.page.getByRole('dialog', { name: 'Media kiriman Agent Lain' });
      await viewer.waitFor();

      // Plyr menumpuk poster & kontrolnya di atas <video>, jadi klik "di area
      // videonya" justru mendarat di .plyr__poster, bukan di elemen <video>.
      // Viewer hanya boleh tertutup lewat latar hitam atau tombol tutup.
      const posterBox = await viewer.locator('.plyr__poster').boundingBox();
      assert.ok(posterBox, 'poster Plyr harus dapat diukur');
      await app.page.mouse.click(posterBox.x + 10, posterBox.y + 10);
      // Viewer punya animasi keluar ~0.22s — tunggu lebih lama dari itu, kalau
      // tidak elemen yang sedang beranimasi keluar terbaca sebagai "masih ada".
      await app.page.waitForTimeout(900);
      assert.equal(await viewer.count(), 1, 'klik di area video tidak boleh menutup viewer');

      await viewer.getByRole('button', { name: 'Tutup media' }).click();
      await viewer.waitFor({ state: 'detached' });
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

  test('comments load once, Enter puts the new comment on top, and deleting removes it', { timeout: 30_000 }, async () => {
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
      await article.getByRole('button', { name: 'Komentari', exact: true }).click();
      const serverComment = article.getByText('Komentar dari server', { exact: true });
      await serverComment.waitFor();
      // Desain railConnected (feed): post -> komposer -> komentar disambung
      // rail vertikal di kolom avatar (dua rail untuk satu komentar datar),
      // TANPA pemisah hairline yang dulu terbaca sebagai "post baru".
      assert.equal(await article.locator('[data-thread-rail]').count(), 2,
        'feed menyambung post -> komposer -> komentar lewat dua rail');
      assert.equal(
        await article.locator('[data-comment-row]').first().evaluate(element => getComputedStyle(element).borderTopWidth),
        '0px',
        'komentar teratas di feed tidak dipisah hairline (disambung rail)',
      );
      assert.equal(
        await article.locator('[data-thread-input]').evaluate(element => getComputedStyle(element).borderTopWidth),
        '0px',
        'baris komposer feed menyatu dengan utas (tanpa hairline)',
      );
      assert.doesNotMatch(await serverComment.evaluate(element => element.parentElement?.className || ''), /rounded|bg-|border/,
        'isi balasan harus flat tanpa bubble');
      assert.equal(matchingRequests(api, 'GET', '/api/community/posts/comments-post/comments').length, 1);

      await article.getByRole('button', { name: 'Komentari', exact: true }).click();
      await serverComment.waitFor({ state: 'detached' });
      await article.getByRole('button', { name: 'Komentari', exact: true }).click();
      await article.getByText('Komentar dari server', { exact: true }).waitFor();
      assert.equal(
        matchingRequests(api, 'GET', '/api/community/posts/comments-post/comments').length,
        1,
        'panel yang sudah dimuat tidak boleh fetch ulang',
      );

      const input = article.getByRole('textbox', { name: 'Tulis komentar' });
      assert.equal(await input.getAttribute('placeholder'), 'Kirim balasan…');
      assert.doesNotMatch(await input.getAttribute('class'), /rounded|border-gray|bg-white/,
        'input balasan harus transparan tanpa kapsul');
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
      // Terbaru di ATAS: komentar yang baru dikirim menyelip di baris pertama
      // (tepat di bawah komposer), bukan menempel di ujung daftar.
      assert.match(
        await article.locator('[data-comment-row]').first().innerText(),
        /Komentar baru/,
        'komentar terbaru harus muncul di baris paling atas',
      );
      // Animasi masuk (reveal tinggi + kilau emerald) harus SELESAI bersih.
      // Yang dijaga di sini bukan gerakannya — itu timing — melainkan keadaan
      // akhirnya: baris tak boleh tersangkut di tinggi 0/transparan, kilau harus
      // habis, dan overflow wrapper kembali visible (rail vertikal & burst reaksi
      // sengaja melewati kotak baris, jadi hidden yang tertinggal = terpotong).
      const settled = await article.locator('[data-comment-row]').first().evaluate(async element => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const wrapper = element.parentElement;
        return {
          height: Math.round(element.getBoundingClientRect().height),
          opacity: getComputedStyle(wrapper).opacity,
          background: getComputedStyle(element).backgroundColor,
          overflow: getComputedStyle(wrapper).overflow,
        };
      });
      assert.ok(settled.height > 20, `baris komentar baru harus punya tinggi wajar (dapat ${settled.height}px)`);
      assert.equal(settled.opacity, '1', 'baris komentar baru harus opaque setelah animasi');
      assert.match(settled.background, /rgba\(\d+,\s*\d+,\s*\d+,\s*0\)/, 'kilau harus memudar habis, bukan menetap');
      assert.equal(settled.overflow, 'visible', 'overflow wrapper harus dilepas setelah animasi (rail tak boleh terpotong)');
      assert.equal(await input.evaluate(element => document.activeElement === element), true,
        'fokus input komentar harus tetap siap untuk komentar berikutnya');
      const commentRequest = matchingRequests(api, 'POST', '/api/community/posts/comments-post/comments')[0];
      assert.equal(commentRequest.body.body, 'Komentar baru');
      assert.match(commentRequest.body.client_id, /^[0-9a-f-]{36}$/i);

      await article.getByRole('button', { name: 'Hapus komentar' }).click();
      await article.getByRole('button', { name: 'Konfirmasi hapus komentar' }).click();
      await article.getByText('Komentar baru', { exact: true }).waitFor({ state: 'detached' });
      assert.equal(matchingRequests(api, 'DELETE', '/api/community/comments/created-comment-1').length, 1);
    } finally {
      await app.close();
    }
  });

  test('hapus komentar tetap jalan walau dialog native dibungkam, dan baris lama tidak tersangkut kliping', { timeout: 30_000 }, async () => {
    // window.confirm yang SELALU balik false meniru dua keadaan nyata: centang
    // "jangan tampilkan dialog lagi" di Chrome, dan webview yang tak menangani
    // dialog sama sekali. Dulu itu membuat tombol hapus komentar mati total —
    // tanpa dialog, tanpa request, tanpa pesan galat. Konfirmasinya sekarang
    // in-app, jadi window.confirm tak boleh dipanggil sama sekali.
    const post = makePost({ id: 'detail-del', body: 'Kiriman detail', comment_count: 1 });
    const api = createCommunityApi({
      posts: [post],
      comments: { 'detail-del': [makeComment({
        id: 'komen-saya', body: 'Komentar saya sendiri', is_own: true,
        author: { name: 'Nikita Test', slug: 'nikita', photo: null },
      })] },
      onRequest: async ({ record, route }) => {
        if (record.method === 'GET' && record.pathname === '/api/community/posts/detail-del') {
          await responseJson(route, { success: true, data: clone(post) });
          return true;
        }
        return false;
      },
    });
    const app = await openApp({
      api,
      path: '/dashboard/teras/post/detail-del',
      waitForTeras: false,
      initScript: 'window.__confirmCalls = 0; window.confirm = () => { window.__confirmCalls += 1; return false; };',
    });
    try {
      const { page } = app;
      await page.getByText('Komentar saya sendiri', { exact: true }).waitFor({ timeout: 15_000 });

      // Baris yang sudah ada saat panel dirender TIDAK ikut animasi masuk, jadi
      // ia juga tak boleh mewarisi klipingnya: overflow yang tertinggal hidden
      // memotong pemisah full-bleed, rail, dan 8px kanan tombol hapus (baris
      // sengaja -mx-4 melebihi wrappernya).
      const clip = await page.locator('[data-comment-row]').first().evaluate(element => {
        const wrapper = element.parentElement;
        const button = element.querySelector('[aria-label="Hapus komentar"]');
        const box = button.getBoundingClientRect();
        const hit = document.elementFromPoint(box.right - 2, box.top + box.height / 2);
        return {
          overflow: getComputedStyle(wrapper).overflow,
          rowWiderThanWrapper: element.getBoundingClientRect().width > wrapper.getBoundingClientRect().width,
          rightEdgeHitsButton: !!hit && !!hit.closest('[aria-label="Hapus komentar"]'),
        };
      });
      assert.equal(clip.overflow, 'visible', 'baris lama tidak boleh tersangkut overflow-hidden dari animasi masuk');
      assert.ok(clip.rowWiderThanWrapper, 'baris komentar memang melebihi wrappernya (-mx-4) — itu yang bikin kliping berbahaya');
      assert.ok(clip.rightEdgeHitsButton, 'tepi kanan tombol hapus harus tetap bisa diklik, tidak terpotong kliping');

      await page.getByRole('button', { name: 'Hapus komentar' }).click();
      await page.getByRole('button', { name: 'Konfirmasi hapus komentar' }).click();
      await page.getByText('Komentar saya sendiri', { exact: true }).waitFor({ state: 'detached' });
      assert.equal(matchingRequests(api, 'DELETE', '/api/community/comments/komen-saya').length, 1,
        'konfirmasi in-app harus benar-benar mengirim DELETE');
      assert.equal(await page.evaluate(() => window.__confirmCalls), 0,
        'jalur hapus komentar tidak boleh menyentuh window.confirm');
    } finally {
      await app.close();
    }
  });

  test('batal di konfirmasi hapus komentar mengembalikan baris tanpa request', { timeout: 30_000 }, async () => {
    const api = createCommunityApi({
      posts: [makePost({ id: 'cancel-post', body: 'Kiriman batal hapus', comment_count: 1 })],
      comments: { 'cancel-post': [makeComment({
        id: 'komen-batal', body: 'Komentar yang batal dihapus', is_own: true,
        author: { name: 'Nikita Test', slug: 'nikita', photo: null },
      })] },
    });
    const app = await openApp({ api });
    try {
      const article = app.page.locator('article').filter({ hasText: 'Kiriman batal hapus' });
      await article.getByRole('button', { name: 'Komentari', exact: true }).click();
      await article.getByText('Komentar yang batal dihapus', { exact: true }).waitFor();

      await article.getByRole('button', { name: 'Hapus komentar' }).click();
      await article.getByRole('button', { name: 'Batal hapus komentar' }).click();
      await article.getByRole('button', { name: 'Hapus komentar' }).waitFor();
      await article.getByText('Komentar yang batal dihapus', { exact: true }).waitFor();
      assert.equal(matchingRequests(api, 'DELETE', '/api/community/comments/komen-batal').length, 0,
        'batal tidak boleh mengirim DELETE');
    } finally {
      await app.close();
    }
  });

  test('empty comments keep the post-to-composer rail without a hairline section', { timeout: 30_000 }, async () => {
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
      const emptyNotice = article.getByText('Belum ada komentar — jadilah yang pertama membalas.', { exact: true });
      await emptyNotice.waitFor();

      // Desain railConnected: panel terbuka menyambung avatar post ke komposer
      // lewat SATU rail; rail komposer -> komentar belum ada (komentar kosong)
      // dan empty state tampil polos tanpa hairline.
      assert.equal(await article.locator('[data-thread-rail]').count(), 1,
        'panel kosong hanya punya rail post -> komposer');
      assert.equal(
        await emptyNotice.evaluate(element => getComputedStyle(element).borderTopWidth),
        '0px',
        'empty state menyatu dengan utas (tanpa hairline)',
      );
    } finally {
      await app.close();
    }
  });

  test('rail baris "Lihat N balasan" tetap garis 1px yang segaris dengan rail lain', { timeout: 30_000 }, async () => {
    const api = createCommunityApi({
      posts: [makePost({ id: 'rail-toggle-post', body: 'Uji rail toggle balasan', comment_count: 2 })],
      comments: {
        'rail-toggle-post': [
          makeComment({ id: 'punya-balasan', body: 'Komentar punya balasan', reply_count: 2, preview_replies: [] }),
          makeComment({ id: 'komentar-kedua', body: 'Komentar kedua di grup', reply_count: 0, preview_replies: [] }),
        ],
      },
    });
    const app = await openApp({ api });
    try {
      const article = app.page.locator('article').filter({ hasText: 'Uji rail toggle balasan' });
      await article.getByRole('button', { name: 'Komentari', exact: true }).click();
      await article.getByRole('button', { name: 'Lihat 2 balasan', exact: true }).waitFor();

      // 4 rail: post -> komposer -> komentar-1 -> baris toggle -> komentar-2.
      // SEMUA harus garis 1px pada sumbu-x yang sama — regresi flex arah row
      // pernah membuat rail baris toggle melebar jadi balok 40px.
      const rails = article.locator('[data-thread-rail]');
      assert.equal(await rails.count(), 4, 'rail post/komposer/komentar/toggle harus hadir semua');
      const centers = [];
      for (let index = 0; index < 4; index += 1) {
        const box = await rails.nth(index).boundingBox();
        assert.ok(box && box.width <= 2, `rail ke-${index + 1} harus garis tipis, bukan balok (lebar ${box?.width})`);
        centers.push(box.x + box.width / 2);
      }
      assert.ok(Math.max(...centers) - Math.min(...centers) <= 1,
        'semua rail harus segaris vertikal (satu benang utas)');
    } finally {
      await app.close();
    }
  });

  test('tombol Balas di komentar membuka sheet balasan tanpa pindah halaman', { timeout: 30_000 }, async () => {
    const api = createCommunityApi({
      posts: [makePost({
        id: 'reply-sheet-post',
        body: 'Uji sheet balasan',
        comment_count: 1,
      })],
      comments: {
        'reply-sheet-post': [makeComment({
          id: 'komentar-target',
          body: 'Komentar yang dibalas',
          reply_count: 0,
          preview_replies: [],
        })],
      },
    });
    const app = await openApp({ api });
    try {
      const article = app.page.locator('article').filter({ hasText: 'Uji sheet balasan' });
      await article.getByRole('button', { name: 'Komentari', exact: true }).click();
      await article.getByText('Komentar yang dibalas', { exact: true }).waitFor();

      await article.getByRole('button', { name: 'Balas komentar' }).click();
      const dialog = app.page.getByRole('dialog', { name: 'Balas Komentar' });
      await dialog.waitFor();
      // Konteks ala Threads: kartu komentar yang dibalas tampil di dalam sheet,
      // dan TIDAK ada navigasi ke halaman utas (URL feed tetap).
      await dialog.getByText('Komentar yang dibalas', { exact: true }).waitFor();
      assert.equal(new URL(app.page.url()).pathname, '/dashboard/teras',
        'membuka sheet balasan tidak boleh berpindah halaman');

      const input = dialog.getByRole('textbox', { name: 'Tulis komentar' });
      assert.equal(await input.getAttribute('placeholder'), 'Balas ke Agent Lain…');
      assert.equal(await input.evaluate(element => document.activeElement === element), true,
        'komposer sheet harus langsung terfokus (siap ketik)');

      await input.fill('Balasan dari sheet');
      await input.press('Enter');
      await dialog.waitFor({ state: 'detached' });
      const replyRequest = matchingRequests(api, 'POST', '/api/community/posts/komentar-target/comments')[0];
      assert.ok(replyRequest, 'balasan harus dikirim ke id KOMENTAR, bukan kiriman induk');
      assert.equal(replyRequest.body.body, 'Balasan dari sheet');
      // reply_count baris komentar di feed langsung bertambah tanpa reload panel.
      await article.getByRole('button', { name: 'Lihat 1 balasan', exact: true }).waitFor();
      assert.equal(matchingRequests(api, 'GET', '/api/community/posts/reply-sheet-post/comments').length, 1,
        'sheet tidak boleh memicu fetch ulang panel');

      // Membaca utuh tetap lewat klik badan komentar -> halaman utas komentar.
      await article.getByText('Komentar yang dibalas', { exact: true }).click();
      await app.page.waitForURL('**/dashboard/teras/post/komentar-target', { timeout: 10_000 });
    } finally {
      await app.close();
    }
  });

  test('komposer membuat polling: toggle, opsi 2-4, kirim body.poll, render kartu', { timeout: 30_000 }, async () => {
    const api = createCommunityApi({ posts: [] });
    const app = await openApp({ api });
    try {
      await app.page.getByRole('button', { name: COMPOSER_TRIGGER, exact: true }).click();
      const dialog = app.page.getByRole('dialog', { name: 'Buat Kiriman' });
      await dialog.waitFor();

      await dialog.getByRole('button', { name: 'Polling', exact: true }).click();
      await dialog.getByRole('textbox', { name: 'Opsi 1 polling' }).waitFor();
      await dialog.getByRole('textbox', { name: 'Opsi 2 polling' }).waitFor();
      // Poll aktif memblokir media segmen pertama (parity Threads).
      assert.equal(await dialog.getByRole('button', { name: 'Foto/Video' }).isDisabled(), true,
        'tombol media segmen pertama harus nonaktif saat polling aktif');
      // Pilihan durasi: radiogroup dengan default 24 jam; pilih 1 minggu.
      const durationGroup = dialog.getByRole('radiogroup', { name: 'Durasi polling' });
      assert.equal(
        await durationGroup.getByRole('radio', { name: '24 jam', exact: true }).getAttribute('aria-checked'),
        'true',
        'durasi default harus 24 jam',
      );
      await durationGroup.getByRole('radio', { name: '1 minggu', exact: true }).click();

      await dialog.getByPlaceholder(COMPOSER_PLACEHOLDER).fill('Enaknya ambil paket yang mana?');
      await dialog.getByRole('textbox', { name: 'Opsi 1 polling' }).fill('Makkah dulu');
      // Opsi belum lengkap -> tombol kirim masih nonaktif.
      assert.equal(await dialog.getByRole('button', { name: 'Kirim kiriman' }).isDisabled(), true,
        'submit harus nonaktif selama ada opsi polling kosong');
      await dialog.getByRole('textbox', { name: 'Opsi 2 polling' }).fill('Madinah dulu');
      await dialog.getByRole('button', { name: '+ Tambah opsi', exact: true }).click();
      await dialog.getByRole('textbox', { name: 'Opsi 3 polling' }).fill('Dua-duanya');

      await dialog.getByRole('button', { name: 'Kirim kiriman' }).click();
      await dialog.waitFor({ state: 'detached', timeout: 10_000 });

      const createRequest = matchingRequests(api, 'POST', '/api/community/posts')[0];
      assert.deepEqual(createRequest.body.poll, {
        options: ['Makkah dulu', 'Madinah dulu', 'Dua-duanya'],
        duration: '7d',
      });

      const article = app.page.locator('article').filter({ hasText: 'Enaknya ambil paket yang mana?' });
      await article.locator('[data-poll]').waitFor();
      await article.getByRole('button', { name: /Makkah dulu/ }).waitFor();
      // Durasi 1 minggu -> sisa waktu ditulis dalam hari.
      await article.getByText('0 suara · Berakhir dalam 7 hari', { exact: true }).waitFor();
    } finally {
      await app.close();
    }
  });

  test('lampiran teks: kartu cuplikan di feed, klik membuka sheet dengan body penuh', { timeout: 30_000 }, async () => {
    // Cuplikan (feed) dan body penuh (endpoint terpisah) sengaja dibuat
    // BERBEDA isinya: kalau sheet cuma menampilkan ulang cuplikan, kalimat
    // penutup di bawah tidak akan pernah muncul dan tes ini merah.
    const preview = 'Ringkasan manasik untuk jamaah gelombang pertama.\nBaris kedua cuplikan.';
    const fullBody = `${preview}\n\nBagian ini HANYA ada di body penuh, tidak pernah dikirim di feed.`;
    const api = createCommunityApi({
      posts: [makePost({
        id: 'post-snippet',
        body: 'Catatan lengkap manasik, saya lampirkan di bawah',
        snippet: {
          title: 'Panduan Manasik Ringkas',
          preview,
          char_count: 1240,
        },
      })],
      snippetBodies: {
        'post-snippet': { title: 'Panduan Manasik Ringkas', body: fullBody, char_count: 1240 },
      },
    });
    const app = await openApp({ api });
    try {
      const article = app.page.locator('article').filter({ hasText: 'Catatan lengkap manasik' });
      await article.waitFor();

      const card = article.locator('[data-teras-snippet-card]');
      await card.waitFor();
      await card.getByText('Lampiran teks', { exact: true }).waitFor();
      await card.getByText('Panduan Manasik Ringkas', { exact: true }).waitFor();
      // Jumlah karakter memakai pemisah ribuan lokal id-ID.
      await card.getByText('1.240 karakter', { exact: true }).waitFor();
      // Feed TIDAK boleh menarik body: yang tampil di kartu murni cuplikan.
      assert.equal(
        matchingRequests(api, 'GET', '/api/community/posts/post-snippet/snippet').length,
        0,
        'kartu feed tidak boleh memanggil endpoint body lampiran',
      );

      const urlBeforeOpen = app.page.url();
      await card.getByText('Panduan Manasik Ringkas', { exact: true }).click();

      const sheet = app.page.locator('[data-teras-snippet-sheet]');
      await sheet.waitFor();
      // Membuka lampiran BUKAN membuka halaman detail kiriman.
      assert.equal(app.page.url(), urlBeforeOpen, 'klik kartu lampiran tidak boleh pindah ke halaman detail');

      await sheet.getByRole('heading', { name: 'Panduan Manasik Ringkas' }).waitFor();
      const sheetBody = sheet.locator('[data-teras-snippet-body]');
      await sheetBody.waitFor();
      // Body penuh tiba -> penanda kelengkapan berubah dan kalimat penutup muncul.
      await sheetBody.and(app.page.locator('[data-complete="true"]')).waitFor({ timeout: 10_000 });
      const rendered = await sheetBody.innerText();
      assert.match(rendered, /HANYA ada di body penuh/, 'sheet harus menampilkan body penuh, bukan cuplikan');
      assert.match(rendered, /Ringkasan manasik untuk jamaah/, 'awal teks harus tetap utuh');

      assert.equal(
        matchingRequests(api, 'GET', '/api/community/posts/post-snippet/snippet').length,
        1,
        'body lampiran diambil tepat sekali saat sheet dibuka',
      );
    } finally {
      await app.close();
    }
  });

  test('vote polling optimistic, bisa ganti suara, polling berakhir jadi statis', { timeout: 30_000 }, async () => {
    const openPoll = {
      options: [
        { text: 'Paket 9 Hari', votes: 3 },
        { text: 'Paket 12 Hari', votes: 1 },
      ],
      total_votes: 4,
      my_vote: null,
      ends_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      closed: false,
    };
    const closedPoll = {
      options: [
        { text: 'Subuh', votes: 2 },
        { text: 'Dzuhur', votes: 8 },
      ],
      total_votes: 10,
      my_vote: 1,
      ends_at: '2026-07-01T00:00:00.000Z',
      closed: true,
    };
    const api = createCommunityApi({
      posts: [
        makePost({ id: 'poll-open', body: 'Polling terbuka', poll: openPoll }),
        makePost({ id: 'poll-closed', body: 'Polling tertutup', poll: closedPoll }),
      ],
    });
    const app = await openApp({ api });
    try {
      const openArticle = app.page.locator('article').filter({ hasText: 'Polling terbuka' });
      // Belum memilih: baris opsi polos tanpa bar/persentase.
      await openArticle.getByRole('button', { name: 'Paket 9 Hari', exact: true }).waitFor();
      assert.equal(await openArticle.locator('[data-poll-bar]').count(), 0,
        'sebelum memilih tidak boleh ada bar hasil');
      await openArticle.getByText('4 suara', { exact: false }).waitFor();

      await openArticle.getByRole('button', { name: 'Paket 9 Hari', exact: true }).click();
      const voteRequests = () => matchingRequests(api, 'POST', '/api/community/posts/poll-open/poll-vote');
      await openArticle.getByText('5 suara', { exact: false }).waitFor();
      assert.equal(voteRequests().length, 1);
      assert.deepEqual(voteRequests()[0].body, { option: 0 });
      // Hasil tampil: bar + persentase (4/5 = 80%, 1/5 = 20%).
      await openArticle.getByText('80%', { exact: true }).waitFor();
      await openArticle.getByText('20%', { exact: true }).waitFor();
      assert.equal(await openArticle.locator('[data-poll-bar]').count(), 2);
      assert.equal(
        await openArticle.getByRole('button', { name: /Paket 9 Hari/ }).getAttribute('aria-pressed'),
        'true',
      );

      // Ganti suara selama polling terbuka: total tetap, persentase pindah.
      await openArticle.getByRole('button', { name: /Paket 12 Hari/ }).click();
      await openArticle.getByText('60%', { exact: true }).waitFor();
      await openArticle.getByText('40%', { exact: true }).waitFor();
      await openArticle.getByText('5 suara', { exact: false }).waitFor();
      assert.deepEqual(voteRequests()[1].body, { option: 1 });
      assert.equal(
        await openArticle.getByRole('button', { name: /Paket 12 Hari/ }).getAttribute('aria-pressed'),
        'true',
      );

      // Polling berakhir: baris statis (bukan tombol), label berakhir, hasil tampil.
      const closedArticle = app.page.locator('article').filter({ hasText: 'Polling tertutup' });
      await closedArticle.getByText('Polling berakhir', { exact: true }).waitFor();
      assert.equal(await closedArticle.locator('button[data-poll-option]').count(), 0,
        'opsi polling berakhir tidak boleh berupa tombol');
      await closedArticle.getByText('80%', { exact: true }).waitFor();
      assert.equal(voteRequests().length, 2, 'polling berakhir tidak boleh mengirim vote');
    } finally {
      await app.close();
    }
  });

  test('label "N suara" membuka daftar pemilih polling', { timeout: 30_000 }, async () => {
    const api = createCommunityApi({
      posts: [makePost({
        id: 'poll-voters-post',
        body: 'Polling dengan pemilih',
        poll: {
          options: [
            { text: 'Paket 9 Hari', votes: 2 },
            { text: 'Paket 12 Hari', votes: 1 },
          ],
          total_votes: 3,
          my_vote: 0,
          ends_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
          closed: false,
        },
      })],
      pollVoters: {
        'poll-voters-post': [
          { slug: 'nikita', name: 'Nikita Test', photo: null, option_index: 0, option_text: 'Paket 9 Hari' },
          { slug: 'sari', name: 'Sari Agent', photo: null, option_index: 0, option_text: 'Paket 9 Hari' },
          { slug: 'budi', name: 'Budi Agent', photo: null, option_index: 1, option_text: 'Paket 12 Hari' },
        ],
      },
    });
    const app = await openApp({ api });
    try {
      const article = app.page.locator('article').filter({ hasText: 'Polling dengan pemilih' });
      const votersButton = article.getByRole('button', { name: 'Lihat siapa yang memilih' });
      await votersButton.waitFor();
      assert.equal((await votersButton.innerText()).trim(), '3 suara');
      await votersButton.click();

      const popover = article.getByRole('dialog', { name: 'Daftar pemilih' });
      await popover.waitFor();
      // Post di puncak feed -> ruang atas sempit (dan ada header sticky) ->
      // popover membuka ke BAWAH, bukan nyelip di bawah header.
      assert.equal(await popover.getAttribute('data-poll-voters-placement'), 'down');
      const [popoverBox, votersButtonBox] = await Promise.all([
        popover.boundingBox(),
        votersButton.boundingBox(),
      ]);
      assert.ok(popoverBox && votersButtonBox && popoverBox.y >= votersButtonBox.y + votersButtonBox.height - 1,
        'popover pemilih harus membuka ke bawah saat trigger dekat puncak layar');
      await popover.getByText('Sari Agent', { exact: true }).waitFor();
      await popover.getByText('Budi Agent', { exact: true }).waitFor();
      // Tiap pemilih menampilkan opsi yang dipilihnya.
      assert.equal(await popover.getByText('Paket 9 Hari', { exact: true }).count(), 2);
      assert.equal(await popover.getByText('Paket 12 Hari', { exact: true }).count(), 1);
      assert.equal(matchingRequests(api, 'GET', '/api/community/posts/poll-voters-post/poll-voters').length, 1);

      await popover.getByRole('button', { name: 'Tutup', exact: true }).click();
      await popover.waitFor({ state: 'detached' });

      // Berpindah halaman (feed -> detail) harus menutup popover yang terbuka.
      await votersButton.click();
      await popover.waitFor();
      await article.getByText('Polling dengan pemilih', { exact: true }).click();
      await app.page.waitForURL('**/dashboard/teras/post/poll-voters-post', { timeout: 10_000 });
      await app.page.getByRole('dialog', { name: 'Daftar pemilih' }).waitFor({ state: 'detached' });
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

  test('admin bisa menghapus kiriman dan komentar agent lain', { timeout: 30_000 }, async () => {
    const admin = makeAgent({ slug: 'bagas', name: 'Bagas', role: 'admin' });
    const api = createCommunityApi({
      agent: admin,
      posts: [makePost({ id: 'foreign-post', body: 'Kiriman agent lain', comment_count: 1 })],
      comments: { 'foreign-post': [makeComment({ id: 'foreign-comment', body: 'Komentar agent lain' })] },
    });
    const app = await openApp({ agent: admin, api });
    try {
      const article = app.page.locator('article').filter({ hasText: 'Kiriman agent lain' });

      // Komentar agent lain: admin dapat tombol hapus meski is_own = false.
      await article.getByRole('button', { name: 'Komentari', exact: true }).click();
      await article.getByText('Komentar agent lain', { exact: true }).waitFor();
      await article.getByRole('button', { name: 'Hapus komentar' }).click();
      await article.getByRole('button', { name: 'Konfirmasi hapus komentar' }).click();
      await article.getByText('Komentar agent lain', { exact: true }).waitFor({ state: 'detached' });
      assert.equal(matchingRequests(api, 'DELETE', '/api/community/comments/foreign-comment').length, 1);

      // Kiriman agent lain: menu admin punya "Laporkan" sekaligus "Hapus".
      await article.getByRole('button', { name: 'Buka menu kiriman' }).click();
      assert.equal(await article.getByRole('menuitem', { name: 'Laporkan' }).count(), 1);
      await article.getByRole('menuitem', { name: 'Hapus' }).click();
      await article.getByRole('button', { name: 'Konfirmasi hapus kiriman' }).click();
      await article.waitFor({ state: 'detached' });
      assert.equal(matchingRequests(api, 'DELETE', '/api/community/posts/foreign-post').length, 1);
    } finally {
      await app.close();
    }
  });

  test('konfirmasi hapus menutupi post di bawahnya, bukan tertimpa tombol menunya', { timeout: 30_000 }, async () => {
    const agent = makeAgent();
    const own = overrides => makePost({
      is_own: true,
      author: { name: agent.name, slug: agent.slug, photo: agent.photo },
      ...overrides,
    });
    const api = createCommunityApi({
      agent,
      posts: [
        own({ id: 'post-atas', body: 'Kiriman atas' }),
        own({ id: 'post-bawah', body: 'Kiriman bawah' }),
      ],
    });
    const app = await openApp({ agent, api });
    try {
      const topArticle = app.page.locator('article').filter({ hasText: 'Kiriman atas' });
      await topArticle.getByRole('button', { name: 'Buka menu kiriman' }).click();
      await topArticle.getByRole('menuitem', { name: 'Hapus' }).click();
      const menu = topArticle.getByRole('menu', { name: 'Menu kiriman' });
      await menu.getByRole('button', { name: 'Konfirmasi hapus kiriman' }).waitFor();

      const bottomButton = app.page.locator('article')
        .filter({ hasText: 'Kiriman bawah' })
        .getByRole('button', { name: 'Buka menu kiriman' });
      const [menuBox, buttonBox] = await Promise.all([menu.boundingBox(), bottomButton.boundingBox()]);
      assert.ok(menuBox && buttonBox, 'menu dan tombol post bawah harus terlihat');
      const point = {
        x: buttonBox.x + buttonBox.width / 2,
        y: buttonBox.y + buttonBox.height / 2,
      };
      assert.ok(
        point.x >= menuBox.x && point.x <= menuBox.x + menuBox.width
        && point.y >= menuBox.y && point.y <= menuBox.y + menuBox.height,
        'prasyarat: menu harus membuka ke bawah dan menimpa tombol menu post berikutnya');

      const covered = await menu.evaluate((element, at) => {
        const hit = document.elementFromPoint(at.x, at.y);
        return Boolean(hit && element.contains(hit));
      }, point);
      assert.equal(covered, true, 'menu konfirmasi harus berada di atas tombol menu post di bawahnya');
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
      // Toolbar media composer kini berlabel "Foto/Video" (bukan lagi
      // "Tambahkan foto atau video" — label itu tinggal milik trigger di feed).
      const attachment = dialog.getByRole('button', { name: 'Foto/Video' });
      const cancelButton = dialog.getByRole('button', { name: 'Batal', exact: true });
      const sendButton = dialog.getByRole('button', { name: 'Kirim kiriman' });
      const [dialogBox, textareaBox, attachmentBox, cancelBox, sendBox] = await Promise.all([
        dialog.boundingBox(),
        textarea.boundingBox(),
        attachment.boundingBox(),
        cancelButton.boundingBox(),
        sendButton.boundingBox(),
      ]);
      assert.ok(
        dialogBox && textareaBox && attachmentBox && cancelBox && sendBox,
        'geometri composer harus dapat diukur',
      );
      assert.ok(cancelBox.y < textareaBox.y, 'Batal harus berada di header composer');
      // Tombol kirim pindah ke header (kanan atas, ala Threads) — satu baris
      // dengan Batal, bukan lagi bar bawah.
      assert.ok(sendBox.y < textareaBox.y, 'tombol kirim harus berada di header composer');
      assert.ok(
        Math.abs((sendBox.y + sendBox.height / 2) - (cancelBox.y + cancelBox.height / 2)) <= 3,
        'tombol kirim harus sebaris dengan Batal di header',
      );
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
      // Focus trap: dari mana pun di dalam dialog, Tab/Shift+Tab tidak pernah
      // membawa fokus keluar dialog — invarian, tanpa mengunci urutan tombol
      // (urutan toolbar berubah seiring fitur: Polling, Buat utas baru, dsb.).
      await attachment.focus();
      for (let step = 0; step < 12; step += 1) {
        await app.page.keyboard.press('Tab');
        assert.equal(
          await app.page.evaluate(() => !!document.activeElement?.closest('[role="dialog"][aria-modal="true"]')),
          true,
          `Tab ke-${step + 1} harus tetap berada di dalam composer`,
        );
      }
      for (let step = 0; step < 12; step += 1) {
        await app.page.keyboard.press('Shift+Tab');
        assert.equal(
          await app.page.evaluate(() => !!document.activeElement?.closest('[role="dialog"][aria-modal="true"]')),
          true,
          `Shift+Tab ke-${step + 1} harus tetap berada di dalam composer`,
        );
      }

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
      // Batas kiriman kini 500 karakter dengan counter selalu tampil di baris
      // toolbar segmen (bukan lagi muncul-saat-mendekati-batas era 2000).
      await dialog.getByText('0/500', { exact: true }).waitFor();

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

      // Label toolbar composer kini "Foto/Video".
      const attachment = dialog.getByRole('button', { name: 'Foto/Video' });
      const [textareaBox, attachmentBox] = await Promise.all([
        textarea.boundingBox(),
        attachment.boundingBox(),
      ]);
      assert.ok(textareaBox && attachmentBox, 'geometri composer yang tumbuh harus dapat diukur');
      assert.ok(Math.abs(attachmentBox.y - (textareaBox.y + textareaBox.height)) < 40,
        'toolbar media harus tetap menempel di bawah teks yang tumbuh');

      await textarea.fill('a'.repeat(480));
      await dialog.getByText('480/500', { exact: true }).waitFor();

      // Hard cap 520 memberi ruang tempel sedikit di atas batas — counter
      // merah + pesan galat tampil, alih-alih memangkas teks diam-diam.
      await textarea.fill('a'.repeat(520));
      await dialog.getByText('520/500', { exact: true }).waitFor();
      await dialog.getByText('Isi kiriman maksimal 500 karakter', { exact: true }).waitFor();
    } finally {
      await app.close();
    }
  });

  test('composer toolbar stays icon-only on phones so the counter is never clipped', { timeout: 30_000 }, async () => {
    const app = await openApp({
      api: createCommunityApi(),
      viewport: { width: 360, height: 800 },
    });
    try {
      await app.page.getByRole('button', { name: COMPOSER_TRIGGER, exact: true }).click();
      const dialog = app.page.getByRole('dialog', { name: 'Buat Kiriman' });
      await dialog.waitFor();
      const textarea = dialog.getByPlaceholder(COMPOSER_PLACEHOLDER);
      await textarea.waitFor();

      // Tiga tombol berlabel penuh (Foto/Video + Polling + Lampiran) tidak muat
      // di kolom composer ponsel: counter terdorong keluar dan terpotong oleh
      // overflow-x-hidden induknya. Invariannya geometris, bukan tekstual —
      // counter harus berakhir di dalam kolom yang sama dengan textarea.
      const counter = dialog.getByText('0/500', { exact: true });
      const [textareaBox, counterBox] = await Promise.all([
        textarea.boundingBox(),
        counter.boundingBox(),
      ]);
      assert.ok(textareaBox && counterBox, 'geometri toolbar composer harus dapat diukur');
      assert.ok(
        counterBox.x + counterBox.width <= textareaBox.x + textareaBox.width + 1,
        `counter karakter tidak boleh melewati kolom composer: ${JSON.stringify({ textareaBox, counterBox })}`,
      );

      // Ikon saja di ponsel, TAPI nama aksesibel tetap ada — `hidden` mencabut
      // teks dari pohon aksesibilitas, jadi ini yang menjaga aria-label tiap
      // tombol tidak ikut terhapus saat labelnya disembunyikan.
      for (const name of ['Foto/Video', 'Polling', 'Lampiran']) {
        assert.equal(
          await dialog.getByRole('button', { name, exact: true }).count(), 1,
          `tombol ${name} harus tetap punya nama aksesibel saat label disembunyikan`,
        );
        assert.equal(
          await dialog.getByText(name, { exact: true }).isVisible(), false,
          `label ${name} harus tersembunyi di viewport ponsel`,
        );
      }

      // Di layar lebar (sm: 640px) label kembali muncul utuh.
      await app.page.setViewportSize({ width: 720, height: 900 });
      for (const name of ['Foto/Video', 'Polling', 'Lampiran']) {
        await dialog.getByText(name, { exact: true }).waitFor({ state: 'visible' });
      }
    } finally {
      await app.close();
    }
  });

  test('Bagikan opens a dialog showing the short /teras/<code> link before copying', { timeout: 30_000 }, async () => {
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

      // Clicking must NOT copy or share straight away — it opens a dialog first.
      await app.page.evaluate(() => {
        window.__copied = [];
        window.__shared = [];
        navigator.clipboard.writeText = text => {
          window.__copied.push(text);
          return Promise.resolve();
        };
      });
      await shareButton.click();

      const dialog = app.page.getByRole('dialog', { name: 'Bagikan kiriman' });
      await dialog.waitFor();
      assert.deepEqual(
        await app.page.evaluate(() => window.__copied),
        [],
        'membuka popup tidak boleh langsung menyalin',
      );

      // The dialog shows the link itself, readable before any action.
      const linkField = dialog.getByLabel('Link kiriman');
      const shownLink = await linkField.inputValue();
      assert.match(shownLink, /^https?:\/\/[^/]+\/teras\/9fc969b0$/,
        'popup menampilkan /teras/<8 hex pertama id>, tanpa /dashboard');

      // Copy happens only when the user presses Salin inside the dialog.
      await dialog.getByRole('button', { name: 'Salin link' }).click();
      await app.page.getByText('Link disalin', { exact: true }).waitFor();
      const copied = await app.page.evaluate(() => window.__copied);
      assert.deepEqual(copied, [shownLink], 'tombol Salin menyalin link yang tampil');
      await dialog.getByRole('button', { name: 'Tersalin' }).waitFor();

      // Sharing is client-only — it must not mutate anything server-side.
      assert.equal(
        api.requests.filter(r => r.pathname.startsWith('/api/community/posts/')
          && r.method !== 'GET').length,
        0,
        'Bagikan tidak melakukan mutasi server',
      );

      // Escape closes the dialog and returns focus to the trigger.
      await app.page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      assert.equal(
        await app.page.evaluate(() => document.activeElement?.getAttribute('aria-label')),
        'Bagikan',
        'fokus kembali ke tombol Bagikan setelah popup ditutup',
      );
    } finally {
      await app.close();
    }
  });

  test('share dialog offers the OS share sheet only when Web Share exists', { timeout: 30_000 }, async () => {
    const api = createCommunityApi({
      posts: [makePost({ id: '9fc969b0-2465-4ae0-bbba-56e606a84914', body: 'Kiriman share sheet' })],
    });
    // navigator.share must exist before the page scripts run, since the button
    // is rendered from a capability check made on mount.
    const app = await openApp({
      api,
      waitForTeras: false,
      initScript: () => {
        window.__shared = [];
        navigator.share = data => {
          window.__shared.push(data);
          return Promise.resolve();
        };
      },
    });
    try {
      await app.page.getByText('Kiriman share sheet', { exact: true }).waitFor({ timeout: 30_000 });
      await app.page.getByRole('button', { name: 'Bagikan' }).first().click();

      const dialog = app.page.getByRole('dialog', { name: 'Bagikan kiriman' });
      await dialog.waitFor();
      await dialog.getByRole('button', { name: 'Bagikan lewat aplikasi lain' }).click();

      const shared = await app.page.evaluate(() => window.__shared);
      assert.equal(shared.length, 1, 'navigator.share dipanggil sekali');
      assert.match(shared[0].url, /\/teras\/9fc969b0$/);
      // A completed native share closes the dialog.
      await dialog.waitFor({ state: 'detached' });
    } finally {
      await app.close();
    }
  });

  test('daftar mention di kolom balasan tidak terpotong panel komentar', { timeout: 30_000 }, async () => {
    const post = makePost({ id: 'mention-post', body: 'Uji mention balasan', comment_count: 1 });
    const api = createCommunityApi({
      posts: [post],
      comments: { 'mention-post': [makeComment({ body: 'Balasan pertama' })] },
      members: [
        { slug: 'bagas', name: 'Bagas', photo: null, phone: null },
        { slug: 'agent-lain', name: 'Agent Lain', photo: null, phone: null },
        { slug: 'rahmah', name: 'Rahmah Utami', photo: null, phone: null },
      ],
    });
    const app = await openApp({ api, viewport: { width: 670, height: 780 } });
    try {
      const article = app.page.locator('article').filter({ hasText: 'Uji mention balasan' });
      await article.getByRole('button', { name: 'Komentari', exact: true }).click();
      const input = article.locator('textarea[id^="teras-comment-input-"]').first();
      await input.waitFor();
      // Let the panel's open animation settle: it clips while the height moves.
      await app.page.waitForFunction(() => {
        const panel = document.querySelector('[id^="teras-comments-"]');
        return !!panel && getComputedStyle(panel).opacity === '1';
      }, null, { timeout: 5_000 });
      await input.click();
      await input.type('@');

      const listbox = app.page.getByRole('listbox', { name: 'Sebut anggota' });
      await listbox.waitFor({ timeout: 10_000 });

      // The picker is absolutely positioned inside the comment panel, which
      // animates its height and therefore has to clip while opening. Anything
      // that still clips once the panel is open cuts the picker in half.
      const clipping = await listbox.evaluate(element => {
        const box = element.getBoundingClientRect();
        let clip = { top: -Infinity, bottom: Infinity };
        let culprit = null;
        let node = element.parentElement;
        while (node && node !== document.body) {
          const style = getComputedStyle(node);
          if (style.overflowY !== 'visible' || style.overflowX !== 'visible') {
            const rect = node.getBoundingClientRect();
            if (rect.top > clip.top) { clip = { ...clip, top: rect.top }; }
            if (rect.bottom < clip.bottom) { clip = { ...clip, bottom: rect.bottom }; }
            if (box.top < rect.top - 0.5 || box.bottom > rect.bottom + 0.5) {
              culprit = `${node.tagName.toLowerCase()}.${String(node.className || '').split(' ').slice(0, 3).join('.')}`;
            }
          }
          node = node.parentElement;
        }
        return {
          hiddenAbove: Math.max(0, Math.round(clip.top - box.top)),
          hiddenBelow: Math.max(0, Math.round(box.bottom - clip.bottom)),
          culprit,
        };
      });

      assert.equal(clipping.hiddenAbove, 0,
        `daftar mention terpotong ${clipping.hiddenAbove}px di atas oleh ${clipping.culprit}`);
      assert.equal(clipping.hiddenBelow, 0,
        `daftar mention terpotong ${clipping.hiddenBelow}px di bawah oleh ${clipping.culprit}`);

      // Every option must be clickable, not just the ones that survived the clip.
      const options = listbox.getByRole('option');
      assert.equal(await options.count(), 3, 'ketiga anggota harus tampil');
    } finally {
      await app.close();
    }
  });

  test('item @semua di komposer bisa dipilih dengan Enter tanpa mouse', { timeout: 30_000 }, async () => {
    // Query "semua" tak cocok dengan anggota manapun, jadi @semua jadi
    // satu-satunya baris yang tampil — tepat celah keyboard yang diperbaiki.
    const api = createCommunityApi({
      members: [{ slug: 'bagas', name: 'Bagas', photo: null, phone: null }],
    });
    const app = await openApp({ api });
    try {
      await app.page.getByRole('button', {
        name: COMPOSER_TRIGGER,
        exact: true,
      }).click();
      const dialog = app.page.getByRole('dialog', { name: 'Buat Kiriman' });
      await dialog.waitFor();
      const textarea = dialog.getByPlaceholder(COMPOSER_PLACEHOLDER);
      await textarea.click();
      await textarea.type('@semua');

      const listbox = app.page.getByRole('listbox', { name: 'Sebut anggota' });
      await listbox.waitFor({ timeout: 10_000 });
      assert.equal(await listbox.getByRole('option').count(), 1, '@semua harus jadi satu-satunya baris');

      await app.page.keyboard.press('Enter');

      await app.page.waitForFunction(() => {
        const node = document.activeElement;
        return !!node && 'value' in node && String(node.value).includes('@semua ');
      }, null, { timeout: 5_000 });
      assert.match(await textarea.inputValue(), /^@semua /);
    } finally {
      await app.close();
    }
  });

  test('mengetik @bag lalu Enter menyisipkan @bagas, bukan @semua', { timeout: 30_000 }, async () => {
    // Regresi temuan 1: mentionEveryoneVisible lama bernilai true bila
    // mentionItems.length > 0 ATAU query berawalan "sem" — jadi item @semua
    // ikut nangkring di posisi 0 untuk QUERY APA PUN yang punya kandidat
    // anggota, sementara detectMention mereset index ke 0 tiap ketikan.
    // Enter pada "@bag" (yang cocok anggota "bagas", bukan "semua") lantas
    // menyisipkan @semua, bukan mention personal yang dimaksud.
    const api = createCommunityApi({
      members: [{ slug: 'bagas', name: 'Bagas', photo: null, phone: null }],
    });
    const app = await openApp({ api });
    try {
      await app.page.getByRole('button', {
        name: COMPOSER_TRIGGER,
        exact: true,
      }).click();
      const dialog = app.page.getByRole('dialog', { name: 'Buat Kiriman' });
      await dialog.waitFor();
      const textarea = dialog.getByPlaceholder(COMPOSER_PLACEHOLDER);
      await textarea.click();
      await textarea.type('@bag');

      const listbox = app.page.getByRole('listbox', { name: 'Sebut anggota' });
      await listbox.waitFor({ timeout: 10_000 });

      await app.page.keyboard.press('Enter');

      await app.page.waitForFunction(() => {
        const node = document.activeElement;
        return !!node && 'value' in node && String(node.value).includes('@bagas ');
      }, null, { timeout: 5_000 });
      assert.match(
        await textarea.inputValue(),
        /^@bagas /,
        'Enter pada query "@bag" harus menyisipkan mention anggota "bagas", bukan broadcast @semua',
      );
    } finally {
      await app.close();
    }
  });

  test('@semua tampil di komposer dengan label jatah, tidak di kolom balasan', { timeout: 30_000 }, async () => {
    const post = makePost({ id: 'broadcast-post', body: 'Uji broadcast', comment_count: 1 });
    const api = createCommunityApi({
      posts: [post],
      comments: { 'broadcast-post': [makeComment({ body: 'Balasan pertama' })] },
      members: [{ slug: 'bagas', name: 'Bagas', photo: null, phone: null }],
    });
    const app = await openApp({ api, viewport: { width: 670, height: 780 } });
    try {
      await app.page.getByRole('button', { name: COMPOSER_TRIGGER, exact: true }).click();
      const dialog = app.page.getByRole('dialog', { name: 'Buat Kiriman' });
      await dialog.waitFor();
      await dialog.getByPlaceholder(COMPOSER_PLACEHOLDER).type('@');

      const listbox = app.page.getByRole('listbox', { name: 'Sebut anggota' });
      await listbox.waitFor({ timeout: 10_000 });
      const first = listbox.getByRole('option').first();
      assert.match(await first.innerText(), /@semua/, 'item broadcast harus di posisi teratas');
      assert.match(await first.innerText(), /1× sehari/, 'label jatah harus terlihat sebelum kirim');
      assert.equal(await first.getAttribute('aria-disabled'), 'false');

      // Memilihnya menyisipkan token ke isi kiriman.
      await first.click();
      assert.match(await dialog.getByPlaceholder(COMPOSER_PLACEHOLDER).inputValue(), /@semua\s/);

      // Kolom balasan tidak menawarkan broadcast. Isi kiriman sudah tak
      // kosong (token @semua tersisip), jadi menutup memicu konfirmasi
      // "Buang draft kiriman ini?" — terima supaya komposer benar-benar tutup.
      app.page.once('dialog', confirmation => confirmation.accept());
      await dialog.getByRole('button', { name: 'Batal', exact: true }).click();
      await dialog.waitFor({ state: 'detached' });
      const article = app.page.locator('article').filter({ hasText: 'Uji broadcast' });
      await article.getByRole('button', { name: 'Komentari', exact: true }).click();
      const commentInput = article.locator('textarea[id^="teras-comment-input-"]').first();
      await commentInput.waitFor();
      await commentInput.type('@');
      const commentListbox = app.page.getByRole('listbox', { name: 'Sebut anggota' });
      await commentListbox.waitFor({ timeout: 10_000 });
      assert.doesNotMatch(await commentListbox.innerText(), /@semua/,
        '@semua tidak berlaku di komentar, jadi tidak boleh ditawarkan di sana');
    } finally {
      await app.close();
    }
  });

  test('jatah habis menonaktifkan item @semua', { timeout: 30_000 }, async () => {
    const api = createCommunityApi({
      posts: [makePost({ id: 'quota-post', body: 'Uji jatah' })],
      members: [{ slug: 'bagas', name: 'Bagas', photo: null, phone: null }],
      broadcastQuota: { unlimited: false, used_today: 1, remaining: 0, resets_at: '2026-07-21T17:00:00.000Z' },
    });
    const app = await openApp({ api, viewport: { width: 670, height: 780 } });
    try {
      await app.page.getByRole('button', { name: COMPOSER_TRIGGER, exact: true }).click();
      const dialog = app.page.getByRole('dialog', { name: 'Buat Kiriman' });
      await dialog.waitFor();
      await dialog.getByPlaceholder(COMPOSER_PLACEHOLDER).type('@');
      const first = app.page.getByRole('listbox', { name: 'Sebut anggota' }).getByRole('option').first();
      await first.waitFor({ timeout: 10_000 });
      assert.match(await first.innerText(), /jatah hari ini habis/);
      assert.equal(await first.getAttribute('aria-disabled'), 'true');
    } finally {
      await app.close();
    }
  });

  test('@semua di komentar tidak dirender sebagai pill mention', { timeout: 30_000 }, async () => {
    // Temuan 2: memberBySlug dulu punya entri sintetis "semua" yang dipakai
    // juga untuk merender komentar — @semua di komentar ikut dapat gaya pill
    // (span emerald semibold, lihat renderMentionPill di MentionText.tsx),
    // padahal di komentar @semua tidak melakukan apa pun dan tidak boleh
    // tampak seolah melakukan sesuatu. Penanda yang benar-benar bisa gagal:
    // kelas warna pill (.text-emerald-600) melekat pada teks "semua" atau
    // tidak — bukan sekadar keberadaan teks "@semua" itu sendiri.
    const post = makePost({ id: 'comment-semua-post', body: 'Uji semua di komentar', comment_count: 1 });
    const api = createCommunityApi({
      posts: [post],
      comments: {
        'comment-semua-post': [makeComment({
          id: 'c-semua',
          body: '@bagas cek dong @semua di komentar ya',
        })],
      },
      members: [{ slug: 'bagas', name: 'Bagas', photo: null, phone: null }],
    });
    const app = await openApp({ api, viewport: { width: 670, height: 780 } });
    try {
      const article = app.page.locator('article').filter({ hasText: 'Uji semua di komentar' });
      await article.getByRole('button', { name: 'Komentari', exact: true }).click();
      const commentParagraph = article.locator('p').filter({ hasText: 'di komentar ya' });
      await commentParagraph.waitFor();

      // Kontrol positif: mention anggota nyata ("@bagas" -> anggota "Bagas")
      // HARUS tetap jadi pill, supaya penanda .text-emerald-600 ini terbukti
      // benar-benar mendeteksi pill (bukan selalu 0 apa pun yang terjadi).
      const bagasPill = commentParagraph.locator('.text-emerald-600', { hasText: 'Bagas' });
      assert.equal(await bagasPill.count(), 1, 'mention anggota nyata di komentar tetap harus jadi pill');

      // @semua di komentar tidak boleh dapat gaya pill yang sama.
      const semuaPill = commentParagraph.locator('.text-emerald-600', { hasText: 'semua' });
      assert.equal(await semuaPill.count(), 0, '@semua di komentar tidak boleh dirender sebagai pill mention');

      // Teksnya sendiri tetap tampil apa adanya (plain text), bukan dibuang.
      assert.match(await commentParagraph.innerText(), /@semua/, 'token @semua tetap tampil sebagai teks biasa');
    } finally {
      await app.close();
    }
  });

  function notificationPrefsPayload(overrides = {}) {
    return {
      success: true,
      data: {
        prefs: {
          teras_bell_mention: true, teras_bell_comment: true,
          teras_bell_reaction: true, teras_bell_broadcast: true,
          community_mentions: true, teras_tg_comment: false,
          teras_tg_reaction: false, teras_tg_broadcast: false,
        },
        telegram_connected: false,
        ...overrides,
      },
    };
  }

  test('gerigi membuka sheet dan meredupkan kolom Telegram saat belum tersambung', { timeout: 30_000 }, async () => {
    const api = createCommunityApi({
      onRequest: async ({ record, route }) => {
        if (record.method === 'GET' && record.pathname === '/api/community/notification-prefs') {
          await responseJson(route, notificationPrefsPayload({ telegram_connected: false }));
          return true;
        }
        return false;
      },
    });
    const app = await openApp({ api });
    try {
      // Gerigi pindah ke DALAM panel lonceng notifikasi — buka lonceng dulu,
      // lalu "Pengaturan notifikasi" (label lama "Pengaturan notifikasi Teras"
      // sudah tidak ada).
      await app.page.getByRole('button', { name: 'Notifikasi', exact: true }).first().click();
      await app.page.getByRole('button', { name: 'Pengaturan notifikasi', exact: true }).click();
      // Aksesibilitas dialog ini diberi nama lewat aria-labelledby -> <h2>, yang
      // teksnya "Notifikasi Teras" (judul sheet).
      const sheet = app.page.getByRole('dialog', { name: 'Notifikasi Teras' });
      await sheet.waitFor();
      await sheet.getByText('Telegram belum tersambung').waitFor();

      const tgSwitch = sheet.getByRole('switch', { name: 'Reaksi ke Telegram' });
      assert.equal(await tgSwitch.isDisabled(), true, 'kolom Telegram tidak boleh bisa diketuk sebelum tersambung');
      assert.equal(await tgSwitch.getAttribute('aria-checked'), 'false');

      const bellSwitch = sheet.getByRole('switch', { name: 'Reaksi di lonceng' });
      assert.equal(await bellSwitch.isDisabled(), false, 'kolom lonceng harus tetap bisa diketuk');
      assert.equal(await bellSwitch.getAttribute('aria-checked'), 'true');
    } finally {
      await app.close();
    }
  });

  test('saklar kembali ke posisi semula saat penyimpanan gagal', { timeout: 30_000 }, async () => {
    // PUT sengaja ditahan (bukan dijawab langsung) alih-alih dijawab seketika:
    // di mesin yang sedang sibuk, jawaban instan membuat flip-optimistis lalu
    // rollback selesai dalam hitungan sub-milidetik -- lebih cepat daripada
    // round-trip CDP mana pun bisa mengamatinya, jadi baca/tunggu apa pun tetap
    // race. Menahan responsnya (pola yang sama dipakai tes rollback reaksi Heart
    // di atas) membuat status optimistis bertahan sampai kita sengaja selesaikan,
    // sehingga waitForFunction di bawah punya sesuatu yang nyata untuk ditunggu.
    let failedPutRoute;
    const api = createCommunityApi({
      onRequest: async ({ record, route }) => {
        if (record.pathname !== '/api/community/notification-prefs') return false;
        if (record.method === 'GET') {
          await responseJson(route, notificationPrefsPayload({ telegram_connected: true }));
          return true;
        }
        if (record.method === 'PUT') {
          failedPutRoute = route;
          return true;
        }
        return false;
      },
    });
    const app = await openApp({ api });
    try {
      // Jalur yang sama dengan test gerigi di atas: lonceng -> Pengaturan notifikasi.
      await app.page.getByRole('button', { name: 'Notifikasi', exact: true }).first().click();
      await app.page.getByRole('button', { name: 'Pengaturan notifikasi', exact: true }).click();
      const sheet = app.page.getByRole('dialog', { name: 'Notifikasi Teras' });
      await sheet.waitFor();

      const bellSwitch = sheet.getByRole('switch', { name: 'Reaksi di lonceng' });
      await bellSwitch.waitFor();
      assert.equal(await bellSwitch.getAttribute('aria-checked'), 'true');

      await bellSwitch.click();
      // Penyimpanan optimistis: saklar berubah seketika, sebelum PUT selesai.
      // React men-set state dan re-render secara async, jadi satu baca sinkron
      // bisa mendahului DOM -- tunggu atributnya sampai benar-benar 'false',
      // dengan timeout yang gagal kalau tidak pernah tiba. Kalau atribut ini
      // tidak pernah jadi 'false', asersi "kembali ke true" di bawah akan lulus
      // meski saklarnya tidak pernah benar-benar merespons klik.
      await app.page.waitForFunction(
        (element) => element.getAttribute('aria-checked') === 'false',
        await bellSwitch.elementHandle(),
        { timeout: 5_000 },
      );

      assert.ok(failedPutRoute, 'PUT harus tertahan agar rollback optimistic dapat diuji');
      await responseJson(failedPutRoute, { error: 'boom' }, 500);

      await sheet.getByRole('alert').waitFor();
      assert.equal(await bellSwitch.getAttribute('aria-checked'), 'true', 'saklar harus kembali ke posisi semula setelah PUT gagal');

      const putRequests = matchingRequests(api, 'PUT', '/api/community/notification-prefs');
      assert.equal(putRequests.length, 1);
      assert.deepEqual(putRequests[0].body, { teras_bell_reaction: false });
    } finally {
      await app.close();
    }
  });

  test('komposer mengirim utas sebagai segments[]', { timeout: 30_000 }, async () => {
    const app = await openApp();
    try {
      const { page, api } = app;
      await page.getByRole('button', { name: COMPOSER_TRIGGER, exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Buat Kiriman' });
      await dialog.waitFor();

      await dialog.getByPlaceholder(COMPOSER_PLACEHOLDER).fill('Ini konten pertama.');
      await dialog.getByRole('button', { name: 'Buat utas baru' }).click();
      await dialog.getByPlaceholder('Tambahkan ke utas…').fill('Ini konten kedua.');
      await dialog.getByRole('button', { name: 'Kirim kiriman' }).click();
      await dialog.waitFor({ state: 'detached', timeout: 10_000 });

      const [request] = matchingRequests(api, 'POST', '/api/community/posts');
      assert.ok(request, 'kiriman harus terkirim');
      assert.equal(request.body.segments.length, 2);
      assert.deepEqual(
        request.body.segments.map(segment => segment.body),
        ['Ini konten pertama.', 'Ini konten kedua.'],
      );
      assert.ok(
        request.body.segments.every(segment => typeof segment.client_id === 'string' && segment.client_id),
        'tiap segmen wajib membawa client_id supaya rantai diketahui sebelum insert',
      );
      assert.notEqual(
        request.body.segments[0].client_id,
        request.body.segments[1].client_id,
        'client_id antar-segmen harus berbeda',
      );
    } finally {
      await app.close();
    }
  });

  test('tombol tambah berhenti di 10 segmen', { timeout: 60_000 }, async () => {
    const app = await openApp();
    try {
      const { page } = app;
      await page.getByRole('button', { name: COMPOSER_TRIGGER, exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Buat Kiriman' });
      await dialog.waitFor();
      await dialog.getByPlaceholder(COMPOSER_PLACEHOLDER).fill('Satu');
      const addButton = dialog.getByRole('button', { name: 'Buat utas baru' });

      // Ala Threads: setelah menambah segmen kosong, "Buat utas baru" mati
      // sampai segmen terakhir itu diisi — menahan tumpukan kotak kosong.
      await addButton.click();
      assert.equal(
        await addButton.isDisabled(),
        true,
        'tombol tambah harus mati selagi segmen terakhir masih kosong',
      );
      await dialog.getByPlaceholder('Tambahkan ke utas…').last().fill('Dua');

      // Cap utas kini 10 segmen (selaras MAX_THREAD_SEGMENTS lib & server).
      for (let i = 3; i <= 10; i += 1) {
        await addButton.click();
        await dialog.getByPlaceholder('Tambahkan ke utas…').last().fill(`Isi ${i}`);
      }

      // Di segmen ke-10 barisnya menghilang sepenuhnya (bukan berubah jadi label).
      assert.equal(
        await dialog.getByRole('button', { name: 'Buat utas baru' }).count(),
        0,
        'baris tambah harus hilang di segmen ke-10',
      );
      assert.equal(
        await dialog.getByPlaceholder('Tambahkan ke utas…').count(),
        9,
        '1 segmen awal + 9 tambahan = 10',
      );
    } finally {
      await app.close();
    }
  });

  test('kiriman satu segmen tetap mengirim satu elemen segments', { timeout: 30_000 }, async () => {
    const app = await openApp();
    try {
      const { page, api } = app;
      await submitTextPost(page, 'Kiriman biasa');
      const [request] = matchingRequests(api, 'POST', '/api/community/posts');
      assert.ok(request, 'kiriman harus terkirim');
      assert.equal(request.body.segments.length, 1);
      assert.equal(request.body.segments[0].body, 'Kiriman biasa');
    } finally {
      await app.close();
    }
  });

  test('halaman detail merender seluruh rantai utas, satu kolom komentar di segmen pertama', { timeout: 30_000 }, async () => {
    const author = { name: 'Agent Lain', slug: 'agent-lain', photo: null };
    // Payload `thread` lebih miskin dari kiriman tingkat-atas: item di sini
    // sengaja dibuat "polos" (my_reaction null, tanpa reaksi) supaya penggabungan
    // by-id untuk segmen yang dibuka benar-benar terbukti di bawah.
    const threadSegments = [
      'Segmen pertama utas.',
      'Segmen kedua utas.',
      'Segmen ketiga utas.',
    ].map((body, index) => makePost({
      id: `utas-${index + 1}`,
      body,
      author,
      created_at: `2026-07-18T08:0${index}:00.000Z`,
    }));
    // Halaman dibuka dari segmen KEDUA — kasus yang paling mudah salah.
    const openedSegment = {
      ...clone(threadSegments[1]),
      thread_count: 3,
      thread: clone(threadSegments),
      // Hanya ada di objek tingkat-atas, bukan di item `thread`.
      my_reaction: 'suka',
      reactions: { suka: 7, selamat: 0, aamiin: 0 },
    };
    const api = createCommunityApi({
      onRequest: async ({ record, route }) => {
        if (record.method === 'GET' && record.pathname === '/api/community/posts/utas-2') {
          await responseJson(route, { success: true, data: clone(openedSegment) });
          return true;
        }
        return false;
      },
    });
    const app = await openApp({ api, path: '/dashboard/teras/post/utas-2', waitForTeras: false });
    try {
      const { page } = app;
      const cards = page.locator('[data-post-id]');
      await page.locator('[data-post-id="utas-3"]').waitFor({ timeout: 15_000 });

      assert.equal(await cards.count(), 3, 'ketiga segmen utas harus tampil di halaman detail');
      assert.deepEqual(
        await cards.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-post-id'))),
        ['utas-1', 'utas-2', 'utas-3'],
        'segmen harus bertumpuk terurut waktu',
      );
      for (const [index, body] of ['Segmen pertama utas.', 'Segmen kedua utas.', 'Segmen ketiga utas.'].entries()) {
        assert.match(
          await cards.nth(index).innerText(),
          new RegExp(body.replace('.', '\\.')),
          `badan segmen ${index + 1} harus tampil`,
        );
      }

      // Garis penyambung ada di antara segmen, tapi tidak menggantung setelah
      // segmen terakhir.
      assert.equal(await page.locator('[data-thread-rail="thread"]').count(), 2, 'garis penyambung hanya di antara segmen');
      assert.equal(
        await cards.nth(2).locator('[data-thread-rail="thread"]').count(),
        0,
        'segmen terakhir tidak boleh menggantungkan garis penyambung',
      );

      // Satu kolom komentar saja, di bawah segmen terakhir.
      const commentInput = page.getByLabel('Tulis komentar');
      assert.equal(await commentInput.count(), 1, 'kolom komentar hanya satu untuk seluruh rantai');
      assert.equal(
        await commentInput.evaluate(node => node.id),
        'teras-comment-input-utas-1',
        'kolom komentar harus menempel ke segmen PERTAMA rantai, bukan segmen yang dibuka',
      );
      assert.deepEqual(
        matchingRequests(api, 'GET', '/api/community/posts/utas-1/comments').length,
        1,
        'komentar dimuat dari segmen pertama rantai',
      );
      assert.equal(
        matchingRequests(api, 'GET', '/api/community/posts/utas-2/comments').length,
        0,
        'komentar tidak boleh dimuat dari segmen yang kebetulan dibuka',
      );

      // Penggabungan by-id: segmen yang dibuka memakai objek tingkat-atas yang
      // lebih kaya (item `thread` untuk utas-2 tidak punya reaksi sama sekali).
      const likeOnOpened = cards.nth(1).getByRole('button', { name: 'Suka', exact: true });
      assert.equal(await likeOnOpened.getAttribute('aria-pressed'), 'true');
      assert.match(await likeOnOpened.innerText(), /7/, 'jumlah reaksi segmen yang dibuka harus dari payload tingkat-atas');
    } finally {
      await app.close();
    }
  });

  test('mengklik kartu utas di feed membuka rantai penuh, bukan hanya segmen akar', { timeout: 30_000 }, async () => {
    // Jalur navigasi UTAMA: klik kartu di feed. Item feed hanya membawa
    // `thread_count` (server tidak pernah menyertakan `thread` di feed), jadi
    // kalau pengambilan detail dilewatkan hanya karena kirimannya sudah ada di
    // state, halaman detail cuma menampilkan segmen akar.
    const author = { name: 'Agent Lain', slug: 'agent-lain', photo: null };
    const threadSegments = [
      'Segmen pertama utas.',
      'Segmen kedua utas.',
      'Segmen ketiga utas.',
    ].map((body, index) => makePost({
      id: `utas-${index + 1}`,
      body,
      author,
      created_at: `2026-07-18T08:0${index}:00.000Z`,
    }));
    const feedRoot = { ...clone(threadSegments[0]), thread_count: 3 };
    const detailRoot = {
      ...clone(threadSegments[0]),
      thread_count: 3,
      thread: clone(threadSegments),
    };
    const api = createCommunityApi({
      posts: [feedRoot],
      onRequest: async ({ record, route }) => {
        if (record.method === 'GET' && record.pathname === '/api/community/posts/utas-1') {
          await responseJson(route, { success: true, data: clone(detailRoot) });
          return true;
        }
        return false;
      },
    });
    const app = await openApp({ api });
    try {
      const { page } = app;
      const cards = page.locator('[data-post-id]');
      await page.locator('[data-post-id="utas-1"]').waitFor({ timeout: 15_000 });
      assert.equal(await cards.count(), 1, 'feed hanya menampilkan segmen akar');

      await page.locator('[data-post-id="utas-1"]').getByText('Segmen pertama utas.').click();

      await page.locator('[data-post-id="utas-3"]').waitFor({ timeout: 15_000 });
      assert.deepEqual(
        await cards.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-post-id'))),
        ['utas-1', 'utas-2', 'utas-3'],
        'seluruh rantai harus tampil terurut walau utas dibuka dari feed',
      );
      for (const [index, body] of ['Segmen pertama utas.', 'Segmen kedua utas.', 'Segmen ketiga utas.'].entries()) {
        assert.match(
          await cards.nth(index).innerText(),
          new RegExp(body.replace('.', '\\.')),
          `badan segmen ${index + 1} harus tampil`,
        );
      }
      assert.equal(
        matchingRequests(api, 'GET', '/api/community/posts/utas-1').length,
        1,
        'rantai diambil sekali saja, bukan berulang',
      );

      // Rail penyambung antar-segmen: satu di tiap segmen KECUALI yang
      // terakhir, dan julurannya (-mb-6) wajib dinaikkan di atas background
      // opak kartu berikutnya — tanpa z-index garisnya tampak putus ~14px
      // sebelum avatar segmen di bawahnya.
      const rails = page.locator('[data-thread-rail="thread"]');
      assert.equal(await rails.count(), 2, 'tiga segmen memasang dua rail penyambung');
      assert.equal(
        await rails.first().evaluate(element => getComputedStyle(element).zIndex),
        '10',
        'juluran rail harus dilukis di atas background kartu segmen berikutnya',
      );
    } finally {
      await app.close();
    }
  });

  test('tombol Suka di segmen yang bukan segmen yang dibuka mengirim reaksi segmen itu', { timeout: 30_000 }, async () => {
    // Tiap segmen membawa baris reaksinya sendiri. Kalau segmen selain yang
    // dibuka tidak ikut jadi warga state kiriman, tombolnya tetap terender dan
    // bisa diklik tapi tidak melakukan apa pun — diam-diam.
    const author = { name: 'Agent Lain', slug: 'agent-lain', photo: null };
    const threadSegments = [
      'Segmen pertama utas.',
      'Segmen kedua utas.',
      'Segmen ketiga utas.',
    ].map((body, index) => makePost({
      id: `utas-${index + 1}`,
      body,
      author,
      created_at: `2026-07-18T08:0${index}:00.000Z`,
    }));
    const openedSegment = {
      ...clone(threadSegments[1]),
      thread_count: 3,
      thread: clone(threadSegments),
    };
    const api = createCommunityApi({
      onRequest: async ({ record, route }) => {
        if (record.method === 'GET' && record.pathname === '/api/community/posts/utas-2') {
          await responseJson(route, { success: true, data: clone(openedSegment) });
          return true;
        }
        return false;
      },
    });
    const app = await openApp({ api, path: '/dashboard/teras/post/utas-2', waitForTeras: false });
    try {
      const { page } = app;
      await page.locator('[data-post-id="utas-3"]').waitFor({ timeout: 15_000 });

      const likeOnLastSegment = page
        .locator('[data-post-id="utas-3"]')
        .getByRole('button', { name: 'Suka', exact: true });
      assert.equal(await likeOnLastSegment.getAttribute('aria-pressed'), 'false');

      await likeOnLastSegment.click();
      await page.waitForFunction(button => (
        button.getAttribute('aria-pressed') === 'true' && button.textContent?.trim() === '1'
      ), await likeOnLastSegment.elementHandle(), { timeout: 10_000 });

      assert.deepEqual(
        matchingRequests(api, 'POST', '/api/community/posts/utas-3/reaction').map(request => request.body),
        [{ reaction: 'suka' }],
        'reaksi harus dikirim untuk id segmen yang tombolnya diklik',
      );
      assert.equal(
        matchingRequests(api, 'POST', '/api/community/posts/utas-2/reaction').length,
        0,
        'reaksi tidak boleh nyasar ke segmen yang kebetulan dibuka',
      );
      // Segmen lain tidak ikut berubah.
      assert.equal(
        await page.locator('[data-post-id="utas-1"]').getByRole('button', { name: 'Suka', exact: true }).getAttribute('aria-pressed'),
        'false',
      );
    } finally {
      await app.close();
    }
  });

  test('Enter memilih anggota saat popover mention dibuka di segmen non-pertama', { timeout: 30_000 }, async () => {
    // Baris @semua HANYA muncul di segmen pertama, jadi indeks item bergeser
    // antar-segmen. Query "@s" cocok untuk keduanya: di segmen pertama @semua
    // merebut posisi 0, di segmen kedua posisi 0 harus jadi milik anggota.
    // Kalau offset keyboard tidak ikut konteks segmen, Enter di segmen kedua
    // akan meleset (menyisipkan @semua atau tidak sama sekali).
    const api = createCommunityApi({
      members: [{ slug: 'sari', name: 'Sari', photo: null, phone: null }],
    });
    const app = await openApp({ api });
    try {
      const { page } = app;
      await page.getByRole('button', { name: COMPOSER_TRIGGER, exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Buat Kiriman' });
      await dialog.waitFor();
      const first = dialog.getByPlaceholder(COMPOSER_PLACEHOLDER);
      await first.fill('Segmen pertama.');
      await dialog.getByRole('button', { name: 'Buat utas baru' }).click();

      const second = dialog.getByPlaceholder('Tambahkan ke utas…');
      await second.click();
      await second.type('@s');

      const listbox = page.getByRole('listbox', { name: 'Sebut anggota' });
      await listbox.waitFor({ timeout: 10_000 });
      assert.equal(
        await listbox.getByRole('option').count(),
        1,
        'segmen non-pertama tidak menawarkan @semua, jadi hanya anggota yang tampil',
      );

      await page.keyboard.press('Enter');
      await page.waitForFunction(() => {
        const node = document.activeElement;
        return !!node && 'value' in node && String(node.value).includes('@sari ');
      }, null, { timeout: 5_000 });

      assert.equal(await second.inputValue(), '@sari ', 'Enter harus menyisipkan mention anggota di segmen kedua');
      assert.equal(await first.inputValue(), 'Segmen pertama.', 'segmen pertama tidak boleh ikut berubah');
    } finally {
      await app.close();
    }
  });
});
