// Penjaga patah-baris untuk keempat desain Brosur Jadwal.
//
// captureStableDom() merakit SVG-nya lewat domToForeignObjectSvg milik
// modern-screenshot — pipeline kloning yang sama dengan domToPng. Klon itu
// MEMAKU setiap kotak ke width/height hasil pengukuran DOM hidup, sehingga
// kotak teks yang shrink-to-fit (judul bulan inline-block, pil URL
// width:max-content, chip di kolom flex ber-align-center) kehilangan seluruh
// slack-nya. Begitu font di konteks render SVG mengukur teks sedikit lebih
// lebar, labelnya patah ke baris kedua dan menimpa elemen di bawahnya.
//
// Brosur justru lebih terpapar daripada kartu penawaran: fontnya di-embed ke
// SVG sebagai data URL, dan di WebKit sumbernya ditukar .woff2 → .ttf. Setiap
// jalur itu punya peluang mengukur teks sedikit berbeda dari DOM hidup.
//
// Teks yang MEMANG boleh banyak baris (kolom maskapai, nama agent di footer)
// dikecualikan HANYA kalau kotaknya berbatas — -webkit-line-clamp + overflow
// tersembunyi. Mencabut batas itu membuat tes ini merah, jadi "tinggi yang
// kebetulan pas satu baris" tidak bisa menyamar sebagai desain multi-baris.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer } from 'vite';

import { METRIC_DRIFT, describeWrapped, measureClonedTextLines, wrappedReadings } from './fixtures/export-wrap-probe.js';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const HARNESS = '/tests/fixtures/brochure-export-harness.html';
const PREVIEW = '[data-brochure-preview-page="0"]';

const DESIGNS = [
  { label: 'Klasik', id: 'classic' },
  { label: 'Boarding Pass', id: 'boarding' },
  { label: 'Serambi Nabawi', id: 'serambi' },
  { label: 'Tasbih Hijau', id: 'tasbih' },
];

// Opsi yang dipakai captureCanvasFromElement → captureStableDom di produksi.
// Font cssText sengaja tidak ikut: di sini klonnya dipasang ke dokumen yang
// SUDAH memuat font brosur (template membawa <style> @font-face-nya sendiri),
// bukan diraster sebagai SVG lepas.
const CAPTURE_OPTIONS = {
  width: 1080,
  height: 1620,
  scale: 1,
  style: { transform: 'none' },
  features: {
    copyScrollbar: false,
    removeAbnormalAttributes: true,
    removeControlCharacter: true,
  },
};

const basePackage = overrides => ({
  id: 'schedule',
  nama: 'UMROH RAHMAH 9 HARI',
  maskapai: 'SAUDIA AIRLINES',
  berangkat_tgl: '2026-09-03',
  pulang_tgl: '2026-09-11',
  hari: 9,
  seatSisa: 17,
  harga: 33_900_000,
  soldOut: false,
  landing: 'Jeddah',
  hotel: [
    { city: 'Mekkah', name: 'Movenpick Hajar Tower', stars: 5 },
    { city: 'Madinah', name: 'Frontel Al Harithia', stars: 4 },
  ],
  ...overrides,
});

const API_PAYLOAD = {
  agent: {
    slug: 'agen-uji',
    // Nama panjang disengaja: kolom nama di footer hanya ~350px, jadi inilah
    // yang membuktikan kotak nama agent benar-benar berbatas.
    name: 'Muhammad Abdurrahman Syarifuddin',
    phone: '628229000200',
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
      basePackage({ id: 's1' }),
      basePackage({ id: 's2', nama: 'UMROH PLUS TURKI ISTANBUL 12 HARI', maskapai: 'TURKISH AIRLINES', berangkat_tgl: '2026-09-06', pulang_tgl: '2026-09-17', hari: 12, seatSisa: 8, harga: 42_500_000, isPromo: true, landing: 'Madinah' }),
      basePackage({ id: 's3', nama: 'UMROH JUMATAIN HEMAT 16 HARI', maskapai: 'GARUDA INDONESIA', berangkat_tgl: '2026-09-09', pulang_tgl: '2026-09-24', hari: 16, seatSisa: 0, harga: 49_900_000, soldOut: true }),
      basePackage({ id: 's4', nama: 'UMROH PROMO AWAL TAHUN 10 HARI', maskapai: 'ETIHAD AIRWAYS', berangkat_tgl: '2026-09-12', pulang_tgl: '2026-09-21', hari: 10, seatSisa: 25, harga: 29_500_000, isPromo: true }),
      basePackage({ id: 's5', nama: 'UMROH UHUD 11 HARI', maskapai: 'QATAR AIRWAYS', berangkat_tgl: '2026-09-14', pulang_tgl: '2026-09-24', hari: 11, seatSisa: 4, harga: 36_900_000 }),
      basePackage({ id: 's6', nama: 'MIX PAKET RAHMAH & UHUD 13 HARI', maskapai: 'EMIRATES', berangkat_tgl: '2026-09-17', pulang_tgl: '2026-09-29', hari: 13, seatSisa: 12, harga: 38_400_000, landing: 'Madinah' }),
      basePackage({ id: 's7', nama: 'UMROH FULL RAMADHAN 30 HARI', maskapai: 'SAUDIA AIRLINES', berangkat_tgl: '2026-09-19', pulang_tgl: '2026-10-18', hari: 30, seatSisa: 31, harga: 57_500_000 }),
      // Harga null → "Hubungi kami" menggantikan angka harga.
      basePackage({ id: 's8', nama: 'WAITINGLIST', maskapai: '', berangkat_tgl: '2026-09-28', pulang_tgl: '', hari: null, seatSisa: 33, harga: null }),
    ],
  }],
};

let viteServer;
let browser;
let appOrigin;

async function openHarness(mode) {
  const context = await browser.newContext({ viewport: { width: 520, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.addInitScript(() => localStorage.setItem('brosurDesignId', 'classic'));
  await page.route('**/api/ai-tools/brosur-jadwal-bulan', route => route.fulfill({
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(API_PAYLOAD),
  }));

  await page.goto(`${appOrigin}${HARNESS}?mode=${mode}`);
  await page.locator(PREVIEW).waitFor({ state: 'visible', timeout: 45_000 });
  // Default halaman menyembunyikan paket sold-out; stempel "SOLD OUT" hanya
  // ikut terukur kalau baris itu benar-benar dirender.
  await page.getByRole('button', { name: 'Tampilkan semua paket' }).click();
  await page.locator(`${PREVIEW} >> text=SOLD OUT`).first().waitFor({ timeout: 15_000 });

  return { context, page, pageErrors };
}

async function selectDesign(page, design) {
  await page.getByRole('button', { name: design.label, exact: true }).click();
  await page.locator(`${PREVIEW}[data-brochure-design="${design.id}"]`).waitFor();
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

describe('Brosur Jadwal tahan selisih metrik font', { concurrency: false }, () => {
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

  // Kolom ketiga brosur berganti isi per mode: 'hari' menampilkan durasi,
  // 'seat' menampilkan sisa kursi ("SISA 4 SEAT!"). Keduanya chip shrink-to-fit
  // yang berbeda teks, jadi keduanya harus diuji.
  for (const mode of ['hari', 'seat']) {
    test(`mode ${mode}: tidak ada teks brosur yang patah baris di klon ekspor`, { timeout: 300_000 }, async () => {
      const { context, page, pageErrors } = await openHarness(mode);
      try {
        for (const design of DESIGNS) {
          const where = `${design.label}/${mode}`;
          await selectDesign(page, design);

          const baseline = await page.evaluate(measureClonedTextLines, {
            selector: PREVIEW,
            drift: 'normal',
            captureOptions: CAPTURE_OPTIONS,
          });

          // Prasyarat yang membuat tes ini bermakna: modern-screenshot memang
          // memaku kotak ke piksel. Kalau suatu saat tidak lagi, tes ini jadi
          // hampa dan harus dipikirkan ulang — bukan dibiarkan hijau diam-diam.
          assert.ok(
            baseline.pinnedBoxes >= 80,
            `${where}: klon harus memaku width+height ke piksel (ditemukan ${baseline.pinnedBoxes} kotak)`,
          );
          assert.ok(baseline.readings.length >= 50, `${where}: klon harus memuat simpul teks brosur`);
          // Pengecualian multi-baris harus benar-benar ada wujudnya; kalau
          // batasnya hilang dari template, ia berubah jadi pelanggaran di
          // assert berikutnya, bukan jadi kelonggaran yang menguap diam-diam.
          assert.ok(
            baseline.readings.some(reading => reading.bounded),
            `${where}: teks multi-baris brosur harus mengumumkan kotak berbatasnya (line-clamp + overflow)`,
          );
          const baselineWrapped = wrappedReadings(baseline.readings);
          assert.equal(
            baselineWrapped.length,
            0,
            `${where}: tanpa selisih font pun setiap teks harus satu baris atau berkotak batas:\n`
              + describeWrapped(baselineWrapped),
          );

          const drifted = await page.evaluate(measureClonedTextLines, {
            selector: PREVIEW,
            drift: METRIC_DRIFT,
            captureOptions: CAPTURE_OPTIONS,
          });
          const wrapped = wrappedReadings(drifted.readings);
          assert.equal(
            wrapped.length,
            0,
            `${where}: teks patah baris saat font render sedikit lebih lebar — baris kedua akan `
              + `menimpa elemen di bawahnya:\n${describeWrapped(wrapped)}`,
          );
        }

        assert.deepEqual(pageErrors, [], 'harness tidak boleh melempar error');
      } finally {
        await context.close();
      }
    });
  }
});
