// Data "Rekap Haji Khusus" untuk tab Statistik (HajiPlusPage) dan poster
// infografisnya (HajiPlusExportPage). Sumbernya halaman publik
// alhijazindowisata.com/jadwal/grafik-haji-khusus/alhijaz-indowisata, di-scrape
// & di-agregat server (lib/haji-plus-stats.js) lalu disajikan lewat
// /api/haji-plus/data — bukan lagi /api/haji/stats yang hanya berisi jamaah
// milik agen yang login.

export type HajiPlusSeriesKey = 'terdaftar' | 'berangkat';

export const HAJI_PLUS_SERIES_KEYS: HajiPlusSeriesKey[] = ['terdaftar', 'berangkat'];

export interface HajiPlusItem { year: number; pax: number; }

export interface HajiPlusYearRow { year: number; terdaftar: number; berangkat: number; }

export interface HajiPlusSeries {
  key: HajiPlusSeriesKey;
  label: string;
  items: HajiPlusItem[];
  total: number;
  average: number;
  peak: HajiPlusItem;
  min: HajiPlusItem;
  current: HajiPlusItem | null;
  /** Jumlah pax pada tahun ≤ tahun berjalan. */
  realized: number;
  /** Jumlah pax pada tahun > tahun berjalan (alokasi keberangkatan mendatang). */
  scheduled: number;
  yearCount: number;
  firstYear: number;
  lastYear: number;
}

export interface HajiPlusData {
  /** Seluruh tahun yang dipublikasikan, kedua seri berdampingan. */
  items: HajiPlusYearRow[];
  series: Record<HajiPlusSeriesKey, HajiPlusSeries>;
  yearCount: number;
  firstYear: number;
  lastYear: number;
  synced_at: string | null;
}

export async function fetchHajiPlusStats(headers: HeadersInit): Promise<
  { ok: true; data: HajiPlusData } | { ok: false; error: string }
> {
  const res = await fetch('/api/haji-plus/data', { headers });
  const json = await res.json().catch(() => null);

  if (!res.ok || !json?.success || !json?.data?.series?.terdaftar || !json?.data?.series?.berangkat) {
    return { ok: false, error: json?.error || 'Gagal mengambil data rekap haji khusus' };
  }
  return { ok: true, data: json.data as HajiPlusData };
}

export function formatSyncedAt(syncedAt: string | null | undefined): string {
  const ts = syncedAt ? new Date(syncedAt).getTime() : NaN;
  if (Number.isNaN(ts)) return 'belum pernah';
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'baru saja';
  if (mins < 60) return `${mins} menit lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} jam lalu`;
  return `${Math.floor(hrs / 24)} hari lalu`;
}
