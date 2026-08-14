import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isExpiredActiveProviderClaim,
  isFreshProviderFlight,
  isLiveProviderFlight,
  projectProviderEvidence,
  providerBackedDisplayStatus,
} from '../lib/flight-provider-freshness.js';

const now = Date.parse('2026-07-10T13:00:00Z');
const seconds = iso => Date.parse(iso) / 1000;

test('fresh en-route provider row remains live', () => {
  const row = { status: 'en-route', synced_at: '2026-07-10T12:36:44Z' };
  assert.equal(isFreshProviderFlight(row, now), true);
  assert.equal(isLiveProviderFlight(row, now), true);
  assert.equal(providerBackedDisplayStatus(row, now), 'en-route');
});

test('stale active provider row becomes unverified, never a stale operational claim', () => {
  for (const status of ['en-route', 'delayed']) {
    const row = { status, synced_at: '2026-07-10T10:00:00Z' };
    assert.equal(isFreshProviderFlight(row, now), false);
    assert.equal(providerBackedDisplayStatus(row, now), 'unverified');
  }
});

test('confirmed terminal status remains historical but no longer carries Live provenance', () => {
  const row = { status: 'landed', synced_at: '2026-07-10T04:59:00Z' };
  assert.equal(isFreshProviderFlight(row, now), false);
  assert.equal(isLiveProviderFlight(row, now), false);
  assert.equal(providerBackedDisplayStatus(row, now), 'landed');
});

test('recent scheduled and terminal provider rows are evidence, never LIVE tracking', () => {
  for (const status of ['scheduled', 'landed', 'cancelled']) {
    const row = { status, synced_at: '2026-07-10T12:30:00Z' };
    assert.equal(isFreshProviderFlight(row, now), true, status);
    assert.equal(isLiveProviderFlight(row, now), false, status);
  }
});

test('stale provider schedule cannot remain a current scheduled claim', () => {
  const row = {
    status: 'scheduled',
    synced_at: '2026-07-10T06:00:00Z',
    raw_api: { dep_time_ts: Date.parse('2026-07-10T14:00:00Z') / 1000 },
  };
  assert.equal(isFreshProviderFlight(row, now), false);
  assert.equal(providerBackedDisplayStatus(row, now), 'unverified');
});

test('re-fetching a frozen provider record cannot keep its in-flight claim alive', () => {
  // synced_at is OUR fetch clock; polling a dead record refreshes it every 5
  // minutes. Liveness must follow the provider's own `updated` clock.
  const row = {
    status: 'en-route',
    synced_at: '2026-07-10T12:57:00Z',
    raw_api: { updated: seconds('2026-07-10T00:30:00Z') },
  };
  assert.equal(isFreshProviderFlight(row, now), false);
  assert.equal(isLiveProviderFlight(row, now), false);
  assert.equal(providerBackedDisplayStatus(row, now), 'unverified');
});

test('an in-flight claim expires once its own arrival estimate is well past', () => {
  // Belt to the `updated` braces: a record that keeps ticking but never lands
  // and never pushes its ETA forward is not a credible in-flight claim.
  const row = {
    status: 'en-route',
    synced_at: '2026-07-10T12:57:00Z',
    raw_api: {
      updated: seconds('2026-07-10T12:55:00Z'),
      arr_estimated_ts: seconds('2026-07-10T10:00:00Z'),
    },
  };
  assert.equal(isExpiredActiveProviderClaim(row, now), true);
  assert.equal(providerBackedDisplayStatus(row, now), 'unverified');
  assert.equal(isLiveProviderFlight(row, now), false);
});

test('a tracked flight inside its arrival window stays in flight', () => {
  const row = {
    status: 'en-route',
    synced_at: '2026-07-10T12:57:00Z',
    raw_api: {
      updated: seconds('2026-07-10T12:55:00Z'),
      arr_estimated_ts: seconds('2026-07-10T13:30:00Z'),
    },
  };
  assert.equal(isExpiredActiveProviderClaim(row, now), false);
  assert.equal(isFreshProviderFlight(row, now), true);
  assert.equal(isLiveProviderFlight(row, now), true);
  assert.equal(providerBackedDisplayStatus(row, now), 'en-route');
});

test('a late arrival inside the grace window is still in flight, not unverified', () => {
  const row = {
    status: 'delayed',
    synced_at: '2026-07-10T12:57:00Z',
    raw_api: {
      updated: seconds('2026-07-10T12:55:00Z'),
      arr_estimated_ts: seconds('2026-07-10T12:00:00Z'),
    },
  };
  assert.equal(isExpiredActiveProviderClaim(row, now), false);
  assert.equal(providerBackedDisplayStatus(row, now), 'delayed');
});

test('scheduled and terminal rows never expire on the in-flight arrival guard', () => {
  const raw_api = { arr_estimated_ts: seconds('2026-07-10T04:00:00Z') };
  for (const status of ['scheduled', 'landed', 'cancelled']) {
    const row = { status, synced_at: '2026-07-10T12:57:00Z', raw_api };
    assert.equal(isExpiredActiveProviderClaim(row, now), false, status);
  }
});

test('SV819 13 Aug 2026: frozen Saudia record stops claiming Terbang', () => {
  // Real row that shipped the bug: AirLabs stopped updating 2h43m before the
  // scheduled arrival and left `status: en-route` with no arr_actual, while our
  // 5-minute poller kept re-stamping synced_at.
  const bugNow = Date.parse('2026-08-14T03:51:00Z');
  const row = {
    status: 'en-route',
    synced_at: '2026-08-14T03:48:12.484Z',
    raw_api: {
      status: 'en-route',
      updated: 1786634204,
      arr_actual: null,
      arr_time_ts: 1786651200,
      arr_estimated_ts: 1786651860,
      dep_actual_ts: 1786617540,
    },
  };
  assert.equal(providerBackedDisplayStatus(row, bugNow), 'unverified');
  assert.equal(isLiveProviderFlight(row, bugNow), false);
});

test('provider scheduled claim expires at departure even while its sync is fresh', () => {
  const base = {
    status: 'scheduled',
    synced_at: '2026-07-10T12:30:00Z',
  };
  assert.equal(providerBackedDisplayStatus({
    ...base,
    raw_api: { dep_time_ts: Date.parse('2026-07-10T14:00:00Z') / 1000 },
  }, now), 'scheduled');
  assert.equal(providerBackedDisplayStatus({
    ...base,
    raw_api: { dep_time_ts: now / 1000 },
  }, now), 'unverified');
  assert.equal(providerBackedDisplayStatus(base, now), 'unverified');
});

/**
 * server.js menyimpan baris provider di cache memori dan MEMBANGUNNYA ULANG tiap
 * pembacaan. Proyeksi lamanya cuma membawa `dep_time_ts`, sehingga di jalur cache
 * `updated` dan kedua stempel kedatangan hilang — dua penjaga baru jadi tak
 * bersenjata dan status hasil cache menimpa 'unverified' balik jadi 'en-route'.
 * Penerbangan yang sama menjawab beda tergantung kena cache atau tidak.
 *
 * Invariannya: proyeksi TIDAK BOLEH mengubah satu pun putusan penjaga.
 */
const EVIDENCE_CASES = [
  ['rekaman beku SV819', Date.parse('2026-08-14T03:51:00Z'), {
    status: 'en-route',
    synced_at: '2026-08-14T03:48:12.484Z',
    raw_api: {
      status: 'en-route',
      updated: 1786634204,
      arr_actual: null,
      arr_time_ts: 1786651200,
      arr_estimated_ts: 1786651860,
      dep_actual_ts: 1786617540,
    },
  }],
  ['en-route sehat di dalam jendela', now, {
    status: 'en-route',
    synced_at: '2026-07-10T12:57:00Z',
    raw_api: {
      updated: seconds('2026-07-10T12:55:00Z'),
      arr_estimated_ts: seconds('2026-07-10T13:30:00Z'),
      dep_actual_ts: seconds('2026-07-10T10:00:00Z'),
    },
  }],
  ['delayed di dalam masa tenggang', now, {
    status: 'delayed',
    synced_at: '2026-07-10T12:57:00Z',
    raw_api: {
      updated: seconds('2026-07-10T12:55:00Z'),
      arr_estimated_ts: seconds('2026-07-10T12:00:00Z'),
    },
  }],
  // Satu-satunya stempel kedatangannya arr_time_ts: kalau proyeksi menjatuhkan
  // field ini, kasus di atas tetap lolos lewat arr_estimated_ts-nya.
  ['kedaluwarsa hanya lewat arr_time_ts', now, {
    status: 'en-route',
    synced_at: '2026-07-10T12:57:00Z',
    raw_api: {
      updated: seconds('2026-07-10T12:55:00Z'),
      arr_time_ts: seconds('2026-07-10T10:00:00Z'),
    },
  }],
  ['scheduled sebelum berangkat', now, {
    status: 'scheduled',
    synced_at: '2026-07-10T12:30:00Z',
    raw_api: { dep_time_ts: seconds('2026-07-10T14:00:00Z') },
  }],
  ['scheduled yang sudah lewat jam berangkat', now, {
    status: 'scheduled',
    synced_at: '2026-07-10T12:30:00Z',
    raw_api: { dep_time_ts: seconds('2026-07-10T12:00:00Z') },
  }],
];

test('proyeksi bukti provider untuk cache tidak mengubah satu pun putusan penjaga', () => {
  for (const [label, at, row] of EVIDENCE_CASES) {
    const cached = { ...row, raw_api: projectProviderEvidence(row.raw_api) };
    assert.equal(
      providerBackedDisplayStatus(cached, at),
      providerBackedDisplayStatus(row, at),
      `status ${label}`,
    );
    assert.equal(isLiveProviderFlight(cached, at), isLiveProviderFlight(row, at), `live ${label}`);
    assert.equal(
      isExpiredActiveProviderClaim(cached, at),
      isExpiredActiveProviderClaim(row, at),
      `kedaluwarsa ${label}`,
    );
  }
});

test('rekaman beku tetap unverified lewat jalur cache, bukan hidup lagi jadi Terbang', () => {
  const [, at, row] = EVIDENCE_CASES[0];
  const cached = { ...row, raw_api: projectProviderEvidence(row.raw_api) };
  // Anti-asersi hampa: proyeksi yang mengembalikan null juga membuat kedua sisi
  // sama-sama 'unverified' di tes di atas — di sini buktinya harus benar-benar terbawa.
  assert.equal(cached.raw_api?.updated, 1786634204);
  assert.equal(cached.raw_api?.arr_estimated_ts, 1786651860);
  assert.equal(providerBackedDisplayStatus(cached, at), 'unverified');
  assert.equal(isLiveProviderFlight(cached, at), false);
});

test('proyeksi membuang payload kosong dan field non-bukti', () => {
  assert.equal(projectProviderEvidence(null), null);
  assert.equal(projectProviderEvidence({}), null);
  // Field non-bukti dibuang; bukti dipertahankan apa adanya.
  assert.deepEqual(projectProviderEvidence({ airline_name: 'SAUDIA', updated: 1786634204 }), {
    updated: 1786634204,
  });
});
