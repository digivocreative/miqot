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
 * Muatan /api/laporan/stats yang LENGKAP. StatistikPage menyebar beberapa field
 * array langsung (`[...data.availableYears]`), jadi muatan seadanya membuat
 * halamannya melempar dan tertangkap error boundary — tesnya lalu gagal dengan
 * alasan yang salah ("gestur tidak terdaftar") padahal yang rusak fixture-nya.
 */
function makeStats() {
  const comparison = { current: 0, previous: 0, delta: 0, percent: 0 };
  return {
    totalJamaah: 0, lunas: 0, belumLunas: 0, totalOutstanding: 0,
    berangkatSegera: 0, berangkatBulan: null, jamaahBaru: 0, lunasPercent: 0,
    comparison: {
      totalJamaah: comparison, komisiCair: null,
      berangkatSegera: comparison, jamaahBaru: comparison,
    },
    trend: [],
    berangkatBulanIni: [],
    outstandingList: [],
    availableYears: ['1448'],
    komisi: {
      totalKomisi: 0, sudahCair: 0, sudahCairCount: 0, belumCair: 0,
      belumCairCount: 0, potensi: 0, potensiCount: 0,
      breakdown: {
        hemat: { count: 0, rate: 1300000, total: 0 },
        reguler: { count: 0, rate: 1800000, total: 0 },
      },
      chartBulanan: [],
    },
    hijriahYear: '1448',
    lastSync: '2026-09-20T03:00:00.000Z',
  };
}

/** Muatan /api/analytics/summary yang lengkap — lihat catatan di makeStats(). */
function makeAnalytics() {
  return {
    period: '2026-09',
    overview: { totalLogins: 0, activeAgents: 0, totalAgents: 0, totalPageViews: 0, totalWAClicks: 0 },
    dailyActivity: [],
    agentActivity: [],
    featureUsage: [],
    actionTracking: [],
    publicTracking: [],
    recentActivity: [],
  };
}

/**
 * Buka dashboard di app terpasang. Mengembalikan pencatat permintaan supaya tes
 * bisa menghitung "berapa kali endpoint X dipanggil" sebelum dan sesudah gestur.
 */
async function openDashboard({ path = '/dashboard', agent = AGENT } = {}) {
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
    }, { agent });

    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      const json = (payload, status = 200) => route.fulfill({
        status,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(payload),
      });

      if (url.pathname.startsWith('/api/')) {
        calls.push(url.pathname);
        if (url.pathname === '/api/auth/me') return json(agent);
        if (url.pathname === '/api/laporan/stats') return json({ success: true, data: makeStats() });
        if (url.pathname === '/api/hotels') return json({ success: true, data: [] });
        if (url.pathname === '/api/hotels/banners') return json({ success: true, data: {} });
        if (url.pathname === '/api/admin/agents') return json([]);
        if (url.pathname === '/api/analytics/summary') return json({ success: true, data: makeAnalytics() });
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

  /**
   * Tunggu halaman tujuan benar-benar hidup, ditandai permintaan PERTAMA
   * miliknya sendiri.
   *
   * Menunggu <main> saja tidak cukup: sub-halaman dashboard di-lazy-load, dan
   * <main> milik shell sudah ada jauh sebelum chunk halamannya selesai. Di suite
   * yang sibuk, celah itu membuat `settle()` di bawah menyimpulkan "sudah reda"
   * padahal halamannya belum mount — belum mendaftarkan penyegar — dan tesnya
   * gagal seolah gesturnya tidak terpasang.
   */
  async function waitForCall(pathname, { timeout = 30_000 } = {}) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (countOf(pathname) > 0) return;
      await page.waitForTimeout(100);
    }
    throw new Error(`Halaman tidak pernah memanggil ${pathname} dalam ${timeout}ms`);
  }

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

  return { page, calls, countOf, settle, waitForCall, close: () => context.close() };
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
      await session.waitForCall('/api/jamaah/birthdays');
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
      await session.waitForCall('/api/community/feed');
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
      await session.waitForCall('/api/laporan/status');
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

  test('detail utas Teras menyegarkan UTASNYA, bukan feed di belakangnya', { timeout: 90_000 }, async () => {
    const session = await openDashboard({ path: '/dashboard/teras/post/post-1' });
    try {
      const { page } = session;
      await session.waitForCall('/api/community/feed');
      await session.settle();
      assert.equal(await hasHostClass(page), true);

      const postBefore = session.countOf('/api/community/posts/post-1');
      const feedBefore = session.countOf('/api/community/feed');

      await swipe(page, { dy: PULL_ARMED });
      await page.waitForTimeout(1_500);

      assert.equal(
        session.countOf('/api/community/posts/post-1'),
        postBefore + 1,
        'utas yang sedang dibuka ditarik ulang — jalan pintas cache tidak boleh menelannya',
      );
      assert.equal(session.countOf('/api/community/feed'), feedBefore, 'feed di belakang layar tidak ikut dimuat ulang');
    } finally {
      await session.close();
    }
  });

  test('Statistik: tarikan menarik ulang statistik, bukan memasang ulang halaman', { timeout: 90_000 }, async () => {
    const session = await openDashboard({ path: '/dashboard/statistik' });
    try {
      const { page } = session;
      await session.waitForCall('/api/laporan/stats');
      await session.settle();
      assert.equal(await hasHostClass(page), true);

      const before = session.countOf('/api/laporan/stats');
      assert.ok(before > 0, 'statistik harus sudah dimuat sekali');

      await swipe(page, { dy: PULL_ARMED });
      await page.waitForTimeout(1_500);

      assert.equal(session.countOf('/api/laporan/stats'), before + 1);
    } finally {
      await session.close();
    }
  });

  test('Direktori Hotel: tarikan menarik ulang daftar hotel', { timeout: 90_000 }, async () => {
    const session = await openDashboard({ path: '/dashboard/hotel' });
    try {
      const { page } = session;
      await session.waitForCall('/api/hotels');
      await session.settle();
      assert.equal(await hasHostClass(page), true);

      const before = session.countOf('/api/hotels');
      assert.ok(before > 0, 'daftar hotel harus sudah dimuat sekali');

      await swipe(page, { dy: PULL_ARMED });
      await page.waitForTimeout(1_500);

      assert.equal(session.countOf('/api/hotels'), before + 1);
    } finally {
      await session.close();
    }
  });

  test('Kelola Agent (admin): tarikan menarik ulang daftar pendaftar', { timeout: 90_000 }, async () => {
    const session = await openDashboard({ path: '/dashboard/agents', agent: { ...AGENT, role: 'admin' } });
    try {
      const { page } = session;
      await session.waitForCall('/api/admin/agents');
      await session.settle();
      assert.equal(await hasHostClass(page), true);

      const before = session.countOf('/api/admin/agents');
      assert.ok(before > 0, 'daftar agent harus sudah dimuat sekali');

      await swipe(page, { dy: PULL_ARMED });
      await page.waitForTimeout(1_500);

      assert.equal(session.countOf('/api/admin/agents'), before + 1);
    } finally {
      await session.close();
    }
  });

  test('Analytics (admin): tarikan menarik ulang bulan yang sedang dipilih', { timeout: 90_000 }, async () => {
    const session = await openDashboard({ path: '/dashboard/analytics', agent: { ...AGENT, role: 'admin' } });
    try {
      const { page } = session;
      await session.waitForCall('/api/analytics/summary');
      await session.settle();
      assert.equal(await hasHostClass(page), true);

      const before = session.calls.filter(item => item === '/api/analytics/summary').length;
      await swipe(page, { dy: PULL_ARMED });
      await page.waitForTimeout(1_500);

      assert.equal(session.calls.filter(item => item === '/api/analytics/summary').length, before + 1);
    } finally {
      await session.close();
    }
  });

  test('halaman tanpa penyegar (Pengaturan) melepas overscroll supaya PTR bawaan Android tetap hidup', { timeout: 90_000 }, async () => {
    const session = await openDashboard({ path: '/dashboard/settings' });
    try {
      const { page } = session;
      await session.waitForCall('/api/laporan/status');
      await session.settle();

      assert.equal(
        await hasHostClass(page),
        false,
        'halaman berisi isian sengaja tidak punya gestur ini; overscroll harus dikembalikan ke browser',
      );

      const callsBefore = session.calls.length;
      await swipe(page, { dy: PULL_ARMED });
      await page.waitForTimeout(1_200);
      assert.equal(session.calls.length, callsBefore, 'tidak ada apa pun yang dimuat ulang di sini');
      assert.equal(
        await page.evaluate(() => document.querySelector('[data-pull-refresh]')?.dataset.phase ?? 'idle'),
        'idle',
      );
    } finally {
      await session.close();
    }
  });
});
