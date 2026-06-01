import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rootPath = new URL('..', import.meta.url).pathname;
const source = readFileSync(
  join(rootPath, 'src/components/wa-copy/WaCopyPage.tsx'),
  'utf8',
);

test('WA Copy non-admin interactions show the same lock notice as Caption', () => {
  assert.match(source, /const LOCKED_MESSAGE = '🔒 Caption segera tersedia';/);
  assert.match(source, /const locked = !isAdmin;/);
  assert.match(source, /showToast\(LOCKED_MESSAGE\)/);
  assert.match(source, /onClickCapture=\{locked \? handleLockedInteraction : undefined\}/);
  assert.match(source, /onKeyDownCapture=\{locked \? handleLockedKeyDown : undefined\}/);
});

test('WA Copy non-admin surface is visually disabled while admin keeps normal icons', () => {
  assert.match(source, /icon: !isAdmin \? Lock : o\.icon/);
  assert.match(source, /aria-disabled=\{locked\}/);
  assert.match(source, /pointer-events-none select-none opacity-50/);
});
