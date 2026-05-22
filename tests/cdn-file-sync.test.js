import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCdnMetadataUpdate,
  getCdnFileDecision,
} from '../lib/cdn-file-sync.js';

test('getCdnFileDecision: uploads when CDN URL is missing', () => {
  const decision = getCdnFileDecision({
    brosur: 'https://origin/brosur.webp',
    brosur_source_sha256: 'abc',
    brosur_source_bytes: 100,
  }, 'brosur', { sha256: 'abc', bytes: 100 });

  assert.deepEqual(decision, { action: 'upload', reason: 'missing_cdn' });
});

test('getCdnFileDecision: skips unchanged CDN file', () => {
  const decision = getCdnFileDecision({
    itinerary: 'https://origin/itinerary.pdf',
    itinerary_cdn: 'https://cdn/itinerary.pdf',
    itinerary_source_sha256: 'abc',
    itinerary_source_bytes: 100,
  }, 'itinerary', { sha256: 'abc', bytes: 100 });

  assert.deepEqual(decision, { action: 'skip', reason: 'unchanged' });
});

test('getCdnFileDecision: verifies existing CDN when fingerprint metadata is missing', () => {
  const decision = getCdnFileDecision({
    brosur: 'https://origin/brosur.webp',
    brosur_cdn: 'https://cdn/brosur.webp',
    brosur_source_sha256: null,
    brosur_source_bytes: null,
  }, 'brosur', { sha256: 'abc', bytes: 100 });

  assert.deepEqual(decision, { action: 'verify_cdn', reason: 'missing_metadata' });
});

test('getCdnFileDecision: uploads when source fingerprint changed', () => {
  const decision = getCdnFileDecision({
    brosur: 'https://origin/brosur.webp',
    brosur_cdn: 'https://cdn/brosur.webp',
    brosur_source_sha256: 'old',
    brosur_source_bytes: 100,
  }, 'brosur', { sha256: 'new', bytes: 100 });

  assert.deepEqual(decision, { action: 'upload', reason: 'source_changed' });
});

test('buildCdnMetadataUpdate: writes CDN and fingerprint metadata for one file type', () => {
  const update = buildCdnMetadataUpdate(
    'itinerary',
    'https://cdn/itinerary.pdf',
    { sha256: 'abc', bytes: 123, contentType: 'application/pdf' },
    '2026-05-22T00:00:00.000Z',
  );

  assert.deepEqual(update, {
    itinerary_cdn: 'https://cdn/itinerary.pdf',
    itinerary_source_sha256: 'abc',
    itinerary_source_bytes: 123,
    itinerary_source_content_type: 'application/pdf',
    itinerary_cdn_synced_at: '2026-05-22T00:00:00.000Z',
  });
});
