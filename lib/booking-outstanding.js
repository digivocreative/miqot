// Shape-aware booking outstanding — satu-satunya cara yang benar menjumlah
// `sisa` lintas row sebuah booking (semantik pasca-insiden reminder palsu
// 2026-06-06, selaras collapsePelunasanBookings di telegram-notifier.js):
//
//   - Shape per-pax (raw bayar_sisa >= 0 / absen — mayoritas pasca-normalisasi
//     AWAPI Jun 2026): tiap row membawa sisa pax itu sendiri → outstanding
//     booking = Σ sisa. (AIW0029174: 3 pax owing 84,7jt, BUKAN 28,3jt.)
//   - Shape aggregate (raw bayar_sisa < 0): `bayar` adalah total booking yang
//     direplikasi per row dan `sisa` DB adalah nilai DP-era yang dipertahankan
//     guard → pakai price-proof Σ paket_harga − aggregate bila terbukti
//     (persis bookingAggregateOutstanding notifier), selain itu fallback
//     konservatif max(sisa).
//
// JANGAN dedupe buta per id_umroh (pola stats lama, Apr 2026 pra-insiden):
// itu mengambil satu row arbitrer per booking dan UNDER-report booking
// per-pax hampir 2x (nikita: 1,49M tampil vs 2,635M sebenarnya).
//
// Baris yang dihitung piutang hanya yang sudah mulai bayar (bayar>0, sisa>0)
// — belum_dp adalah hitungan pax, bukan piutang. Pemanggil WAJIB menyertakan
// kolom bayar + sisa + id_umroh + sub-field raw (JANGAN seluruh raw_data):
//   awapi_bayar_sisa:raw_data->>bayar_sisa,
//   awapi_paket_harga:raw_data->>paket_harga,
//   awapi_bayar:raw_data->>bayar

export function rowHasAggregateBayarShape(row) {
  const rawSisa = Number(row?.awapi_bayar_sisa);
  return Number.isFinite(rawSisa) && rawSisa < 0;
}

// Price-proof shape aggregate — cermin bookingAggregateOutstanding di
// telegram-notifier.js: bila SEMUA row punya raw paket_harga>0 dan raw bayar
// seragam (nilai aggregate yang direplikasi), outstanding booking terbukti =
// Σ paket_harga − aggregate. Selain itu null (tak terbukti → pemanggil
// fallback max sisa). Proof dihitung dari row yang lolos filter piutang —
// utk shape aggregate nilai replikasi membuat seluruh row booking lolos
// bersama; guard proven>0 menjaga arah konservatif bila universe parsial.
function provenAggregateOutstanding(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  let priceTotal = 0;
  let aggregate = null;
  for (const row of rows) {
    const price = Number(row?.awapi_paket_harga);
    if (!Number.isFinite(price) || price <= 0) return null;
    priceTotal += price;
    const paid = Number(row?.awapi_bayar);
    if (!Number.isFinite(paid)) return null;
    if (aggregate === null) aggregate = paid;
    else if (paid !== aggregate) return null;
  }
  return priceTotal - aggregate;
}

// Mengembalikan array per booking (urut kemunculan pertama):
//   { key, outstanding, memberCount, aggregateShape, firstRow }
// firstRow = row pertama booking itu dalam urutan input — pemanggil yang
// mengurutkan input (mis. sisa DESC) mendapat row "utama" yang sama dengan
// perilaku tampilan lama.
export function collapseBookingOutstanding(rows) {
  const byBooking = new Map();
  let i = 0;
  for (const row of rows || []) {
    const idx = i;
    i += 1;
    const sisa = Number(row?.sisa || 0);
    const bayar = Number(row?.bayar || 0);
    if (!(sisa > 0 && bayar > 0)) continue;
    const key = row?.id_umroh || `row:${idx}`;
    let b = byBooking.get(key);
    if (!b) {
      b = { key, firstRow: row, rows: [], sumSisa: 0, maxSisa: 0, memberCount: 0, aggregateShape: false };
      byBooking.set(key, b);
    }
    b.rows.push(row);
    b.sumSisa += sisa;
    b.maxSisa = Math.max(b.maxSisa, sisa);
    b.memberCount += 1;
    if (rowHasAggregateBayarShape(row)) b.aggregateShape = true;
  }
  return [...byBooking.values()].map(({ rows, sumSisa, maxSisa, ...b }) => {
    let outstanding = sumSisa;
    if (b.aggregateShape) {
      // Sama persis dengan collapsePelunasanBookings: proven>0 menang,
      // selain itu max sisa (perilaku konservatif lama).
      const proven = provenAggregateOutstanding(rows);
      outstanding = Number.isFinite(proven) && proven > 0 ? proven : maxSisa;
    }
    return { ...b, outstanding };
  });
}
