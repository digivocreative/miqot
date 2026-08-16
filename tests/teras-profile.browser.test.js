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
  // Identitas halaman profil bergantung pada /members. `membersDelayMs`
  // menahan responsnya (untuk menguji skeleton), `membersFail` membuatnya
  // gagal seperti di lapangan (jaringan putus / 5xx) — catch-nya diam.
  membersDelayMs = 0,
  membersFail = false,
  agent = makeAgent(),
  // Slugs for which /api/community/feed?agent=<slug> must 404, mirroring
  // the server's real response for an unknown or deleted agent (server.js:
  // `res.status(404).json({ error: 'Agent tidak ditemukan di Teras' })`).
  notFoundSlugs = [],
} = {}) {
  const api = {
    members: clone(members),
    generalPosts: clone(generalPosts),
    profilePosts: clone(profilePosts),
    membersDelayMs,
    membersFail,
    agent: clone(agent),
    notFoundSlugs: [...notFoundSlugs],
    createSequence: 0,
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
      if (api.membersDelayMs) {
        await new Promise(resolve => setTimeout(resolve, api.membersDelayMs));
      }
      if (api.membersFail) {
        await responseJson(route, { success: false, error: 'Gagal memuat anggota' }, 500);
        return;
      }
      await responseJson(route, { success: true, data: clone(api.members) });
      return;
    }

    if (record.method === 'POST' && record.pathname === '/api/community/posts') {
      api.createSequence += 1;
      // Komposer SELALU mengirim `segments[]` (satu elemen untuk kiriman
      // biasa) sejak rekonsiliasi utas, dan server membalas segmen pertama.
      // Membaca `body` dari akar payload — bentuk pra-utas — membuat stub ini
      // membalas kiriman berisi string kosong: kirimannya tetap dirender, cuma
      // tanpa teks, jadi kegagalannya muncul sebagai locator timeout 30 detik
      // di tes yang menunggu teksnya, bukan sebagai galat yang menunjuk ke
      // sini. Bentuk lama tetap diterima sebagai fallback supaya stub ini masih
      // bisa dipakai memalsukan respons gaya lama.
      const parsed = JSON.parse(request.postData() || '{}');
      const segments = Array.isArray(parsed.segments) ? parsed.segments : null;
      const firstSegment = segments?.[0] || parsed;
      // Sengaja TIDAK dimasukkan ke generalPosts: post ini tetap "pending"
      // (belum pernah dikonfirmasi respons feed) persis seperti sesaat setelah
      // membuat kiriman di lapangan.
      const created = makePost({
        id: `created-${api.createSequence}`,
        body: firstSegment.body || '',
        media: clone(firstSegment.media || []),
        photo_url: firstSegment.photo_url || null,
        thread_count: segments ? segments.length : 1,
        created_at: new Date(Date.parse('2026-07-18T09:00:00.000Z') + api.createSequence * 1000).toISOString(),
        author: { name: api.agent.name, slug: api.agent.slug, photo: api.agent.photo },
        is_own: true,
      });
      await responseJson(route, { success: true, data: clone(created) });
      return;
    }

    if (record.method === 'GET' && record.pathname === '/api/community/feed') {
      const agentSlug = url.searchParams.get('agent');
      if (agentSlug) {
        if (api.notFoundSlugs.includes(agentSlug)) {
          await responseJson(route, { error: 'Agent tidak ditemukan di Teras' }, 404);
          return;
        }
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

  test('a just-created post of your own never leaks onto another agent\'s profile (regression: pendingCreatedPostsRef)', { timeout: 45_000 }, async () => {
    const api = createProfileApi({
      members: [
        { slug: 'nila', name: 'Nila Test', photo: null, phone: '628123456789' },
      ],
      generalPosts: [
        makePost({ id: 'mention-post', body: 'halo @nila' }),
      ],
      // Nila belum menulis apa pun — profilnya harus kosong.
      profilePosts: { nila: [] },
    });
    const app = await openApp({ api });
    try {
      // Buat kiriman sendiri. Respons feed umum tidak pernah memuatnya, jadi
      // entri pendingCreatedPostsRef tetap hidup lintas navigasi.
      await app.page.getByRole('button', { name: COMPOSER_TRIGGER, exact: true }).click();
      const dialog = app.page.getByRole('dialog', { name: 'Buat Kiriman' });
      await dialog.waitFor();
      await dialog.getByPlaceholder(COMPOSER_PLACEHOLDER).fill('Kiriman saya sendiri');
      await dialog.getByRole('button', { name: 'Kirim kiriman' }).click();
      await dialog.waitFor({ state: 'detached', timeout: 10_000 });
      await app.page.getByText('Kiriman saya sendiri', { exact: true }).waitFor();

      await app.page.getByRole('link', { name: '@Nila Test', exact: true }).click();
      await app.page.waitForFunction(() => window.location.pathname === '/teras/nila');

      // Profil Nila kosong: empty state profil harus muncul, dan kiriman kita
      // tidak boleh nongol di sana.
      await app.page.getByText('Belum ada kiriman', { exact: true }).waitFor();
      assert.equal(
        await app.page.getByText('Kiriman saya sendiri', { exact: true }).count(),
        0,
        'kiriman pending milik sendiri tidak boleh muncul di profil agent lain',
      );

      // …dan tetap tidak muncul setelah keluar-masuk profil lagi.
      await app.page.goBack();
      await app.page.getByText('Kiriman saya sendiri', { exact: true }).waitFor();
      await app.page.getByRole('link', { name: '@Nila Test', exact: true }).click();
      await app.page.waitForFunction(() => window.location.pathname === '/teras/nila');
      await app.page.getByText('Belum ada kiriman', { exact: true }).waitFor();
      assert.equal(
        await app.page.getByText('Kiriman saya sendiri', { exact: true }).count(),
        0,
        'kiriman pending tetap tidak boleh bocor setelah navigasi berulang',
      );
    } finally {
      await app.close();
    }
  });

  test('profile identity survives a slow or failing /members: skeleton first, then a slug-only header', { timeout: 45_000 }, async () => {
    const api = createProfileApi({
      members: [
        { slug: 'nila', name: 'Nila Test', photo: null, phone: '628123456789' },
      ],
      membersDelayMs: 2000,
      profilePosts: {
        nila: [makePost({
          id: 'nila-post-1',
          body: 'Kiriman milik Nila',
          author: { name: 'Nila Test', slug: 'nila', photo: null },
        })],
      },
    });
    const app = await openApp({ path: '/teras/nila', api, waitForTeras: false });
    try {
      // Selama roster masih jalan: skeleton identitas, bukan header kosong.
      await app.page.locator('[data-teras-profile-header-skeleton]').waitFor({ timeout: 10_000 });
      assert.equal(await app.page.locator('[data-teras-profile-header]').count(), 0);

      // Setelah roster tiba: header asli dengan nama anggota.
      await app.page.locator('[data-teras-profile-header]').waitFor({ timeout: 15_000 });
      await app.page.getByText('Nila Test', { exact: true }).first().waitFor();
      assert.equal(await app.page.locator('[data-teras-profile-header-skeleton]').count(), 0);
    } finally {
      await app.close();
    }
  });

  test('a failing /members still leaves the profile with an identity (slug header + document.title)', { timeout: 45_000 }, async () => {
    const api = createProfileApi({
      membersFail: true,
      profilePosts: {
        nila: [makePost({
          id: 'nila-post-1',
          body: 'Kiriman milik Nila',
          author: { name: 'Nila Test', slug: 'nila', photo: null },
        })],
      },
    });
    const app = await openApp({ path: '/teras/nila', api, waitForTeras: false });
    try {
      const header = app.page.locator('[data-teras-profile-header]');
      await header.waitFor({ timeout: 15_000 });
      assert.match(await header.innerText(), /@nila/);
      assert.equal(
        await app.page.locator('[data-teras-profile-header-skeleton]').count(),
        0,
        'skeleton tidak boleh menggantung selamanya saat roster gagal',
      );
      // Tanpa nomor yang bisa dinormalisasi, tombol WhatsApp disembunyikan.
      assert.equal(await app.page.locator('a[href^="https://wa.me/"]').count(), 0);
      await app.page.waitForFunction(() => document.title === 'nila — Teras', null, { timeout: 10_000 });
    } finally {
      await app.close();
    }
  });

  test('a WhatsApp number stored in raw local form still produces a working wa.me link', { timeout: 45_000 }, async () => {
    const api = createProfileApi({
      members: [
        // Hanya /api/auth/register yang menormalisasi nomor; update profil/admin
        // menyimpan apa adanya, jadi bentuk seperti ini benar-benar ada di DB.
        { slug: 'nila', name: 'Nila Test', photo: null, phone: '0812-3456-7890' },
      ],
      profilePosts: { nila: [] },
    });
    const app = await openApp({ path: '/teras/nila', api, waitForTeras: false });
    try {
      const waLink = app.page.locator('a[href^="https://wa.me/"]');
      await waLink.waitFor({ timeout: 15_000 });
      assert.equal(await waLink.getAttribute('href'), 'https://wa.me/6281234567890');
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

  test('a just-created post shows immediately on your OWN profile even before the scoped feed response catches up (regression: pendingPosts was force-emptied for all profiles, including your own)', { timeout: 45_000 }, async () => {
    const agent = makeAgent({ slug: 'nikita', name: 'Nikita Test' });
    const api = createProfileApi({
      agent,
      // Server hasn't caught up yet: ?agent=nikita still answers empty, just
      // like the real staleness window pendingCreatedPostsRef exists to cover.
      profilePosts: { nikita: [] },
    });
    const app = await openApp({ api, agent });
    try {
      await app.page.getByRole('button', { name: COMPOSER_TRIGGER, exact: true }).click();
      const dialog = app.page.getByRole('dialog', { name: 'Buat Kiriman' });
      await dialog.waitFor();
      await dialog.getByPlaceholder(COMPOSER_PLACEHOLDER).fill('Kiriman langsung di profil sendiri');
      await dialog.getByRole('button', { name: 'Kirim kiriman' }).click();
      await dialog.waitFor({ state: 'detached', timeout: 10_000 });
      await app.page.getByText('Kiriman langsung di profil sendiri', { exact: true }).waitFor();

      // Navigate to our own profile via the post's own author link.
      await app.page.getByRole('link', { name: 'Nikita Test', exact: true }).first().click();
      await app.page.waitForFunction(() => window.location.pathname === '/teras/nikita');

      // The scoped feed (?agent=nikita) came back empty, but the pending post
      // must still render — it must NOT show the "Belum ada kiriman" empty
      // state, and the post body must be visible.
      await app.page.getByText('Kiriman langsung di profil sendiri', { exact: true }).waitFor({ timeout: 10_000 });
      assert.equal(
        await app.page.getByText('Belum ada kiriman', { exact: true }).count(),
        0,
        'profil sendiri tidak boleh menampilkan empty state saat ada kiriman pending',
      );
    } finally {
      await app.close();
    }
  });

  test('an unknown/deleted slug 404s: only the error message shows, no fabricated header or document.title', { timeout: 45_000 }, async () => {
    const api = createProfileApi({
      // No 'members' entry for 'ghost' either — roster genuinely has nobody
      // by that slug, matching an unknown or deleted agent.
      notFoundSlugs: ['ghost'],
    });
    const app = await openApp({ path: '/teras/ghost', api, waitForTeras: false });
    try {
      await app.page.getByText('Agent tidak ditemukan di Teras', { exact: true }).waitFor({ timeout: 15_000 });

      assert.equal(
        await app.page.locator('[data-teras-profile-header]').count(),
        0,
        'header profil fabrikasi (nama/avatar/@slug) tidak boleh dirender saat 404',
      );
      assert.equal(
        await app.page.locator('[data-teras-profile-header-skeleton]').count(),
        0,
        'skeleton identitas tidak boleh menggantung selamanya saat sudah pasti 404',
      );
      assert.notEqual(
        await app.page.evaluate(() => document.title),
        'ghost — Teras',
        'document.title tidak boleh mengarang identitas dari slug saat 404',
      );
    } finally {
      await app.close();
    }
  });
});
