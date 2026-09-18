// Penjaga invarian inti Add Sticker: yang dilihat agent == yang terkirim.
//
// Komposit dijalankan SUNGGUHAN di chromium — kanvas tidak ada di node, dan
// meniru kanvas berarti menguji tiruan, bukan jalur yang dipakai agent. PNG
// sticker di-stub lewat route interception supaya tes tidak bergantung pada
// Bunny CDN: yang diuji geometri dan kontraknya, bukan jaringannya.
//
// WAJIB: chromium ditutup di `after`. Chromium yang dibiarkan hidup menahan
// event loop node dan `node --test` menggantung SELAMANYA setelah semua tes
// hijau, tanpa satu baris keluaran pun.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const HARNESS = '/tests/fixtures/sticker-composite-harness.html';

// PNG 8×8 merah solid (#DC2626), opaque — dipakai sebagai semua sticker.
const RED_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR42mO8o6b2nwEPYGIgAIaHAgA8CAI3MY4HhgAAAABJRU5ErkJggg==';

describe('compositeStickers', () => {
  let server;
  let browser;
  let page;

  before(async () => {
    server = await createServer({ root: projectRoot, server: { port: 0 }, logLevel: 'error' });
    await server.listen();
    browser = await chromium.launch();
    page = await browser.newPage();
    await page.route('**/alhijaz.b-cdn.net/sticker/*.png', route =>
      route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from(RED_PNG_BASE64, 'base64'),
      }),
    );
    const port = server.config.server.port ?? server.httpServer.address().port;
    await page.goto(`http://localhost:${port}${HARNESS}`);
    await page.waitForFunction(() => window.__ready === true);
  });

  after(async () => {
    await browser?.close();
    await server?.close();
  });

  /**
   * @param probes titik piksel tambahan yang ingin dibaca, [[x, y], …].
   *   Dikembalikan sebagai `at.probes` searah urutannya.
   */
  async function composite(baseW, baseH, placements, probes = []) {
    return page.evaluate(async ({ baseW, baseH, placements, probes }) => {
      // Gambar dasar putih polos seukuran brosur.
      const c = document.createElement('canvas');
      c.width = baseW;
      c.height = baseH;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, baseW, baseH);
      const base = await new Promise(r => c.toBlob(r, 'image/png'));

      const out = await window.__compositeStickers(base, placements);

      const bmp = await createImageBitmap(out);
      const read = document.createElement('canvas');
      read.width = bmp.width;
      read.height = bmp.height;
      const rctx = read.getContext('2d');
      rctx.drawImage(bmp, 0, 0);
      const at = (x, y) => Array.from(rctx.getImageData(Math.round(x), Math.round(y), 1, 1).data);
      return {
        width: bmp.width,
        height: bmp.height,
        type: out.type,
        at: {
          center: at(baseW / 2, baseH / 2),
          topLeft: at(4, 4),
          bottomRight: at(baseW - 5, baseH - 5),
          probes: probes.map(([x, y]) => at(x, y)),
        },
      };
    }, { baseW, baseH, placements, probes });
  }

  const isRedish = ([r, g, b]) => r > 150 && g < 110 && b < 110;
  const isWhitish = ([r, g, b]) => r > 240 && g > 240 && b > 240;

  test('dimensi keluaran sama persis dengan dimensi masukan', async () => {
    for (const [w, h] of [[1080, 1440], [1081, 1440], [1279, 1600]]) {
      const out = await composite(w, h, [{ stickerId: 'sold-out', cx: 0.5, cy: 0.5, w: 0.3 }]);
      assert.equal(out.width, w, `lebar ${w}x${h}`);
      assert.equal(out.height, h, `tinggi ${w}x${h}`);
    }
  });

  test('sticker benar-benar tergambar di tempat yang diminta', async () => {
    const out = await composite(1080, 1440, [{ stickerId: 'sold-out', cx: 0.5, cy: 0.5, w: 0.3 }]);
    assert.ok(isRedish(out.at.center), `titik tengah tidak merah: ${out.at.center}`);
  });

  test('piksel di luar kotak sticker tidak tersentuh', async () => {
    const out = await composite(1080, 1440, [{ stickerId: 'sold-out', cx: 0.5, cy: 0.5, w: 0.3 }]);
    assert.ok(isWhitish(out.at.topLeft), `sudut kiri-atas ikut berubah: ${out.at.topLeft}`);
    assert.ok(isWhitish(out.at.bottomRight), `sudut kanan-bawah ikut berubah: ${out.at.bottomRight}`);
  });

  // cx/cy = titik TENGAH sticker, bukan sudutnya. Sticker 0,2×1080 = 216 px di
  // (0.12, 0.12) karena itu menempati x 21,6–237,6 dan y 64,8–280,8; titik
  // tengahnya (129,6, 172,8) yang harus merah, sementara pusat gambar bersih.
  test('sticker mengikuti cx/cy, bukan selalu di tengah', async () => {
    const out = await composite(
      1080, 1440,
      [{ stickerId: 'sold-out', cx: 0.12, cy: 0.12, w: 0.2 }],
      [[0.12 * 1080, 0.12 * 1440], [0.12 * 1080, 0.12 * 1440 + 130]],
    );
    assert.ok(isWhitish(out.at.center), `pusat gambar seharusnya bersih: ${out.at.center}`);
    assert.ok(isRedish(out.at.probes[0]), `titik tengah sticker seharusnya merah: ${out.at.probes[0]}`);
    assert.ok(isWhitish(out.at.probes[1]), `tepat di bawah sticker seharusnya bersih: ${out.at.probes[1]}`);
  });

  test('tanpa sticker, gambar dasar tetap utuh', async () => {
    const out = await composite(1080, 1440, []);
    assert.ok(isWhitish(out.at.center));
    assert.equal(out.width, 1080);
  });

  test('keluaran JPEG', async () => {
    const out = await composite(1080, 1440, [{ stickerId: 'sold-out', cx: 0.5, cy: 0.5, w: 0.3 }]);
    assert.equal(out.type, 'image/jpeg');
  });

  // Sikap sengaja BERBEDA dari stampAgentOnBrochure yang fail-silent: di sana
  // brosur tanpa identitas agent masih berguna, di sini sticker JUSTRU yang
  // diminta. Sticker yang hilang diam-diam = agent mengirim brosur yang dikira
  // ada tempelannya.
  test('sticker yang gagal diambil melempar — tidak diam-diam dilewati', async () => {
    const failed = await page.evaluate(async () => {
      const c = document.createElement('canvas');
      c.width = 100;
      c.height = 100;
      const base = await new Promise(r => c.toBlob(r, 'image/png'));
      try {
        await window.__compositeStickers(base, [
          { stickerId: 'tidak-ada-di-katalog', cx: 0.5, cy: 0.5, w: 0.3 },
        ]);
        return null;
      } catch (e) {
        return String(e.message || e);
      }
    });
    assert.ok(
      failed,
      'komposit sticker tak dikenal seharusnya melempar, bukan mengembalikan gambar polos',
    );
  });
});
