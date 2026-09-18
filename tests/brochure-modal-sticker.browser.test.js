// Callout sticker di dalam BrochureModal — khususnya: tombolnya benar-benar
// bisa ditekan.
//
// Modal ini punya kontrol zoom `fixed` di sudut kanan bawah, tepat di area yang
// ditempati callout. Versi pertama cuma membuatnya `opacity-0` saat callout
// tampil — dan opacity TIDAK mematikan pointer, jadi pil zoom yang tak terlihat
// menelan klik "Nanti". Bug-nya lolos dari mata karena pelakunya tidak kelihatan
// sama sekali; hanya tes yang benar-benar MENEKAN tombol yang bisa menangkapnya.
//
// WAJIB: chromium ditutup di `after`, kalau tidak `node --test` menggantung
// selamanya setelah semua tes hijau.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const HARNESS = '/tests/fixtures/brochure-modal-sticker-harness.html';

// PNG 8×8 merah solid berdiri sebagai brosur; yang diuji interaksinya.
const RED_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR42mO8o6b2nwEPYGIgAIaHAgA8CAI3MY4HhgAAAABJRU5ErkJggg==';

describe('Callout sticker di BrochureModal', { concurrency: false }, () => {
  let viteServer;
  let browser;
  let context;
  let appOrigin;

  before(async () => {
    viteServer = await createServer({
      root: projectRoot,
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0, strictPort: true },
    });
    await viteServer.listen();
    appOrigin = `http://127.0.0.1:${viteServer.httpServer.address().port}`;
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  });

  after(async () => {
    await context?.close();
    await browser?.close();
    await viteServer?.close();
  });

  async function buka() {
    const page = await context.newPage();
    await page.route('**/__uji-brosur-modal.png', route => route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(RED_PNG_BASE64, 'base64'),
    }));
    await page.goto(`${appOrigin}${HARNESS}?stiker=1`);
    await page.locator('[data-sticker-callout]').waitFor({ timeout: 30_000 });
    // Modal masuk dengan animasi slide; mengukur sebelum ia diam membaca posisi
    // di luar layar. hover() menunggu elemen benar-benar stabil — lebih jujur
    // daripada menunggu sekian milidetik dan berharap.
    await page.locator('[data-sticker-callout-later]').hover();
    return page;
  }

  test('tombol Nanti benar-benar menutup callout', async () => {
    const page = await buka();
    try {
      await page.click('[data-sticker-callout-later]');
      await page.locator('[data-sticker-callout]').waitFor({ state: 'detached', timeout: 10_000 });
      assert.equal(await page.locator('[data-sticker-callout]').count(), 0);
    } finally {
      await page.close();
    }
  });

  // Penjaga akar masalahnya, bukan cuma gejalanya: elemen apa pun yang menutupi
  // tombol callout akan membuat asersi ini merah walau tombolnya sendiri sehat.
  test('tidak ada elemen lain yang menutupi tombol-tombol callout', async () => {
    const page = await buka();
    try {
      const tertutup = await page.evaluate(() => {
        const hasil = [];
        for (const sel of ['[data-sticker-callout-later]', '[data-sticker-callout-try]']) {
          const el = document.querySelector(sel);
          const r = el.getBoundingClientRect();
          const atas = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          if (!el.contains(atas)) {
            hasil.push(sel + ' tertutup oleh ' + atas.tagName + '.' + String(atas.className).slice(0, 40));
          }
        }
        return hasil;
      });
      assert.deepEqual(tertutup, []);
    } finally {
      await page.close();
    }
  });

  test('tombol Coba sekarang menutup callout dan membuka studio', async () => {
    const page = await buka();
    try {
      await page.click('[data-sticker-callout-try]');
      await page.locator('[data-sticker-pick]').first().waitFor({ timeout: 20_000 });
      // AnimatePresence menahan callout selama animasi keluarnya, jadi yang
      // ditunggu adalah lepasnya dari DOM, bukan keadaan sesaat setelah klik.
      await page.locator('[data-sticker-callout]').waitFor({ state: 'detached', timeout: 10_000 });
      assert.equal(await page.locator('[data-sticker-callout]').count(), 0, 'callout masih tampil di atas studio');
    } finally {
      await page.close();
    }
  });
});
