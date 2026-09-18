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
    // Galeri naik SENDIRI saat studio terbuka: studio tanpa sticker tidak
    // menampilkan apa pun yang baru, jadi tap 'Tambah' pertama dibuang. Pil
    // 'Tambah' sendiri TIDAK ada selagi galeri terbuka — ia tidak punya
    // pekerjaan di sana — jadi jangan menunggunya di sini.
    await page.waitForSelector('[data-sticker-pick]');
  }

  async function addSticker(id = 'sold-out') {
    const before = await page.locator('[data-sticker-layer]').count();
    // Terbuka otomatis hanya untuk sticker PERTAMA; sisanya lewat tombol.
    if ((await page.locator('[data-sticker-pick]').count()) === 0) {
      await page.click('[data-sticker-add]');
      await page.waitForSelector('[data-sticker-pick]');
    }
    await page.click(`[data-sticker-pick="${id}"]`);
    await page.waitForFunction(
      n => document.querySelectorAll('[data-sticker-layer]').length === n,
      before + 1,
    );
    // Sheet picker menutupi seluruh panggung selama animasi keluarnya (±0,25
    // dtk). Tanpa menunggu ia benar-benar lepas, pointer tes mendarat di
    // thumbnail picker, bukan di sticker — dan gestur tampak "tidak bekerja".
    await page.waitForSelector('[data-sticker-pick]', { state: 'detached' });
    // Sticker mendarat dengan animasi scale; mengukur kotaknya selagi spring
    // berjalan membaca nilai antara, bukan ukuran sebenarnya.
    await page.waitForFunction(
      n => document.querySelectorAll('[data-sticker-settled="true"]').length === n,
      before + 1,
    );
  }

  const boxOf = selector => page.locator(selector).boundingBox();

  test('galeri sudah terbuka begitu studio dibuka — tanpa tap tambahan', async () => {
    await openStudio();
    assert.ok(await page.locator('[data-sticker-pick]').first().isVisible());
    assert.equal(await page.locator(LAYER).count(), 0, 'panggung seharusnya kosong di awal');
    await addSticker();
    assert.equal(await page.locator(LAYER).count(), 1);
  });

  // Menutup galeri tanpa memilih apa pun = batal. Tanpa ini agent yang berubah
  // pikiran mendarat di editor kosong — layar mati yang justru dihilangkan
  // dengan membuka galeri otomatis.
  test('menutup galeri tanpa memilih menutup studio sekalian', async () => {
    await openStudio();
    await page.click('[aria-label="Tutup pilihan sticker"]');
    await page.waitForFunction(() => window.__closed === true);
    assert.equal(await page.evaluate(() => window.__closed), true);
  });

  test('menutup galeri setelah ada sticker TIDAK menutup studio', async () => {
    await openStudio();
    await addSticker();
    await page.click('[data-sticker-add]');
    await page.waitForSelector('[data-sticker-pick]');
    await page.click('[aria-label="Tutup pilihan sticker"]');
    await page.waitForSelector('[data-sticker-pick]', { state: 'detached' });
    assert.notEqual(await page.evaluate(() => window.__closed), true, 'studio ikut tertutup padahal sudah ada sticker');
    assert.equal(await page.locator(LAYER).count(), 1);
  });

  // Pil melayang hidup di stacking context akar modal, jadi tanpa gerbang ini ia
  // menembus sheet galeri dan menutupi tombol tutupnya.
  test('pil Tambah tidak muncul selagi galeri terbuka', async () => {
    await openStudio();
    assert.equal(await page.locator('[data-sticker-add]').count(), 0,
      'pil Tambah menumpuk di atas galeri');

    await addSticker();
    assert.equal(await page.locator('[data-sticker-add]').count(), 1,
      'pil Tambah tidak kembali setelah galeri ditutup');

    await page.click('[data-sticker-add]');
    await page.waitForSelector('[data-sticker-pick]');
    assert.equal(await page.locator('[data-sticker-add]').count(), 0,
      'pil Tambah masih tampil saat galeri dibuka lagi');
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

  // Bagian sticker yang menggantung di luar tepi TIDAK ikut terbakar ke berkas
  // (kanvas dipotong di tepi gambar), jadi sticker yang boleh menggantung berarti
  // yang dilihat agent bukan yang terkirim.
  test('sticker tidak bisa digeser keluar dari brosur', async () => {
    await openStudio();
    await addSticker();

    for (const [dx, dy] of [[-4000, -4000], [4000, 4000], [4000, -4000]]) {
      const now = await boxOf(LAYER);
      await page.mouse.move(now.x + now.width / 2, now.y + now.height / 2);
      await page.mouse.down();
      await page.mouse.move(now.x + dx, now.y + dy, { steps: 10 });
      await page.mouse.up();

      const after = await boxOf(LAYER);
      const stage = await page.locator('[data-sticker-layer="0"]').evaluate(el => {
        const r = el.parentElement.getBoundingClientRect();
        return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
      });
      const arah = `geser ${dx},${dy}`;
      assert.ok(after.x >= stage.x - 1, `${arah}: keluar kiri (${after.x} < ${stage.x})`);
      assert.ok(after.y >= stage.y - 1, `${arah}: keluar atas (${after.y} < ${stage.y})`);
      assert.ok(after.x + after.width <= stage.right + 1, `${arah}: keluar kanan`);
      assert.ok(after.y + after.height <= stage.bottom + 1, `${arah}: keluar bawah`);
    }
  });

  // Panggung pernah diberi lebar yang ikut menghitung padding kontainernya, lalu
  // MENYUSUT sebagai flex item: brosur tergepeng dan posisi sticker melenceng
  // ±3%. Rasio panggung wajib sama dengan rasio gambar dasarnya.
  test('panggung tidak menggepengkan brosur', async () => {
    await openStudio();
    await addSticker();
    const { stageAspect, imageAspect } = await page.evaluate(() => {
      const stageEl = document.querySelector('[data-sticker-layer="0"]').parentElement;
      const r = stageEl.getBoundingClientRect();
      const img = stageEl.querySelector('img');
      return { stageAspect: r.width / r.height, imageAspect: img.naturalWidth / img.naturalHeight };
    });
    assert.ok(Math.abs(stageAspect - imageAspect) < 0.005,
      `panggung ${stageAspect.toFixed(4)} vs gambar ${imageAspect.toFixed(4)}`);
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

  // Alasan `key` memakai uid, bukan indeks. Kalau key-nya indeks, menghapus
  // sticker yang BUKAN terakhir membuat React memakai ulang key: lapisan yang
  // tersisa menerima isi baru sementara yang dianimasikan keluar adalah
  // TETANGGANYA — terlihat sebagai sticker salah yang mengecil lalu hilang, dan
  // sesaat ada dua lapisan bergambar sama.
  test('menghapus sticker di tengah menganimasikan keluar yang benar', async () => {
    await openStudio();
    await addSticker('sold-out');
    await addSticker('best-seller');
    await addSticker('plus-turki');

    const semula = await page.$$eval('[data-sticker-layer] img', els => els.map(e => e.alt));
    assert.deepEqual(semula, ['Sold Out', 'Best Seller', 'Plus Turki']);

    // Titik yang HANYA ditempati lapisan 0: pergeseran default menaruh
    // lapisan 1 di (+0,08,+0,08) dan lapisan 2 di (-0,08,-0,08), jadi
    // (0,60 · 0,40) lolos dari keduanya sementara masih di dalam lapisan 0.
    const stage = await page.locator('[data-sticker-layer="0"]').evaluate(el => {
      const r = el.parentElement.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    await page.mouse.click(stage.x + stage.w * 0.6, stage.y + stage.h * 0.4);
    await page.waitForSelector('[data-sticker-remove="0"]');

    // Dibaca dua frame setelah klik: animasi keluar (0,16 dtk) masih berjalan,
    // jadi lapisan yang keluar masih ter-mount dan bisa diperiksa.
    const saatKeluar = await page.evaluate(() => {
      document.querySelector('[data-sticker-remove="0"]').click();
      return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
        resolve(Array.from(document.querySelectorAll('[data-sticker-layer] img')).map(e => e.alt));
      })));
    });

    assert.equal(new Set(saatKeluar).size, saatKeluar.length,
      `ada lapisan bergambar sama saat animasi keluar: ${saatKeluar.join(', ')}`);
    assert.deepEqual([...saatKeluar].sort(), [...semula].sort(),
      `yang dianimasikan keluar bukan sticker yang dihapus: ${saatKeluar.join(', ')}`);

    await page.waitForFunction(() => document.querySelectorAll('[data-sticker-layer]').length === 2);
    const sisa = await page.$$eval('[data-sticker-layer] img', els => els.map(e => e.alt));
    assert.deepEqual(sisa, ['Best Seller', 'Plus Turki']);
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

    // Kotak sticker DI LAYAR, dinormalkan terhadap panggung — inilah yang
    // dilihat agent.
    const dilihat = await page.evaluate(() => {
      const el = document.querySelector('[data-sticker-layer="0"]');
      const layer = el.getBoundingClientRect();
      const st = el.parentElement.getBoundingClientRect();
      return {
        cx: (layer.x + layer.width / 2 - st.x) / st.width,
        cy: (layer.y + layer.height / 2 - st.y) / st.height,
        w: layer.width / st.width,
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

    // Kotak sticker DI BERKAS diukur dari sebaran piksel merahnya, bukan dari
    // satu titik sampel. Versi pertama tes ini cuma menyelidik satu titik di
    // tengah sticker — toleransi selebar itu meloloskan pergeseran 3% yang
    // nyata (panggung menyusut karena padding kontainer).
    const terkirim = await page.evaluate(async b64 => {
      const bin = atob(b64);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([buf], { type: 'image/jpeg' }));
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(bmp, 0, 0);
      const { data } = ctx.getImageData(0, 0, bmp.width, bmp.height);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, merah = 0;
      for (let y = 0; y < bmp.height; y++) {
        for (let x = 0; x < bmp.width; x++) {
          const i = (y * bmp.width + x) * 4;
          if (data[i] > 150 && data[i + 1] < 110 && data[i + 2] < 110) {
            merah++;
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      return {
        width: bmp.width,
        height: bmp.height,
        merah,
        cx: (x0 + x1 + 1) / 2 / bmp.width,
        cy: (y0 + y1 + 1) / 2 / bmp.height,
        w: (x1 - x0 + 1) / bmp.width,
      };
    }, bytes.toString('base64'));

    // Gambar dasar harness 540×720; ekspor tidak boleh ikut ukuran panggung.
    assert.equal(terkirim.width, 540, 'lebar berkas mengikuti gambar dasar, bukan panggung');
    assert.equal(terkirim.height, 720);
    assert.ok(terkirim.merah > 500, `sticker tidak tergambar di berkas (${terkirim.merah} piksel merah)`);

    // 1% dari sisi gambar ≈ 5 px: cukup longgar untuk artefak tepi JPEG, cukup
    // ketat untuk menangkap pergeseran sistematis sekecil 3%.
    const batas = 0.01;
    assert.ok(Math.abs(terkirim.cx - dilihat.cx) < batas,
      `cx layar ${dilihat.cx.toFixed(4)} vs berkas ${terkirim.cx.toFixed(4)}`);
    assert.ok(Math.abs(terkirim.cy - dilihat.cy) < batas,
      `cy layar ${dilihat.cy.toFixed(4)} vs berkas ${terkirim.cy.toFixed(4)}`);
    assert.ok(Math.abs(terkirim.w - dilihat.w) < batas,
      `lebar layar ${dilihat.w.toFixed(4)} vs berkas ${terkirim.w.toFixed(4)}`);
  });
});
