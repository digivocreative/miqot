/**
 * Tarik-untuk-segarkan di shell dashboard (tahap 2): Home dan feed Teras.
 *
 * Halaman dashboard memuat datanya masing-masing, jadi gestur tunggal di shell
 * bertanya ke halaman yang sedang tampil lewat tumpukan penyegar
 * (src/lib/pwa/refresh-registry.js). Yang diuji di sini adalah KABELNYA — bahwa
 * tarikan di Home benar-benar menarik ulang data Home, tarikan di Teras menarik
 * ulang feed, dan di halaman yang tidak mendaftar gesturnya benar-benar mati
 * (termasuk `overscroll-behavior` yang harus kembali dilepas, supaya PTR bawaan
 * Android tidak ikut padam di sana).
 *
 * Mesinnya WebKit dengan `navigator.standalone` dipalsukan: itu satu-satunya
 * lingkungan yang memang tidak punya gestur refresh bawaan.
 *
 * WAJIB: browser ditutup di `after`, kalau tidak `node --test` menggantung.
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { webkit } from 'playwright';
import { createServer } from 'vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const VIEWPORT = { width: 390, height: 812 };
const PULL_ARMED = 130;
const ONE_PIXEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

let viteServer;
let browser;
let appOrigin;

const AGENT = {
  slug: 'nikita',
  name: 'Nikita Test',
  role: 'agent',
  photo: ONE_PIXEL_PNG,
  website: 'https://example.test',
  phone: '628123456789',
  email: 'nikita@example.test',
};

function makePost(id = 'post-1') {
  return {
    id,
    body: `Kiriman ${id}`,
    photo_url: null,
    media: [],
    is_system: false,
    created_at: '2026-09-18T08:00:00.000Z',
    author: { name: 'Agent Lain', slug: 'agent-lain', photo: null },
    reactions: { suka: 0, selamat: 0, aamiin: 0 },
    my_reaction: null,
    reaction_sample_name: null,
    comment_count: 0,
    thread_count: 1,
    is_own: false,
  };
}

/**
 * Buka dashboard di app terpasang. Mengembalikan pencatat permintaan supaya tes
 * bisa menghitung "berapa kali endpoint X dipanggil" sebelum dan sesudah gestur.
 */
async function openDashboard({ path = '/dashboard' } = {}) {
  const context = await browser.newContext({
    serviceWorkers: 'block',
    viewport: VIEWPORT,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const calls = [];

  try {
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, 'standalone', { get: () => true, configurable: true });
    });
    await page.addInitScript(({ agent }) => {
      window.localStorage.setItem('auth_session', JSON.stringify({ token: 'browser-test-token', user: agent }));
      window.localStorage.setItem('darkMode', 'false');
      window.sessionStorage.setItem('agentation-session-toolbar-hidden', '1');
    }, { agent: AGENT });

    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      const json = (payload, status = 200) => route.fulfill({
        status,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(payload),
      });

      if (url.pathname.startsWith('/api/')) {
        calls.push(url.pathname);
        if (url.pathname === '/api/auth/me') return json(AGENT);
        if (url.pathname === '/api/community/feed') {
          return json({ success: true, data: [makePost()], next_cursor: null });
        }
        if (url.pathname === '/api/community/posts/post-1') {
          return json({ success: true, data: makePost() });
        }
        if (url.pathname === '/api/kurs') {
          return json({ success: true, data: { rates: { USD: 16500, SAR: 4400 }, updatedAt: '19/09/26 09:51 WIB' } });
        }
        if (url.pathname === '/api/jamaah/birthdays') return json({ success: true, birthdays: [] });
        return json({ success: true, data: [] });
      }

      if (url.origin !== appOrigin) return route.abort();
      return route.continue();
    });

    await page.goto(`${appOrigin}${path}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.locator('main').first().waitFor({ timeout: 30_000 });
  } catch (error) {
    await context.close();
    throw error;
  }

  const countOf = pathname => calls.filter(item => item === pathname).length;

  /** Tunggu sampai gelombang permintaan saat mount benar-benar reda. */
  async function settle() {
    let quiet = 0;
    let lastSeen = -1;
    while (quiet < 3) {
      await page.waitForTimeout(250);
      if (calls.length === lastSeen) quiet += 1;
      else { quiet = 0; lastSeen = calls.length; }
    }
  }

  return { page, calls, countOf, settle, close: () => context.close() };
}

/** Gestur satu jari; `dy` positif = menarik ke bawah. */
async function swipe(page, { selector = 'main', dy = 0, steps = 6 } = {}) {
  const startX = VIEWPORT.width / 2;
  const startY = 500;
  const touch = (x, y) => ({ clientX: x, clientY: y, identifier: 1 });
  const dispatch = (type, x, y) => page.dispatchEvent(selector, type, {
    touches: type === 'touchend' ? [] : [touch(x, y)],
    changedTouches: [touch(x, y)],
    targetTouches: type === 'touchend' ? [] : [touch(x, y)],
  });

  await dispatch('touchstart', startX, startY);
  for (let step = 1; step <= steps; step += 1) {
    await dispatch('touchmove', startX, startY + (dy * step) / steps);
  }
  await dispatch('touchend', startX, startY + dy);
}

const hasHostClass = page => page.evaluate(
  () => document.documentElement.classList.contains('pull-refresh-host'),
);

describe('Dashboard — tarik-untuk-segarkan per halaman', { concurrency: false }, () => {
  before(async () => {
    viteServer = await createServer({
      root: projectRoot,
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0, strictPort: true },
    });
    await viteServer.listen();
    const address = viteServer.httpServer?.address();
    assert.ok(address && typeof address === 'object', 'Vite harus membuka HTTP port');
    appOrigin = `http://127.0.0.1:${address.port}`;
    browser = await webkit.launch({ headless: true });
  }, { timeout: 60_000 });

  after(async () => {
    await browser?.close();
    await viteServer?.close();
  });

  test('Home: tarikan menarik ulang agent, kurs, dan widget kartunya', { timeout: 90_000 }, async () => {
    const session = await openDashboard({ path: '/dashboard' });
    try {
      const { page } = session;
      await session.settle();
      assert.equal(await hasHostClass(page), true, 'Home punya penyegar, jadi overscroll-behavior diambil alih');

      const before = {
        me: session.countOf('/api/auth/me'),
        kurs: session.countOf('/api/kurs'),
        ultah: session.countOf('/api/jamaah/birthdays'),
      };
      assert.ok(before.ultah > 0, 'widget ultah harus sudah memuat sekali saat mount');

      await swipe(page, { dy: PULL_ARMED });
      await page.waitForFunction(
        () => document.querySelector('[data-pull-refresh]')?.dataset.phase === 'refreshing',
        undefined,
        { timeout: 10_000 },
      );
      await page.waitForTimeout(1_500);

      assert.equal(session.countOf('/api/auth/me'), before.me + 1, 'data agent ditarik ulang');
      assert.equal(session.countOf('/api/kurs'), before.kurs + 1, 'kurs ditarik ulang');
      assert.ok(
        session.countOf('/api/jamaah/birthdays') > before.ultah,
        'widget Home dipasang ulang sehingga memuat datanya lagi',
      );
    } finally {
      await session.close();
    }
  });

  test('Teras: tarikan memuat ulang feed, bukan memasang ulang halaman', { timeout: 90_000 }, async () => {
    const session = await openDashboard({ path: '/dashboard/teras' });
    try {
      const { page } = session;
      await session.settle();
      assert.equal(await hasHostClass(page), true);

      const feedBefore = session.countOf('/api/community/feed');
      assert.ok(feedBefore > 0, 'feed harus sudah dimuat sekali');

      await swipe(page, { dy: PULL_ARMED });
      await page.waitForFunction(
        () => document.querySelector('[data-pull-refresh]')?.dataset.phase === 'refreshing',
        undefined,
        { timeout: 10_000 },
      );
      await page.waitForTimeout(1_500);

      assert.equal(session.countOf('/api/community/feed'), feedBefore + 1, 'feed ditarik ulang tepat sekali');
      await page.waitForFunction(
        () => document.querySelector('[data-pull-refresh]')?.dataset.phase === 'idle',
        undefined,
        { timeout: 10_000 },
      );
    } finally {
      await session.close();
    }
  });

  test('Daftar Jamaah: tarikan memasang ulang halaman lewat jalur muat-ulang yang sudah ada', { timeout: 90_000 }, async () => {
    const session = await openDashboard({ path: '/dashboard/jamaah' });
    try {
      const { page } = session;
      await session.settle();
      assert.equal(await hasHostClass(page), true);

      const statusBefore = session.countOf('/api/laporan/status');
      assert.ok(statusBefore > 0, 'halaman jamaah harus sudah memeriksa status saat mount');

      await swipe(page, { dy: PULL_ARMED });
      await page.waitForTimeout(1_500);

      assert.ok(
        session.countOf('/api/laporan/status') > statusBefore,
        'halaman dipasang ulang sehingga memeriksa statusnya lagi',
      );
    } finally {
      await session.close();
    }
  });

  test('detail utas Teras tidak mendaftar — gestur mati DAN overscroll dikembalikan', { timeout: 90_000 }, async () => {
    const session = await openDashboard({ path: '/dashboard/teras/post/post-1' });
    try {
      const { page } = session;
      await session.settle();

      assert.equal(
        await hasHostClass(page),
        false,
        'tanpa penyegar, overscroll-behavior harus dilepas supaya PTR bawaan Android tetap hidup',
      );

      const feedBefore = session.countOf('/api/community/feed');
      await swipe(page, { dy: PULL_ARMED });
      await page.waitForTimeout(1_200);

      assert.equal(session.countOf('/api/community/feed'), feedBefore, 'tidak ada yang disegarkan di halaman ini');
      assert.equal(
        await page.evaluate(() => document.querySelector('[data-pull-refresh]')?.dataset.phase ?? 'idle'),
        'idle',
      );
    } finally {
      await session.close();
    }
  });
});
