import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAiCopyPrompts,
  formatTanggalIndonesia,
  parseAiCopyVersions,
} from '../lib/ai-copy-prompt.js';

test('formatTanggalIndonesia formats ISO dates with full Indonesian month names', () => {
  assert.equal(formatTanggalIndonesia('2026-08-28'), '28 Agustus 2026');
  assert.equal(formatTanggalIndonesia('2026-09-06T00:00:00.000Z'), '6 September 2026');
  assert.equal(formatTanggalIndonesia('2026-02-30'), '2026-02-30');
});

test('buildAiCopyPrompts sends readable dates for a single package', () => {
  const prompts = buildAiCopyPrompts({
    packageData: {
      nama: 'REGULER 9 HARI',
      keberangkatan: { tgl: '2026-08-28' },
      kepulangan: { tgl: '2026-09-06' },
    },
  });

  assert.match(prompts.systemPrompt, /\*28 Agustus 2026\*/);
  assert.match(prompts.userPrompt, /Tanggal Berangkat: 28 Agustus 2026/);
  assert.match(prompts.userPrompt, /Tanggal Pulang: 6 September 2026/);
  assert.doesNotMatch(prompts.userPrompt, /2026-08-28|2026-09-06/);
});

test('buildAiCopyPrompts sends readable full dates for brochure schedule rows', () => {
  const prompts = buildAiCopyPrompts({
    monthData: {
      label: 'Agustus 2026',
      packages: [{
        nama: 'REGULER 9 HARI',
        berangkat_tgl: '2026-08-28',
        maskapai: 'Garuda Indonesia',
      }],
    },
  });

  assert.match(prompts.userPrompt, /28 Agustus 2026/);
  assert.doesNotMatch(prompts.userPrompt, /2026-08-28|28 Agu 2026/);
});

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

test('parseAiCopyVersions normalizes machine-readable dates in AI output', () => {
  const content = JSON.stringify({
    versions: [{
      label: 'Urgensi',
      text: '🗓️ Berangkat *2026-08-28*\nPulang 06/09/2026',
    }],
  });

  assert.deepEqual(parseAiCopyVersions(content), [{
    label: 'Urgensi',
    text: '🗓️ Berangkat *28 Agustus 2026*\nPulang 6 September 2026',
  }]);
});
