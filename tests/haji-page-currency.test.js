import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url);
const hajiPage = readFileSync(join(root.pathname, 'src/components/HajiPage.tsx'), 'utf8');

test('Haji AWAPI monetary fields are formatted as USD, not Rupiah', () => {
  assert.match(hajiPage, /function formatUsd/);
  assert.match(hajiPage, /USD \$\{n\.toLocaleString\('id-ID'\)\}/);
  assert.doesNotMatch(hajiPage, /formatRupiah\(item\.(paket_harga|bayar|sisa)\)/);
});
