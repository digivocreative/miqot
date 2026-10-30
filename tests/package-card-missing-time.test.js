import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPackageCard, samplePackage } from './fixtures/package-card-render.js';

test('a schedule with missing flight times still renders its package card', async () => {
  const pkg = samplePackage();
  delete pkg.keberangkatan.jam;
  pkg.kepulangan.jam = null;
  const { html } = await renderPackageCard({ package: pkg });
  assert.match(html, /data-jadwal-id/);
  assert.match(html, /—/);
  assert.doesNotMatch(html, /undefined WIB|null WIB/);
});
