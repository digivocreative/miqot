/**
 * Harness browser untuk BrochurePromptModal — merender komponennya sungguhan di
 * chromium lalu menekan tombolnya seperti pengguna.
 *
 * Kenapa browser, bukan SSR seperti tests/fixtures/package-card-render.js:
 * perilaku yang dijaga di sini SELURUHNYA hidup di luar render-phase. File
 * brosur disiapkan di useEffect, tombolnya baru boleh bekerja setelah file itu
 * ada, dan hasilnya adalah panggilan navigator.share() dari sebuah click. SSR
 * tidak menjalankan satu pun dari ketiganya.
 *
 * Sebelumnya perilaku ini dijaga dengan mencocokkan teks sumber
 * BrochurePromptModal.tsx lewat regex — termasuk memaku label tombolnya
 * ('Menyiapkan...'). Menulis ulang label ke 'Sebentar...' membuat penjaganya
 * merah tanpa satu pun perilaku berubah, jadi merahnya berhenti bermakna.
 * Di sini yang diperiksa adalah payload share yang benar-benar sampai ke OS.
 *
 * navigator.share/canShare dan window.open di-stub SEBELUM modal di-mount:
 * canTryNativeChatGPTShare dihitung saat render, jadi stub yang datang
 * belakangan tidak akan terlihat oleh komponen.
 */
import { build } from 'esbuild';
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Entry + shim ditulis ke temp dir, jadi esbuild menelusuri node_modules dari
 * /private/var/... dan tidak menemukan apa pun; daftar inilah yang menambalnya.
 *
 * JANGAN menyusunnya sebagai join(ROOT, 'node_modules'): di git worktree, ROOT
 * adalah direktori worktree yang tidak punya node_modules sendiri, dan galat
 * "Could not resolve react" akan menutupi galat apa pun yang sedang dicari.
 */
const NODE_PATHS = createRequire(import.meta.url).resolve.paths('react').filter((dir) => existsSync(dir));

if (NODE_PATHS.length === 0) {
  throw new Error(
    'Tidak ada direktori node_modules di jalur penelusuran dari tests/fixtures/. ' +
    'Jalankan `npm install`; kalau ini git worktree, symlink node_modules repo utama ke sini.',
  );
}

/**
 * Sufiks '?url' adalah fitur Vite yang tidak dikenal esbuild: sufiksnya
 * diabaikan saat mencari berkas lalu impor default-nya gagal keras. Belum tentu
 * terpakai dari rantai impor modal ini, tapi satu berkas baru yang memakainya
 * cukup untuk mematikan seluruh harness — jadi tetap dipasang.
 */
const VITE_URL_NAMESPACE = 'vite-url-suffix-stub';

const viteUrlSuffix = {
  name: 'vite-url-suffix',
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /\?url$/ }, (args) => ({
      path: args.path,
      namespace: VITE_URL_NAMESPACE,
    }));
    pluginBuild.onLoad({ filter: /.*/, namespace: VITE_URL_NAMESPACE }, (args) => ({
      contents: `export default ${JSON.stringify(`/assets/${basename(args.path.replace(/\?url$/, ''))}`)};`,
      loader: 'js',
    }));
  },
};

/**
 * Penanda tombol share di BrochurePromptModal.tsx. Kalau hilang, perbarui
 * penandanya di komponen — jangan ganti ke pencarian berbasis label.
 */
export const SHARE_BUTTON = '[data-share-chatgpt]';

/** Nilai __APP_VERSION__ yang dibakar ke bundel harness. */
export const HARNESS_APP_VERSION = 'harness-9.9.9';

/**
 * Judul sengaja KAPITAL dan penuh token khas: prompt native menyalinnya apa
 * adanya, jadi ia sekaligus jadi probe kebocoran — kalau isi prompt sampai
 * ikut terkirim ke analytics, token ini yang tertangkap. Probe yang selamat
 * dari lowercase/slug tidak membuktikan apa pun.
 */
export const SCHEDULE_TITLE_SENTINEL = 'BROSUR SENTINEL ZQX 4417 SEPTEMBER';

/** Jadwal contoh; cukup untuk membuat prompt panjang melewati budget native share. */
export function sampleSchedule(overrides = {}) {
  return {
    title: SCHEDULE_TITLE_SENTINEL,
    displayMode: 'seat',
    packages: Array.from({ length: 13 }, (_, index) => ({
      nama: `PAKET UMROH RAHMAH ${index + 1} 12HR`,
      tgl: `${index + 1} September 2026`,
      hari: 12,
      seatSisa: 7 + index,
      harga: `mulai Rp ${33 + index}.900.000`,
      maskapai: 'SAUDIA AIRLINES',
      landing: 'Jeddah',
      hotel: ['Makkah: Movenpick Hajar Tower (★★★★★)', 'Madinah: Taiba Front Hotel (★★★★★)'],
    })),
    ...overrides,
  };
}

/** Prop BrochurePromptModal untuk konteks Brosur Jadwal (jalur getReferenceImageFile). */
export function schedulePromptProps(overrides = {}) {
  return {
    agent: { name: 'Agen Test', phone: '6281234567890', website: 'alhijaz.test/agen' },
    schedule: sampleSchedule(),
    context: 'schedule',
    title: 'Brosur Sentinel',
    ...overrides,
  };
}

let bundlePromise = null;

async function buildHarnessBundle() {
  // realpath: di macOS tmpdir() lewat symlink (/var → /private/var), dan esbuild
  // memakai path dari plugin apa adanya — shim yang sama bisa terbundel dua kali.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'brochure-prompt-modal-')));
  process.once('exit', () => rmSync(dir, { recursive: true, force: true }));

  const entryPath = join(dir, 'entry.tsx');
  const analyticsShim = join(dir, 'analytics-shim.js');

  // trackEvent asli berhenti lebih awal tanpa sesi login, jadi tidak ada bukti
  // apa pun yang bisa dibaca tes. Shim ini merekamnya apa adanya.
  writeFileSync(analyticsShim, `
    export const trackedEvents = [];
    export async function trackEvent(eventType, eventName, metadata = {}) {
      trackedEvents.push({ eventType, eventName, metadata });
    }
    export async function trackPublicEvent(slug, eventName, metadata = {}) {
      trackedEvents.push({ eventType: 'public', eventName, metadata: { ...metadata, slug } });
    }
  `);

  writeFileSync(entryPath, `
    import { createElement } from 'react';
    import { createRoot } from 'react-dom/client';
    import { BrochurePromptModal } from '@/components/BrochurePromptModal';
    import { trackedEvents } from ${JSON.stringify(analyticsShim)};

    /** File brosur "asli": isinya unik supaya ukuran & nama ikut terbukti lolos. */
    function referenceFile() {
      const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 66, 82, 79, 83, 85, 82]);
      return new File([bytes], 'brosur-acuan.png', { type: 'image/png' });
    }

    let releaseReferenceFile = null;

    export function mount(props, options = {}) {
      trackedEvents.length = 0;
      const host = document.createElement('div');
      document.body.appendChild(host);

      const file = referenceFile();
      const pending = new Promise((resolve) => { releaseReferenceFile = () => resolve(file); });
      if (!options.holdReferenceFile) releaseReferenceFile();

      createRoot(host).render(
        createElement(BrochurePromptModal, {
          isOpen: true,
          onClose: () => {},
          getReferenceImageFile: () => pending,
          title: 'Brosur Uji',
          ...props,
        }),
      );
      return { name: file.name, type: file.type, size: file.size };
    }

    export function releaseFile() {
      releaseReferenceFile?.();
    }

    export { trackedEvents };
  `);

  const shims = {
    name: 'brochure-prompt-modal-shims',
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /(^|\/)utils\/analytics$/ }, () => ({ path: analyticsShim }));
    },
  };

  const outfile = join(dir, 'bundle.js');
  await build({
    entryPoints: [entryPath],
    outfile,
    bundle: true,
    format: 'iife',
    globalName: 'BrochurePromptHarness',
    platform: 'browser',
    jsx: 'automatic',
    absWorkingDir: ROOT,
    alias: { '@': join(ROOT, 'src') },
    nodePaths: NODE_PATHS,
    plugins: [shims, viteUrlSuffix],
    define: {
      'process.env.NODE_ENV': '"production"',
      'import.meta.env': '{}',
      // Di prod nilai ini disuntik vite. Tanpa define, komponen jatuh ke 'dev'
      // dan asersi app_version tidak lagi membuktikan penanda bundle ikut terkirim.
      __APP_VERSION__: JSON.stringify(HARNESS_APP_VERSION),
    },
    loader: {
      '.webp': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl',
      '.jpeg': 'dataurl', '.svg': 'dataurl', '.css': 'empty',
    },
    logLevel: 'silent',
  });

  return outfile;
}

/**
 * Buka satu halaman berisi modal yang sudah ter-mount, lalu serahkan ke `body`.
 *
 * @param {object} opts
 * @param {object} [opts.props]        prop tambahan untuk BrochurePromptModal
 * @param {boolean} [opts.nativeShare] pasang navigator.share/canShare (default true)
 * @param {boolean} [opts.holdReferenceFile] tahan penyiapan file sampai releaseFile()
 * @param {'ok'|'abort'|'fail'} [opts.shareResult] hasil navigator.share
 * @param {boolean} [opts.canShareResult] paksa navigator.canShare menolak payload
 */
export async function withPromptModal(opts, body) {
  const {
    props = {},
    nativeShare = true,
    holdReferenceFile = false,
    shareResult = 'ok',
    canShareResult = true,
  } = opts;

  // Bundel dipakai ulang antar skenario; browser-nya TIDAK. Chromium yang
  // dibiarkan hidup menahan event loop node, dan `node --test` menggantung
  // selamanya setelah semua tes hijau — tanpa satu baris keluaran pun.
  bundlePromise ??= buildHarnessBundle();
  const bundle = await bundlePromise;
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><body></body></html>');

    // Stub dulu, mount belakangan: canTryNativeChatGPTShare dibaca saat render.
    await page.evaluate(({ nativeShare, shareResult, canShareResult }) => {
      window.__calls = { share: [], open: [], canShare: [] };
      window.open = (...args) => { window.__calls.open.push(args); return null; };
      if (!nativeShare) return;
      Object.defineProperty(navigator, 'canShare', {
        configurable: true,
        value: (data) => {
          window.__calls.canShare.push(Object.keys(data || {}).sort());
          if (!canShareResult) return false;
          return Array.isArray(data?.files) && data.files.length > 0;
        },
      });
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (data) => {
          window.__calls.share.push({
            keys: Object.keys(data).sort(),
            text: data.text,
            files: (data.files || []).map((f) => ({ name: f.name, type: f.type, size: f.size })),
          });
          if (shareResult === 'abort') {
            const err = new Error('share dibatalkan');
            err.name = 'AbortError';
            throw err;
          }
          if (shareResult === 'fail') throw new Error('share-gagal');
        },
      });
    }, { nativeShare, shareResult, canShareResult });

    await page.addScriptTag({ path: bundle });
    const file = await page.evaluate(
      ({ props, holdReferenceFile }) => window.BrochurePromptHarness.mount(props, { holdReferenceFile }),
      { props, holdReferenceFile },
    );

    // Dicari lewat penanda, BUKAN lewat labelnya: label tombol ini berubah
    // sesuai keadaan ('Sebentar...' / 'Memproses...' / 'ChatGPT'), dan justru
    // keadaan pending itulah yang perlu diperiksa.
    return await body({ page, file, chatgptButton: page.locator(SHARE_BUTTON) });
  } finally {
    await browser.close();
  }
}

/** Bebaskan file brosur yang ditahan. */
export async function releaseReferenceFile(page) {
  await page.evaluate(() => window.BrochurePromptHarness.releaseFile());
}

/** Tunggu sampai tombol share benar-benar bisa ditekan pengguna. */
export async function waitForShareButtonReady(page) {
  await page.waitForSelector(`${SHARE_BUTTON}:not([disabled])`);
}

/** Ringkasan panggilan navigator.share / window.open yang benar-benar terjadi. */
export function readCalls(page) {
  return page.evaluate(() => window.__calls);
}

/** Event analytics yang dikirim komponen (trackEvent asli di-shim jadi perekam). */
export function readTrackedEvents(page) {
  return page.evaluate(() => window.BrochurePromptHarness.trackedEvents.map((e) => ({ ...e })));
}
