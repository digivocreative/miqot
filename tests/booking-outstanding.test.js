import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  rowHasAggregateBayarShape,
  collapseBookingOutstanding,
} from '../lib/booking-outstanding.js';

const rootPath = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(rootPath, p), 'utf8');

// ── shape detection ──────────────────────────────────────────────────────────

test('rowHasAggregateBayarShape: hanya raw bayar_sisa negatif', () => {
  assert.equal(rowHasAggregateBayarShape({ awapi_bayar_sisa: -39000000 }), true);
  assert.equal(rowHasAggregateBayarShape({ awapi_bayar_sisa: '-39000000' }), true);
  assert.equal(rowHasAggregateBayarShape({ awapi_bayar_sisa: 0 }), false);
  assert.equal(rowHasAggregateBayarShape({ awapi_bayar_sisa: 19400000 }), false);
  assert.equal(rowHasAggregateBayarShape({ awapi_bayar_sisa: null }), false);
  assert.equal(rowHasAggregateBayarShape({}), false);
});

// ── booking fold ─────────────────────────────────────────────────────────────

test('per-pax shape: outstanding booking = Σ sisa anggota (AIW0029174)', () => {
  // Kasus nyata insiden 2026-06-06: 3 pax RAHMAH masing-masing baru DP —
  // dedupe lama menampilkan 28,3jt padahal piutang booking 84,7jt.
  const bookings = collapseBookingOutstanding([
    { id_umroh: 'AIW0029174', bayar: 16600000, sisa: 28300000 },
    { id_umroh: 'AIW0029174', bayar: 16800000, sisa: 28100000 },
    { id_umroh: 'AIW0029174', bayar: 16600000, sisa: 28300000 },
  ]);
  assert.equal(bookings.length, 1);
  assert.equal(bookings[0].outstanding, 28300000 + 28100000 + 28300000);
  assert.equal(bookings[0].memberCount, 3);
  assert.equal(bookings[0].aggregateShape, false);
});

test('per-pax shape dengan sisa identik tetap dijumlah (AIW0028893)', () => {
  // 5 pax HEMAT, tiap orang DP 15jt sisa 19,4jt (15+19,4+0,5 diskon = 34,9 =
  // harga per pax) — sisa identik BUKAN bukti level-booking; shape ditentukan
  // raw bayar_sisa, bukan kesamaan nilai.
  const rows = Array.from({ length: 5 }, () => (
    { id_umroh: 'AIW0028893', bayar: 15000000, sisa: 19400000, awapi_bayar_sisa: 19400000 }
  ));
  const [b] = collapseBookingOutstanding(rows);
  assert.equal(b.outstanding, 19400000 * 5);
});

test('aggregate shape terbukti: price-proof Σ harga − aggregate (AIW0027949 data nyata)', () => {
  // Fixture = nilai PRODUKSI booking pemicu insiden 2026-06-06: 2 pax, sisa DB
  // stale 10,5jt/row (nilai DP-era yang dipertahankan guard), raw paket_harga
  // 46,9jt/pax, raw bayar 72,8jt (aggregate replikasi). Proven = 93,8 − 72,8
  // = 21jt — bukan max(sisa)=10,5jt, bukan Σ=21jt kebetulan ganda.
  const bookings = collapseBookingOutstanding([
    { id_umroh: 'AIW0027949', bayar: 36400000, sisa: 10500000, awapi_bayar_sisa: -25900000, awapi_paket_harga: '46900000', awapi_bayar: '72800000' },
    { id_umroh: 'AIW0027949', bayar: 36400000, sisa: 10500000, awapi_bayar_sisa: -25900000, awapi_paket_harga: '46900000', awapi_bayar: '72800000' },
  ]);
  assert.equal(bookings.length, 1);
  assert.equal(bookings[0].outstanding, 21000000);
  assert.equal(bookings[0].aggregateShape, true);
});

test('aggregate shape TAK terbukti: fallback max sisa (harga hilang / bayar tak seragam)', () => {
  // Tanpa paket_harga → proof null → max(sisa), persis fallback notifier.
  const [noPrice] = collapseBookingOutstanding([
    { id_umroh: 'A', bayar: 72800000, sisa: 21000000, awapi_bayar_sisa: -39000000 },
    { id_umroh: 'A', bayar: 72800000, sisa: 21000000, awapi_bayar_sisa: -39000000 },
  ]);
  assert.equal(noPrice.outstanding, 21000000); // max, bukan 42jt

  // bayar tak seragam (pair/sub-group aggregate, kasus AIW0026122) → tak
  // terbukti → max, JANGAN fabrikasi Σ harga − max(bayar).
  const [nonUniform] = collapseBookingOutstanding([
    { id_umroh: 'B', bayar: 1, sisa: 5000000, awapi_bayar_sisa: -1, awapi_paket_harga: '46900000', awapi_bayar: '69000000' },
    { id_umroh: 'B', bayar: 1, sisa: 7000000, awapi_bayar_sisa: -1, awapi_paket_harga: '46900000', awapi_bayar: '67200000' },
  ]);
  assert.equal(nonUniform.outstanding, 7000000);

  // proven <= 0 (aggregate sudah menutup Σ harga) → fallback max juga.
  const [overpaid] = collapseBookingOutstanding([
    { id_umroh: 'C', bayar: 1, sisa: 100, awapi_bayar_sisa: -1, awapi_paket_harga: '1000', awapi_bayar: '2500' },
    { id_umroh: 'C', bayar: 1, sisa: 200, awapi_bayar_sisa: -1, awapi_paket_harga: '1000', awapi_bayar: '2500' },
  ]);
  assert.equal(overpaid.outstanding, 200);
});

test('satu row aggregate-shape menulari seluruh booking (mixed rows)', () => {
  const [b] = collapseBookingOutstanding([
    { id_umroh: 'X', bayar: 10, sisa: 100, awapi_bayar_sisa: 100 },
    { id_umroh: 'X', bayar: 10, sisa: 300, awapi_bayar_sisa: -5 },
  ]);
  assert.equal(b.aggregateShape, true);
  assert.equal(b.outstanding, 300); // tanpa price fields: proof null → max, bukan 400
});

test('hanya booking yang sudah mulai bayar; sisa<=0 dilewati', () => {
  const bookings = collapseBookingOutstanding([
    { id_umroh: 'BELUM_DP', bayar: 0, sisa: 35000000 },
    { id_umroh: 'LUNAS', bayar: 30000000, sisa: 0 },
    { id_umroh: 'LEBIH', bayar: 40000000, sisa: -1000000 },
    { id_umroh: 'CICIL', bayar: 5000000, sisa: 1000000 },
  ]);
  assert.equal(bookings.length, 1);
  assert.equal(bookings[0].key, 'CICIL');
  assert.equal(bookings[0].outstanding, 1000000);
});

test('row tanpa id_umroh berdiri sebagai booking sendiri (tidak digabung)', () => {
  const bookings = collapseBookingOutstanding([
    { id_umroh: '', bayar: 1, sisa: 100 },
    { id_umroh: null, bayar: 1, sisa: 200 },
  ]);
  assert.equal(bookings.length, 2);
  assert.equal(bookings.reduce((s, b) => s + b.outstanding, 0), 300);
});

test('firstRow = row pertama booking dalam urutan input (utk nama tampilan)', () => {
  const bookings = collapseBookingOutstanding([
    { id_umroh: 'A', nama: 'TERBESAR', bayar: 1, sisa: 900 },
    { id_umroh: 'A', nama: 'KECIL', bayar: 1, sisa: 100 },
  ]);
  assert.equal(bookings[0].firstRow.nama, 'TERBESAR');
});

// ── netting kredit lebih-bayar antar-pax (booking-level) ─────────────────────

test('netting: lebih-bayar 1 pax menutup sisa per-pax saudaranya (AIW0028524)', () => {
  // 8 pax RAHMAH. ADI lebih bayar (raw bayar 100jt utk paket 51jt, sisa DB sudah
  // 0); 7 pax lain cicilan sisa total 16jt. Kredit 49jt > 16jt → booking lunas.
  const rows = [
    ...Array.from({ length: 6 }, (_, k) => ({
      id_umroh: 'AIW0028524', nama: `PAX${k}`, bayar: 42000000, sisa: 2500000,
      awapi_bayar_sisa: '2500000', awapi_paket_harga: '44500000', awapi_bayar: '42000000',
    })),
    { id_umroh: 'AIW0028524', nama: 'NIA', bayar: 50000000, sisa: 1000000,
      awapi_bayar_sisa: '1000000', awapi_paket_harga: '51000000', awapi_bayar: '50000000' },
    { id_umroh: 'AIW0028524', nama: 'ADI', bayar: 50000000, sisa: 0,
      awapi_bayar_sisa: '-49000000', awapi_paket_harga: '51000000', awapi_bayar: '100000000' },
  ];
  const bookings = collapseBookingOutstanding(rows);
  // Σ harga 369jt, money = (50+42*6) + 100 = 402jt → ter-net penuh → di-drop.
  assert.equal(bookings.length, 0);
});

test('netting: lebih-bayar parsial — kredit tunggal kurang menutup → sisa berkurang (AIW0027485)', () => {
  // DEANDRA cicilan 0,9jt; ZURAIDA+DONAL keduanya raw bayar 76jt (replikasi sub-
  // grup, settled sisa 0). money = 38 + 76 = 114jt vs harga 116,7jt → 2,7jt.
  const rows = [
    { id_umroh: 'AIW0027485', nama: 'DEANDRA', bayar: 38000000, sisa: 900000,
      awapi_bayar_sisa: '900000', awapi_paket_harga: '38900000', awapi_bayar: '38000000' },
    { id_umroh: 'AIW0027485', nama: 'ZURAIDA', bayar: 37400000, sisa: 0,
      awapi_bayar_sisa: '-37100000', awapi_paket_harga: '38900000', awapi_bayar: '76000000' },
    { id_umroh: 'AIW0027485', nama: 'DONAL', bayar: 37400000, sisa: 0,
      awapi_bayar_sisa: '-37100000', awapi_paket_harga: '38900000', awapi_bayar: '76000000' },
  ];
  const [b] = collapseBookingOutstanding(rows);
  assert.equal(b.outstanding, 2700000);
  assert.equal(b.memberCount, 1); // hanya DEANDRA yang owing
  assert.equal(b.firstRow.nama, 'DEANDRA');
});

test('netting TIDAK fire: dua nilai aggregate berbeda = ambigu → konservatif (AIW0025606)', () => {
  // THORIQ cicilan 11,1jt. Saudara lebih-bayar dgn raw bayar BERBEDA (58jt & 53jt)
  // → sub-grup ambigu, size!=1 → netting null → tetap Σ sisa owing = 11,1jt.
  const rows = [
    { id_umroh: 'AIW0025606', nama: 'THORIQ', bayar: 15400000, sisa: 11100000,
      awapi_bayar_sisa: '11100000', awapi_paket_harga: '26500000', awapi_bayar: '15400000' },
    { id_umroh: 'AIW0025606', nama: 'NINDIA', bayar: 29000000, sisa: 0,
      awapi_bayar_sisa: '0', awapi_paket_harga: '29000000', awapi_bayar: '29000000' },
    { id_umroh: 'AIW0025606', nama: 'ARIEF', bayar: 29000000, sisa: 0,
      awapi_bayar_sisa: '-29000000', awapi_paket_harga: '29000000', awapi_bayar: '58000000' },
    { id_umroh: 'AIW0025606', nama: 'HASNA', bayar: 26500000, sisa: 0,
      awapi_bayar_sisa: '-26500000', awapi_paket_harga: '26500000', awapi_bayar: '53000000' },
  ];
  const [b] = collapseBookingOutstanding(rows);
  assert.equal(b.outstanding, 11100000);
});

test('netting TIDAK fire tanpa universe harga lengkap → Σ sisa owing (konservatif)', () => {
  // Satu saudara lebih-bayar TAPI satu pax tak punya paket_harga → universe tak
  // lengkap → null → tetap sisa owing.
  const rows = [
    { id_umroh: 'Z', nama: 'OWE', bayar: 10000000, sisa: 5000000,
      awapi_bayar_sisa: '5000000', awapi_paket_harga: '15000000', awapi_bayar: '10000000' },
    { id_umroh: 'Z', nama: 'OVER', bayar: 20000000, sisa: 0,
      awapi_bayar_sisa: '-5000000', awapi_paket_harga: null, awapi_bayar: '20000000' },
  ];
  const [b] = collapseBookingOutstanding(rows);
  assert.equal(b.outstanding, 5000000);
});

test('netting: belum-DP saudara tidak ikut di-cover oleh kredit lebih bayar', () => {
  // OWE cicilan 5jt; OVER lebih bayar (raw 30jt utk paket 20jt, kredit 10jt);
  // BELUMDP bayar 0. money = 5jt(OWE bayar? tidak — pakai raw bayar OWE) ... uji
  // bahwa belum-DP (bayar=0) dilewati: priceTotal = 20(OWE)+20(OVER)=40,
  // money = 10(OWE raw) + 30(OVER) = 40 → net 0; belum-DP tidak menambah harga.
  const rows = [
    { id_umroh: 'Q', nama: 'OWE', bayar: 10000000, sisa: 10000000,
      awapi_bayar_sisa: '10000000', awapi_paket_harga: '20000000', awapi_bayar: '10000000' },
    { id_umroh: 'Q', nama: 'OVER', bayar: 20000000, sisa: 0,
      awapi_bayar_sisa: '-10000000', awapi_paket_harga: '20000000', awapi_bayar: '30000000' },
    { id_umroh: 'Q', nama: 'BELUMDP', bayar: 0, sisa: 20000000,
      awapi_bayar_sisa: '20000000', awapi_paket_harga: '20000000', awapi_bayar: '0' },
  ];
  const bookings = collapseBookingOutstanding(rows);
  assert.equal(bookings.length, 0); // OWE ter-cover, belum-DP bukan piutang
});

test('netting backward-compat: owing-only input (pemanggil lama) tak berubah', () => {
  // Tanpa saudara lebih-bayar di input → aggBayar size 0 → netting no-op.
  const [b] = collapseBookingOutstanding([
    { id_umroh: 'P', bayar: 10000000, sisa: 5000000,
      awapi_bayar_sisa: '5000000', awapi_paket_harga: '15000000', awapi_bayar: '10000000' },
  ]);
  assert.equal(b.outstanding, 5000000);
});

// ── source contracts: stats dashboard memakai fold ini ───────────────────────

test('stats dashboard memakai collapseBookingOutstanding, bukan dedupe buta', () => {
  const server = read('server.js');
  assert.match(server, /import \{ collapseBookingOutstanding \} from '\.\/lib\/booking-outstanding\.js'/);
  // Pola dedupe buta lama harus hilang.
  assert.doesNotMatch(server, /seenOutBookings/);
  assert.doesNotMatch(server, /seenOlBookings/);
  // totalOutstanding & outstandingList berbagi SATU fold (tidak drift): satu
  // universe pax penuh → satu collapseBookingOutstanding → dipakai keduanya.
  assert.match(server, /const collapsedOutstanding = collapseBookingOutstanding\(/);
  assert.match(server, /collapsedOutstanding\.reduce\(/);   // totalOutstanding
  assert.match(server, /const outstandingList = collapsedOutstanding\b/); // list
  // Query outstanding membawa sub-field raw shape + price-proof (bukan raw_data
  // utuh) untuk fold shape-aware + netting kredit lebih-bayar.
  for (const field of ['awapi_bayar_sisa:raw_data->>bayar_sisa', 'awapi_paket_harga:raw_data->>paket_harga', 'awapi_bayar:raw_data->>bayar']) {
    assert.ok(server.includes(field), `olQ select ${field}`);
  }
});

test('MCP summarizePayments memakai fold bersama yang sama (tidak drift)', () => {
  const mcp = read('mcp-server.js');
  assert.match(mcp, /import \{ collapseBookingOutstanding \} from '\.\/lib\/booking-outstanding\.js'/);
  assert.doesNotMatch(mcp, /function rowHasAggregateBayarShape/);
});
