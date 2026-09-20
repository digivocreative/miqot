/**
 * Tarik-untuk-segarkan di halaman jadwal, app terpasang.
 *
 * Mesinnya WebKit dan `navigator.standalone` dipalsukan: iOS standalone adalah
 * satu-satunya tempat yang benar-benar TIDAK punya gestur refresh bawaan, jadi di
 * sanalah fitur ini harus terbukti hidup.
 *
 * Yang dibuktikan bukan cuma "indikator muncul", tapi rantai penuhnya: gestur →
 * satu fetch /api/schedules → daftar kartu benar-benar berubah. Tes yang berhenti
 * di indikator akan tetap hijau walau kabel ke data putus.
 *
 * Event sentuh di sini sintetis (page.dispatchEvent), jadi ia TIDAK menggulir
 * halaman sungguhan — itu justru yang dibutuhkan: gerbang "halaman harus di
 * puncak" diuji dengan window.scrollTo yang eksplisit, bukan efek samping gestur.
 *
 * WAJIB: browser ditutup di `after`, kalau tidak `node --test` menggantung setelah
 * semua tes hijau.
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

/** Tarikan mentah; 130px melewati ambang (±111px), 60px jelas di bawahnya. */
const PULL_ARMED = 130;
const PULL_SHORT = 60;

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

/** Salinan dengan `soldOutIds` kursinya nol — tersaring keluar mode bawaan AVAILABLE. */
function withSoldOut(response, soldOutIds) {
  return {
    ...response,
    aaData: response.aaData.map(row => (
      soldOutIds.includes(row.jadwal_id) ? { ...row, seat_sisa: '0' } : row
    )),
  };
}

/**
 * Buka halaman jadwal dengan cache paket sudah terisi. `standalone: false`
 * meniru tab browser biasa — di sana gestur ini memang tidak boleh ada.
 */
async function openJadwal({ standalone = true, snapshot } = {}) {
  const context = await browser.newContext({
    serviceWorkers: 'block',
    viewport: VIEWPORT,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();

  const cached = snapshot ?? makeApiResponse();
  let served = cached;
  let schedulesHits = 0;

  try {
    if (standalone) {
      // Jalur iOS di isStandaloneDisplay(). Dipasang lewat addInitScript supaya
      // sudah ada sebelum modul app dievaluasi.
      await page.addInitScript(() => {
        Object.defineProperty(window.navigator, 'standalone', { get: () => true, configurable: true });
      });
    }
    await page.addInitScript(({ agents, cacheKey, snapshot: seed }) => {
      window.localStorage.setItem('agents_cache', JSON.stringify(agents));
      window.localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), apiResponse: seed }));
    }, {
      agents: {
        [AGENT_SLUG]: { name: 'Nikita Test', website: 'alhijaz.test', phone: '628123456789', photo: '' },
      },
      cacheKey: `umroh_packages_cache_v2_${YEAR_CODE}`,
      snapshot: cached,
    });

    await page.route('**/*', async route => {
      const url = new URL(route.request().url());

      if (url.pathname.startsWith('/api/schedules/')) {
        schedulesHits += 1;
        return route.fulfill({
          status: 200, contentType: 'application/json', body: JSON.stringify(served),
        });
      }
      if (url.pathname.startsWith('/api/')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
      }
      // Cuma host LUAR yang diputus; modul app sendiri disajikan dev server.
      if (url.origin !== appOrigin) return route.abort();
      return route.continue();
    });

    await page.goto(`${appOrigin}/${AGENT_SLUG}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(
      () => document.querySelectorAll('[data-jadwal-id]').length > 10,
      undefined,
      { timeout: 30_000 },
    );
    // Revalidasi latar saat mount juga memukul /api/schedules, DAN saat hasilnya
    // mendarat ia memulihkan jangkar gulir (restoreListAnchor di App.tsx) — yang
    // bisa menarik halaman kembali ke puncak. Menunggu sekian milidetik tidak
    // cukup: di suite yang sibuk respons itu datang belakangan dan tesnya jadi
    // mengukur halaman yang bergerak sendiri. Tunggu sampai benar-benar reda.
    let quiet = 0;
    let lastSeen = -1;
    while (quiet < 3) {
      await page.waitForTimeout(250);
      if (schedulesHits === lastSeen) quiet += 1;
      else { quiet = 0; lastSeen = schedulesHits; }
    }
  } catch (error) {
    await context.close();
    throw error;
  }

  return {
    page,
    hits: () => schedulesHits,
    serve: next => { served = next; },
    close: () => context.close(),
  };
}

/**
 * Gestur satu jari di atas `selector`. `dy` positif = menarik ke bawah.
 * Identifier dipaku supaya handler tidak menganggap ini jari kedua.
 */
async function swipe(page, { selector = 'main', dy = 0, dx = 0, steps = 6, release = true } = {}) {
  const startX = VIEWPORT.width / 2;
  const startY = 420;
  const touch = (x, y) => ({ clientX: x, clientY: y, identifier: 1 });
  const dispatch = (type, x, y) => page.dispatchEvent(selector, type, {
    touches: type === 'touchend' ? [] : [touch(x, y)],
    changedTouches: [touch(x, y)],
    targetTouches: type === 'touchend' ? [] : [touch(x, y)],
  });

  await dispatch('touchstart', startX, startY);
  for (let step = 1; step <= steps; step += 1) {
    await dispatch('touchmove', startX + (dx * step) / steps, startY + (dy * step) / steps);
  }
  if (release) await dispatch('touchend', startX + dx, startY + dy);
}

/**
 * Menggulir dan MEMASTIKAN halamannya tinggal di sana. Revalidasi latar saat
 * mount memulihkan jangkar gulir begitu datanya mendarat (restoreListAnchor di
 * App.tsx) — di mesin yang sibuk itu bisa terjadi tepat sesudah kita menggulir
 * dan menarik halaman balik ke puncak. Ulangi sampai posisinya diam.
 */
async function scrollAndSettle(page, y) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await page.evaluate(target => window.scrollTo(0, target), y);
    await page.waitForTimeout(400);
    if (await page.evaluate(target => Math.abs(window.scrollY - target) < 4, y)) return true;
  }
  return false;
}

const cardCount = page => page.evaluate(() => document.querySelectorAll('[data-jadwal-id]').length);
const phase = page => page.evaluate(() => document.querySelector('[data-pull-refresh]')?.dataset.phase ?? null);

describe('Jadwal — tarik-untuk-segarkan di app terpasang', { concurrency: false }, () => {
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

  test('tarikan penuh menarik data baru dan daftarnya benar-benar berubah', { timeout: 90_000 }, async () => {
    const cached = makeApiResponse();
    const session = await openJadwal({ snapshot: cached });
    try {
      const { page } = session;
      const before = await cardCount(page);
      const hitsBefore = session.hits();
      // Dua paket teratas kehabisan kursi sejak snapshot; kalau gesturnya benar
      // menarik data, keduanya hilang dari daftar.
      session.serve(withSoldOut(cached, [cached.aaData[0].jadwal_id, cached.aaData[1].jadwal_id]));

      await swipe(page, { dy: PULL_ARMED });

      await page.waitForFunction(
        n => document.querySelectorAll('[data-jadwal-id]').length === n,
        before - 2,
        { timeout: 15_000 },
      );
      assert.equal(session.hits(), hitsBefore + 1, 'tepat satu fetch jadwal untuk satu tarikan');

      // Putaran minimal 450ms menjaga indikator tetap terbaca; sesudah itu ia
      // menutup diri sendiri tanpa perlu disentuh lagi.
      await page.waitForFunction(
        () => document.querySelector('[data-pull-refresh]')?.dataset.phase === 'idle',
        undefined,
        { timeout: 10_000 },
      );
    } finally {
      await session.close();
    }
  });

  test('indikator sempat masuk status menyegarkan, bukan berkedip lewat', { timeout: 90_000 }, async () => {
    const session = await openJadwal();
    try {
      const { page } = session;
      await swipe(page, { dy: PULL_ARMED });
      await page.waitForFunction(
        () => document.querySelector('[data-pull-refresh]')?.dataset.phase === 'refreshing',
        undefined,
        { timeout: 10_000 },
      );
      assert.equal(await phase(page), 'refreshing');

      // Indikatornya `fixed`, dan `fixed` diam-diam berubah jadi relatif terhadap
      // induk begitu ada leluhur ber-transform/filter. Ukur posisi NYATA-nya:
      // kalau suatu saat pembungkus halaman jadwal dianimasikan, tes ini yang
      // memberi tahu, bukan tangkapan layar pengguna.
      const box = await page.evaluate(() => {
        const rect = document.querySelector('[data-pull-refresh]').getBoundingClientRect();
        return { top: rect.top, centerX: rect.left + rect.width / 2, width: rect.width };
      });
      assert.ok(box.top > 0 && box.top < 120, `indikator harus terparkir di puncak layar, terukur top=${box.top}`);
      // Toleransi 8px: WebKit headless memasang scrollbar klasik selebar 6px,
      // jadi kolom dokumennya 3px lebih kiri dari tengah viewport. Di iOS
      // (scrollbar melayang) titik ini persis di tengah.
      assert.ok(
        Math.abs(box.centerX - VIEWPORT.width / 2) < 8,
        `indikator harus di tengah, terukur centerX=${box.centerX}`,
      );
    } finally {
      await session.close();
    }
  });

  test('tarikan pendek dibatalkan — tidak ada fetch, indikator kembali diam', { timeout: 90_000 }, async () => {
    const session = await openJadwal();
    try {
      const { page } = session;
      const hitsBefore = session.hits();
      await swipe(page, { dy: PULL_SHORT });
      await page.waitForTimeout(700);
      assert.equal(session.hits(), hitsBefore, 'tarikan di bawah ambang tidak boleh memanggil API');
      assert.equal(await phase(page), 'idle');
    } finally {
      await session.close();
    }
  });

  test('geser mendatar milik carousel, bukan gestur refresh', { timeout: 90_000 }, async () => {
    const session = await openJadwal();
    try {
      const { page } = session;
      const hitsBefore = session.hits();
      // Turun sejauh tarikan penuh TAPI mendatarnya lebih jauh lagi.
      await swipe(page, { dy: PULL_ARMED, dx: PULL_ARMED + 40 });
      await page.waitForTimeout(700);
      assert.equal(session.hits(), hitsBefore);
      assert.equal(await phase(page), 'idle');
    } finally {
      await session.close();
    }
  });

  test('halaman yang sudah tergulir tidak ikut tertarik', { timeout: 90_000 }, async () => {
    const session = await openJadwal();
    try {
      const { page } = session;
      // Kalau halaman diam-diam kembali ke puncak, tes ini berhenti menguji apa
      // pun — jadi posisinya dipastikan dulu, baru gesturnya dinilai.
      assert.ok(await scrollAndSettle(page, 1200), 'halaman harus benar-benar tergulir dan diam di sana');
      const hitsBefore = session.hits();
      await swipe(page, { dy: PULL_ARMED });
      await page.waitForTimeout(700);
      assert.equal(session.hits(), hitsBefore, 'gestur hanya sah saat halaman di puncak');
      assert.equal(await phase(page), 'idle');
    } finally {
      await session.close();
    }
  });

  test('di tab browser biasa gestur ini tidak dipasang sama sekali', { timeout: 90_000 }, async () => {
    const session = await openJadwal({ standalone: false });
    try {
      const { page } = session;
      assert.equal(await page.locator('[data-pull-refresh]').count(), 0, 'indikator tidak boleh dirender');
      assert.equal(
        await page.evaluate(() => document.documentElement.classList.contains('pull-refresh-host')),
        false,
        'overscroll-behavior tidak boleh diubah di tab browser — PTR bawaannya harus utuh',
      );

      const hitsBefore = session.hits();
      await swipe(page, { dy: PULL_ARMED });
      await page.waitForTimeout(700);
      assert.equal(session.hits(), hitsBefore);
    } finally {
      await session.close();
    }
  });

  test('app terpasang memadamkan PTR bawaan lewat overscroll-behavior', { timeout: 90_000 }, async () => {
    const session = await openJadwal();
    try {
      const { page } = session;
      assert.equal(
        await page.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorY),
        'contain',
      );
    } finally {
      await session.close();
    }
  });
});
