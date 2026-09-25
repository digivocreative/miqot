/**
 * Halaman jadwal layar lebar: membuka/menutup galeri foto hotel di rail kanan
 * TIDAK BOLEH menggeser layout di belakangnya.
 *
 * Galeri (MediaViewerModal) mengunci gulir dengan `overflow: hidden` di <body>.
 * Itu menghapus scrollbar halaman, dan di peramban yang scrollbar-nya memakan
 * lebar — Chrome/Edge/Safari desktop, karena index.css menata `::-webkit-scrollbar`
 * global selebar 6px yang memaksa scrollbar klasik bahkan di macOS; Firefox
 * Windows 17px — viewport melebar sebesar itu. Kolom tengah dan kedua rail
 * (`fixed`, diposisikan dari 50%) ikut bergeser separuhnya: terukur 3px ke
 * kanan saat dibuka, dan 3px kembali ke kiri SESUDAH modal selesai memudar —
 * dua sentakan satu halaman penuh yang terbaca sebagai kedipan. WebKit lebih
 * parah: media query-nya diukur TANPA scrollbar, jadi di viewport 1440 rail kiri
 * ikut melebar 370→400px selama galeri terbuka (−30px, lalu +27px saat tutup).
 *
 * Perbaikannya di src/lib/scrollLock.ts: scrollbar dibiarkan, gulir ditahan
 * lewat event. Tes ini juga memastikan kuncinya tetap bekerja (roda & tombol).
 *
 * Mesinnya WebKit: headless Chromium menyembunyikan scrollbar sama sekali
 * (clientWidth === innerWidth), jadi bug ini tidak pernah muncul di sana.
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

let viteServer;
let browser;
let appOrigin;

function makePackage(index) {
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

function makeApiResponse(count = 20) {
  const aaData = Array.from({ length: count }, (_, i) => makePackage(i));
  return { status: 'ok', iTotalDisplayRecords: aaData.length, aaData };
}

/**
 * Probe sentakan: posisi kiri kartu terbuka + kedua rail dicatat tiap rAF.
 * Elemennya DIPAKU saat mulai, bukan dicari ulang tiap frame.
 */
function installProbe() {
  window.__shift = { running: false, jolts: [] };

  window.__startProbe = (cardId) => {
    const s = window.__shift;
    s.running = true;
    s.jolts = [];
    const targets = {
      card: document.querySelector(`[data-jadwal-id="${cardId}"]`),
      railLeft: document.querySelector('.jadwal-rail--left'),
      railRight: document.querySelector('.jadwal-rail--right'),
    };
    const last = {};
    for (const [name, el] of Object.entries(targets)) last[name] = el.getBoundingClientRect().left;

    const tick = () => {
      if (!s.running) return;
      for (const [name, el] of Object.entries(targets)) {
        if (!el.isConnected) continue;
        const left = el.getBoundingClientRect().left;
        const delta = left - last[name];
        if (Math.abs(delta) > 0.5) {
          s.jolts.push({ name, delta: Math.round(delta * 100) / 100 });
          last[name] = left;
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  window.__stopProbe = () => {
    window.__shift.running = false;
    return window.__shift.jolts;
  };
}

async function openRail() {
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: VIEWPORT });
  const page = await context.newPage();
  const snapshot = makeApiResponse();
  const photo = (n) => `${appOrigin}/__test__/hotel-${n}.png`;

  try {
    await page.addInitScript(({ agents, cacheKey, snapshot }) => {
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
    });
    await page.addInitScript(installProbe);

    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());

      if (url.pathname.startsWith('/__test__/hotel-')) {
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
    await page.waitForSelector('.jadwal-rail--right button[aria-label^="Buka galeri"]', { timeout: 15_000 });
    // Tunggu animasi masuk rail tuntas — sisa translate ±18px terbaca sebagai geseran.
    await page.waitForFunction(
      () => [...document.querySelectorAll('.jadwal-rail')]
        .every((el) => ['none', 'matrix(1, 0, 0, 1, 0, 0)'].includes(getComputedStyle(el).transform)),
      undefined,
      { timeout: 10_000 },
    );
    await page.waitForTimeout(300);

    return { page, cardId, close: () => context.close() };
  } catch (error) {
    await context.close();
    throw error;
  }
}

describe('Jadwal rail — galeri hotel tidak menggeser layout', { concurrency: false }, () => {
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

  test('buka lalu tutup galeri: kartu dan kedua rail diam di tempat', { timeout: 90_000 }, async () => {
    const session = await openRail();
    try {
      const { page, cardId } = session;

      // Prasyarat: scrollbar halaman memang memakan lebar di mesin ini. Tanpanya
      // tes ini lulus hampa — tidak ada yang bisa bergeser.
      const gutter = await page.evaluate(() => window.innerWidth - document.documentElement.clientWidth);
      assert.ok(gutter > 0, `scrollbar halaman tidak memakan lebar (${gutter}px) — tes tidak bermakna`);

      await page.evaluate((id) => window.__startProbe(id), cardId);
      await page.click('.jadwal-rail--right button[aria-label^="Buka galeri"]');
      await page.waitForFunction(() => {
        const dlg = document.querySelector('[role="dialog"][aria-modal="true"]');
        return dlg && getComputedStyle(dlg).opacity === '1';
      }, undefined, { timeout: 10_000 });

      // Kunci gulirnya tetap harus bekerja: roda tetikus di atas galeri tidak
      // boleh menggulir daftar di belakangnya.
      const scrollBefore = await page.evaluate(() => window.scrollY);
      await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => window.scrollY), scrollBefore, 'halaman tergulir di balik galeri');

      // Begitu juga tombol gulir — fokus ada di tombol tutup galeri.
      for (const key of ['PageDown', 'ArrowDown', 'End']) {
        await page.keyboard.press(key);
      }
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => window.scrollY), scrollBefore, 'tombol gulir menggulir halaman di balik galeri');

      await page.click('[data-media-viewer-close]');
      await page.waitForFunction(
        () => !document.querySelector('[role="dialog"][aria-modal="true"]'),
        undefined,
        { timeout: 10_000 },
      );
      await page.waitForTimeout(600);

      const jolts = await page.evaluate(() => window.__stopProbe());
      assert.deepEqual(jolts, [], `layout bergeser saat galeri dibuka/ditutup: ${JSON.stringify(jolts)}`);
    } finally {
      await session.close();
    }
  });
});
