// Sticker adalah alat AGENT, dan PackageCard juga tampil di halaman publik
// agent (/:slug) yang dilihat calon jamaah.
//
// Tes ini berpasangan dan harus tetap begitu: satu membuktikan barisnya MUNCUL
// untuk agent yang login, satu membuktikan ia TIDAK ADA untuk pengunjung biasa.
// Tanpa yang pertama, gerbangnya bisa "aman" hanya karena fiturnya rusak untuk
// semua orang; tanpa yang kedua, kebocorannya tidak ketahuan sampai ada calon
// jamaah yang bertanya kenapa ada tombol aneh di brosurnya.
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
const HARNESS = '/tests/fixtures/package-card-brosur-harness.html';

const RED_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR42mO8o6b2nwEPYGIgAIaHAgA8CAI3MY4HhgAAAABJRU5ErkJggg==';

// Bentuk sesi harus lolos isStoredSession() di src/utils/authUtils.ts —
// token non-kosong + user{slug,name,role}. Bentuk yang kurang lengkap dibuang
// diam-diam, dan tesnya akan hijau karena alasan yang salah.
const SESI_AGENT = {
  token: 'token-uji',
  user: { slug: 'agen-uji', name: 'Agen Uji', role: 'agent' },
};

describe('Gerbang login baris sticker di PackageCard', { concurrency: false }, () => {
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
    context = await browser.newContext({ viewport: { width: 390, height: 900 } });
  });

  after(async () => {
    await context?.close();
    await browser?.close();
    await viteServer?.close();
  });

  async function buka(sesi) {
    const page = await context.newPage();
    await page.addInitScript(s => {
      localStorage.removeItem('auth_session');
      sessionStorage.removeItem('auth_session');
      if (s) localStorage.setItem('auth_session', JSON.stringify(s));
    }, sesi);
    await page.route('**/__uji-brosur.jpg', route => route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(RED_PNG_BASE64, 'base64'),
    }));
    await page.goto(`${appOrigin}${HARNESS}`);
    // Pratinjau brosur adalah penanda bahwa kartunya sudah terbuka penuh —
    // menunggu ini dulu supaya ketiadaan baris sticker berarti "memang tidak
    // dirender", bukan "belum sempat dirender".
    await page.locator('img[alt="Brosur paket"]').waitFor({ state: 'attached', timeout: 30_000 });
    await page.waitForTimeout(600);
    return page;
  }

  test('agent yang login melihat baris sticker', async () => {
    const page = await buka(SESI_AGENT);
    try {
      assert.equal(await page.locator('[data-sticker-open]').count(), 1);
    } finally {
      await page.close();
    }
  });

  test('pengunjung publik TIDAK melihat baris sticker sama sekali', async () => {
    const page = await buka(null);
    try {
      assert.equal(await page.locator('[data-sticker-open]').count(), 0,
        'alat agent bocor ke halaman publik yang dilihat calon jamaah');
      assert.equal(await page.locator('[data-sticker-callout]').count(), 0,
        'callout perkenalan bocor ke halaman publik');
      // Brosur tetap bisa diunduh/dibagikan seperti biasa — yang dicabut hanya
      // pintu masuk sticker, bukan fungsi brosurnya.
      assert.ok(await page.locator('img[alt="Brosur paket"]').count() > 0,
        'pratinjau brosur ikut hilang untuk pengunjung publik');
    } finally {
      await page.close();
    }
  });
});
