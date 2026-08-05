import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  BANI_GLOSSARY_PROMPT_LIMIT,
  formatGlossaryForPrompt,
  loadBaniGlossary,
} from '../lib/bani-glossary.js';
import { buildBaniSystemPrompt } from '../lib/bani-orchestrator.js';

function stubSupabase(result) {
  const calls = [];
  const chain = {};
  for (const method of ['select', 'eq', 'order']) {
    chain[method] = (...args) => {
      calls.push([method, ...args]);
      return chain;
    };
  }
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return {
    calls,
    from(table) {
      calls.push(['from', table]);
      return chain;
    },
  };
}

const RAW_ENTRY = {
  istilah: 'tahun baru',
  sinonim: ['newyear', 'pergantian tahun'],
  tafsir: 'keberangkatan yang masih berjalan saat malam pergantian tahun',
  filter: {
    covers_date: '{{TAHUN_INI}}-12-31',
    berangkat_to: '{{TAHUN_DEPAN}}-02-28',
  },
};

test('loadBaniGlossary meresolusi tahun dari tanggal WIB yang diinjeksi', async () => {
  const supabase = stubSupabase({ data: [RAW_ENTRY], error: null });
  // Di UTC masih 31 Des 2026, tetapi di Jakarta sudah 1 Jan 2027.
  const entries = await loadBaniGlossary(supabase, {
    now: () => Date.parse('2026-12-31T18:30:00Z'),
  });

  assert.deepEqual(entries[0].filter, {
    covers_date: '2027-12-31',
    berangkat_to: '2028-02-28',
  });
  assert.ok(supabase.calls.some(([method, column, value]) => (
    method === 'eq' && column === 'aktif' && value === true
  )));
});

test('cache glossary memakai satu query dalam TTL tetapi tahun tetap diresolusi per panggilan', async () => {
  const supabase = stubSupabase({ data: [RAW_ENTRY], error: null });
  const sebelumTahunBaru = await loadBaniGlossary(supabase, {
    now: () => Date.parse('2026-12-31T16:58:00Z'),
  });
  const sesudahTahunBaru = await loadBaniGlossary(supabase, {
    now: () => Date.parse('2026-12-31T17:01:00Z'),
  });

  assert.equal(sebelumTahunBaru[0].filter.covers_date, '2026-12-31');
  assert.equal(sesudahTahunBaru[0].filter.covers_date, '2027-12-31');
  assert.equal(
    supabase.calls.filter(([method, table]) => method === 'from' && table === 'bani_glossary').length,
    1,
  );
});

test('gagal memuat glossary menghasilkan array kosong dan prompt tanpa bagian kamus', async () => {
  const supabase = stubSupabase({ data: null, error: { message: 'database tidak tersedia' } });
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(String(message));
  try {
    const entries = await loadBaniGlossary(supabase, { now: () => Date.parse('2026-08-05T00:00:00Z') });
    assert.deepEqual(entries, []);
    const prompt = buildBaniSystemPrompt(
      { name: 'Nikita' },
      { glossary: formatGlossaryForPrompt(entries) },
    );
    assert.doesNotMatch(prompt, /KAMUS ISTILAH AGENT/);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Kamus istilah gagal dimuat/);
});

test('formatGlossaryForPrompt membatasi kamus ke 40 baris', () => {
  const entries = Array.from({ length: 45 }, (_, index) => ({
    istilah: `istilah ${index + 1}`,
    sinonim: [`alias ${index + 1}`],
    tafsir: `tafsir ${index + 1}`,
    filter: { search: `kata ${index + 1}` },
  }));

  const lines = formatGlossaryForPrompt(entries).split('\n');
  assert.equal(BANI_GLOSSARY_PROMPT_LIMIT, 40);
  assert.equal(lines.length, 40);
  assert.match(lines[0], /^istilah 1 \(sinonim: alias 1\) → tafsir 1 → filter: /);
  assert.match(lines.at(-1), /^istilah 40 /);
  assert.ok(!lines.some((line) => line.startsWith('istilah 41 ')));
});

test('migration bani_glossary membuat indeks, RLS baca service role, dan seed relatif', () => {
  const sql = readFileSync(
    new URL('../migrations/20260805000000_bani_glossary.sql', import.meta.url),
    'utf8',
  );

  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.bani_glossary/i);
  assert.match(sql, /CREATE UNIQUE INDEX[\s\S]*bani_glossary \(istilah\)/i);
  assert.match(sql, /USING GIN \(sinonim\)/i);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /REVOKE ALL[\s\S]*anon, authenticated, service_role/i);
  assert.match(sql, /GRANT SELECT ON public\.bani_glossary TO service_role/i);
  assert.match(sql, /\{\{TAHUN_INI\}\}-12-31/);
  assert.match(sql, /\{\{TAHUN_DEPAN\}\}-02-28/);
  for (const istilah of ['tahun baru', 'salju', 'lebaran', 'libur sekolah', 'akhir tahun', 'awal tahun', 'plus turki', 'plus dubai', 'plus aqsha']) {
    assert.ok(sql.includes(`'${istilah}'`), `seed ${istilah} wajib ada`);
  }
});
