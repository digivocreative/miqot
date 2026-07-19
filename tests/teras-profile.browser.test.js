import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer } from 'vite';

// Models itself on tests/teras-page.browser.test.js: same Vite dev server +
// Playwright + in-page fetch-stub pattern, no database. This file only
// exercises `/teras/<slug>` profile mode (Task 7), so its API stub is a
// trimmed-down copy of that file's `createCommunityApi` — extended with a
// `/api/community/members` route (needed to resolve mention pills to names),
// which the shared fixture does not yet stub.

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
// Accessible name of the feed "buat kiriman" trigger — absent entirely in
// profile mode (see the `!profileSlug` guard around the composer trigger).
const COMPOSER_TRIGGER = 'Buat kiriman baru';

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
    photo: null,
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
    quote_count: 0,
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

/**
 * Trimmed fixture: only the routes the profile-mode scenarios below actually
 * exercise (feed with `?agent=` filtering, and members for mention-pill
 * resolution). Everything else under /api/community/ is answered with an
 * empty success payload so the app's silent-catch background polls
 * (mentions/head, read, feed/head) don't produce console noise.
 */
function createProfileApi({
  members = [],
  generalPosts = [],
  profilePosts = {},
} = {}) {
  const api = {
    members: clone(members),
    generalPosts: clone(generalPosts),
    profilePosts: clone(profilePosts),
    requests: [],
  };

  api.handle = async route => {
    const request = route.request();
    const url = new URL(request.url());
    const record = {
      method: request.method(),
      pathname: url.pathname,
      search: url.search,
    };
    api.requests.push(record);

    if (record.method === 'GET' && record.pathname === '/api/community/members') {
      await responseJson(route, { success: true, data: clone(api.members) });
      return;
    }

    if (record.method === 'GET' && record.pathname === '/api/community/feed') {
      const agentSlug = url.searchParams.get('agent');
      if (agentSlug) {
        await responseJson(route, {
          success: true,
          data: clone(api.profilePosts[agentSlug] || []),
          next_cursor: null,
        });
        return;
      }
      await responseJson(route, {
        success: true,
        data: clone(api.generalPosts),
        next_cursor: null,
      });
      return;
    }

    // Every other /api/community/* call (mentions/head, read, mentions/seen,
    // teaser, …) — answer quietly, the app swallows failures for these anyway.
    await responseJson(route, { success: true, data: [] });
  };

  return api;
}

function matchingRequests(api, method, pathname) {
  return api.requests.filter(request => (
    request.method === method && request.pathname === pathname
  ));
}

async function openApp({
  path = '/dashboard/teras',
  agent = makeAgent(),
  api = createProfileApi(),
  waitForTeras = true,
  viewport = { width: 390, height: 844 },
} = {}) {
  const context = await browser.newContext({
    serviceWorkers: 'block',
    viewport,
  });
  const page = await context.newPage();
  const session = { token: 'browser-test-token', user: agent };

  try {
    await page.addInitScript(({ storedSession }) => {
      window.localStorage.setItem('auth_session', JSON.stringify(storedSession));
      window.localStorage.setItem('darkMode', 'false');
      window.sessionStorage.setItem('agentation-session-toolbar-hidden', '1');
    }, { storedSession: session });

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

describe('Teras profile browser contracts', { concurrency: false }, () => {
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

  test('clicking a mention pill lands on the mentioned agent\'s Teras profile: header shows, composer is gone, feed refetches scoped to that agent', { timeout: 45_000 }, async () => {
    const api = createProfileApi({
      members: [
        { slug: 'nila', name: 'Nila Test', photo: null, phone: '628123456789' },
      ],
      generalPosts: [
        makePost({ id: 'mention-post', body: 'halo @nila' }),
      ],
      profilePosts: {
        nila: [makePost({
          id: 'nila-post-1',
          body: 'Kiriman milik Nila',
          author: { name: 'Nila Test', slug: 'nila', photo: null },
        })],
      },
    });
    const app = await openApp({ api });
    try {
      const mentionPill = app.page.getByRole('link', { name: '@Nila Test', exact: true });
      await mentionPill.waitFor();

      // Case 1: clicking the pill navigates (SPA, no reload) to /teras/nila.
      await mentionPill.click();
      await app.page.waitForFunction(() => window.location.pathname === '/teras/nila');
      assert.equal(await app.page.evaluate(() => window.location.pathname), '/teras/nila');

      // Case 2: the profile header renders name, @slug, and a wa.me link.
      await app.page.getByText('Nila Test', { exact: true }).first().waitFor();
      await app.page.getByText('@nila', { exact: true }).waitFor();
      const waLink = app.page.locator('a[href^="https://wa.me/"]');
      assert.equal(await waLink.count(), 1, 'header profil harus punya satu tautan wa.me');
      assert.equal(await waLink.getAttribute('href'), 'https://wa.me/628123456789');

      // Case 3: composer is unreachable in profile mode, and the feed the
      // profile page fetched is scoped to ?agent=nila (not the global feed).
      await app.page.getByText('Kiriman milik Nila', { exact: true }).waitFor();
      assert.equal(
        await app.page.getByRole('button', { name: COMPOSER_TRIGGER, exact: true }).count(),
        0,
        'composer tidak boleh ada di mode profil',
      );
      const feedRequests = matchingRequests(api, 'GET', '/api/community/feed');
      assert.ok(feedRequests.length >= 1, 'profil harus memuat feed sendiri');
      assert.equal(
        feedRequests[feedRequests.length - 1].search,
        '?agent=nila',
        'permintaan feed terakhir harus discope ke agent=nila',
      );
    } finally {
      await app.close();
    }
  });

  test('Quote on a post viewed in profile mode does not freeze the app (regression: used to lock scroll/inert with no visible modal)', { timeout: 30_000 }, async () => {
    const api = createProfileApi({
      profilePosts: {
        nila: [makePost({
          id: 'nila-quote-post',
          body: 'Kiriman untuk di-quote',
          author: { name: 'Nila Test', slug: 'nila', photo: null },
        })],
      },
    });
    const app = await openApp({ path: '/teras/nila', api, waitForTeras: false });
    try {
      const article = app.page.locator('article').filter({ hasText: 'Kiriman untuk di-quote' });
      await article.waitFor();

      await article.getByRole('button', { name: 'Quote', exact: true }).click();
      // Give any (buggy) async state change a moment to land before asserting
      // its absence — the original bug set React state synchronously, but a
      // short wait guards against any animation-driven follow-up.
      await app.page.waitForTimeout(300);

      assert.equal(
        await app.page.getByRole('dialog', { name: 'Buat Kiriman' }).count(),
        0,
        'Quote di mode profil tidak boleh membuka composer sheet',
      );
      assert.equal(
        await app.page.evaluate(() => document.body.style.overflow),
        '',
        'Quote di mode profil tidak boleh mengunci scroll halaman',
      );
      assert.equal(
        await app.page.locator('#root').evaluate(element => element.inert),
        false,
        'Quote di mode profil tidak boleh membuat #root inert',
      );
      assert.equal(
        await app.page.locator('#root').getAttribute('aria-hidden'),
        null,
        'Quote di mode profil tidak boleh membuat #root aria-hidden',
      );
      assert.equal(
        await app.page.locator('[data-teras-root]').getAttribute('aria-hidden'),
        null,
        'Quote di mode profil tidak boleh membuat root halaman aria-hidden',
      );

      // The app must still be interactive after the click — a fresh reaction
      // click reaches the network, proving nothing is stranded inert.
      const reactionRequest = app.page.waitForRequest(
        request => request.method() === 'POST'
          && request.url().includes('/api/community/posts/nila-quote-post/reaction'),
        { timeout: 3000 },
      );
      await article.getByRole('button', { name: 'Suka', exact: true }).click();
      await reactionRequest;
    } finally {
      await app.close();
    }
  });
});
