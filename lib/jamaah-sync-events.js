// Deteksi event notifikasi jamaah (jamaah baru / cicilan / pelunasan) sebagai
// fungsi murni — dipisah dari server.js supaya bisa diuji tanpa Supabase.
//
// Dua mode:
// - watermarkEnabled=false (migrasi kolom notif belum diterapkan): perilaku
//   berbasis "row sudah ada di DB" seperti sebelumnya.
// - watermarkEnabled=true: "baru" = belum pernah DIUMUMKAN (notif_new_sent_at
//   NULL) dan delta pembayaran dihitung terhadap notif_last_bayar — bukan
//   terhadap bayar di DB, yang sudah maju duluan tiap upsert. Ini yang membuat
//   notifikasi yang sempat di-drop (siklus partial, di luar jam kirim, restart,
//   gagal kirim) fire ulang di siklus layak berikutnya, bukan hilang permanen.

export function emptyJamaahSyncEvents() {
  return { jamaahBaru: [], pembayaranCicilan: [], pembayaranPelunasan: [] };
}

export function hasJamaahSyncEvents(events) {
  return !!(
    events?.jamaahBaru?.length ||
    events?.pembayaranCicilan?.length ||
    events?.pembayaranPelunasan?.length
  );
}

export function mergeJamaahSyncEvents(target, source) {
  if (!source) return target;
  target.jamaahBaru.push(...(source.jamaahBaru || []));
  target.pembayaranCicilan.push(...(source.pembayaranCicilan || []));
  target.pembayaranPelunasan.push(...(source.pembayaranPelunasan || []));
  return target;
}

export function jamaahRowKey(row) {
  if (!row?.id_umroh || !row?.jm_id) return null;
  return `${String(row.id_umroh).trim().toLowerCase()}|${String(row.jm_id).trim().toLowerCase()}`;
}

export function toMoney(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function hasJamaahPayment(row) {
  return toMoney(row?.bayar) > 0;
}

export function datePlusDaysKey(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isFutureRelevantJamaah(row, cutoffStr) {
  if (!row?.tgl_berangkat) return true;
  return String(row.tgl_berangkat).slice(0, 10) >= cutoffStr;
}

function bookingKeyOf(row) {
  const id = String(row?.id_umroh || '').trim().toLowerCase();
  return id || null;
}

function registrationBatchKey(row) {
  const raw = row?.tgl_daftar;
  if (!raw) return null;
  const key = String(raw).slice(0, 10).trim();
  return key || null;
}

// Pax dengan bayar > 0 (incoming atau existing) mengkredit saudara se-booking
// yang MENDAFTAR DI TANGGAL YANG SAMA. Dua sisi yang harus dijaga sekaligus:
//
// - Kredit level booking wajib ada: pembayaran grup di hulu sering menempel di
//   sebagian pax saja (atau agregat booking), jadi gate per-pax menelan saudara
//   se-booking — keluhan "daftar ber-lima, notif cuma sebagian" (AIW0030233,
//   2026-08-16).
// - Tapi kredit itu tidak boleh menular ke pax yang MENYUSUL belakangan ke
//   booking yang sama: GUSTIN NURISMA KARYA + KINZA (AIW0030482, 3 Sep 2026)
//   daftar 4 hari setelah 15 saudaranya DP, bayar masih 0 ("BELUM BAYAR" di
//   AWAPI), namun ikut diumumkan sebagai jamaah baru.
//
// Baris tanpa tgl_daftar terbaca jatuh kembali ke kredit level booking: lebih
// baik satu notif kepagian daripada kedatangan jamaah yang hilang diam-diam.
function collectPaidBookingBatches(incomingRows, existingByKey) {
  const paid = new Map(); // bookingKey -> { dates: Set<string>, undated: boolean }
  const credit = (row) => {
    if (!hasJamaahPayment(row)) return;
    const key = bookingKeyOf(row);
    if (!key) return;
    let entry = paid.get(key);
    if (!entry) {
      entry = { dates: new Set(), undated: false };
      paid.set(key, entry);
    }
    const batch = registrationBatchKey(row);
    if (batch) entry.dates.add(batch);
    else entry.undated = true;
  };
  for (const row of incomingRows) credit(row);
  for (const existing of existingByKey.values()) credit(existing);
  return paid;
}

function isBookingBatchPaid(row, paidBatches) {
  const entry = paidBatches.get(bookingKeyOf(row));
  if (!entry) return false;
  if (entry.undated) return true;
  const batch = registrationBatchKey(row);
  if (!batch) return true;
  return entry.dates.has(batch);
}

export function computeJamaahSyncEvents({
  incomingRows,
  existingByKey,
  allowNewJamaah = true,
  watermarkEnabled = false,
  now = new Date(),
  paymentBufferDays = 7,
} = {}) {
  const deduped = new Map();
  for (const row of incomingRows || []) {
    const key = jamaahRowKey(row);
    if (key) deduped.set(key, row);
  }
  const rows = Array.from(deduped.values());
  const events = emptyJamaahSyncEvents();
  if (rows.length === 0) return events;

  const existing = existingByKey instanceof Map ? existingByKey : new Map();
  const newCutoffStr = datePlusDaysKey(now, 0);
  // Buffer pembayaran = toleransi SETELAH tanggal berangkat (pelunasan susulan),
  // bukan sebelum. Versi lama memakai +7 sehingga semua pembayaran H-7 sampai
  // hari-H (justru masa pelunasan paling ramai) dibuang diam-diam.
  const paymentCutoffStr = datePlusDaysKey(now, -Math.abs(paymentBufferDays));
  const paidBookingBatches = collectPaidBookingBatches(rows, existing);
  const seenPaymentEvents = new Set();
  const announcedKeys = new Set();

  for (const row of rows) {
    const key = jamaahRowKey(row);
    const existingRow = key ? existing.get(key) : null;
    const neverAnnounced = watermarkEnabled
      ? !existingRow || existingRow.notif_new_sent_at == null
      : !existingRow;

    if (neverAnnounced) {
      const bookingPaid = isBookingBatchPaid(row, paidBookingBatches);
      if (allowNewJamaah && bookingPaid && isFutureRelevantJamaah(row, newCutoffStr)) {
        announcedKeys.add(key);
        events.jamaahBaru.push({
          nama: row.nama,
          paket: row.paket,
          idUmroh: row.id_umroh,
          jmId: row.jm_id,
          tglBerangkat: row.tgl_berangkat,
          tglDaftar: row.tgl_daftar,
          bayar: toMoney(row.bayar),
          sisa: toMoney(row.sisa),
        });
      }
      if (!existingRow || announcedKeys.has(key)) continue;
      // existing tapi belum layak diumumkan (booking belum bayar / sudah lewat):
      // tetap jatuh ke deteksi pembayaran di bawah agar delta tidak hilang.
    }

    if (!existingRow) continue;
    if (announcedKeys.has(key)) continue; // pengumuman baru sudah memuat kedatangan + DP-nya
    if (!isFutureRelevantJamaah(row, paymentCutoffStr)) continue;

    const baselineBayar = watermarkEnabled && existingRow.notif_last_bayar != null
      ? toMoney(existingRow.notif_last_bayar)
      : toMoney(existingRow.bayar);
    const bayarAfter = toMoney(row.bayar);
    const hasKnownSisaAfter = row.sisa !== null && row.sisa !== undefined;
    const sisaAfter = hasKnownSisaAfter ? toMoney(row.sisa) : toMoney(existingRow.sisa);
    const jumlah = Math.max(0, bayarAfter - baselineBayar);

    if (jumlah <= 0) continue;

    const event = {
      nama: row.nama || existingRow.nama,
      paket: row.paket || existingRow.paket,
      idUmroh: row.id_umroh,
      jmId: row.jm_id,
      tglBerangkat: row.tgl_berangkat || existingRow.tgl_berangkat,
      jumlah,
      totalBayar: bayarAfter,
      sisa: sisaAfter,
      isLunas: sisaAfter <= 0,
    };

    const kind = sisaAfter <= 0 ? 'pelunasan' : 'cicilan';
    // Kunci dedup WAJIB memuat identitas pax (jm_id). Versi lama memakai
    // id_umroh (level booking) + nominal, sehingga DP grup yang identik
    // (5 saudara × Rp1jt) runtuh jadi satu event — hanya satu nama tampil.
    const eventKey = [
      kind,
      bookingKeyOf(row) || '',
      String(row.jm_id || row.nama || '').trim().toLowerCase(),
      jumlah,
      bayarAfter,
      sisaAfter,
    ].join('|');
    if (seenPaymentEvents.has(eventKey)) continue;
    seenPaymentEvents.add(eventKey);

    if (kind === 'pelunasan') events.pembayaranPelunasan.push(event);
    else events.pembayaranCicilan.push(event);
  }

  return events;
}

function eventIdentity(e) {
  return `${String(e?.idUmroh || '').trim().toLowerCase()}|${String(e?.jmId || e?.nama || '').trim().toLowerCase()}`;
}

// Jalur legacy mendeteksi per-batch (Phase 1 lalu Phase 2) sebelum satu kali
// kirim; dengan watermark, pax yang sama bisa muncul di kedua fase. Keep-last:
// data fase terakhir yang paling segar.
export function dedupeJamaahSyncEvents(events) {
  const out = emptyJamaahSyncEvents();
  for (const listName of ['jamaahBaru', 'pembayaranCicilan', 'pembayaranPelunasan']) {
    const byIdentity = new Map();
    for (const e of events?.[listName] || []) byIdentity.set(eventIdentity(e), e);
    out[listName] = Array.from(byIdentity.values());
  }
  return out;
}
