import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
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

function responseJson(route, payload, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(payload),
  });
}

const NOTIFICATIONS = [
  {
    id: 'comment:c1',
    type: 'comment',
    post_id: 'post-1',
    comment_id: 'c1',
    actor: { name: 'Rina Test', photo: null },
    actor_count: 1,
    snippet: 'mantap kak',
    created_at: new Date(Date.now() - 60_000).toISOString(),
    unread: true,
  },
  {
    id: 'reaction:post-2',
    type: 'reaction',
    post_id: 'post-2',
    comment_id: null,
    actor: { name: 'Budi Test', photo: null },
    actor_count: 3,
    snippet: 'Kiriman kedua',
    created_at: new Date(Date.now() - 120_000).toISOString(),
    unread: true,
  },
];

describe('Teras notification bell browser contract', { concurrency: false }, () => {
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

  test('bell menampilkan badge, membuka panel, dan membuka detail post', { timeout: 30_000 }, async () => {
    const agent = makeAgent();
    const session = { token: 'browser-test-token', user: agent };
    const context = await browser.newContext({
      serviceWorkers: 'block',
      viewport: { width: 360, height: 800 },
    });
    const page = await context.newPage();

    try {
      await page.addInitScript(({ storedSession }) => {
        window.localStorage.setItem('auth_session', JSON.stringify(storedSession));
        window.localStorage.setItem('darkMode', 'false');
        window.sessionStorage.setItem('agentation-session-toolbar-hidden', '1');
      }, { storedSession: session });

      await page.route('**/api/**', async route => {
        const requestUrl = new URL(route.request().url());
        const pathname = requestUrl.pathname;
        const method = route.request().method();

        if (pathname === '/api/auth/me') {
          await responseJson(route, clone(agent));
          return;
        }
        // Tiga cabang bell notifikasi — dimock sebelum cabang fallback.
        if (pathname === '/api/community/notifications/head') {
          await responseJson(route, { success: true, data: { unread_count: 2 } });
          return;
        }
        if (pathname === '/api/community/notifications') {
          await responseJson(route, {
            success: true,
            data: { items: clone(NOTIFICATIONS), seen_at: null, fetched_at: new Date().toISOString() },
          });
          return;
        }
        if (pathname === '/api/community/notifications/seen') {
          await responseJson(route, { success: true });
          return;
        }
        if (method === 'GET' && pathname === '/api/community/feed') {
          await responseJson(route, { success: true, data: [], next_cursor: null });
          return;
        }
        if (pathname === '/api/community/teaser') {
          await responseJson(route, {
            success: true,
            data: { latest: null, today_count: 0, recent_avatars: [], unread_count: 0 },
          });
          return;
        }
        if (method === 'GET' && pathname === '/api/community/posts/post-1') {
          await responseJson(route, { success: true, data: makePost() });
          return;
        }
        if (method === 'GET' && pathname === '/api/community/posts/post-1/comments') {
          await responseJson(route, { success: true, data: [] });
          return;
        }
        if (pathname === '/api/jamaah/birthdays') {
          await responseJson(route, { success: true, birthdays: [] });
          return;
        }
        if (pathname === '/api/version') {
          await responseJson(route, {});
          return;
        }
        await responseJson(route, { success: true, data: [] });
      });

      await page.goto(`${appOrigin}/dashboard/teras`, { waitUntil: 'networkidle' });

      const bell = page.getByRole('button', { name: 'Notifikasi' }).first();
      await assert.doesNotReject(bell.waitFor({ state: 'visible', timeout: 5_000 }));
      assert.match(await bell.innerText(), /2/, 'badge menampilkan jumlah unread');

      await bell.click();
      const panel = page.getByRole('dialog', { name: 'Notifikasi' });
      await panel.waitFor({ state: 'visible', timeout: 5_000 });
      assert.match(await panel.innerText(), /Rina Test berkomentar di postinganmu/);
      assert.match(await panel.innerText(), /Budi Test & 2 lainnya menyukai postinganmu/);

      await panel.getByText('Rina Test berkomentar di postinganmu').click();
      await page.waitForURL(/\/dashboard\/teras\/post\/post-1$/, { timeout: 5_000 });

      assert.equal(
        await page.getByRole('button', { name: 'Sebutan untukmu' }).count(),
        0,
        'tombol @ lama sudah tidak ada',
      );
    } finally {
      await context.close();
    }
  });
});
