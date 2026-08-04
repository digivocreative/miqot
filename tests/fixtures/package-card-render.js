/**
 * Harness SSR untuk PackageCard — merender komponennya sungguhan di node.
 *
 * Kenapa ada: perilaku kartu dulu diuji dengan mencocokkan teks sumber
 * PackageCard.tsx lewat regex. Pola itu ikut merah setiap kali kodenya ditulis
 * ulang walau perilakunya tidak berubah, jadi merahnya berhenti bermakna dan
 * beberapa tes basi diam-diam. Di sini tes membaca HASIL render, bukan ejaan
 * kodenya.
 *
 * SSR sengaja dipilih (bukan DOM penuh): useEffect TIDAK berjalan. Itu justru
 * yang ingin dikunci — mount blok brosur wajib render-phase supaya framer-motion
 * mengukur tinggi target yang benar saat animasi expand mulai. Kalau gate-nya
 * dipindah ke useEffect, HTML hasil render langsung kehilangan blok brosurnya
 * dan tesnya merah.
 *
 * Dua shim dipasang saat bundling:
 *  - react-dom → createPortal dirender inline. Server renderer React menolak
 *    portal (error #200); toast "Link tersalin" tidak ada hubungannya dengan
 *    yang diuji.
 *  - framer-motion → motion.* tetap merender anak-anaknya, tapi prop `animate`
 *    dan `transition` yang diterimanya direkam supaya tes bisa memeriksa
 *    konfigurasi animasi yang SUNGGUHAN dipakai, bukan angka yang dibaca dari
 *    teks sumber.
 */

// esbuild ikut terpasang bersama vite (bundler internalnya). Dipakai di sini
// karena PackageCard.tsx perlu di-transpile + di-resolve alias '@/' dan asetnya
// sebelum bisa diimpor node. Kalau suatu saat hilang, tes gagal keras di build.
import { build } from 'esbuild';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// createPortal dievaluasi saat render dan butuh target DOM. Cukup body kosong —
// isinya tidak pernah dipakai karena portalnya di-shim jadi inline.
globalThis.document ??= { body: {} };

let bundlePromise = null;

async function loadBundle() {
  // realpath: di macOS tmpdir() lewat symlink (/var → /private/var). esbuild me-resolve
  // symlink untuk impor biasa tapi memakai path dari plugin apa adanya, jadi shim yang
  // sama bisa terbundel dua kali — dan `recorded` yang dibaca tes jadi array yang lain.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'package-card-ssr-')));
  process.once('exit', () => rmSync(dir, { recursive: true, force: true }));

  const entryPath = join(dir, 'entry.tsx');
  const reactDomShim = join(dir, 'react-dom-shim.js');
  const motionShim = join(dir, 'framer-motion-shim.js');

  writeFileSync(entryPath, `
    import { createElement } from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import PackageCard from '@/components/PackageCard';
    import { recorded } from ${JSON.stringify(motionShim)};

    export function render(props) {
      recorded.length = 0;
      const html = renderToStaticMarkup(createElement(PackageCard, props));
      return { html, motion: recorded.slice() };
    }
  `);

  writeFileSync(reactDomShim, `
    import * as real from 'react-dom';
    export * from 'react-dom';
    export const createPortal = (children) => children;
    export default { ...real, createPortal };
  `);

  // Prop khusus framer-motion; jangan diteruskan ke elemen DOM.
  writeFileSync(motionShim, `
    import { createElement } from 'react';
    export * from 'framer-motion';

    export const recorded = [];

    const MOTION_ONLY = new Set([
      'initial', 'animate', 'exit', 'transition', 'variants', 'custom', 'inherit',
      'layout', 'layoutId', 'layoutDependency', 'layoutScroll', 'viewport',
      'whileHover', 'whileTap', 'whileFocus', 'whileDrag', 'whileInView',
      'drag', 'dragConstraints', 'dragElastic', 'dragMomentum', 'dragListener',
      'onAnimationStart', 'onAnimationComplete', 'onUpdate',
      'onViewportEnter', 'onViewportLeave', 'onLayoutAnimationComplete',
    ]);

    const cache = new Map();
    function shimFor(tag) {
      if (!cache.has(tag)) {
        cache.set(tag, function MotionShim({ children, ...props }) {
          recorded.push({ tag, props });
          const domProps = {};
          for (const [key, value] of Object.entries(props)) {
            if (!MOTION_ONLY.has(key)) domProps[key] = value;
          }
          return createElement(tag, domProps, children);
        });
      }
      return cache.get(tag);
    }

    export const motion = new Proxy({}, {
      get: (_target, tag) => (typeof tag === 'string' ? shimFor(tag) : undefined),
    });
    export const AnimatePresence = ({ children }) => children;
    export const useReducedMotion = () => false;
  `);

  const shims = {
    name: 'package-card-ssr-shims',
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^react-dom$/ }, (args) => (
        // undefined = biarkan esbuild me-resolve aslinya (dipakai shim sendiri)
        args.importer === reactDomShim ? undefined : { path: reactDomShim }
      ));
      pluginBuild.onResolve({ filter: /^framer-motion$/ }, (args) => (
        args.importer === motionShim ? undefined : { path: motionShim }
      ));
    },
  };

  const outfile = join(dir, 'bundle.mjs');
  await build({
    entryPoints: [entryPath],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    absWorkingDir: ROOT,
    alias: { '@': join(ROOT, 'src') },
    nodePaths: [join(ROOT, 'node_modules')],
    plugins: [shims],
    define: {
      'process.env.NODE_ENV': '"production"',
      'import.meta.env': '{}',
    },
    loader: {
      '.webp': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl',
      '.jpeg': 'dataurl', '.svg': 'dataurl', '.css': 'empty',
    },
    // Bundel ESM di temp dir: beberapa dependensi masih CJS dan memanggil
    // require() untuk modul bawaan node.
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    logLevel: 'silent',
  });

  return import(outfile);
}

const SAMPLE_FLIGHT = {
  tgl: '2026-09-03',
  jam: '10.25',
  rute: 'CGK - JED',
  kodePenerbangan: 'SV 819',
};

/** Paket contoh yang lengkap; cukup untuk merender kartu tanpa data eksternal. */
export function samplePackage(overrides = {}) {
  return {
    jadwalId: 'JBU1500',
    nama: 'UMROH RAHMAH 9 HARI',
    isPromo: false,
    seatTotal: 45,
    seatSisa: 17,
    maskapai: 'SAUDIA',
    keberangkatan: SAMPLE_FLIGHT,
    kepulangan: { ...SAMPLE_FLIGHT, tgl: '2026-09-11', rute: 'JED - CGK', kodePenerbangan: 'SV 820' },
    manasikTanggal: '2026-08-24',
    manasikJam: '09:00:00',
    brosurUrl: 'https://contoh.b-cdn.net/brosur-jbu1500.jpg',
    itineraryUrl: '',
    perlengkapanHarga: '0',
    harga: { RAHMAH: { Quard: '33900000', Triple: '34900000', Double: '36900000' } },
    hotel: {
      RAHMAH: {
        mekkah_hotel: 'GRAND AL MASSA', mekkah_bintang: '4', mekkah_jarak: '300m',
        madinah_hotel: 'AL EIMAN TAIBAH', madinah_bintang: '4', madinah_jarak: '150m',
      },
    },
    ...overrides,
  };
}

/**
 * Render satu PackageCard.
 * @returns {Promise<{ html: string, motion: Array<{ tag: string, props: Record<string, unknown> }> }>}
 *   `motion` = urutan prop yang diterima tiap komponen framer-motion saat render.
 */
export async function renderPackageCard({ package: pkg, ...props } = {}) {
  bundlePromise ??= loadBundle();
  const { render } = await bundlePromise;
  return render({ package: pkg ?? samplePackage(), ...props });
}

/** Ambil prop motion untuk elemen ber-atribut tertentu (mis. 'data-expand-panel'). */
export function motionPropsFor(frames, attribute) {
  const frame = frames.find((entry) => entry.props[attribute] !== undefined);
  if (!frame) {
    throw new Error(
      `Tidak ada komponen framer-motion ber-atribut ${attribute}. ` +
      'Atribut penanda itu ikut menghilang? Perbarui penandanya, jangan hapus tesnya.',
    );
  }
  return frame.props;
}
