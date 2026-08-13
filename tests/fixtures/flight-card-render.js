/**
 * Harness SSR untuk FlightCard — merender komponennya sungguhan di node.
 *
 * Kenapa ada: yang diuji adalah ANGKA YANG TAMPIL di kartu (jam berangkat vs
 * jam tiba), bukan ejaan kodenya. Mencocokkan teks sumber FlightCard.tsx lewat
 * regex ikut merah tiap kali kartunya ditata ulang, jadi merahnya berhenti
 * bermakna. Di sini tes membaca HTML hasil render.
 *
 * Lebih sederhana daripada package-card-render.js: FlightCard tidak memakai
 * portal maupun framer-motion, jadi tak ada shim — cukup bundle + render.
 */

import { build } from 'esbuild';
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// Entry-nya ditulis di temp dir, jadi esbuild butuh diberi tahu di mana
// node_modules — lihat penjelasan panjangnya di package-card-render.js. Ringkasnya:
// JANGAN join(ROOT, 'node_modules'), karena di git worktree folder itu tak ada.
const NODE_PATHS = createRequire(import.meta.url).resolve.paths('react').filter((dir) => existsSync(dir));

if (NODE_PATHS.length === 0) {
  throw new Error(
    'Tidak ada direktori node_modules di jalur penelusuran dari tests/fixtures/. ' +
    'Jalankan `npm install`; kalau ini git worktree, symlink node_modules repo utama ke sini.',
  );
}

let bundlePromise = null;

async function loadBundle() {
  // realpath: di macOS tmpdir() lewat symlink (/var → /private/var), dan esbuild
  // memperlakukan path symlink dan path asli sebagai modul yang berbeda.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'flight-card-ssr-')));
  process.once('exit', () => rmSync(dir, { recursive: true, force: true }));

  const entryPath = join(dir, 'entry.tsx');
  writeFileSync(entryPath, `
    import { createElement } from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import FlightCard from '@/components/itinerary/FlightCard';

    export function render(props) {
      return renderToStaticMarkup(createElement(FlightCard, props));
    }
  `);

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
    nodePaths: NODE_PATHS,
    define: {
      'process.env.NODE_ENV': '"production"',
      'import.meta.env': '{}',
    },
    loader: { '.css': 'empty' },
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    logLevel: 'silent',
  });

  return import(outfile);
}

/**
 * Paket contoh: pergi CGK→MED langsung, pulang JED→CGK langsung. Jam memakai
 * titik seperti yang datang dari tabel jadwal (`berangkat_jam`/`pulang_jam`).
 */
export function samplePaket(overrides = {}) {
  return {
    maskapai: 'SAUDIA',
    keberangkatan: { tgl: '2026-09-05', jam: '15.50', rute: 'CGK - MED', kodePenerbangan: 'SV 821' },
    kepulangan: { tgl: '2026-09-13', jam: '16.00', rute: 'JED - CGK', kodePenerbangan: 'SV 818' },
    ...overrides,
  };
}

/** @returns {Promise<string>} HTML kartu penerbangan. */
export async function renderFlightCard({ paket, arrivals } = {}) {
  bundlePromise ??= loadBundle();
  const { render } = await bundlePromise;
  return render({ paket: paket ?? samplePaket(), arrivals });
}

/**
 * Potong HTML jadi satu baris leg. Penandanya teks kicker ("Berangkat" /
 * "Pulang") yang hanya muncul sekali masing-masing.
 */
export function legHtml(html, kick) {
  const start = html.indexOf(`>${kick}<`);
  if (start < 0) throw new Error(`Baris "${kick}" tidak ada di kartu penerbangan.`);
  const next = kick === 'Berangkat' ? html.indexOf('>Pulang<') : -1;
  return html.slice(start, next > start ? next : undefined);
}

/**
 * Belah satu baris leg jadi kolom keberangkatan (kiri) dan kedatangan (kanan).
 * Penandanya kelas `text-right` yang hanya dipakai kolom kedatangan — dipakai
 * untuk membuktikan jam berdiri di SISI yang benar, bukan sekadar ada.
 */
export function legSides(html, kick) {
  const leg = legHtml(html, kick);
  const parts = leg.split('text-right');
  if (parts.length !== 2) {
    throw new Error(`Kolom kedatangan baris "${kick}" tak dikenali (${parts.length - 1} penanda text-right).`);
  }
  return { kiri: parts[0], kanan: parts[1] };
}

/** Berapa kali sebuah teks muncul sebagai isi elemen (mis. ">16:00<"). */
export function countText(html, text) {
  return html.split(`>${text}<`).length - 1;
}

/**
 * Semua jam yang benar-benar TAMPIL, sesuai urutan render dan apa adanya —
 * termasuk pemisah titiknya. Dipakai supaya "16.00" dan "16:00" terbaca sebagai
 * dua jam yang tampil, bukan lolos karena ejaannya kebetulan berbeda.
 */
export function timesIn(html) {
  return [...html.matchAll(/>(\d{1,2}[.:]\d{1,2})</g)].map(m => m[1]);
}
