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

test('seat progress stripes use a seamless, GPU-friendly animation tile', () => {
  assert.match(packageCard, /linear-gradient\(135deg,/);
  assert.match(packageCard, /backgroundSize: '16px 16px'/);
  assert.match(packageCard, /willChange: 'background-position'/);
  assert.match(indexCss, /@keyframes stripe-move[\s\S]*100% \{ background-position: 16px 0; \}/);
});
