// StickerStudio dijalankan sungguhan di chromium: tempel, geser, ubah ukuran,
// hapus.
//
// Perilaku yang diuji di sini hidup di pointer handler dan useEffect — dua
// tempat yang TIDAK dijalankan oleh harness SSR maupun oleh penjaga cocok-teks-
// sumber. Geometri murninya sudah dijaga sticker-layout.test.js; yang ini
// menjaga kabelnya: bahwa gestur benar-benar sampai ke placement.
//
// Elemen dicari lewat data-attribute, bukan label teks — label tombol simpan
// berubah menurut perangkat ('Bagikan' vs 'Download'), pola yang sama dengan
// data-share-chatgpt di BrochurePromptModal.
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
const HARNESS = '/tests/fixtures/sticker-studio-harness.html';
const LAYER = '[data-sticker-layer="0"]';

// PNG 8×8 merah solid (#DC2626) menggantikan sticker asli: yang diuji wiring
// panggung → berkas, bukan jaringan ke Bunny.
const RED_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR42mO8o6b2nwEPYGIgAIaHAgA8CAI3MY4HhgAAAABJRU5ErkJggg==';

describe('StickerStudio', () => {
  let server;
  let browser;
  let page;
  let baseUrl;

  before(async () => {
    server = await createServer({ root: projectRoot, server: { port: 0 }, logLevel: 'error' });
    await server.listen();
    const port = server.config.server.port ?? server.httpServer.address().port;
    baseUrl = `http://localhost:${port}${HARNESS}`;
    browser = await chromium.launch();
  });

  after(async () => {
    await browser?.close();
    await server?.close();
  });

  async function openStudio() {
    await page?.close();
    page = await browser.newPage({ viewport: { width: 420, height: 860 } });
    await page.route('**/alhijaz.b-cdn.net/sticker/*.png', route =>
      route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from(RED_PNG_BASE64, 'base64'),
      }),
    );
    await page.goto(baseUrl);
    await page.waitForFunction(() => window.__ready === true);
    await page.waitForSelector('[data-sticker-add]');
  }

  async function addSticker(id = 'sold-out') {
    await page.click('[data-sticker-add]');
    await page.click(`[data-sticker-pick="${id}"]`);
    await page.waitForSelector(LAYER);
    // Sheet picker menutupi seluruh panggung selama animasi keluarnya (spring
    // ±0,4 dtk). Tanpa menunggu ia benar-benar lepas, pointer tes mendarat di
    // thumbnail picker, bukan di sticker — dan gestur tampak "tidak bekerja".
    await page.waitForSelector('[data-sticker-pick]', { state: 'detached' });
  }

  const boxOf = selector => page.locator(selector).boundingBox();

  test('picker menempelkan sticker ke panggung', async () => {
    await openStudio();
    assert.equal(await page.locator(LAYER).count(), 0, 'panggung seharusnya kosong di awal');
    await addSticker();
    assert.equal(await page.locator(LAYER).count(), 1);
  });

  test('tombol simpan mati sampai ada sticker yang ditempel', async () => {
    await openStudio();
    assert.equal(await page.locator('[data-sticker-save]').isDisabled(), true);
    await addSticker();
    assert.equal(await page.locator('[data-sticker-save]').isDisabled(), false);
  });

  test('sticker ikut digeser pointer', async () => {
    await openStudio();
    await addSticker();
    const before = await boxOf(LAYER);

    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 - 60, before.y + before.height / 2 - 40, { steps: 8 });
    await page.mouse.up();

    const after = await boxOf(LAYER);
    assert.ok(Math.abs(after.x - (before.x - 60)) < 3, `x: ${before.x} → ${after.x}`);
    assert.ok(Math.abs(after.y - (before.y - 40)) < 3, `y: ${before.y} → ${after.y}`);
    assert.ok(Math.abs(after.width - before.width) < 1, 'menggeser tidak boleh mengubah ukuran');
  });

  test('sticker tidak bisa digeser hilang keluar panggung', async () => {
    await openStudio();
    await addSticker();
    const stage = await boxOf(LAYER);

    await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
    await page.mouse.down();
    await page.mouse.move(stage.x - 4000, stage.y - 4000, { steps: 10 });
    await page.mouse.up();

    const after = await boxOf(LAYER);
    // Clamp menjamin minimal 25% sticker tetap di dalam gambar.
    assert.ok(
      after.x + after.width > 0 && after.y + after.height > 0,
      `sticker hilang total: ${JSON.stringify(after)}`,
    );
  });

  test('pegangan sudut mengubah ukuran, pusatnya tetap', async () => {
    await openStudio();
    await addSticker();
    const before = await boxOf(LAYER);
    const centerX = before.x + before.width / 2;
    const centerY = before.y + before.height / 2;

    const handle = await boxOf('[data-sticker-handle="0"]');
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 40, handle.y + handle.height / 2 + 40, { steps: 8 });
    await page.mouse.up();

    const after = await boxOf(LAYER);
    assert.ok(after.width > before.width + 5, `lebar tidak bertambah: ${before.width} → ${after.width}`);
    assert.ok(Math.abs(after.width - after.height) < 2, 'rasio persegi harus terjaga');
    assert.ok(
      Math.abs(after.x + after.width / 2 - centerX) < 3 && Math.abs(after.y + after.height / 2 - centerY) < 3,
      'mengubah ukuran tidak boleh menggeser pusat sticker',
    );
  });

  test('beberapa sticker bisa ditumpuk dan tidak menimpa persis', async () => {
    await openStudio();
    await addSticker('sold-out');
    await addSticker('best-seller');
    assert.equal(await page.locator('[data-sticker-layer]').count(), 2);

    const first = await boxOf('[data-sticker-layer="0"]');
    const second = await boxOf('[data-sticker-layer="1"]');
    assert.ok(
      Math.abs(first.x - second.x) > 2 || Math.abs(first.y - second.y) > 2,
      'sticker kedua menimpa yang pertama persis',
    );
  });

  test('tombol hapus membuang sticker yang terpilih', async () => {
    await openStudio();
    await addSticker();
    await page.click('[data-sticker-remove="0"]');
    await page.waitForSelector(LAYER, { state: 'detached' });
    assert.equal(await page.locator('[data-sticker-layer]').count(), 0);
    assert.equal(await page.locator('[data-sticker-save]').isDisabled(), true);
  });

  // Invarian inti seluruh fitur, diuji lewat kabel yang sebenarnya: panggung
  // (yang diperkecil agar muat layar) → placement ternormalisasi → kanvas
  // ekspor ukuran penuh. Kalau salah satu jalur diam-diam memakai piksel
  // panggung, sticker di berkas akan mendarat di tempat yang berbeda dari yang
  // digeser agent — dan tidak ada yang tahu sampai ada yang mengeluh.
  test('sticker mendarat di berkas tepat di tempat agent menggesernya', async () => {
    await openStudio();
    await addSticker();

    // Geser ke kiri-atas supaya posisinya jelas berbeda dari default di tengah.
    const stage = await boxOf('[data-sticker-layer="0"]');
    await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
    await page.mouse.down();
    await page.mouse.move(stage.x + stage.width / 2 - 70, stage.y + stage.height / 2 - 90, { steps: 8 });
    await page.mouse.up();

    // Titik tengah sticker di panggung, dinormalkan terhadap kotak panggung.
    const expected = await page.evaluate(() => {
      const layer = document.querySelector('[data-sticker-layer="0"]').getBoundingClientRect();
      const stageEl = document.querySelector('[data-sticker-layer="0"]').parentElement.getBoundingClientRect();
      return {
        cx: (layer.x + layer.width / 2 - stageEl.x) / stageEl.width,
        cy: (layer.y + layer.height / 2 - stageEl.y) / stageEl.height,
      };
    });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-sticker-save]'),
    ]);
    assert.match(download.suggestedFilename(), /^Brosur Uji\.jpg$/);

    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    assert.ok(bytes.length > 0, 'berkas hasil kosong');

    const probe = await page.evaluate(async ({ b64, cx, cy }) => {
      const bin = atob(b64);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([buf], { type: 'image/jpeg' }));
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(bmp, 0, 0);
      const at = (x, y) => Array.from(ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data);
      return {
        width: bmp.width,
        height: bmp.height,
        atSticker: at(cx * bmp.width, cy * bmp.height),
        atOldCenter: at(bmp.width / 2, bmp.height / 2),
        atCorner: at(bmp.width - 5, bmp.height - 5),
      };
    }, { b64: bytes.toString('base64'), cx: expected.cx, cy: expected.cy });

    // Gambar dasar harness 540×720; ekspor tidak boleh ikut ukuran panggung.
    assert.equal(probe.width, 540, 'lebar berkas mengikuti gambar dasar, bukan panggung');
    assert.equal(probe.height, 720);

    const isRedish = ([r, g, b]) => r > 150 && g < 110 && b < 110;
    const isWhitish = ([r, g, b]) => r > 240 && g > 240 && b > 240;
    assert.ok(isRedish(probe.atSticker), `sticker tidak ada di posisi yang digeser: ${probe.atSticker}`);
    assert.ok(isWhitish(probe.atOldCenter), `sticker masih di posisi lama: ${probe.atOldCenter}`);
    // Garis pilih & pegangan ada di DOM saat menyimpan — kalau ornamen editor
    // ikut ter-render, sudut gambar tidak akan bersih.
    assert.ok(isWhitish(probe.atCorner), `ornamen editor bocor ke berkas: ${probe.atCorner}`);
  });
});
