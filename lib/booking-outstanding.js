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

// Booking-level netting kredit lebih-bayar antar-pax. Mengembalikan outstanding
// booking yang sudah ter-net (>=0), atau null bila tak bisa dibuktikan (pemanggil
// pertahankan nilai konservatif). HANYA dipanggil saat owing-rows BUKAN
// aggregate-shape (lihat collapse) — jadi setiap row raw bayar_sisa<0 di sini
// pasti pax saudara yang lebih bayar & settled (sisa<=0), bukan owing.
//
// Kasus pemicu (AIW0028524): 8 pax, ADI lebih bayar 49jt (raw bayar 100jt utk
// paket 51jt) tercatat di record-nya; 7 pax lain cicilan sisa 16jt total. Kredit
// 49jt > 16jt → booking sebenarnya lunas. DB sisa ADI sudah dinormalisasi ke 0
// (kredit hanya tersisa di raw bayar_sisa), jadi Σ kolom sisa TIDAK cukup —
// wajib baca raw.
//
// money (BATAS BAWAH uang masuk — tak pernah over-count agar tak pernah
// false-lunas):
//   - row per-pax (raw bayar_sisa>=0): raw bayar = uang individu (bayar<=harga
//     pax), dijumlah.
//   - row lebih-bayar (raw bayar_sisa<0): raw bayar = angka level-booking yang
//     AWAPI replikasi ke pax tercakup. Hanya terbukti bila nilainya TUNGGAL
//     (size==1) — dihitung SEKALI. >=2 nilai berbeda = sub-grup ambigu (kasus
//     AIW0026122/AIW0025606) → null, biar konservatif (persis filosofi
//     provenAggregateOutstanding yang menuntut bayar seragam).
//   - belum-DP (bayar<=0): dilewati (bukan piutang, bukan kredit).
// outstanding = max(0, Σ paket_harga pax-berbayar − money). Σ harga harus
// lengkap (tiap pax-berbayar punya paket_harga>0), kalau tidak → null.
function provenBookingNetOutstanding(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  let priceTotal = 0;
  let perPaxPaid = 0;
  const aggBayar = new Set();
  for (const row of rows) {
    const bayar = Number(row?.bayar || 0);
    if (!(bayar > 0)) continue; // belum-DP: bukan piutang, bukan kredit
    const price = Number(row?.awapi_paket_harga);
    if (!Number.isFinite(price) || price <= 0) return null; // universe harga tak lengkap
    priceTotal += price;
    const rawSisa = Number(row?.awapi_bayar_sisa);
    const rawBayar = Number(row?.awapi_bayar);
    if (Number.isFinite(rawSisa) && rawSisa < 0) {
      if (!Number.isFinite(rawBayar) || rawBayar <= 0) return null;
      aggBayar.add(rawBayar);
    } else {
      const paid = Number.isFinite(rawBayar) ? rawBayar : bayar;
      perPaxPaid += Math.max(0, paid);
    }
  }
  if (aggBayar.size !== 1) return null; // 0 kredit → tak ada yg di-net; >=2 → ambigu
  let money = perPaxPaid;
  for (const v of aggBayar) money += v;
  return Math.max(0, priceTotal - money);
}

// Mengembalikan array per booking (urut kemunculan pertama), hanya booking yang
// masih punya piutang:
//   { key, outstanding, memberCount, aggregateShape, firstRow }
// firstRow = row OWING pertama dalam urutan input — pemanggil yang mengurutkan
// input (mis. sisa DESC) mendapat row "utama" yang sama dengan tampilan lama.
//
// Input boleh memuat pax non-owing (lunas/lebih-bayar/belum-DP): mereka TIDAK
// dihitung sebagai anggota piutang, tapi dipakai untuk netting kredit lebih
// bayar (provenBookingNetOutstanding). Pemanggil lama yang hanya mengirim owing
// rows tetap berperilaku identik (tak ada saudara lebih-bayar → netting no-op).
export function collapseBookingOutstanding(rows) {
  const byBooking = new Map();
  let i = 0;
  for (const row of rows || []) {
    const idx = i;
    i += 1;
    const key = row?.id_umroh || `row:${idx}`;
    let b = byBooking.get(key);
    if (!b) {
      b = { key, all: [], owing: [], firstRow: null, sumSisa: 0, maxSisa: 0, aggregateShape: false };
      byBooking.set(key, b);
    }
    b.all.push(row);
    const sisa = Number(row?.sisa || 0);
    const bayar = Number(row?.bayar || 0);
    if (sisa > 0 && bayar > 0) {
      if (!b.firstRow) b.firstRow = row;
      b.owing.push(row);
      b.sumSisa += sisa;
      b.maxSisa = Math.max(b.maxSisa, sisa);
      if (rowHasAggregateBayarShape(row)) b.aggregateShape = true;
    }
  }
  const result = [];
  for (const b of byBooking.values()) {
    if (b.owing.length === 0) continue; // tak ada pax piutang → booking lunas
    let outstanding = b.sumSisa;
    if (b.aggregateShape) {
      // Aggregate `bayar` direplikasi untuk SELURUH booking, jadi buktikan lawan
      // SEMUA pax (Σpaket_all − aggregate), bukan owing saja: pax lunas / manual-
      // confirmed yang keluar dari `owing` membuat Σpaket owing under-count dan
      // proof kolaps ke 0 (under-report saldo asli). Fallback: proof owing-only,
      // lalu max sisa konservatif. Netting kredit TIDAK dipakai di shape aggregate.
      const provenAll = provenAggregateOutstanding(b.all);
      const provenOwing = provenAggregateOutstanding(b.owing);
      outstanding = Number.isFinite(provenAll) && provenAll > 0 ? provenAll
        : Number.isFinite(provenOwing) && provenOwing > 0 ? provenOwing
        : b.maxSisa;
    } else {
      // Owing rows per-pax: kreditkan lebih-bayar saudara bila terbukti.
      const netted = provenBookingNetOutstanding(b.all);
      if (netted !== null) outstanding = netted;
    }
    if (!(outstanding > 0)) continue; // kredit menutup penuh → bukan piutang lagi
    result.push({
      key: b.key,
      firstRow: b.firstRow,
      outstanding,
      memberCount: b.owing.length,
      aggregateShape: b.aggregateShape,
    });
  }
  return result;
}
