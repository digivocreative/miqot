import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Search, SlidersHorizontal } from 'lucide-react';
import CalonHajiFilterSheet from './CalonHajiFilterSheet';
import { getAuthHeaders } from '../lib/authSession';
import { describeLoadError } from '../lib/loadError';
import { trackEvent } from '../utils/analytics';
import {
  EMPTY_FILTERS, activeFilterCount, countByTab, filterCalonHaji, formatKabKota, formatKabKotaLengkap,
  formatProvinsi, isBerhakLunas, isLunas,
  type CalonHajiFilters, type CalonHajiRow, type CalonHajiTab,
} from '../lib/calonHaji';

const PAGE_STEP = 50;

const TABS: ReadonlyArray<{ key: CalonHajiTab; label: string; dot?: string }> = [
  { key: 'semua', label: 'Semua' },
  { key: 'berhak', label: 'Berhak Lunas', dot: 'bg-emerald-500' },
  { key: 'cadangan', label: 'Cadangan', dot: 'bg-amber-500' },
];

const JKN_LABEL: Record<string, string> = {
  AKTIF: 'Aktif',
  'TERDAFTAR, BELUM AKTIF': 'Terdaftar, Belum Aktif',
  'BELUM TERDAFTAR': 'Belum Terdaftar',
};

const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

function StatusCell({ row }: { row: CalonHajiRow }) {
  const berhak = isBerhakLunas(row);
  return (
    <div className="flex w-[100px] shrink-0 flex-col items-start gap-0.5">
      <span className="flex items-center gap-1.5">
        <span className={`h-[7px] w-[7px] rounded-full ${berhak ? 'bg-emerald-500' : 'bg-amber-500'}`} />
        <span className={`text-[10px] font-semibold ${berhak ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
          {berhak ? 'Berhak Lunas' : 'Cadangan'}
        </span>
      </span>
      {isLunas(row) && (
        <span className="inline-flex items-center gap-0.5 rounded-[5px] bg-slate-800 px-1.5 py-px text-[8px] font-bold tracking-wide text-white dark:bg-slate-100 dark:text-slate-900">
          <Check size={9} strokeWidth={3} />
          LUNAS
        </span>
      )}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[8px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">{label}</p>
      <p className="truncate text-[11px] font-semibold text-gray-700 dark:text-slate-200">{value}</p>
    </div>
  );
}

function RowDetail({ row }: { row: CalonHajiRow }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2 pb-3 pl-12 pr-2.5 pt-1">
      <DetailItem label="No. Porsi" value={row.no_porsi} />
      <DetailItem label="NIK" value={row.nik} />
      <DetailItem label="Tahap" value={String(row.tahap ?? '-')} />
      <DetailItem label="Keterangan" value={titleCase(row.keterangan)} />
      <DetailItem label="JKN" value={row.kepesertaan_jkn ? JKN_LABEL[row.kepesertaan_jkn] ?? titleCase(row.kepesertaan_jkn) : 'Tidak Ada'} />
      <DetailItem label="Status Jemaah" value={row.status_jemaah ? titleCase(row.status_jemaah) : '-'} />
      <DetailItem label="Kab/Kota" value={formatKabKotaLengkap(row.kab_kota)} />
      <DetailItem label="Provinsi" value={formatProvinsi(row.provinsi)} />
    </div>
  );
}

/** Halaman menu Dashboard "Calon Haji 2027" (mockup Haji2027.pen frame 02/03). */
export default function CalonHajiPage() {
  const mountTracked = useRef(false);
  useEffect(() => { if (!mountTracked.current) { trackEvent('feature', 'open_calon_haji'); mountTracked.current = true; } }, []);

  const [rows, setRows] = useState<CalonHajiRow[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [tab, setTab] = useState<CalonHajiTab>('semua');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<CalonHajiFilters>({ ...EMPTY_FILTERS });
  const [showSheet, setShowSheet] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [limit, setLimit] = useState(PAGE_STEP);

  const load = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      const res = await fetch('/api/calon-haji', { headers: { ...getAuthHeaders() } });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || `HTTP ${res.status}`);
      setRows(result.rows || []);
      setStatus('ready');
    } catch (err) {
      setError(describeLoadError(err));
      setStatus('error');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setTimeout(() => setQuery(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setLimit(PAGE_STEP); setExpanded(null); }, [tab, query, filters]);

  const counts = useMemo(() => countByTab(rows), [rows]);
  const visible = useMemo(() => filterCalonHaji(rows, { tab, query, filters }), [rows, tab, query, filters]);
  const filterCount = activeFilterCount(filters);
  const closeSheet = useCallback(() => setShowSheet(false), []);
  const resetAll = () => { setSearch(''); setQuery(''); setFilters({ ...EMPTY_FILTERS }); };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-pressed={active}
              className={`rounded-2xl border px-3 py-2.5 text-left transition-all active:scale-[0.97] ${
                active
                  ? 'border-slate-800 bg-slate-800 dark:border-slate-100 dark:bg-slate-100'
                  : 'border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800'
              }`}
            >
              <span className="flex items-center gap-1.5">
                {t.dot && <span className={`h-[7px] w-[7px] rounded-full ${t.dot}`} />}
                <span className={`text-[10px] font-semibold ${active ? 'text-gray-300 dark:text-slate-600' : 'text-gray-500 dark:text-slate-400'}`}>{t.label}</span>
              </span>
              <span className={`mt-1 block text-lg font-bold leading-tight ${active ? 'text-white dark:text-slate-900' : 'text-gray-800 dark:text-white'}`}>
                {status === 'ready' ? counts[t.key].toLocaleString('id-ID') : '–'}
              </span>
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center gap-2 px-3 py-1.5">
          <Search size={14} className="shrink-0 text-gray-400" />
          <input
            type="text"
            inputMode="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama, no. porsi, atau NIK…"
            className="h-9 min-w-0 flex-1 bg-transparent text-xs text-gray-800 outline-none placeholder:text-gray-400 dark:text-white"
          />
          <button
            onClick={() => setShowSheet(true)}
            aria-label="Filter"
            className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all active:scale-95 ${
              filterCount > 0
                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                : 'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400'
            }`}
          >
            <SlidersHorizontal size={14} />
            {filterCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-slate-800 text-[9px] font-bold text-white dark:border-slate-800 dark:bg-slate-100 dark:text-slate-900">
                {filterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {status === 'loading' && (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex h-[38px] items-center gap-2 border-b border-gray-100 px-2.5 last:border-0 dark:border-slate-700/60">
              <div className="h-2.5 w-5 animate-pulse rounded bg-gray-100 dark:bg-slate-700" />
              <div className="h-2.5 flex-1 animate-pulse rounded bg-gray-100 dark:bg-slate-700" />
              <div className="h-2.5 w-16 animate-pulse rounded bg-gray-100 dark:bg-slate-700" />
            </div>
          ))}
        </div>
      )}

      {status === 'error' && (
        <div className="rounded-2xl border border-gray-100 bg-white px-4 py-8 text-center dark:border-slate-700 dark:bg-slate-800">
          <p className="text-xs text-gray-500 dark:text-slate-400">{error}</p>
          <button onClick={load} className="mt-3 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-white active:scale-95">
            Coba lagi
          </button>
        </div>
      )}

      {status === 'ready' && rows.length === 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white px-4 py-8 text-center text-xs text-gray-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
          Data belum tersedia
        </div>
      )}

      {status === 'ready' && rows.length > 0 && visible.length === 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white px-4 py-8 text-center dark:border-slate-700 dark:bg-slate-800">
          <p className="text-xs text-gray-500 dark:text-slate-400">Tidak ada jamaah yang cocok</p>
          <button onClick={resetAll} className="mt-3 text-xs font-bold text-red-500 active:scale-95">
            Reset Filter
          </button>
        </div>
      )}

      {status === 'ready' && visible.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <div className="flex h-[30px] items-center gap-2 border-b border-gray-200 bg-gray-50 px-2.5 text-[9px] font-bold uppercase tracking-wide text-gray-400 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-500">
            <span className="w-[30px] shrink-0">No</span>
            <span className="min-w-0 flex-1">Nama</span>
            <span className="w-[100px] shrink-0">Status</span>
          </div>
          {visible.slice(0, limit).map((row) => {
            const open = expanded === row.no_urut;
            return (
              <div
                key={row.no_urut}
                className={`border-b last:border-0 ${open ? 'border-emerald-100 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-900/20' : 'border-gray-100 dark:border-slate-700/60'}`}
              >
                <button
                  onClick={() => setExpanded(open ? null : row.no_urut)}
                  aria-expanded={open}
                  className="flex min-h-[38px] w-full items-center gap-2 px-2.5 py-1 text-left"
                >
                  <span className="w-[30px] shrink-0 text-[11px] font-semibold text-gray-400 dark:text-slate-500">{row.no_urut}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-bold text-gray-800 dark:text-white">{row.nama}</span>
                    <span className="block truncate text-[9px] text-gray-400 dark:text-slate-500">
                      {formatKabKota(row.kab_kota)} · {row.usia} th
                    </span>
                  </span>
                  <StatusCell row={row} />
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      key="detail"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ height: { duration: 0.25, ease: [0.4, 0, 0.2, 1] }, opacity: { duration: 0.2 } }}
                      style={{ overflow: 'hidden' }}
                    >
                      <RowDetail row={row} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
          {visible.length > limit && (
            <button
              onClick={() => setLimit((l) => l + PAGE_STEP)}
              className="flex h-[34px] w-full items-center justify-center bg-gray-50 text-[11px] font-bold text-emerald-600 dark:bg-slate-900/40 dark:text-emerald-400"
            >
              Tampilkan lebih banyak
            </button>
          )}
        </div>
      )}

      {showSheet && (
        <CalonHajiFilterSheet
          rows={rows}
          tab={tab}
          query={query}
          value={filters}
          onApply={(f) => { setFilters(f); setShowSheet(false); }}
          onClose={closeSheet}
        />
      )}
    </div>
  );
}
