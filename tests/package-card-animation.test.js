import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { motionPropsFor, renderPackageCard } from './fixtures/package-card-render.js';

const packageCard = fs.readFileSync(
  new URL('../src/components/PackageCard.tsx', import.meta.url),
  'utf8',
);
const app = fs.readFileSync(
  new URL('../src/App.tsx', import.meta.url),
  'utf8',
);
const indexCss = fs.readFileSync(
  new URL('../src/index.css', import.meta.url),
  'utf8',
);

const expandPanel = (frames) => motionPropsFor(frames, 'data-expand-panel');

/** Baca satu angka dari sumber; gagal keras kalau patokannya pindah. */
function readMs(source, pattern, label) {
  const found = source.match(pattern);
  assert.ok(found, `${label} tidak ketemu lagi — perbarui patokannya, jangan lepas batasannya`);
  return Number(found[1]);
}

test('jadwal card animates intrinsic detail height without a post-render measurement', async () => {
  const closed = await renderPackageCard({ isExpanded: false });
  const open = await renderPackageCard({ isExpanded: true });

  // 'auto' = tinggi intrinsik yang diukur framer-motion sendiri saat animasi
  // mulai. Begitu ada pengukuran DOM sendiri, nilai ini berubah jadi angka px.
  assert.deepEqual(expandPanel(closed.motion).animate, { height: 0 });
  assert.deepEqual(expandPanel(open.motion).animate, { height: 'auto' });
  assert.doesNotMatch(packageCard, /contentHeight|scrollHeight/);
});

// Angkanya sengaja tidak dipatok — yang mengikat adalah dua batas di sekitarnya.
// Tes lama memakukan `duration: 0.36` lalu ikut merah waktu tween itu diganti
// spring, padahal justru animasinya yang membaik.
test('expand/collapse durations stay within the limits that bind them', async () => {
  const open = await renderPackageCard({ isExpanded: true });
  const closed = await renderPackageCard({ isExpanded: false });
  const expand = expandPanel(open.motion).transition.height;
  const collapse = expandPanel(closed.motion).transition.height;

  // Panel ini tinggi (±1500px): easing ber-start curam melompat ratusan px di
  // frame awal — terbaca "loncat", bukan animasi.
  assert.equal(expand.type, 'spring');
  assert.equal(expand.bounce, 0, 'pantulan di panel setinggi ini terbaca sebagai getar');

  // Collapse wajib selesai sebelum timer isSettledClosed memasang
  // content-visibility:auto; panel yang masih bergerak saat itu memicu celah
  // hantu WebKit.
  const settleMs = readMs(packageCard, /setIsSettledClosed\(true\), (\d+)\)/, 'timer isSettledClosed');
  const collapseMs = collapse.duration * 1000;
  assert.ok(
    collapseMs < settleMs,
    `collapse ${collapseMs}ms harus selesai sebelum isSettledClosed ${settleMs}ms`,
  );

  // Glide scroll di App.tsx berjalan berbarengan dengan panel yang membuka.
  const glideMs = readMs(app, /GLIDE_DURATION_MS = (\d+)/, 'GLIDE_DURATION_MS di App.tsx');
  const expandMs = expand.duration * 1000;
  assert.ok(
    Math.abs(expandMs - glideMs) <= 150,
    `expand ${expandMs}ms dan GLIDE_DURATION_MS ${glideMs}ms sudah tidak seirama`,
  );
});

test('jadwal card keeps the seat row mounted while expanding', () => {
  assert.equal(packageCard.match(/<SeatAndDateSection isFooter=\{false\} \/>/g)?.length, 1);
  assert.doesNotMatch(packageCard, /\{isExpanded && <div className="mb-3"><SeatAndDateSection/);
});

// Kartu yang di-skip content-visibility dilayout setinggi contain-intrinsic-size
// sampai ia pernah dirender sekali. Kalau angka itu bukan tinggi kartu tertutup yang
// sebenarnya, daftar di bawahnya bergeser sebanyak selisihnya tiap kartu pertama kali
// muncul — dan di iOS Safari tidak ada scroll anchoring yang meredamnya (overflow-anchor
// baru ada di Safari 27), jadi sentakannya sampai ke jari pengguna.
//
// Tes ini mengunci ARITMATIKANYA, bukan cuma angkanya: contain-intrinsic-size mengukur
// content-box, jadi ia harus sama dengan tinggi kartu tertutup dikurangi padding-bottom
// dan border kartu itu sendiri. Ubah pb-1/border-y dan tes ini merah — itu memang
// maunya, karena angkanya harus diukur ulang.
// Batasnya: tes ini TIDAK bisa menangkap penambahan baris di dalam kartu (tinggi 247px
// hanya bisa diukur di browser sungguhan). Kalau isi kartu berubah, ukur ulang manual.
test('skipped-card placeholder height matches the real closed-card height', () => {
  const CLOSED_CARD_H = 247; // diukur di WebKit 26 @375/390/430px (judul 1 baris, 40/44 paket)
  const PB_1 = 4;            // pb-1
  const BORDER_Y = 2;        // border-y (1px atas + 1px bawah)

  const declared = readMs(
    packageCard,
    /\[contain-intrinsic-size:auto_(\d+)px\]/,
    'contain-intrinsic-size di root kartu',
  );

  // Kelas yang jadi dasar hitungan di atas harus masih terpasang di root kartu.
  const rootClasses = packageCard.match(
    /bg-white dark:bg-slate-900 relative overflow-hidden cursor-pointer[^\n]*/,
  );
  assert.ok(rootClasses, 'baris kelas root kartu pindah — perbarui patokan tes ini');
  assert.match(rootClasses[0], /\bpb-1\b/, 'padding-bottom kartu berubah, ukur ulang tingginya');
  assert.match(rootClasses[0], /\bborder-y\b/, 'border kartu berubah, ukur ulang tingginya');

  assert.equal(
    declared + PB_1 + BORDER_Y,
    CLOSED_CARD_H,
    `placeholder ${declared}px + pb-1 + border-y harus pas ${CLOSED_CARD_H}px; ` +
      'meleset = daftar menyentak tiap kartu pertama kali muncul di iOS Safari',
  );
});

test('seat progress stripes use a seamless, GPU-friendly animation tile', () => {
  assert.match(packageCard, /linear-gradient\(135deg,/);
  assert.match(packageCard, /backgroundSize: '16px 16px'/);
  assert.match(packageCard, /willChange: 'background-position'/);
  assert.match(indexCss, /@keyframes stripe-move[\s\S]*100% \{ background-position: 16px 0; \}/);
});
