import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url);
const jamaahPage = readFileSync(join(root.pathname, 'src/components/JamaahPage.tsx'), 'utf8');

test('umroh filter drawer uses animated expand and collapse', () => {
  assert.match(jamaahPage, /<AnimatePresence initial=\{false\}>/);
  assert.match(jamaahPage, /key="umroh-filter-panel"/);
  assert.match(jamaahPage, /<motion\.div[\s\S]*initial=\{\{ height: 0, opacity: 0 \}\}/);
  assert.match(jamaahPage, /animate=\{\{ height: 'auto', opacity: 1 \}\}/);
  assert.match(jamaahPage, /exit=\{\{ height: 0, opacity: 0 \}\}/);
  assert.match(jamaahPage, /style=\{\{ overflow: 'hidden' \}\}/);
});
