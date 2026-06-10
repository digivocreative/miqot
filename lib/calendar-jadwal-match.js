/**
 * Pencocokan baris calendar_events → jadwal umroh_schedules.
 *
 * Kolom PAX kalender legacy = kuota grup (seat_total), bukan jumlah jamaah.
 * Untuk menampilkan jamaah jaringan, tiap baris kalender dipetakan ke
 * jadwal_id dulu. Kunci tanggal per tipe event:
 *   keberangkatan : event_date == berangkat_tgl
 *   kepulangan    : event_date == pulang_tgl
 *   manasik       : prefix "DD/MM/YYYY" pada nama paket == berangkat_tgl
 *                   (fallback: event_date == manasik_tgl)
 * lalu nama paket dicocokkan via Jaccard antar set token (ambang 0.6) —
 * token tak-cocok dipenalti di KEDUA sisi sehingga nama persis selalu
 * mengalahkan varian superset ("...PAKET RAHMAH...") dan token generik
 * (PLUS/KERETA/CEPAT/9HR) tidak bisa menembus ambang sendirian. Skor seri
 * dipecah dengan selisih |pax legacy - seat_total| (pax legacy identik
 * seat_total), lalu jadwal_id terkecil agar deterministik antar refresh.
 * Salah-map lebih buruk daripada tak-ter-map: baris tanpa match jatuh ke
 * fallback kuota legacy, bukan angka jamaah kloter lain.
 */

export function tokenizeName(name) {
  return (name || '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3);
}

export function overlapScore(calWords, apiName) {
  const a = new Set(calWords);
  const b = new Set(tokenizeName(apiName));
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

// "17/06/2026JUM'ATAIN PLUS ..." → { departureDate: '2026-06-17', name: "JUM'ATAIN PLUS ..." }
export function parseManasikPaket(paket) {
  const m = (paket || '').match(/^(\d{2})\/(\d{2})\/(\d{4})\s*(.+)$/);
  if (!m) return { departureDate: null, name: paket || '' };
  return { departureDate: `${m[3]}-${m[2]}-${m[1]}`, name: m[4].trim() };
}

const MATCH_THRESHOLD = 0.6;

export function matchEventToSchedule(event, schedules) {
  let name = event.paket;
  let candidates;

  if (event.event_type === 'keberangkatan') {
    candidates = schedules.filter(s => s.berangkat_tgl === event.event_date);
  } else if (event.event_type === 'kepulangan') {
    candidates = schedules.filter(s => s.pulang_tgl === event.event_date);
  } else {
    const parsed = parseManasikPaket(event.paket);
    name = parsed.name;
    candidates = parsed.departureDate
      ? schedules.filter(s => s.berangkat_tgl === parsed.departureDate)
      : schedules.filter(s => s.manasik_tgl === event.event_date);
  }

  const calWords = tokenizeName(name);
  let best = null;
  let bestScore = 0;

  for (const s of candidates) {
    const score = overlapScore(calWords, s.jadwal_nama);
    if (score < MATCH_THRESHOLD) continue;
    if (!best || score > bestScore) {
      best = s;
      bestScore = score;
      continue;
    }
    if (score < bestScore) continue;
    // Skor seri (mis. dua jadwal setanggal dengan set token identik) — pilih
    // yang kuotanya paling dekat dengan pax legacy baris kalender; masih seri
    // → jadwal_id terkecil agar hasil tidak flip antar refresh per jam.
    const curDiff = Math.abs((parseInt(best.seat_total, 10) || 0) - (event.pax || 0));
    const altDiff = Math.abs((parseInt(s.seat_total, 10) || 0) - (event.pax || 0));
    if (altDiff < curDiff || (altDiff === curDiff && String(s.jadwal_id) < String(best.jadwal_id))) {
      best = s;
    }
  }

  return best;
}

function daysBetween(fromDate, toDate) {
  return (Date.parse(toDate) - Date.parse(fromDate)) / 86400000;
}

const MAX_SIBLING_GAP_DAYS = 45;

// Satu kloter muncul sebagai baris keberangkatan/kepulangan/manasik dengan
// group_number + nama paket sama. Untuk baris yang gagal match via tanggal
// (mis. pulang_tgl API ≠ tanggal pulang riil pada paket plus-negara), warisi
// jadwal_id dari baris keberangkatan se-kloter terdekat yang sudah ter-map.
export function findSiblingKeberangkatan(event, mappedKeberangkatan) {
  const baseName = event.event_type === 'manasik'
    ? parseManasikPaket(event.paket).name
    : (event.paket || '');
  // group_number dipakai ulang antar kloter — wajib dikunci bersama nama paket
  if (!event.group_number || !baseName) return null;

  let best = null;
  let bestGap = Infinity;
  for (const k of mappedKeberangkatan) {
    if (!k.jadwal_id || k.group_number !== event.group_number || k.paket !== baseName) continue;
    const gap = event.event_type === 'kepulangan'
      ? daysBetween(k.event_date, event.event_date) // berangkat sebelum pulang
      : daysBetween(event.event_date, k.event_date); // manasik sebelum berangkat
    if (gap >= 0 && gap <= MAX_SIBLING_GAP_DAYS && gap < bestGap) {
      best = k;
      bestGap = gap;
    }
  }
  return best;
}
