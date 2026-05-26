import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

async function loadHelper() {
  try {
    return await import('../lib/jamaah-phase1-enrichment.js');
  } catch (err) {
    assert.fail(`jamaah Phase 1 enrichment helper is missing: ${err.message}`);
  }
}

test('preserveUmrohPhase1Enrichment keeps existing passport and equipment data over empty Phase 1 values', async () => {
  const { preserveUmrohPhase1Enrichment } = await loadHelper();

  const row = {
    id_umroh: 'AIW1',
    jm_id: 'JM1',
    nama: 'Nina Test',
    bayar: 1000,
    wa: null,
    tgl_lahir: null,
    perlengkapan: {},
    dokumen: {},
    no_paspor: null,
    paspor_expired: null,
    hijriah_year: null,
  };
  const existing = {
    id_umroh: 'AIW1',
    jm_id: 'JM1',
    wa: '628123',
    tgl_lahir: '1980-01-02',
    perlengkapan: { koper: true, tas_paspor: true },
    dokumen: { paspor: true },
    no_paspor: 'C1234567',
    paspor_expired: '2031-01-02',
    hijriah_year: '1448',
  };

  assert.deepEqual(preserveUmrohPhase1Enrichment(row, existing), {
    ...row,
    wa: '628123',
    tgl_lahir: '1980-01-02',
    perlengkapan: { koper: true, tas_paspor: true },
    dokumen: { paspor: true },
    no_paspor: 'C1234567',
    paspor_expired: '2031-01-02',
    hijriah_year: '1448',
  });
});

test('preserveUmrohPhase1Enrichment initializes empty enrichment fields for new rows', async () => {
  const { preserveUmrohPhase1Enrichment } = await loadHelper();

  const row = {
    id_umroh: 'AIW2',
    jm_id: 'JM2',
    nama: 'New Jamaah',
    hijriah_year: null,
  };

  assert.deepEqual(preserveUmrohPhase1Enrichment(row, null), {
    ...row,
    wa: null,
    tgl_lahir: null,
    perlengkapan: {},
    dokumen: {},
    no_paspor: null,
    paspor_expired: null,
    hijriah_year: '1447',
  });
});

test('manual and background legacy Phase 1 paths use the shared enrichment preservation helper', () => {
  const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

  assert.ok(
    /import \{ preserveUmrohPhase1Enrichment \} from '\.\/lib\/jamaah-phase1-enrichment\.js'/.test(server),
    'server should import the shared Phase 1 enrichment preservation helper'
  );
  const mergeCalls = server.match(/mergeExistingUmrohPhase1Enrichment\(agentId, Array\.from\(deduped\.values\(\)\)\)/g) || [];
  assert.equal(mergeCalls.length, 2, 'manual and background Phase 1 should both merge existing enrichment');
});
