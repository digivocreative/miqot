import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('CalendarInsight does not render a runtime style tag for pulse animation', () => {
  const component = readFileSync(new URL('../src/components/CalendarInsight.tsx', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

  assert.doesNotMatch(component, /<style>/);
  assert.match(styles, /@keyframes pulse-glow/);
});
