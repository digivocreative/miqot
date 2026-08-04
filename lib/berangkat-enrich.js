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
// di server.js, `calendarRows` = baris mentah calendar_events (belum dipilih).
export function enrichBerangkatRows(rows, { scheduleDetailMap = new Map(), calendarRows = [] } = {}) {
  const calendarByJadwalId = pickEarliestByJadwal(calendarRows);
  return (rows || []).map(row => ({
    ...row,
    jadwal_id: row.id_jadwal || null,
    jadwal_nama: scheduleDetailMap.get(row.id_jadwal)?.jadwal_nama || null,
    manasik_tgl: scheduleDetailMap.get(row.id_jadwal)?.manasik_tgl || null,
    manasik_jam: scheduleDetailMap.get(row.id_jadwal)?.manasik_jam || null,
    berangkat_kode_penerbangan: scheduleDetailMap.get(row.id_jadwal)?.berangkat_kode_penerbangan || null,
    tour_leader: calendarByJadwalId.get(row.id_jadwal)?.tour_leader || null,
  }));
}

// Versi ber-I/O yang dipanggil kedua endpoint. Kalau query kalender gagal,
// pengayaan tetap jalan dengan tour_leader null (fail-soft) — daftar
// keberangkatan lebih berguna tanpa TL daripada tidak tampil sama sekali.
export async function loadEnrichedBerangkatRows({ rows, supabase, scheduleDetailMap, logLabel }) {
  const jadwalIds = [...new Set((rows || []).map(r => r.id_jadwal).filter(Boolean))];
  let calendarRows = [];
  if (jadwalIds.length > 0) {
    const { data, error } = await supabase
      .from('calendar_events')
      .select('jadwal_id, event_date, tour_leader')
      .eq('event_type', 'keberangkatan')
      .in('jadwal_id', jadwalIds);
    if (error) {
      console.warn(`${logLabel} upcoming calendar metadata fetch failed:`, error.message);
    } else {
      calendarRows = data || [];
    }
  }
  return enrichBerangkatRows(rows, { scheduleDetailMap, calendarRows });
}
