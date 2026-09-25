/**
 * Halaman jadwal layar lebar: Escape hanya menutup lapisan PALING ATAS.
 *
 * App memasang pintasan Escape di `window` untuk menutup kartu terbuka beserta
 * kedua rail-nya. Overlay yang dibuka di atas kartu/rail (galeri foto hotel,
 * dropdown filter, sheet Filter, modal brosur, …) juga bereaksi pada Escape —
 * atau tidak sama sekali — dan listener `document` mereka berjalan lebih dulu.
 * Tanpa penjaga di App, satu Escape menutup overlay DAN kartu di belakangnya:
 * begitu overlay hilang, agent mendapati paket yang sedang dijelaskan sudah
 * tertutup.
 *
 * Tes dasar (tanpa overlay) memastikan pintasannya sendiri tetap hidup.
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { webkit } from 'playwright';
import { createServer } from 'vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const AGENT_SLUG = 'nikita';
const YEAR_CODE = '1448';
const VIEWPORT = { width: 1440, height: 900 };

// PNG 1×1 — foto hotel harus benar-benar termuat; <img> yang gagal membuat
// tombol galerinya lenyap (HotelBlock onError).
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const RAIL_RIGHT = '.jadwal-rail--right';
const GALLERY_BUTTON = `${RAIL_RIGHT} button[aria-label^="Buka galeri"]`;
const MODAL_DIALOG = '[role="dialog"][aria-modal="true"]';
const AGENT_SESSION = {
  token: 'uji-token',
  user: { slug: AGENT_SLUG, name: 'Nikita Test', role: 'agent' },
};
// Bentuk minimum yang lolos validasi requestPackageValue — dropdown Gaya desain
// baru tampil setelah ada hasil.
const PACKAGE_VALUE_RESULT = {
  headline: 'Dekat Masjid Nabawi',
  summary: '',
  advantages: [{
    title: 'Hotel dekat', description: 'Jalan kaki ke Nabawi', source: 'brosur', sourceRef: 'hal. 1',
  }],
  bestFor: [],
  bannerPrompt: 'Banner umrah hijau emas',
};

let viteServer;
let browser;
let appOrigin;

function makePackage(index, brosurUrl) {
  const day = String((index % 27) + 1).padStart(2, '0');
  const month = String((index % 11) + 1).padStart(2, '0');
  return {
    jadwal_id: `JBU${9000 + index}`,
    jadwal_nama: `UMRAH RAHMAH ${index + 1} 9HR`,
    promo: '0',
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
    brosur: brosurUrl,
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

function makeApiResponse(brosurUrl, count = 20) {
  const aaData = Array.from({ length: count }, (_, i) => makePackage(i, brosurUrl));
  return { status: 'ok', iTotalDisplayRecords: aaData.length, aaData };
}

/**
 * `session` = sesi agent login: alat AI brosur (Caption AI, Nilai Plus Paket)
 * hanya ditawarkan kepadanya. `brosur` = paketnya punya brosur.
 */
async function openRail({ session = null, brosur = false } = {}) {
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: VIEWPORT });
  const page = await context.newPage();
  const snapshot = makeApiResponse(brosur ? `${appOrigin}/__test__/brosur.png` : '');
  const photo = (n) => `${appOrigin}/__test__/hotel-${n}.png`;

  try {
    await page.addInitScript(({ agents, cacheKey, snapshot, session }) => {
      if (session) window.localStorage.setItem('auth_session', JSON.stringify(session));
      window.localStorage.setItem('agents_cache', JSON.stringify(agents));
      window.localStorage.setItem(cacheKey, JSON.stringify({
        timestamp: Date.now(),
        apiResponse: snapshot,
      }));
    }, {
      agents: {
        [AGENT_SLUG]: {
          name: 'Nikita Test', website: 'alhijaz.test',
          phone: '628123456789', photo: '',
        },
      },
      cacheKey: `umroh_packages_cache_v2_${YEAR_CODE}`,
      snapshot,
      session,
    });

    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());

      if (url.pathname.startsWith('/__test__/')) {
        return route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL_PNG });
      }
      if (url.pathname === '/api/hotels/public') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [{
              name: 'Al Ritz Al Madinah',
              city: 'Madinah',
              stars: 4,
              area: 'Markaziyah Utara',
              cover: photo(1),
              photos: [photo(1), photo(2), photo(3)],
            }],
          }),
        });
      }
      if (url.pathname === '/api/package-value') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ result: PACKAGE_VALUE_RESULT }),
        });
      }
      if (url.pathname.startsWith('/api/schedules/')) {
        return route.fulfill({
          status: 200, contentType: 'application/json', body: JSON.stringify(snapshot),
        });
      }
      if (url.pathname.startsWith('/api/')) {
        return route.fulfill({
          status: 200, contentType: 'application/json', body: '{"success":true}',
        });
      }
      // Cocokkan per origin, jangan per substring: modul aplikasi sendiri
      // (mis. /src/lib/supabase.ts) disajikan dev server apa adanya.
      if (url.origin !== appOrigin) return route.abort();
      return route.continue();
    });

    await page.goto(`${appOrigin}/${AGENT_SLUG}`, {
      waitUntil: 'domcontentloaded', timeout: 30_000,
    });
    await page.waitForFunction(
      () => document.querySelectorAll('[data-jadwal-id]').length > 5,
      undefined,
      { timeout: 30_000 },
    );

    const cardId = await page.$eval('[data-jadwal-id]', (el) => el.getAttribute('data-jadwal-id'));
    await page.click(`[data-jadwal-id="${cardId}"]`, { position: { x: 60, y: 30 } });
    await page.waitForSelector(GALLERY_BUTTON, { timeout: 15_000 });

    return { page, close: () => context.close() };
  } catch (error) {
    await context.close();
    throw error;
  }
}

/**
 * Rail keluar lewat AnimatePresence, jadi "masih ada" baru bermakna setelah
 * jeda yang melewati animasi keluarnya.
 */
async function assertRailStaysOpen(page, reason) {
  await page.waitForTimeout(800);
  assert.ok(await page.$(RAIL_RIGHT), `rail kanan ikut tertutup — ${reason}`);
}

const overlayToken = () => window.history.state?.__overlay ?? null;

/**
 * Brosur → AI Tools → alat AI. Brosur menutup diri lalu alatnya terbuka dalam
 * satu klik; entri riwayat alat itu baru ditambahkan setelah traversal milik
 * brosur selesai (overlayHistory), jadi tunggu token riwayat BARU — bukan jeda.
 */
async function openBrochureAiTool(page, label) {
  const preview = page.locator('img[alt="Brosur paket"]').first();
  await preview.waitFor({ state: 'visible', timeout: 15_000 });
  await preview.click();
  await page.waitForFunction(overlayToken, undefined, { timeout: 10_000 });
  const brochureToken = await page.evaluate(overlayToken);

  await page.getByRole('button', { name: 'AI Tools' }).click();
  await page.getByRole('menuitem', { name: new RegExp(label) }).click();
  await page.waitForFunction(
    (previous) => {
      const token = window.history.state?.__overlay;
      return Boolean(token) && token !== previous;
    },
    brochureToken,
    { timeout: 10_000 },
  );
}

describe('Jadwal rail — Escape hanya menutup lapisan teratas', { concurrency: false }, () => {
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

  test('tanpa overlay: Escape tetap menutup kartu dan rail', { timeout: 90_000 }, async () => {
    const rail = await openRail();
    try {
      const { page } = rail;
      await page.keyboard.press('Escape');
      await page.waitForSelector(RAIL_RIGHT, { state: 'detached', timeout: 10_000 });
    } finally {
      await rail.close();
    }
  });

  test('galeri hotel: Escape menutup galeri saja', { timeout: 90_000 }, async () => {
    const rail = await openRail();
    try {
      const { page } = rail;
      await page.click(GALLERY_BUTTON);
      await page.waitForSelector(MODAL_DIALOG, { timeout: 10_000 });

      await page.keyboard.press('Escape');
      await page.waitForSelector(MODAL_DIALOG, { state: 'detached', timeout: 10_000 });
      await assertRailStaysOpen(page, 'Escape di galeri');
    } finally {
      await rail.close();
    }
  });

  test('dropdown filter: Escape menutup dropdown saja', { timeout: 90_000 }, async () => {
    const rail = await openRail();
    try {
      const { page } = rail;
      const trigger = 'button[aria-label="Filter paket"]';
      await page.click(trigger);
      await page.waitForSelector(`${trigger}[aria-expanded="true"]`, { timeout: 10_000 });

      await page.keyboard.press('Escape');
      await page.waitForSelector(`${trigger}[aria-expanded="false"]`, { timeout: 10_000 });
      await assertRailStaysOpen(page, 'Escape di dropdown filter');
    } finally {
      await rail.close();
    }
  });

  test('sheet Filter (tidak menangani Escape): kartu di belakangnya tetap terbuka', { timeout: 90_000 }, async () => {
    const rail = await openRail();
    try {
      const { page } = rail;
      await page.click('button[aria-label="Filter"]');
      await page.waitForSelector('#filter-sort-heading', { timeout: 10_000 });
      // Entri riwayat overlay ditambahkan satu tick setelah terbuka (overlayHistory).
      await page.waitForTimeout(100);

      await page.keyboard.press('Escape');
      await assertRailStaysOpen(page, 'Escape di sheet Filter');
    } finally {
      await rail.close();
    }
  });

  test('Caption AI (tidak menangani Escape): kartu tetap terbuka, back menutup modalnya', { timeout: 90_000 }, async () => {
    const rail = await openRail({ session: AGENT_SESSION, brosur: true });
    try {
      const { page } = rail;
      await openBrochureAiTool(page, 'Caption AI');
      const title = page.getByRole('heading', { name: 'Caption AI' });
      await title.waitFor({ timeout: 10_000 });

      await page.keyboard.press('Escape');
      await assertRailStaysOpen(page, 'Escape di Caption AI');

      await page.evaluate(() => window.history.back());
      await title.waitFor({ state: 'detached', timeout: 10_000 });
      await assertRailStaysOpen(page, 'back di Caption AI');
    } finally {
      await rail.close();
    }
  });

  test('Nilai Plus Paket: Escape menutup modal saja', { timeout: 90_000 }, async () => {
    const rail = await openRail({ session: AGENT_SESSION, brosur: true });
    try {
      const { page } = rail;
      await openBrochureAiTool(page, 'Nilai Plus Paket');
      await page.waitForSelector('#package-value-title', { timeout: 10_000 });

      await page.keyboard.press('Escape');
      await page.waitForSelector('#package-value-title', { state: 'detached', timeout: 10_000 });
      await assertRailStaysOpen(page, 'Escape di Nilai Plus Paket');
    } finally {
      await rail.close();
    }
  });

  test('dropdown di dalam Nilai Plus Paket: Escape menutup dropdown saja', { timeout: 90_000 }, async () => {
    const rail = await openRail({ session: AGENT_SESSION, brosur: true });
    try {
      const { page } = rail;
      await openBrochureAiTool(page, 'Nilai Plus Paket');
      await page.getByRole('button', { name: 'Analisis Nilai Plus' }).click();
      const trigger = 'button[aria-label="Gaya desain banner nilai plus"]';
      await page.click(trigger, { timeout: 10_000 });
      await page.waitForSelector(`${trigger}[aria-expanded="true"]`, { timeout: 10_000 });

      await page.keyboard.press('Escape');
      await page.waitForSelector(`${trigger}[aria-expanded="false"]`, { timeout: 10_000 });
      await page.waitForTimeout(500);
      assert.ok(await page.$('#package-value-title'), 'modal Nilai Plus Paket ikut tertutup');
      await assertRailStaysOpen(page, 'Escape di dropdown Nilai Plus Paket');
    } finally {
      await rail.close();
    }
  });
});
