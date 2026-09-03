// Penjaga kartu "Penawaran Simulasi Haji Plus".
//
// modern-screenshot mengkloning kartu lalu MEMAKU setiap kotak ke width/height
// hasil pengukuran DOM hidup (lihat assert "memaku" di bawah). Karena kotak teks
// di kartu ini ukurannya pas-pasan (shrink-to-fit), slack-nya nol: begitu font di
// konteks render mengukur teks sedikit lebih lebar daripada font saat pengukuran,
// teks patah ke baris kedua — dan karena height ikut dipaku, baris kedua itu
// menimpa elemen di bawahnya. Itulah gejala "DP/Pendaftaran" menindih "Dibayar
// sekarang" yang dilaporkan dari lapangan.
//
// Tes ini meniru selisih metrik font itu dengan menyuntik letter-spacing ke klon
// yang SUDAH dipaku, lalu menuntut tidak ada satu pun teks yang patah baris.
// Mekanik pengukurannya dipakai bersama penjaga poster Haji Plus & Brosur
// Jadwal — lihat tests/fixtures/export-wrap-probe.js.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer } from 'vite';

import { METRIC_DRIFT, describeWrapped, measureClonedTextLines, wrappedReadings } from './fixtures/export-wrap-probe.js';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const HARNESS = '/tests/fixtures/haji-offer-card-harness.html';
const CARD = '[data-haji-offer-card]';

const KURS_PAYLOAD = {
  success: true,
  data: { rates: { USD: 17800 }, updatedAt: '02/09/26 10:20' },
};

let viteServer;
let browser;
let appOrigin;

async function openHarness(paketLabel) {
  const context = await browser.newContext({ viewport: { width: 520, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.route('**/api/kurs', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(KURS_PAYLOAD),
  }));

  await page.goto(`${appOrigin}${HARNESS}`);
  await page.getByRole('button', { name: paketLabel, exact: false }).first().click();
  await page.getByPlaceholder('Masukkan nama lengkap').fill('Ibu Dini Kusumaningrum');
  await page.locator('[data-haji-offer-card]').waitFor();
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });

  return { context, page, pageErrors };
}

describe('Kartu penawaran Haji Plus tahan selisih metrik font', { concurrency: false }, () => {
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
    browser = await chromium.launch({ headless: true });
  }, { timeout: 60_000 });

  after(async () => {
    await browser?.close();
    await viteServer?.close();
  });

  for (const paket of ['RAHMAH', 'UHUD']) {
    test(`paket ${paket}: tidak ada teks yang patah baris di klon ekspor`, { timeout: 120_000 }, async () => {
      const { context, page, pageErrors } = await openHarness(paket);
      try {
        const baseline = await page.evaluate(measureClonedTextLines, { selector: CARD, drift: 'normal' });

        // Prasyarat yang membuat tes ini bermakna: modern-screenshot memang memaku
        // kotak ke piksel. Kalau suatu saat tidak lagi, tes ini jadi hampa dan
        // harus dipikirkan ulang — bukan dibiarkan hijau diam-diam.
        assert.ok(
          baseline.pinnedBoxes >= 20,
          `klon harus memaku width+height ke piksel (ditemukan ${baseline.pinnedBoxes} kotak)`,
        );
        assert.ok(baseline.readings.length >= 15, 'klon harus memuat simpul teks kartu');

        const baselineWrapped = wrappedReadings(baseline.readings);
        assert.equal(
          baselineWrapped.length,
          0,
          `tanpa selisih font pun kartu harus satu baris per label:\n${describeWrapped(baselineWrapped)}`,
        );

        const drifted = await page.evaluate(measureClonedTextLines, { selector: CARD, drift: METRIC_DRIFT });
        const driftedWrapped = wrappedReadings(drifted.readings);
        assert.equal(
          driftedWrapped.length,
          0,
          'teks patah baris saat font render sedikit lebih lebar — baris kedua akan '
            + `menimpa elemen di bawahnya:\n${describeWrapped(driftedWrapped)}`,
        );

        assert.deepEqual(pageErrors, [], 'harness tidak boleh melempar error');
      } finally {
        await context.close();
      }
    });
  }
});
