const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const KOMISI_UMROH_HEMAT = 1300000;
export const KOMISI_UMROH_REGULER = 1800000;

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

function numeric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function getUmrohRate(paket) {
  return paket && String(paket).toLowerCase().includes('hemat')
    ? KOMISI_UMROH_HEMAT
    : KOMISI_UMROH_REGULER;
}

function isKomisiEligible(row) {
  const sisa = row?.sisa == null ? null : numeric(row.sisa);
  return numeric(row?.bayar) > 0 || sisa == null || sisa <= 0;
}

function isLunas(row) {
  return row?.sisa == null || numeric(row.sisa) <= 0;
}

function isDeparted(row, todayKey) {
  const depKey = dateKey(row?.tgl_berangkat);
  return !!depKey && depKey <= todayKey;
}

function netUmrohKomisi(row) {
  return Math.max(0, getUmrohRate(row?.paket) - numeric(row?.diskon_marketing));
}

function buildKomisiChartSkeleton(todayKey) {
  const [year, month] = todayKey.split('-').map(Number);
  const map = new Map();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    map.set(ym, { bulan: ym, total: 0, count: 0 });
  }
  return map;
}

export function computeUmrohKomisi(rows, todayStr) {
  const todayKey = dateKey(todayStr) || new Date().toISOString().slice(0, 10);
  const chartMap = buildKomisiChartSkeleton(todayKey);
  const komisi = {
    totalKomisi: 0,
    sudahCair: 0,
    sudahCairCount: 0,
    belumCair: 0,
    belumCairCount: 0,
    potensi: 0,
    potensiCount: 0,
    breakdown: {
      hemat: { count: 0, rate: KOMISI_UMROH_HEMAT, total: 0 },
      reguler: { count: 0, rate: KOMISI_UMROH_REGULER, total: 0 },
    },
    chartBulanan: [],
  };

  for (const row of rows || []) {
    if (!isKomisiEligible(row)) continue;

    const net = netUmrohKomisi(row);
    const departed = isDeparted(row, todayKey);
    const lunas = isLunas(row);
    const paketKey = row?.paket && String(row.paket).toLowerCase().includes('hemat') ? 'hemat' : 'reguler';
    komisi.breakdown[paketKey].count++;
    komisi.breakdown[paketKey].total += net;

    if (departed && lunas) {
      komisi.sudahCair += net;
      komisi.sudahCairCount++;
      const ym = dateKey(row.tgl_berangkat)?.substring(0, 7);
      if (ym && chartMap.has(ym)) {
        const entry = chartMap.get(ym);
        entry.total += net;
        entry.count++;
      }
    } else if (lunas) {
      komisi.belumCair += net;
      komisi.belumCairCount++;
    } else {
      komisi.potensi += net;
      komisi.potensiCount++;
    }
  }

  komisi.totalKomisi = komisi.sudahCair + komisi.belumCair + komisi.potensi;
  komisi.chartBulanan = Array.from(chartMap.values());
  return komisi;
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
