import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('dashboard no longer ships the CalendarInsight daily recap', () => {
  const layoutSource = readFileSync(
    new URL('../src/components/DashboardLayout.tsx', import.meta.url),
    'utf8',
  );
  const stylesSource = readFileSync(
    new URL('../src/index.css', import.meta.url),
    'utf8',
  );
  const componentPath = new URL('../src/components/CalendarInsight.tsx', import.meta.url);

  assert.equal(existsSync(componentPath), false);
  assert.doesNotMatch(layoutSource, /CalendarInsight/);
  assert.doesNotMatch(stylesSource, /pulse-glow/);
});
