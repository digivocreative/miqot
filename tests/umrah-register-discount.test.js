import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { transformSync } from 'esbuild';

const page = readFileSync(new URL('../src/components/UmrahRegisterPage.tsx', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const laporanApi = readFileSync(new URL('../laporan-api.js', import.meta.url), 'utf8');

async function importTsModule(path) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const { code } = transformSync(source, {
    loader: 'ts',
    format: 'esm',
    sourcemap: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

test('Disc. Marketing is visible but optional on the jamaah registration form', () => {
  assert.match(page, /visible\?: boolean/);
  assert.match(page, /diskon:\s*\{ label: 'Disc\. Marketing'[\s\S]*visible: true/);
  assert.match(page, /diskon_marketing:\s*\{ label: 'Disc\. Marketing'[\s\S]*visible: true/);
  assert.match(page, /def\.required === true \|\| def\.visible === true/);
  assert.doesNotMatch(page, /diskon(?:_marketing)?:\s*\{[^}]*required: true/);
});

test('Disc. Marketing keeps its legacy field name and has no dummy-value action', () => {
  assert.match(page, /NO_INSERT_BTN_LABELS = new Set\(\[[^\]]*'Disc\. Marketing'/);
  assert.match(page, /const submitFields: Record<string, string> = \{ \.\.\.fields \}/);
  assert.match(page, /getFieldDef\(name\)\.label !== 'Disc\. Marketing'[\s\S]*submitFields\[name\] = normalizeMarketingDiscountInput\(submitFields\[name\]\)/);
  assert.doesNotMatch(page, /submitFields\.diskon(?:_marketing)?\s*=/);
});

test('marketing discount input formats its display while keeping raw digits in form state', () => {
  assert.match(page, /paket:\s*'Diskon'/);
  assert.match(page, /label === 'Disc\. Marketing'/);
  assert.match(page, /type="text"[\s\S]*inputMode="numeric"/);
  assert.match(page, /value=\{formatMarketingDiscountInput\(rawValue\)\}/);
  assert.match(page, /updateField\(name, normalizeMarketingDiscountInput\(e\.target\.value\)\)/);
  assert.match(page, /getInvalidMarketingDiscountFields\(\)/);
});

test('marketing discount helpers sanitize, format, clamp, and validate the supported range', async () => {
  const {
    MARKETING_DISCOUNT_MAX,
    MARKETING_DISCOUNT_MIN,
    MARKETING_DISCOUNT_QUICK_AMOUNTS,
    formatMarketingDiscountInput,
    getMarketingDiscountError,
    normalizeMarketingDiscountInput,
  } = await importTsModule('src/lib/marketingDiscount.ts');

  assert.equal(MARKETING_DISCOUNT_MIN, 10_000);
  assert.equal(MARKETING_DISCOUNT_MAX, 10_000_000);
  assert.deepEqual(MARKETING_DISCOUNT_QUICK_AMOUNTS, [300_000, 500_000, 1_000_000]);
  assert.equal(normalizeMarketingDiscountInput('Rp 10.000'), '10000');
  assert.equal(normalizeMarketingDiscountInput('abc500000xyz'), '500000');
  assert.equal(normalizeMarketingDiscountInput('10000001'), '10000000');
  assert.equal(formatMarketingDiscountInput('10000'), '10.000');
  assert.equal(formatMarketingDiscountInput('10000000'), '10.000.000');
  assert.equal(getMarketingDiscountError(''), '');
  assert.equal(getMarketingDiscountError('9999'), 'Minimal Rp 10.000');
  assert.equal(getMarketingDiscountError('10000'), '');
  assert.equal(getMarketingDiscountError('10000000'), '');
  assert.equal(getMarketingDiscountError('10000001'), 'Maksimal Rp 10.000.000');
});

test('marketing discount exposes all quick actions as non-submit buttons', () => {
  assert.match(page, /MARKETING_DISCOUNT_QUICK_AMOUNTS\.map\(amount/);
  assert.match(page, /key=\{amount\}[\s\S]*type="button"[\s\S]*selectDiscount\(amount\)/);
  assert.match(page, /grid grid-cols-3/);
});

test('marketing discount card omits the visible range hint and header divider', () => {
  assert.doesNotMatch(page, /discount-help/);
  assert.doesNotMatch(page, /Min\. \{formatMarketingDiscountRupiah/);
  assert.match(page, /const isDiscountSection = sec === 'paket'/);
  assert.match(page, /isDiscountSection[\s\S]*\? 'px-4 pt-4'[\s\S]*: 'px-4 py-2\.5 border-b/);
});

test('user-entered marketing discount survives enrichment and every internal submit path', () => {
  assert.match(page, /fields:\s*submitFields/);
  assert.match(server, /const enrichedFields = \{ \.\.\.fields \}/);
  assert.match(
    server,
    /enrichedFields\[name\] === undefined \|\| enrichedFields\[name\] === '' \|\| enrichedFields\[name\] === '0'/,
  );
  assert.match(server, /const commonSubmitPayload = \{\s*fields: enrichedFields/);
  assert.match(server, /commonPayload: commonSubmitPayload/);
  assert.match(server, /directPayload: directSubmitPayload/);
  assert.match(server, /submitBrowser: submitUmrahRegistrationWithBrowser/);
  assert.match(server, /submitDirect: submitUmrahRegistration/);
  assert.match(laporanApi, /for \(const \[key, value\] of Object\.entries\(fields\)\)/);
  assert.match(laporanApi, /for \(const \[name, value\] of Object\.entries\(fields \|\| \{\}\)\)/);
});
