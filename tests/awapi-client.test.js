import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyManualUmrohOverrides,
  guardNewSuspiciousAwapiPaymentRow,
  hasSuspiciousAwapiPayment,
  normalizeAwapiHajiRow,
  normalizeAwapiRow,
  parseAwapiResponseText,
  preserveExistingPaymentForSuspiciousAwapiRow,
  preserveLegacyUmrohRawData,
  resolveAggregateBookingLunasRow,
  allocateAggregatePartialRow,
  hasTrustedManualPaymentGuard,
  buildBookingPriceIndex,
} from '../awapi-client.js';

function jakartaYear() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
  }).formatToParts(new Date());
  return Number(parts.find(p => p.type === 'year')?.value);
}

function rawRow(overrides = {}) {
  return {
    id_umrah: 'AIW0028902',
    id_jamaah: 'JM999999990000063096',
    nama: 'NANA RUKMANA',
    kelamin: 'laki-laki',
    hp: '62996093769',
    tgl_lahir: `${jakartaYear() - 48}-05-12`,
    paket: 'HEMAT',
    bayar: '5000000',
    bayar_sisa: 21500000,
    tgl_berangkat: `${jakartaYear()}-08-15`,
    tgl_daftar: `${jakartaYear()}-05-12 09:38:07`,
    paspor_nomor: '0',
    paspor_expired: '0000-00-00',
    ...overrides,
  };
}

function rawHajiRow(overrides = {}) {
  return {
    id_haji: 'HAJ20270001',
    id_jamaah: 'JM999999990000099001',
    nomor_porsi: '3000123456',
    nomor_spph: 'SPPH-123',
    nama: 'AHMAD HAJI',
    kelamin: 'Laki-laki',
    tgl_lahir: `${jakartaYear() - 55}-01-20`,
    hp: '628123456789',
    paspor_nomor: '0',
    paspor_expired: '0000-00-00',
    paket: 'RAHMAH Quard',
    paket_harga: '120000000',
    diskon_marketing: '500000',
    diskon_kantor: '250000',
    bayar: '4500000',
    bayar_sisa: '115500000',
    bayar_status: 'CICILAN',
    tgl_daftar: `${jakartaYear()}-04-15 10:12:30`,
    tgl_berangkat: `${jakartaYear() + 1}-06-01`,
    thn_berangkat_masehi: String(jakartaYear() + 1),
    thn_berangkat_hijriyah: '1448',
    staff: 'STAFF HAJI',
    dokumen: { ktp: true },
    dokumen_bpih: 'http://115.124.86.220/aiw/staff/pages/dokumen/bpih.pdf',
    ...overrides,
  };
}

test('parseAwapiResponseText tolerates PHP warning before JSON payload', () => {
  const parsed = parseAwapiResponseText('<br><b>Warning</b>: Undefined variable $cek<br>{"status":"true","aaData":[{"id_haji":"HAJ1"}]}');

  assert.equal(parsed.status, 'true');
  assert.deepEqual(parsed.aaData, [{ id_haji: 'HAJ1' }]);
});

test('normalizeAwapiHajiRow maps official haji API row without legacy-only null overwrites', () => {
  const norm = normalizeAwapiHajiRow(rawHajiRow(), { agentId: 'agent-id' });

  assert.equal(norm.agent_id, 'agent-id');
  assert.equal(norm.id_haji, 'HAJ20270001');
  assert.equal(norm.id_jamaah, 'JM999999990000099001');
  assert.equal(norm.nomor_porsi, '3000123456');
  assert.equal(norm.nomor_spph, 'SPPH-123');
  assert.equal(norm.nama, 'AHMAD HAJI');
  assert.equal(norm.jk, 'L');
  assert.equal(norm.telp, '628123456789');
  assert.equal(norm.tgl_lahir, `${jakartaYear() - 55}-01-20`);
  assert.equal(norm.no_paspor, null);
  assert.equal(norm.paspor_expired, null);
  assert.equal(norm.paket, 'RAHMAH Quard');
  assert.equal(norm.paket_detail, 'RAHMAH Quard');
  assert.equal(norm.paket_harga, 120000000);
  assert.equal(norm.diskon_marketing, 500000);
  assert.equal(norm.diskon_kantor, 250000);
  assert.equal(norm.bayar, 4500000);
  assert.equal(norm.sisa, 115500000);
  assert.equal(norm.status_bayar, 'CICILAN');
  assert.equal(norm.tgl_daftar, `${jakartaYear()}-04-15`);
  assert.equal(norm.tgl_berangkat, `${jakartaYear() + 1}-06-01`);
  assert.equal(norm.thn_masehi, String(jakartaYear() + 1));
  assert.equal(norm.thn_hijriyah, '1448');
  assert.equal(norm.staff, 'STAFF HAJI');
  assert.deepEqual(norm.dokumen, { ktp: true });
  assert.equal(norm.bpih_url, 'http://115.124.86.220/aiw/staff/pages/dokumen/bpih.pdf');
  assert.ok(norm.synced_at);
  assert.equal(Object.hasOwn(norm, 'alamat'), false);
  assert.equal(Object.hasOwn(norm, 'perwakilan'), false);
  assert.equal(Object.hasOwn(norm, 'marketing'), false);
  assert.equal(Object.hasOwn(norm, 'jenis'), false);
  assert.equal(Object.hasOwn(norm, 'status_berangkat'), false);
  assert.equal(Object.hasOwn(norm, 'surat_pernyataan_url'), false);
});

test('normalizeAwapiHajiRow derives payment status when bayar_status is missing', () => {
  const belum = normalizeAwapiHajiRow(rawHajiRow({ bayar_status: '', bayar: '0', bayar_sisa: '120000000' }), { agentId: 'agent-id' });
  const lunas = normalizeAwapiHajiRow(rawHajiRow({ bayar_status: '', bayar: '120000000', bayar_sisa: '0' }), { agentId: 'agent-id' });

  assert.equal(belum.status_bayar, 'BELUM BAYAR');
  assert.equal(lunas.status_bayar, 'LUNAS');
});

test('normalizeAwapiHajiRow nulls zero-date placeholders with time portions', () => {
  const norm = normalizeAwapiHajiRow(rawHajiRow({
    tgl_lahir: '0000-00-00 00:00:00',
    paspor_expired: '0000-00-00 00:00:00',
    tgl_daftar: '0000-00-00 00:00:00',
    tgl_berangkat: '0000-00-00 00:00:00',
    thn_berangkat_masehi: '0',
    thn_berangkat_hijriyah: '0',
  }), { agentId: 'agent-id' });

  assert.equal(norm.tgl_lahir, null);
  assert.equal(norm.paspor_expired, null);
  assert.equal(norm.tgl_daftar, null);
  assert.equal(norm.tgl_berangkat, null);
  assert.equal(norm.thn_masehi, null);
  assert.equal(norm.thn_hijriyah, null);
});

test('normalizeAwapiRow keeps plausible birth dates', () => {
  const norm = normalizeAwapiRow(rawRow(), { agentId: 'agent-id' });
  assert.equal(norm.tgl_lahir, `${jakartaYear() - 48}-05-12`);
  assert.equal(norm.tgl_daftar, `${jakartaYear()}-05-12`);
  assert.equal(norm.tgl_berangkat, `${jakartaYear()}-08-15`);
});

test('normalizeAwapiRow stamps AWAPI as payment provenance', () => {
  const norm = normalizeAwapiRow(rawRow(), { agentId: 'agent-id' });

  assert.equal(norm.raw_data.payment_source, 'awapi');
  assert.match(norm.raw_data.payment_synced_at, /^\d{4}-\d{2}-\d{2}T/);
});

test('normalizeAwapiRow nulls current-year birth dates from AWAPI placeholders', () => {
  const norm = normalizeAwapiRow(rawRow({ tgl_lahir: `${jakartaYear()}-05-12` }), { agentId: 'agent-id' });
  assert.equal(norm.tgl_lahir, null);
});

test('normalizeAwapiRow marks dokumen_pernyataan as a ready umroh document', () => {
  const norm = normalizeAwapiRow(rawRow({
    dokumen: { paspor: true },
    dokumen_pernyataan: 'surat/pernyataan/AIW0028902.pdf',
  }), { agentId: 'agent-id' });

  assert.equal(norm.raw_data.dokumen_pernyataan, 'surat/pernyataan/AIW0028902.pdf');
  assert.deepEqual(norm.dokumen, { paspor: true, pernyataan: true });
});

test('preserveLegacyUmrohRawData keeps legacy staff when AWAPI refresh omits it', () => {
  const norm = normalizeAwapiRow(rawRow({
    perlengkapan: { koper: true },
  }), { agentId: 'agent-id' });

  const merged = preserveLegacyUmrohRawData(norm, {
    raw_data: {
      staf: 'BU ANITA',
      id_jadwal: 'JADWAL-1448-01',
    },
  });

  assert.equal(merged.raw_data.staf, 'BU ANITA');
  assert.equal(merged.raw_data.id_jadwal, 'JADWAL-1448-01');
  assert.deepEqual(merged.perlengkapan, { koper: true });
});

test('applyManualUmrohOverrides keeps dashboard-edited biodata sticky across AWAPI refreshes', () => {
  const norm = normalizeAwapiRow(rawRow({
    nama: 'NAMA DARI AWAPI',
    hp: '0812000111',
    tgl_lahir: `${jakartaYear() - 30}-01-01`,
    paspor_nomor: 'A123',
    paspor_expired: `${jakartaYear() + 1}-01-01`,
  }), { agentId: 'agent-id' });

  const merged = preserveLegacyUmrohRawData(norm, {
    raw_data: {
      manual_overrides: {
        nama: 'NAMA EDIT MANUAL',
        wa: '6281299998888',
        tgl_lahir: `${jakartaYear() - 31}-02-02`,
        no_paspor: 'B987',
        paspor_expired: `${jakartaYear() + 2}-03-03`,
      },
    },
  });

  assert.equal(applyManualUmrohOverrides(norm, merged.raw_data).nama, 'NAMA EDIT MANUAL');
  assert.equal(merged.nama, 'NAMA EDIT MANUAL');
  assert.equal(merged.wa, '6281299998888');
  assert.equal(merged.tgl_lahir, `${jakartaYear() - 31}-02-02`);
  assert.equal(merged.no_paspor, 'B987');
  assert.equal(merged.paspor_expired, `${jakartaYear() + 2}-03-03`);
  assert.equal(merged.raw_data.manual_overrides.nama, 'NAMA EDIT MANUAL');
});

test('preserveLegacyUmrohRawData drops legacy payment raw when AWAPI takes over payment', () => {
  const norm = normalizeAwapiRow(rawRow({
    bayar: '15000000',
    bayar_sisa: '13900000',
  }), { agentId: 'agent-id' });

  const merged = preserveLegacyUmrohRawData(norm, {
    raw_data: {
      source: 'umrah_detail',
      bayar_gross: 5000000,
      harga_paket: 28900000,
      status_bayar: 'CICILAN',
      staf: 'BU ANITA',
      id_jadwal: 'JBU1508',
    },
  });

  assert.equal(merged.bayar, 15000000);
  assert.equal(merged.sisa, 13900000);
  assert.equal(merged.raw_data.payment_source, 'awapi');
  assert.equal(merged.raw_data.bayar, '15000000');
  assert.equal(merged.raw_data.bayar_sisa, '13900000');
  assert.equal(Object.hasOwn(merged.raw_data, 'bayar_gross'), false);
  assert.equal(Object.hasOwn(merged.raw_data, 'harga_paket'), false);
  assert.equal(Object.hasOwn(merged.raw_data, 'status_bayar'), false);
  assert.equal(Object.hasOwn(merged.raw_data, 'source'), false);
  assert.equal(merged.raw_data.staf, 'BU ANITA');
  assert.equal(merged.raw_data.id_jadwal, 'JBU1508');
});

test('preserveLegacyUmrohRawData exposes AWAPI staff as staf when present', () => {
  const norm = normalizeAwapiRow(rawRow({
    staff: 'PAK RIZAL',
  }), { agentId: 'agent-id' });

  const merged = preserveLegacyUmrohRawData(norm, {
    raw_data: {
      staf: 'BU ANITA',
    },
  });

  assert.equal(merged.raw_data.staf, 'PAK RIZAL');
});

test('preserveLegacyUmrohRawData keeps existing surat pernyataan markers when incoming rows omit them', () => {
  const norm = normalizeAwapiRow(rawRow({
    dokumen: { paspor: true },
  }), { agentId: 'agent-id' });

  const merged = preserveLegacyUmrohRawData(norm, {
    raw_data: {
      dokumen_pernyataan: 'http://115.124.86.220/dok/pernyataan/SM01078-token',
    },
    dokumen: {
      paspor: true,
      pernyataan: true,
    },
  });

  assert.equal(merged.raw_data.dokumen_pernyataan, 'http://115.124.86.220/dok/pernyataan/SM01078-token');
  assert.deepEqual(merged.dokumen, {
    paspor: true,
    pernyataan: true,
  });
});

test('hasSuspiciousAwapiPayment flags negative sisa from inflated AWAPI bayar', () => {
  const norm = normalizeAwapiRow(rawRow({
    bayar: '101700000',
    bayar_sisa: -64300000,
  }), { agentId: 'agent-id' });

  assert.equal(hasSuspiciousAwapiPayment(norm), true);
});

test('hasSuspiciousAwapiPayment allows normal cicilan and lunas rows', () => {
  const cicilan = normalizeAwapiRow(rawRow({
    bayar: '4000000',
    bayar_sisa: 29300000,
  }), { agentId: 'agent-id' });
  const lunas = normalizeAwapiRow(rawRow({
    bayar: '33900000',
    bayar_sisa: 0,
  }), { agentId: 'agent-id' });

  assert.equal(hasSuspiciousAwapiPayment(cicilan), false);
  assert.equal(hasSuspiciousAwapiPayment(lunas), false);
});

test('preserveExistingPaymentForSuspiciousAwapiRow keeps verified DB payment during refresh', () => {
  const norm = normalizeAwapiRow(rawRow({
    hp: '6281234567890',
    bayar: '101700000',
    bayar_sisa: -64300000,
    diskon_kantor: '0',
    diskon_marketing: '0',
    paspor_nomor: 'A1234567',
  }), { agentId: 'agent-id' });

  const guarded = preserveExistingPaymentForSuspiciousAwapiRow(norm, {
    bayar: 33900000,
    sisa: 0,
    diskon_kantor: 500000,
    diskon_marketing: 250000,
    raw_data: { payment_source: 'legacy_detail' },
  });

  assert.equal(guarded.bayar, 33900000);
  assert.equal(guarded.sisa, 0);
  assert.equal(guarded.diskon_kantor, 500000);
  assert.equal(guarded.diskon_marketing, 250000);
  assert.equal(guarded.wa, '6281234567890');
  assert.equal(guarded.no_paspor, 'A1234567');
  assert.equal(guarded.raw_data.payment_source, 'legacy_detail');
  assert.equal(guarded.raw_data.payment_guard, 'preserved_existing_after_awapi_anomaly');
  assert.deepEqual(guarded.raw_data.preserved_payment_snapshot, {
    bayar: 33900000,
    sisa: 0,
    diskon_kantor: 500000,
    diskon_marketing: 250000,
  });
  assert.equal(guarded.raw_data.suspicious_awapi_payment_snapshot.bayar, 101700000);
  assert.equal(guarded.raw_data.suspicious_awapi_payment_snapshot.sisa, -64300000);
});

test('preserveExistingPaymentForSuspiciousAwapiRow can keep manually trusted negative AWAPI payment', () => {
  const norm = normalizeAwapiRow(rawRow({
    bayar: '77600000',
    bayar_sisa: -38800000,
    bayar_status: 'LEBIH BAYAR',
    paket_harga: '38800000',
    tgl_berangkat: '2026-06-30',
  }), { agentId: 'agent-id' });

  const guarded = preserveExistingPaymentForSuspiciousAwapiRow(norm, {
    bayar: 77600000,
    sisa: -38800000,
    diskon_kantor: 0,
    diskon_marketing: 0,
    raw_data: {
      payment_guard: 'manual_departure_date_refresh_keep_awapi_payment',
      corrected_reason: 'agent_sari_departure_date_confirmed_2026-06-30',
    },
  });

  assert.ok(guarded);
  assert.equal(guarded.bayar, 77600000);
  assert.equal(guarded.sisa, -38800000);
  assert.equal(guarded.tgl_berangkat, '2026-06-30');
  assert.equal(guarded.raw_data.payment_guard, 'preserved_existing_after_awapi_anomaly');
  assert.equal(guarded.raw_data.preserved_payment_snapshot.sisa, -38800000);
});

test('guardNewSuspiciousAwapiPaymentRow keeps new jamaah rows while neutralizing bad AWAPI payment', () => {
  const norm = normalizeAwapiRow(rawRow({
    id_umrah: 'AIW0028266',
    id_jamaah: 'JM999999990000061243',
    nama: 'ANGELUNA  RAMADHANI',
    bayar: '131600000',
    bayar_sisa: -98700000,
    bayar_status: 'LEBIH BAYAR',
    paket_harga: '32900000',
    paspor_nomor: 'X1608463',
  }), { agentId: 'agent-id' });

  const guarded = guardNewSuspiciousAwapiPaymentRow(norm);

  assert.equal(guarded.id_umroh, 'AIW0028266');
  assert.equal(guarded.jm_id, 'JM999999990000061243');
  assert.equal(guarded.nama, 'ANGELUNA  RAMADHANI');
  assert.equal(guarded.no_paspor, 'X1608463');
  assert.equal(guarded.bayar, 0);
  assert.equal(guarded.sisa, 32900000);
  assert.equal(hasSuspiciousAwapiPayment(guarded), false);
  assert.equal(guarded.raw_data.payment_guard, 'neutralized_new_after_awapi_anomaly');
  assert.equal(guarded.raw_data.suspicious_awapi_payment_snapshot.bayar, 131600000);
  assert.equal(guarded.raw_data.suspicious_awapi_payment_snapshot.sisa, -98700000);
  assert.equal(guarded.raw_data.payment_neutralized.reason, 'new_row_after_awapi_anomaly');
  assert.equal(guarded.raw_data.payment_neutralized.sisa, 32900000);
});

test('preserveExistingPaymentForSuspiciousAwapiRow never nests guard bookkeeping into the refresh snapshot', () => {
  // Incoming raw_data is merged with the existing DB raw_data before the guard
  // runs, so it can already carry a previous guard's snapshot. Re-embedding it
  // grew raw_data one level per sync (observed up to 255 levels in production).
  const norm = normalizeAwapiRow(rawRow({
    bayar: '101700000',
    bayar_sisa: -64300000,
  }), { agentId: 'agent-id' });
  norm.raw_data = {
    ...norm.raw_data,
    payment_guard: 'preserved_existing_after_awapi_anomaly',
    awapi_refresh_snapshot: { bayar: '67800000', awapi_refresh_snapshot: { bayar: '33900000' } },
    suspicious_awapi_payment_snapshot: { bayar: 67800000, sisa: -33900000 },
    preserved_payment_snapshot: { bayar: 5000000, sisa: 28900000 },
  };

  const guarded = preserveExistingPaymentForSuspiciousAwapiRow(norm, {
    bayar: 5000000,
    sisa: 28900000,
    raw_data: { payment_source: 'legacy_detail' },
  });

  const snapshot = guarded.raw_data.awapi_refresh_snapshot;
  assert.equal(snapshot.bayar, '101700000');
  assert.equal('awapi_refresh_snapshot' in snapshot, false);
  assert.equal('payment_guard' in snapshot, false);
  assert.equal('suspicious_awapi_payment_snapshot' in snapshot, false);
  assert.equal('preserved_payment_snapshot' in snapshot, false);
});

test('resolveAggregateBookingLunasRow normalizes booking-level aggregate bayar to per-pax lunas', () => {
  // Production shape (AHMAD SULAIMI, AIW0028647): booking of 3 pax paid off,
  // AWAPI reports the booking total in each pax row → sisa negatif + LEBIH BAYAR.
  const norm = normalizeAwapiRow(rawRow({
    bayar: '104700000',
    bayar_sisa: -69800000,
    bayar_status: 'LEBIH BAYAR',
    paket_harga: '34900000',
    diskon_kantor: '0',
    diskon_marketing: '0',
  }), { agentId: 'agent-id' });

  const resolved = resolveAggregateBookingLunasRow(norm, { priceTotal: 104700000, paxCount: 3, priceKnown: true });

  assert.ok(resolved);
  assert.equal(resolved.bayar, 34900000);
  assert.equal(resolved.sisa, 0);
  assert.equal(resolved.raw_data.payment_normalized.reason, 'aggregate_booking_lunas');
  assert.equal(resolved.raw_data.payment_normalized.awapi_bayar, 104700000);
  assert.equal(resolved.raw_data.payment_normalized.booking_price_total, 104700000);
  assert.equal(resolved.raw_data.payment_normalized.booking_pax, 3);
  assert.equal(hasSuspiciousAwapiPayment(resolved), false);
});

test('resolveAggregateBookingLunasRow normalizes mixed-price lunas bookings the divisor test missed', () => {
  // 2 pax at different room rates (34.9jt + 36.9jt = 71.8jt), fully paid. The
  // old "aggregate % paket_harga === 0" test false-negatived this booking;
  // the Σ paket_harga proof accepts it.
  const norm = normalizeAwapiRow(rawRow({
    bayar: '71800000',
    bayar_sisa: -36900000,
    bayar_status: 'LEBIH BAYAR',
    paket_harga: '34900000',
  }), { agentId: 'agent-id' });

  const resolved = resolveAggregateBookingLunasRow(norm, { priceTotal: 71800000, paxCount: 2, priceKnown: true });

  assert.ok(resolved);
  assert.equal(resolved.bayar, 34900000);
  assert.equal(resolved.sisa, 0);
});

test('resolveAggregateBookingLunasRow normalizes a genuinely overpaid single-pax booking', () => {
  // Production case AIW0029071 (TEJO SUWARNO, verified upstream 2026-06-06):
  // 1 pax, paket 33.9jt, paid 47.8jt → LEBIH BAYAR is real, booking is lunas.
  // The old divisor test left this row frozen on stale DP values forever.
  const norm = normalizeAwapiRow(rawRow({
    bayar: '47800000',
    bayar_sisa: -13900000,
    bayar_status: 'LEBIH BAYAR',
    paket_harga: '33900000',
  }), { agentId: 'agent-id' });

  const resolved = resolveAggregateBookingLunasRow(norm, { priceTotal: 33900000, paxCount: 1, priceKnown: true });

  assert.ok(resolved);
  assert.equal(resolved.bayar, 33900000);
  assert.equal(resolved.sisa, 0);
});

test('resolveAggregateBookingLunasRow refuses partially-paid bookings even on exact multiples', () => {
  // The closed hole (2026-06-06): 3-pax booking where 2 pax paid full —
  // aggregate 2×54.5jt is an exact multiple of paket_harga, but the booking
  // still owes one pax. Normalizing would erase the third pax's reminder.
  const norm = normalizeAwapiRow(rawRow({
    bayar: '109000000',
    bayar_sisa: -54500000,
    bayar_status: 'LEBIH BAYAR',
    paket_harga: '54500000',
  }), { agentId: 'agent-id' });

  assert.equal(resolveAggregateBookingLunasRow(norm, { priceTotal: 163500000, paxCount: 3, priceKnown: true }), null);

  // Production case AIW0027949 (widi, verified upstream 2026-06-06): 2 pax,
  // 72.8jt of 93.8jt paid — AWAPI claims LEBIH BAYAR, booking is NOT lunas.
  const widi = normalizeAwapiRow(rawRow({
    bayar: '72800000',
    bayar_sisa: -25900000,
    bayar_status: 'LEBIH BAYAR',
    paket_harga: '46900000',
  }), { agentId: 'agent-id' });

  assert.equal(resolveAggregateBookingLunasRow(widi, { priceTotal: 93800000, paxCount: 2, priceKnown: true }), null);
});

test('resolveAggregateBookingLunasRow requires a complete booking price universe', () => {
  const norm = normalizeAwapiRow(rawRow({
    bayar: '104700000',
    bayar_sisa: -69800000,
    bayar_status: 'LEBIH BAYAR',
    paket_harga: '34900000',
  }), { agentId: 'agent-id' });

  // No booking info at all (caller could not build the index) → stay guarded.
  assert.equal(resolveAggregateBookingLunasRow(norm), null);
  // A pax with an unresolvable price → the Σ is an undercount, do not trust it.
  assert.equal(resolveAggregateBookingLunasRow(norm, { priceTotal: 69800000, paxCount: 3, priceKnown: false }), null);
});

test('resolveAggregateBookingLunasRow records gross paket_harga as bayar — AWAPI never deducts diskon', () => {
  // Production invariant (verified 2026-06-05): every per-pax LUNAS row AWAPI
  // emits has bayar == paket_harga GROSS, even when diskon > 0. Subtracting
  // diskon here would understate bayar for every discounted booking.
  const norm = normalizeAwapiRow(rawRow({
    bayar: '69800000',
    bayar_sisa: -34900000,
    bayar_status: 'LEBIH BAYAR',
    paket_harga: '34900000',
    diskon_kantor: '500000',
    diskon_marketing: '250000',
  }), { agentId: 'agent-id' });

  const resolved = resolveAggregateBookingLunasRow(norm, { priceTotal: 69800000, paxCount: 2, priceKnown: true });

  assert.ok(resolved);
  assert.equal(resolved.bayar, 34900000);
  assert.equal(resolved.sisa, 0);

  // diskon >= paket_harga exists in production (e.g. paket 14.4jt, diskon
  // 14.5jt) — bayar must still be the gross paket_harga, never clamped to 0.
  const bigDiskon = normalizeAwapiRow(rawRow({
    bayar: '28800000',
    bayar_sisa: -14400000,
    bayar_status: 'LEBIH BAYAR',
    paket_harga: '14400000',
    diskon_kantor: '14500000',
    diskon_marketing: '0',
  }), { agentId: 'agent-id' });

  const resolvedBig = resolveAggregateBookingLunasRow(bigDiskon, { priceTotal: 28800000, paxCount: 2, priceKnown: true });

  assert.ok(resolvedBig);
  assert.equal(resolvedBig.bayar, 14400000);
  assert.equal(resolvedBig.sisa, 0);
});

test('resolveAggregateBookingLunasRow strips inherited guard bookkeeping from raw_data', () => {
  const norm = normalizeAwapiRow(rawRow({
    bayar: '104700000',
    bayar_sisa: -69800000,
    bayar_status: 'LEBIH BAYAR',
    paket_harga: '34900000',
  }), { agentId: 'agent-id' });
  norm.raw_data = {
    ...norm.raw_data,
    payment_guard: 'preserved_existing_after_awapi_anomaly',
    awapi_refresh_snapshot: { bayar: '69800000' },
    suspicious_awapi_payment_snapshot: { bayar: 69800000, sisa: -34900000 },
    preserved_payment_snapshot: { bayar: 10000000, sisa: 24900000 },
  };

  const resolved = resolveAggregateBookingLunasRow(norm, { priceTotal: 104700000, paxCount: 3, priceKnown: true });

  assert.ok(resolved);
  assert.equal('payment_guard' in resolved.raw_data, false);
  assert.equal('awapi_refresh_snapshot' in resolved.raw_data, false);
  assert.equal('suspicious_awapi_payment_snapshot' in resolved.raw_data, false);
  assert.equal('preserved_payment_snapshot' in resolved.raw_data, false);
});

test('resolveAggregateBookingLunasRow leaves corrupt and ambiguous payloads to the guard', () => {
  const booking = { priceTotal: 104700000, paxCount: 3, priceKnown: true };

  // paket_harga <= 0 → genuinely corrupt payload, keep guarding.
  const corrupt = normalizeAwapiRow(rawRow({
    bayar: '104700000',
    bayar_sisa: -69800000,
    bayar_status: 'LEBIH BAYAR',
    paket_harga: '-1000000',
  }), { agentId: 'agent-id' });
  assert.equal(resolveAggregateBookingLunasRow(corrupt, booking), null);

  // Missing paket_harga → cannot prove the aggregate shape, keep guarding.
  const missing = normalizeAwapiRow(rawRow({
    bayar: '101700000',
    bayar_sisa: -64300000,
    bayar_status: 'LEBIH BAYAR',
  }), { agentId: 'agent-id' });
  assert.equal(resolveAggregateBookingLunasRow(missing, booking), null);

  // Not suspicious at all (normal cicilan) → resolver does not touch it.
  const cicilan = normalizeAwapiRow(rawRow({
    bayar: '4000000',
    bayar_sisa: 29300000,
    paket_harga: '33900000',
  }), { agentId: 'agent-id' });
  assert.equal(resolveAggregateBookingLunasRow(cicilan, { priceTotal: 33900000, paxCount: 1, priceKnown: true }), null);
});

// ── allocateAggregatePartialRow (partially-paid uniform aggregate, 2026-06-23) ──

function aggRow(overrides = {}) {
  return normalizeAwapiRow(rawRow({
    bayar_status: 'LEBIH BAYAR',
    ...overrides,
  }), { agentId: 'agent-id' });
}

test('allocateAggregatePartialRow splits a partially-paid booking proportionally (AIW0028669/Yulianti)', () => {
  // 3 pax @ 34.9jt (Σ=104.7jt), aggregate 69.8jt replicated (exactly 2/3 paid).
  const row = aggRow({ id_umrah: 'AIW0028669', bayar: '69800000', bayar_sisa: -34900000, paket_harga: '34900000' });
  const booking = { priceTotal: 104700000, paxCount: 3, priceKnown: true, distinctAggregateCount: 1 };

  const out = allocateAggregatePartialRow(row, booking);
  assert.ok(out, 'partial booking must allocate');
  assert.equal(out.bayar, 23266666);
  assert.equal(out.sisa, 11633334);
  assert.equal(out.bayar + out.sisa, 34900000, 'bayar+sisa must equal paket');
  // NEVER a per-pax lunas on a partial booking.
  assert.ok(out.sisa > 0);
  assert.equal(hasSuspiciousAwapiPayment(out), false, 'allocated row is no longer suspicious');
  // LOAD-BEARING: raw bayar_sisa must stay negative so booking-outstanding still
  // detects the aggregate shape and prices the booking via Σpaket-aggregate once.
  assert.equal(out.raw_data.bayar_sisa, -34900000);
  assert.equal(out.raw_data.bayar, '69800000');
  assert.equal(out.raw_data.payment_guard, 'allocated_partial_after_awapi_anomaly');
  assert.equal(out.raw_data.payment_normalized.reason, 'aggregate_booking_partial_allocated');
});

test('allocateAggregatePartialRow NEVER fabricates a per-pax lunas (false-lunas regression guard)', () => {
  // Production partial bookings that wear the LEBIH BAYAR shape but still owe:
  // AIW0027949 (2 pax @46.9jt, 72.8jt paid) and a 3 pax @54.5jt / 109jt-paid booking.
  const cases = [
    { paket: '46900000', bayar: '72800000', sisa: -25900000, priceTotal: 93800000, pax: 2 },
    { paket: '54500000', bayar: '109000000', sisa: -54500000, priceTotal: 163500000, pax: 3 },
  ];
  for (const c of cases) {
    const row = aggRow({ bayar: c.bayar, bayar_sisa: c.sisa, paket_harga: c.paket });
    const out = allocateAggregatePartialRow(row, { priceTotal: c.priceTotal, paxCount: c.pax, priceKnown: true, distinctAggregateCount: 1 });
    assert.ok(out, 'partial booking should allocate');
    assert.ok(out.sisa > 0, `partial pax must keep sisa>0, got ${out.sisa}`);
    assert.ok(out.bayar < Number(c.paket), 'allocated bayar must stay below paket (never lunas)');
  }
});

test('allocateAggregatePartialRow returns null for full-paid, multisub, price-unknown, and paket<=0', () => {
  const base = { bayar: '69800000', bayar_sisa: -34900000, paket_harga: '34900000' };
  // full-paid (aggregate >= Σpaket) → resolver's job, not the allocator.
  assert.equal(allocateAggregatePartialRow(aggRow(base), { priceTotal: 69800000, paxCount: 2, priceKnown: true, distinctAggregateCount: 1 }), null);
  // multi-subgroup (distinct aggregate values in one id_umroh) → never proportional.
  assert.equal(allocateAggregatePartialRow(aggRow(base), { priceTotal: 104700000, paxCount: 3, priceKnown: true, distinctAggregateCount: 2 }), null);
  // price universe incomplete → cannot allocate on an undercounted total.
  assert.equal(allocateAggregatePartialRow(aggRow(base), { priceTotal: 104700000, paxCount: 3, priceKnown: false, distinctAggregateCount: 1 }), null);
  // paket_harga <= 0 companion (infant/0-price) → N/A.
  assert.equal(allocateAggregatePartialRow(aggRow({ ...base, paket_harga: '0' }), { priceTotal: 104700000, paxCount: 3, priceKnown: true, distinctAggregateCount: 1 }), null);
  // not suspicious (normal cicilan) → null.
  assert.equal(allocateAggregatePartialRow(aggRow({ bayar: '4000000', bayar_sisa: 30900000, paket_harga: '34900000' }), { priceTotal: 104700000, paxCount: 3, priceKnown: true, distinctAggregateCount: 1 }), null);
});

test('allocateAggregatePartialRow conserves the booking total (Σ allocated bayar == aggregate ± rounding)', () => {
  const booking = { priceTotal: 104700000, paxCount: 3, priceKnown: true, distinctAggregateCount: 1 };
  let sumBayar = 0;
  for (let i = 0; i < 3; i++) {
    const out = allocateAggregatePartialRow(aggRow({ bayar: '69800000', bayar_sisa: -34900000, paket_harga: '34900000' }), booking);
    sumBayar += out.bayar;
    assert.ok(out.bayar <= 34900000, 'never exceeds paket');
  }
  // floor under-allocates by at most paxCount rupiah — never over (no phantom money).
  assert.ok(sumBayar <= 69800000 && sumBayar >= 69800000 - 3, `Σbayar ${sumBayar} within rounding of aggregate`);
});

test('allocateAggregatePartialRow honors a manual-confirmed sibling via pinnedPaketTotal', () => {
  // AIW0028669 with Yulianti manually confirmed lunas (34.9jt pinned): the remaining
  // 34.9jt of the 69.8jt aggregate splits across the other two pax → 17.45jt each.
  const booking = { priceTotal: 104700000, paxCount: 3, priceKnown: true, distinctAggregateCount: 1, pinnedPaketTotal: 34900000 };
  const out = allocateAggregatePartialRow(aggRow({ bayar: '69800000', bayar_sisa: -34900000, paket_harga: '34900000' }), booking);
  assert.ok(out);
  assert.equal(out.bayar, 17450000);
  assert.equal(out.sisa, 17450000);
  assert.equal(out.raw_data.payment_normalized.booking_pinned_paket_total, 34900000);
});

test('buildBookingPriceIndex counts distinct aggregate values and pins manual-confirmed pax', () => {
  // Uniform single aggregate (one distinct raw bayar across the LEBIH-BAYAR rows).
  const uniform = buildBookingPriceIndex([
    { id_umroh: 'AIW1', jm_id: 'JM1', raw_data: { paket_harga: '34900000', bayar: '69800000', bayar_sisa: -34900000 } },
    { id_umroh: 'AIW1', jm_id: 'JM2', raw_data: { paket_harga: '34900000', bayar: '69800000', bayar_sisa: -34900000 } },
    { id_umroh: 'AIW1', jm_id: 'JM3', raw_data: { paket_harga: '34900000', bayar: '69800000', bayar_sisa: -34900000 } },
  ], []);
  assert.equal(uniform.get('AIW1').distinctAggregateCount, 1);
  assert.equal(uniform.get('AIW1').priceTotal, 104700000);
  assert.equal(uniform.get('AIW1').pinnedPaketTotal, undefined);

  // Multi-subgroup: two distinct aggregate values in one id_umroh.
  const multisub = buildBookingPriceIndex([
    { id_umroh: 'AIW2', jm_id: 'JM1', raw_data: { paket_harga: '28000000', bayar: '56000000', bayar_sisa: -28000000 } },
    { id_umroh: 'AIW2', jm_id: 'JM2', raw_data: { paket_harga: '28000000', bayar: '28000000', bayar_sisa: -0 } },
    { id_umroh: 'AIW2', jm_id: 'JM3', raw_data: { paket_harga: '33800000', bayar: '33800000', bayar_sisa: -33800000 } },
  ], []);
  assert.equal(multisub.get('AIW2').distinctAggregateCount, 2); // 56jt and 33.8jt (the 28jt row has sisa 0, not <0)

  // Manual-confirmed existing pax removes its paket from the partial pot.
  const pinned = buildBookingPriceIndex(
    [{ id_umroh: 'AIW3', jm_id: 'JM1', raw_data: { paket_harga: '34900000', bayar: '69800000', bayar_sisa: -34900000 } }],
    [{ id_umroh: 'AIW3', jm_id: 'JM2', raw_data: { paket_harga: '34900000', payment_guard: 'manual_confirmed_lunas_after_awapi_anomaly' } }],
  );
  assert.equal(pinned.get('AIW3').pinnedPaketTotal, 34900000);
});

test('preserveExistingPaymentForSuspiciousAwapiRow keeps a manual-confirmed guard sticky', () => {
  const incoming = aggRow({ id_umrah: 'AIW0028669', bayar: '69800000', bayar_sisa: -34900000, paket_harga: '34900000' });
  const existing = {
    bayar: 34900000,
    sisa: 0,
    raw_data: {
      payment_guard: 'manual_confirmed_lunas_after_awapi_anomaly',
      manual_confirmed_by: 'windy',
      manual_confirmed_at: '2026-06-23T00:00:00.000Z',
      paket_harga: '34900000',
    },
  };
  assert.equal(hasTrustedManualPaymentGuard(existing), true);
  const out = preserveExistingPaymentForSuspiciousAwapiRow(incoming, existing);
  assert.ok(out);
  assert.equal(out.bayar, 34900000);
  assert.equal(out.sisa, 0);
  assert.equal(out.raw_data.payment_guard, 'manual_confirmed_lunas_after_awapi_anomaly');
  assert.equal(out.raw_data.manual_confirmed_by, 'windy');
});

// ── AWAPI per-pax payment format (upstream fix, ~2026-06-25) ──
// Alhijaz fixed AWAPI to report payment PER-PAX (each jamaah's own bayar/sisa/
// status) instead of the booking-level aggregate replicated on every row. The
// per-pax format must flow through UNTOUCHED by the aggregate machinery: it is
// never "suspicious", never allocated, never normalized — stored exactly as sent.
// This locks that in so a future refactor can't accidentally re-apply the
// aggregate guard/allocator to correct per-pax data.

test('per-pax AWAPI rows (upstream fix) are stored verbatim, never aggregate-handled', () => {
  // A fully-paid pax: bayar == paket, sisa == 0, LUNAS.
  const lunas = normalizeAwapiRow(rawRow({ bayar: '34900000', bayar_sisa: 0, paket_harga: '34900000', bayar_status: 'LUNAS' }), { agentId: 'a' });
  assert.equal(lunas.bayar, 34900000);
  assert.equal(lunas.sisa, 0);
  assert.equal(hasSuspiciousAwapiPayment(lunas), false);
  assert.equal(allocateAggregatePartialRow(lunas, { priceTotal: 104700000, paxCount: 3, priceKnown: true, distinctAggregateCount: 1 }), null);
  assert.equal(resolveAggregateBookingLunasRow(lunas, { priceTotal: 34900000, paxCount: 1, priceKnown: true }), null);

  // A partially-paid pax: bayar < paket, sisa > 0, CICILAN (positive sisa = not suspicious).
  const cicilan = normalizeAwapiRow(rawRow({ bayar: '28500000', bayar_sisa: 900000, paket_harga: '29400000', bayar_status: 'CICILAN' }), { agentId: 'a' });
  assert.equal(cicilan.bayar, 28500000);
  assert.equal(cicilan.sisa, 900000);
  assert.equal(hasSuspiciousAwapiPayment(cicilan), false);
  assert.equal(allocateAggregatePartialRow(cicilan, { priceTotal: 88200000, paxCount: 3, priceKnown: true, distinctAggregateCount: 1 }), null);

  // An unpaid pax: bayar 0, sisa == paket, BELUM BAYAR.
  const belum = normalizeAwapiRow(rawRow({ bayar: '0', bayar_sisa: 29400000, paket_harga: '29400000', bayar_status: 'BELUM BAYAR' }), { agentId: 'a' });
  assert.equal(belum.bayar, 0);
  assert.equal(belum.sisa, 29400000);
  assert.equal(hasSuspiciousAwapiPayment(belum), false);
});

test('a MIXED per-pax booking carries no aggregate fingerprint', () => {
  // AIW0024477 shape: 5 LUNAS + 1 CICILAN, each row its own per-pax bayar — the
  // proof AWAPI now reports per-pax. No row is aggregate-shape (bayar_sisa>=0),
  // so the booking index records distinctAggregateCount 0 and nothing allocates.
  const rows = [
    { id_umroh: 'AIW0024477', jm_id: 'JM1', raw_data: { paket_harga: '32900000', bayar: '32900000', bayar_sisa: 0 } },
    { id_umroh: 'AIW0024477', jm_id: 'JM2', raw_data: { paket_harga: '32900000', bayar: '32900000', bayar_sisa: 0 } },
    { id_umroh: 'AIW0024477', jm_id: 'JM6', raw_data: { paket_harga: '29400000', bayar: '28500000', bayar_sisa: 900000 } },
  ];
  const idx = buildBookingPriceIndex(rows, []).get('AIW0024477');
  assert.equal(idx.distinctAggregateCount, 0);
  assert.equal(idx.priceTotal, 95200000);
});

test('buildBookingPriceIndex unions payload and DB pax with payload prices winning', () => {
  const payload = [
    { id_umroh: 'AIW1', jm_id: 'JM1', raw_data: { paket_harga: '34900000' } },
    { id_umroh: 'AIW1', jm_id: 'JM2', raw_data: {} }, // price missing in payload
    { id_umroh: 'AIW2', jm_id: 'JM9', raw_data: { paket_harga: '46900000' } },
  ];
  const existing = [
    // Same pax as payload JM1, stale DB price — payload must win.
    { id_umroh: 'AIW1', jm_id: 'JM1', raw_data: { paket_harga: '30000000' } },
    // Fills the payload row whose price was missing.
    { id_umroh: 'AIW1', jm_id: 'JM2', raw_data: { paket_harga: '36900000' } },
    // Pax only known to the DB (single-jamaah refresh payload).
    { id_umroh: 'AIW1', jm_id: 'JM3', raw_data: { paket_harga: '34900000' } },
  ];

  const index = buildBookingPriceIndex(payload, existing);

  assert.deepEqual(index.get('AIW1'), { priceTotal: 106700000, paxCount: 3, priceKnown: true, distinctAggregateCount: 0 });
  assert.deepEqual(index.get('AIW2'), { priceTotal: 46900000, paxCount: 1, priceKnown: true, distinctAggregateCount: 0 });
});

test('buildBookingPriceIndex marks bookings with unresolvable pax prices as not priceKnown', () => {
  const payload = [
    { id_umroh: 'AIW1', jm_id: 'JM1', raw_data: { paket_harga: '34900000' } },
    { id_umroh: 'AIW1', jm_id: 'JM2', raw_data: {} },
  ];

  const index = buildBookingPriceIndex(payload, []);

  assert.equal(index.get('AIW1').priceKnown, false);
  assert.equal(index.get('AIW1').paxCount, 2);

  // Pax without jm_id falls back to nama so ghost rows still count.
  const ghost = buildBookingPriceIndex([
    { id_umroh: 'AIW3', jm_id: '', nama: 'FULAN', raw_data: { paket_harga: '34900000' } },
    { id_umroh: 'AIW3', jm_id: 'JM5', raw_data: { paket_harga: '34900000' } },
  ], []);
  assert.deepEqual(ghost.get('AIW3'), { priceTotal: 69800000, paxCount: 2, priceKnown: true, distinctAggregateCount: 0 });
});
