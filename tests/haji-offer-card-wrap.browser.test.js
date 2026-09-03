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
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const HARNESS = '/tests/fixtures/haji-offer-card-harness.html';

// Selisih metrik font yang ditiru: 2% dari font-size per karakter, jadi setara di
// semua ukuran teks kartu (~4% lebih lebar per string). Nilai di lapangan lebih
// kecil dari ini, tapi kotak yang dipaku bocor pada selisih sekecil apa pun.
const METRIC_DRIFT = '0.06em';

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

// Menjalankan pipeline kloning yang asli, memasang klonnya ke dokumen dengan
// selisih metrik font, lalu melaporkan jumlah baris tiap simpul teks daun.
// Badan fungsi ini dieksekusi di dalam browser, jadi ia tidak boleh menutup
// variabel apa pun dari Node — `drift` wajib lewat argumen page.evaluate().
const measureClonedTextLines = async drift => {
  const card = document.querySelector('[data-haji-offer-card]');
  const svg = await window.__modernScreenshot.domToForeignObjectSvg(card, { scale: 1 });
  const clone = svg.querySelector('foreignObject > *');
  if (!clone) throw new Error('klon tidak ditemukan di dalam foreignObject');

  const stage = document.createElement('div');
  stage.id = '__wrap_probe__';
  stage.setAttribute('style', 'position:absolute;left:-99999px;top:0;');
  const nudge = document.createElement('style');
  // !important supaya menang atas letter-spacing inline yang ikut disalin ke klon.
  nudge.textContent = `#__wrap_probe__, #__wrap_probe__ * { letter-spacing: ${drift} !important; }`;
  stage.appendChild(clone);
  document.body.append(nudge, stage);

  const readings = [];
  let pinnedBoxes = 0;
  for (const el of clone.querySelectorAll('*')) {
    if (el.style.width.endsWith('px') && el.style.height.endsWith('px')) pinnedBoxes += 1;

    const children = Array.from(el.childNodes);
    const isTextLeaf = children.length > 0
      && children.every(node => node.nodeType === Node.TEXT_NODE)
      && el.textContent.trim().length > 0;
    if (!isTextLeaf) continue;

    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = Array.from(range.getClientRects()).filter(r => r.width > 0.5 && r.height > 0.5);
    const lines = new Set(rects.map(r => Math.round(r.top))).size;
    readings.push({ text: el.textContent.trim().slice(0, 48), lines });
  }

  stage.remove();
  nudge.remove();
  return { readings, pinnedBoxes };
};

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
        const baseline = await page.evaluate(measureClonedTextLines, 'normal');

        // Prasyarat yang membuat tes ini bermakna: modern-screenshot memang memaku
        // kotak ke piksel. Kalau suatu saat tidak lagi, tes ini jadi hampa dan
        // harus dipikirkan ulang — bukan dibiarkan hijau diam-diam.
        assert.ok(
          baseline.pinnedBoxes >= 20,
          `klon harus memaku width+height ke piksel (ditemukan ${baseline.pinnedBoxes} kotak)`,
        );
        assert.ok(baseline.readings.length >= 15, 'klon harus memuat simpul teks kartu');

        const baselineWrapped = baseline.readings.filter(r => r.lines !== 1);
        assert.deepEqual(baselineWrapped, [], 'tanpa selisih font pun kartu harus satu baris per label');

        const drifted = await page.evaluate(measureClonedTextLines, METRIC_DRIFT);
        const driftedWrapped = drifted.readings.filter(r => r.lines !== 1);
        assert.deepEqual(
          driftedWrapped,
          [],
          'teks patah baris saat font render sedikit lebih lebar — baris kedua akan menimpa elemen di bawahnya',
        );

        assert.deepEqual(pageErrors, [], 'harness tidak boleh melempar error');
      } finally {
        await context.close();
      }
    });
  }
});
