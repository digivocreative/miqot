// Pil "Sticker" di halaman Brosur Jadwal: melayang di atas brosur, tapi WAJIB
// di luar node yang di-capture.
//
// captureCanvasFromElement() mengkloning `exportPageRefs.current[i]` — elemen
// bertanda data-brochure-preview-page. Apa pun yang jadi ANAK node itu ikut
// terbakar ke berkas yang dikirim ke calon jamaah. Pil ini karena itu sengaja
// dipasang sebagai SIBLING di dalam bingkai ber-position:relative satu tingkat
// di atasnya: posisinya tetap di pojok kanan atas brosur, tapi kloningnya tidak
// pernah melihatnya.
//
// Penjaga strukturnya (bukan piksel) karena di situlah mekanismenya: kalau pil
// bukan keturunan node ekspor, ia tidak mungkin ikut ter-capture.
//
// WAJIB: chromium ditutup di `after`, kalau tidak `node --test` menggantung
// selamanya setelah semua tes hijau.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const HARNESS = '/tests/fixtures/brochure-export-harness.html';
const PREVIEW = '[data-brochure-preview-page="0"]';

const basePackage = overrides => ({
  id: 'schedule',
  nama: 'UMROH RAHMAH 9 HARI',
  maskapai: 'SAUDIA AIRLINES',
  berangkat_tgl: '2026-09-03',
  pulang_tgl: '2026-09-11',
  hari: 9,
  seatSisa: 17,
  harga: 33_900_000,
  soldOut: false,
  landing: 'Jeddah',
  hotel: [
    { city: 'Mekkah', name: 'Movenpick Hajar Tower', stars: 5 },
    { city: 'Madinah', name: 'Frontel Al Harithia', stars: 4 },
  ],
  ...overrides,
});

const API_PAYLOAD = {
  agent: {
    slug: 'agen-uji',
    name: 'Agen Uji',
    phone: '628229000200',
    photo: '',
    website: 'https://example.test',
  },
  months: [{
    key: '2026-09',
    label: 'September 2026',
    monthIndexId: 8,
    year: 2026,
    truncatedCount: 0,
    packages: [
      basePackage({ id: 's1' }),
      basePackage({ id: 's2', nama: 'UMROH PLUS TURKI 12 HARI', berangkat_tgl: '2026-09-06', pulang_tgl: '2026-09-17', hari: 12, seatSisa: 8, harga: 42_500_000 }),
    ],
  }],
};

describe('Pil Sticker di Brosur Jadwal', { concurrency: false }, () => {
  let viteServer;
  let browser;
  let context;
  let page;

  before(async () => {
    viteServer = await createServer({
      root: projectRoot,
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0, strictPort: true },
    });
    await viteServer.listen();
    const address = viteServer.httpServer?.address();
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 520, height: 900 } });
    page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem('brosurDesignId', 'classic'));
    await page.route('**/api/ai-tools/brosur-jadwal-bulan', route => route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(API_PAYLOAD),
    }));
    await page.goto(`http://127.0.0.1:${address.port}${HARNESS}?mode=hari`);
    await page.locator(PREVIEW).waitFor({ state: 'visible', timeout: 45_000 });
    await page.locator('[data-sticker-open]').first().waitFor({ timeout: 15_000 });
  });

  after(async () => {
    await context?.close();
    await browser?.close();
    await viteServer?.close();
  });

  test('pil TIDAK berada di dalam node yang di-capture untuk ekspor', async () => {
    const didalam = await page.evaluate(() => {
      const target = document.querySelector('[data-brochure-preview-page="0"]');
      return target.querySelectorAll('[data-sticker-open]').length;
    });
    assert.equal(didalam, 0,
      'pil sticker jadi keturunan node ekspor — ia akan ikut terbakar ke brosur yang dikirim');
  });

  test('pil tetap melayang di pojok kanan atas brosur', async () => {
    const posisi = await page.evaluate(() => {
      const pil = document.querySelector('[data-sticker-open]').getBoundingClientRect();
      const brosur = document.querySelector('[data-brochure-preview-page="0"]')
        .closest('div[style*="aspect-ratio"], div')
        .getBoundingClientRect();
      const frame = document.querySelector('[data-brochure-preview-page="0"]').parentElement.parentElement.getBoundingClientRect();
      return {
        diDalamBingkai:
          pil.left >= frame.left - 1 && pil.right <= frame.right + 1 &&
          pil.top >= frame.top - 1 && pil.bottom <= frame.bottom + 1,
        // Pojok KANAN ATAS: dekat tepi kanan, di sepertiga teratas.
        dekatKanan: (frame.right - pil.right) / frame.width < 0.1,
        diAtas: (pil.top - frame.top) / frame.height < 0.15,
        brosurAda: brosur.width > 0,
      };
    });
    assert.ok(posisi.brosurAda, 'pratinjau brosur tidak terender');
    assert.ok(posisi.diDalamBingkai, 'pil keluar dari bingkai brosur');
    assert.ok(posisi.dekatKanan, 'pil tidak menempel ke tepi kanan brosur');
    assert.ok(posisi.diAtas, 'pil tidak berada di bagian atas brosur');
  });

  test('pil membuka studio sticker, lengkap dengan galerinya', async () => {
    await page.click('[data-sticker-open]');
    // Galeri naik sendiri; pil 'Tambah' justru TIDAK ada selagi galeri terbuka,
    // jadi kehadirannya bukan penanda studio terbuka. Yang selalu ada adalah
    // tombol simpan di footer studio.
    await page.locator('[data-sticker-pick]').first().waitFor({ timeout: 20_000 });
    assert.ok(await page.locator('[data-sticker-save]').count() > 0, 'studio tidak terbuka');
    assert.ok(await page.locator('[data-sticker-pick]').count() >= 21, 'galeri sticker tidak lengkap');
  });
});
