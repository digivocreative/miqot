import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const packageCard = fs.readFileSync(
  new URL('../src/components/PackageCard.tsx', import.meta.url),
  'utf8',
);
const cardVariants = fs.readFileSync(
  new URL('../src/components/CardVariants.tsx', import.meta.url),
  'utf8',
);
const indexCss = fs.readFileSync(
  new URL('../src/index.css', import.meta.url),
  'utf8',
);

test('jadwal card animates intrinsic detail height without a post-render measurement', () => {
  assert.match(packageCard, /height: isExpanded \? 'auto' : 0/);
  assert.match(packageCard, /height: \{ duration: 0\.36, ease:/);
  assert.doesNotMatch(packageCard, /contentHeight|scrollHeight/);
});

test('jadwal card keeps the seat row mounted while expanding', () => {
  assert.equal(packageCard.match(/<SeatAndDateSection isFooter=\{false\} \/>/g)?.length, 1);
  assert.equal(cardVariants.match(/<SeatAndDateSection isFooter=\{false\} \/>/g)?.length, 5);
  assert.doesNotMatch(packageCard, /\{isExpanded && <div className="mb-3"><SeatAndDateSection/);
  assert.doesNotMatch(cardVariants, /!isExpanded && <SeatAndDateSection/);
});

test('seat progress stripes use a seamless, GPU-friendly animation tile', () => {
  assert.match(packageCard, /linear-gradient\(135deg,/);
  assert.match(packageCard, /backgroundSize: '16px 16px'/);
  assert.match(packageCard, /willChange: 'background-position'/);
  assert.match(indexCss, /@keyframes stripe-move[\s\S]*100% \{ background-position: 16px 0; \}/);
});
