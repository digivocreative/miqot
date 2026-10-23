import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Link, Search, SearchX, SlidersHorizontal, Users } from 'lucide-react';
import CalonHajiFilterSheet from './CalonHajiFilterSheet';
import CalonHajiPersonalDetail, { type HajiDocument } from './CalonHajiPersonalDetail';
import { getAuthHeaders } from '../lib/authSession';
import { describeLoadError } from '../lib/loadError';
import { trackEvent } from '../utils/analytics';
import {
  EMPTY_FILTERS, activeFilterCount, countByTab, filterCalonHaji, formatKabKota, formatKabKotaLengkap,
  formatProvinsi, rowStatus,
  type CalonHajiFilters, type CalonHajiRow, type CalonHajiTab,
} from '../lib/calonHaji';

const PAGE_STEP = 50;
const HajiDocViewer = lazy(() => import('./HajiPage').then((module) => ({ default: module.DocViewerPopup })));

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
  const { label, lunas } = rowStatus(row);
  const berhak = label === 'Berhak Lunas';
  return (
    <div className="flex w-[100px] shrink-0 flex-col items-start gap-1">
      {label && (
        <span className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${berhak ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          <span className={`text-[11px] font-semibold ${berhak ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
            {label}
          </span>
        </span>
      )}
      {lunas && (
        <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500 px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wide text-white">
          <Check size={10} strokeWidth={3} />
          Lunas
        </span>
      )}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-slate-500">{label}</p>
      <p className="truncate text-xs font-semibold text-gray-700 dark:text-slate-200">{value}</p>
    </div>
  );
}

function RowDetail({ row, mine, onDocument }: { row: CalonHajiRow; mine: boolean; onDocument: (document: HajiDocument) => void }) {
  return (
    <div>
    <div className={`grid grid-cols-2 gap-x-4 gap-y-2.5 py-3 pr-3 ${mine ? 'pl-3' : 'pl-12'}`}>
      <DetailItem label="No. Porsi" value={row.no_porsi} />
      <DetailItem label="NIK" value={row.nik} />
      <DetailItem label="Tahap" value={String(row.tahap ?? '-')} />
      <DetailItem label="Keterangan" value={titleCase(row.keterangan)} />
      <DetailItem label="JKN" value={row.kepesertaan_jkn ? JKN_LABEL[row.kepesertaan_jkn] ?? titleCase(row.kepesertaan_jkn) : 'Tidak Ada'} />
      <DetailItem label="Status Jemaah" value={row.status_jemaah ? titleCase(row.status_jemaah) : '-'} />
      <DetailItem label="Kab/Kota" value={formatKabKotaLengkap(row.kab_kota)} />
      <DetailItem label="Provinsi" value={formatProvinsi(row.provinsi)} />
    </div>
      {mine && row.haji && row.haji.length > 0 && <CalonHajiPersonalDetail records={row.haji} nama={row.nama} onDocument={onDocument} />}
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
  const [mine, setMine] = useState(false);
  const [document, setDocument] = useState<HajiDocument | null>(null);
  const closeDocument = useCallback(() => setDocument(null), []);
  const requestRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setStatus('loading');
    setError('');
    try {
      const res = await fetch(`/api/calon-haji${mine ? '?scope=mine' : ''}`, {
        headers: { ...getAuthHeaders() }, signal: controller.signal,
      });
      const result = await res.json();
      if (controller.signal.aborted) return;
      if (!res.ok || !result.success) throw new Error(result.error || `HTTP ${res.status}`);
      setRows(result.rows || []);
      setStatus('ready');
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(describeLoadError(err));
      setStatus('error');
    }
  }, [mine]);
  useEffect(() => {
    load();
    return () => requestRef.current?.abort();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => setQuery(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setLimit(PAGE_STEP); setExpanded(null); }, [tab, query, filters, mine]);

  const counts = useMemo(() => countByTab(rows), [rows]);
  const visible = useMemo(() => filterCalonHaji(rows, { tab, query, filters }), [rows, tab, query, filters]);
  const filterCount = activeFilterCount(filters);
  const closeSheet = useCallback(() => setShowSheet(false), []);
  const resetAll = () => { setSearch(''); setQuery(''); setFilters({ ...EMPTY_FILTERS }); };

  return (
    <div className="space-y-3 px-4 pt-4 pb-8">
      <div className="grid grid-cols-3 gap-2">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-pressed={active}
              className={`rounded-2xl border p-3 text-left transition-all duration-200 active:scale-95 ${
                active
                  ? 'border-emerald-500 bg-emerald-500 shadow-md shadow-emerald-500/20'
                  : 'border-gray-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800'
              }`}
            >
              <span className="flex items-center gap-1.5">
                {t.dot && <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-white' : t.dot}`} />}
                <span className={`truncate text-[10px] font-medium ${active ? 'text-emerald-50' : 'text-gray-400 dark:text-slate-500'}`}>{t.label}</span>
              </span>
              <span className={`mt-1 block text-xl font-bold leading-tight ${active ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
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
            placeholder="Cari jamaah…"
            aria-label="Cari nama, nomor porsi, atau NIK"
            className="h-9 min-w-0 flex-1 bg-transparent text-xs text-gray-800 outline-none placeholder:text-gray-400 dark:text-white"
          />
          <button
            type="button"
            aria-pressed={mine}
            onClick={() => setMine((value) => !value)}
            className={`flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border bg-white px-2.5 text-xs font-semibold transition-colors duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:bg-slate-800 dark:focus-visible:ring-offset-slate-800 ${
              mine
                ? 'border-emerald-500 text-emerald-700 dark:border-emerald-400 dark:text-emerald-400'
                : 'border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            Jamaah Saya
          </button>
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
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-white bg-gray-800 px-0.5 text-[9px] font-bold text-white dark:border-slate-800 dark:bg-white dark:text-slate-900">
                {filterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {mine && (
        <p className="flex items-center gap-1.5 px-1 text-[11px] text-gray-500 dark:text-slate-400">
          <Link size={13} className="shrink-0" />
          Sesuai nomor porsi di data Haji Anda.
        </p>
      )}

      {status === 'loading' && (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex h-11 items-center gap-2 border-b border-gray-50 px-3 last:border-0 dark:border-slate-700/50">
              <div className="h-2.5 w-6 animate-pulse rounded bg-gray-100 dark:bg-slate-700" />
              <div className="flex-1 space-y-1.5">
                <div className="h-2.5 w-3/5 animate-pulse rounded bg-gray-100 dark:bg-slate-700" />
                <div className="h-2 w-2/5 animate-pulse rounded bg-gray-100 dark:bg-slate-700" />
              </div>
              <div className="h-2.5 w-20 animate-pulse rounded bg-gray-100 dark:bg-slate-700" />
            </div>
          ))}
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-600 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400">
          <p>{error}</p>
          <button
            onClick={load}
            className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-red-600 shadow-sm transition-all active:scale-95 dark:bg-slate-800 dark:text-red-400"
          >
            Coba lagi
          </button>
        </div>
      )}

      {status === 'ready' && rows.length === 0 && (
        <div className="flex flex-col items-center rounded-2xl border border-gray-100 bg-white px-4 py-10 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <Users size={36} className="text-gray-300 dark:text-slate-600" />
          <p className="mt-3 text-sm font-semibold text-gray-600 dark:text-slate-300">
            {mine ? 'Belum ada jamaah yang cocok' : 'Data belum tersedia'}
          </p>
          {mine && (
            <>
              <p className="mt-2 max-w-xs text-xs leading-relaxed text-gray-500 dark:text-slate-400">
                Nomor porsi pada data Haji Anda belum ditemukan di daftar calon haji 2027.
              </p>
              <button
                type="button"
                onClick={() => setMine(false)}
                className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:bg-emerald-900/20 dark:text-emerald-400"
              >
                Lihat daftar umum
              </button>
            </>
          )}
        </div>
      )}

      {status === 'ready' && rows.length > 0 && visible.length === 0 && (
        <div className="flex flex-col items-center rounded-2xl border border-gray-100 bg-white px-4 py-10 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <SearchX size={36} className="text-gray-300 dark:text-slate-600" />
          <p className="mt-3 text-sm font-semibold text-gray-600 dark:text-slate-300">Tidak ada jamaah yang cocok</p>
          <button
            onClick={resetAll}
            className="mt-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            Reset Filter
          </button>
        </div>
      )}

      {status === 'ready' && visible.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex h-8 items-center gap-2 border-b border-gray-100 bg-gray-50/80 px-3 text-[9px] font-bold uppercase tracking-wide text-gray-400 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-500">
            <span className="w-7 shrink-0">No</span>
            <span className="min-w-0 flex-1">Nama</span>
            <span className="w-[100px] shrink-0">Status</span>
          </div>
          {visible.slice(0, limit).map((row) => {
            const open = expanded === row.no_urut;
            return (
              <div
                key={row.no_urut}
                className={`border-b border-gray-50 transition-colors last:border-0 dark:border-slate-700/50 ${open ? 'bg-emerald-50/60 dark:bg-emerald-900/10' : ''}`}
              >
                <button
                  onClick={() => setExpanded(open ? null : row.no_urut)}
                  aria-expanded={open}
                  className="flex min-h-11 w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-gray-50/50 dark:hover:bg-slate-700/30"
                >
                  <span className="w-7 shrink-0 text-[11px] font-semibold tabular-nums text-gray-400 dark:text-slate-500">{row.no_urut}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-gray-800 dark:text-white">{row.nama}</span>
                    <span className="mt-0.5 block truncate text-[10px] text-gray-400 dark:text-slate-500">
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
                      <RowDetail row={row} mine={mine} onDocument={setDocument} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
          {visible.length > limit && (
            <button
              onClick={() => setLimit((l) => l + PAGE_STEP)}
              className="flex h-10 w-full items-center justify-center border-t border-gray-100 text-xs font-bold text-emerald-600 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:text-emerald-400 dark:hover:bg-slate-700/30"
            >
              Tampilkan lebih banyak
            </button>
          )}
        </div>
      )}

      <AnimatePresence>
        {document && (
          <Suspense fallback={
            <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-3 bg-white dark:bg-slate-900">
              <p className="text-sm text-gray-600 dark:text-slate-300">Membuka dokumen…</p>
              <button type="button" onClick={closeDocument} className="rounded-lg px-4 py-2 text-xs font-semibold text-emerald-600">Tutup</button>
            </div>
          }>
            <HajiDocViewer key={document.url} {...document} onClose={closeDocument} />
          </Suspense>
        )}
      </AnimatePresence>

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
