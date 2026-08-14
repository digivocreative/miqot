/**
 * Halaman jadwal publik: refresh latar TIDAK BOLEH menggeser kartu yang sedang
 * dibaca.
 *
 * Refresh latar (revalidasi cache + interval 30 menit) menukar seluruh array
 * packages. Kalau data segar menjatuhkan paket yang posisinya di atas viewport —
 * kursinya habis, jadi tersaring keluar mode bawaan AVAILABLE — semua kartu di
 * bawahnya naik setinggi kartu itu. Sebelum kompensasi anchor: terukur -524px
 * (dua kartu) tepat saat pengguna mulai menggulir.
 *
 * Mesinnya WebKit, bukan Chromium: iOS Safari belum punya scroll anchoring sama
 * sekali (`overflow-anchor` baru di Safari 27), dan daftarnya sendiri memang
 * memakai `[overflow-anchor:none]` — jadi tidak ada jaring pengaman bawaan.
 *
 * Metrik "sentakan terasa": jangkar = kartu pertama yang rect.bottom > 0 saat
 * probe mulai, lalu DIPAKU per id dan diikuti tiap rAF. Memaku itu penting —
 * memilih ulang "kartu teratas yang kelihatan" tiap frame justru memberi 0 palsu
 * untuk bug ini, karena pergeseran yang cukup besar mengganti kartu teratas dan
 * pemilihan ulang menelan sentakannya.
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { webkit } from 'playwright';
import { createServer } from 'vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const AGENT_SLUG = 'nikita';
const YEAR_CODE = '1448';
const VIEWPORT = { width: 390, height: 812 }; // iPhone 14/15
const SCROLL_Y = 1500;

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

function makeApiResponse(count = 30) {
  const aaData = Array.from({ length: count }, (_, i) => makePackage(i));
  return { status: 'ok', iTotalDisplayRecords: aaData.length, aaData };
}

/** Salinan dengan `soldOutIds` kursinya nol — meniru kursi terjual sejak snapshot. */
function withSoldOut(response, soldOutIds) {
  return {
    ...response,
    aaData: response.aaData.map(row => (
      soldOutIds.includes(row.jadwal_id) ? { ...row, seat_sisa: '0' } : row
    )),
  };
}

/**
 * Probe sentakan. Dipasang lewat addInitScript supaya sudah ada sebelum app
 * jalan; baru mulai mencatat ketika __startProbe() dipanggil.
 */
function installProbe() {
  window.__jank = { jolts: [], running: false, pinnedId: null, removed: false };

  window.__startProbe = () => {
    const j = window.__jank;
    j.running = true; j.jolts = []; j.removed = false; j.pinnedId = null;
    let lastTop = null;

    for (const card of document.querySelectorAll('[data-jadwal-id]')) {
      const rect = card.getBoundingClientRect();
      if (rect.bottom > 0) {
        j.pinnedId = card.getAttribute('data-jadwal-id');
        lastTop = rect.top;
        break;
      }
    }

    const tick = () => {
      if (!j.running) return;
      const el = document.querySelector(`[data-jadwal-id="${j.pinnedId}"]`);
      if (!el) {
        if (!j.removed) {
          j.removed = true;
          j.jolts.push({ kind: 'anchor-removed', delta: 0 });
        }
      } else {
        const top = el.getBoundingClientRect().top;
        const delta = top - lastTop;
        if (Math.abs(delta) > 0.5) {
          j.jolts.push({ kind: 'shift', delta: Math.round(delta * 100) / 100 });
          lastTop = top;
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  window.__stopProbe = () => {
    window.__jank.running = false;
    return { pinnedId: window.__jank.pinnedId, jolts: window.__jank.jolts };
  };
}

/**
 * Buka halaman jadwal dengan cache paket sudah terisi `cached`, dan tahan
 * respons /api/schedules sampai `release()` dipanggil — supaya swap-nya mendarat
 * di saat yang kita tentukan, bukan balapan dengan paint pertama.
 */
async function openJadwal({ cached, fresh }) {
  const context = await browser.newContext({
    serviceWorkers: 'block',
    viewport: VIEWPORT,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();

  let releaseFn;
  const gate = new Promise(resolve => { releaseFn = resolve; });
  let schedulesHits = 0;

  try {
    await page.addInitScript(({ agents, cacheKey, snapshot }) => {
      window.localStorage.setItem('agents_cache', JSON.stringify(agents));
      window.localStorage.setItem(cacheKey, JSON.stringify({
        timestamp: Date.now(), // cache SEGAR — inilah kunjungan yang paling umum
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
      snapshot: cached,
    });
    await page.addInitScript(installProbe);

    await page.route('**/*', async route => {
      const url = new URL(route.request().url());

      if (url.pathname.startsWith('/api/schedules/')) {
        schedulesHits += 1;
        await gate;
        return route.fulfill({
          status: 200, contentType: 'application/json', body: JSON.stringify(fresh),
        });
      }
      if (url.pathname.startsWith('/api/')) {
        return route.fulfill({
          status: 200, contentType: 'application/json', body: '{"success":true}',
        });
      }
      // Cuma host LUAR yang diputus. Cocokkan per origin, jangan per substring:
      // di dev server modul aplikasinya sendiri disajikan apa adanya, jadi
      // /src/lib/supabase.ts ikut kena pola "supabase" dan app-nya tak pernah boot.
      if (url.origin !== appOrigin) return route.abort();
      return route.continue();
    });

    await page.goto(`${appOrigin}/${AGENT_SLUG}`, {
      waitUntil: 'domcontentloaded', timeout: 30_000,
    });
    await page.waitForFunction(
      () => document.querySelectorAll('[data-jadwal-id]').length > 10,
      undefined,
      { timeout: 30_000 },
    );
  } catch (error) {
    await context.close();
    throw error;
  }

  return {
    page,
    release: () => releaseFn(),
    schedulesHits: () => schedulesHits,
    close: () => context.close(),
  };
}

const cardCount = page => page.evaluate(() => document.querySelectorAll('[data-jadwal-id]').length);
const scrollY = page => page.evaluate(() => Math.round(window.scrollY));

describe('Jadwal — refresh latar tidak menggeser konten', { concurrency: false }, () => {
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

  test('kartu yang dibaca tidak bergerak saat paket di atasnya habis kursi', { timeout: 90_000 }, async () => {
    const cached = makeApiResponse();
    // Dua paket teratas (mode AVAILABLE, urut tanggal terdekat) kursinya habis.
    const soldOut = [cached.aaData[0].jadwal_id, cached.aaData[1].jadwal_id];
    const session = await openJadwal({ cached, fresh: withSoldOut(cached, soldOut) });

    try {
      const { page } = session;
      const before = await cardCount(page);
      await page.evaluate(y => window.scrollTo(0, y), SCROLL_Y);
      await page.waitForTimeout(400);
      const scrollBefore = await scrollY(page);

      await page.evaluate(() => window.__startProbe());
      session.release();
      await page.waitForFunction(
        n => document.querySelectorAll('[data-jadwal-id]').length === n,
        before - 2,
        { timeout: 15_000 },
      );
      await page.waitForTimeout(500);
      const probe = await page.evaluate(() => window.__stopProbe());

      // 1) Swap-nya BENAR-BENAR terjadi — tanpa ini "0 sentakan" cuma berarti
      //    refresh latarnya mati, dan tesnya lulus tanpa menguji apa pun.
      assert.equal(session.schedulesHits(), 1, 'refresh latar harus menembak sekali');
      assert.equal(await cardCount(page), before - 2, 'dua kartu harus hilang dari daftar');

      // 2) Kompensasinya benar-benar jalan: scroll digeser sebesar tinggi kartu
      //    yang hilang (2 x ~255px), bukan dibiarkan di tempat.
      const corrected = scrollBefore - (await scrollY(page));
      assert.ok(
        corrected > 200,
        `scroll harus dikoreksi mengikuti kartu yang hilang, terkoreksi ${corrected}px`,
      );

      // 3) Dan yang paling penting: kartu di bawah mata pengguna tidak bergerak.
      assert.deepEqual(
        probe.jolts, [],
        `kartu jangkar ${probe.pinnedId} bergeser: ${JSON.stringify(probe.jolts)}`,
      );
    } finally {
      await session.close();
    }
  });

  test('paket yang habis DI BAWAH viewport tidak menyentuh scroll sama sekali', { timeout: 90_000 }, async () => {
    const cached = makeApiResponse();
    const soldOut = [cached.aaData[cached.aaData.length - 1].jadwal_id];
    const session = await openJadwal({ cached, fresh: withSoldOut(cached, soldOut) });

    try {
      const { page } = session;
      const before = await cardCount(page);
      await page.evaluate(y => window.scrollTo(0, y), SCROLL_Y);
      await page.waitForTimeout(400);
      const scrollBefore = await scrollY(page);

      await page.evaluate(() => window.__startProbe());
      session.release();
      await page.waitForFunction(
        n => document.querySelectorAll('[data-jadwal-id]').length === n,
        before - 1,
        { timeout: 15_000 },
      );
      await page.waitForTimeout(500);
      const probe = await page.evaluate(() => window.__stopProbe());

      assert.equal(await cardCount(page), before - 1);
      assert.equal(await scrollY(page), scrollBefore, 'tak ada yang bergeser di atas viewport → jangan sentuh scroll');
      assert.deepEqual(probe.jolts, []);
    } finally {
      await session.close();
    }
  });
});
