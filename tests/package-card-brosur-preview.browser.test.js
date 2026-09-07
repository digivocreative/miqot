// Sisi seberang gerbang kesiapan brosur — yang tidak terjangkau harness SSR.
//
// tests/package-card-brosur-preview.test.js mengunci separuh yang statis: sebelum
// gambar siap, kotaknya sudah menahan tinggi 3:4 dan gambarnya masih opacity-0.
// Separuh itu saja tidak cukup. Di sana efek, ref, dan onLoad tidak pernah jalan,
// jadi gerbangnya selamanya tertutup: menghapus onLoad — gambar diam di
// opacity-0 SELAMANYA — lolos tanpa satu tes pun memerah.
//
// Di sini gerbangnya benar-benar dibuka. Yang diukur geometri dan gaya
// TERKOMPUTASI, bukan nama kelas: tinggi kotak dalam piksel, aspect-ratio,
// animationName, opacity. Nama kelas Tailwind boleh berganti kapan saja; yang
// tidak boleh berganti adalah tingginya tertahan lalu gambarnya muncul.
//
// Responsnya DITAHAN lewat page.route(). Tanpa penahanan, keadaan "belum siap"
// lewat dalam beberapa milidetik dan tesnya jadi lomba yang kadang-kadang benar.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import sharp from 'sharp';
import { createServer } from 'vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const HARNESS = '/tests/fixtures/package-card-brosur-harness.html';
const BROSUR_ROUTE = '**/__uji-brosur.jpg';
const BROSUR = 'img[alt="Brosur paket"]';

// Rasio brosur yang sesungguhnya. Kotak penahan HARUS memakai rasio ini juga:
// kalau melenceng, tinggi yang ditahan bukan tinggi yang akhirnya dipakai, dan
// panelnya tetap melompat — cuma lebih sedikit.
const BROSUR_W = 1081;
const BROSUR_H = 1440;

// Selisih tinggi yang masih boleh dianggap "tidak melompat". 3/4 (kelasnya) vs
// 1081/1440 (gambarnya) beda 0.09%, jadi pada kotak ~400px selisihnya <1px.
const TOLERANSI_PX = 2;

let viteServer;
let browser;
let appOrigin;
let brosurJpeg;

/**
 * Membaca keadaan pratinjau apa adanya dari DOM hidup.
 * Dijalankan DI DALAM browser, jadi tidak boleh menutup variabel Node apa pun.
 */
const bacaKeadaan = () => {
  const img = document.querySelector('img[alt="Brosur paket"]');
  if (!img) return null;
  const kotak = img.parentElement;
  const panel = document.querySelector('[data-expand-panel]');
  const gayaGambar = getComputedStyle(img);
  const gayaKotak = getComputedStyle(kotak);
  const rect = kotak.getBoundingClientRect();
  return {
    opacity: Number(gayaGambar.opacity),
    transitionProperty: gayaGambar.transitionProperty,
    transitionDuration: gayaGambar.transitionDuration,
    rasioTerkunci: gayaKotak.aspectRatio,
    animasiKerangka: gayaKotak.animationName,
    tinggiKotak: rect.height,
    lebarKotak: rect.width,
    // Tinggi konten panel = angka yang diukur framer-motion sebagai target
    // animasi expand. Inilah yang dulu melompat +574px di frame terakhir.
    tinggiKontenPanel: panel ? panel.scrollHeight : null,
    lencanaSiap: document.body.textContent.includes('Lihat penuh'),
  };
};

async function bukaHarness() {
  const context = await browser.newContext({ viewport: { width: 520, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  let ditahan = null;
  await page.route(BROSUR_ROUTE, route => {
    // Sengaja TIDAK di-fulfill di sini: permintaannya menggantung sampai
    // lepaskanBrosur() dipanggil.
    ditahan = route;
  });

  await page.goto(`${appOrigin}${HARNESS}`);
  await page.locator(BROSUR).waitFor({ state: 'attached', timeout: 60_000 });
  await page.evaluate(() => document.fonts?.ready);

  const lepaskanBrosur = async () => {
    // Elemen <img> bisa sudah ter-attach sepersekian detik sebelum permintaannya
    // mampir ke handler route; tanpa jeda ini tesnya kadang-kadang balapan.
    for (let sisa = 100; !ditahan && sisa > 0; sisa -= 1) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(ditahan, 'permintaan brosur tidak pernah sampai ke page.route()');
    await ditahan.fulfill({
      status: 200,
      contentType: 'image/jpeg',
      body: brosurJpeg,
    });
    // Transisinya 300ms; 8 detik itu kelonggaran, bukan target. Timeout telanjang
    // Playwright ("Timeout 8000ms exceeded") tidak memberi tahu apa pun, padahal
    // inilah kegagalan yang paling mungkin terjadi — gerbangnya tak pernah dibuka.
    try {
      await page.waitForFunction(
        sel => Number(getComputedStyle(document.querySelector(sel)).opacity) === 1,
        BROSUR,
        { timeout: 8_000 },
      );
    } catch {
      const macet = await page.evaluate(bacaKeadaan);
      assert.fail(
        `brosur sudah mendarat tapi gambarnya tidak pernah tampil (opacity ${macet?.opacity}). ` +
        'Gerbang kesiapannya tak pernah terbuka — periksa onLoad / ref pada <img> brosur.',
      );
    }
  };

  return { context, page, pageErrors, lepaskanBrosur };
}

describe('Pratinjau brosur: kerangka menahan tinggi, lalu gambarnya fade-in', { concurrency: false }, () => {
  before(async () => {
    // Rasio gambarnya harus rasio brosur asli — kalau tidak, "tinggi panel tidak
    // berubah" jadi asersi yang menguji gambar ujinya sendiri, bukan kodenya.
    brosurJpeg = await sharp({
      create: { width: BROSUR_W, height: BROSUR_H, channels: 3, background: '#8A0F0A' },
    }).jpeg().toBuffer();

    viteServer = await createServer({
      root: projectRoot,
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0, strictPort: true },
    });
    await viteServer.listen();
    const address = viteServer.httpServer?.address();
    assert.ok(address && typeof address === 'object', 'Vite harus membuka HTTP port');
    appOrigin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true });
  }, { timeout: 120_000 });

  after(async () => {
    await browser?.close();
    await viteServer?.close();
  });

  test('tinggi panel tidak berubah saat brosur mendarat, dan gambarnya muncul', { timeout: 180_000 }, async () => {
    const { context, page, pageErrors, lepaskanBrosur } = await bukaHarness();
    try {
      const menunggu = await bacaKeadaanDi(page);

      // --- Selagi brosur belum mendarat ---
      assert.equal(menunggu.opacity, 0, 'gambar sudah dicat sebelum siap');
      assert.ok(menunggu.tinggiKotak > 0, 'kotak brosur tinggi 0 — tidak ada yang ditahan');
      assert.ok(
        Math.abs(menunggu.tinggiKotak / menunggu.lebarKotak - BROSUR_H / BROSUR_W) < 0.02,
        `kotak menahan rasio ${(menunggu.tinggiKotak / menunggu.lebarKotak).toFixed(3)}, ` +
        `brosurnya ${(BROSUR_H / BROSUR_W).toFixed(3)}`,
      );
      assert.notEqual(menunggu.animasiKerangka, 'none', 'kerangka tidak berdenyut');
      assert.equal(menunggu.lencanaSiap, false, 'kartu mengaku siap padahal gambarnya belum ada');
      assert.match(menunggu.transitionProperty, /opacity/, 'munculnya gambar tidak ditransisikan');
      assert.notEqual(menunggu.transitionDuration, '0s', 'transisi opacity berdurasi nol = mengedip');

      // --- Brosur mendarat ---
      await lepaskanBrosur();
      const siap = await bacaKeadaanDi(page);

      assert.equal(siap.opacity, 1, 'gambar tidak pernah muncul — gerbang kesiapannya tak pernah terbuka');
      assert.equal(siap.rasioTerkunci, 'auto', 'kunci rasio tidak dilepas; gambar dipaksa masuk kotak 3:4');
      assert.equal(siap.animasiKerangka, 'none', 'kerangka masih berdenyut di belakang gambar yang sudah tampil');
      assert.equal(siap.lencanaSiap, true, 'lencana "Lihat penuh" tidak muncul setelah gambar siap');

      // INVARIAN UTAMA: tinggi yang diukur framer-motion sebagai target animasi
      // expand harus SAMA sebelum dan sesudah gambarnya mendarat.
      assert.ok(
        Math.abs(siap.tinggiKontenPanel - menunggu.tinggiKontenPanel) <= TOLERANSI_PX,
        `tinggi konten panel melompat ${(siap.tinggiKontenPanel - menunggu.tinggiKontenPanel).toFixed(1)}px ` +
        `saat brosur mendarat (${menunggu.tinggiKontenPanel} → ${siap.tinggiKontenPanel})`,
      );

      assert.deepEqual(pageErrors, [], 'ada galat runtime di halaman');
    } finally {
      await context.close();
    }
  });

  // TIDAK DIJAGA di sini: ref `el?.complete && el.naturalWidth > 0` pada <img>,
  // penawar untuk gambar yang sudah complete sebelum onLoad sempat terpasang.
  //
  // Sudah dicoba lalu dibuang, bukan terlupa. Dua cara ditempuh: memuat ulang
  // halaman dengan brosur ber-cache, dan memasang ulang kartu selagi gambarnya
  // ada di memory cache. Chromium TETAP membangkitkan event load di kedua kasus,
  // jadi onLoad yang menanggungnya dan baris ref itu tak pernah terpakai.
  // Dibuktikan lewat uji mutasi: dengan ref-nya dihapus, kedua percobaan tadi
  // tetap HIJAU — tesnya lolos karena alasan lain daripada namanya, dan penjaga
  // semacam itulah yang basi diam-diam. Lebih baik lubangnya ditulis di sini.
});

/** page.evaluate + penjagaan supaya "elemennya tidak ada" tidak menyamar jadi nilai null yang lolos. */
async function bacaKeadaanDi(page) {
  const keadaan = await page.evaluate(bacaKeadaan);
  assert.ok(keadaan, 'pratinjau brosur tidak ter-render sama sekali');
  return keadaan;
}
