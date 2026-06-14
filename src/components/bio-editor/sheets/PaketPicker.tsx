import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import SheetBase from './SheetBase';
import FilterDropdown from '../../FilterDropdown';
import { getPackages } from '@/services';
import type { UmrohPackage } from '@/types';
import type { FeaturedPaketPreview } from '../../bio/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (p: FeaturedPaketPreview) => void;
}

const YEAR_CODES = ['1448', '1449'];

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function packageToPreview(p: UmrohPackage): FeaturedPaketPreview {
  // Pick anchor price from cheapest tier
  let anchor: number | null = null;
  for (const tier of Object.values(p.harga || {})) {
    const prices = [tier.Quard, tier.Triple, tier.Double].filter(Boolean);
    for (const pr of prices) {
      const val = parseInt(pr!, 10);
      if (val > 0 && (anchor === null || val < anchor)) anchor = val;
    }
  }
  return {
    jadwal_id: p.jadwalId,
    year_code: '',
    name: p.nama,
    berangkat_tgl: p.keberangkatan?.tgl || '',
    pulang_tgl: p.kepulangan?.tgl || '',
    maskapai: p.maskapai || '',
    seat_total: p.seatTotal ?? null,
    seat_sisa: p.seatSisa ?? null,
    image_url: p.brosurUrl || null,
    anchor_price: anchor,
  };
}

export default function PaketPicker({ open, onClose, onPick }: Props) {
  const [year, setYear] = useState('1448');
  const [packages, setPackages] = useState<UmrohPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    getPackages({ yearCode: year })
      .then(r => { if (alive && r.success) setPackages(r.packages); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, year]);

  const filtered = useMemo(() => {
    // "Available" = seat sisa > 0 AND keberangkatan belum lewat. Featured Paket
    // is meant to be a currently-sellable headline, so already-departed or
    // sold-out paket should never even appear in the picker.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const available = packages.filter(p => {
      const seatSisa = typeof p.seatSisa === 'number' ? p.seatSisa : null;
      if (seatSisa !== null && seatSisa <= 0) return false;
      const tgl = p.keberangkatan?.tgl;
      if (tgl) {
        const d = new Date(tgl);
        if (!Number.isNaN(d.getTime()) && d.getTime() < today.getTime()) return false;
      }
      return true;
    });
    const t = q.trim().toLowerCase();
    const sorted = [...available].sort((a, b) =>
      new Date(a.keberangkatan?.tgl || 0).getTime() - new Date(b.keberangkatan?.tgl || 0).getTime()
    );
    if (!t) return sorted;
    return sorted.filter(p =>
      p.nama.toLowerCase().includes(t) ||
      p.maskapai.toLowerCase().includes(t) ||
      (p.keberangkatan?.tgl || '').includes(t)
    );
  }, [packages, q]);

  return (
    <SheetBase open={open} onClose={onClose} title="Pilih Paket">
      <div className="space-y-3">
        <div className="flex gap-2">
          <FilterDropdown
            variant="default"
            value={year}
            onChange={setYear}
            options={YEAR_CODES.map(yc => ({ value: yc, label: `${yc} H` }))}
            ariaLabel="Tahun"
            widthClass="w-28 shrink-0"
          />
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari nama paket, maskapai, tanggal…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
            />
          </div>
        </div>

        {loading && (
          <p className="text-sm text-gray-500 dark:text-slate-400 text-center py-8">Memuat daftar paket…</p>
        )}

        {!loading && filtered.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-slate-400 text-center py-8">
            Tidak ada paket untuk tahun {year}{q ? ` · "${q}"` : ''}.
          </p>
        )}

        <div className="space-y-2">
          {filtered.map(p => (
            <button
              key={p.jadwalId}
              type="button"
              onClick={() => onPick(packageToPreview(p))}
              className="w-full text-left p-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/15 transition-colors active:scale-[0.99]"
            >
              <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">{p.nama}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500 dark:text-slate-400 mt-1">
                <span>📅 {formatDate(p.keberangkatan?.tgl)}</span>
                <span>✈ {p.maskapai}</span>
                {typeof p.seatSisa === 'number' && p.seatSisa > 0 && (
                  <span>🪑 Sisa {p.seatSisa}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </SheetBase>
  );
}
