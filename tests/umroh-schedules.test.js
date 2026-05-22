import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildScheduleRows,
  hasValidPricing,
  serializeScheduleRows,
} from '../lib/umroh-schedules.js';

test('hasValidPricing: accepts real package prices and rejects placeholders', () => {
  assert.equal(hasValidPricing({ HEMAT: { Quard: '28900000', Triple: '29900000' } }), true);
  assert.equal(hasValidPricing({ UHUD: { '': 'N/A' } }), false);
  assert.equal(hasValidPricing(null), false);
});

test('buildScheduleRows: upstream packages are authoritative while preserving CDN fields', () => {
  const cachedRows = [
    {
      jadwal_id: 'JBU1522',
      year_code: '1448',
      jadwal_nama: 'REGULER 9HR (KERETA CEPAT)',
      berangkat_tgl: '2026-07-11',
      seat_sisa: '66',
      seat_total: '90',
      brosur: 'https://origin/old-brosur.pdf',
      itinerary: 'https://origin/old-itinerary.pdf',
      brosur_cdn: 'https://cdn/brosur.pdf',
      itinerary_cdn: 'https://cdn/itinerary.pdf',
      synced_at: '2026-05-19T08:00:00.000Z',
    },
  ];
  const upstreamRows = [
    {
      jadwal_id: 'JBU1522',
      jadwal_nama: 'REGULER 9HR (KERETA CEPAT)',
      berangkat_tgl: '2026-07-11',
      seat_sisa: '20',
      seat_total: '45',
      brosur: 'https://origin/new-brosur.pdf',
      itinerary: 'https://origin/new-itinerary.pdf',
      paket_harga: { UHUD: { Quard: '33900000' } },
    },
    {
      jadwal_id: 'JBU1559',
      jadwal_nama: 'PROMO UMRAH 9 HARI',
      seat_sisa: '29',
      seat_total: '45',
      berangkat_tgl: '2026-07-11',
      paket_harga: { HEMAT: { Quard: '28900000' } },
    },
    {
      jadwal_id: 'DRAFT',
      jadwal_nama: 'DRAFT TANPA HARGA',
      paket_harga: { UHUD: { '': 'N/A' } },
    },
  ];

  const rows = buildScheduleRows(cachedRows, upstreamRows, '1448');

  assert.deepEqual(rows.map(row => row.jadwal_id), ['JBU1522', 'JBU1559']);
  assert.equal(rows[0].seat_sisa, '20');
  assert.equal(rows[0].seat_total, '45');
  assert.equal(rows[0].brosur, 'https://origin/new-brosur.pdf');
  assert.equal(rows[0].brosur_cdn, 'https://cdn/brosur.pdf');
  assert.equal(rows[0].itinerary_cdn, 'https://cdn/itinerary.pdf');
  assert.equal(rows[1].year_code, '1448');
});

test('buildScheduleRows: cached rows can be served without upstream data', () => {
  const cachedRows = [
    {
      jadwal_id: 'JBU1540',
      year_code: '1448',
      jadwal_nama: 'PROMO PLUS DUBAI 11 HARI',
      berangkat_tgl: '2026-07-12',
      paket_harga: { HEMAT: { Quard: '31200000' } },
      brosur_cdn: 'https://cdn/brosur.webp',
    },
  ];

  const rows = buildScheduleRows(cachedRows, null, '1448');

  assert.deepEqual(rows, cachedRows);
});

test('serializeScheduleRows: uses CDN URLs and strips storage-only fields', () => {
  const rows = serializeScheduleRows([
    {
      jadwal_id: 'JBU1522',
      year_code: '1448',
      jadwal_nama: 'REGULER 9HR',
      brosur: 'https://origin/brosur.pdf',
      itinerary: 'https://origin/itinerary.pdf',
      brosur_cdn: 'https://cdn/brosur.pdf',
      itinerary_cdn: 'https://cdn/itinerary.pdf',
      brosur_source_sha256: 'abcdef1234567890',
      brosur_source_bytes: 123,
      brosur_source_content_type: 'image/webp',
      brosur_cdn_synced_at: '2026-05-22T00:00:00.000Z',
      itinerary_source_sha256: '1234567890abcdef',
      itinerary_source_bytes: 456,
      itinerary_source_content_type: 'application/pdf',
      itinerary_cdn_synced_at: '2026-05-22T00:00:00.000Z',
      synced_at: '2026-05-19T08:00:00.000Z',
      manasik_tgl: null,
      paket_harga: { UHUD: { Quard: '33900000' } },
      paket_hotel: { UHUD: {} },
    },
  ], new Map([['JBU1522', ['Madinah', 'Umroh']]]));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].brosur, 'https://cdn/brosur.pdf?v=abcdef1234567890');
  assert.equal(rows[0].itinerary, 'https://cdn/itinerary.pdf?v=1234567890abcdef');
  assert.deepEqual(rows[0].journey_order, ['Madinah', 'Umroh']);
  assert.equal('brosur_cdn' in rows[0], false);
  assert.equal('itinerary_cdn' in rows[0], false);
  assert.equal('brosur_source_sha256' in rows[0], false);
  assert.equal('brosur_source_bytes' in rows[0], false);
  assert.equal('brosur_source_content_type' in rows[0], false);
  assert.equal('brosur_cdn_synced_at' in rows[0], false);
  assert.equal('itinerary_source_sha256' in rows[0], false);
  assert.equal('itinerary_source_bytes' in rows[0], false);
  assert.equal('itinerary_source_content_type' in rows[0], false);
  assert.equal('itinerary_cdn_synced_at' in rows[0], false);
  assert.equal('synced_at' in rows[0], false);
  assert.equal('year_code' in rows[0], false);
  assert.equal(rows[0].manasik_tgl, '');
});

test('serializeScheduleRows: appends CDN fingerprint version to URLs with existing query', () => {
  const rows = serializeScheduleRows([
    {
      jadwal_id: 'JBU1540',
      brosur: 'https://cdn/brosur/JBU1540.webp?foo=bar',
      brosur_cdn: 'https://cdn/brosur/JBU1540.webp?foo=bar',
      brosur_source_sha256: 'c1da861192806388ff04e27fede330d71f2b632cd5d154845fd56479e12e358b',
    },
  ]);

  assert.equal(
    rows[0].brosur,
    'https://cdn/brosur/JBU1540.webp?foo=bar&v=c1da861192806388'
  );
});

test('serializeScheduleRows: remains CDN-first when source URLs are also present', () => {
  const rows = serializeScheduleRows([
    {
      jadwal_id: 'JBU1540',
      year_code: '1448',
      jadwal_nama: 'PROMO PLUS DUBAI 11 HARI',
      brosur: 'https://origin/brosur-current.webp',
      itinerary: 'https://origin/itinerary-current.pdf',
      brosur_cdn: 'https://cdn/brosur-stale.webp',
      itinerary_cdn: 'https://cdn/itinerary-stale.pdf',
      paket_harga: { HEMAT: { Quard: '31200000' } },
      paket_hotel: { HEMAT: {} },
    },
  ], new Map());

  assert.equal(rows[0].brosur, 'https://cdn/brosur-stale.webp');
  assert.equal(rows[0].itinerary, 'https://cdn/itinerary-stale.pdf');
  assert.equal('brosur_cdn' in rows[0], false);
  assert.equal('itinerary_cdn' in rows[0], false);
});
