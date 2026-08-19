// Shared fetch+mapping for the Haji Plus "Statistik" tab (HajiPlusPage) and
// its export/infografis counterpart (HajiPlusExportPage). Both render the
// same year → jamaah-berangkat series, sourced from the agent's own
// jamaah_haji rows (status_berangkat = SUDAH BERANGKAT) via /api/haji/stats,
// not the old alhijazindowisata.com scrape (haji_plus_stats).

export interface HajiPlusItem { year: number; pax: number; }
export interface HajiPlusData {
  items: HajiPlusItem[];
  total: number; average: number;
  peak: HajiPlusItem; min: HajiPlusItem;
  current: HajiPlusItem | null;
  yearCount: number; synced_at: string;
}

export async function fetchHajiPlusBerangkat(headers: HeadersInit): Promise<
  { ok: true; data: HajiPlusData } | { ok: false; error: string }
> {
  const res = await fetch('/api/haji/stats?year=all', { headers });
  const json = await res.json();
  if (!json.success) return { ok: false, error: json.error || 'Gagal mengambil data' };

  const breakdown = json.data.komisi?.breakdownTahun || [];
  const items: HajiPlusItem[] = breakdown.map((b: any) => ({ year: Number(b.tahun), pax: b.sudahBerangkat }));
  if (items.length === 0) return { ok: false, error: 'Belum ada data jamaah berangkat' };

  const total = items.reduce((sum, it) => sum + it.pax, 0);
  const average = Math.round(total / items.length);
  const peak = items.reduce((a, b) => (b.pax > a.pax ? b : a));
  const min = items.reduce((a, b) => (b.pax < a.pax ? b : a));
  const current = items.find(it => it.year === new Date().getFullYear()) || null;

  return {
    ok: true,
    data: {
      items, total, average, peak, min, current,
      yearCount: items.length,
      synced_at: json.data.lastSync || '',
    },
  };
}
