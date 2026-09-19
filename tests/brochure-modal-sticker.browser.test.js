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

describe('Bagian bawah BrochureModal: callout sticker, menu AI Tools, kerangka brosur', { concurrency: false }, () => {
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

  // Gerbang 4 jam / 10 kali diuji sebagai fungsi murni di sticker-promo-gate.
  // Yang diuji DI SINI cuma kabelnya: tombol callout menambah hitungan, membuka
  // baris tidak. Keduanya WAJIB dilakukan selagi callout masih tampil — di luar
  // itu `dismiss` memang tidak mencatat apa pun, jadi tesnya akan hijau tanpa
  // membuktikan apa-apa (versi pertama tes ini persis begitu: membalik
  // argumennya tidak membuatnya merah).
  async function bukaBersih() {
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.removeItem('stickerPromoState'));
    await page.route('**/__uji-brosur-modal.png', route => route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(RED_PNG_BASE64, 'base64'),
    }));
    await page.goto(`${appOrigin}${HARNESS}`);
    await page.locator('[data-sticker-callout-later]').hover();
    return page;
  }

  const tersimpan = page => page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('stickerPromoState') || 'null'); }
    catch { return null; }
  });

  test('tombol Nanti menambah hitungan menuju batas 10', async () => {
    const page = await bukaBersih();
    try {
      await page.click('[data-sticker-callout-later]');
      await page.locator('[data-sticker-callout]').waitFor({ state: 'detached', timeout: 10_000 });
      const s = await tersimpan(page);
      assert.equal(s?.dismissals, 1, 'tombol Nanti tidak menambah hitungan');
      assert.ok(s?.lastAt > 0, 'waktu tutup tidak dicatat');
    } finally {
      await page.close();
    }
  });

  test('membuka baris selagi callout tampil menunda, tapi TIDAK menghitung', async () => {
    const page = await bukaBersih();
    try {
      await page.click('[data-sticker-open]');
      await page.locator('[data-sticker-pick]').first().waitFor({ timeout: 20_000 });
      await page.locator('[data-sticker-callout]').waitFor({ state: 'detached', timeout: 10_000 });
      const s = await tersimpan(page);
      assert.equal(s?.dismissals, 0, 'membuka baris ikut terhitung menuju batas 10');
      assert.ok(s?.lastAt > 0, 'jendela 4 jam tidak ditunda sama sekali');
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

  // Menu "AI Tools" membuka KE ATAS dari footer, tepat menimpa baris sticker.
  // Baris itu membawa z-index sendiri (tumpukan thumbnail + balon perkenalan);
  // tanpa konteks penumpukan sendiri, angka-angka itu naik ke konteks layar
  // brosur dan mencoret menunya — persis keluhan "dropdown ketiban section
  // Tempel sticker". Yang diuji di sini piksel teratas di banyak titik, bukan
  // nama kelas: pelakunya tidak harus elemen yang sama lain kali.
  test('baris sticker tidak mencoret menu AI Tools', async () => {
    const page = await buka();
    try {
      await page.getByRole('button', { name: 'AI Tools' }).click();
      await page.locator('[role="menuitem"]').first().waitFor({ timeout: 10_000 });
      // Menunya beranimasi masuk (opacity + scale + translate); mengukur sebelum
      // ia diam membaca posisi yang belum final. Ditunggu lewat gaya
      // terkomputasi, BUKAN hover(): kalau menunya memang tertutup, hover()
      // menggantung 30 detik lalu mati sebagai "timeout" — kegagalan yang
      // menyamarkan justru bug yang sedang dijaga.
      await page.waitForFunction(() => {
        const m = document.querySelector('[role="menu"]');
        return m && Number(getComputedStyle(m).opacity) === 1;
      }, undefined, { timeout: 10_000 });
      await page.evaluate(() => new Promise(requestAnimationFrame));

      const tertutup = await page.evaluate(() => {
        const menu = document.querySelector('[role="menu"]');
        const hasil = [];
        for (const item of menu.querySelectorAll('[role="menuitem"]')) {
          const r = item.getBoundingClientRect();
          for (const bagian of [0.1, 0.3, 0.5, 0.7, 0.9]) {
            const atas = document.elementFromPoint(r.x + r.width * bagian, r.y + r.height / 2);
            if (!atas || !menu.contains(atas)) {
              hasil.push(
                `${item.textContent.slice(0, 18)} @${Math.round(bagian * 100)}% tertutup oleh ` +
                `${atas ? atas.tagName + '.' + String(atas.className).slice(0, 48) : 'null'}`,
              );
            }
          }
        }
        return hasil;
      });
      assert.deepEqual(tertutup, []);
    } finally {
      await page.close();
    }
  });

  // Brosur rata-rata ~650 KB (terbesar 2,4 MB) dan baru boleh tampil setelah
  // identitas agent dibakar ke pikselnya, jadi jeda ini SELALU ada. Dulu tidak
  // ada yang menahan tingginya: pembungkusnya kolaps jadi sepotong putih
  // setinggi padding dengan spinner gepeng di tengahnya, dan layarnya terbaca
  // kosong. Yang dikunci di sini tingginya — bukan rupa kerangkanya.
  test('kerangka menahan tinggi brosur selagi gambarnya belum mendarat', async () => {
    const page = await context.newPage();
    let ditahan = null;
    await page.route('**/__uji-brosur-modal.png', route => { ditahan = route; });
    try {
      await page.goto(`${appOrigin}${HARNESS}`);
      await page.locator('text=Preview Brosur').waitFor({ timeout: 30_000 });
      await page.getByRole('button', { name: 'AI Tools' }).hover();

      const kerangka = await page.evaluate(() => {
        const el = document.querySelector('.brosur-skeleton');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { w: r.width, h: r.height, animasi: getComputedStyle(el).animationName };
      });
      assert.ok(kerangka, 'tidak ada kerangka sama sekali selagi brosur dimuat');
      assert.ok(
        kerangka.h > kerangka.w * 1.2,
        `kerangka cuma ${Math.round(kerangka.h)}px pada lebar ${Math.round(kerangka.w)}px — ` +
        'pembungkusnya kolaps lagi, bukan menahan rasio brosur',
      );
      assert.notEqual(kerangka.animasi, 'none', 'kerangka diam — tidak terbaca sebagai "sedang dimuat"');

      for (let sisa = 100; !ditahan && sisa > 0; sisa -= 1) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      assert.ok(ditahan, 'permintaan brosur tidak pernah sampai ke page.route()');
      await ditahan.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from(RED_PNG_BASE64, 'base64'),
      });

      await page.waitForFunction(
        () => !document.querySelector('.brosur-skeleton'),
        undefined,
        { timeout: 10_000 },
      );
      const gambar = page.locator('img[alt^="Brosur"]');
      await gambar.waitFor({ timeout: 10_000 });
      assert.equal(
        await gambar.evaluate(el => Number(getComputedStyle(el).opacity)),
        1,
        'kerangka sudah pergi tapi brosurnya tidak tampil',
      );
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
