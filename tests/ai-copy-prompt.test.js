import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAiCopyVersions } from '../lib/ai-copy-prompt.js';

test('parseAiCopyVersions normalizes HTML and Unicode non-breaking spaces', () => {
  const content = JSON.stringify({
    versions: [{
      label: 'Urgensi',
      text: 'Paket&nbsp;Umroh&#160;Juli&#xA0;tersedia\u00a0sekarang&amp;nbsp;ya',
    }],
  });

  assert.deepEqual(parseAiCopyVersions(content), [{
    label: 'Urgensi',
    text: 'Paket Umroh Juli tersedia sekarang ya',
  }]);
});

test('parseAiCopyVersions also normalizes entities in plain-text fallback', () => {
  assert.deepEqual(parseAiCopyVersions('*Harga*&nbsp;mulai Rp 30 juta'), [{
    label: 'Caption',
    text: '*Harga* mulai Rp 30 juta',
  }]);
});
