/**
 * Halaman jadwal publik saat jaringan/server bermasalah, dan riwayat back —
 * audit PWA 2026-09-17. Yang dijaga di sini PERILAKU, di mesin iOS (WebKit):
 *
 * 1. Galat muat tidak pernah tampil mentah ("HTTP error! status: 503").
 * 2. Data tersimpan yang basi + refresh gagal → pita "data tersimpan" (kursi &
 *    harga bisa sudah berubah), hilang begitu refresh berhasil. Pita yang muncul
 *    saat pengguna membaca di tengah daftar tidak boleh menggeser kartunya.
 * 3. Link Detail Paket yang dibuka dengan sinyal buruk → "gagal muat", BUKAN
 *    "Paket tidak ditemukan".
 * 4. Sheet Filter ditutup oleh back; filter yang dipilih di dalamnya tetap di URL,
 *    dan menutup lewat tombol tidak meninggalkan entri riwayat "kosong".
 * 5. Tombol Kembali Detail Paket: dari dalam app = mundur; dari link = replace —
 *    back berikutnya tidak memantul ke halaman yang baru ditinggal.
 *
 * Kait DOM memakai data-atribut, bukan teks UI (copy boleh berubah).
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { webkit } from 'playwright';
import { createServer } from 'vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const AGENT_SLUG = 'nikita';
const YEAR_CODE = '1448';
const VIEWPORT = { width: 390, height: 812 };
const MINUTE = 60 * 1000;
// Halaman awal lintas-origin: goBack() yang "keluar" dari app mendarat di sini.
const START_URL = 'data:text/html,<title>start</title>';

let viteServer;
let browser;
let appOrigin;

function makePackage(index) {
  const day = String((index % 27) + 1).padStart(2, '0');
  const month = String((index % 11) + 1).padStart(2, '0');
  return {
    jadwal_id: `JBU${9000 + index}`,
    jadwal_nama: `UMRAH RAHMAH ${index + 1} 9HR`,
    promo: index % 3 === 0 ? '1' : '0',
    seat_total: '45',
    seat_sisa: '12',
    maskapai: 'SAUDIA',
    berangkat_tgl: `2027-${month}-${day}`,
    berangkat_jam: '10.25',
    berangkat_rute: 'CGK - JED',
    berangkat_kode_penerbangan: 'SV 827',
    pulang_tgl: `2027-${month}-${day}`,
    pulang_jam: '16.00',
    pulang_rute: 'JED - CGK',
    pulang_kode_penerbangan: 'SV 818',
    manasik_tgl: `2027-${month}-${day}`,
    manasik_jam: '08:00:00',
    brosur: '',
    itinerary: '',
    perlengkapan_harga: '0',
    paket_harga: {
      RAHMAH: {
        Quard: '33900000', Triple: '35700000', Double: '38700000',
        Single: '49900000', Infant: '13900000',
      },
    },
    paket_hotel: { RAHMAH: { mekkah: 'ANJUM', madinah: 'AL RITZ AL MADINAH' } },
    journey_order: ['Madinah', 'Umroh'],
    journey_order_source: 'itinerary',
  };
}

function makeApiResponse(count = 30) {
  const aaData = Array.from({ length: count }, (_, i) => makePackage(i));
  return { status: 'ok', iTotalDisplayRecords: aaData.length, aaData };
}

const ok = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
const unavailable = () => ({ status: 503, contentType: 'text/html', body: '<html><body>Service Unavailable</body></html>' });

/** Probe sentakan — sama dengan tests/jadwal-refresh-scroll-anchor.browser.test.js. */
function installProbe() {
  window.__jank = { jolts: [], running: false, pinnedId: null };
  window.__startProbe = () => {
    const j = window.__jank;
    j.running = true; j.jolts = []; j.pinnedId = null;
    let lastTop = null;
    for (const card of document.querySelectorAll('[data-jadwal-id]')) {
      const rect = card.getBoundingClientRect();
      if (rect.bottom > 0) { j.pinnedId = card.getAttribute('data-jadwal-id'); lastTop = rect.top; break; }
    }
    const tick = () => {
      if (!j.running) return;
      const el = document.querySelector(`[data-jadwal-id="${j.pinnedId}"]`);
      if (el) {
        const top = el.getBoundingClientRect().top;
        if (Math.abs(top - lastTop) > 0.5) { j.jolts.push(Math.round((top - lastTop) * 100) / 100); lastTop = top; }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  window.__stopProbe = () => { window.__jank.running = false; return window.__jank; };
}

/**
 * Konteks baru dengan cache paket (opsional) dan /api/schedules yang dijawab
 * `session.schedules` — bisa diganti di tengah tes (server pulih).
 */
async function openSession({ cached = null, cacheAgeMs = 0, hideNavigationApi = false } = {}) {
  const context = await browser.newContext({
    serviceWorkers: 'block', viewport: VIEWPORT, hasTouch: true, isMobile: true,
  });
  const page = await context.newPage();
  if (hideNavigationApi) {
    // Safari/iOS sebelum Navigation API: keputusan jatuh ke referrer + history.length.
    await page.addInitScript(() => {
      Object.defineProperty(window, 'navigation', { value: undefined, configurable: true });
    });
  }
  const session = {
    page,
    hits: 0,
    schedules: async () => ok(makeApiResponse()),
    close: () => context.close(),
  };

  await page.addInitScript(({ agents, cacheKey, snapshot, ageMs }) => {
    try {
      window.localStorage.setItem('agents_cache', JSON.stringify(agents));
      // Coach mark tombol mata tidak ikut campur (bisa menutupi baris tombol header).
      window.localStorage.setItem('jadwal-availability-hint-v1', '1');
      // Hanya muat PERTAMA yang diberi cache — muat ulang/pindah halaman berikutnya
      // melihat apa pun yang ditulis app sendiri.
      if (snapshot && !window.sessionStorage.getItem('__seeded')) {
        window.sessionStorage.setItem('__seeded', '1');
        window.localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now() - ageMs, apiResponse: snapshot }));
      }
    } catch {
      // data: URL (START_URL) tidak punya storage.
    }
  }, {
    agents: { [AGENT_SLUG]: { name: 'Nikita Test', website: 'alhijaz.test', phone: '628123456789', photo: '' } },
    cacheKey: `umroh_packages_cache_v2_${YEAR_CODE}`,
    snapshot: cached,
    ageMs: cacheAgeMs,
  });
  await page.addInitScript(installProbe);

  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === 'data:') return route.continue();
    if (url.pathname.startsWith('/api/schedules/')) {
      session.hits += 1;
      return route.fulfill(await session.schedules());
    }
    if (url.pathname.startsWith('/api/')) {
      return route.fulfill(ok({ success: true }));
    }
    // Host luar diputus per origin (bukan substring — lihat tes anchor).
    if (url.origin !== appOrigin) return route.abort();
    return route.continue();
  });

  return session;
}

async function gotoApp(page, path) {
  await page.goto(`${appOrigin}${path}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
}

async function waitForHits(session, n, timeout = 15_000) {
  const started = Date.now();
  while (session.hits < n) {
    if (Date.now() - started > timeout) throw new Error(`/api/schedules baru ${session.hits}x, ditunggu ${n}x`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

const cardCount = (page) => page.evaluate(() => document.querySelectorAll('[data-jadwal-id]').length);
const waitForCards = (page) => page.waitForFunction(
  () => document.querySelectorAll('[data-jadwal-id]').length > 10, undefined, { timeout: 30_000 },
);
const RAW_ERROR = /HTTP error|status:\s*\d{3}|aborted/i;

describe('Jadwal — gagal muat, data tersimpan, dan riwayat back', { concurrency: false }, () => {
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

  test('tanpa cache + server 503 → galat ramah, bukan teks mentah', { timeout: 90_000 }, async () => {
    const session = await openSession();
    session.schedules = async () => unavailable();
    try {
      const { page } = session;
      await gotoApp(page, `/${AGENT_SLUG}`);
      const errorBox = page.locator('[data-load-error]');
      await errorBox.waitFor({ state: 'visible', timeout: 30_000 });
      const text = await errorBox.innerText();
      assert.doesNotMatch(text, RAW_ERROR, `galat mentah bocor: ${text}`);

      // Pulih → "Coba Lagi" memuat daftar.
      session.schedules = async () => ok(makeApiResponse());
      await errorBox.locator('button').click();
      await waitForCards(page);
      assert.equal(await page.locator('[data-load-error]').count(), 0);
    } finally {
      await session.close();
    }
  });

  test('data tersimpan BASI + refresh gagal → pita; Coba lagi yang berhasil menghapusnya', { timeout: 90_000 }, async () => {
    const session = await openSession({ cached: makeApiResponse(), cacheAgeMs: 120 * MINUTE });
    session.schedules = async () => unavailable();
    try {
      const { page } = session;
      await gotoApp(page, `/${AGENT_SLUG}`);
      await waitForCards(page);
      const notice = page.locator('[data-stale-data-notice]');
      await notice.waitFor({ state: 'visible', timeout: 15_000 });
      assert.equal(session.hits, 1, 'revalidasi latar harus menembak sekali');
      assert.doesNotMatch(await notice.innerText(), RAW_ERROR);

      // Di puncak halaman pitanya harus TERLIHAT (tidak digulir ke balik header).
      const geometry = await page.evaluate(() => ({
        top: document.querySelector('[data-stale-data-notice]').getBoundingClientRect().top,
        headerBottom: document.querySelector('header').getBoundingClientRect().bottom,
        scrollY: window.scrollY,
      }));
      assert.equal(geometry.scrollY, 0);
      assert.ok(geometry.top >= geometry.headerBottom, `pita tertutup header: ${JSON.stringify(geometry)}`);

      session.schedules = async () => ok(makeApiResponse());
      await notice.locator('button').click();
      await notice.waitFor({ state: 'detached', timeout: 15_000 });
      assert.equal(session.hits, 2);
    } finally {
      await session.close();
    }
  });

  test('data tersimpan masih SEGAR + refresh gagal → tanpa pita', { timeout: 90_000 }, async () => {
    const session = await openSession({ cached: makeApiResponse(), cacheAgeMs: 5 * MINUTE });
    session.schedules = async () => unavailable();
    try {
      const { page } = session;
      await gotoApp(page, `/${AGENT_SLUG}`);
      await waitForCards(page);
      await waitForHits(session, 1);
      await page.waitForTimeout(800); // revalidasi gagal sudah diproses
      assert.equal(session.hits, 1);
      assert.equal(await page.locator('[data-stale-data-notice]').count(), 0);
    } finally {
      await session.close();
    }
  });

  test('pita yang muncul saat membaca di tengah daftar tidak menggeser kartu', { timeout: 90_000 }, async () => {
    const session = await openSession({ cached: makeApiResponse(), cacheAgeMs: 120 * MINUTE });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    session.schedules = async () => { await gate; return unavailable(); };
    try {
      const { page } = session;
      await gotoApp(page, `/${AGENT_SLUG}`);
      await waitForCards(page);
      await page.evaluate(() => window.scrollTo(0, 1500));
      await page.waitForTimeout(400);
      const before = await cardCount(page);
      const scrollBefore = await page.evaluate(() => window.scrollY);

      await page.evaluate(() => window.__startProbe());
      release();
      await page.locator('[data-stale-data-notice]').waitFor({ state: 'attached', timeout: 15_000 });
      await page.waitForTimeout(500);
      const probe = await page.evaluate(() => window.__stopProbe());

      assert.equal(await cardCount(page), before);
      // Pitanya benar-benar menyisip DI ATAS dan dikompensasi — tanpa ini "0 sentakan"
      // bisa berarti pitanya tidak pernah muncul.
      const corrected = (await page.evaluate(() => window.scrollY)) - scrollBefore;
      assert.ok(corrected > 20, `scroll harus dikoreksi setinggi pita, terkoreksi ${corrected}px`);
      assert.deepEqual(probe.jolts, [], `kartu ${probe.pinnedId} bergeser: ${JSON.stringify(probe.jolts)}`);
    } finally {
      await session.close();
    }
  });

  test('Detail Paket dari link: tak ada di data tersimpan + server gagal → gagal muat, bukan "tidak ditemukan"', { timeout: 90_000 }, async () => {
    const session = await openSession({ cached: makeApiResponse(30), cacheAgeMs: 120 * MINUTE });
    session.schedules = async () => unavailable();
    try {
      const { page } = session;
      await gotoApp(page, `/${AGENT_SLUG}/JBU9040`);
      const failure = page.locator('[data-load-error]');
      await failure.waitFor({ state: 'visible', timeout: 30_000 });
      assert.equal(await page.locator('[data-not-found]').count(), 0);
      assert.doesNotMatch(await failure.innerText(), RAW_ERROR);

      // Server pulih, paketnya memang ada → kartunya tampil.
      session.schedules = async () => ok(makeApiResponse(41));
      await failure.locator('button').click();
      await page.locator('[data-jadwal-id="JBU9040"]').first().waitFor({ state: 'visible', timeout: 15_000 });
      assert.equal(await page.locator('[data-load-error]').count(), 0);
    } finally {
      await session.close();
    }
  });

  test('Detail Paket: server sehat dan paketnya memang tak ada → "tidak ditemukan"', { timeout: 90_000 }, async () => {
    const session = await openSession({ cached: makeApiResponse(30), cacheAgeMs: 120 * MINUTE });
    session.schedules = async () => ok(makeApiResponse(30));
    try {
      const { page } = session;
      await gotoApp(page, `/${AGENT_SLUG}/JBU9040`);
      await page.locator('[data-not-found]').waitFor({ state: 'visible', timeout: 30_000 });
      assert.equal(session.hits, 1, 'vonis "tidak ditemukan" baru setelah data server tiba');
      assert.equal(await page.locator('[data-load-error]').count(), 0);
    } finally {
      await session.close();
    }
  });

  test('sheet Filter: back menutupnya, filter tetap di URL, tutup lewat tombol tanpa entri kosong', { timeout: 90_000 }, async () => {
    const session = await openSession({ cached: makeApiResponse(), cacheAgeMs: 0 });
    try {
      const { page } = session;
      await page.goto(START_URL);
      await gotoApp(page, `/${AGENT_SLUG}`);
      await waitForCards(page);

      const promo = page.locator('[data-quick-filter="promo"]');
      const openSheet = async () => {
        await page.locator('button[aria-label="Filter"]').click();
        await promo.waitFor({ state: 'visible' });
        // useBackToClose mendorong entrinya satu tick setelah terbuka.
        await page.waitForFunction(() => window.history.state && '__overlay' in window.history.state);
      };

      // (a) Back menutup sheet — filter yang dipilih di dalamnya tetap di URL.
      await openSheet();
      await promo.click();
      await page.waitForFunction(() => new URLSearchParams(window.location.search).has('promo'));
      await page.evaluate(() => window.history.back());
      await promo.waitFor({ state: 'detached', timeout: 10_000 });
      await page.waitForFunction(() => new URLSearchParams(window.location.search).has('promo'), undefined, { timeout: 5_000 });
      assert.match(new URL(page.url()).pathname, new RegExp(`^/${AGENT_SLUG}`));

      // (b) Tutup lewat tombol setelah mengubah filter: entri sheet ikut dibuang.
      await openSheet();
      await promo.click(); // promo mati lagi
      await page.waitForFunction(() => !new URLSearchParams(window.location.search).has('promo'));
      await page.locator('button[aria-label="Tutup"]').first().click();
      await promo.waitFor({ state: 'detached', timeout: 10_000 });
      await page.waitForFunction(() => !(window.history.state && '__overlay' in window.history.state), undefined, { timeout: 5_000 });
      assert.equal(new URLSearchParams(new URL(page.url()).search).has('promo'), false, 'URL mundur ke filter lama');

      // Back berikutnya keluar dari halaman jadwal — bukan "kosong" di tempat.
      await page.goBack({ timeout: 10_000 }).catch(() => null);
      await page.waitForURL((url) => url.protocol === 'data:', { timeout: 10_000 });
    } finally {
      await session.close();
    }
  });

  for (const hideNavigationApi of [false, true]) {
    const variant = hideNavigationApi ? 'tanpa Navigation API' : 'dengan Navigation API';
    test(`Kembali di Detail Paket (${variant}): dari dalam app mundur, dari link mengganti — tanpa memantul`, { timeout: 90_000 }, async () => {
      const session = await openSession({ cached: makeApiResponse(), cacheAgeMs: 0, hideNavigationApi });
      try {
        const { page } = session;
        const back = page.locator('button[aria-label="Kembali"]');

        // (a) Dibuka dari daftar di tab yang sama.
        await page.goto(START_URL);
        await gotoApp(page, `/${AGENT_SLUG}`);
        await waitForCards(page);
        assert.equal(
          await page.evaluate(() => typeof window.navigation?.canGoBack === 'boolean'),
          !hideNavigationApi,
          'varian Navigation API tidak seperti yang diminta',
        );
        await Promise.all([
          page.waitForURL(`**/${AGENT_SLUG}/JBU9005`),
          page.evaluate((path) => { window.location.href = path; }, `/${AGENT_SLUG}/JBU9005`),
        ]);
        await back.waitFor({ state: 'visible', timeout: 30_000 });
        const lengthOnDetail = await page.evaluate(() => window.history.length);
        await Promise.all([page.waitForURL(`${appOrigin}/${AGENT_SLUG}`), back.click()]);
        await waitForCards(page);
        assert.equal(await page.evaluate(() => window.history.length), lengthOnDetail, 'Kembali menumpuk entri baru');
        await page.goBack({ timeout: 10_000 }).catch(() => null);
        await page.waitForURL((url) => url.protocol === 'data:', { timeout: 10_000 });

        // (b) Dibuka langsung dari link (tanpa riwayat app).
        await gotoApp(page, `/${AGENT_SLUG}/JBU9005`);
        await back.waitFor({ state: 'visible', timeout: 30_000 });
        await Promise.all([page.waitForURL(`${appOrigin}/${AGENT_SLUG}`), back.click()]);
        await waitForCards(page);
        await page.goBack({ timeout: 10_000 }).catch(() => null);
        await page.waitForURL((url) => url.protocol === 'data:', { timeout: 10_000 });
      } finally {
        await session.close();
      }
    });
  }
});
