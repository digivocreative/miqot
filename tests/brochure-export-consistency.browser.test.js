import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium, webkit } from 'playwright';
import { PDFParse } from 'pdf-parse';
import sharp from 'sharp';
import { createServer } from 'vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const packageBrochureFixture = fileURLToPath(new URL('../public/img-brosur/cover-katalog.png', import.meta.url));
const designLabels = ['Klasik', 'Boarding Pass', 'Serambi Nabawi', 'Tasbih Hijau'];
const browserType = process.env.BROCHURE_TEST_BROWSER === 'webkit' ? webkit : chromium;

const apiPayload = {
  agent: {
    slug: 'agen-uji',
    name: 'Agen Uji',
    phone: '628123456789',
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
      {
        id: 'schedule-1',
        nama: 'UMROH RAHMAH 9 HARI',
        maskapai: 'SAUDIA AIRLINES',
        berangkat_tgl: '2026-09-03',
        pulang_tgl: '2026-09-11',
        hari: 9,
        seatSisa: 17,
        harga: 33_900_000,
        soldOut: false,
        landing: 'Jeddah',
      },
      {
        id: 'schedule-2',
        nama: 'UMROH PLUS TURKI 12 HARI',
        maskapai: 'TURKISH AIRLINES',
        berangkat_tgl: '2026-09-12',
        pulang_tgl: '2026-09-23',
        hari: 12,
        seatSisa: 8,
        harga: 42_500_000,
        soldOut: false,
        isPromo: true,
        landing: 'Madinah',
      },
      {
        id: 'schedule-3',
        nama: 'UMROH JUMATAIN 16 HARI',
        maskapai: 'GARUDA INDONESIA',
        berangkat_tgl: '2026-09-20',
        pulang_tgl: '2026-10-05',
        hari: 16,
        seatSisa: 0,
        harga: 49_900_000,
        soldOut: true,
        landing: 'Jeddah',
      },
    ],
  }],
};

let viteServer;
let browser;
let appOrigin;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function previewDetails(page) {
  const preview = page.locator('[data-brochure-preview-page="0"]');
  await preview.waitFor({ state: 'visible', timeout: 45_000 });
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const bytes = await preview.screenshot({ animations: 'disabled' });
  const metadata = await sharp(bytes).metadata();
  return { bytes, width: metadata.width, height: metadata.height };
}

async function selectDesign(page, label, designId) {
  const button = page.getByRole('button', { name: label, exact: true });
  await button.click();
  await page.locator(`[data-brochure-preview-page="0"][data-brochure-design="${designId}"]`).waitFor();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function downloadDetails(page) {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.getByRole('button', { name: 'Download', exact: true }).click(),
  ]);
  const path = await download.path();
  assert.ok(path, 'browser harus menyimpan file unduhan sementara');
  const bytes = await readFile(path);
  const metadata = await sharp(bytes).metadata();
  const stats = await sharp(bytes).stats();
  return {
    bytes,
    hash: sha256(bytes),
    size: bytes.byteLength,
    metadata,
    maxDeviation: Math.max(...stats.channels.map(channel => channel.stdev)),
  };
}

async function visualDifference(previewBytes, exportBytes) {
  const preview = await sharp(previewBytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const exported = await sharp(exportBytes)
    .resize(preview.info.width, preview.info.height, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let changed = 0;
  let absoluteTotal = 0;
  const pixels = preview.info.width * preview.info.height;
  for (let offset = 0; offset < preview.data.length; offset += 3) {
    const red = Math.abs(preview.data[offset] - exported.data[offset]);
    const green = Math.abs(preview.data[offset + 1] - exported.data[offset + 1]);
    const blue = Math.abs(preview.data[offset + 2] - exported.data[offset + 2]);
    absoluteTotal += red + green + blue;
    if (Math.max(red, green, blue) > 32) changed += 1;
  }
  return {
    changedRatio: changed / pixels,
    meanAbsoluteDifference: absoluteTotal / (pixels * 3),
  };
}

describe('Brosur Jadwal canonical export', { concurrency: false }, () => {
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
    browser = await browserType.launch({ headless: true });
  }, { timeout: 30_000 });

  after(async () => {
    await browser?.close();
    await viteServer?.close();
  });

  test('live preview stays visually aligned with stable repeated downloads for every design', { timeout: 180_000 }, async () => {
    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 520, height: 900 },
    });
    const page = await context.newPage();
    const pageErrors = [];
    const rendererMessages = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
      if (
        (message.type() === 'error' || message.type() === 'warning')
        && /\[(?:brosur|katalog)\]/.test(message.text())
      ) {
        rendererMessages.push(message.text());
      }
    });
    await page.addInitScript(() => localStorage.setItem('brosurDesignId', 'classic'));
    await page.route('**/api/ai-tools/brosur-jadwal-bulan', route => route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(apiPayload),
    }));

    try {
      await page.goto(`${appOrigin}/tests/fixtures/brochure-export-harness.html`);
      let current = await previewDetails(page);
      const firstPass = new Map();
      const designIds = ['classic', 'boarding', 'serambi', 'tasbih'];

      for (let index = 0; index < designLabels.length; index++) {
        const label = designLabels[index];
        if (index > 0) {
          await selectDesign(page, label, designIds[index]);
          current = await previewDetails(page);
        }

        assert.ok(current.width > 300);
        assert.equal(current.height, Math.round(current.width * 1.5));

        const firstDownload = await downloadDetails(page);
        const secondDownload = await downloadDetails(page);
        assert.equal(secondDownload.hash, firstDownload.hash, `${label}: download berulang harus identik`);
        assert.equal(firstDownload.metadata.format, 'jpeg');
        assert.equal(firstDownload.metadata.width, 1080);
        assert.equal(firstDownload.metadata.height, 1620);
        assert.ok(firstDownload.maxDeviation > 10, `${label}: gambar tidak boleh berupa kanvas polos`);
        const difference = await visualDifference(current.bytes, firstDownload.bytes);
        console.log(`${label} visual difference`, difference);
        assert.ok(difference.changedRatio < 0.05, `${label}: terlalu banyak piksel ekspor yang berbeda dari preview`);
        assert.ok(difference.meanAbsoluteDifference < 5.5, `${label}: tampilan ekspor menyimpang dari preview`);
        firstPass.set(label, firstDownload);
      }

      // Recreate every design independently. This catches the original font
      // race where alternating captures produced fallback-font bitmaps.
      for (let index = 0; index < designLabels.length; index++) {
        const label = designLabels[index];
        await selectDesign(page, label, designIds[index]);
        const regenerated = await downloadDetails(page);
        const baseline = firstPass.get(label);
        const regenerationDifference = await visualDifference(baseline.bytes, regenerated.bytes);
        console.log(`${label} regeneration difference`, regenerationDifference);
        assert.equal(regenerated.hash, baseline.hash, `${label}: renderer harus stabil antar-generasi`);
      }

      assert.equal(new Set([...firstPass.values()].map(result => result.hash)).size, designLabels.length, 'setiap desain harus benar-benar dirender ulang');

      // The catalog has no on-screen page preview, but it shares the same
      // convergent renderer. Exercise its 1.5x capture path as well.
      await page.getByRole('button', { name: 'Unduh Katalog PDF', exact: true }).click();
      const coverDialog = page.getByRole('dialog', { name: 'Pilih cover katalog' });
      await coverDialog.waitFor();
      const [pdfDownload] = await Promise.all([
        page.waitForEvent('download', { timeout: 60_000 }),
        coverDialog.getByRole('button', { name: 'Unduh Katalog PDF', exact: true }).click(),
      ]);
      const pdfPath = await pdfDownload.path();
      assert.ok(pdfPath, 'browser harus menyimpan katalog PDF sementara');
      const pdfBytes = await readFile(pdfPath);
      assert.equal(pdfBytes.subarray(0, 5).toString(), '%PDF-');
      assert.ok(pdfBytes.byteLength > 100_000, 'katalog PDF tidak boleh kosong');

      assert.deepEqual(pageErrors, []);
      assert.deepEqual(rendererMessages, [], 'renderer tidak boleh melaporkan capture yang gagal/tidak konvergen');
    } catch (error) {
      console.error('Brochure harness body:', await page.locator('body').innerText().catch(() => '<unavailable>'));
      console.error('Brochure harness page errors:', pageErrors);
      console.error('Brochure harness renderer messages:', rendererMessages);
      throw error;
    } finally {
      await context.close();
    }
  });

  test('rapid design switching settles instead of loading endlessly', { timeout: 150_000 }, async () => {
    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 520, height: 900 },
    });
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem('brosurDesignId', 'classic'));
    await page.route('**/api/ai-tools/brosur-jadwal-bulan', route => route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(apiPayload),
    }));

    try {
      await page.goto(`${appOrigin}/tests/fixtures/brochure-export-harness.html`);
      const enabledDownload = 'button:has-text("Download"):not([disabled])';
      await page.waitForSelector(enabledDownload, { timeout: 60_000 });

      // Jelajahi semua desain dengan cepat — capture generasi lama harus
      // dibatalkan, bukan mengantre di depan capture desain aktif.
      for (const label of ['Boarding Pass', 'Serambi Nabawi', 'Klasik', 'Tasbih Hijau']) {
        await page.getByRole('button', { name: label, exact: true }).click();
        await page.waitForTimeout(300);
      }

      // "Buat Ulang AI" tidak menunggu blob ekspor: modal menunggunya sendiri.
      assert.equal(
        await page.getByRole('button', { name: 'Buat Ulang AI' }).isEnabled(),
        true,
        'tombol Buat Ulang AI harus tetap aktif segera setelah ganti desain',
      );

      const settleStart = Date.now();
      await page.waitForSelector(enabledDownload, { timeout: 60_000 });
      console.log(`rapid switch settled in ${((Date.now() - settleStart) / 1000).toFixed(1)}s`);

      // Unduhan setelah settle harus berupa brosur utuh desain terakhir.
      const result = await downloadDetails(page);
      assert.equal(result.metadata.format, 'jpeg');
      assert.equal(result.metadata.width, 1080);
      assert.equal(result.metadata.height, 1620);
      assert.ok(result.maxDeviation > 10, 'hasil setelah rapid switch tidak boleh kanvas polos');
    } finally {
      await context.close();
    }
  });

  test('catalog PDF action is full-width and follows the active month filter', { timeout: 90_000 }, async () => {
    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 520, height: 900 },
    });
    const page = await context.newPage();
    const octoberPayload = {
      ...apiPayload,
      months: [
        ...apiPayload.months,
        {
          key: '2026-10',
          label: 'Oktober 2026',
          monthIndexId: 9,
          year: 2026,
          truncatedCount: 0,
          packages: [{
            ...apiPayload.months[0].packages[0],
            id: 'schedule-october',
            berangkat_tgl: '2026-10-08',
            pulang_tgl: '2026-10-16',
          }],
        },
        {
          key: '2027-08',
          label: 'Agustus 2027',
          monthIndexId: 7,
          year: 2027,
          truncatedCount: 0,
          packages: [{
            id: 'JBU0679',
            nama: 'WAITINGLIST',
            maskapai: '',
            berangkat_tgl: '2027-08-01',
            pulang_tgl: '',
            seatSisa: 33,
            harga: null,
            soldOut: false,
          }],
        },
      ],
    };
    await page.route('**/api/ai-tools/brosur-jadwal-bulan', route => route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(octoberPayload),
    }));

    try {
      await page.goto(`${appOrigin}/tests/fixtures/brochure-export-harness.html`);
      const catalogButton = page.getByRole('button', { name: 'Unduh Katalog PDF', exact: true });
      await catalogButton.waitFor();
      const buttonBox = await catalogButton.boundingBox();
      assert.ok(buttonBox && buttonBox.width >= 480, 'tombol katalog harus memenuhi lebar konten');

      await page.getByRole('button', { name: 'Pilih Bulan' }).click();
      assert.equal(
        await page.getByRole('option', { name: 'Agustus 2027', exact: true }).count(),
        0,
        'bulan yang hanya berisi WAITINGLIST tidak boleh menjadi opsi filter',
      );
      await page.getByRole('option', { name: 'Oktober 2026', exact: true }).click();
      await catalogButton.click();

      const coverDialog = page.getByRole('dialog', { name: 'Pilih cover katalog' });
      await coverDialog.waitFor();
      await coverDialog.getByText('Filter: Oktober 2026', { exact: true }).waitFor();
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 60_000 }),
        coverDialog.getByRole('button', { name: 'Unduh Katalog PDF', exact: true }).click(),
      ]);
      assert.match(download.suggestedFilename(), /oktober-2026/);

      const pdfPath = await download.path();
      assert.ok(pdfPath);
      const parser = new PDFParse({ data: await readFile(pdfPath) });
      try {
        await parser.load();
        const info = await parser.getInfo();
        // Satu cover + satu halaman Oktober. Jalur lama "Semua" akan membuat
        // tiga halaman karena September ikut terangkut.
        assert.equal(info.total, 2);
      } finally {
        await parser.destroy();
      }
    } finally {
      await context.close();
    }
  });

  test('Brosur Paket catalog contains the filtered official brochure images', { timeout: 90_000 }, async () => {
    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 520, height: 900 },
    });
    const page = await context.newPage();
    const packagePayload = {
      ...apiPayload,
      months: apiPayload.months.map(month => ({
        ...month,
        packages: month.packages.map(pkg => ({
          ...pkg,
          brosur: `/test-brosur-full-${pkg.id}.png`,
          brosurThumb: `/test-brosur-thumb-${pkg.id}.png`,
        })),
      })),
    };
    let activeFullBrochureRequests = 0;
    let maxConcurrentFullBrochureRequests = 0;
    let thumbnailRequests = 0;
    let fullBrochureRequests = 0;
    let agentPhotoRequests = 0;
    let catalogDownloadStarted = false;
    const agentPhotoBody = await sharp({
      create: { width: 120, height: 120, channels: 3, background: { r: 240, g: 20, b: 180 } },
    }).jpeg().toBuffer();

    await page.route('**/api/ai-tools/brosur-jadwal-bulan', route => route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(packagePayload),
    }));
    await page.route('**/test-brosur-thumb-*.png', route => {
      if (catalogDownloadStarted) thumbnailRequests += 1;
      return route.fulfill({ path: packageBrochureFixture, contentType: 'image/png' });
    });
    await page.route('**/test-brosur-full-*.png', async route => {
      const tracked = catalogDownloadStarted;
      if (tracked) {
        fullBrochureRequests += 1;
        activeFullBrochureRequests += 1;
        maxConcurrentFullBrochureRequests = Math.max(
          maxConcurrentFullBrochureRequests,
          activeFullBrochureRequests,
        );
      }
      try {
        // Menahan respons sebentar membuat test bisa membedakan unduhan paralel
        // dari implementasi lama yang selalu menunggu satu brosur selesai.
        await new Promise(resolve => setTimeout(resolve, 200));
        await route.fulfill({ path: packageBrochureFixture, contentType: 'image/png' });
      } finally {
        if (tracked) activeFullBrochureRequests -= 1;
      }
    });
    await page.route('**/agents/agen-uji.jpg', route => {
      agentPhotoRequests += 1;
      return route.fulfill({ body: agentPhotoBody, contentType: 'image/jpeg' });
    });

    try {
      await page.goto(`${appOrigin}/tests/fixtures/brochure-export-harness.html`);
      await page.getByRole('button', { name: 'Brosur Paket', exact: true }).click();

      const catalogButton = page.getByRole('button', { name: 'Unduh Katalog PDF', exact: true });
      await catalogButton.waitFor();
      assert.equal(await catalogButton.isEnabled(), true);
      // Tombol duduk tepat setelah sticky filter; klik DOM menghindari auto-
      // scroll Playwright yang justru menaruhnya di belakang header sticky.
      await catalogButton.evaluate(button => button.click());

      const coverDialog = page.getByRole('dialog', { name: 'Pilih cover katalog' });
      await coverDialog.waitFor();
      await coverDialog.getByText('Filter: September 2026 · 2 brosur', { exact: true }).waitFor();
      catalogDownloadStarted = true;
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 60_000 }),
        coverDialog.getByRole('button', { name: 'Unduh Katalog PDF', exact: true }).click(),
      ]);
      assert.match(download.suggestedFilename(), /^katalog-brosur-paket-.*september-2026.*\.pdf$/);

      const pdfPath = await download.path();
      assert.ok(pdfPath);
      const parser = new PDFParse({ data: await readFile(pdfPath) });
      try {
        await parser.load();
        const info = await parser.getInfo();
        assert.equal(info.total, 3, 'PDF harus berisi satu cover + dua brosur paket Ready');
        const screenshot = await parser.getScreenshot({
          partial: [1],
          desiredWidth: 540,
          imageDataUrl: false,
          imageBuffer: true,
        });
        const coverMetadata = await sharp(screenshot.pages[0].data).metadata();
        const photoCrop = await sharp(screenshot.pages[0].data)
          // Foto agen 100×100 berada pada ribbon terbawah; koordinat ini
          // mengambil bagian tengahnya pada render cover setengah ukuran.
          .extract({ left: 40, top: 760, width: 20, height: 20 })
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const channelTotals = [0, 0, 0];
        for (let offset = 0; offset < photoCrop.data.length; offset += photoCrop.info.channels) {
          channelTotals[0] += photoCrop.data[offset];
          channelTotals[1] += photoCrop.data[offset + 1];
          channelTotals[2] += photoCrop.data[offset + 2];
        }
        const pixelCount = photoCrop.info.width * photoCrop.info.height;
        const [red, green, blue] = channelTotals.map(total => total / pixelCount);
        assert.ok(
          red > 180 && green < 80 && blue > 100,
          `foto agen berwarna magenta harus benar-benar ikut diraster ke cover PDF `
            + `(cover ${coverMetadata.width}x${coverMetadata.height}; rgb ${red.toFixed(1)}, ${green.toFixed(1)}, ${blue.toFixed(1)})`,
        );
      } finally {
        await parser.destroy();
      }
      assert.equal(fullBrochureRequests, 2, 'setiap halaman PDF memakai brosur resolusi penuh');
      assert.equal(maxConcurrentFullBrochureRequests, 2, 'brosur penuh dalam batch harus dimuat paralel');
      assert.equal(thumbnailRequests, 0, 'thumbnail 400px tidak boleh dipakai bila brosur penuh berhasil');
      assert.ok(agentPhotoRequests >= 1, 'cover PDF harus memuat foto agen melalui URL same-origin');
    } finally {
      await context.close();
    }
  });

  test('native share reuses the prepared export Blob in SEAT mode', { timeout: 60_000 }, async () => {
    const context = await browser.newContext({
      acceptDownloads: true,
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      localStorage.setItem('brosurDesignId', 'classic');
      Object.defineProperty(navigator, 'canShare', {
        configurable: true,
        value: () => true,
      });
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async shareData => {
          const file = shareData.files[0];
          const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
          window.__sharedBrochure = {
            hash: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join(''),
            name: file.name,
            type: file.type,
          };
        },
      });
    });
    await page.route('**/api/ai-tools/brosur-jadwal-bulan', route => route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(apiPayload),
    }));

    try {
      await page.goto(`${appOrigin}/tests/fixtures/brochure-export-harness.html?mode=seat`);
      const preview = await previewDetails(page);
      await page.getByRole('button', { name: 'Simpan', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Share', exact: true }).click();
      await page.waitForFunction(() => Boolean(window.__sharedBrochure), null, { timeout: 10_000 });
      const shared = await page.evaluate(() => window.__sharedBrochure);
      await page.getByRole('button', { name: 'Simpan', exact: true }).click();
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 10_000 }),
        page.getByRole('menuitem', { name: 'Download', exact: true }).click(),
      ]);
      const downloadedPath = await download.path();
      assert.ok(downloadedPath);
      const downloadedBytes = await readFile(downloadedPath);

      assert.equal(shared.hash, sha256(downloadedBytes));
      assert.equal(shared.type, 'image/jpeg');
      assert.match(shared.name, /\.jpg$/);
      const difference = await visualDifference(preview.bytes, downloadedBytes);
      console.log('SEAT share visual difference', difference);
      assert.ok(difference.changedRatio < 0.05);
      assert.ok(difference.meanAbsoluteDifference < 5.5);
    } finally {
      await context.close();
    }
  });
});
