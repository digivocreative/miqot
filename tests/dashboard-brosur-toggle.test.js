import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dashboardSource = readFileSync(new URL('../src/components/DashboardLayout.tsx', import.meta.url), 'utf8');

test('Brosur HARI/SEAT toggle buttons keep a small margin inside the toggle', () => {
  const toggleBlock = dashboardSource.match(/\{activeTab === 'brosur' && \([\s\S]*?\{\/\* Dark mode toggle \*\/\}/)?.[0] ?? '';

  assert.match(toggleBlock, /className="flex items-center h-9 rounded-lg bg-gray-100 dark:bg-slate-800 p-0\.5 shrink-0"/);
  assert.match(toggleBlock, /className=\{`h-7 m-0\.5 px-2\.5 inline-flex items-center justify-center rounded-md/);
  assert.doesNotMatch(toggleBlock, /className=\{`h-full px-2\.5 inline-flex/);
  assert.doesNotMatch(toggleBlock, /className=\{`px-2\.5 py-1 rounded-md/);
});
