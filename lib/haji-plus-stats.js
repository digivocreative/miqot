// Rekap Haji Khusus — parser + agregator untuk halaman publik
// https://alhijazindowisata.com/jadwal/grafik-haji-khusus/alhijaz-indowisata
//
// Halaman itu menaruh angka yang sama di dua tempat: variabel JS `dataDatabase`
// yang disuapkan ke Chart.js, dan tabel HTML di bawah grafiknya. Variabel JS
// dibaca lebih dulu karena JSON utuh (tanpa pemisah ribuan "1,027" yang harus
// dibersihkan); tabel jadi cadangan kalau grafiknya kelak diganti.
//
// Dua serinya BEDA makna tahun:
//   terdaftar → tahun pendaftaran (tahun mendatang selalu 0, belum ada yang daftar)
//   berangkat → tahun keberangkatan (tahun mendatang berisi alokasi terjadwal)
// Karena itu statistik tiap seri dihitung pada rentang aktifnya sendiri
// (lihat activeSpan), bukan pada seluruh 22 tahun mentah.

const YEAR_MIN = 2000;
const YEAR_MAX = 2100;

export const HAJI_PLUS_SERIES = [
  { key: 'terdaftar', label: 'Jamaah Terdaftar' },
  { key: 'berangkat', label: 'Jamaah Berangkat' },
];

function toCount(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  }
  if (typeof value !== 'string') return null;
  // Terima "482" dan "1,027"/"1.027"/"1 027" (pemisah ribuan di tabel HTML).
  // Sisanya — sel kosong, "n/a", angka negatif — ditolak supaya baris rusak
  // menggugurkan seluruh parse, bukan menyelinap masuk sebagai 0.
  const trimmed = value.trim();
  if (!/^\d+$|^\d{1,3}([., ]\d{3})+$/.test(trimmed)) return null;
  return Number(trimmed.replace(/[., ]/g, ''));
}

function toYear(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < YEAR_MIN || n > YEAR_MAX) return null;
  return n;
}

// ── Sumber 1: `const dataDatabase = [{"tahun":2016,"terdaftar":44,...}];` ──
export function parseHajiPlusChartData(html) {
  if (typeof html !== 'string') return null;
  const match = html.match(/dataDatabase\s*=\s*(\[[\s\S]*?\])\s*;/);
  if (!match) return null;

  let raw;
  try { raw = JSON.parse(match[1]); } catch { return null; }
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const rows = [];
  for (const entry of raw) {
    const year = toYear(entry?.tahun);
    const terdaftar = toCount(entry?.terdaftar);
    const berangkat = toCount(entry?.berangkat);
    if (year === null || terdaftar === null || berangkat === null) return null;
    rows.push({ year, terdaftar, berangkat });
  }
  return sortByYear(rows);
}

// ── Sumber 2 (cadangan): tabel <tr> TAHUN / JAMAAH TERDAFTAR / JAMAAH BERANGKAT ──
function stripTags(fragment) {
  return fragment
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseHajiPlusTableData(html) {
  if (typeof html !== 'string') return null;

  const tableRows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((tr) =>
    [...tr[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((cell) => stripTags(cell[1])));

  const rowStartingWith = (re) => tableRows.find((cells) => cells.length > 1 && re.test(cells[0]));
  const yearCells = rowStartingWith(/^TAHUN\b/i);
  const terdaftarCells = rowStartingWith(/TERDAFTAR/i);
  const berangkatCells = rowStartingWith(/BERANGKAT/i);
  if (!yearCells || !terdaftarCells || !berangkatCells) return null;

  // Sel pertama tiap baris adalah label ("TAHUN", "JAMAAH TERDAFTAR (pax)"), buang.
  const years = yearCells.slice(1).map(toYear);
  const terdaftar = terdaftarCells.slice(1).map(toCount);
  const berangkat = berangkatCells.slice(1).map(toCount);

  if (years.length === 0) return null;
  if (years.length !== terdaftar.length || years.length !== berangkat.length) return null;
  if ([...years, ...terdaftar, ...berangkat].some((v) => v === null)) return null;

  return sortByYear(years.map((year, i) => ({ year, terdaftar: terdaftar[i], berangkat: berangkat[i] })));
}

export function parseHajiPlusStatsHtml(html) {
  return parseHajiPlusChartData(html) || parseHajiPlusTableData(html);
}

function sortByYear(rows) {
  return [...rows].sort((a, b) => a.year - b.year);
}

// Penjaga bentuk untuk payload yang dibaca balik dari DB: baris lama hanya punya
// {year, pax} (satu seri, dan `pax` itu sebenarnya TERDAFTAR). Baris lama harus
// ditolak supaya pemanggil memicu scrape ulang alih-alih merender seri kosong.
export function isHajiPlusRows(rows) {
  return Array.isArray(rows)
    && rows.length > 0
    && rows.every((r) => r
      && Number.isInteger(r.year)
      && Number.isFinite(r.terdaftar)
      && Number.isFinite(r.berangkat));
}

// Rentang aktif = dari tahun berangka pertama sampai terakhir. Untuk `terdaftar`
// ini memotong 2027+ yang nol karena belum ada pendaftar; untuk `berangkat` ia
// mempertahankan nol di tengah (2020/2021 pandemi) yang memang nol sungguhan.
export function activeSpan(rows, key) {
  const first = rows.findIndex((r) => r[key] > 0);
  if (first === -1) return [];
  let last = rows.length - 1;
  while (last > first && !(rows[last][key] > 0)) last -= 1;
  return rows.slice(first, last + 1);
}

export function summarizeHajiPlusSeries(rows, key, currentYear) {
  const span = activeSpan(rows, key);
  if (span.length === 0) return null;

  const items = span.map((r) => ({ year: r.year, pax: r[key] }));
  const total = items.reduce((sum, it) => sum + it.pax, 0);
  const peak = items.reduce((a, b) => (b.pax > a.pax ? b : a));
  const min = items.reduce((a, b) => (b.pax < a.pax ? b : a));
  const current = items.find((it) => it.year === currentYear) || null;
  const realized = items.filter((it) => it.year <= currentYear).reduce((sum, it) => sum + it.pax, 0);

  return {
    key,
    label: HAJI_PLUS_SERIES.find((s) => s.key === key)?.label || key,
    items,
    total,
    average: Math.round(total / items.length),
    peak,
    min,
    current,
    realized,
    scheduled: total - realized,
    yearCount: items.length,
    firstYear: items[0].year,
    lastYear: items[items.length - 1].year,
  };
}

export function buildHajiPlusPayload(rows, syncedAt, now = new Date()) {
  if (!isHajiPlusRows(rows)) return null;
  const sorted = sortByYear(rows);
  const currentYear = now.getFullYear();

  const series = {};
  for (const { key } of HAJI_PLUS_SERIES) {
    const summary = summarizeHajiPlusSeries(sorted, key, currentYear);
    if (!summary) return null;
    series[key] = summary;
  }

  return {
    items: sorted,
    series,
    yearCount: sorted.length,
    firstYear: sorted[0].year,
    lastYear: sorted[sorted.length - 1].year,
    synced_at: syncedAt || null,
  };
}
