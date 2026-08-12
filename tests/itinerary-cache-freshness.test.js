import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  canServeItineraryCache,
  itineraryCacheFreshness,
  pickCurrentItinerarySchedule,
} from '../lib/itinerary-cache-freshness.js';

test('cache dengan hash PDF yang sama boleh disajikan', () => {
  const cached = { source_sha256: 'ABC123' };
  const schedule = { itinerary_source_sha256: 'abc123' };

  assert.equal(itineraryCacheFreshness(cached, schedule), 'fresh');
  assert.equal(canServeItineraryCache(cached, schedule), true);
});

test('cache lama tidak boleh disajikan setelah hash PDF berubah', () => {
  const cached = { source_sha256: 'pdf-lama' };
  const schedule = { itinerary_source_sha256: 'pdf-baru' };

  assert.equal(itineraryCacheFreshness(cached, schedule), 'stale');
  assert.equal(canServeItineraryCache(cached, schedule), false);
});

test('cache legacy tanpa pembanding tetap fail-open sampai sumber ter-fingerprint', () => {
  assert.equal(
    itineraryCacheFreshness({ source_sha256: null }, { itinerary_source_sha256: null }),
    'unverified',
  );
  assert.equal(
    canServeItineraryCache({ source_sha256: null }, { itinerary_source_sha256: null }),
    true,
  );
});

test('cache legacy menjadi stale begitu hash sumber tersedia', () => {
  assert.equal(
    itineraryCacheFreshness({ source_sha256: null }, { itinerary_source_sha256: 'pdf-baru' }),
    'stale',
  );
});

test('row jadwal dengan hash dan CDN dipilih saat jadwal_id ada di dua tahun', () => {
  const picked = pickCurrentItinerarySchedule([
    { jadwal_id: 'JBU1589', year_code: '1448', itinerary: 'http://origin/old' },
    {
      jadwal_id: 'JBU1589',
      year_code: '1449',
      itinerary: 'http://origin/new',
      itinerary_cdn: 'https://cdn/new.pdf',
      itinerary_source_sha256: 'new-sha',
    },
  ]);

  assert.equal(picked.year_code, '1449');
});
