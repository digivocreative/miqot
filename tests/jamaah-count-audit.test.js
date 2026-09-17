import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  auditAgentJamaah,
  auditProblemCount,
  auditSignature,
  compareHajiRows,
  compareUmrohRows,
  confirmAuditAcrossPasses,
  formatAuditAlert,
} from '../lib/jamaah-count-audit.js';
import { getHijriahYearFromGregorian } from '../lib/hijriah-years.js';

const NOW = Date.parse('2026-09-17T12:00:00+07:00');
const normalizeUmroh = (raw) => ({ id_umroh: raw.id_umrah, jm_id: raw.id_jamaah, nama: raw.nama, tgl_berangkat: raw.tgl_berangkat });
const normalizeHaji = (raw) => ({ id_haji: raw.id_haji, id_jamaah: raw.id_jamaah, nama: raw.nama });
const umroh = (idUmrah, idJamaah, tglBerangkat, tglDaftar = '2026-05-01 10:00:00') => ({ id_umrah: idUmrah, id_jamaah: idJamaah, nama: idJamaah, tgl_berangkat: tglBerangkat, tgl_daftar: tglDaftar });

test('umroh: rows never inserted, stale rows and wrong-year rows are each reported per year', () => {
  const result = compareUmrohRows({
    upstreamRows: [
      umroh('AIW1', 'JM1', '2026-03-27'),            // 1447, missing in DB (hjmia backfill gap)
      umroh('AIW2', 'JM2', '2026-10-03'),            // 1448, present
      umroh('AIW2', 'JM2', '2026-10-03'),            // bh+dh duplicate
      umroh('AIW3', 'JM3', '2027-08-01'),            // 1449 upstream, DB still says 1448
    ],
    dbRows: [
      { id_umroh: 'AIW2', jm_id: 'JM2', hijriah_year: '1448' },
      { id_umroh: 'AIW3', jm_id: 'JM3', hijriah_year: '1448' },
      { id_umroh: 'AIW9', jm_id: 'JM9', hijriah_year: '1448' },   // gone upstream (vikha-style stale)
      { id_umroh: 'AIW0', jm_id: 'JM0', hijriah_year: '1446' },   // outside audited years → ignored
    ],
    normalize: normalizeUmroh,
    hijriahYearOf: getHijriahYearFromGregorian,
    years: ['1447', '1448', '1449'],
    now: NOW,
  });
  assert.deepEqual(result.missing.map(r => r.jm_id), ['JM1']);
  assert.deepEqual(result.extra.map(r => r.jm_id), ['JM9']);
  assert.deepEqual(result.wrongYear.map(r => [r.jm_id, r.dbYear, r.yr]), [['JM3', '1448', '1449']]);
  assert.deepEqual(result.perYear['1447'], { upstream: 1, db: 0, missing: 1, extra: 0, wrongYear: 0 });
  assert.deepEqual(result.perYear['1448'], { upstream: 1, db: 3, missing: 0, extra: 1, wrongYear: 0 });
});

test('umroh: a registration minutes old is not "missing" yet, and ghost jm_ids are not expected', () => {
  const result = compareUmrohRows({
    upstreamRows: [umroh('AIW1', 'JM1', '2026-10-03', '2026-09-17 11:30:00'), umroh('AIW2', '__name_x', '2026-10-03')],
    dbRows: [],
    normalize: normalizeUmroh,
    hijriahYearOf: getHijriahYearFromGregorian,
    years: ['1448'],
    now: NOW,
  });
  assert.equal(result.missing.length, 0);
  assert.equal(result.unsyncable, 1);
});

test('haji: compares the universal list against every DB row', () => {
  const result = compareHajiRows({
    upstreamRows: [{ id_haji: 'HAJ1', id_jamaah: 'JM1' }, { id_haji: 'HAJ0000821', id_jamaah: 'JM2', tgl_daftar: '2022-07-29 11:02:05' }],
    dbRows: [{ id_haji: 'haj1', id_jamaah: 'jm1' }, { id_haji: 'HAJ0004894', id_jamaah: 'JM3' }],
    normalize: normalizeHaji,
    now: NOW,
  });
  assert.deepEqual(result.missing.map(r => r.id_haji), ['HAJ0000821']);
  assert.deepEqual(result.extra.map(r => r.id_haji), ['HAJ0004894']);
});

test('auditAgentJamaah skips the umroh comparison (and reports it) when a list fails — 403 inactive user', async () => {
  const forbidden = async () => { throw new Error('Upstream 403'); };
  const result = await auditAgentJamaah({ id: 'a1', slug: 'icha' }, {
    api: { umrohByKeberangkatan: forbidden, umrohByPendaftaran: forbidden, hajiAll: forbidden },
    loadDbRows: async () => { throw new Error('must not compare against a partial upstream'); },
    normalizeUmroh, normalizeHaji, hijriahYearOf: getHijriahYearFromGregorian, years: ['1448'], now: NOW,
  });
  assert.equal(result.umroh, undefined);
  assert.equal(result.haji, undefined);
  assert.equal(result.errors.length, 3);
  assert.equal(auditProblemCount(result), 3);
});

test('two-pass confirmation drops discrepancies that resolved within one sync cycle', () => {
  const first = { slug: 'nila', errors: [], umroh: { perYear: { 1448: { upstream: 5, db: 3, missing: 2, extra: 0, wrongYear: 0 } }, missing: [{ id_umroh: 'A', jm_id: 'J1', yr: '1448' }, { id_umroh: 'A', jm_id: 'J2', yr: '1448' }], extra: [], wrongYear: [] }, haji: { upstream: 1, db: 1, missing: [], extra: [{ id_haji: 'H', id_jamaah: 'J' }] } };
  const second = { slug: 'nila', errors: [], umroh: { perYear: { 1448: { upstream: 6, db: 4, missing: 2, extra: 0, wrongYear: 0 } }, missing: [{ id_umroh: 'A', jm_id: 'J2', yr: '1448' }, { id_umroh: 'B', jm_id: 'J9', yr: '1448' }], extra: [], wrongYear: [] }, haji: { upstream: 1, db: 1, missing: [], extra: [] } };
  const confirmed = confirmAuditAcrossPasses(first, second);
  assert.deepEqual(confirmed.umroh.missing, [{ id_umroh: 'A', jm_id: 'J2', yr: '1448' }]);
  assert.deepEqual(confirmed.umroh.perYear['1448'], { upstream: 6, db: 4, missing: 1, extra: 0, wrongYear: 0 });
  assert.deepEqual(confirmed.haji.extra, []);
  assert.equal(auditProblemCount(confirmed), 1);
});

test('alert text names each problem agent; a clean fleet produces no alert', () => {
  const clean = { slug: 'anne', errors: [], umroh: { perYear: { 1448: { upstream: 3, db: 3, missing: 0, extra: 0, wrongYear: 0 } }, missing: [], extra: [], wrongYear: [] }, haji: { upstream: 0, db: 0, missing: [], extra: [] } };
  assert.equal(formatAuditAlert([clean]), null);
  assert.equal(auditSignature([clean]), '');

  const vikha = { slug: 'vikha', errors: [], umroh: { perYear: { 1448: { upstream: 24, db: 53, missing: 0, extra: 29, wrongYear: 0 } }, missing: [], extra: new Array(29).fill({}), wrongYear: [] }, haji: { upstream: 27, db: 27, missing: [], extra: [] } };
  const hjmia = { slug: 'hjmia', errors: [], umroh: { perYear: { 1447: { upstream: 46, db: 0, missing: 46, extra: 0, wrongYear: 0 } }, missing: new Array(46).fill({}), extra: [], wrongYear: [] }, haji: { upstream: 23, db: 22, missing: [{}], extra: [] } };
  const icha = { slug: 'icha', errors: ['umroh bh/1448: Upstream 403'] };
  const text = formatAuditAlert([clean, vikha, hjmia, icha], { frozenYears: ['1447'] });
  assert.match(text, /3 agen/);
  assert.match(text, /vikha<\/b> — umroh 1448: 29 basi di DB \(Alhijaz 24 vs DB 53\)/);
  assert.match(text, /hjmia<\/b> — umroh 1447 \(beku\): 46 tak masuk DB/);
  assert.match(text, /haji: 1 tak masuk DB/);
  assert.match(text, /icha<\/b> — API Alhijaz menolak akun \(403\)/);
  assert.equal(auditSignature([vikha, hjmia, icha]), 'hjmia::46/0/0:1/0,icha:err:-:-,vikha::0/29/0:0/0');
});

