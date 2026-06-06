import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isUpstreamLunas,
  hasAggregateBayarShape,
  bookingProvenOutstanding,
  bookingAggregateOutstanding,
  collapsePelunasanBookings,
  buildPelunasanMessage,
} from '../telegram-notifier.js';

// Mitigasi guard-bug (2026-06-05): pelunasanReminder harus skip row yang kolom
// `sisa`-nya stuck >0 padahal payload AWAPI terakhir sudah melaporkan lunas.
// PostgREST mengembalikan alias raw_data->>'...' sebagai TEXT, jadi
// awapi_bayar_sisa datang sebagai string.

test('isUpstreamLunas skips rows whose upstream status reports lunas', () => {
  assert.equal(isUpstreamLunas({ awapi_bayar_status: 'LUNAS' }), true);
  assert.equal(isUpstreamLunas({ awapi_bayar_status: 'LEBIH BAYAR' }), true);
  // Whitespace/case noise from upstream must not defeat the filter.
  assert.equal(isUpstreamLunas({ awapi_bayar_status: ' LUNAS ' }), true);
  assert.equal(isUpstreamLunas({ awapi_bayar_status: 'LEBIH  BAYAR' }), true);
  assert.equal(isUpstreamLunas({ awapi_bayar_status: 'lebih bayar' }), true);
});

test('isUpstreamLunas skips rows whose upstream sisa is negative (aggregate booking shape)', () => {
  // Production victim shape: status LEBIH BAYAR + bayar_sisa negatif (TEXT).
  assert.equal(isUpstreamLunas({ awapi_bayar_status: null, awapi_bayar_sisa: '-69800000' }), true);
  assert.equal(isUpstreamLunas({ awapi_bayar_sisa: -34900000 }), true);
});

test('isUpstreamLunas keeps genuinely outstanding rows', () => {
  assert.equal(isUpstreamLunas({ awapi_bayar_status: 'CICILAN', awapi_bayar_sisa: '29300000' }), false);
  assert.equal(isUpstreamLunas({ awapi_bayar_status: 'BELUM BAYAR' }), false);
  // Legacy umrah_detail rows have no bayar_status/bayar_sisa in raw_data —
  // they must stay in the reminder.
  assert.equal(isUpstreamLunas({ awapi_bayar_status: null, awapi_bayar_sisa: null }), false);
  assert.equal(isUpstreamLunas({}), false);
  // Garbage values must not accidentally skip a reminder.
  assert.equal(isUpstreamLunas({ awapi_bayar_sisa: 'abc' }), false);
  assert.equal(isUpstreamLunas({ awapi_bayar_sisa: '' }), false);
  assert.equal(isUpstreamLunas({ awapi_bayar_sisa: '0' }), false);
});

test('hasAggregateBayarShape flags only negative upstream bayar_sisa', () => {
  // PostgREST returns raw_data->>'...' aliases as TEXT.
  assert.equal(hasAggregateBayarShape({ awapi_bayar_sisa: '-25900000' }), true);
  assert.equal(hasAggregateBayarShape({ awapi_bayar_sisa: -13900000 }), true);
  // Clean per-pax LUNAS rows (sisa 0/positive/missing) are not the aggregate
  // shape — their lunas claim is trustworthy without booking math.
  assert.equal(hasAggregateBayarShape({ awapi_bayar_sisa: '0' }), false);
  assert.equal(hasAggregateBayarShape({ awapi_bayar_sisa: '29300000' }), false);
  assert.equal(hasAggregateBayarShape({ awapi_bayar_sisa: null }), false);
  assert.equal(hasAggregateBayarShape({}), false);
});

test('bookingProvenOutstanding proves partially-paid multi-pax bookings outstanding', () => {
  // Production case AIW0027949 (widi, verified upstream 2026-06-06): 2 pax at
  // 46.9jt, booking aggregate 72.8jt — AWAPI claims LEBIH BAYAR but 21jt is
  // genuinely outstanding. The reminder must keep firing.
  const widi = [
    { awapi_paket_harga: '46900000', awapi_bayar: '72800000' },
    { awapi_paket_harga: '46900000', awapi_bayar: '72800000' },
  ];
  assert.equal(bookingProvenOutstanding(widi), true);

  // Production case AIW0029071 (TEJO, 1 pax overpaid): aggregate covers the
  // booking price → really lunas, suppression is correct.
  const tejo = [{ awapi_paket_harga: '33900000', awapi_bayar: '47800000' }];
  assert.equal(bookingProvenOutstanding(tejo), false);

  // Fully-paid 3-pax aggregate booking (yenita shape) → not outstanding.
  const yenita = [
    { awapi_paket_harga: '34900000', awapi_bayar: '104700000' },
    { awapi_paket_harga: '34900000', awapi_bayar: '104700000' },
    { awapi_paket_harga: '34900000', awapi_bayar: '104700000' },
  ];
  assert.equal(bookingProvenOutstanding(yenita), false);
});

test('bookingProvenOutstanding stays conservative when the proof is incomputable', () => {
  // False reminders are the original incident — unprovable bookings suppress.
  assert.equal(bookingProvenOutstanding([]), false);
  assert.equal(bookingProvenOutstanding(null), false);
  assert.equal(bookingProvenOutstanding(undefined), false);
  // A pax with a missing/garbage price makes Σ paket_harga an undercount.
  assert.equal(bookingProvenOutstanding([
    { awapi_paket_harga: '46900000', awapi_bayar: '72800000' },
    { awapi_paket_harga: null, awapi_bayar: '72800000' },
  ]), false);
  assert.equal(bookingProvenOutstanding([
    { awapi_paket_harga: 'abc', awapi_bayar: '72800000' },
  ]), false);
});

test('bookingAggregateOutstanding returns Σ paket_harga − aggregate, null when unprovable', () => {
  // AIW0027949 shape: 2 pax at 46.9jt, booking aggregate 72.8jt → 21jt owed.
  assert.equal(bookingAggregateOutstanding([
    { awapi_paket_harga: '46900000', awapi_bayar: '72800000' },
    { awapi_paket_harga: '46900000', awapi_bayar: '72800000' },
  ]), 21000000);
  // Fully paid → zero/negative, not outstanding.
  assert.equal(bookingAggregateOutstanding([
    { awapi_paket_harga: '33900000', awapi_bayar: '47800000' },
  ]), -13900000);
  // Unprovable → null, never a number the collapse could display.
  assert.equal(bookingAggregateOutstanding([]), null);
  assert.equal(bookingAggregateOutstanding(null), null);
  assert.equal(bookingAggregateOutstanding([
    { awapi_paket_harga: null, awapi_bayar: '72800000' },
  ]), null);
});

test('bookingAggregateOutstanding rejects non-uniform pair/sub-group aggregates', () => {
  // Production case AIW0026122: fully-paid 3-pax booking where bayar carries
  // PAIR aggregates (69/67.2/67.2jt), not one booking total — Σ harga −
  // max(bayar) would fabricate a 32.7jt outstanding on a paid-off booking.
  assert.equal(bookingAggregateOutstanding([
    { awapi_paket_harga: '34500000', awapi_bayar: '69000000' },
    { awapi_paket_harga: '33600000', awapi_bayar: '67200000' },
    { awapi_paket_harga: '33600000', awapi_bayar: '67200000' },
  ]), null);
  assert.equal(bookingProvenOutstanding([
    { awapi_paket_harga: '34500000', awapi_bayar: '69000000' },
    { awapi_paket_harga: '33600000', awapi_bayar: '67200000' },
  ]), false);
  // A pax with missing/garbage bayar also breaks the uniform-aggregate proof.
  assert.equal(bookingAggregateOutstanding([
    { awapi_paket_harga: '46900000', awapi_bayar: '72800000' },
    { awapi_paket_harga: '46900000', awapi_bayar: null },
  ]), null);
});

// ── collapsePelunasanBookings: sisa per booking harus total, bukan max ──
// Notifikasi 2026-06-06 (nikita) menampilkan "sisa Rp28.3jt" utk booking 3 pax
// yang totalnya 84.7jt — Math.max antar pax meng-understate tagihan riil
// (total pesan 140jt, riil 299.5jt, diverifikasi live AWAPI per booking).

const paxRow = (over = {}) => ({
  agent_id: 'A',
  id_umroh: 'AIW0029174',
  nama: 'LUSI LESMANA SARI',
  paket: 'RAHMAH',
  tgl_berangkat: '2026-06-30',
  bayar: 16600000,
  sisa: 28300000,
  awapi_bayar_status: 'CICILAN',
  awapi_bayar_sisa: '28300000',
  ...over,
});

test('collapsePelunasanBookings sums per-pax sisa across the booking', () => {
  // Production case AIW0029174 (verified live AWAPI 2026-06-06): per-pax shape,
  // sisa 28.3/28.1/28.3jt → booking owes 84.7jt, not max 28.3jt.
  const bookings = collapsePelunasanBookings([
    paxRow(),
    paxRow({ nama: 'MUHAMMAD FAUZAN MARWAN ALUWIE', bayar: 16800000, sisa: 28100000, awapi_bayar_sisa: '28100000' }),
    paxRow({ nama: 'MUHMMAD IBNU FASA ATHAILLAH' }),
  ]);
  assert.equal(bookings.length, 1);
  assert.equal(bookings[0].sisa, 84700000);
  assert.equal(bookings[0].bayar, 50000000);
  assert.equal(bookings[0].memberCount, 3);
  assert.equal(bookings[0].names[0], 'LUSI LESMANA SARI');
  assert.equal(bookings[0].paket, 'RAHMAH');
  assert.equal(bookings[0].tgl_berangkat, '2026-06-30');
});

test('collapsePelunasanBookings keeps solo bookings and separates distinct bookings', () => {
  const bookings = collapsePelunasanBookings([
    paxRow({ id_umroh: 'AIW0028593', nama: 'TRI HAPSARI', paket: 'UHUD', tgl_berangkat: '2026-07-04', bayar: 17500000, sisa: 19000000, awapi_bayar_sisa: '19000000' }),
    paxRow({ id_umroh: 'AIW0029033', nama: 'DWI MARYATNO', paket: 'HEMAT', tgl_berangkat: '2026-07-11', bayar: 5000000, sisa: 26900000, awapi_bayar_sisa: '26900000' }),
    paxRow({ id_umroh: 'AIW0029033', nama: 'IKA ENDAR PRAYOGI', paket: 'HEMAT', tgl_berangkat: '2026-07-11', bayar: 5000000, sisa: 26900000, awapi_bayar_sisa: '26900000' }),
    // Different agent, same id_umroh → must not merge across agents.
    paxRow({ agent_id: 'B', id_umroh: 'AIW0029033', nama: 'ORANG LAIN', sisa: 1000000, awapi_bayar_sisa: '1000000' }),
  ]);
  assert.equal(bookings.length, 3);
  const tri = bookings.find(b => b.id_umroh === 'AIW0028593');
  assert.equal(tri.sisa, 19000000);
  assert.equal(tri.memberCount, 1);
  const hemat = bookings.find(b => b.id_umroh === 'AIW0029033' && b.agent_id === 'A');
  assert.equal(hemat.sisa, 53800000);
  assert.equal(hemat.memberCount, 2);
  assert.equal(hemat.names[0], 'DWI MARYATNO');
});

test('collapsePelunasanBookings prices aggregate-shape bookings from the booking proof', () => {
  // Kept aggregate-shape rows (negative raw bayar_sisa) carry the stale DP-era
  // DB sisa — summing those would overstate. The proven Σ paket_harga −
  // aggregate (passed by pelunasanReminder) is the real balance.
  const rows = [
    paxRow({ id_umroh: 'AIW0027949', nama: 'WIDI', sisa: 41900000, awapi_bayar_status: 'LEBIH BAYAR', awapi_bayar_sisa: '-25900000' }),
    paxRow({ id_umroh: 'AIW0027949', nama: 'PASANGAN WIDI', sisa: 41900000, awapi_bayar_status: 'LEBIH BAYAR', awapi_bayar_sisa: '-25900000' }),
  ];
  const proven = new Map([['A:AIW0027949', 21000000]]);
  const [booking] = collapsePelunasanBookings(rows, proven);
  assert.equal(booking.sisa, 21000000);

  // Without a proof entry, fall back to max (old conservative behavior) —
  // never the sum of stale duplicated values.
  const [fallback] = collapsePelunasanBookings(rows);
  assert.equal(fallback.sisa, 41900000);

  // A non-positive proof entry must never surface as the displayed sisa —
  // that is the false-reminder direction. Fall back to max instead.
  const [zeroProof] = collapsePelunasanBookings(rows, new Map([['A:AIW0027949', 0]]));
  assert.equal(zeroProof.sisa, 41900000);
  const [negativeProof] = collapsePelunasanBookings(rows, new Map([['A:AIW0027949', -5000000]]));
  assert.equal(negativeProof.sisa, 41900000);
});

test('collapsePelunasanBookings groups legacy rows without id_umroh by date+name', () => {
  const bookings = collapsePelunasanBookings([
    paxRow({ id_umroh: null, nama: 'BUDI SANTOSO', sisa: 10000000, awapi_bayar_sisa: null }),
    paxRow({ id_umroh: null, nama: 'SITI AMINAH', sisa: 12000000, awapi_bayar_sisa: null }),
  ]);
  // Different names → different fallback keys → separate entries, no merge.
  assert.equal(bookings.length, 2);
  assert.deepEqual(bookings.map(b => b.sisa).sort((a, b) => a - b), [10000000, 12000000]);
});

test('buildPelunasanMessage totals the per-booking sisa', () => {
  // today 2026-06-06: 30 Jun = H-24 (lewat deadline 6 hari), 11 Jul = H-35
  // (deadline 5 hari lagi) — same window as the production notification.
  const message = buildPelunasanMessage('Nikita Sari', [
    { tgl_berangkat: '2026-06-30', sisa: 84700000, names: ['LUSI LESMANA SARI'], memberCount: 3, paket: 'RAHMAH' },
    { tgl_berangkat: '2026-07-11', sisa: 56000000, names: ['JER AZIZAH NASUTION'], memberCount: 2, paket: 'UHUD' },
  ], '2026-06-06');
  assert.match(message, /sisa <b>Rp84\.7jt<\/b>/);
  assert.match(message, /sisa <b>Rp56\.0jt<\/b>/);
  assert.match(message, /Total sisa yang perlu difollow up: <b>Rp140\.7jt<\/b>/);
  assert.match(message, /lewat deadline 6 hari/);
  assert.match(message, /deadline 5 hari lagi/);
  assert.match(message, /\+2 jamaah/);
  assert.match(message, /\+1 jamaah/);
});
