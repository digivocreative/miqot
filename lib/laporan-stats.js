const MS_PER_DAY = 24 * 60 * 60 * 1000;

function dateKey(value) {
  const key = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

function dateKeyToUtcMs(key) {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function formatMonthLabel(yearMonth) {
  return new Date(`${yearMonth}-01`).toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
  });
}

export function buildBerangkatMendatang(rows, todayStr) {
  const todayKey = dateKey(todayStr) || new Date().toISOString().slice(0, 10);
  const todayMs = dateKeyToUtcMs(todayKey);
  const upcomingRows = (rows || [])
    .map(row => ({ ...row, _dateKey: dateKey(row.tgl_berangkat) }))
    .filter(row => row._dateKey && row._dateKey >= todayKey)
    .sort((a, b) => {
      const byDate = a._dateKey.localeCompare(b._dateKey);
      if (byDate !== 0) return byDate;
      return String(a.nama || '').localeCompare(String(b.nama || ''));
    });

  if (upcomingRows.length === 0) {
    return {
      berangkatBulanIni: [],
      berangkatSegera: 0,
      berangkatBulan: null,
    };
  }

  const firstMonth = upcomingRows[0]._dateKey.substring(0, 7);
  const berangkatBulanIni = upcomingRows
    .filter(row => row._dateKey.substring(0, 7) === firstMonth)
    .map(row => ({
      nama: row.nama,
      paket: row.paket,
      jk: row.jk,
      tgl_berangkat: row.tgl_berangkat,
      hari_lagi: Math.ceil((dateKeyToUtcMs(row._dateKey) - todayMs) / MS_PER_DAY),
      // sisa <= 0 = lunas (incl. lebih bayar / sisa negatif). NULL = lunas juga.
      // Selaras isLunas komisi & count lunasQ di server.js; `!row.sisa` lama
      // keliru menandai lebih-bayar (sisa<0) sebagai BELUM lunas → tanpa centang.
      lunas: row.sisa == null || row.sisa <= 0,
      sisa: row.sisa || 0,
      wa: row.wa,
    }));

  return {
    berangkatBulanIni,
    berangkatSegera: berangkatBulanIni.length,
    berangkatBulan: formatMonthLabel(firstMonth),
  };
}
