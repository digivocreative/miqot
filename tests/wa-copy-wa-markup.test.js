import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseWaLine, parseWaText } from '../src/components/wa-copy/lib/waMarkup.js';

const rootPath = new URL('..', import.meta.url).pathname;
const read = p => readFileSync(join(rootPath, p), 'utf8');

const span = (text, styles = {}) => ({
  text,
  bold: !!styles.bold,
  italic: !!styles.italic,
  strike: !!styles.strike,
  mono: !!styles.mono,
});

test('inline styles: bold, italic, strike, mono', () => {
  assert.deepEqual(parseWaLine('halo *dunia* ok'), [
    span('halo '), span('dunia', { bold: true }), span(' ok'),
  ]);
  assert.deepEqual(parseWaLine('_miring_'), [span('miring', { italic: true })]);
  assert.deepEqual(parseWaLine('~coret~'), [span('coret', { strike: true })]);
  assert.deepEqual(parseWaLine('```BSI 123```'), [span('BSI 123', { mono: true })]);
});

test('styles nest and combine', () => {
  assert.deepEqual(parseWaLine('*tebal _dua_*'), [
    span('tebal ', { bold: true }), span('dua', { bold: true, italic: true }),
  ]);
});

test('mono is verbatim — markers inside are not parsed', () => {
  assert.deepEqual(parseWaLine('```a *b* c```'), [span('a *b* c', { mono: true })]);
});

test('unmatched or invalid markers stay literal', () => {
  assert.deepEqual(parseWaLine('*tanpa tutup'), [span('*tanpa tutup')]);
  // space right inside the markers → arithmetic, not bold
  assert.deepEqual(parseWaLine('2 * 3 * 4'), [span('2 * 3 * 4')]);
  // word-glued underscores (snake_case, URL paths) stay literal
  assert.deepEqual(parseWaLine('cek wa_me_link ya'), [span('cek wa_me_link ya')]);
  // empty pair
  assert.deepEqual(parseWaLine('a ** b'), [span('a ** b')]);
});

test('formatting never crosses lines', () => {
  const lines = parseWaText('*buka\ntutup*');
  assert.deepEqual(lines[0].spans, [span('*buka')]);
  assert.deepEqual(lines[1].spans, [span('tutup*')]);
});

test('line kinds: bullet, number, quote, blank', () => {
  const lines = parseWaText('- satu\n* dua\n3. tiga\n> kutip *tebal*\n\nbiasa');
  assert.equal(lines[0].kind, 'bullet');
  assert.deepEqual(lines[0].spans, [span('satu')]);
  assert.equal(lines[1].kind, 'bullet');
  assert.equal(lines[2].kind, 'number');
  assert.equal(lines[2].number, 3);
  assert.equal(lines[3].kind, 'quote');
  assert.deepEqual(lines[3].spans, [span('kutip '), span('tebal', { bold: true })]);
  assert.deepEqual(lines[4], { kind: 'text', spans: [] }); // blank line preserved
  assert.equal(lines[5].kind, 'text');
});

test('placeholders pass through untouched for downstream chip rendering', () => {
  assert.deepEqual(parseWaLine('*Paket {paket}* mulai {harga}'), [
    span('Paket {paket}', { bold: true }), span(' mulai {harga}'),
  ]);
});

test('null/undefined input degrades to empty, not a throw', () => {
  assert.deepEqual(parseWaLine(null), []);
  assert.deepEqual(parseWaText(undefined), [{ kind: 'text', spans: [] }]);
});

test('markup is wired end-to-end: toolbar in all 3 editors, render on both sides', () => {
  // Admin editors: FormatToolbar wraps the textarea selection, preview renders markup.
  for (const [file, refName] of [
    ['src/components/wa-copy/admin/CaptionEditor.tsx', 'textareaRef'],
    ['src/components/wa-copy/admin/FaqEditor.tsx', 'answerRef'],
    ['src/components/wa-copy/admin/TourLeaderEditor.tsx', 'bodyRef'],
  ]) {
    const src = read(file);
    assert.match(src, /<FormatToolbar textareaRef=\{/, `${file} missing FormatToolbar`);
    assert.match(src, new RegExp(refName), `${file} missing ${refName}`);
  }
  // FAQ & Tour editors gained a preview; Caption already previews via PreviewText.
  assert.match(read('src/components/wa-copy/admin/FaqEditor.tsx'), /<WaMarkupText text=\{answer\}/);
  assert.match(read('src/components/wa-copy/admin/TourLeaderEditor.tsx'), /<WaMarkupText text=\{body\}/);
  // Caption preview composes markup + placeholder chips.
  assert.match(read('src/components/wa-copy/tabs/caption/PreviewText.tsx'), /WaMarkupText/);
  // Agent side renders markup; copy/share keep sending the raw text.
  const faqItem = read('src/components/wa-copy/tabs/faq/FaqAccordionItem.tsx');
  assert.match(faqItem, /<WaMarkupText text=\{entry\.answer\}/);
  assert.match(faqItem, /copyToClipboard\(entry\.answer\)/, 'copy must stay raw');
  const tourCard = read('src/components/wa-copy/tabs/tourleader/TourStepCard.tsx');
  assert.match(tourCard, /<WaMarkupText text=\{entry\.body\}/);
});
