import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const modalSource = readFileSync(new URL('../src/components/BrochurePromptModal.tsx', import.meta.url), 'utf8');

test('payload instrumentation runs BEFORE navigator.share so evidence survives cancel/failure', () => {
  const payloadEventIdx = modalSource.indexOf("trackEvent('feature', 'brochure_prompt_share_payload'");
  const shareCallIdx = modalSource.indexOf('await navigator.share(shareData)');
  assert.ok(payloadEventIdx > -1, 'payload event missing');
  assert.ok(shareCallIdx > -1, 'navigator.share call missing');
  assert.ok(payloadEventIdx < shareCallIdx, 'payload event must fire before navigator.share');
});

test('payload summary carries bundle + payload evidence without leaking prompt content', () => {
  const helper = modalSource.match(/function describeSharePayload[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(helper, /payload_fields: Object\.keys\(shareData\)\.sort\(\)\.join\(','\)/);
  assert.match(helper, /file_count: shareData\.files\?\.length \?\? 0/);
  assert.match(helper, /file_name: file\.name/);
  assert.match(helper, /file_type: file\.type/);
  assert.match(helper, /file_size: file\.size/);
  assert.match(helper, /app_version/);
  assert.match(helper, /display_mode/);
  assert.match(helper, /sw_controlled/);
  // Hanya panjang prompt yang boleh terkirim — bukan isinya.
  assert.doesNotMatch(helper, /nativeSharePrompt|prompt:/);
  const payloadEventBlock = modalSource.match(/trackEvent\('feature', 'brochure_prompt_share_payload',[\s\S]*?\);/)?.[0] ?? '';
  assert.match(payloadEventBlock, /prompt_length: nativeSharePrompt\.length/);
  assert.doesNotMatch(payloadEventBlock, /prompt: /);
});

test('share payload stays file-only via buildSingleImageShareData and cancel is tracked', () => {
  assert.match(modalSource, /const shareData = buildSingleImageShareData\(file\)/);
  // navigator.share tidak boleh menerima object literal dengan text/title/url.
  assert.doesNotMatch(modalSource, /navigator\.share\(\{/);
  assert.match(modalSource, /brochure_prompt_share_cancelled/);
});
