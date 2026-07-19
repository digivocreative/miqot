import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium, webkit } from 'playwright';
import sharp from 'sharp';
import { createServer } from 'vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
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
      await page.getByRole('button', { name: 'Unduh PDF', exact: true }).click();
      const coverDialog = page.getByRole('dialog', { name: 'Pilih cover katalog' });
      await coverDialog.waitFor();
      const [pdfDownload] = await Promise.all([
        page.waitForEvent('download', { timeout: 60_000 }),
        coverDialog.getByRole('button', { name: 'Unduh PDF', exact: true }).click(),
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
