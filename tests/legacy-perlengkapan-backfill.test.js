import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  needsLegacyPerlengkapanBackfill,
  buildTglDaftarWindows,
  mapLegacyPerlengkapan,
  mergeLegacyPerlengkapan,
  matchLaporanItemToRow,
  planLegacyPerlengkapanPatches,
  isLegacyPerlengkapanBackfillDue,
} from '../lib/legacy-perlengkapan-backfill.js';

const TODAY = '2026-10-22';

// Bentuk item hasil parseLaporanHtml (laporan-api.js).
function laporanItem(overrides = {}) {
  return {
    id_umroh: 'AIW0031003',
    jm_id: 'JM999999990000069155',
    jm_id_hint: null,
    nama: 'ASWATI',
    perlengkapan: {
      batik: true, bergo: false, buku_doa: true, ikhram: false, koper: true,
      mukena: true, sabuk: false, syal: false, tas_paspor: true,
    },
    raw_data: { cols_count: 39 },
    ...overrides,
  };
}

function dbRow(overrides = {}) {
  return {
    id: 1,
    id_umroh: 'AIW0031003',
    jm_id: 'JM999999990000069155',
    nama: 'ASWATI',
    tgl_daftar: '2026-10-03',
    tgl_berangkat: '2026-11-29',
    perlengkapan: null,
    api_perlengkapan: null,
    ...overrides,
  };
}

test('needsLegacyPerlengkapanBackfill: upcoming jamaah with empty API perlengkapan', () => {
  assert.equal(needsLegacyPerlengkapanBackfill(dbRow(), { today: TODAY }), true);
  assert.equal(needsLegacyPerlengkapanBackfill(dbRow({ api_perlengkapan: {} }), { today: TODAY }), true);
  // Departure today still counts as upcoming.
  assert.equal(needsLegacyPerlengkapanBackfill(dbRow({ tgl_berangkat: TODAY }), { today: TODAY }), true);
});

test('needsLegacyPerlengkapanBackfill: skips departed, undated, and API-backed rows', () => {
  assert.equal(needsLegacyPerlengkapanBackfill(dbRow({ tgl_berangkat: '2026-10-21' }), { today: TODAY }), false);
  assert.equal(needsLegacyPerlengkapanBackfill(dbRow({ tgl_daftar: null }), { today: TODAY }), false);
  assert.equal(needsLegacyPerlengkapanBackfill(dbRow({ tgl_berangkat: null }), { today: TODAY }), false);
  assert.equal(
    needsLegacyPerlengkapanBackfill(dbRow({ api_perlengkapan: { koper: 1 } }), { today: TODAY }),
    false,
  );
});

test('needsLegacyPerlengkapanBackfill: stale API sync targets API-backed rows too', () => {
  assert.equal(
    needsLegacyPerlengkapanBackfill(dbRow({ api_perlengkapan: { koper: 1 } }), { today: TODAY, apiStale: true }),
    true,
  );
});

test('buildTglDaftarWindows: minimal 7-day windows with an exclusive end date', () => {
  assert.deepEqual(
    buildTglDaftarWindows(['2026-10-03', '2026-09-28', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-21', null, 'bogus']),
    [
      { tglAwal: '2026-09-28', tglAkhir: '2026-10-05' },
      // 5 Okt is the previous window's (exclusive) end, so it opens a new window.
      { tglAwal: '2026-10-05', tglAkhir: '2026-10-12' },
      { tglAwal: '2026-10-21', tglAkhir: '2026-10-28' },
    ],
  );
  assert.deepEqual(buildTglDaftarWindows([]), []);
});

test('buildTglDaftarWindows: crosses month boundaries in UTC date math', () => {
  assert.deepEqual(buildTglDaftarWindows(['2026-12-29']), [{ tglAwal: '2026-12-29', tglAkhir: '2027-01-05' }]);
});

test('mapLegacyPerlengkapan: web columns become AWAPI keys, bergo/syal dropped', () => {
  assert.deepEqual(mapLegacyPerlengkapan(laporanItem().perlengkapan), {
    batik: 1, 'buku doa': 1, ikhram: 0, koper: 1, mukena: 1, sabuk: 0, 'tas paspor': 1,
  });
  assert.equal(mapLegacyPerlengkapan(null), null);
  assert.equal(mapLegacyPerlengkapan({ bergo: true, syal: true }), null);
});

test('mergeLegacyPerlengkapan: web wins on shared items, API-only items kept', () => {
  const merged = mergeLegacyPerlengkapan(
    { madu: 1, batik: 0, koper: 1, sajadah: 1, tasbih: 0, 'buku doa': 0 },
    laporanItem().perlengkapan,
  );
  assert.deepEqual(merged, {
    madu: 1, sajadah: 1, tasbih: 0,
    batik: 1, 'buku doa': 1, ikhram: 0, koper: 1, mukena: 1, sabuk: 0, 'tas paspor': 1,
  });
});

test('mergeLegacyPerlengkapan: old legacy-format row collapses into one AWAPI format', () => {
  const merged = mergeLegacyPerlengkapan(
    { syal: false, batik: true, bergo: false, buku_doa: false, tas_paspor: false },
    laporanItem().perlengkapan,
  );
  assert.deepEqual(Object.keys(merged).sort(), ['batik', 'buku doa', 'ikhram', 'koper', 'mukena', 'sabuk', 'tas paspor']);
  assert.equal(merged['buku doa'], 1);
});

test('matchLaporanItemToRow: exact jm_id first, then unique nama, then jm_id_hint', () => {
  const rows = [
    dbRow({ id: 1, jm_id: 'JM999999990000069154', nama: 'AHMAD  SUPARDI' }),
    dbRow({ id: 2, jm_id: 'JM999999990000069155', nama: 'ASWATI' }),
    dbRow({ id: 3, jm_id: 'JM999999990000070001', nama: 'SITI' }),
    dbRow({ id: 4, jm_id: 'JM999999990000070002', nama: 'SITI' }),
  ];
  const byBooking = new Map([['AIW0031003', rows]]);

  assert.equal(matchLaporanItemToRow(laporanItem({ jm_id: 'jm999999990000069155' }), byBooking)?.id, 2);
  assert.equal(matchLaporanItemToRow(laporanItem({ jm_id: null, nama: 'AHMAD SUPARDI' }), byBooking)?.id, 1);
  assert.equal(matchLaporanItemToRow(laporanItem({ jm_id: null, nama: 'SITI' }), byBooking), null);
  assert.equal(matchLaporanItemToRow(laporanItem({ jm_id: null, nama: 'SITI', jm_id_hint: '70002' }), byBooking)?.id, 4);
  assert.equal(matchLaporanItemToRow(laporanItem({ id_umroh: 'AIW0000000' }), byBooking), null);
  // Name edited on the web after sync: the truncated jm_id suffix still matches.
  assert.equal(matchLaporanItemToRow(laporanItem({ jm_id: null, nama: 'ASWATTI', jm_id_hint: '69155' }), byBooking)?.id, 2);
  assert.equal(matchLaporanItemToRow(laporanItem({ jm_id: null, nama: 'ASWATTI', jm_id_hint: '99999' }), byBooking), null);
  // A full jm_id that is not in the booking never falls back to name matching.
  assert.equal(matchLaporanItemToRow(laporanItem({ jm_id: 'JM000' }), byBooking), null);
});

test('planLegacyPerlengkapanPatches: patches only rows whose perlengkapan changes', () => {
  const alreadySynced = mergeLegacyPerlengkapan(null, laporanItem().perlengkapan);
  const rows = [
    dbRow({ id: 1 }),
    dbRow({ id: 2, jm_id: 'JM2', nama: 'SAMA', perlengkapan: alreadySynced }),
  ];
  const items = [
    laporanItem(),
    laporanItem({ jm_id: 'JM2', nama: 'SAMA' }),
    laporanItem({ jm_id: 'JM-LAIN', nama: 'BUKAN TARGET' }),
    laporanItem({ jm_id: 'JM2', raw_data: { cols_count: 12 } }),
  ];

  const plan = planLegacyPerlengkapanPatches(rows, items);
  assert.deepEqual(plan.patches, [{ id: 1, perlengkapan: alreadySynced }]);
  assert.equal(plan.matched, 2);
  assert.equal(plan.unchanged, 1);
  assert.equal(plan.unmatched, 1);
  assert.equal(plan.skipped, 1);
});

test('planLegacyPerlengkapanPatches: nothing ticked on the web and nothing stored is not written', () => {
  const noneTaken = Object.fromEntries(Object.keys(laporanItem().perlengkapan).map(k => [k, false]));
  const plan = planLegacyPerlengkapanPatches(
    [dbRow({ id: 1 }), dbRow({ id: 2, jm_id: 'JM2', nama: 'LAMA', perlengkapan: { koper: 1 } })],
    [laporanItem({ perlengkapan: noneTaken }), laporanItem({ jm_id: 'JM2', nama: 'LAMA', perlengkapan: noneTaken })],
  );
  // Row 2 had data, so an all-unticked web row is a real change and is written.
  assert.deepEqual(plan.patches.map(p => p.id), [2]);
  assert.equal(plan.patches[0].perlengkapan.koper, 0);
  assert.equal(plan.unchanged, 1);
});

test('planLegacyPerlengkapanPatches: unchanged detection ignores JSONB key order', () => {
  const merged = mergeLegacyPerlengkapan(null, laporanItem().perlengkapan);
  const reordered = Object.fromEntries(Object.entries(merged).reverse());
  const plan = planLegacyPerlengkapanPatches([dbRow({ perlengkapan: reordered })], [laporanItem()]);
  assert.equal(plan.patches.length, 0);
  assert.equal(plan.unchanged, 1);
});

test('isLegacyPerlengkapanBackfillDue: never-run or older than 20h', () => {
  const now = Date.parse('2026-10-22T08:00:00Z');
  assert.equal(isLegacyPerlengkapanBackfillDue(null, now), true);
  assert.equal(isLegacyPerlengkapanBackfillDue(now - 21 * 3600 * 1000, now), true);
  assert.equal(isLegacyPerlengkapanBackfillDue(now - 2 * 3600 * 1000, now), false);
});
