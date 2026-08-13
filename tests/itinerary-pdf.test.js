import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeJam,
  flightLegView,
  priceRows,
  canRenderItineraryPdf,
} from '../lib/itinerary-pdf.js';

// ── normalizeJam (temuan T-3) ──
test('normalizeJam menyeragamkan pemisah jam jadwal ke titik dua', () => {
  assert.equal(normalizeJam('15.50'), '15:50');
  assert.equal(normalizeJam('21:15'), '21:15');
  assert.equal(normalizeJam('9.5'), '09:50');
  assert.equal(normalizeJam('16.00'), '16:00');
});

test('normalizeJam membiarkan yang tak berpola apa adanya', () => {
  assert.equal(normalizeJam(''), '');
  assert.equal(normalizeJam('-'), '-');
  assert.equal(normalizeJam(null), '');
  assert.equal(normalizeJam('sore'), 'sore');
});

// ── flightLegView (temuan T-2) ──
const PAKET = {
  keberangkatan: { tgl: '2026-09-05', jam: '15.50', rute: 'CGK - MED', kodePenerbangan: 'SV 821' },
  kepulangan: { tgl: '2026-09-13', jam: '16.00', rute: 'JED - CGK', kodePenerbangan: 'SV 818' },
};

test('jam tiba disembunyikan bila sama dengan jam berangkat', () => {
  const [pergi, pulang] = flightLegView(PAKET, { berangkat: '21:15', pulang: '16:00' });
  assert.equal(pergi.jam, '15:50');
  assert.equal(pergi.jamTiba, '21:15');
  assert.equal(pulang.jam, '16:00');
  assert.equal(pulang.jamTiba, null);
});

test('jam tiba yang beda tetap tampil, dan dinormalisasi', () => {
  const [, pulang] = flightLegView(PAKET, { berangkat: null, pulang: '06.40' });
  assert.equal(pulang.jamTiba, '06:40');
});

test('rute dipecah jadi bandara asal & tujuan, transit dibuang', () => {
  const [pergi] = flightLegView(
    { keberangkatan: { tgl: '2026-09-05', jam: '10:25', rute: 'CGK-DXB / DXB-JED', kodePenerbangan: 'EK 357' }, kepulangan: {} },
    {},
  );
  assert.equal(pergi.dari, 'CGK');
  assert.equal(pergi.ke, 'JED');
});

// ── priceRows (temuan T-4) ──
test('satu tier menghasilkan satu baris', () => {
  const rows = priceRows({ harga: { HEMAT: { Quard: '31900000', Triple: '32900000', Double: '34900000', Infant: '13900000' } } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tier, 'HEMAT');
  assert.equal(rows[0].mulaiDari, 31900000);
  assert.deepEqual(rows[0].kamar.map(k => k.label), ['Bertiga', 'Berdua']);
});

test('banyak tier terurut dari termurah', () => {
  const rows = priceRows({
    harga: {
      RAHMAH: { Quard: '43500000' },
      HEMAT: { Quard: '33900000' },
      UHUD: { Quard: '37900000' },
    },
  });
  assert.deepEqual(rows.map(r => r.tier), ['HEMAT', 'UHUD', 'RAHMAH']);
});

test('tier tanpa harga terjual dibuang', () => {
  const rows = priceRows({ harga: { HEMAT: { Quard: '31900000' }, PRIVATE: { Quard: 'N/A', Double: '0' } } });
  assert.deepEqual(rows.map(r => r.tier), ['HEMAT']);
});

test('paket tanpa harga menghasilkan daftar kosong', () => {
  assert.deepEqual(priceRows({}), []);
  assert.deepEqual(priceRows(null), []);
});

// ── canRenderItineraryPdf ──
const HARI = (n) => ({ dayNumber: String(n), title: 'Hari ' + n, location: 'Madinah', activities: [] });

test('itinerary sehat lolos gerbang', () => {
  const content = { days: [HARI(1), HARI(2), HARI(3)] };
  const paket = { keberangkatan: { tgl: '2026-09-05' }, kepulangan: { tgl: '2026-09-07' } };
  assert.equal(canRenderItineraryPdf(content, paket), true);
});

test('days kosong ditolak', () => {
  const paket = { keberangkatan: { tgl: '2026-09-05' }, kepulangan: { tgl: '2026-09-07' } };
  assert.equal(canRenderItineraryPdf({ days: [] }, paket), false);
  assert.equal(canRenderItineraryPdf(null, paket), false);
});

test('penomoran hari yang tak sepakat dengan jadwal ditolak', () => {
  const content = { days: [HARI(1), HARI(2), HARI(3)] };
  const paket = { keberangkatan: { tgl: '2026-09-05' }, kepulangan: { tgl: '2026-09-20' } };
  assert.equal(canRenderItineraryPdf(content, paket), false);
});

test('tanpa tanggal berangkat ditolak', () => {
  assert.equal(canRenderItineraryPdf({ days: [HARI(1)] }, {}), false);
});
