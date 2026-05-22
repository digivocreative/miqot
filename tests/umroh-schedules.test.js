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
      synced_at: '2026-05-19T08:00:00.000Z',
      manasik_tgl: null,
      paket_harga: { UHUD: { Quard: '33900000' } },
      paket_hotel: { UHUD: {} },
    },
  ], new Map([['JBU1522', ['Madinah', 'Umroh']]]));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].brosur, 'https://cdn/brosur.pdf');
  assert.equal(rows[0].itinerary, 'https://cdn/itinerary.pdf');
  assert.deepEqual(rows[0].journey_order, ['Madinah', 'Umroh']);
  assert.equal('brosur_cdn' in rows[0], false);
  assert.equal('itinerary_cdn' in rows[0], false);
  assert.equal('synced_at' in rows[0], false);
  assert.equal('year_code' in rows[0], false);
  assert.equal(rows[0].manasik_tgl, '');
});

test('serializeScheduleRows: can prefer source URLs over stale CDN URLs', () => {
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
  ], new Map(), { preferSourceUrls: true });

  assert.equal(rows[0].brosur, 'https://origin/brosur-current.webp');
  assert.equal(rows[0].itinerary, 'https://origin/itinerary-current.pdf');
  assert.equal('brosur_cdn' in rows[0], false);
  assert.equal('itinerary_cdn' in rows[0], false);
});
