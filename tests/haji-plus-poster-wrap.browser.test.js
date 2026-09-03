// Penjaga poster infografis Haji Plus (HajiPlusExportPage → domToPng).
//
// Poster ini melewati pipeline modern-screenshot yang sama dengan kartu
// penawaran Simulasi Haji Plus: klonnya MEMAKU setiap kotak ke width/height
// hasil pengukuran DOM hidup. Kotak teks yang shrink-to-fit karenanya kehilangan
// seluruh slack-nya, dan selisih metrik font sekecil apa pun memecah labelnya
// jadi dua baris yang menimpa elemen di bawahnya.
//
// Lihat tests/fixtures/export-wrap-probe.js untuk mekanik pengukurannya.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer } from 'vite';

import { METRIC_DRIFT, describeWrapped, measureClonedTextLines, wrappedReadings } from './fixtures/export-wrap-probe.js';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const HARNESS = '/tests/fixtures/haji-plus-poster-harness.html';
const POSTER = '#export-poster';

// Poster-nya lebar-cair (width:100%) dengan font ber-px tetap, jadi layar
// SEMPIT-lah yang paling sedikit menyisakan slack. 360px = Android umum.
const VIEWPORT = { width: 360, height: 900 };

function buildSeries(key, label, years, base) {
  const items = years.map((year, index) => ({ year, pax: base + ((index * 137) % 900) }));
  const pax = items.map(item => item.pax);
  const total = pax.reduce((sum, value) => sum + value, 0);
  return {
    key,
    label,
    items,
    total,
    average: Math.round(total / items.length),
    peak: items[pax.indexOf(Math.max(...pax))],
    min: items[pax.indexOf(Math.min(...pax))],
    current: items[items.length - 1],
    realized: total,
    scheduled: 0,
    yearCount: items.length,
    firstYear: years[0],
    lastYear: years[years.length - 1],
  };
}

const STATS_PAYLOAD = {
  success: true,
  data: {
    items: [],
    series: {
      // Pendaftaran 11 tahun, keberangkatan 22 tahun — dua rentang berbeda
      // supaya jumlah tick sumbu X dan lebar kartu chart ikut diuji.
      terdaftar: buildSeries('terdaftar', 'Jamaah Terdaftar', Array.from({ length: 11 }, (_, i) => 2016 + i), 1200),
      berangkat: buildSeries('berangkat', 'Jamaah Berangkat', Array.from({ length: 22 }, (_, i) => 2005 + i), 800),
    },
    yearCount: 22,
    firstYear: 2005,
    lastYear: 2026,
    synced_at: '2026-09-03T03:00:00.000Z',
  },
};

let viteServer;
let browser;
let appOrigin;

describe('Poster Haji Plus tahan selisih metrik font', { concurrency: false }, () => {
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

  test('tidak ada label poster yang patah baris di klon ekspor', { timeout: 180_000 }, async () => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.route('**/api/haji-plus/data', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(STATS_PAYLOAD),
    }));

    try {
      await page.goto(`${appOrigin}${HARNESS}`);
      await page.locator(POSTER).waitFor();

      for (const series of ['Terdaftar', 'Berangkat']) {
        await page.getByRole('button', { name: series, exact: true }).click();
        for (const header of ['Magazine', 'Achievement', 'Contrast']) {
          const where = `${series}/${header}`;
          await page.getByRole('button', { name: header, exact: true }).click();
          await page.evaluate(async () => {
            await document.fonts?.ready;
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          });

          const baseline = await page.evaluate(measureClonedTextLines, { selector: POSTER, drift: 'normal' });

          // Prasyarat yang membuat tes ini bermakna: modern-screenshot memang
          // memaku kotak ke piksel. Kalau suatu saat tidak lagi, tes ini jadi
          // hampa dan harus dipikirkan ulang — bukan dibiarkan hijau diam-diam.
          assert.ok(
            baseline.pinnedBoxes >= 25,
            `${where}: klon harus memaku width+height ke piksel (ditemukan ${baseline.pinnedBoxes} kotak)`,
          );
          assert.ok(baseline.readings.length >= 10, `${where}: klon harus memuat simpul teks poster`);
          const baselineWrapped = wrappedReadings(baseline.readings);
          assert.equal(
            baselineWrapped.length,
            0,
            `${where}: tanpa selisih font pun poster harus satu baris per label:\n`
              + describeWrapped(baselineWrapped),
          );

          const drifted = await page.evaluate(measureClonedTextLines, { selector: POSTER, drift: METRIC_DRIFT });
          const wrapped = wrappedReadings(drifted.readings);
          assert.equal(
            wrapped.length,
            0,
            `${where}: teks patah baris saat font render sedikit lebih lebar — baris kedua akan `
              + `menimpa elemen di bawahnya:\n${describeWrapped(wrapped)}`,
          );
        }
      }

      assert.deepEqual(pageErrors, [], 'harness tidak boleh melempar error');
    } finally {
      await context.close();
    }
  });
});
