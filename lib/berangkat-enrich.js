// Pengayaan baris jamaah untuk "Berangkat Mendatang" — SATU sumber kebenaran
// yang dipakai /api/laporan/stats (kartu Statistik) dan
// /api/calendar/berangkat-mendatang (section kartu kalender dashboard).
//
// Kedua layar itu menampilkan angka yang sama kepada pengguna, jadi input untuk
// buildBerangkatMendatang() tidak boleh menyimpang. Sebelumnya blok ini
// terduplikasi di dua tempat di server.js: menambah kolom/filter di satu sisi
// diam-diam membuat dashboard dan Statistik memakai himpunan berbeda.
//
// Bentuknya sengaja dua lapis: enrichBerangkatRows() murni (tanpa I/O, bisa
// diuji tanpa mock Supabase), loadEnrichedBerangkatRows() membungkusnya dengan
// satu query calendar_events supaya daftar kolom & filter query juga tunggal.

// Ambil satu event keberangkatan per jadwal: yang event_date-nya paling awal.
// Perbandingan string sengaja (kolomnya date ISO 'YYYY-MM-DD', urut leksikal).
function pickEarliestByJadwal(calendarRows) {
  const byJadwalId = new Map();
  for (const row of (calendarRows || [])) {
    if (!row?.jadwal_id) continue;
    const current = byJadwalId.get(row.jadwal_id);
    if (!current || String(row.event_date || '').localeCompare(String(current.event_date || '')) < 0) {
      byJadwalId.set(row.jadwal_id, row);
    }
  }
  return byJadwalId;
}

// Murni: baris jamaah + metadata jadwal + metadata kalender → baris siap dipakai
// buildBerangkatMendatang(). `scheduleDetailMap` = hasil getScheduleDetailMap()
// di server.js, `calendarRows` = baris mentah calendar_events (belum dipilih),
// `itineraryJadwalIds` = jadwal yang itinerary-nya sudah terurai di tabel
// `itineraries` (sumber yang sama dibaca halaman share /:slug/:jadwalId/itinerary,
// jadi "ada di sini" = "halaman share akan tampil, bukan 404 lembut").
export function enrichBerangkatRows(rows, { scheduleDetailMap = new Map(), calendarRows = [], itineraryJadwalIds = [] } = {}) {
  const calendarByJadwalId = pickEarliestByJadwal(calendarRows);
  const itineraryReadySet = itineraryJadwalIds instanceof Set
    ? itineraryJadwalIds
    : new Set(itineraryJadwalIds || []);
  return (rows || []).map(row => ({
    ...row,
    jadwal_id: row.id_jadwal || null,
    jadwal_nama: scheduleDetailMap.get(row.id_jadwal)?.jadwal_nama || null,
    manasik_tgl: scheduleDetailMap.get(row.id_jadwal)?.manasik_tgl || null,
    manasik_jam: scheduleDetailMap.get(row.id_jadwal)?.manasik_jam || null,
    berangkat_kode_penerbangan: scheduleDetailMap.get(row.id_jadwal)?.berangkat_kode_penerbangan || null,
    tour_leader: calendarByJadwalId.get(row.id_jadwal)?.tour_leader || null,
    itinerary_ready: !!row.id_jadwal && itineraryReadySet.has(row.id_jadwal),
  }));
}

// Versi ber-I/O yang dipanggil kedua endpoint. Kalau query kalender atau
// itinerary gagal, pengayaan tetap jalan dengan tour_leader null /
// itinerary_ready false (fail-soft) — daftar keberangkatan lebih berguna tanpa
// TL dan tanpa tombol salin daripada tidak tampil sama sekali.
export async function loadEnrichedBerangkatRows({ rows, supabase, scheduleDetailMap, logLabel }) {
  const jadwalIds = [...new Set((rows || []).map(r => r.id_jadwal).filter(Boolean))];
  let calendarRows = [];
  let itineraryJadwalIds = [];
  if (jadwalIds.length > 0) {
    const [calendarRes, itineraryRes] = await Promise.all([
      supabase
        .from('calendar_events')
        .select('jadwal_id, event_date, tour_leader')
        .eq('event_type', 'keberangkatan')
        .in('jadwal_id', jadwalIds),
      supabase
        .from('itineraries')
        .select('jadwal_id')
        .in('jadwal_id', jadwalIds),
    ]);
    if (calendarRes.error) {
      console.warn(`${logLabel} upcoming calendar metadata fetch failed:`, calendarRes.error.message);
    } else {
      calendarRows = calendarRes.data || [];
    }
    if (itineraryRes.error) {
      console.warn(`${logLabel} upcoming itinerary availability fetch failed:`, itineraryRes.error.message);
    } else {
      itineraryJadwalIds = (itineraryRes.data || []).map(r => r.jadwal_id).filter(Boolean);
    }
  }
  return enrichBerangkatRows(rows, { scheduleDetailMap, calendarRows, itineraryJadwalIds });
}
